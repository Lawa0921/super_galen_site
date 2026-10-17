"""Original 遊俠 (ranger) production build: generated body, crossbow-family 20-bone rig, longbow.

Blender 5.2 background:
  blender --background --factory-startup --python-exit-code 1 --python roster_ranger_build.py -- --run <run>

Shares the roster pipeline helpers in roster_pikeman_build.py (load, weights, analytic two-bone
IK, wrist cut, packing-friendly export). The bow is rigid to Hand_L; the arrow and the string's
nock ring follow Hand_R, so drawing really pulls the string; tips stay on the bow. The right
hand keeps the arrow nocked in every clip (ready stance), so the string never detaches.
"""
import argparse
import base64
import json
import math
import sys
from pathlib import Path

import bpy
import bmesh
from mathutils import Matrix, Quaternion, Vector

TOOLS = Path(__file__).resolve().parent
sys.path.insert(0, str(TOOLS))
import procedural_gauntlet_build as g  # noqa: E402
import roster_pikeman_build as pk  # noqa: E402
from human_units_build import bind_auto, decimate, fill_sparse_auto_weights, material, setup_render_scene, weight_metrics  # noqa: E402
from commander_assembly_build import surface  # noqa: E402
from roster_hands import build_hand  # noqa: E402


_HAND_ARGS = {}


def closed_hand(name, rig, side, center, axis, radius, wrist, wrist_radius, lod, ref, mats, steel=False, split=0.0, hook=False):
    """Three-phalanx closed hand (roster_hands.py); `hook` = draw hand hooked on the string."""
    _HAND_ARGS[name] = (rig, side, center, axis, radius, wrist, wrist_radius, ref, mats, split, hook)
    return build_hand(name, rig, side, center, axis, radius, wrist, wrist_radius, ref, mats, 'AssemblyDetail_leather', detail=lod, split=split, hook=hook)


def lod1_hand(name0):
    """The same grip rebuilt at the lighter LOD1 detail (identical wrap, fewer segments)."""
    rig, side, center, axis, radius, wrist, wrist_radius, ref, mats, split, hook = _HAND_ARGS[name0]
    obj, rec = build_hand(name0.replace('LOD0', 'LOD1'), rig, side, center, axis, radius, wrist, wrist_radius, ref, mats, 'AssemblyDetail_leather', detail=1, split=split, hook=hook)
    return obj, rec
from neural_blender_qa import render_view  # noqa: E402

UNIT = 'ranger'
HEIGHT = 1.80
FPS = 30
CLIPS = ('Idle', 'Walk', 'Attack', 'Hurt', 'Death')
FRAMES = {'Idle': 72, 'Walk': 18, 'Attack': 30, 'Hurt': 15, 'Death': 48}
RELEASE_FRAME = 12                     # 0.4 s, catalog PROJECTILE_RELEASE_SECONDS.ranger
STRIDE = 2.22                          # one Walk cycle (0.6 s) at speed 3.7
BOW_HALF = .78                         # grip to tip along the bow axis
BRACE = .17                            # grip to resting string
DRAW = .46                             # full draw beyond brace
ARROW = .76
GRIP_R = .0185                         # leather bow grip radius
NOCK_GRIP = .036                       # arrow grip centre ahead of the nock
ARROW_GRIP_R = .0062
HOOK_R = .007                          # draw-hand finger hook radius around the served string
SERVING_R = .0028                      # centre serving on the string at the nocking point
FINGER_SPLIT = .012                    # arrow between the middle and ring fingers (split-finger draw)
# Straight-wrist forearm directions in bow space: the bow arm points at the grip from the left
# shoulder, the drawing forearm runs forward-inward from the drawn-back elbow to the nock.
WRIST_LINE = {'L': Vector((.55, .84, 0)).normalized(), 'R': Vector((-.55, .84, 0)).normalized()}
PALM = .095
NOCK_Z = .082                          # arrow rest above the bow hand, clear of the forearm
# Wrist -> grip direction in bow-local space (X right, Y shooting direction, Z bow up).
REACH = {'L': Vector((.55, .84, 0)).normalized(),  # bow forearm left of the string plane
          'R': Vector((-.95, .30, 0)).normalized()}
POLE = {'L': Vector((-.30, -.05, -.25)), 'R': Vector((.25, -.35, .10))}

# Shared helpers read these module globals at call time.
pk.UNIT, pk.HEIGHT, pk.FPS, pk.CLIPS, pk.FRAMES = UNIT, HEIGHT, FPS, CLIPS, FRAMES


def smooth(x):
    return pk.smooth(x)


def landmarks(foot_half):
    """Crossbow-family 20-bone hierarchy with joints measured on this body (forward-leaning
    TripoSR shell: legs sit behind the chest, so joints carry measured Y offsets)."""
    h = HEIGHT
    bones = {
        'Root': ((0, 0, 0), (0, 0, .12 * h), None),
        'Pelvis': ((0, -.02, .12 * h), (0, -.01, .45 * h), 'Root'),
        'SpineLower': ((0, -.01, .45 * h), (0, .01, .62 * h), 'Pelvis'),
        'SpineUpper': ((0, .01, .62 * h), (0, .02, .77 * h), 'SpineLower'),
        'Neck': ((0, .02, .77 * h), (0, .03, .87 * h), 'SpineUpper'),
        'Head': ((0, .03, .87 * h), (0, .04, .99 * h), 'Neck'),
    }
    arm = {'shoulder': (.090, .020, 1.445), 'upper': (.200, .025, 1.415), 'elbow': (.305, .040, 1.160),
           'wrist': (.362, .070, .958), 'tip': (.392, .115, .815)}
    for side, sign in (('L', -1), ('R', 1)):
        p = {k: (sign * v[0], v[1], v[2]) for k, v in arm.items()}
        bones[f'Shoulder_{side}'] = (p['shoulder'], p['upper'], 'SpineUpper')
        bones[f'UpperArm_{side}'] = (p['upper'], p['elbow'], f'Shoulder_{side}')
        bones[f'Forearm_{side}'] = (p['elbow'], p['wrist'], f'UpperArm_{side}')
        bones[f'Hand_{side}'] = (p['wrist'], p['tip'], f'Forearm_{side}')
        hip = (sign * foot_half * .80, -.02, .445 * h)
        knee = (sign * foot_half, -.085, .262 * h)
        ankle = (sign * foot_half * 1.03, -.12, .062 * h)
        toe = (sign * foot_half * 1.03, -.12 + .10 * h, .032 * h)
        bones[f'Thigh_{side}'] = (hip, knee, 'Pelvis')
        bones[f'Shin_{side}'] = (knee, ankle, f'Thigh_{side}')
        bones[f'Foot_{side}'] = (ankle, toe, f'Shin_{side}')
    return {'height_m': h, 'foot_half_spacing_m': foot_half, 'bones': bones, 'arm_fit': arm}


