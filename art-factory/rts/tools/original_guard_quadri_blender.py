"""One source-preserving whole-guard QuadriFlow run in Blender 5.2."""

import gc
import hashlib
import json
import math
import time
from pathlib import Path

import bmesh
import bpy
import numpy as np
from mathutils import Vector
from mathutils.bvhtree import BVHTree


ROOT = Path(__file__).resolve().parents[3]
RUN = ROOT / "art-factory/rts/runs/original-guard-quadri/2026-10-05"
NPZ = RUN / "candidate/source-primary-exact.npz"
QA = RUN / "qa"
RENDERS = QA / "renders"
SOURCE_SHA = "b2a94ddd3c7f66ea8e1edf993fce13ce4c24a795b9106076648e773ebffecdfd"


def mark(stage, **values):
    payload = {"stage": stage, "utc_epoch": time.time(), **values}
    QA.joinpath("progress.json").write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")
    print("QUADRI_STAGE " + json.dumps(payload), flush=True)


def create_mesh(name, vertices, triangles):
    mesh = bpy.data.meshes.new(name + "Mesh")
    mesh.from_pydata(vertices.tolist(), [], triangles.tolist())
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    return obj


def topology(obj):
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    report = {
        "vertices": len(bm.verts), "faces": len(bm.faces),
        "triangles": sum(len(face.verts) - 2 for face in bm.faces),
        "quads": sum(len(face.verts) == 4 for face in bm.faces),
        "ngons": sum(len(face.verts) > 4 for face in bm.faces),
        "boundary_edges": sum(edge.is_boundary for edge in bm.edges),
        "nonmanifold_edges": sum(not edge.is_manifold and not edge.is_boundary for edge in bm.edges),
        "zero_area_faces": sum(face.calc_area() == 0 for face in bm.faces),
    }
    bm.free()
    return report


def dissolve_numeric_zero_cap(obj):
    """Absorb a Blender-zero-area cap sliver into a coplanar neighbor.

    This changes no coordinates and only removes the numerically degenerate face.
    A missing/ambiguous cap sliver fails closed rather than repairing arbitrary art.
    """
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    bm.faces.ensure_lookup_table()
    zero = [face for face in bm.faces if face.calc_area() == 0]
    if len(zero) != 1:
        bm.free()
        raise ValueError(f"Expected exactly one Blender-zero-area cap face, found {len(zero)}")
    face = zero[0]
    options = [(edge, other) for edge in face.edges for other in edge.link_faces
               if other != face and face.normal.dot(other.normal) > .999999
               and other.calc_area() > 0]
    if len(options) != 1:
        bm.free()
        raise ValueError(f"Expected one coplanar cap neighbor, found {len(options)}")
    edge, neighbor = options[0]
    record = {"dissolved_zero_area_faces": 1,
              "original_face_index": face.index,
              "coplanar_neighbor_face_index": neighbor.index,
              "shared_edge_vertex_indices": [vertex.index for vertex in edge.verts],
              "max_vertex_displacement_m": 0.0,
              "source_geometry_operation": "dissolve only their shared cap edge; no vertex movement"}
    bmesh.ops.dissolve_edges(bm, edges=[edge], use_verts=False, use_face_split=False)
    bm.to_mesh(obj.data)
    obj.data.update()
    bm.free()
    return record


