"""Render one exact assembly clip frame as a review-only still."""
import bpy
import sys
from pathlib import Path
from mathutils import Vector

sys.path.insert(0, str(Path(__file__).resolve().parent))
from original_guard_assembly_build import setup_camera

args = sys.argv[sys.argv.index("--") + 1:]
blend_path, output_path, action_name, frame = Path(args[0]), Path(args[1]), args[2], int(args[3])
bpy.ops.wm.open_mainfile(filepath=str(blend_path))
scene = bpy.context.scene
rig = bpy.data.objects.get("GuardRig20")
if rig is None or action_name not in bpy.data.actions:
    raise ValueError("missing GuardRig20 or requested clip")
rig.animation_data.action = bpy.data.actions[action_name]
scene.frame_set(frame)
visible_names = {
    "GuardBody_LOD0", "GuardPaddedLegLayer_LOD0",
    "Tabard_OriginalGuardFrontTabard_LOD0", "GuardArms_LOD0",
    "HelmetAssembly_LOD0", "KingdomSteelSword_LOD0", "KingdomSunShield_LOD0",
}
visible_names.update(
    obj.name for obj in bpy.data.objects
    if obj.type == "MESH" and obj.name.startswith("GuardLegArmor_") and obj.name.endswith("LOD0")
)
for obj in bpy.data.objects:
    if obj.type == "MESH":
        obj.hide_render = obj.name not in visible_names
setup_camera("threequarter", Vector((0.0, 0.0, 0.92)), output_path.parent)
scene.camera = bpy.data.objects["AssemblyReviewCamera"]
scene.render.filepath = str(output_path)
bpy.ops.render.render(write_still=True)
print("POSE_RENDER", action_name, frame, output_path)
