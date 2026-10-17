"""Subtractive local channel surgery; no global remesh or runtime publication."""
from pathlib import Path
import hashlib,json,sys,time,traceback
import bpy,bmesh
import numpy as np
from mathutils import Vector
from mathutils.bvhtree import BVHTree
sys.path.insert(0,str(Path(__file__).resolve().parent))
from original_guard_grip_channel_math import unchanged_coordinate_count,area_counts
ROOT=Path(__file__).resolve().parents[3]
RUN=ROOT/"art-factory/rts/runs/original-guard-grip-channel/2026-10-05"
QA=RUN/"qa"; CANDIDATE=RUN/"candidate"

def save(stage,**data):
    value={"stage":stage,"utc_epoch":time.time(),**data}
    (QA/"progress.json").write_bytes((json.dumps(value,indent=2)+"\n").encode())
    print("GRIP_CHANNEL "+json.dumps(value),flush=True)

def topology(mesh):
    bm=bmesh.new();bm.from_mesh(mesh)
    result={"vertices":len(bm.verts),"faces":len(bm.faces),
        "boundary_edges":sum(edge.is_boundary for edge in bm.edges),
        "nonmanifold_edges":sum(not edge.is_manifold for edge in bm.edges),
        "winding_edges":sum(edge.is_manifold and not edge.is_contiguous for edge in bm.edges)}
    result.update(area_counts([face.calc_area() for face in bm.faces]))
    bm.free();return result

def main():
    bpy.ops.wm.read_factory_settings(use_empty=True); CANDIDATE.mkdir(parents=True,exist_ok=True)
    report=json.loads((QA/"input.json").read_text(encoding="utf-8"))
    path=ROOT/"tmp/rts/grip-channel-input.npz"
    if hashlib.sha256(path.read_bytes()).hexdigest()!=report["temporary_input_sha256"]: raise ValueError("Prepared mesh changed")
    data=np.load(path); before=data["vertices"]; faces=data["faces"]
    mesh=bpy.data.meshes.new("OriginalGripSource");mesh.from_pydata(before.tolist(),[],faces.tolist());mesh.update()
    body=bpy.data.objects.new("OriginalGripChannelCandidate",mesh);bpy.context.collection.objects.link(body)
    fit=report["fit"]; axis=Vector(fit["direction"]); origin=Vector(fit["origin"])
    bpy.ops.mesh.primitive_cylinder_add(vertices=192,radius=fit["radius"],depth=.55,location=origin)
    cutter=bpy.context.object;cutter.name="TemporarySubtractiveHandleTool"
    cutter.rotation_mode="QUATERNION";cutter.rotation_quaternion=Vector((0,0,1)).rotation_difference(axis)
    bpy.context.view_layer.update()
    bpy.ops.object.select_all(action="DESELECT");body.select_set(True);bpy.context.view_layer.objects.active=body
    modifier=body.modifiers.new("RemoveFusedReferenceHandle","BOOLEAN");modifier.operation="DIFFERENCE";modifier.solver="EXACT";modifier.object=cutter
    save("boolean_running",input_vertices=len(before),radius_m=fit["radius"])
    started=time.perf_counter();bpy.ops.object.modifier_apply(modifier=modifier.name);seconds=time.perf_counter()-started
    bpy.data.objects.remove(cutter,do_unlink=True)
    # Persist editable and exported geometry before any rendering or heavier audit.
    blend=CANDIDATE/"original-guard-grip-channel.blend";glb=CANDIDATE/"original-guard-grip-channel.glb"
    bpy.ops.wm.save_as_mainfile(filepath=str(blend))
    bpy.ops.export_scene.gltf(filepath=str(glb),export_format="GLB",use_selection=True,export_animations=False,export_materials="NONE")
    save("geometry_saved",boolean_seconds=seconds,blend_sha256=hashlib.sha256(blend.read_bytes()).hexdigest(),glb_sha256=hashlib.sha256(glb.read_bytes()).hexdigest())
    result=topology(body.data)
    actual=np.array([tuple(v.co) for v in body.data.vertices],dtype=np.float32)
    axis_np=np.asarray(fit["direction"]);delta=actual-np.asarray(fit["origin"])
    radial=np.linalg.norm(delta-np.outer(delta@axis_np,axis_np),axis=1)
    old_delta=before-np.asarray(fit["origin"]);old_radial=np.linalg.norm(old_delta-np.outer(old_delta@axis_np,axis_np),axis=1)
    old_outer=before[old_radial>fit["radius"]+.00005]
    # Numerical equality treats IEEE signed zero identically; no tolerance or movement.
    unchanged=unchanged_coordinate_count(old_outer,actual)
    # A shaft along the whole original handle axis must pass through without a hit.
    vertices=[tuple(v.co) for v in body.data.vertices];polygons=[tuple(p.vertices) for p in body.data.polygons]
    bvh=BVHTree.FromPolygons(vertices,polygons,all_triangles=False,epsilon=0)
    hit=bvh.ray_cast(origin-axis*.28,axis,.56)
    verdict={"status":"channel_geometry_review_pending","runtime_publish_allowed":False,"topology":result,
        "boolean_seconds":seconds,"bore_radius_m":fit["radius"],"minimum_output_radial_distance_m":float(radial.min()),
        "outer_source_vertices":len(old_outer),"unchanged_outer_vertices":unchanged,
        "outer_coordinates_unchanged":unchanged==len(old_outer),"central_axis_hit":hit[0] is not None,
        "sha256":{p.name:hashlib.sha256(p.read_bytes()).hexdigest() for p in [blend,glb]},
        "limitations":["High-poly local surgery only; no retopology or wrist fit.",
                       "Original rounded fingertip forms retained for visual review; not accepted production anatomy."]}
    (QA/"geometry.json").write_bytes((json.dumps(verdict,indent=2)+"\n").encode())
    save("audit_complete",**verdict)

if __name__=="__main__":
    try: main()
    except Exception:
        (QA/"failure.txt").write_bytes(traceback.format_exc().encode()); raise
