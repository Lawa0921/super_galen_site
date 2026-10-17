"""Freeze actual v25 skin matrices for bounded articulated-armor authoring."""
import hashlib
import json
import math
import sys
from pathlib import Path

import bpy
import numpy as np

sys.dont_write_bytecode = True
sys.path.insert(0, str(Path(__file__).parent))
from guard_armor_relief_inventory import components, PARTS
from elbow_hinge_frame import hinge_skin_matrices

ROOT = Path(__file__).resolve().parents[3]
BASE = ROOT / 'art-factory/rts/runs/guard-right-hand-cage'
SOURCE = BASE / '2026-10-08-v25-authored-attack/candidate/guard-authored-attack.blend'
SHA = 'a57e17a559d60a3912b77d6e5cb6708e888a5e73181e2c5d5e517cb1af103c35'
RUN = BASE / '2026-10-08-v26-articulated-armor'


def main(*, source=SOURCE, source_sha=SHA, run=RUN):
    SOURCE, SHA, RUN = source, source_sha, run
    assert hashlib.sha256(SOURCE.read_bytes()).hexdigest() == SHA
    bpy.ops.wm.open_mainfile(filepath=str(SOURCE))
    rig, scene = bpy.data.objects['GuardRig20'], bpy.context.scene
    bones = list(rig.data.bones)
    names = [b.name for b in bones]
    rest = np.array([np.array(b.matrix_local) for b in bones])
    inverses = [b.matrix_local.inverted() for b in bones]
    arms = {}
    for lod in (0, 1):
        obj = bpy.data.objects[f'GuardArms_LOD{lod}']
        mesh = obj.data
        mesh.calc_loop_triangles()
        islands = components(mesh)
        assert len(islands) == 12
        membership = {v: ci for ci, ids in enumerate(islands) for v in ids}
        arms[str(lod)] = {
            'points': [list(v.co) for v in mesh.vertices],
            'weights': [{obj.vertex_groups[g.group].name: g.weight for g in v.groups} for v in mesh.vertices],
            'parts': {side+'_'+name: {'vertices': islands[ci+offset],
                       'triangles': [list(t.vertices) for t in mesh.loop_triangles if membership[t.vertices[0]] == ci+offset]}
                      for side, offset in (('R', 0), ('L', 6)) for ci, name in enumerate(PARTS)},
        }
    data, clips = {}, {}
    for clip in ('Idle', 'Walk', 'Attack', 'Hurt', 'Death'):
        action = bpy.data.actions[clip]
        rig.animation_data.action = action
        times = np.arange(round(action.frame_range[1]*8)+1)/8
        skins, joints = [], []
        summary = {}
        for t in times:
            scene.frame_set(math.floor(t), subframe=t % 1)
            skins.append([np.array(rig.pose.bones[b.name].matrix @ inv) for b, inv in zip(bones, inverses)])
            joints.append([[list(rig.pose.bones[n+'_'+side].head) for n in ('UpperArm', 'Forearm', 'Hand')] for side in ('R', 'L')])
        joints = np.asarray(joints)
        for si, side in enumerate(('R', 'L')):
            r = np.array([rig.data.bones[n+'_'+side].head_local[:] for n in ('UpperArm', 'Forearm', 'Hand')])
            frames = np.array([hinge_skin_matrices(r, p) for p in joints[:, si]])
            axes = np.diff(joints[:, si], axis=1)
            axes /= np.linalg.norm(axes, axis=2)[..., None]
            angles = np.rad2deg(np.arccos(np.clip(np.sum(axes[:, 0]*axes[:, 1], axis=1), -1, 1)))
            summary[side] = {'minimum_bend_degrees': float(angles.min()), 'maximum_bend_degrees': float(angles.max()),
                             'minimum_frame': float(times[np.argmin(angles)]), 'maximum_frame': float(times[np.argmax(angles)])}
            data[clip+'_'+side+'_hinge_skin'] = frames
        data[clip+'_times'], data[clip+'_skin'], data[clip+'_joints'] = times, np.asarray(skins), joints
        clips[clip] = {'samples': len(times), 'sides': summary}
        print('ARTICULATION_SOURCE', clip, summary, flush=True)
    (RUN/'raw').mkdir(parents=True, exist_ok=True)
    (RUN/'qa').mkdir(parents=True, exist_ok=True)
    np.savez_compressed(RUN/'raw/source-poses.npz', rest=rest, **data)
    (RUN/'raw/source-arms.json').write_text(json.dumps(arms)+'\n', encoding='utf-8')
    report = {'status': 'source_measurement_only', 'source_sha256': SHA, 'bones': names, 'clips': clips,
              'samples_per_frame': 8, 'runtime_publish_allowed': False,
              'limitations': ['Coarse design preflight; does not replace final dense collision or animation verification'],
              'artifacts_sha256': {p.name: hashlib.sha256(p.read_bytes()).hexdigest() for p in (RUN/'raw').iterdir() if p.is_file()}}
    (RUN/'qa/source-poses.json').write_text(json.dumps(report, indent=2)+'\n', encoding='utf-8')


if __name__ == '__main__':
    main()