def sampled_surface_distance(from_obj, to_obj, count=12000):
    """Actual triangle surface points to nearest target polygons, never AABB distance."""
    source_mesh, target_mesh = from_obj.data, to_obj.data
    source_mesh.calc_loop_triangles()
    source_vertices = np.array([vertex.co[:] for vertex in source_mesh.vertices], dtype=np.float64)
    target_vertices = [vertex.co[:] for vertex in target_mesh.vertices]
    target_polygons = [tuple(poly.vertices) for poly in target_mesh.polygons]
    target_bvh = BVHTree.FromPolygons(target_vertices, target_polygons, all_triangles=False)
    indices = np.linspace(0, len(source_mesh.loop_triangles) - 1,
                          min(count, len(source_mesh.loop_triangles)), dtype=np.int64)
    distances = []
    for index in indices:
        triangle = source_mesh.loop_triangles[int(index)]
        point = np.mean(source_vertices[list(triangle.vertices)], axis=0)
        hit = target_bvh.find_nearest(Vector(point))
        if hit[0] is None:
            raise ValueError("BVH returned no nearest polygon")
        distances.append(hit[3])
    values = np.array(distances)
    return {"sample_count": len(values), "sample_type": "actual triangle centroids, evenly selected triangle indices",
            "p50_m": float(np.quantile(values, .50)),
            "p95_m": float(np.quantile(values, .95)),
            "p99_m": float(np.quantile(values, .99)),
            "sample_max_m": float(np.max(values))}


def camera(name, target, location, ortho_scale):
    data = bpy.data.cameras.new(name)
    data.type = "ORTHO"
    data.ortho_scale = ortho_scale
    obj = bpy.data.objects.new(name, data)
    bpy.context.collection.objects.link(obj)
    obj.location = location
    obj.rotation_euler = (Vector(target) - obj.location).to_track_quat("-Z", "Y").to_euler()
    bpy.context.scene.camera = obj
    return obj


def render(path, obj, target, location, scale):
    obj.hide_render = False
    cam = camera(path.stem + "Camera", target, location, scale)
    scene = bpy.context.scene
    scene.render.filepath = str(path)
    bpy.ops.render.render(write_still=True)
    bpy.data.objects.remove(cam, do_unlink=True)
    obj.hide_render = True


