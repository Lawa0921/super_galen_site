"""Original 長槍兵 (pikeman) production build: generated body, guard 20-bone rig, two-handed pike.

Blender 5.2 background:
  blender --background --factory-startup --python-exit-code 1 --python roster_pikeman_build.py -- --run <run> [--stage preview|production]

Inputs come only from the run folder (generated front/back references -> TripoSR body ->
projected albedo -> team-mask prep). The pike, closed hands and every clip are authored here
from code primitives; no existing unit geometry is reused. Writes only inside the run folder.
"""
import argparse
import base64
import hashlib
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
from human_units_build import (active, bind_auto, decimate, fill_sparse_auto_weights, material,  # noqa: E402
                               remove_tiny_islands, setup_render_scene, triangles, weight_metrics)
from human_units_spec import BONE_NAMES  # noqa: E402
from commander_assembly_build import surface  # noqa: E402
from roster_hands import build_hand  # noqa: E402


_HAND_ARGS = {}


def closed_hand(name, rig, side, center, axis, radius, wrist, wrist_radius, lod, ref, mats, steel=False):
    """Three-phalanx closed hand (roster_hands.py); the material key may be remapped (bare skin)."""
    _HAND_ARGS[name] = (rig, side, center, axis, radius, wrist, wrist_radius, ref, mats)
    return build_hand(name, rig, side, center, axis, radius, wrist, wrist_radius, ref, mats, 'AssemblyDetail_leather', detail=lod)


def lod1_hand(name0):
    """The same grip rebuilt at the lighter LOD1 detail (identical wrap, fewer segments)."""
    rig, side, center, axis, radius, wrist, wrist_radius, ref, mats = _HAND_ARGS[name0]
    obj, rec = build_hand(name0.replace('LOD0', 'LOD1'), rig, side, center, axis, radius, wrist, wrist_radius, ref, mats, 'AssemblyDetail_leather', detail=1)
    return obj, rec
from neural_blender_qa import render_view  # noqa: E402

UNIT = 'pikeman'
HEIGHT = 1.84
FPS = 30
CLIPS = ('Idle', 'Walk', 'Attack', 'Hurt', 'Death')
FRAMES = {'Idle': 72, 'Walk': 20, 'Attack': 36, 'Hurt': 15, 'Death': 48}
CONTACT_FRAME = 16
# Pike: ash shaft along local +Z from the butt (z=0) to the blade tip.
PIKE_LENGTH = 2.60
GRIP = {'R': 0.96, 'L': 1.27}          # rear (lower) and front (upper) hand stations on the shaft
GRIP_MID = (GRIP['R'] + GRIP['L']) / 2
SHAFT_RADIUS = 0.0205
PALM_OFFSET = 0.095                    # wrist -> shaft centre, as the published closed hands
# Wrist -> shaft direction in pike-local space at the reference carry (local Y faces forward).
REACH_LOCAL = {'R': Vector((-.80, .60, 0)).normalized(), 'L': Vector((.88, .47, 0)).normalized()}
DEATH_POLE_R = Vector((-.05, -.30, -.10))   # elbow inboard/up so the sleeve stays off the lying shaft
ELBOW_POLE = {'R': Vector((.30, -.12, -.30)), 'L': Vector((-.30, -.02, -.30))}