pk.landmarks = landmarks

BODY_KEYS = {
    'Idle': [(0, {'SpineUpper': ('X', 1.5), 'Head': ('Z', -6)}), (24, {'$root_z': .010, 'SpineUpper': (('X', -1.5), ('Z', 3)), 'Head': (('Z', 8), ('X', 3))}),
             (48, {'$root_z': .004, 'SpineUpper': (('X', .5), ('Z', -2)), 'Head': (('Z', -2), ('X', -2))}), (72, {'SpineUpper': ('X', 1.5), 'Head': ('Z', -6)})],
    # Brisk forward-leaning scout gait.
    'Walk': [
        (0, {'SpineLower': ('X', -11), 'SpineUpper': ('X', -6), 'Head': ('X', 8), 'Thigh_L': ('X', 32), 'Thigh_R': ('X', -28), 'Shin_R': ('X', 26)}),
        (4, {'$root_z': .036, 'SpineLower': ('X', -11), 'SpineUpper': ('X', -6), 'Head': ('X', 8), 'Thigh_L': ('X', 6), 'Thigh_R': ('X', -4), 'Shin_L': ('X', 18), 'Shin_R': ('X', 14)}),
        (9, {'SpineLower': ('X', -11), 'SpineUpper': ('X', -6), 'Head': ('X', 8), 'Thigh_L': ('X', -28), 'Thigh_R': ('X', 32), 'Shin_L': ('X', 26)}),
        (13, {'$root_z': .036, 'SpineLower': ('X', -11), 'SpineUpper': ('X', -6), 'Head': ('X', 8), 'Thigh_L': ('X', -4), 'Thigh_R': ('X', 6), 'Shin_L': ('X', 14), 'Shin_R': ('X', 18)}),
        (18, {'SpineLower': ('X', -11), 'SpineUpper': ('X', -6), 'Head': ('X', 8), 'Thigh_L': ('X', 32), 'Thigh_R': ('X', -28), 'Shin_R': ('X', 26)}),
    ],
    # Turn side-on, raise, draw to the cheek, loose at frame 12, recover.
    'Attack': [
        (0, {}),
        (5, {'SpineLower': ('Z', -14), 'SpineUpper': ('Z', -22), 'Head': ('Z', 26), 'Thigh_L': ('X', 8), 'Thigh_R': ('X', -6)}),
        (11, {'SpineLower': ('Z', -28), 'SpineUpper': (('Z', -40), ('X', 3)), 'Head': (('Z', 58), ('X', -4)), 'Thigh_L': ('X', 12), 'Shin_L': ('X', -6), 'Thigh_R': ('X', -10)}),
        (13, {'SpineLower': ('Z', -28), 'SpineUpper': (('Z', -41), ('X', 5)), 'Head': (('Z', 58), ('X', -3)), 'Thigh_L': ('X', 12), 'Shin_L': ('X', -6), 'Thigh_R': ('X', -10)}),
        (21, {'SpineLower': ('Z', -12), 'SpineUpper': ('Z', -16), 'Head': ('Z', 20), 'Thigh_L': ('X', 6), 'Thigh_R': ('X', -5)}),
        (30, {}),
    ],
    'Hurt': [(0, {}), (4, {'$root_y': -.07, '$root_z': -.015, 'SpineLower': ('X', 14), 'SpineUpper': (('X', 20), ('Z', -6)), 'Head': (('X', -16), ('Z', -10)),
                          'Thigh_L': ('X', -10), 'Shin_L': ('X', 10), 'Thigh_R': ('X', 6)}),
             (9, {'$root_y': -.03, 'SpineLower': ('X', 5), 'SpineUpper': ('X', 8), 'Head': ('X', -5), 'Thigh_L': ('X', -4)}), (15, {})],
    # Knees give way, he drops to kneel and slumps forward over the bow he keeps planted in front
    # (both hands stay on bow and nocked arrow, so the string never leaves the bow).
    'Death': [(0, {}),
              (6, {'Thigh_L': ('X', 26), 'Thigh_R': ('X', 20), 'Shin_L': ('X', -46), 'Shin_R': ('X', -40),
                   'SpineLower': ('X', -8), 'SpineUpper': ('X', 10), 'Head': ('X', -10)}),
              (13, {'Thigh_L': ('X', 34), 'Thigh_R': ('X', 30), 'Shin_L': ('X', -96), 'Shin_R': ('X', -92), 'Foot_L': ('X', 30), 'Foot_R': ('X', 28),
                    'SpineLower': ('X', -14), 'SpineUpper': ('X', -6), 'Head': ('X', -14)}),
              (22, {'Root': (('Y', -48), ('X', -10)), 'Thigh_L': ('X', 44), 'Thigh_R': ('X', 38), 'Shin_L': ('X', -84), 'Shin_R': ('X', -80), 'Foot_L': ('X', 22), 'Foot_R': ('X', 20),
                    'SpineLower': ('X', -16), 'SpineUpper': ('X', -8), 'Head': (('X', -10), ('Y', 10))}),
              (30, {'Root': (('Y', -86), ('X', -8)), 'Thigh_L': ('X', 30), 'Thigh_R': ('X', 18), 'Shin_L': ('X', -62), 'Shin_R': ('X', -54), 'Foot_L': ('X', 12), 'Foot_R': ('X', 10),
                    'SpineLower': ('X', -12), 'SpineUpper': ('X', -6), 'Neck': ('Y', 10), 'Head': (('X', -8), ('Y', 22))}),
              (36, {'Root': (('Y', -88), ('X', -8)), 'Thigh_L': ('X', 28), 'Thigh_R': ('X', 16), 'Shin_L': ('X', -60), 'Shin_R': ('X', -52), 'Foot_L': ('X', 10), 'Foot_R': ('X', 8),
                    'SpineLower': ('X', -12), 'SpineUpper': ('X', -6), 'Neck': ('Y', 12), 'Head': (('X', -8), ('Y', 26))}),
              (48, {'Root': (('Y', -88), ('X', -8)), 'Thigh_L': ('X', 28), 'Thigh_R': ('X', 16), 'Shin_L': ('X', -60), 'Shin_R': ('X', -52), 'Foot_L': ('X', 10), 'Foot_R': ('X', 8),
                    'SpineLower': ('X', -12), 'SpineUpper': ('X', -6), 'Neck': ('Y', 12), 'Head': (('X', -8), ('Y', 26))})],
}
pk.BODY_KEYS = BODY_KEYS

