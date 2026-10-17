"""Build, rig, export and render the clean original elbow control-cage candidate."""
import hashlib
import gzip
import json
import math
import sys
from pathlib import Path

import bpy
from mathutils import Matrix, Vector

TOOLS = Path(__file__).resolve().parent
sys.path.insert(0, str(TOOLS))
from original_guard_clean_arm import build_arm, AXIS, AXIS_START, AXIS_END, HINGE, PIVOT, ROLL_PIVOT

ROOT = TOOLS.parents[2]
RUN = ROOT / "art-factory/rts/runs/original-guard-clean-arm/2026-10-05"
POSES = (("neutral",0,0,0), ("bend75",25,75,0),
         ("bend90",30,90,0), ("bend120",36,120,0), ("roll45",40,90,45))


def material(name, path, color, metalness, roughness):
    mat = bpy.data.materials.new(name)
    mat.diffuse_color = (*color,1)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get("Principled BSDF")
    bsdf.inputs["Metallic"].default_value = metalness
    bsdf.inputs["Roughness"].default_value = roughness
    image = bpy.data.images.load(str(path), check_existing=True)
    image.pack()
    node = mat.node_tree.nodes.new("ShaderNodeTexImage")
    node.image = image
    mat.node_tree.links.new(node.outputs["Color"],bsdf.inputs["Base Color"])
    return mat


def mesh_object(name, part, collection, mats):
    semantic=name.removesuffix("_Control")
    mesh = bpy.data.meshes.new(name+" Quad Cage")
    mesh.from_pydata(part["vertices"], [], part["faces"])
    mesh.update()
    obj = bpy.data.objects.new(name,mesh)
    collection.objects.link(obj)
    for mat in mats:
        mesh.materials.append(mat)
    uv = mesh.uv_layers.new(name="Authored UV")
    for polygon in mesh.polygons:
        polygon.use_smooth = True
        if semantic != "FlexibleSleeve":
            # Authored brass rolled edge on the physical boundary of each plate.
            row = polygon.index // part["cols"]
            column = polygon.index % part["cols"]
            polygon.material_index = int(row in (0,part["rows"]-1) or column in (0,part["cols"]-1))
        for loop_id in polygon.loop_indices:
            vertex_id = mesh.loops[loop_id].vertex_index
            coord = Vector(part["uv"][vertex_id])
            if (part.get("periodic") and len(polygon.vertices) == 4
                    and polygon.index % part["cols"] == part["cols"]-1
                    and vertex_id % part["cols"] == 0):
                coord.x += 1.75
            uv.data[loop_id].uv = coord
    if part["weights"] is None:
        group = obj.vertex_groups.new(name=part["bone"])
        group.add(list(range(len(mesh.vertices))),1.,"REPLACE")
    else:
        for column,bone in enumerate(("UpperArm_R","ElbowSupport_R","Forearm_R")):
            group=obj.vertex_groups.new(name=bone)
            for index,row in enumerate(part["weights"]):
                if row[column]>1e-8:
                    group.add([index],float(row[column]),"REPLACE")
    return obj


def apply_modifier(obj, kind, name, **settings):
    mod=obj.modifiers.new(name,kind)
    for key,value in settings.items():
        setattr(mod,key,value)
    bpy.context.view_layer.objects.active=obj
    obj.select_set(True)
    bpy.ops.object.modifier_apply(modifier=mod.name)
    obj.select_set(False)


