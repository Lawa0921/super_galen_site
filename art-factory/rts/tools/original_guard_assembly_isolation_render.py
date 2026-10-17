"""Render one assembly object family for focused structural diagnosis."""
import bpy
import sys
from pathlib import Path
from mathutils import Vector
sys.path.insert(0, str(Path(__file__).resolve().parent))
from original_guard_assembly_build import setup_camera

blend_path, output_path, family = Path(sys.argv[sys.argv.index("--") + 1]), Path(sys.argv[sys.argv.index("--") + 2]), sys.argv[sys.argv.index("--") + 3]
bpy.ops.wm.open_mainfile(filepath=str(blend_path))
scene = bpy.context.scene
rig = bpy.data.objects["GuardRig20"]
rig.animation_data.action = bpy.data.actions["Idle"]
scene.frame_set(0)
if family == "body":
    visible = {"GuardBody_LOD0"}
elif family == "arms":
    visible = {"GuardArms_LOD0"}
elif family == "body_arms":
    visible = {"GuardBody_LOD0", "GuardArms_LOD0"}
elif family == "shoulder_parts":
    visible = {"GuardArms_LOD0", "GuardBody_LOD0"}
else:
    raise ValueError("family must be body, arms, or body_arms")
for obj in bpy.data.objects:
    if obj.type == "MESH":
        obj.hide_render = obj.name not in visible
setup_camera("front", Vector((0.0, 0.0, 0.92)), output_path.parent)
scene.render.filepath = str(output_path)
bpy.ops.render.render(write_still=True)
print("ISOLATION_RENDER", family, output_path)