# Bow pose keys: (grip position, yaw, pitch, roll in degrees, draw metres, frame of reference).
# 'chest' poses ride the chest; 'root' poses aim level along the body facing (attack).
READY = (Vector((-.08, .44, 1.13)), 0, -10, -16, 0.0)
BOW_KEYS = {
    'Idle': [(0, READY), (24, (READY[0] + Vector((0, .01, .012)), 0, -8, -12, 0.0)), (48, (READY[0] + Vector((.005, 0, -.006)), 0, -11, -18, 0.0)), (72, READY)],
    'Walk': [(0, (Vector((-.09, .48, 1.20)), 0, 16, -10, 0.0)), (18, (Vector((-.09, .48, 1.20)), 0, 16, -10, 0.0))],
    'Attack': [(0, READY),
               (5, (Vector((.12, .54, 1.32)), 0, -2, -10, .06)),
               (11, (Vector((.19, .62, 1.39)), 0, 0, -8, DRAW)),
               # The loose: the string snaps forward and the bow arm gives with the follow-through.
               (12, (Vector((.19, .40, 1.37)), 0, 2, -8, 0.0)),
               (16, (Vector((.10, .41, 1.32)), 0, -2, -10, 0.0)),
               (30, READY)],
    'Hurt': [(0, READY), (4, (Vector((-.09, .40, 1.18)), 0, -2, -22, 0.0)), (9, (Vector((-.08, .43, 1.15)), 0, -8, -18, 0.0)), (15, READY)],
}
ATTACK_ROOT = (3, 27)                  # frames where the bow aims in the root frame


def bow_rotation(yaw, pitch, roll):
    return (Matrix.Rotation(math.radians(yaw), 4, 'Z') @ Matrix.Rotation(math.radians(pitch), 4, 'X')
            @ Matrix.Rotation(math.radians(roll), 4, 'Y'))


def interp_bow(keys, frame):
    a, b, t = pk.interp_keys(keys, frame)
    if keys is BOW_KEYS['Attack'] and RELEASE_FRAME - 1 < frame <= RELEASE_FRAME:
        t = 1.0  # the loose is instantaneous: the string snaps forward within one frame
    pos = a[0].lerp(b[0], t)
    q = bow_rotation(*a[1:4]).to_quaternion().slerp(bow_rotation(*b[1:4]).to_quaternion(), t)
    return pos, q, a[4] * (1 - t) + b[4] * t


def bow_world(rig, clip, frame):
    pos, q, draw = interp_bow(BOW_KEYS[clip], frame)
    chest = pk.skin(rig, 'SpineUpper')
    local = q.to_matrix().to_4x4()
    local.translation = pos
    if clip != 'Attack':
        return chest @ local, draw
    # Aim level along the body facing; the grip rides the chest so the arm extension follows.
    level = smooth((frame - 0) / ATTACK_ROOT[0]) * (1 - smooth((frame - ATTACK_ROOT[1]) / 3))
    root = pk.skin(rig, 'Root')
    qq = chest.to_quaternion().slerp(root.to_quaternion(), level) @ q
    m = qq.to_matrix().to_4x4()
    m.translation = chest @ pos if level < 1 else root @ pos
    m.translation = (chest @ pos).lerp(root @ pos, level)
    return m, draw


def nock_offset(draw):
    m = Matrix.Identity(4)
    m.translation = Vector((0, -draw, 0))
    return m


GRIP_LOCAL = {'L': (Vector((0, 0, 0)), Vector((0, 0, 1)), GRIP_R + .0025), 'R': (Vector((0, -BRACE, NOCK_Z)), Vector((0, 0, 1)), HOOK_R)}


def calibrate_reach(bow):
    """Turn each hand about its grip axis (bow / string) until the hand's straight-wrist forearm
    line (wrist -> knuckle row of the roster_hands fist) points along WRIST_LINE in bow space."""
    rot = bow.to_3x3()
    for _ in range(3):
        hands = reference_hands(bow)
        for s in 'LR':
            c, a, radius = GRIP_LOCAL[s]
            palm = pk.palm_direction_local(s, hands[s], bow @ c, rot @ a, radius, Vector((1 if s == 'R' else -1, .15, 0)))
            palm_bow = rot.inverted() @ (hands[s].to_3x3() @ palm)
            flat = (palm_bow - a * palm_bow.dot(a)).normalized()
            want = (WRIST_LINE[s] - a * WRIST_LINE[s].dot(a)).normalized()
            angle = math.atan2(flat.cross(want).dot(a), flat.dot(want))
            REACH[s] = (Matrix.Rotation(angle, 3, a) @ REACH[s]).normalized()


def reference_hands(bow):
    rot = bow.to_3x3()
    out = {}
    grips = {'L': (Vector((0, 0, 0)), Vector((0, 0, 1))), 'R': (Vector((0, -BRACE, NOCK_Z)), Vector((0, 0, 1)))}
    for s, (c, a) in grips.items():
        grip = bow @ c
        axis = (rot @ a).normalized()
        reach = (rot @ REACH[s]).normalized()
        reach = (reach - axis * reach.dot(axis)).normalized()
        wrist = grip - reach * PALM
        y = reach
        z = axis if s == 'R' else -axis
        x = y.cross(z).normalized()
        m = Matrix((x, y, z.cross(x) if False else z)).transposed().to_4x4()
        m = Matrix((x, y, x.cross(y))).transposed().to_4x4()
        m.translation = wrist
        out[s] = m
    return out