def setup_rig(collection, objects):
    arm=bpy.data.armatures.new("Original Clean Arm Bones")
    rig=bpy.data.objects.new("OriginalCleanArmRig",arm)
    collection.objects.link(rig)
    bpy.context.view_layer.objects.active=rig
    rig.select_set(True)
    bpy.ops.object.mode_set(mode="EDIT")
    upper=arm.edit_bones.new("UpperArm_R")
    upper.head=Vector(AXIS_START)
    upper.tail=Vector(PIVOT)
    upper.align_roll(Vector((0,1,0)))
    support=arm.edit_bones.new("ElbowSupport_R")
    support.head=Vector(PIVOT)
    support.tail=Vector(PIVOT+HINGE*.055)
    support.parent=upper
    support.use_connect=False
    support.align_roll(Vector((0,1,0)))
    fore=arm.edit_bones.new("Forearm_R")
    fore.head=Vector(PIVOT)
    fore.tail=Vector(AXIS_END)
    fore.parent=upper
    fore.use_connect=False
    fore.align_roll(Vector((0,1,0)))
    bpy.ops.object.mode_set(mode="OBJECT")
    rig.select_set(False)
    for obj in objects.values():
        mod=obj.modifiers.new("Original arm deformation","ARMATURE")
        mod.object=rig
        mod.use_deform_preserve_volume=False
        obj.parent=rig
    return rig


def about(pivot,axis,degrees):
    p=Vector(pivot)
    return Matrix.Translation(p) @ Matrix.Rotation(math.radians(degrees),4,Vector(axis)) @ Matrix.Translation(-p)


def set_pose(rig,bend,roll):
    b=about(PIVOT,HINGE,bend)
    e=about(PIVOT,HINGE,bend*.5)
    bent_axis=Matrix.Rotation(math.radians(bend),4,Vector(HINGE)).to_3x3() @ Vector(AXIS)
    rp=b @ Vector(ROLL_PIVOT)
    f=about(rp,bent_axis,roll) @ b
    for name,matrix in (("UpperArm_R",Matrix.Identity(4)),("ElbowSupport_R",e),("Forearm_R",f)):
        bone=rig.pose.bones[name]
        bone.matrix=matrix @ bone.bone.matrix_local
    bpy.context.view_layer.update()


def points(obj):
    deps=bpy.context.evaluated_depsgraph_get()
    evaluated=obj.evaluated_get(deps)
    mesh=evaluated.to_mesh()
    result=[list(evaluated.matrix_world @ v.co) for v in mesh.vertices]
    evaluated.to_mesh_clear()
    return result


def render(path,target,direction,span=0.56):
    scene=bpy.context.scene
    data=bpy.data.cameras.new("Review orthographic")
    data.type="ORTHO"
    data.ortho_scale=span
    camera=bpy.data.objects.new("Review orthographic",data)
    scene.collection.objects.link(camera)
    camera.location=Vector(target)+Vector(direction)
    camera.rotation_euler=(Vector(target)-camera.location).to_track_quat("-Z","Y").to_euler()
    scene.camera=camera
    scene.render.engine="BLENDER_WORKBENCH"
    scene.display.shading.light="STUDIO"
    scene.display.shading.color_type="MATERIAL"
    scene.display.shading.show_cavity=True
    scene.display.shading.show_shadows=True
    scene.render.resolution_x=1200
    scene.render.resolution_y=900
    scene.render.resolution_percentage=100
    scene.render.filepath=str(path)
    scene.render.image_settings.file_format="PNG"
    bpy.ops.render.render(write_still=True)
    bpy.data.objects.remove(camera,do_unlink=True)


