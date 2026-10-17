"""Render actual reloaded armor candidate; no source or runtime writes."""
import json
import math
import sys
from pathlib import Path

import bpy
import numpy as np
from mathutils import Vector, Matrix

sys.dont_write_bytecode = True
sys.path.insert(0, str(Path(__file__).parent))
from guard_armor_controlled_helpers import RUN, CANDIDATE, HELPERS, sha
from original_guard_articulated_armor import frame, module_skin_matrices
from original_guard_walk_refine import action_fcurves


def main():
    global RUN, CANDIDATE
    if '--run' in sys.argv:
        RUN = RUN.with_name(sys.argv[sys.argv.index('--run')+1])
        CANDIDATE = RUN/'candidate/guard-controlled-armor.blend'
    lod, motion = int('--lod1' in sys.argv), '--motion' in sys.argv
    authoring = json.loads((RUN/'qa/authoring.json').read_text(encoding='utf-8'))
    assert sha(CANDIDATE) == authoring['candidate_sha256']
    bpy.ops.wm.open_mainfile(filepath=str(CANDIDATE))
    scene, rig = bpy.context.scene, bpy.data.objects['GuardRig20']
    for obj in bpy.data.objects:
        obj.hide_render = not (obj.type == 'MESH' and obj.name.endswith('LOD'+str(lod)))
    scene.render.engine = 'BLENDER_EEVEE'
    scene.render.resolution_x, scene.render.resolution_y = (600, 750) if motion else (800, 1000)
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = 'PNG'
    scene.world = bpy.data.worlds.new('Controlled armor review world')
    scene.world.color = (.045, .045, .045)
    scene.view_settings.look = 'AgX - Medium High Contrast'
    scene.view_settings.exposure = -1
    for delta, energy in (((2, 3, 4), 500), ((-3, 1, 2), 300), ((1, -3, 3), 450)):
        data = bpy.data.lights.new('Controlled armor softbox', 'AREA')
        data.energy, data.size = energy, 2
        light = bpy.data.objects.new(data.name, data)
        scene.collection.objects.link(light)
        light.location = Vector((0, .08, 1))+Vector(delta)
        light.rotation_euler = (Vector((0, .08, 1))-light.location).to_track_quat('-Z', 'Y').to_euler()
    camera_data = bpy.data.cameras.new('Controlled armor camera')
    camera_data.type, camera_data.clip_start = 'ORTHO', .001
    camera = bpy.data.objects.new(camera_data.name, camera_data)
    scene.collection.objects.link(camera)
    scene.camera = camera
    rest = {s: np.array([rig.data.bones[n+'_'+s].head_local[:] for n in ('UpperArm', 'Forearm', 'Hand')]) for s in HELPERS}
    folder = RUN/('qa/motion-frames' if motion else f'qa/reload-renders-lod{lod}')
    folder.mkdir(parents=True, exist_ok=True)
    frames = [('Death', i/2) for i in range(97)] if motion else [('Idle', 0), ('Attack', 16), ('Death', 14), ('Death', 15.5), ('Death', 17), ('Death', 48)]
    records = []
    for index, (clip, time) in enumerate(frames):
        for mode in (('controlled',) if clip != 'Death' else ('controlled', 'raw')):
            rig.animation_data.action = bpy.data.actions[clip]
            for curve in action_fcurves(rig.animation_data.action):
                if curve.data_path.startswith('pose.bones["Armor'):
                    curve.mute = mode == 'raw'
            scene.frame_set(math.floor(time), subframe=time % 1)
            bpy.context.view_layer.update()
            if mode == 'raw':
                for side, names in HELPERS.items():
                    posed = np.array([rig.pose.bones[n+'_'+side].head[:] for n in ('UpperArm', 'Forearm', 'Hand')])
                    for name, skin in zip(names, module_skin_matrices(rest[side], posed)):
                        bind = rig.data.bones[name].matrix_local
                        rig.pose.bones[name].matrix_basis = bind.inverted() @ Matrix(skin.tolist()) @ bind
                bpy.context.view_layer.update()
            expected_pose = {name: np.array(rig.pose.bones[name].matrix) for names in HELPERS.values() for name in names}
            joints = np.array([rig.pose.bones[n+'_R'].head[:] for n in ('UpperArm', 'Forearm', 'Hand')])
            axes = np.diff(joints, axis=0)
            axes /= np.linalg.norm(axes, axis=1)[:, None]
            basis = frame(axes.sum(axis=0), axes[1]-axes[0])
            views = [('body', Vector((0, .12, .88)), Vector((4.5, 4.5, 1.5)), 2.75)]
            if not motion:
                views.append(('elbow', Vector(joints[1]), Vector(-basis[:, 2]+basis[:, 0]*.65), .50))
            for view, target, direction, span in views:
                camera.location = target+direction.normalized()*5
                camera.rotation_euler = (target-camera.location).to_track_quat('-Z', 'Y').to_euler()
                camera_data.ortho_scale = span
                name = f'{mode}-{index:04d}.png' if motion else f'{clip}-{time}-{mode}-{view}.png'
                path = folder/name
                scene.render.filepath = str(path)
                bpy.ops.render.render(write_still=True)
                render_pose_error = max(float(np.max(np.abs(np.array(rig.pose.bones[n].matrix)-m))) for n, m in expected_pose.items())
                assert render_pose_error < 2e-6, ('Render changed review pose', mode, clip, time, render_pose_error)
                records.append({'file': path.name, 'sha256': sha(path), 'clip': clip, 'frame': time, 'mode': mode,
                                'view': view, 'camera_target': list(target), 'direction': list(direction), 'ortho_scale': span,
                                'render_pose_error': render_pose_error, 'right_helper_pose': [expected_pose[n].tolist() for n in HELPERS['R']]})
        if index % 10 == 0:
            print('CONTROLLED_RENDER', clip, time, flush=True)
    (folder/'renders.json').write_text(json.dumps({'candidate_sha256': sha(CANDIDATE), 'runtime_publish_allowed': False,
        'lod': lod, 'motion': motion, 'source_saved': False, 'raw_comparison': 'Same saved shell geometry; only helpers temporarily set to analytic baseline in memory',
        'images': records}, indent=2)+'\n', encoding='utf-8', newline='\n')


if __name__ == '__main__':
    main()