def death_bow(rig, frame, start_local):
    """Both hands keep the bow; it is held in front of the chest through the crouch and lands
    flat beside the body, the bow arm thrown forward."""
    root = pk.skin(rig, 'Root')
    planted = bow_rotation(*READY[1:4])
    planted.translation = READY[0] + Vector((0, .06, 0))
    # Kneeling slump: the bow stands planted on its lower tip ahead of the knees.
    final = bow_rotation(0, -6, -4)
    final.translation = Vector((-.12, .80, 1.22))
    b1, b2 = smooth(frame / 7), smooth((frame - 6) / 15)
    m = start_local.copy()
    for target, w in ((planted, b1), (final, b2)):
        q = m.to_quaternion().slerp(target.to_quaternion(), w)
        t = m.translation.lerp(target.translation, w)
        m = q.to_matrix().to_4x4()
        m.translation = t
    return root @ m


DEATH_HOLD = (Vector((-.10, .54, 1.30)), 0, 12, -16, 0.0)


def death_hold(rig, frame):
    """Clutched hold for the fall: the bow is lifted up and forward off the buckling knees."""
    pos, q, _ = interp_bow([(0, READY), (8, DEATH_HOLD), (48, DEATH_HOLD)], frame)
    m = q.to_matrix().to_4x4()
    m.translation = pos
    return pk.skin(rig, 'SpineUpper') @ m


def bow_points(bow, draw):
    pts = [bow @ Vector((0, -.17 * (abs(z) / BOW_HALF) ** 1.4 + .06 * smooth((abs(z) / BOW_HALF - .8) / .2), z)) for z in (-BOW_HALF, -.4, 0, .4, BOW_HALF)]
    pts.append(bow @ Vector((0, -BRACE - draw, NOCK_Z)))
    pts.append(bow @ Vector((0, -BRACE - draw + ARROW, NOCK_Z)))
    return min(p.z for p in pts) - .02


def straight(bow, draw, side, clip):
    """Straight-wrist IK request: no roll (the bow and the arrow ride the hands); the elbow is
    aimed at the forearm line that continues the palm."""
    c, a, radius = GRIP_LOCAL[side]
    m = bow @ nock_offset(draw) if side == 'R' else bow
    return (m @ c, m.to_3x3() @ a, radius, 0, (clip, side))


FOREARM_SAMPLES = {'L': [], 'R': []}
# Frames that define the straight wrist (weight): the ready carry and the draw/loose/follow-through.
WRIST_FRAMES = {'Idle': (range(0, 73, 6), 1.0), 'Attack': (range(9, 18), 6.0), 'Walk': (range(0, 19, 6), .5), 'Hurt': (range(0, 16, 5), .5)}


def author_clips(rig, body):
    """Two passes: the first bake measures where each forearm actually points in bow space over the
    defining frames; WRIST_LINE is set to that mean and the hands are re-calibrated so the second
    bake keeps both wrists straight through the carry and the shot."""
    author_once(rig, body)
    for s_ in 'LR':
        total = Vector()
        for v, w in FOREARM_SAMPLES[s_]:
            total += v * w
        WRIST_LINE[s_] = total.normalized()
        FOREARM_SAMPLES[s_].clear()
    pk.PALM_LOCAL.clear()
    pk.ROLL_STATE.clear()
    pk.TWIST_STATE.clear()
    pk.POLE_STATE.clear()
    for clip in CLIPS:
        if clip in bpy.data.actions:
            bpy.data.actions.remove(bpy.data.actions[clip])
    return author_once(rig, body)


def author_once(rig, body):
    scene = bpy.context.scene
    scene.render.fps = FPS
    rig.animation_data_create()
    report = {'ik_residual_m': {}, 'per_frame': {}, 'death_floor_lift_m': [], 'draw_m': {}}
    pk.apply_body(rig, 'Idle', 0)
    ref_bow, _ = bow_world(rig, 'Idle', 0)
    calibrate_reach(ref_bow)
    ref = {'bow': ref_bow, 'hand': reference_hands(ref_bow)}
    bows = {}
    for clip in CLIPS:
        action = bpy.data.actions.new(clip)
        action.use_fake_user = True
        rig.animation_data.action = action
        g.set_action(rig, clip)
        worst = 0.0
        bows[clip] = {}
        start_local = None
        for frame in range(FRAMES[clip] + 1):
            scene.frame_set(frame)
            pk.apply_body(rig, clip, frame)
            if clip == 'Death':
                bow, draw = death_hold(rig, frame), 0.0
            else:
                bow, draw = bow_world(rig, clip, frame)
            targets = {'L': bow @ ref['bow'].inverted() @ ref['hand']['L'],
                       'R': bow @ nock_offset(draw) @ ref['bow'].inverted() @ ref['hand']['R']}
            res = {s: pk.solve_arm(rig, s, targets[s], POLE[s], roll=straight(bow, draw, s, clip)) for s in 'LR'}
            if clip == 'Death' and frame:
                floor = min(pk.evaluated_min_z([body]), bow_points(bow, draw))
                root = rig.pose.bones['Root']
                m = root.matrix.copy()
                m.translation.z += .010 - floor
                root.matrix = m
                bpy.context.view_layer.update()
                report['death_floor_lift_m'].append(round(.010 - floor, 4))
                bow = death_hold(rig, frame)
                targets = {'L': bow @ ref['bow'].inverted() @ ref['hand']['L'], 'R': bow @ ref['bow'].inverted() @ ref['hand']['R']}
                res = {s: pk.solve_arm(rig, s, targets[s], POLE[s], roll=straight(bow, 0.0, s, clip)) for s in 'LR'}
            worst = max(worst, *res.values())
            if clip in WRIST_FRAMES and frame in WRIST_FRAMES[clip][0]:
                for s_ in 'LR':
                    fb = rig.pose.bones['Forearm_' + s_]
                    d = (rig.matrix_world.to_3x3() @ (fb.tail - fb.head)).normalized()
                    FOREARM_SAMPLES[s_].append((bow.to_3x3().inverted() @ d, WRIST_FRAMES[clip][1]))
            report['per_frame'].setdefault(clip, []).append([frame, round(res['R'], 4), round(res['L'], 4)])
            report['draw_m'].setdefault(clip, []).append(round(draw, 3))
            bows[clip][frame] = (bow.copy(), draw)
            for pb in rig.pose.bones:
                pb.keyframe_insert('rotation_quaternion', frame=frame, group=pb.name)
                pb.keyframe_insert('location', frame=frame, group=pb.name)
        report['ik_residual_m'][clip] = round(worst, 5)
    pk.fix_quaternion_continuity()
    g.set_action(rig, 'Idle')
    scene.frame_set(0)
    return ref, bows, report


