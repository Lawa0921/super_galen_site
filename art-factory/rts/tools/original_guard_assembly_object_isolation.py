"""Render every assembled mesh in isolation at Attack frame 16 from the side camera.
Run inside Blender; diagnostic only and never modifies the source blend.
"""
import bpy
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
from mathutils import Vector
from original_guard_assembly_build import setup_camera

args = sys.argv[sys.argv.index("--") + 1:]
blend_path, output_dir = map(Path, args[:2])
output_dir.mkdir(parents=True, exist_ok=True)
bpy.ops.wm.open_mainfile(filepath=str(blend_path))
scene = bpy.context.scene
rig = bpy.data.objects.get("GuardRig20")
if rig is None or rig.animation_data is None:
    raise ValueError("candidate is missing GuardRig20 animation")
rig.animation_data.action = bpy.data.actions.get("Attack")
scene.frame_set(16)
scene.camera = None
setup_camera("side", Vector((0.0, 0.0, 0.92)), output_dir)
mesh_objs = [o for o in bpy.data.objects if o.type == "MESH" and o.name.endswith("LOD0")]
names = (
    "GuardBody_LOD0",
    "Tabard_OriginalGuardFrontTabard_LOD0",
    "GuardArms_LOD0",
    "HelmetAssembly_LOD0",
    "KingdomSteelSword_LOD0",
    "KingdomSunShield_LOD0",
)
missing = [name for name in names if not bpy.data.objects.get(name)]
if missing:
    raise ValueError("missing expected LOD0 mesh objects: " + ", ".join(missing))
for name in names:
    for obj in mesh_objs:
        obj.hide_render = obj.name != name
    scene.render.filepath = str(output_dir / ("attack16-side-" + name + ".png"))
    bpy.ops.render.render(write_still=True)
    print("OBJECT_ISOLATION_RENDER=" + name + ":" + scene.render.filepath)
rig.animation_data.action = bpy.data.actions["Walk"]
scene.frame_set(6)
setup_camera("front", Vector((0.0, 0.0, 0.92)), output_dir)
for name in names:
    for obj in mesh_objs:
        obj.hide_render = obj.name != name
    scene.render.filepath = str(output_dir / ("walk6-front-" + name + ".png"))
    bpy.ops.render.render(write_still=True)
    print("OBJECT_ISOLATION_RENDER=Walk6-" + name + ":" + scene.render.filepath)
for obj in mesh_objs:
    obj.hide_render = False