def sha(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def save(path, data):
    Path(path).parent.mkdir(parents=True, exist_ok=True)
    Path(path).write_text(json.dumps(data, indent=2, ensure_ascii=False) + '\n', encoding='utf-8', newline='\n')


def smooth(x):
    x = max(0.0, min(1.0, x))
    return x * x * (3 - 2 * x)


# ------------------------------------------------------------------------------------------------
# Rig: the published guard/crossbow/priest 20-bone hierarchy, joints fitted to this body.
# ------------------------------------------------------------------------------------------------
def landmarks(foot_half):
    h = HEIGHT
    bones = {
        'Root': ((0, 0, 0), (0, 0, .12 * h), None),
        'Pelvis': ((0, 0, .12 * h), (0, 0, .45 * h), 'Root'),
        'SpineLower': ((0, 0, .45 * h), (0, 0, .62 * h), 'Pelvis'),
        'SpineUpper': ((0, 0, .62 * h), (0, 0, .77 * h), 'SpineLower'),
        'Neck': ((0, 0, .77 * h), (0, 0, .87 * h), 'SpineUpper'),
        'Head': ((0, 0, .87 * h), (0, 0, .99 * h), 'Neck'),
    }
    # Arm joints measured from the generated body's sleeve centreline (qa/landmarks.json).
    arm = {'shoulder': (.090, -.020, 1.452), 'upper': (.196, -.022, 1.418), 'elbow': (.296, -.030, 1.172),
           'wrist': (.360, .030, .945), 'tip': (.402, .052, .800)}
    for side, sign in (('L', -1), ('R', 1)):
        p = {k: (sign * v[0], v[1], v[2]) for k, v in arm.items()}
        bones[f'Shoulder_{side}'] = (p['shoulder'], p['upper'], 'SpineUpper')
        bones[f'UpperArm_{side}'] = (p['upper'], p['elbow'], f'Shoulder_{side}')
        bones[f'Forearm_{side}'] = (p['elbow'], p['wrist'], f'UpperArm_{side}')
        bones[f'Hand_{side}'] = (p['wrist'], p['tip'], f'Forearm_{side}')
        hip = (sign * foot_half * .80, 0, .445 * h)
        knee = (sign * foot_half, 0, .272 * h)
        ankle = (sign * foot_half * 1.03, 0, .062 * h)
        toe = (sign * foot_half * 1.03, .10 * h, .032 * h)
        bones[f'Thigh_{side}'] = (hip, knee, 'Pelvis')
        bones[f'Shin_{side}'] = (knee, ankle, f'Thigh_{side}')
        bones[f'Foot_{side}'] = (ankle, toe, f'Shin_{side}')
    return {'height_m': h, 'foot_half_spacing_m': foot_half, 'bones': bones, 'arm_fit': arm}


def build_armature(marks):
    data = bpy.data.armatures.new(UNIT + '20BoneData')
    rig = bpy.data.objects.new(UNIT + 'Rig20', data)
    bpy.context.collection.objects.link(rig)
    active(rig)
    bpy.ops.object.mode_set(mode='EDIT')
    for name in BONE_NAMES:
        head, tail, parent = marks['bones'][name]
        bone = data.edit_bones.new(name)
        bone.head, bone.tail = head, tail
        if parent:
            bone.parent = data.edit_bones[parent]
            bone.use_connect = False
    bpy.ops.object.mode_set(mode='OBJECT')
    for pb in rig.pose.bones:
        pb.rotation_mode = 'QUATERNION'
    return rig


def load_body(run):
    blend = run / 'body/projected/candidate/guard-neural-v3.blend'
    bpy.ops.wm.open_mainfile(filepath=str(blend))
    meshes = [o for o in bpy.data.objects if o.type == 'MESH']
    assert len(meshes) == 1, 'expected one projected body'
    body = meshes[0]
    for obj in list(bpy.data.objects):
        if obj != body:
            bpy.data.objects.remove(obj, do_unlink=True)
    active(body)
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    cleanup = remove_tiny_islands(body)
    lo = [min(v.co[i] for v in body.data.vertices) for i in range(3)]
    hi = [max(v.co[i] for v in body.data.vertices) for i in range(3)]
    scale = HEIGHT / (hi[2] - lo[2])
    cx, cy = (lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2
    for v in body.data.vertices:
        x, y, z = tuple(v.co)
        v.co = (-(y - cy) * scale, (x - cx) * scale, (z - lo[2]) * scale)
    body.data.update()
    low = sorted(abs(v.co.x) for v in body.data.vertices if v.co.z < HEIGHT * .17 and abs(v.co.x) > HEIGHT * .018)
    foot_half = low[len(low) // 2]
    record = {'source_blend': blend.as_posix(), 'source_blend_sha256': sha(blend), 'scale': scale, 'cleanup': cleanup,
              'source_to_blender': 'source +X forward, +Z up -> Blender +Y forward, +Z up; recentered and grounded'}
    return body, foot_half, record


# ------------------------------------------------------------------------------------------------
# Weights: auto weights, clean arm chains (published gauntlet tool), continuous tabard skirt.
# ------------------------------------------------------------------------------------------------
def tabard_skirt_weights(body, rig):
    """Cloth that hangs between/over the thighs follows a continuous pelvis-to-leg blend so the
    knee-length tabard and gambeson hem never split into two leg flaps."""
    b = rig.data.bones
    legs = {s: (b['Thigh_' + s].head_local, b['Thigh_' + s].tail_local) for s in 'LR'}
    groups = {n: body.vertex_groups.get(n) or body.vertex_groups.new(name=n) for n in ('Pelvis', 'Thigh_L', 'Thigh_R')}
    changed = 0
    for v in body.data.vertices:
        z = v.co.z
        if not (.50 < z < .90):
            continue
        dist = {s: g.segment_param(v.co, *legs[s])[1] for s in 'LR'}
        near = min(dist.values())
        cloth = smooth((near - .085) / .035) * (1 - smooth((z - .84) / .05)) * smooth((z - .50) / .04)
        if cloth <= 0:
            continue
        bias = .5 + .5 * math.tanh(v.co.x / (.12 * HEIGHT))
        leg_share = min(.40, max(.18, .46 - .38 * z / HEIGHT))
        target = {'Pelvis': 1 - leg_share, 'Thigh_L': leg_share * (1 - bias), 'Thigh_R': leg_share * bias}
        old = {body.vertex_groups[w.group].name: w.weight for w in v.groups}
        total = sum(old.values()) or 1
        new = {n: w / total * (1 - cloth) for n, w in old.items()}
        for n, w in target.items():
            new[n] = new.get(n, 0) + w * cloth
        best = sorted(new.items(), key=lambda kv: kv[1], reverse=True)[:4]
        norm = sum(w for _, w in best) or 1
        for w in list(v.groups):
            body.vertex_groups[w.group].remove([v.index])
        for n, w in best:
            if w > 1e-5:
                (groups.get(n) or body.vertex_groups.get(n) or body.vertex_groups.new(name=n)).add([v.index], w / norm, 'REPLACE')
        changed += 1
    return changed


def spatial_smooth_weights(body, region, radius=.035, iterations=3, blend=.6):
    """Average skin weights with spatial neighbours (not mesh connectivity): TripoSR shells have
    disconnected plates, and the arm-chain membership leaves steps at the armpit and elbow."""
    from mathutils.kdtree import KDTree
    verts = body.data.vertices
    tree = KDTree(len(verts))
    for v in verts:
        tree.insert(v.co, v.index)
    tree.balance()
    names = [grp.name for grp in body.vertex_groups]
    chosen = [v.index for v in verts if region(v.co)]
    for _ in range(iterations):
        current = {i: {names[w.group]: w.weight for w in verts[i].groups} for i in range(len(verts))}
        for i in chosen:
            acc, total = {}, 0.0
            for co, j, dist in tree.find_range(verts[i].co, radius):
                k = 1 - dist / radius
                total += k
                for n, w in current[j].items():
                    acc[n] = acc.get(n, 0) + w * k
            mixed = {n: current[i].get(n, 0) * (1 - blend) + acc.get(n, 0) / total * blend for n in set(acc) | set(current[i])}
            best = sorted(mixed.items(), key=lambda kv: kv[1], reverse=True)[:4]
            norm = sum(w for _, w in best) or 1
            for w in list(verts[i].groups):
                body.vertex_groups[w.group].remove([i])
            for n, w in best:
                if w > 1e-5:
                    body.vertex_groups[n].add([i], w / norm, 'REPLACE')
    return len(chosen)


def limit_normalize(obj):
    active(obj)
    bpy.ops.object.vertex_group_limit_total(limit=4)
    bpy.ops.object.vertex_group_normalize_all(lock_active=False)


# ------------------------------------------------------------------------------------------------
# Motion authoring
# ------------------------------------------------------------------------------------------------
BODY_KEYS = {
    'Idle': [(0, {'SpineUpper': ('X', .6)}), (36, {'$root_z': .008, 'SpineUpper': ('X', -.6)}), (72, {'SpineUpper': ('X', .6)})],
    'Walk': [
        (0, {'Thigh_L': ('X', 22), 'Thigh_R': ('X', -22), 'Shin_R': ('X', 16), 'SpineLower': ('Z', 2)}),
        (5, {'$root_z': .022, 'Thigh_L': ('X', 3), 'Thigh_R': ('X', -3), 'Shin_L': ('X', 12), 'Shin_R': ('X', 8)}),
        (10, {'Thigh_L': ('X', -22), 'Thigh_R': ('X', 22), 'Shin_L': ('X', 16), 'SpineLower': ('Z', -2)}),
        (15, {'$root_z': .022, 'Thigh_L': ('X', -3), 'Thigh_R': ('X', 3), 'Shin_L': ('X', 8), 'Shin_R': ('X', 12)}),
        (20, {'Thigh_L': ('X', 22), 'Thigh_R': ('X', -22), 'Shin_R': ('X', 16), 'SpineLower': ('Z', 2)}),
    ],
    'Attack': [
        (0, {}),
        (3, {'SpineLower': ('Z', -4), 'SpineUpper': ('Z', -9)}),
        (8, {'SpineLower': (('X', 3), ('Z', -6)), 'SpineUpper': (('X', 5), ('Z', -10)), 'Thigh_L': ('X', 6), 'Thigh_R': ('X', -4), 'Shin_R': ('X', 5)}),
        (16, {'$root_z': -.055, '$root_y': .15, 'SpineLower': (('X', -10), ('Z', -11)), 'SpineUpper': (('X', -12), ('Z', -20)),
              'Thigh_L': ('X', 34), 'Shin_L': ('X', -32), 'Thigh_R': ('X', -24), 'Shin_R': ('X', 8), 'Foot_L': ('X', -4)}),
        (24, {'$root_z': -.02, '$root_y': .06, 'SpineLower': (('X', -3), ('Z', -6)), 'SpineUpper': (('X', -4), ('Z', -10)), 'Thigh_L': ('X', 16), 'Shin_L': ('X', -14), 'Thigh_R': ('X', -10)}),
        (32, {'SpineLower': ('Z', -3), 'SpineUpper': ('Z', -7)}),
        (36, {}),
    ],
    'Hurt': [(0, {}), (4, {'$root_y': -.07, '$root_z': -.015, 'SpineLower': ('X', 14), 'SpineUpper': (('X', 20), ('Z', 6)), 'Head': (('X', -16), ('Z', 10)),
                          'Thigh_R': ('X', -10), 'Shin_R': ('X', 10), 'Thigh_L': ('X', 6)}),
             (9, {'$root_y': -.03, 'SpineLower': ('X', 5), 'SpineUpper': ('X', 8), 'Head': ('X', -5), 'Thigh_R': ('X', -4)}), (15, {})],
    # Knees give way first (the floor solve keeps the lowest point on the ground, so the knees reach
    # it), the torso folds, then the body pitches forward from the knees and settles face down.
    'Death': [(0, {}),
              (6, {'Thigh_L': ('X', 30), 'Thigh_R': ('X', 22), 'Shin_L': ('X', -52), 'Shin_R': ('X', -44),
                   'SpineLower': ('X', -10), 'SpineUpper': ('X', 12), 'Head': ('X', -12), 'UpperArm_L': ('X', -6)}),
              (12, {'Thigh_L': ('X', 62), 'Thigh_R': ('X', 54), 'Shin_L': ('X', -96), 'Shin_R': ('X', -90), 'Foot_L': ('X', 30), 'Foot_R': ('X', 26),
                    'SpineLower': ('X', -18), 'SpineUpper': ('X', -8), 'Head': ('X', -16), 'UpperArm_L': (('X', -10), ('Y', -10))}),
              (20, {'Root': ('X', -38), 'Thigh_L': ('X', 52), 'Thigh_R': ('X', 46), 'Shin_L': ('X', -84), 'Shin_R': ('X', -78), 'Foot_L': ('X', 20), 'Foot_R': ('X', 18),
                    'SpineLower': ('X', -20), 'SpineUpper': ('X', -10), 'Head': ('X', -14), 'UpperArm_L': (('X', -14), ('Y', -16))}),
              (29, {'Root': ('X', -84), 'Thigh_L': ('X', 14), 'Thigh_R': ('X', 8), 'Shin_L': ('X', -22), 'Shin_R': ('X', -12),
                    'SpineLower': ('X', -6), 'SpineUpper': ('X', -3), 'Head': (('X', -12), ('Y', 28)), 'UpperArm_L': (('X', -6), ('Y', -24))}),
              (34, {'Root': ('X', -87), 'Thigh_L': ('X', 8), 'Thigh_R': ('X', 3), 'Shin_L': ('X', -14), 'Shin_R': ('X', -6),
                    'SpineLower': ('X', -4), 'SpineUpper': ('X', -2), 'Head': (('X', -10), ('Y', 30)), 'UpperArm_L': (('X', -6), ('Y', -22))}),
              (48, {'Root': ('X', -87), 'Thigh_L': ('X', 8), 'Thigh_R': ('X', 3), 'Shin_L': ('X', -14), 'Shin_R': ('X', -6),
                    'SpineLower': ('X', -4), 'SpineUpper': ('X', -2), 'Head': (('X', -10), ('Y', 30)), 'UpperArm_L': (('X', -6), ('Y', -22))})],
}

# Pike carry in the rest-space chest frame: (grip midpoint, butt->tip axis, extra roll about the axis).
CARRY = (Vector((.15, .28, 1.18)), Vector((0, 0, 1)))
PIKE_KEYS = {
    'Idle': [(0, CARRY), (72, CARRY)],
    # On the march the butt is carried ahead of the striding feet and the blade leans back.
    'Walk': [(0, (CARRY[0] + Vector((0, .02, .12)), Vector((0, -.15, .99)))), (20, (CARRY[0] + Vector((0, .02, .12)), Vector((0, -.15, .99))))],
    'Attack': [(0, CARRY),
               # The pike lifts clear of the right foot, steps out beside the leg, then the butt
               # swings back outside the hip; the thrust is delivered at hip level across the centre.
               (3, (Vector((.22, .30, 1.30)), Vector((-.03, .05, 1)))),
               (6, (Vector((.21, .16, 1.20)), Vector((-.18, .70, .69)))),
               (9, (Vector((.24, -.03, 1.14)), Vector((-.20, .978, -.04)))),
               (16, (Vector((.18, .33, 1.22)), Vector((-.15, .988, .01)))),
               (24, (Vector((.22, .08, 1.16)), Vector((-.15, .95, .25)))),
               (30, (Vector((.20, .20, 1.20)), Vector((-.15, .45, .88)))),
               (33, (Vector((.20, .28, 1.30)), Vector((-.05, .05, 1)))),
               (36, CARRY)],
    'Hurt': [(0, CARRY), (4, (CARRY[0] + Vector((.02, -.06, .02)), Vector((.05, -.20, 1)))), (9, (CARRY[0] + Vector((0, -.02, 0)), Vector((0, -.06, 1)))), (15, CARRY)],
}


def interp_keys(keys, frame):
    for (f0, a), (f1, b) in zip(keys, keys[1:]):
        if f0 <= frame <= f1:
            return a, b, smooth((frame - f0) / max(1, f1 - f0))
    return keys[-1][1], keys[-1][1], 0.0


def body_state(clip, frame):
    """Smoothstep blend of the authored body key states (degrees about world axes in bind space)."""
    a, b, t = interp_keys(BODY_KEYS[clip], frame)
    names = set(a) | set(b)
    out = {}
    for name in names:
        if name.startswith('$'):
            out[name] = a.get(name, 0) * (1 - t) + b.get(name, 0) * t
            continue
        def turns(v):
            return v if v and isinstance(v[0], tuple) else ((v,) if v else ())
        qa, qb = Quaternion(), Quaternion()
        for state, q in ((a, 'a'), (b, 'b')):
            rot = Quaternion()
            for axis, deg in turns(state.get(name)):
                rot = rot @ Quaternion({'X': Vector((1, 0, 0)), 'Y': Vector((0, 1, 0)), 'Z': Vector((0, 0, 1))}[axis], math.radians(deg))
            if q == 'a':
                qa = rot
            else:
                qb = rot
        out[name] = qa.slerp(qb, t)
    return out


def apply_body(rig, clip, frame):
    state = body_state(clip, frame)
    for pb in rig.pose.bones:
        pb.rotation_quaternion = Quaternion()
        pb.location = (0, 0, 0)
    for name, value in state.items():
        if name in ('$root_z', '$root_y'):
            root = rig.pose.bones['Root']
            axis = Vector((0, 0, 1)) if name == '$root_z' else Vector((0, 1, 0))
            root.location = Vector(root.location) + (root.bone.matrix_local.to_3x3().inverted() @ axis) * value
            continue
        if name.startswith('$'):
            continue  # other scalar channels (e.g. '$pelvis_z') are applied by the unit build
        pb = rig.pose.bones[name]
        rest = pb.bone.matrix_local.to_3x3()
        pb.rotation_quaternion = (rest.inverted() @ value.to_matrix() @ rest).to_quaternion()
    bpy.context.view_layer.update()


def skin(rig, name):
    pb = rig.pose.bones[name]
    return rig.matrix_world @ pb.matrix @ pb.bone.matrix_local.inverted()


def pike_matrix(grip_mid, axis, reference=None):
    """World matrix of the pike (local +Z = axis, origin at the butt). Roll is the minimal rotation
    from the reference carry orientation, which keeps the blade flat and continuous."""
    axis = axis.normalized()
    base = Matrix.Identity(3) if reference is None else reference
    current = base @ Vector((0, 0, 1))
    rot = current.rotation_difference(axis).to_matrix() @ base
    m = rot.to_4x4()
    m.translation = grip_mid - axis * GRIP_MID
    return m


def chest_pike(rig, clip, frame):
    a, b, t = interp_keys(PIKE_KEYS[clip], frame)
    grip = a[0].lerp(b[0], t)
    axis = a[1].normalized().slerp(b[1].normalized(), t) if hasattr(Vector, 'slerp') else a[1].lerp(b[1], t)
    chest = skin(rig, 'SpineUpper')
    local = pike_matrix(grip, axis.normalized())
    if clip != 'Attack':
        return chest @ local
    # Thrust aims level: position follows the lunging chest, orientation follows the root.
    level = math.sin(math.pi * min(1, frame / FRAMES['Attack'])) ** .5
    q = chest.to_quaternion().slerp(skin(rig, 'Root').to_quaternion(), level)
    m = q.to_matrix().to_4x4() @ local
    # Anchor the grip midpoint (not the butt) to the lunging chest.
    m.translation = chest @ grip - (m.to_3x3() @ Vector((0, 0, 1))) * GRIP_MID
    return m


ROLL_LIMIT = {'R': 180, 'L': 180}   # deg; the round, furled pike may roll about its own axis with the right hand


def pike_roll(pike, side, clip):
    return (pike @ Vector((0, 0, GRIP[side])), pike.to_3x3() @ Vector((0, 0, 1)), SHAFT_RADIUS + .003, ROLL_LIMIT[side], (clip, side))


def hand_targets(pike, ref):
    """Hand bone world matrices rigidly bound to the pike (relative pose captured at the reference)."""
    return {s: pike @ ref['pike'].inverted() @ ref['hand'][s] for s in 'LR'}


def reference_hands(pike):
    """At the reference carry: wrist = grip station - reach * palm offset; hand bone points at the shaft."""
    out = {}
    rot = pike.to_3x3()
    axis = rot @ Vector((0, 0, 1))
    for s in 'LR':
        grip = pike @ Vector((0, 0, GRIP[s]))
        reach = (rot @ REACH_LOCAL[s]).normalized()
        wrist = grip - reach * PALM_OFFSET
        y = reach
        z = (axis - y * axis.dot(y)).normalized()
        if s == 'L':
            z = -z
        x = y.cross(z).normalized()
        m = Matrix((x, y, z)).transposed().to_4x4()
        m.translation = wrist
        out[s] = m
    return out


def set_bone_world(rig, name, matrix):
    pb = rig.pose.bones[name]
    pb.matrix = rig.matrix_world.inverted() @ matrix
    bpy.context.view_layer.update()


ROLL_STATE = {}
TWIST_STATE = {}
POLE_STATE = {}


def forearm_quat(pb, direction, twist_hint, share):
    """The forearm orientation solve_arm's aim() produces (rest roll + shared hand twist)."""
    rest = pb.bone.matrix_local.to_3x3()
    direction = direction.normalized()
    q = (rest @ Vector((0, 1, 0))).rotation_difference(direction) @ rest.to_quaternion()
    x = twist_hint - direction * twist_hint.dot(direction)
    if x.length > 1e-6:
        x.normalize()
        aligned = Matrix((x, direction, x.cross(direction))).transposed().to_quaternion()
        if aligned.dot(q) < 0:
            aligned = -aligned
        q = q.slerp(aligned, share)
    return q


PALM_LOCAL = {}   # side -> straight-wrist forearm direction (wrist -> knuckles) in the hand-bone frame


def palm_direction_local(side, hand_world, grip, axis, radius, outward):
    """Forearm direction that keeps the wrist straight for the closed hand built on this grip: the
    line from the wrist to the knuckle row (roster_hands canonical +Y), in hand-bone coordinates."""
    cfg = dict(g.GAUNTLET_DEFAULTS)
    cfg.update(finger_width=.0212, finger_thickness=.0188)
    frame, _, _ = g.hand_frame(grip, axis, hand_world.translation, radius, cfg, side, outward)
    p = radius + cfg['gap'] + cfg['finger_thickness'] * .5
    knuckle = frame @ Vector((p if side == 'R' else -p, 0, 0))
    return hand_world.to_3x3().inverted() @ (knuckle - hand_world.translation).normalized()


def solve_arm(rig, side, hand_world, pole_offset, roll=None):
    """Analytic two-bone IK (UpperArm/Forearm) placing the wrist at the target; the hand bone takes
    the exact target rotation, the forearm shares 60% of the hand twist. Returns the residual (m).

    Straight wrist: when `roll` = (grip point, haft axis, grip radius, limit deg, state key) is
    given, the closed hand may roll about the haft (it stays wrapped on the same axis) and the
    elbow is placed on the forearm line wrist - palm_dir * forearm length, choosing the roll at
    which that elbow is exactly an upper-arm length from the shoulder (continuous frame to frame,
    elbow kept outside the chest and below the shoulder). The wrist then never folds: the forearm
    always continues the palm. Without `roll` the authored elbow pole is used."""
    up, fore, hand = (rig.pose.bones[f'{n}_{side}'] for n in ('UpperArm', 'Forearm', 'Hand'))
    shoulder = rig.matrix_world @ up.head
    l1, l2 = up.bone.length, fore.bone.length
    chest_m = skin(rig, 'SpineUpper')
    chest = chest_m.to_3x3()
    lateral = chest @ Vector((1, 0, 0))
    sign = 1 if (shoulder - chest_m.translation).dot(lateral) >= 0 else -1
    pole = shoulder + chest @ pole_offset
    if roll is not None:
        grip, axis, radius, limit, key = roll
        axis = axis.normalized()
        if side not in PALM_LOCAL:
            PALM_LOCAL[side] = palm_direction_local(side, hand_world, grip, axis, radius, Vector((sign * 1.0, .15, 0)))
        prev = ROLL_STATE.get(key, 0.0)

        def candidate(theta):
            r = Matrix.Translation(grip) @ Matrix.Rotation(math.radians(theta), 4, axis) @ Matrix.Translation(-grip)
            hw = r @ hand_world
            f = (hw.to_3x3() @ PALM_LOCAL[side]).normalized()
            elbow = hw.translation - f * l2
            rel = elbow - shoulder
            pen = max(0.0, -sign * rel.dot(lateral) - .06) + max(0.0, rel.z - .02) * 2
            for pt, clear in [(shoulder.lerp(elbow, k / 5), .10) for k in range(6)] + [(elbow.lerp(hw.translation, k / 10), .095) for k in range(1, 7)]:
                off = pt - grip                # keep the arm and the sleeve off the haft
                pen += max(0.0, clear - (off - axis * off.dot(axis)).length) * 6
            return hw, elbow, rel.length - l1, pen
        step = 30 if key in ROLL_STATE else 180          # continuous: at most 30 deg of roll per frame
        lo, hi = max(-limit, prev - step), min(limit, prev + step)
        thetas = [lo + (hi - lo) * k / 60 for k in range(61)]
        samples = [(t, *candidate(t)) for t in thetas]
        best = None
        for (t0, _, _, r0, p0), (t1, _, _, r1, p1) in zip(samples, samples[1:]):
            if r0 == 0 or r0 * r1 < 0:
                t = t0 + (t1 - t0) * (r0 / (r0 - r1) if r0 != r1 else 0)
                hw, elbow, res, pen = candidate(t)
                cost = abs(t - prev) * .02 + abs(t) * .004 + pen * 40
                if best is None or cost < best[0]:
                    best = (cost, t, hw, elbow)
        if best is None:          # unreachable with a straight wrist: closest forearm line
            t, hw, elbow, res, pen = min(samples, key=lambda s_: abs(s_[3]) * 50 + abs(s_[0] - prev) * .02 + s_[4] * 40)
            best = (0, t, hw, elbow)
        ROLL_STATE[key] = best[1]
        hand_world = best[2]
        pole = best[3]
    target = hand_world.translation.copy()
    delta = target - shoulder
    d = max(1e-4, min(delta.length, (l1 + l2) * .9995))
    u = delta.normalized()
    perp = (pole - shoulder) - u * (pole - shoulder).dot(u)
    pole_key = ('pole',) + tuple(roll[4]) if roll is not None else ('pole', side)
    last = POLE_STATE.get(pole_key)
    if last is not None and perp.length < .04:
        # The elbow target is close to the shoulder-wrist line: keep the previous swing plane
        # (blended) instead of letting the elbow flip around the arm.
        last_perp = last - u * last.dot(u)
        perp = last_perp.normalized() * (.04 - perp.length) + perp if last_perp.length > 1e-6 else perp
    v = perp.normalized()
    if last is not None:
        last_perp = last - u * last.dot(u)
        if last_perp.length > 1e-6 and v.dot(last_perp.normalized()) < .6:
            # Never let the elbow swing more than ~53 degrees about the arm between two keys.
            v = (last_perp.normalized() * 1.6 + v).normalized()
    POLE_STATE[pole_key] = v.copy()
    cos_a = max(-1, min(1, (l1 * l1 + d * d - l2 * l2) / (2 * l1 * d)))
    elbow = shoulder + u * (l1 * cos_a) + v * (l1 * math.sqrt(max(0, 1 - cos_a * cos_a)))
    wrist = shoulder + u * d

    twist_key = roll[4] if roll is not None else (None, side)

    def aim(pb, head, tail, twist_hint=None, share=0.0):
        rest = pb.bone.matrix_local.to_3x3()
        direction = (tail - head).normalized()
        q = (rest @ Vector((0, 1, 0))).rotation_difference(direction) @ rest.to_quaternion()
        if twist_hint is not None:
            x = twist_hint - direction * twist_hint.dot(direction)
            if x.length > 1e-6:
                x.normalize()
                # Shared forearm twist, unwrapped frame to frame (no 180-degree flips between keys).
                x_now = (q @ Vector((1, 0, 0)))
                x_now = (x_now - direction * x_now.dot(direction)).normalized()
                angle = math.atan2(x_now.cross(x).dot(direction), x_now.dot(x))
                prev = TWIST_STATE.get(twist_key)
                if prev is not None:
                    while angle - prev > math.pi:
                        angle -= math.tau
                    while angle - prev < -math.pi:
                        angle += math.tau
                TWIST_STATE[twist_key] = angle
                q = Quaternion(direction, angle * share) @ q
        m = q.to_matrix().to_4x4()
        m.translation = head
        pb.matrix = rig.matrix_world.inverted() @ m
        bpy.context.view_layer.update()

    aim(up, shoulder, elbow)
    aim(fore, rig.matrix_world @ fore.head, wrist, hand_world.to_3x3() @ Vector((1, 0, 0)), .6)
    m = hand_world.copy()
    m.translation = rig.matrix_world @ fore.tail
    hand.matrix = rig.matrix_world.inverted() @ m
    bpy.context.view_layer.update()
    return (rig.matrix_world @ hand.head - target).length


def death_pike(rig, frame, start_pike, ref):
    """Right hand keeps the pike. In the falling body's own frame it slides from the carry to lie
    along the right side, so it never swings through the ground ahead of the body."""
    root = skin(rig, 'Root')
    start_local = start_pike  # root is the rest identity at frame 0
    # Roll so the wrist rests inside (toward the body) of the shaft; the forearm then never lies
    # along the pike.
    reach = REACH_LOCAL['R']
    roll = math.atan2(.3, .9) - math.atan2(reach.y, reach.x)
    # The arm flings out: the pike lands beside the body, splayed 14 degrees away from it.
    final_local = Matrix.Rotation(math.radians(14), 4, 'Y') @ Matrix.Rotation(roll, 4, 'Z')
    axis = final_local.to_3x3() @ Vector((0, 0, 1))
    final_local.translation = Vector((.52, .07, 1.10)) - axis * GRIP['R']
    # Stage 1: as the knees give way the pike is planted upright beside the right knee (the hand
    # stays high on it). Stage 2: it topples with the body and lands splayed beside it.
    planted = Matrix.Identity(4)
    planted.translation = Vector((.58, .26, 1.40)) - Vector((0, 0, GRIP['R']))
    b1, b2 = smooth(frame / 10), smooth((frame - 13) / 17)
    m = start_local.copy()
    for target, weight in ((planted, b1), (final_local, b2)):
        q = m.to_quaternion().slerp(target.to_quaternion(), weight)
        t = m.translation.lerp(target.translation, weight)
        m = q.to_matrix().to_4x4()
        m.translation = t
    return root @ m, b2  # the elbow swings inboard only once the pike topples


def pike_points(pike):
    pts = []
    for s in (0, .05, .5, 1, 1.5, 2, 2.3, PIKE_LENGTH):
        c = pike @ Vector((0, 0, s))
        pts.append(c.z - (SHAFT_RADIUS * 1.5 if s < 2.3 else .045))
    return min(pts)


def evaluated_min_z(objects):
    dg = bpy.context.evaluated_depsgraph_get()
    low = 9.0
    for obj in objects:
        ev = obj.evaluated_get(dg)
        me = ev.to_mesh()
        low = min([low] + [(obj.matrix_world @ v.co).z for v in me.vertices])
        ev.to_mesh_clear()
    return low


def author_clips(rig, body):
    scene = bpy.context.scene
    scene.render.fps = FPS
    rig.animation_data_create()
    report = {'ik_residual_m': {}, 'release': {}, 'death_floor_lift_m': []}
    # Reference carry (Idle frame 0, body keys only).
    apply_body(rig, 'Idle', 0)
    ref_pike = chest_pike(rig, 'Idle', 0)
    ref = {'pike': ref_pike, 'hand': reference_hands(ref_pike)}
    actions = {}
    pikes = {}
    for clip in CLIPS:
        action = bpy.data.actions.new(clip)
        action.use_fake_user = True
        rig.animation_data.action = action
        g.set_action(rig, clip)
        worst = 0.0
        pikes[clip] = {}
        start_pike = None
        for frame in range(FRAMES[clip] + 1):
            scene.frame_set(frame)
            apply_body(rig, clip, frame)
            if clip == 'Death':
                if start_pike is None:
                    start_pike = chest_pike(rig, 'Idle', 0)
                pike, release = death_pike(rig, frame, start_pike, ref)
            else:
                pike, release = chest_pike(rig, clip, frame), 0.0
            targets = hand_targets(pike, ref)
            base_left = {n: rig.pose.bones[n].matrix.copy() for n in ('UpperArm_L', 'Forearm_L', 'Hand_L')}
            pole_r = ELBOW_POLE['R'].lerp(DEATH_POLE_R, release) if clip == 'Death' else ELBOW_POLE['R']
            res_r = solve_arm(rig, 'R', targets['R'], pole_r, roll=pike_roll(pike, 'R', clip))
            res_l = solve_arm(rig, 'L', targets['L'], ELBOW_POLE['L'], roll=pike_roll(pike, 'L', clip))
            if clip == 'Death':
                # The support hand lets go during the fall and drops with the body keys.
                w = smooth((frame - 3) / 12)
                for n in ('UpperArm_L', 'Forearm_L', 'Hand_L'):
                    pb = rig.pose.bones[n]
                    q = pb.matrix.to_quaternion().slerp(base_left[n].to_quaternion(), w)
                    m = q.to_matrix().to_4x4()
                    m.translation = (rig.pose.bones[pb.parent.name].matrix @ pb.parent.bone.matrix_local.inverted() @ pb.bone.matrix_local).translation if pb.parent else pb.matrix.translation
                    pb.matrix = m
                    bpy.context.view_layer.update()
                report['release'].setdefault('Death', []).append(round(w, 3))
                floor = min(evaluated_min_z([body]), pike_points(pike))
                if frame:
                    root = rig.pose.bones['Root']
                    lift = .010 - floor
                    m = root.matrix.copy()
                    m.translation.z += lift
                    root.matrix = m
                    bpy.context.view_layer.update()
                    report['death_floor_lift_m'].append(round(lift, 4))
                    pike, _ = death_pike(rig, frame, start_pike, ref)
                    targets = hand_targets(pike, ref)
                    res_r = solve_arm(rig, 'R', targets['R'], pole_r, roll=pike_roll(pike, 'R', clip))
                    for n in ('UpperArm_L', 'Forearm_L', 'Hand_L'):
                        pass
            if clip == 'Death' and smooth((frame - 3) / 12) > 0:
                res_l = 0.0
            worst = max(worst, res_r, res_l)
            report.setdefault('per_frame', {}).setdefault(clip, []).append([frame, round(res_r, 4), round(res_l, 4)])
            pikes[clip][frame] = pike.copy()
            for pb in rig.pose.bones:
                pb.keyframe_insert('rotation_quaternion', frame=frame, group=pb.name)
                pb.keyframe_insert('location', frame=frame, group=pb.name)
        report['ik_residual_m'][clip] = round(worst, 5)
        actions[clip] = action
    fix_quaternion_continuity()
    g.set_action(rig, 'Idle')
    scene.frame_set(0)
    return actions, ref, pikes, report


def fix_quaternion_continuity():
    for action in bpy.data.actions:
        for curve in g.action_fcurves(action):
            curve.update()
        groups = {}
        for curve in g.action_fcurves(action):
            if curve.data_path.endswith('rotation_quaternion'):
                groups.setdefault(curve.data_path, [None] * 4)[curve.array_index] = curve
        for curves in groups.values():
            previous = None
            for i in range(len(curves[0].keyframe_points)):
                values = [c.keyframe_points[i].co.y for c in curves]
                if previous is not None and sum(a * b for a, b in zip(previous, values)) < 0:
                    for c in curves:
                        c.keyframe_points[i].co.y *= -1
                    values = [-x for x in values]
                previous = values
        for curve in g.action_fcurves(action):
            for key in curve.keyframe_points:
                key.interpolation = 'LINEAR'


# ------------------------------------------------------------------------------------------------
# Geometry: wrist cut, closed hands, pike
# ------------------------------------------------------------------------------------------------
def trim_wrist(body, rig, side, proximal=.028, roi=.13):
    """Cut the generated open glove at the anatomical cuff plane; the closed hand cuff covers it."""
    fb = rig.data.bones['Forearm_' + side]
    axis = (fb.tail_local - fb.head_local).normalized()
    wrist = fb.tail_local.copy()
    center = wrist - axis * proximal
    bm = bmesh.new()
    bm.from_mesh(body.data)
    before = len(bm.faces)

    def local(v):
        d = v.co - center
        t = d.dot(axis)
        return t, (d - axis * t).length
    region = {v for v in bm.verts if -.10 < local(v)[0] < .35 and local(v)[1] < roi}
    faces = [f for f in bm.faces if any(v in region for v in f.verts)]
    edges = list({e for f in faces for e in f.edges})
    verts = list({v for f in faces for v in f.verts})
    bmesh.ops.bisect_plane(bm, geom=[*verts, *edges, *faces], dist=1e-6, plane_co=center, plane_no=axis, clear_outer=True, clear_inner=False)
    rim = [v for v in bm.verts if abs((v.co - center).dot(axis)) < 1e-5 and (v.co - center).length < roi + .02]
    residual = [v for v in bm.verts if (d := v.co - center).dot(axis) > .001 and (d - axis * d.dot(axis)).length < roi and d.dot(axis) < .25 and v.link_faces]
    assert len(rim) >= 8 and not residual, (side, len(rim), len(residual))
    radius = max((v.co - center).length for v in rim)
    # Generated glove fingers that reach forward past the cut radius still follow the hand bone;
    # remove any face beyond the cuff plane that is mostly owned by Hand_<side>.
    deform = bm.verts.layers.deform.verify()
    hand_group = body.vertex_groups['Hand_' + side].index
    stray = []
    for f in bm.faces:
        c = f.calc_center_median() - center
        t = c.dot(axis)
        if t > .004 and (c - axis * t).length < .22 and sum(v[deform].get(hand_group, 0) for v in f.verts) / len(f.verts) > .30:
            stray.append(f)
    bmesh.ops.delete(bm, geom=stray, context='FACES')
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if not v.link_faces], context='VERTS')
    bm.to_mesh(body.data)
    bm.free()
    for v in body.data.vertices:
        d = v.co - center
        t = d.dot(axis)
        if -.025 < t < .0001 and (d - axis * t).length < roi:
            for grp in body.vertex_groups:
                grp.remove([v.index])
            body.vertex_groups['Forearm_' + side].add([v.index], 1, 'REPLACE')
    return {'wrist': list(wrist), 'cut_center': list(center), 'plane_normal': list(axis), 'radius': radius,
            'removed_faces': before - len(body.data.polygons), 'stray_glove_faces': len(stray), 'rim_vertices': len(rim), 'residual_palm_vertices': 0}


def lathe(part, profile, segments, weights, z_from=0.0):
    """Revolve (z, radius) samples around local Z; physical UVs from the shared Part loft."""
    rings, centers = [], []
    for z, r in profile:
        c = Vector((0, 0, z))
        centers.append(c)
        rings.append(part.ring(c, Vector((1, 0, 0)), Vector((0, 1, 0)), r, r, segments, weights=weights))
    part.loft(rings, centers, repeat=part_repeat(part))
    return part


def part_repeat(part):
    return .18 if part.material.endswith('oak') else .10


def pike_parts(detail):
    """Pike in local space: tapered ash shaft, leather grip wraps, gold collar and socket,
    langets, faceted leaf blade and a steel butt ferrule. Every part is a closed shell."""
    seg = 12 if detail == 0 else 8
    w = {'Hand_R': 1.0}
    parts = []
    shaft = g.Part('pike_shaft', 'AssemblyDetail_oak')
    zs = [0.025, .40, .90, 1.40, 1.90, 2.16]
    rs = [.0195, .0205, SHAFT_RADIUS, .0200, .0183, .0172]
    lathe(shaft, list(zip(zs, rs)), seg, w)
    parts.append(shaft)
    for s, length in ((GRIP['R'], .16), (GRIP['L'], .16)):
        wrap = g.Part('grip_wrap', 'AssemblyDetail_leather')
        bands = 6 if detail == 0 else 3
        prof = []
        for k in range(bands * 2 + 1):
            z = s - length / 2 + length * k / (bands * 2)
            prof.append((z, SHAFT_RADIUS + (.0034 if k % 2 else .0022)))
        lathe(wrap, prof, seg, w)
        parts.append(wrap)
    ferrule = g.Part('butt_ferrule', 'AssemblyDetail_steel')
    lathe(ferrule, [(0.0, .010), (.012, .021), (.07, .0225), (.085, .0212)], seg, w)
    parts.append(ferrule)
    collar = g.Part('gold_collar', 'AssemblyDetail_brass')
    lathe(collar, [(2.10, .0178), (2.115, .0260), (2.135, .0272), (2.155, .0250), (2.17, .0212), (2.19, .0230), (2.205, .0200)], seg + 4 if detail == 0 else seg, w)
    parts.append(collar)
    socket = g.Part('blade_socket', 'AssemblyDetail_steel')
    lathe(socket, [(2.20, .0188), (2.24, .0168), (2.28, .0142), (2.30, .0120)], seg, w)
    parts.append(socket)
    for sign in (1, -1):
        langet = g.Part('langet', 'AssemblyDetail_steel')
        rings, centers = [], []
        for z, width in ((1.96, .004), (2.02, .009), (2.11, .010), (2.20, .009)):
            c = Vector((0, sign * (SHAFT_RADIUS + .0022), z))
            centers.append(c)
            rings.append(langet.ring(c, Vector((1, 0, 0)), Vector((0, 1, 0)), width, .0024, 6, p=3.0, weights=w))
        langet.loft(rings, centers, repeat=.10)
        parts.append(langet)
    # Furled team pennon below the langets with two ribbon tails trailing along the shaft. Being
    # wound on (and lying along) the shaft it stays plausible in every pose, including the fall.
    seg_c = 12 if detail == 0 else 8
    furl = g.Part('team_pennon_furl', 'TeamCloth_PikePennon')
    rings, centers = [], []
    zs = 16 if detail == 0 else 7
    around = 16 if detail == 0 else 9
    for k in range(zs + 1):
        u = k / zs
        z = 1.68 + .28 * u
        c = Vector((0, 0, z))
        centers.append(c)
        ring = []
        for j in range(around):
            phi = 2 * math.pi * j / around
            # Spiral wrap folds plus a soft overall swell; the cloth edge steps where turns overlap.
            fold = .0045 * math.sin(3 * phi + u * 9.0) + .0025 * math.sin(7 * phi - u * 5.0)
            r = SHAFT_RADIUS + .006 + .009 * math.sin(math.pi * u) ** .7 + fold * (.4 + .6 * math.sin(math.pi * u))
            ring.append(len(furl.verts))
            furl.verts.append(c + Vector((math.cos(phi) * r, math.sin(phi) * r, 0)))
            furl.weights.append(dict(w))
        rings.append(ring)
    furl.loft(rings, centers, repeat=.20)
    parts.append(furl)
    for side, angle in (('L', math.radians(135)), ('R', math.radians(225))):
        tail = g.Part('team_pennon_tail_' + side, 'TeamCloth_PikePennon')
        rings, centers = [], []
        steps = 10 if detail == 0 else 5
        for k in range(steps + 1):
            u = k / steps
            twist = angle + (.35 if side == 'L' else -.35) * u
            radial = Vector((math.cos(twist), math.sin(twist), 0))
            across = Vector((-radial.y, radial.x, 0))
            z = 1.70 - .36 * u
            offset = SHAFT_RADIUS + .014 + .012 * u + .006 * math.sin(u * math.pi * 2.4)
            c = radial * offset + Vector((0, 0, z))
            centers.append(c)
            width = .032 * (1 - .35 * u) if u < .85 else .032 * .65 * (1 - (u - .85) / .15 * .7)
            rings.append(tail.ring(c, across, radial, width, .0020, 6 if detail == 0 else 4, p=6.0, weights=w))
        tail.loft(rings, centers, repeat=.20)
        parts.append(tail)
    blade = g.Part('leaf_blade', 'AssemblyDetail_steel')
    stations = [(2.30, .012, .0110), (2.34, .028, .0085), (2.40, .040, .0074), (2.46, .041, .0068), (2.51, .031, .0058), (2.56, .015, .0040), (PIKE_LENGTH, .0012, .0012)]
    n = 10 if detail == 0 else 6
    rings, centers = [], []
    for z, half_w, half_t in stations:
        c = Vector((0, 0, z))
        centers.append(c)
        ring = []
        for j in range(n):
            phi = 2 * math.pi * j / n
            cx, cy = math.cos(phi), math.sin(phi)
            # Diamond section: a central ridge (local Y) fading to a sharpened edge (local X).
            x = half_w * math.copysign(abs(cx) ** .85, cx)
            y = half_t * math.copysign(abs(cy) ** 1.6, cy) * (1 - .55 * abs(cx))
            ring.append(len(blade.verts))
            blade.verts.append(c + Vector((x, y, 0)))
            blade.weights.append(dict(w))
        rings.append(ring)
    blade.loft(rings, centers, repeat=.10)
    parts.append(blade)
    return parts


def build_pike(rig, pike_world, ref_skin, mats, detail):
    parts = []
    for p in pike_parts(detail):
        p = p.transformed(pike_world)
        g.to_bind(p, ref_skin)
        parts.append(p)
    obj = g.parts_to_object(f'RosterPike_LOD{detail}', parts, rig, mats)
    obj['rtsProceduralParts'] = json.dumps(sorted({p.name for p in parts}))
    obj.data.set_sharp_from_angle(angle=math.radians(60))
    return obj


def protected_lod_budget(body, others, target=9900):
    total = sum(g.tri_count(o) for o in [body, *others])
    if total <= target:
        return {'before_total': total, 'after_total': total}
    protected, eligible = [], []
    for v in body.data.vertices:
        keep = any(w.weight > .01 and body.vertex_groups[w.group].name.startswith(('Hand_', 'Forearm_', 'Foot_')) for w in v.groups)
        (protected if keep else eligible).append(v.index)
    fixed = {tuple(round(float(x), 6) for x in body.data.vertices[i].co) for i in protected}
    group = body.vertex_groups.new(name='DistanceBodyReduction')
    group.add(eligible, 1.0, 'REPLACE')
    before = g.tri_count(body)
    mod = body.modifiers.new('DistanceBodyBudget', 'DECIMATE')
    mod.ratio = (before - (total - target)) / before
    mod.vertex_group = group.name
    mod.vertex_group_factor = 1.0
    mod.use_collapse_triangulate = True
    body.modifiers.move(len(body.modifiers) - 1, 0)
    active(body)
    bpy.ops.object.modifier_apply(modifier=mod.name)
    body.vertex_groups.remove(body.vertex_groups['DistanceBodyReduction'])
    remaining = {tuple(round(float(x), 6) for x in v.co) for v in body.data.vertices}
    final = sum(g.tri_count(o) for o in [body, *others])
    assert fixed <= remaining and final <= 10000, ('LOD1 budget changed protected vertices', final)
    return {'before_total': total, 'after_total': final, 'body_before': before, 'body_after': g.tri_count(body),
            'protected_vertices': len(protected), 'protected_positions_unchanged': True}


# ------------------------------------------------------------------------------------------------
# QA helpers
# ------------------------------------------------------------------------------------------------
def grip_report(rig, records, pike_bind_axis):
    """Per clip/frame distance of each closed hand's grip centre to the pike axis (both in world)."""
    scene = bpy.context.scene
    out = {}
    for rec in records:
        side = rec['side']
        if rec['lod'] != 0:
            continue
        g.set_action(rig, 'Idle')
        scene.frame_set(0)
        ref = g.skin_matrices(rig)
        c_bind = ref['Hand_' + side].inverted() @ Vector(rec['grip'])
        per = {}
        for clip in CLIPS:
            g.set_action(rig, clip)
            worst, worst_attached = 0.0, 0.0
            for frame in range(FRAMES[clip] + 1):
                scene.frame_set(frame)
                m = g.skin_matrices(rig)
                c = m['Hand_' + side] @ c_bind
                p0 = m['Hand_R'] @ pike_bind_axis[0]
                p1 = m['Hand_R'] @ pike_bind_axis[1]
                a = (p1 - p0).normalized()
                d = c - p0
                gap = (d - a * d.dot(a)).length
                worst = max(worst, gap)
                released = clip == 'Death' and side == 'L' and frame >= 3
                if not released:
                    worst_attached = max(worst_attached, gap)
            per[clip] = {'max_axis_offset_m': round(worst, 4), 'max_attached_axis_offset_m': round(worst_attached, 4)}
        out[side] = per
    g.set_action(rig, 'Idle')
    scene.frame_set(0)
    return out


def source_crossings(rig, body, pike, step=1):
    """Exact body/pike triangle crossings on the editable source, every frame of every clip."""
    from commander_assembly_collision import evaluated, exact_pairs
    scene = bpy.context.scene
    out = {}
    for clip in CLIPS:
        g.set_action(rig, clip)
        bad = []
        for frame in range(0, FRAMES[clip] + 1, step):
            scene.frame_set(frame)
            bp, bf, bt = evaluated(body)
            wp, wf, wt = evaluated(pike)
            hits = exact_pairs(bp[bf], wp[wf], bt.overlap(wt))
            if len(hits):
                bad.append([frame, int(len(hits))])
        out[clip] = bad
    g.set_action(rig, 'Idle')
    scene.frame_set(0)
    return out


def main():
    args = argparse.ArgumentParser()
    args.add_argument('--run', type=Path, required=True)
    args.add_argument('--stage', choices=('preview', 'production'), default='production')
    opt = args.parse_args(sys.argv[sys.argv.index('--') + 1:])
    run = opt.run.resolve()
    qa, raw, candidate = run / 'qa', run / 'raw', run / 'candidate'
    for d in (qa, raw, candidate):
        d.mkdir(parents=True, exist_ok=True)
    prep = run / 'prep/candidate'
    body, foot_half, source = load_body(run)
    marks = landmarks(foot_half)
    save(qa / 'landmarks.json', {'source': source, 'landmarks': marks, 'runtime_publish_allowed': False})
    # Materials: masked team cloth body (priest/commander convention) + shared detail surfaces.
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
    decimate(body, 13900)
    rig = build_armature(marks)
    bind_auto(body, rig)
    arm_changes = {s: g.reweight_arm_chain(body, rig, s) for s in 'LR'}
    skirt = tabard_skirt_weights(body, rig)
    smoothed = spatial_smooth_weights(body, lambda c: .08 < abs(c.x) < .36 and 1.05 < c.z < 1.50)
    repaired = fill_sparse_auto_weights(body, rig)
    limit_normalize(body)
    wr = {s: g.wrist_radius_of([body], rig, s) for s in 'LR'}
    cuts = {s: trim_wrist(body, rig, s) for s in 'LR'}
    limit_normalize(body)
    mats = {}
    for kind in ('leather', 'steel', 'oak', 'brass'):
        m = surface(kind)
        m.name = 'AssemblyDetail_' + kind
        mats[m.name] = m
    mats['TeamCloth_PikePennon'] = material('TeamCloth_PikePennon', (.93, .91, .86), 0, .82)
    g.CLIPS = CLIPS
    actions, ref, pikes, motion = author_clips(rig, body)
    # Build the equipment at the reference carry (Idle frame 0).
    g.set_action(rig, 'Idle')
    bpy.context.scene.frame_set(0)
    ref_skin = g.skin_matrices(rig)
    ref_pike = pikes['Idle'][0]
    lod_objects = {0: [body], 1: []}
    records = []
    hands = {}
    for side in 'LR':
        grip = ref_pike @ Vector((0, 0, GRIP[side]))
        axis = (ref_pike.to_3x3() @ Vector((0, 0, 1))).normalized()
        wrist_bind = rig.data.bones['Forearm_' + side].tail_local.copy()
        wrist = ref_skin['Forearm_' + side] @ wrist_bind
        obj, rec = closed_hand(f'AssemblyHand_{side}_LOD0', rig, side, grip, axis, SHAFT_RADIUS + .003, wrist,
                               min(.050, max(.036, wr[side])), 0, ref_skin, mats, False)
        rec['cut'] = cuts[side]
        records.append(rec)
        hands[side] = obj
        lod_objects[0].append(obj)
    pike0 = build_pike(rig, ref_pike, ref_skin, mats, 0)
    lod_objects[0].append(pike0)
    # LOD1: protected-wrist body reduction, the same closed hands, a lighter pike.
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
    pike1 = build_pike(rig, ref_pike, ref_skin, mats, 1)
    budget = protected_lod_budget(body1, [*hands1, pike1])
    limit_normalize(body1)
    lod_objects[1] = [body1, *hands1, pike1]
    counts = {f'lod{l}': {o.name: g.tri_count(o) for o in objs} for l, objs in lod_objects.items()}
    totals = {l: sum(v.values()) for l, v in counts.items()}
    assert totals['lod0'] <= 19900 and 7000 <= totals['lod1'] <= 9900, totals
    weights = {o.name: weight_metrics(o) for objs in lod_objects.values() for o in objs}
    assert not any(w['unweighted'] or w['max_influences'] > 4 or w['max_weight_sum_error'] > .01 for w in weights.values()), weights
    lifts = g.lift_sinking_frames(rig, lod_objects[0], clips=('Idle', 'Walk', 'Attack', 'Hurt'))
    ground = g.ground_report(rig, lod_objects[0])
    ground1 = g.ground_report(rig, lod_objects[1])
    pike_axis_bind = (ref_skin['Hand_R'].inverted() @ (ref_pike @ Vector((0, 0, 0))), ref_skin['Hand_R'].inverted() @ (ref_pike @ Vector((0, 0, 1))))
    grips = grip_report(rig, records, pike_axis_bind)
    crossings = source_crossings(rig, body, pike0)
    bounds = g.conservative_bounds(lod_objects[0] + lod_objects[1], rig)
    for o in lod_objects[0] + lod_objects[1]:
        o['rtsConservativeBounds'] = bounds[o.name]
    motion_meta = {'version': 1, 'locomotion': {'clip': 'Walk', 'strideMeters': 2.0, 'cycleSeconds': FRAMES['Walk'] / FPS},
                   'attack': {'clip': 'Attack', 'durationSeconds': FRAMES['Attack'] / FPS, 'contactSeconds': CONTACT_FRAME / FPS}}
    bpy.context.scene['rtsMotion'] = motion_meta
    # Review renders (Blender QA; browser captures are separate).
    center, distance = setup_render_scene(HEIGHT + .6)
    scene = bpy.context.scene
    scene.world.color = (.45, .45, .45)
    renders = {}
    if opt.stage == 'preview' or True:
        for o in lod_objects[1]:
            o.hide_render = True
        cam_center = Vector((0, .25, 1.15))
        for clip in CLIPS:
            g.set_action(rig, clip)
            n = FRAMES[clip]
            for frame in sorted({0, n // 4, n // 2, (3 * n) // 4, n} | ({CONTACT_FRAME} if clip == 'Attack' else set())):
                scene.frame_set(frame)
                renders[f'{clip}-{frame}'] = render_view(f'{clip}{frame}', cam_center + Vector((4.4, 4.4, 3.3)), cam_center, 3.4, 360, 420, qa / f'blender/{clip.lower()}-{frame:02d}.png')
        scene.frame_set(FRAMES['Death'])
        renders['death-top'] = render_view('deathtop', Vector((0, .9, 0)) + Vector((0, 0, 6)), Vector((0, .9, 0)), 3.6, 560, 560, qa / 'blender/death-top.png')
        g.set_action(rig, 'Idle')
        scene.frame_set(0)
        for view, loc in (('front', Vector((0, 6, 0))), ('side', Vector((6, 0, 0))), ('back', Vector((0, -6, 0)))):
            renders[view] = render_view(view, cam_center + loc, cam_center, 3.2, 560, 760, qa / f'blender/{view}.png')
    for o in lod_objects[0] + lod_objects[1]:
        o.hide_render = o in lod_objects[1]
    blend = raw / f'{UNIT}-assembly.blend'
    bpy.ops.wm.save_as_mainfile(filepath=str(blend))
    exports = {}
    if opt.stage == 'production':
        for o in lod_objects[0] + lod_objects[1]:
            bm = bmesh.new()
            bm.from_mesh(o.data)
            bmesh.ops.triangulate(bm, faces=list(bm.faces))
            bm.to_mesh(o.data)
            bm.free()
        for lod, objs in lod_objects.items():
            bpy.ops.object.select_all(action='DESELECT')
            for o in [rig, *objs]:
                o.hide_set(False)
                o.select_set(True)
            bpy.context.view_layer.objects.active = rig
            path = raw / f'{UNIT}-edited-lod{lod}.glb'
            bpy.ops.export_scene.gltf(filepath=str(path), export_format='GLB', use_selection=True, export_animations=True,
                                      export_animation_mode='ACTIONS', export_nla_strips=False, export_force_sampling=True,
                                      export_optimize_animation_size=False, export_skins=True, export_extras=True, export_yup=True,
                                      export_tangents=True, export_image_format='JPEG', export_jpeg_quality=90, export_def_bones=False)
            exports[f'lod{lod}'] = {'path': path.as_posix(), 'sha256': sha(path), 'bytes': path.stat().st_size}
    report = {'unit': UNIT, 'stage': opt.stage, 'source': source, 'fps': FPS, 'frames': FRAMES, 'contact_frame': CONTACT_FRAME,
              'contact_seconds': CONTACT_FRAME / FPS, 'rtsMotion': motion_meta, 'bones': list(rig.data.bones.keys()),
              'clips': list(actions), 'arm_chain_reweighted_vertices': arm_changes, 'tabard_skirt_vertices': skirt, 'shoulder_smoothed_vertices': smoothed,
              'repaired_sparse_weights': len(repaired), 'wrist_radius_m': wr, 'hands': records, 'triangles': counts,
              'totals': totals, 'lod1_budget': budget, 'weights': weights, 'motion': motion, 'root_lift': lifts,
              'ground': {'lod0': ground, 'lod1': ground1}, 'grip_axis_offset': grips, 'source_crossings': crossings, 'bounds': bounds,
              'renders': renders, 'blend': {'path': blend.as_posix(), 'sha256': sha(blend)}, 'exports': exports,
              'runtime_publish_allowed': False}
    save(qa / 'build.json', report)
    print('ROSTER_PIKEMAN=' + json.dumps({'totals': totals, 'ik': motion['ik_residual_m'], 'grips': grips, 'crossings': crossings, 'ground': ground, 'exports': exports}), flush=True)


if __name__ == '__main__':
    main()