# ------------------------------------------------------------------------------------------------
# Geometry (bow-local: X right, Y shooting direction, Z bow up, origin at the grip centre)
# ------------------------------------------------------------------------------------------------
def limb_y(z):
    u = abs(z) / BOW_HALF
    return -.205 * u ** 1.45 + .055 * smooth((u - .78) / .22)


def bow_parts(detail):
    w = {'Hand_L': 1.0}
    parts = []
    n = 24 if detail == 0 else 12
    for sign in (1, -1):
        limb = g.Part('limb', 'AssemblyDetail_oak')
        rings, centers = [], []
        for k in range(n + 1):
            u = k / n
            z = sign * (.06 + (BOW_HALF - .06) * u)
            c = Vector((0, limb_y(z), z))
            centers.append(c)
            width = .025 * (1 - .55 * u) + .008
            depth = .015 * (1 - .45 * u) + .005
            rings.append(limb.ring(c, Vector((1, 0, 0)), Vector((0, 1, 0)), width, depth, 8 if detail == 0 else 6, p=2.6, weights=w))
        limb.loft(rings, centers, repeat=.18)
        parts.append(limb)
        nock = g.Part('horn_tip', 'AssemblyDetail_brass')
        zt = sign * BOW_HALF
        c0 = Vector((0, limb_y(zt), zt))
        rings = [nock.ring(c0 + Vector((0, 0, -sign * .02)), Vector((1, 0, 0)), Vector((0, 1, 0)), .009, .008, 8, weights=w),
                 nock.ring(c0 + Vector((0, 0, sign * .025)), Vector((1, 0, 0)), Vector((0, 1, 0)), .004, .004, 8, weights=w)]
        nock.loft(rings, [c0 + Vector((0, 0, -sign * .02)), c0 + Vector((0, 0, sign * .025))], repeat=.10)
        parts.append(nock)
    riser = g.Part('riser', 'AssemblyDetail_oak')
    pk.lathe(riser, [(-.075, .016), (-.07, .021), (.07, .021), (.075, .016)], 12 if detail == 0 else 8, w)
    parts.append(riser)
    grip = g.Part('grip_wrap', 'AssemblyDetail_leather')
    bands = 7 if detail == 0 else 3
    pk.lathe(grip, [(-.06 + .12 * k / (bands * 2), GRIP_R + (.0024 if k % 2 else .0012)) for k in range(bands * 2 + 1)], 12 if detail == 0 else 8, w)
    parts.append(grip)
    shelf = g.Part('arrow_shelf', 'AssemblyDetail_brass')
    pk.lathe(shelf, [(.064, .0215), (.070, .0238), (.078, .0215)], 12 if detail == 0 else 8, w)
    parts.append(shelf)
    return parts


def string_parts():
    """Two straight string runs: the tip rings ride the bow (Hand_L), the shared nock ring rides the
    drawing hand (Hand_R). Only two rings per run, so linear skinning keeps each run straight."""
    parts = []
    nock = Vector((0, -BRACE, NOCK_Z))
    for sign in (1, -1):
        s = g.Part('string', 'HempString')
        zt = sign * (BOW_HALF - .012)
        tip = Vector((0, limb_y(zt), zt))
        axis = (nock - tip).normalized()
        u = axis.orthogonal().normalized()
        v = axis.cross(u)
        rings = [s.ring(tip, u, v, .0022, .0022, 6, weights={'Hand_L': 1.0}), s.ring(nock, u, v, .0022, .0022, 6, weights={'Hand_R': 1.0})]
        s.loft(rings, [tip, nock], repeat=.10)
        parts.append(s)
    # Centre serving at the nocking point: the drawing fingers hook the string here.
    serve = g.Part('string_serving', 'AssemblyDetail_leather')
    rings, centers = [], []
    for dz, r in ((-.032, .0023), (-.026, SERVING_R), (.026, SERVING_R), (.032, .0023)):
        c = nock + Vector((0, 0, dz))
        centers.append(c)
        rings.append(serve.ring(c, Vector((1, 0, 0)), Vector((0, 1, 0)), r, r, 6, weights={'Hand_R': 1.0}))
    serve.loft(rings, centers, repeat=.06)
    parts.append(serve)
    return parts


