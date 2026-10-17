import bpy,sys
from pathlib import Path
from mathutils import Vector
blend,out=[Path(x).resolve() for x in sys.argv[sys.argv.index("--")+1:]]
bpy.ops.wm.open_mainfile(filepath=str(blend))
scene=bpy.context.scene
body=bpy.data.objects["GuardBody_LOD0"]
mat=bpy.data.materials.new("QA_Neutral_Gray")
mat.diffuse_color=(0.48,0.52,0.56,1)
mat.use_nodes=True
bsdf=mat.node_tree.nodes.get("Principled BSDF")
bsdf.inputs["Base Color"].default_value=(0.48,0.52,0.56,1)
bsdf.inputs["Metallic"].default_value=0
bsdf.inputs["Roughness"].default_value=.65
body.data.materials.clear(); body.data.materials.append(mat)
for p in body.data.polygons:p.material_index=0
bpy.data.objects["GuardRig20"].animation_data.action=bpy.data.actions["Idle"]
scene.frame_set(0)
scene.render.engine="BLENDER_EEVEE"
scene.render.image_settings.media_type="IMAGE";scene.render.image_settings.file_format="PNG"
scene.render.resolution_x=640;scene.render.resolution_y=720;scene.render.resolution_percentage=100
scene.render.filepath=str(out)
bpy.ops.render.render(write_still=True)
print("GRAY_PROBE="+str(out))