def main():
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    scene=bpy.context.scene
    scene.render.fps=30
    scene.render.fps_base=1
    cage_collection=bpy.data.collections.new("EDITABLE ORIGINAL QUAD CONTROL CAGES")
    scene.collection.children.link(cage_collection)
    result_collection=bpy.data.collections.new("ORIGINAL CLEAN ARM OUTPUT")
    scene.collection.children.link(result_collection)
    tile=ROOT/"art-factory/rts/runs/original-guard-surface-materials/2026-10-05/candidate"
    steel=material("Generated silver steel",tile/"steel-512.png",(.55,.58,.60),.77,.34)
    brass=material("Generated muted brass",tile/"brass-512.png",(.59,.44,.19),.67,.38)
    cloth=material("Generated deep navy cloth",tile/"cloth-512.png",(.065,.10,.21),.0,.83)
    parts=build_arm()
    cages=build_arm(high_detail=True)
    objects={}
    for name,part in parts.items():
        materials=(cloth,) if name=="FlexibleSleeve" else (steel,brass)
        cage=mesh_object(name+"_Control",cages[name],cage_collection,materials)
        cage.hide_render=True
        cage.hide_set(True)
        cage.hide_viewport=True
        final=mesh_object(name,part,result_collection,materials)
        if part["subdivision_levels"]:
            apply_modifier(final,"SUBSURF","Smooth authored control lines",levels=part["subdivision_levels"],render_levels=part["subdivision_levels"])
        if name!="FlexibleSleeve":
            apply_modifier(final,"SOLIDIFY","Physical plate thickness",thickness=.0025,offset=-1)
        objects[name]=final
    rig=setup_rig(result_collection,objects)
    for name,frame,bend,roll in POSES:
        scene.frame_set(frame)
        set_pose(rig,bend,roll)
        for bone in rig.pose.bones:
            bone.rotation_mode="QUATERNION"
            bone.keyframe_insert(data_path="location",frame=frame)
            bone.keyframe_insert(data_path="rotation_quaternion",frame=frame)
            bone.keyframe_insert(data_path="scale",frame=frame)
        scene.timeline_markers.new(name,frame=frame)
    scene.frame_start=0
    scene.frame_end=40
    scene.frame_set(0)
    set_pose(rig,0,0)
    out=RUN/"candidate"
    qa=RUN/"qa"
    out.mkdir(parents=True,exist_ok=True)
    qa.mkdir(parents=True,exist_ok=True)
    bpy.context.preferences.filepaths.save_version=0
    blend=out/"original-guard-clean-arm.blend"
    glb=out/"original-guard-clean-arm.glb"
    bpy.ops.wm.save_as_mainfile(filepath=str(blend))
    bpy.ops.object.select_all(action="DESELECT")
    rig.select_set(True)
    for obj in objects.values():obj.select_set(True)
    bpy.context.view_layer.objects.active=rig
    bpy.ops.export_scene.gltf(filepath=str(glb),export_format="GLB",use_selection=True,
                              export_animations=True,export_materials="EXPORT")
    actual={}
    for name,frame,bend,roll in POSES:
        scene.frame_set(frame)
        set_pose(rig,bend,roll)
        actual[name]={component:points(obj) for component,obj in objects.items()}
    with gzip.open(qa/"blender-evaluated-vertices.json.gz","wt",encoding="utf-8",compresslevel=9) as file:
        json.dump({"poses":actual,"method":"actual Blender depsgraph mesh"},file,separators=(",",":"))
    component_triangles={}
    for name,obj in objects.items():
        ev=obj.evaluated_get(bpy.context.evaluated_depsgraph_get())
        mesh=ev.to_mesh()
        component_triangles[name]=sum(max(len(poly.vertices)-2,1) for poly in mesh.polygons)
        ev.to_mesh_clear()
    report={"status":"candidate_pending_visual_qa","runtime_publish_allowed":False,
            "fps":scene.render.fps,"fps_base":scene.render.fps_base,
            "blend_sha256":hashlib.sha256(blend.read_bytes()).hexdigest(),
            "glb_sha256":hashlib.sha256(glb.read_bytes()).hexdigest(),
            "component_vertices":{n:len(p["neutral"][n]) for n in objects for p in [actual]},
            "component_triangles":component_triangles,"total_triangles":sum(component_triangles.values()),
            "estimated_gltf_primitives":11,
            "rig_bones":[b.name for b in rig.data.bones],"poses":[p[0] for p in POSES]}
    (qa/"export-report.json").write_text(json.dumps(report,indent=2)+"\n",encoding="utf-8")
    if "--render" in sys.argv:
        folder=qa/"renders"
        folder.mkdir(parents=True,exist_ok=True)
        for name,frame,bend,roll in POSES:
            scene.frame_set(frame)
            set_pose(rig,bend,roll)
            for view,direction in (("front",(0,2,.1)),("side",(2,0,.12)),("back",(0,-2,.1))):
                render(folder/f"{name}-{view}.png",(.35,0.,1.12),direction,span=.82)
    print("CLEAN_ARM_OUTPUT",blend,glb,flush=True)


if __name__=="__main__":main()
