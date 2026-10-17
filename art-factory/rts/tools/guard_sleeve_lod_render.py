"""Fixed-view LOD cloth review from the saved source; no geometry edits or saves."""
import json
import math
import sys
from pathlib import Path

import bpy
import numpy as np
from mathutils import Vector

sys.dont_write_bytecode = True
sys.path.insert(0, str(Path(__file__).parent))
from guard_armor_controlled_helpers import BASE, sha
from original_guard_articulated_armor import frame

RUN = BASE/'2026-10-09-v35-shared-left-cloth-lod'


def main():
    source = RUN/'candidate/guard-controlled-armor.blend'
    report = json.loads((RUN/'qa/authoring.json').read_text(encoding='utf-8'))
    assert sha(source) == report['candidate_sha256']
    bpy.ops.wm.open_mainfile(filepath=str(source))
    scene, rig = bpy.context.scene, bpy.data.objects['GuardRig20']
    scene.render.engine = 'BLENDER_EEVEE'
    scene.render.resolution_x = scene.render.resolution_y = 720
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = 'PNG'
    scene.world = bpy.data.worlds.new('Sleeve LOD review world')
    scene.world.color = (.045, .045, .045)
    scene.view_settings.look = 'AgX - Medium High Contrast'
    scene.view_settings.exposure = -1
    for delta, energy in (((2, 3, 4), 500), ((-3, 1, 2), 400), ((1, -3, 3), 450)):
        data = bpy.data.lights.new('Sleeve review light', 'AREA')
        data.energy, data.size = energy, 2
        light = bpy.data.objects.new(data.name, data)
        scene.collection.objects.link(light)
        light.location = Vector((0, .08, 1)) + Vector(delta)
        light.rotation_euler = (Vector((0, .08, 1))-light.location).to_track_quat('-Z', 'Y').to_euler()
    data = bpy.data.cameras.new('Sleeve fixed camera')
    data.type, data.clip_start = 'ORTHO', .001
    camera = bpy.data.objects.new(data.name, data)
    scene.collection.objects.link(camera)
    scene.camera = camera
    folder = RUN/'qa/lod-interface-renders-v2'
    folder.mkdir(parents=True, exist_ok=True)
    images = []
    for clip, time in (('Idle', 0), ('Attack', 16), ('Death', 15.5), ('Death', 48)):
        rig.animation_data.action = bpy.data.actions[clip]
        scene.frame_set(math.floor(time), subframe=time % 1)
        joints = np.array([rig.pose.bones[n+'_L'].head[:] for n in ('UpperArm', 'Forearm', 'Hand')])
        axes = np.diff(joints, axis=0)
        axes /= np.linalg.norm(axes, axis=1)[:, None]
        basis = frame(axes.sum(axis=0), axes[1]-axes[0])
        views = [('body', Vector((0, .12, .88)), Vector((-4.5, 4.5, 1.5)), 2.75),
                 ('inner-elbow', Vector(joints[1]), Vector(-basis[:, 2]+basis[:, 0]*.65), .56),
                 ('wrist', Vector(joints[2]), Vector(-basis[:, 2]+basis[:, 0]*.65), .36)]
        for view, target, direction, span in views:
            for lod in (0, 1):
                for obj in bpy.data.objects:
                    if obj.type == 'MESH':
                        obj.hide_render = not obj.name.endswith('LOD'+str(lod)) or (view != 'body' and 'Shield' in obj.name)
                        if view == 'inner-elbow':
                            obj.hide_render = not (obj.name == 'GuardArms_LOD'+str(lod) or
                                (obj.name.startswith('Guard') and obj.name.endswith('_L_LOD'+str(lod))))
                camera.location = target+direction.normalized()*5
                camera.rotation_euler = (target-camera.location).to_track_quat('-Z', 'Y').to_euler()
                data.ortho_scale = span
                path = folder/f'{clip}-{time}-{view}-LOD{lod}.png'
                scene.render.filepath = str(path)
                bpy.ops.render.render(write_still=True)
                images.append({'file': path.name, 'sha256': sha(path), 'clip': clip, 'frame': time, 'view': view, 'lod': lod,
                    'camera_target': list(target), 'direction': list(direction), 'span': span,
                    'shield_hidden_for_interface_inspection': view != 'body',
                    'isolated_arm_parts': view == 'inner-elbow'})
        print('SLEEVE_LOD_RENDER', clip, time, flush=True)
    (folder/'renders.json').write_text(json.dumps({'candidate_sha256': sha(source), 'source_saved': False, 'images': images}, indent=2)+'\n', encoding='utf-8', newline='\n')


if __name__ == '__main__':
    main()
