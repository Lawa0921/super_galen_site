"""Internal rest and action inspection of the saved canonical-bind candidate."""
import bpy, hashlib, json, sys
from pathlib import Path
from mathutils import Vector
sys.path.insert(0, str(Path(__file__).parent))
from guard_hand_bind_canonical import ROOT, RUN

MOTION = '--wrist-repair' in sys.argv
if MOTION:
    from guard_hand_ik_repair import RUN
report = json.loads((RUN / ('qa/repair.json' if MOTION else 'qa/canonical-bind.json')).read_text(encoding='utf-8'))
candidate = ROOT / report['candidate_path']
assert hashlib.sha256(candidate.read_bytes()).hexdigest() == report['candidate_sha256']
bpy.ops.wm.open_mainfile(filepath=str(candidate))
rig = bpy.data.objects['GuardRig20']
for obj in bpy.data.objects:
    obj.hide_render = obj.type != 'MESH' or not obj.name.endswith('_LOD0')
scene = bpy.context.scene
scene.render.engine = 'BLENDER_EEVEE'
scene.render.resolution_x = 1000
scene.render.resolution_y = 1000
scene.render.resolution_percentage = 100
scene.render.image_settings.file_format = 'PNG'
scene.world = bpy.data.worlds.new('Canonical bind inspection')
scene.world.color = (.04, .04, .04)
scene.view_settings.look = 'AgX - Medium High Contrast'
scene.view_settings.exposure = -1.0
for location, power in (((1.8, 2, 2.5), 220), ((-1.6, 1.2, 1.2), 90), ((.5, -1.6, 2), 140)):
    data = bpy.data.lights.new('Canonical softbox', 'AREA')
    data.energy = power
    data.size = 1.5
    obj = bpy.data.objects.new(data.name, data)
    bpy.context.collection.objects.link(obj)
    obj.location = location
    obj.rotation_euler = (Vector((0, 0, 1)) - obj.location).to_track_quat('-Z', 'Y').to_euler()
views = (
    ('canonical-rest-arm', None, 0, (.95, 1.5, .6), .5),
    ('idle-wrist', 'Idle', 0, (.95, 1.5, .6), .48),
    ('attack-known-joint-gap', 'Attack', 13.09375, (1.5, 1.0, .5), .48),
    ('death-known-joint-gap', 'Death', 15.5, (1.3, 1.8, .5), .5),
)
directory = RUN / 'qa/renders'
directory.mkdir(parents=True, exist_ok=True)
rendered = {}
for name, clip, frame, direction, scale in views:
    if MOTION:
        name = name.replace('known-joint-gap', 'repaired-motion')
    rig.data.pose_position = 'POSE' if clip else 'REST'
    if clip:
        rig.animation_data.action = bpy.data.actions[clip]
        scene.frame_set(int(frame), subframe=frame % 1)
        target = (rig.pose.bones['Hand_R'].head + rig.pose.bones['Forearm_R'].tail) / 2
    else:
        target = rig.data.bones['Hand_R'].head_local.copy()
    target.z -= .02
    data = bpy.data.cameras.new(name)
    data.type = 'ORTHO'
    data.ortho_scale = scale
    data.clip_start = .001
    camera = bpy.data.objects.new(name, data)
    bpy.context.collection.objects.link(camera)
    camera.location = target + Vector(direction)
    camera.rotation_euler = (target - camera.location).to_track_quat('-Z', 'Y').to_euler()
    scene.camera = camera
    path = directory / (name + '.png')
    scene.render.filepath = str(path)
    bpy.ops.render.render(write_still=True)
    rendered[name] = {'path': str(path.relative_to(ROOT)).replace('\\', '/'), 'sha256': hashlib.sha256(path.read_bytes()).hexdigest(), 'clip': clip, 'frame': frame}
(RUN / 'qa/renders.json').write_text(json.dumps({'candidate_sha256': report['candidate_sha256'], 'geometry_resaved': False,
    'runtime_publish_allowed': False, 'scope': 'Wrist motion inspection; original rejected glove shape is only context' if MOTION else 'Bind representation and known unrepaired source motion; original rejected glove shape is only context', 'renders': rendered}, indent=2) + '\n', encoding='utf-8')