def arrow_parts(detail):
    w = {'Hand_R': 1.0}
    parts = []
    base = Vector((-.006, -BRACE, NOCK_Z))
    seg = 8 if detail == 0 else 6

    def along(part, profile):
        rings, centers = [], []
        for y, r in profile:
            c = base + Vector((0, y, 0))
            centers.append(c)
            rings.append(part.ring(c, Vector((1, 0, 0)), Vector((0, 0, 1)), r, r, seg, weights=w))
        part.loft(rings, centers, repeat=.12)
        return part
    parts.append(along(g.Part('arrow_shaft', 'AssemblyDetail_oak'), [(.008, .0042), (.40, .0046), (ARROW - .06, .0042)]))
    parts.append(along(g.Part('arrow_nock_grip', 'AssemblyDetail_leather'), [(.012, .0052), (NOCK_GRIP - .02, ARROW_GRIP_R), (NOCK_GRIP + .02, ARROW_GRIP_R), (NOCK_GRIP + .028, .0050)]))
    parts.append(along(g.Part('arrow_nock', 'AssemblyDetail_brass'), [(-.004, .0030), (.002, .0050), (.010, .0048)]))
    head = g.Part('arrow_head', 'AssemblyDetail_steel')
    rings, centers = [], []
    for y, half_w, half_t in ((ARROW - .065, .0048, .0048), (ARROW - .045, .0125, .0028), (ARROW - .020, .0095, .0020), (ARROW, .0008, .0008)):
        c = base + Vector((0, y, 0))
        centers.append(c)
        rings.append(head.ring(c, Vector((1, 0, 0)), Vector((0, 0, 1)), half_w, half_t, 8, p=1.6, weights=w))
    head.loft(rings, centers, repeat=.10)
    parts.append(head)
    for k in range(3):
        ang = math.radians(90 + 120 * k)
        radial = Vector((math.cos(ang), 0, math.sin(ang)))
        vane = g.Part('fletch', 'TeamCloth_Fletching')
        rings, centers = [], []
        for y, height in ((.030, .002), (.050, .012), (.095, .010), (.118, .002)):
            c = base + Vector((0, y, 0)) + radial * (.0044 + height / 2)
            centers.append(c)
            rings.append(vane.ring(c, radial, Vector((1, 0, 0)).cross(radial) if abs(radial.x) < .9 else Vector((0, 0, 1)), height / 2, .0009, 6, p=4, weights=w))
        vane.loft(rings, centers, repeat=.08)
        parts.append(vane)
    return parts


QUIVER = {'center': Vector((.08, -.215, 1.30)), 'axis': Vector((.36, -.06, 1)).normalized()}


def fit_quiver(body):
    """Seat the quiver on the back: tilt it into a diagonal strap carry and slide it forward until
    its front sits 6 mm off the measured back (bind space, where the quiver is authored)."""
    from mathutils.bvhtree import BVHTree
    axis = Vector((.42, -.08, 1)).normalized()
    center = Vector((.08, -.30, 1.29))
    u = axis.cross(Vector((0, 1, 0))).normalized()
    tree = BVHTree.FromObject(body, bpy.context.evaluated_depsgraph_get())
    best = None
    for k in range(-8, 9):
        point = center + axis * (k * .025)
        for j in (-1, 0, 1):
            # Cast from behind toward the body: the first hit is the rear-most surface.
            origin = point + u * (j * .03) + Vector((0, -.5, 0))
            hit = tree.ray_cast(origin, Vector((0, 1, 0)), 1.0)
            if hit[0] is not None:
                back = hit[0].y
                radius = .050 if k > -7 else .040
                needed = back - (.010 if k > -6 else .022) - radius - point.y   # lower end clears the bending waist
                best = needed if best is None else min(best, needed)
    center.y += best
    QUIVER['center'], QUIVER['axis'] = center, axis
    return {'center': list(center), 'axis': list(axis), 'seat_gap_m': .010}


def quiver_parts(detail):
    """Back quiver in SpineUpper rest space: stitched leather tube, brass rims, a strap boss and
    five fletched arrow ends, slung diagonally (opening over the right shoulder)."""
    w = {'SpineUpper': 1.0}
    parts = []
    center, axis = QUIVER['center'], QUIVER['axis']
    u = axis.cross(Vector((0, 1, 0))).normalized()
    v = axis.cross(u).normalized()
    seg = 14 if detail == 0 else 8

    def tube(name, mat, profile):
        part = g.Part(name, mat)
        rings, centers = [], []
        for t, r in profile:
            c = center + axis * t
            centers.append(c)
            rings.append(part.ring(c, u, v, r, r * .82, seg, weights=w))
        part.loft(rings, centers, repeat=.16)
        parts.append(part)
    tube('quiver_body', 'TeamCloth_Quiver', [(-.20, .030), (-.185, .042), (.22, .050), (.26, .052)])
    tube('quiver_rim_top', 'AssemblyDetail_brass', [(.245, .0545), (.262, .0565), (.275, .0545)])
    tube('quiver_rim_base', 'AssemblyDetail_brass', [(-.195, .036), (-.18, .045), (-.165, .044)])
    for k, (du, dv, rise) in enumerate(((-.022, .008, .13), (.0, -.016, .15), (.022, .006, .12), (-.008, .020, .14), (.016, -.004, .16))):
        base = center + axis * .26 + u * du + v * dv
        shaft = g.Part('quiver_arrow', 'AssemblyDetail_oak')
        rings = [shaft.ring(base - axis * .02, u, v, .0042, .0042, 6, weights=w), shaft.ring(base + axis * rise, u, v, .0042, .0042, 6, weights=w)]
        shaft.loft(rings, [base - axis * .02, base + axis * rise], repeat=.12)
        parts.append(shaft)
        for j in range(2):
            radial = (u if j == 0 else v) * (1 if k % 2 else -1)
            vane = g.Part('quiver_fletch', 'TeamCloth_Fletching')
            rings, centers = [], []
            for t, h in ((rise - .095, .002), (rise - .075, .011), (rise - .02, .009), (rise - .004, .002)):
                c = base + axis * t + radial * (.0042 + h / 2)
                centers.append(c)
                rings.append(vane.ring(c, radial, axis.cross(radial).normalized(), h / 2, .0009, 6, p=4, weights=w))
            vane.loft(rings, centers, repeat=.08)
            parts.append(vane)
    return parts


def build(name, parts_fn, rig, place, ref_skin, mats, *args):
    parts = []
    for p in parts_fn(*args):
        p = p.transformed(place)
        g.to_bind(p, ref_skin)
        parts.append(p)
    obj = g.parts_to_object(name, parts, rig, mats)
    obj['rtsProceduralParts'] = json.dumps(sorted({p.name for p in parts}))
    obj.data.set_sharp_from_angle(angle=math.radians(60))
    return obj