def main():
    start = time.perf_counter()
    QA.mkdir(parents=True, exist_ok=True)
    RENDERS.mkdir(parents=True, exist_ok=True)
    bpy.ops.wm.read_factory_settings(use_empty=True)
    data = np.load(NPZ)
    prepared_vertices, prepared_faces = data["vertices"], data["triangles"]
    retopo = create_mesh("GuardQuadriFlowCandidate", prepared_vertices, prepared_faces)
    del prepared_vertices, prepared_faces, data
    gc.collect()
    original_topology = topology(retopo)
    mark("prepared_mesh_loaded", original_topology=original_topology)
    correction = dissolve_numeric_zero_cap(retopo)
    prepared_topology = topology(retopo)
    if (prepared_topology["zero_area_faces"] or prepared_topology["boundary_edges"] or
            prepared_topology["nonmanifold_edges"] or
            prepared_topology["faces"] != original_topology["faces"] - 1):
        raise ValueError(f"Targeted cap correction failed its topology contract: {prepared_topology}")
    mark("cap_correction_complete", correction=correction, topology=prepared_topology)
    bpy.ops.object.select_all(action="DESELECT")
    retopo.select_set(True)
    bpy.context.view_layer.objects.active = retopo
    operator = {"mode": "FACES", "target_faces": 12000,
                "use_preserve_sharp": True, "use_preserve_boundary": True,
                "use_mesh_symmetry": False, "preserve_attributes": False, "seed": 0}
    mark("quadriflow_running", operator=operator)
    quadri_start = time.perf_counter()
    result = bpy.ops.object.quadriflow_remesh(**operator)
    quadri_seconds = time.perf_counter() - quadri_start
    mark("quadriflow_finished", operator_result=list(result), seconds=quadri_seconds)
    if "FINISHED" not in result:
        raise RuntimeError(f"QuadriFlow returned {result}")
    retopo.name = "GuardQuadriFlowCandidate"
    retopo_topology = topology(retopo)

    # The accepted source is reconstructed from its exact-weld NPZ for reference,
    # only after the expensive remesher has released its temporary mesh.
    data = np.load(NPZ)
    reference = create_mesh("OriginalAcceptedSourceReference", data["vertices"], data["triangles"])
    del data
    gc.collect()
    source_to_quadri = sampled_surface_distance(reference, retopo)
    quadri_to_source = sampled_surface_distance(retopo, reference)
    mark("distance_finished", source_to_quadri=source_to_quadri,
         quadri_to_source=quadri_to_source)

    scene = bpy.context.scene
    scene.render.engine = "BLENDER_EEVEE"
    scene.render.resolution_x = 900
    scene.render.resolution_y = 900
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.film_transparent = False
    scene.world.color = (.15, .15, .15)
    scene.view_settings.view_transform = "AgX"
    material = bpy.data.materials.new("DiagnosticNeutralGray_NotProductionArt")
    material.diffuse_color = (.55, .56, .57, 1.0)
    material.use_nodes = True
    material.node_tree.nodes.get("Principled BSDF").inputs["Base Color"].default_value = (.55, .56, .57, 1)
    retopo.data.materials.append(material)
    reference.data.materials.append(material)
    for pos, energy, size in [((-3, -4, 5), 900, 4), ((3, 2, 4), 650, 4)]:
        light_data = bpy.data.lights.new("QALight", "AREA")
        light_data.energy, light_data.shape, light_data.size = energy, "DISK", size
        light = bpy.data.objects.new("QALight", light_data)
        bpy.context.collection.objects.link(light)
        light.location = pos
        light.rotation_euler = (Vector((0, 0, 0)) - light.location).to_track_quat("-Z", "Y").to_euler()
    views = {
        "front": ((0, 0, .03), (0, -4, .03), 2.35),
        "side": ((0, 0, .03), (4, 0, .03), 2.35),
        "back": ((0, 0, .03), (0, 4, .03), 2.35),
        "head-shoulders": ((0, 0, .57), (0, -2.4, .57), 1.0),
        "left-hand": ((-.41, -.07, .06), (-.41, -1.5, .06), .43),
        "right-hand": ((.41, -.07, .06), (.41, -1.5, .06), .43),
        "right-arm-edge": ((.34, 0, .17), (1.55, -2, .42), .8),
    }
    retopo.hide_render = True
    reference.hide_render = True
    for name, (target, location, scale) in views.items():
        render(RENDERS / f"source-{name}.png", reference, target, location, scale)
        render(RENDERS / f"retopo-{name}.png", retopo, target, location, scale)
        mark("rendered", view=name)

    reference.hide_render = True
    reference.hide_set(True)
    retopo.hide_render = False
    bpy.ops.object.select_all(action="DESELECT")
    retopo.select_set(True)
    bpy.context.view_layer.objects.active = retopo
    glb = RUN / "candidate/original-guard-quadri.glb"
    blend = RUN / "candidate/original-guard-quadri.blend"
    bpy.ops.export_scene.gltf(filepath=str(glb), export_format="GLB", use_selection=True,
                              export_animations=False, export_materials="NONE")
    bpy.ops.wm.save_as_mainfile(filepath=str(blend))
    report = {"status": "candidate_pending_visual_review", "runtime_publish_allowed": False,
              "source_sha256": SOURCE_SHA, "blender_version": bpy.app.version_string,
              "operator": operator, "operator_result": list(result),
              "original_topology": original_topology,
              "cap_correction": correction, "prepared_topology": prepared_topology,
              "retopo_topology": retopo_topology,
              "source_to_retopo_surface": source_to_quadri,
              "retopo_to_source_surface": quadri_to_source,
              "quadriflow_seconds": quadri_seconds, "total_blender_seconds": time.perf_counter() - start,
              "artifacts_sha256": {path.name: hashlib.sha256(path.read_bytes()).hexdigest()
                                   for path in (glb, blend)},
              "renders_sha256": {path.name: hashlib.sha256(path.read_bytes()).hexdigest()
                                 for path in sorted(RENDERS.glob("*.png"))},
              "limitations": ["Whole-body remesh is not a semantic armor/hand separation",
                              "No armature, animation, UV, or production material is created",
                              "Bidirectional BVH distances use sampled actual triangle-surface points"]}
    QA.joinpath("quadriflow-report.json").write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    mark("complete", status=report["status"], quadriflow_seconds=quadri_seconds)


if __name__ == "__main__":
    main()
