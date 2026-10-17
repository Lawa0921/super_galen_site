"""Fixed full-body views of the measured attack snap, internal review only."""
import hashlib
import json
import sys
from pathlib import Path
import bpy
from mathutils import Vector

sys.dont_write_bytecode = True
sys.path.insert(0, str(Path(__file__).parent))
from guard_arm_velocity_diagnose import ROOT, RUN, SOURCES


def main():
    _, source, expected = SOURCES[1]
    run, label = RUN, 'before'
    if '--authored-attack' in sys.argv:
        run = RUN.with_name('2026-10-08-v25-authored-attack')
        info = json.loads((run/'qa/authoring.json').read_text(encoding='utf-8'))
        source = run/'candidate/guard-authored-attack.blend'
        expected, label = info['candidate_sha256'], 'after'
    attack_start = '--attack-start' in sys.argv or '--exterior-tangent' in sys.argv
    if attack_start:
        run = RUN.with_name('2026-10-08-v28-authored-attack-start-arc')
        if '--exterior-tangent' in sys.argv:
            run = RUN.with_name('2026-10-08-v29-attack-start-exterior-tangent')
        info = json.loads((run/'qa/authoring.json').read_text(encoding='utf-8'))
        source = run/'candidate/guard-authored-attack.blend'
        expected, label = info['candidate_sha256'], 'after'
    motion = '--motion' in sys.argv
    contact_side = '--contact-side' in sys.argv
    view = 'front' if '--front' in sys.argv else 'oblique'
    if (motion or contact_side) and not attack_start:
        run = RUN.with_name('2026-10-08-v25-authored-attack')
    assert hashlib.sha256(source.read_bytes()).hexdigest() == expected
    bpy.ops.wm.open_mainfile(filepath=str(source))
    scene, rig = bpy.context.scene, bpy.data.objects['GuardRig20']
    rig.animation_data.action = bpy.data.actions['Attack']
    for obj in bpy.data.objects:
        obj.hide_render = not (obj.type == 'MESH' and obj.name.endswith('LOD0'))
    target = Vector((0, .08, 1.0))
    scene.render.engine = 'BLENDER_EEVEE'
    scene.render.resolution_x, scene.render.resolution_y = 900, 1000
    if motion:
        scene.render.resolution_x, scene.render.resolution_y = 512, 640
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = 'PNG'
    scene.world = bpy.data.worlds.new('Full character attack inspection')
    scene.world.color = (.045, .045, .045)
    scene.view_settings.look = 'AgX - Medium High Contrast'
    scene.view_settings.exposure = -1
    for delta, energy in (((2, 3, 4), 500), ((-3, 1, 2), 300), ((1, -3, 3), 450)):
        data = bpy.data.lights.new('Character inspection softbox', 'AREA')
        data.energy, data.size = energy, 2
        light = bpy.data.objects.new(data.name, data)
        scene.collection.objects.link(light)
        light.location = target + Vector(delta)
        light.rotation_euler = (target - light.location).to_track_quat('-Z', 'Y').to_euler()
    data = bpy.data.cameras.new('Fixed full-body front oblique')
    data.type, data.ortho_scale = 'ORTHO', 2.35
    camera = bpy.data.objects.new(data.name, data)
    scene.collection.objects.link(camera)
    direction = (4.5, 4.5, 1.5) if contact_side else (0. if view == 'front' else 2., 6., 1.5)
    camera.location = target + Vector(direction)
    camera.rotation_euler = (target - camera.location).to_track_quat('-Z', 'Y').to_euler()
    scene.camera = camera
    out = run / 'qa/renders'
    if motion:
        out = run / f'qa/motion/{label}/{view}'
    if contact_side:
        out = run / f'qa/contact-side/{label}'
    out.mkdir(parents=True, exist_ok=True)
    rows = []
    frames = (9., 10., 10.5, 11., 12., 12.75, 13., 13.25, 13.5, 14., 15., 16., 17., 18.) if label == 'after' else (12., 12.75, 13., 13.25, 13.5, 14., 15., 18.)
    if motion:
        frames = [i/4 for i in range(145)]
    if contact_side:
        frames = (9., 10.5, 15., 16., 17., 18.)
    if attack_start and not motion:
        frames = (0., .5, 1., 1.5, 2., 2.5, 3., 3.5, 4., 4.5)
    for index, frame in enumerate(frames):
        scene.frame_set(int(frame), subframe=frame % 1)
        path = out / (label+'-attack-' + str(frame).replace('.', '_') + '.png')
        if motion:
            path = out / f'{index:04d}.png'
        scene.render.filepath = str(path)
        bpy.ops.render.render(write_still=True)
        rows.append({'frame': frame, 'path': str(path.relative_to(ROOT)).replace('\\', '/'), 'sha256': hashlib.sha256(path.read_bytes()).hexdigest()})
    metadata = out/'frames.json' if motion or contact_side else run/'qa/renders.json'
    metadata.write_text(json.dumps({'source_sha256': expected, 'runtime_publish_allowed': False, 'source_saved': False, 'view': view, 'camera_direction': direction, 'source_fps': 30, 'renders': rows}, indent=2)+'\n', encoding='utf-8')


if __name__ == '__main__':
    main()