def hand_report(rig, records, refs):
    """Per clip/frame offset of each closed hand's grip centre to its own grip axis."""
    scene = bpy.context.scene
    out = {}
    for rec in (r for r in records if r['lod'] == 0):
        side = rec['side']
        g.set_action(rig, 'Idle')
        scene.frame_set(0)
        ref = g.skin_matrices(rig)
        c_bind = ref['Hand_' + side].inverted() @ Vector(rec['grip'])
        a0, a1, bone = refs[side]
        p0, p1 = ref[bone].inverted() @ a0, ref[bone].inverted() @ a1
        per = {}
        for clip in CLIPS:
            g.set_action(rig, clip)
            worst = 0.0
            for frame in range(FRAMES[clip] + 1):
                scene.frame_set(frame)
                m = g.skin_matrices(rig)
                c = m['Hand_' + side] @ c_bind
                q0, q1 = m[bone] @ p0, m[bone] @ p1
                a = (q1 - q0).normalized()
                d = c - q0
                worst = max(worst, (d - a * d.dot(a)).length)
            per[clip] = round(worst, 4)
        out[side] = per
    g.set_action(rig, 'Idle')
    scene.frame_set(0)
    return out


def main():
    args = argparse.ArgumentParser()
    args.add_argument('--run', type=Path, required=True)
    opt = args.parse_args(sys.argv[sys.argv.index('--') + 1:])
    run = opt.run.resolve()
    qa, raw = run / 'qa', run / 'raw'
    for d in (qa, raw, run / 'candidate'):
        d.mkdir(parents=True, exist_ok=True)
    prep = run / 'prep/candidate'
    body, foot_half, source = pk.load_body(run)
    marks = landmarks(foot_half)
    pk.save(qa / 'landmarks.json', {'source': source, 'landmarks': marks, 'runtime_publish_allowed': False})
    body_mat = material('TeamClothMasked_' + UNIT, (1, 1, 1), .05, .62, prep / 'body-1024-q90.jpg')
    mask_uri = 'data:image/png;base64,' + base64.b64encode((prep / 'team-mask-1024.png').read_bytes()).decode('ascii')
    assert len(mask_uri) <= 3000000
    body_mat['teamTintMask'] = mask_uri
    body.data.materials.clear()
    body.data.materials.append(body_mat)
    for poly in body.data.polygons:
        poly.material_index = 0
        poly.use_smooth = True
    body.name = UNIT + 'OriginalBody_LOD0'
    decimate(body, 13400)
    rig = pk.build_armature(marks)
    bind_auto(body, rig)
    arm_changes = {s: g.reweight_arm_chain(body, rig, s) for s in 'LR'}
    skirt = pk.tabard_skirt_weights(body, rig)
    smoothed = pk.spatial_smooth_weights(body, lambda c: .08 < abs(c.x) < .36 and 1.05 < c.z < 1.50)
    repaired = fill_sparse_auto_weights(body, rig)
    pk.limit_normalize(body)
    wr = {s: g.wrist_radius_of([body], rig, s) for s in 'LR'}
    quiver_fit = fit_quiver(body)
    cuts = {s: pk.trim_wrist(body, rig, s) for s in 'LR'}
    pk.limit_normalize(body)
    mats = {}
    for kind in ('leather', 'steel', 'oak', 'brass'):
        m = surface(kind)
        m.name = 'AssemblyDetail_' + kind
        mats[m.name] = m
    mats['TeamCloth_Fletching'] = material('TeamCloth_Fletching', (.93, .91, .86), 0, .8)
    mats['HempString'] = material('HempString', (.72, .64, .48), 0, .7)
    mats['TeamCloth_Quiver'] = material('TeamCloth_Quiver', (.80, .78, .74), 0, .78)
    g.CLIPS = CLIPS
    ref, bows, motion = author_clips(rig, body)
    g.set_action(rig, 'Idle')
    bpy.context.scene.frame_set(0)
    ref_skin = g.skin_matrices(rig)
    ref_bow = bows['Idle'][0][0]
    rot = ref_bow.to_3x3()
    grips = {'L': (ref_bow @ Vector((0, 0, 0)), rot @ Vector((0, 0, 1)), GRIP_R + .0025),
             'R': (ref_bow @ Vector((0, -BRACE, NOCK_Z)), rot @ Vector((0, 0, 1)), HOOK_R)}
    records, hands = [], {}
    for side in 'LR':
        center, axis, radius = grips[side]
        wrist = ref_skin['Forearm_' + side] @ rig.data.bones['Forearm_' + side].tail_local
        obj, rec = closed_hand(f'AssemblyHand_{side}_LOD0', rig, side, center, axis.normalized(), radius, wrist,
                               min(.050, max(.036, wr[side])), 0, ref_skin, mats, False, split=FINGER_SPLIT if side == 'R' else 0.0, hook=side == 'R')
        rec['cut'] = cuts[side]
        records.append(rec)
        hands[side] = obj
    objs = {0: [body, *hands.values()]}
    for lod in (0, 1):
        bow = build(f'RangerLongbow_LOD{lod}', bow_parts, rig, ref_bow, ref_skin, mats, lod)
        string = build(f'RangerBowString_LOD{lod}', string_parts, rig, ref_bow, ref_skin, mats)
        arrow = build(f'RangerArrow_LOD{lod}', arrow_parts, rig, ref_bow, ref_skin, mats, lod)
        # The quiver is authored in rest space and rides the chest (SpineUpper skin at the reference).
        quiver = build(f'RangerQuiver_LOD{lod}', quiver_parts, rig, ref_skin['SpineUpper'], ref_skin, mats, lod)
        if lod == 0:
            objs[0] += [bow, string, arrow, quiver]
            weapons0 = {'bow': bow, 'string': string, 'arrow': arrow, 'quiver': quiver}
        else:
            objs[1] = [bow, string, arrow, quiver]
    body1 = body.copy()
    body1.data = body.data.copy()
    bpy.context.collection.objects.link(body1)
    body1.name = UNIT + 'OriginalBody_LOD1'
    hands1 = []
    for side in 'LR':
        copy, _ = lod1_hand(f'AssemblyHand_{side}_LOD0')
        hands1.append(copy)
        rec = dict(next(r for r in records if r['side'] == side))
        rec['lod'] = 1
        records.append(rec)
    budget = pk.protected_lod_budget(body1, [*hands1, *objs[1]])
    pk.limit_normalize(body1)
    objs[1] = [body1, *hands1, *objs[1]]
    counts = {f'lod{l}': {o.name: g.tri_count(o) for o in v} for l, v in objs.items()}
    totals = {l: sum(v.values()) for l, v in counts.items()}
    assert totals['lod0'] <= 19900 and 7000 <= totals['lod1'] <= 9900, totals
    weights = {o.name: weight_metrics(o) for v in objs.values() for o in v}
    assert not any(w['unweighted'] or w['max_influences'] > 4 or w['max_weight_sum_error'] > .01 for w in weights.values()), weights
    lifts = g.lift_sinking_frames(rig, objs[0], clips=('Idle', 'Walk', 'Attack', 'Hurt'))
    ground = g.ground_report(rig, objs[0])
    ground1 = g.ground_report(rig, objs[1])
    arrow_axis = (ref_bow @ Vector((0, -BRACE, NOCK_Z - .05)), ref_bow @ Vector((0, -BRACE, NOCK_Z + .05)))   # served string
    grip_axes = {'L': (ref_bow @ Vector((0, 0, -.05)), ref_bow @ Vector((0, 0, .05)), 'Hand_L'), 'R': (*arrow_axis, 'Hand_R')}
    grip_offsets = hand_report(rig, records, grip_axes)
    crossings = {k: pk.source_crossings(rig, body, v) for k, v in weapons0.items()}
    bounds = g.conservative_bounds(objs[0] + objs[1], rig)
    for o in objs[0] + objs[1]:
        o['rtsConservativeBounds'] = bounds[o.name]
    motion_meta = {'version': 1, 'locomotion': {'clip': 'Walk', 'strideMeters': STRIDE, 'cycleSeconds': FRAMES['Walk'] / FPS},
                   'attack': {'clip': 'Attack', 'durationSeconds': FRAMES['Attack'] / FPS, 'contactSeconds': RELEASE_FRAME / FPS}}
    bpy.context.scene['rtsMotion'] = motion_meta
    setup_render_scene(HEIGHT + .6)
    scene = bpy.context.scene
    scene.world.color = (.45, .45, .45)
    renders = {}
    for o in objs[1]:
        o.hide_render = True
    cam = Vector((0, .25, 1.1))
    for clip in CLIPS:
        g.set_action(rig, clip)
        n = FRAMES[clip]
        for frame in sorted({0, n // 4, n // 2, (3 * n) // 4, n} | ({RELEASE_FRAME - 1, RELEASE_FRAME} if clip == 'Attack' else set())):
            scene.frame_set(frame)
            renders[f'{clip}-{frame}'] = render_view(f'{clip}{frame}', cam + Vector((4.4, 4.4, 3.3)), cam, 3.2, 360, 420, qa / f'blender/{clip.lower()}-{frame:02d}.png')
    g.set_action(rig, 'Attack')
    scene.frame_set(RELEASE_FRAME - 1)
    renders['attack-draw-side'] = render_view('drawside', cam + Vector((6, 0, 0)), cam, 2.6, 520, 520, qa / 'blender/attack-draw-side.png')
    renders['attack-draw-top'] = render_view('drawtop', cam + Vector((0, .001, 6)), cam, 2.6, 520, 520, qa / 'blender/attack-draw-top.png')
    g.set_action(rig, 'Idle')
    scene.frame_set(0)
    for view, loc in (('front', Vector((0, 6, 0))), ('side', Vector((6, 0, 0))), ('back', Vector((0, -6, 0)))):
        renders[view] = render_view(view, cam + loc, cam, 2.8, 560, 760, qa / f'blender/{view}.png')
    for o in objs[0] + objs[1]:
        o.hide_render = o in objs[1]
    blend = raw / f'{UNIT}-assembly.blend'
    bpy.ops.wm.save_as_mainfile(filepath=str(blend))
    for o in objs[0] + objs[1]:
        bm = bmesh.new()
        bm.from_mesh(o.data)
        bmesh.ops.triangulate(bm, faces=list(bm.faces))
        bm.to_mesh(o.data)
        bm.free()
    exports = {}
    for lod, v in objs.items():
        bpy.ops.object.select_all(action='DESELECT')
        for o in [rig, *v]:
            o.hide_set(False)
            o.select_set(True)
        bpy.context.view_layer.objects.active = rig
        path = raw / f'{UNIT}-edited-lod{lod}.glb'
        bpy.ops.export_scene.gltf(filepath=str(path), export_format='GLB', use_selection=True, export_animations=True,
                                  export_animation_mode='ACTIONS', export_nla_strips=False, export_force_sampling=True,
                                  export_optimize_animation_size=False, export_skins=True, export_extras=True, export_yup=True,
                                  export_tangents=True, export_image_format='JPEG', export_jpeg_quality=90, export_def_bones=False)
        exports[f'lod{lod}'] = {'path': path.as_posix(), 'sha256': pk.sha(path), 'bytes': path.stat().st_size}
    report = {'unit': UNIT, 'source': source, 'fps': FPS, 'frames': FRAMES, 'contact_frame': RELEASE_FRAME, 'contact_seconds': RELEASE_FRAME / FPS,
              'rtsMotion': motion_meta, 'bones': list(rig.data.bones.keys()), 'clips': list(CLIPS),
              'arm_chain_reweighted_vertices': arm_changes, 'tabard_skirt_vertices': skirt, 'shoulder_smoothed_vertices': smoothed,
              'repaired_sparse_weights': len(repaired), 'quiver_fit': quiver_fit, 'wrist_radius_m': wr, 'hands': records, 'triangles': counts, 'totals': totals,
              'lod1_budget': budget, 'weights': weights, 'motion': motion, 'root_lift': lifts, 'ground': {'lod0': ground, 'lod1': ground1},
              'grip_axis_offset': grip_offsets, 'source_crossings_by_part': crossings,
              'source_crossings': {c: sorted({f for part in crossings.values() for f, _ in part[c]}) for c in CLIPS},
              'bounds': bounds, 'renders': renders, 'blend': {'path': blend.as_posix(), 'sha256': pk.sha(blend)}, 'exports': exports,
              'runtime_publish_allowed': False}
    pk.save(qa / 'build.json', report)
    print('ROSTER_RANGER=' + json.dumps({'totals': totals, 'ik': motion['ik_residual_m'], 'grips': grip_offsets,
                                         'crossings': {k: {c: len(v[c]) for c in CLIPS} for k, v in crossings.items()}, 'ground': ground}), flush=True)


if __name__ == '__main__':
    main()
