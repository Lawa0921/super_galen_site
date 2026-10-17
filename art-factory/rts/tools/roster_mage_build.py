"""Original 曦光法師 (mage) production build: generated body, priest-family 20-bone rig, sun staff.

Blender 5.2 background:
  blender --background --factory-startup --python-exit-code 1 --python roster_mage_build.py -- --run <run>

Shares the roster helpers in roster_pikeman_build.py. The right hand closes on the staff (bare-skin
closed hand, the mage wears no gloves); the left hand stays the generated open hand and casts
palm-up. Clips: Idle, Walk, Attack (staff thrust bolt), CastBlast (the runtime plays
'cast'+'blast' for 曦光術), Hurt, Death.
"""
import argparse
import base64
import json
import math
import sys
from pathlib import Path

import bpy
import bmesh
from mathutils import Matrix, Vector

TOOLS = Path(__file__).resolve().parent
sys.path.insert(0, str(TOOLS))
import procedural_gauntlet_build as g  # noqa: E402
import roster_pikeman_build as pk  # noqa: E402
from human_units_build import bind_auto, decimate, fill_sparse_auto_weights, material, setup_render_scene, weight_metrics  # noqa: E402
from human_units_spec import skirt_weights  # noqa: E402
from commander_assembly_build import surface  # noqa: E402
from roster_hands import build_hand  # noqa: E402


_HAND_ARGS = {}


def closed_hand(name, rig, side, center, axis, radius, wrist, wrist_radius, lod, ref, mats, steel=False):
    """Three-phalanx closed hand (roster_hands.py); the material key may be remapped (bare skin)."""
    _HAND_ARGS[name] = (rig, side, center, axis, radius, wrist, wrist_radius, ref, mats)
    return build_hand(name, rig, side, center, axis, radius, wrist, wrist_radius, ref, mats, 'AssemblyDetail_leather', detail=lod, flare=False, thumb_scale=1.18)


def lod1_hand(name0):
    """The same grip rebuilt at the lighter LOD1 detail (identical wrap, fewer segments)."""
    rig, side, center, axis, radius, wrist, wrist_radius, ref, mats = _HAND_ARGS[name0]
    obj, rec = build_hand(name0.replace('LOD0', 'LOD1'), rig, side, center, axis, radius, wrist, wrist_radius, ref, mats, 'AssemblyDetail_leather', detail=1, flare=False, thumb_scale=1.18)
    return obj, rec
from neural_blender_qa import render_view  # noqa: E402

UNIT = 'mage'
HEIGHT = 1.74
FPS = 30
CLIPS = ('Idle', 'Walk', 'Attack', 'CastBlast', 'Hurt', 'Death')
FRAMES = {'Idle': 72, 'Walk': 22, 'Attack': 30, 'CastBlast': 18, 'Hurt': 15, 'Death': 48}
CONTACT_FRAME = 13
CAST_FRAME = 11
STAFF = 1.98
GRIP = .98                    # hand station from the staff foot
SHAFT_R = .0185
PALM = .095
REACH = Vector((1, .12, 0)).normalized()      # staff held OUTSIDE the bell sleeve
POLE = Vector((.30, -.15, -.25))
pk.UNIT, pk.HEIGHT, pk.FPS, pk.CLIPS, pk.FRAMES = UNIT, HEIGHT, FPS, CLIPS, FRAMES
smooth = pk.smooth


def landmarks(foot_half):
    h = HEIGHT
    bones = {
        'Root': ((0, 0, 0), (0, 0, .12 * h), None),
        'Pelvis': ((0, -.03, .12 * h), (0, -.035, .45 * h), 'Root'),
        'SpineLower': ((0, -.035, .45 * h), (0, -.04, .62 * h), 'Pelvis'),
        'SpineUpper': ((0, -.04, .62 * h), (0, -.045, .77 * h), 'SpineLower'),
        'Neck': ((0, -.045, .77 * h), (0, -.045, .87 * h), 'SpineUpper'),
        'Head': ((0, -.045, .87 * h), (0, -.04, .99 * h), 'Neck'),
    }
    arm = {'shoulder': (.085, -.060, 1.392), 'upper': (.185, -.065, 1.365), 'elbow': (.275, -.060, 1.130),
           'wrist': (.350, -.020, .925), 'tip': (.392, .000, .785)}
    for side, sign in (('L', -1), ('R', 1)):
        p = {k: (sign * v[0], v[1], v[2]) for k, v in arm.items()}
        bones[f'Shoulder_{side}'] = (p['shoulder'], p['upper'], 'SpineUpper')
        bones[f'UpperArm_{side}'] = (p['upper'], p['elbow'], f'Shoulder_{side}')
        bones[f'Forearm_{side}'] = (p['elbow'], p['wrist'], f'UpperArm_{side}')
        bones[f'Hand_{side}'] = (p['wrist'], p['tip'], f'Forearm_{side}')
        hip = (sign * foot_half * .80, -.03, .445 * h)
        knee = (sign * foot_half, -.02, .262 * h)
        ankle = (sign * foot_half * 1.03, 0, .062 * h)
        toe = (sign * foot_half * 1.03, .10 * h, .032 * h)
        bones[f'Thigh_{side}'] = (hip, knee, 'Pelvis')
        bones[f'Shin_{side}'] = (knee, ankle, f'Thigh_{side}')
        bones[f'Foot_{side}'] = (ankle, toe, f'Shin_{side}')
    return {'height_m': h, 'foot_half_spacing_m': foot_half, 'bones': bones, 'arm_fit': arm}


def gather_sleeve(body, rig, side, start=.05, keep=.055, factor=.30):
    """Draw the staff-hand bell sleeve in toward the forearm over its distal part (a gathered,
    tied-back sleeve) so the staff can pass the wrist; the other sleeve keeps its full bell."""
    fb = rig.data.bones['Forearm_' + side]
    a, b = fb.head_local, fb.tail_local
    axis = (b - a).normalized()
    length = (b - a).length
    names = {grp.index: grp.name for grp in body.vertex_groups}
    moved = 0
    for v in body.data.vertices:
        arm = sum(w.weight for w in v.groups if names[w.group] in ('Forearm_' + side, 'Hand_' + side))
        if arm < .35:
            continue
        d = v.co - a
        t = d.dot(axis) / length
        if t < start - .1 or t > 1.25:
            continue
        radial = d - axis * (t * length)
        r = radial.length
        if r <= keep:
            continue
        blend = smooth((t - (start - .1)) / .2)
        new_r = r - (r - (keep + (r - keep) * factor)) * blend
        v.co = a + axis * (t * length) + radial.normalized() * new_r
        moved += 1
    body.data.update()
    return moved


def sleeve_weights(body, rig):
    """Bell sleeves hang beside the robe, so bone-heat gives their lower flap robe weights and the
    flap streaks when the arm lifts. Re-own every vertex of the hanging sleeve by the arm chain
    (UpperArm -> Forearm by position along the arm)."""
    b = rig.data.bones
    changed = 0
    for side, sign in (('L', -1), ('R', 1)):
        ua, fa = (b['UpperArm_' + side].head_local, b['UpperArm_' + side].tail_local), (b['Forearm_' + side].head_local, b['Forearm_' + side].tail_local)
        groups = {n: body.vertex_groups.get(n) or body.vertex_groups.new(name=n) for n in ('UpperArm_' + side, 'Forearm_' + side)}
        for v in body.data.vertices:
            if sign * v.co.x < .265 or not (.72 < v.co.z < 1.30):
                continue
            t_u, d_u = g.segment_param(v.co, *ua)
            t_f, d_f = g.segment_param(v.co, *fa)
            if min(d_u, d_f) > .22:
                continue
            fore = smooth((t_f - .0) / .25) if d_f <= d_u + .04 else 0.0
            target = {'Forearm_' + side: fore, 'UpperArm_' + side: 1 - fore}
            for w in list(v.groups):
                body.vertex_groups[w.group].remove([v.index])
            for n, w in target.items():
                if w > 1e-5:
                    groups[n].add([v.index], w, 'REPLACE')
            changed += 1
    return changed


SKIN_VERTS = []


def skin_texture_hand(hand, body, rig, patch_px=12):
    """Texture the procedural right hand with the generated body's own left-hand skin: the texel
    patch whose neighbourhood best matches the median colour of the generated left hand's skin
    vertices (and varies least) is mapped by a planar projection in the hand-bone frame, and the
    hand uses the body material, so tone and texel grain match the visible left hand."""
    import array
    img = next(nd.image for nd in body.data.materials[0].node_tree.nodes if nd.type == 'TEX_IMAGE' and nd.image)
    w, h = img.size
    px = array.array('f', [0.0]) * (w * h * 4)
    img.pixels.foreach_get(px)

    def texel(u, v):
        x, y = min(w - 1, max(0, int(u * w))), min(h - 1, max(0, int(v * h)))
        i = (y * w + x) * 4
        return px[i], px[i + 1], px[i + 2]
    wanted = set(SKIN_VERTS)
    uv = body.data.uv_layers.active.data
    cand = [uv[li].uv.copy() for poly in body.data.polygons for li in poly.loop_indices if body.data.loops[li].vertex_index in wanted]
    assert len(cand) >= 20, len(cand)
    cols = sorted((texel(c.x, c.y) for c in cand), key=lambda c_: sum(c_))
    median = cols[len(cols) // 2]
    best = None
    for c in cand:
        if not (.03 < c.x < .97 and .03 < c.y < .97):
            continue
        ring = [texel(c.x + dx / w, c.y + dy / h) for dx in range(-patch_px, patch_px + 1, 4) for dy in range(-patch_px, patch_px + 1, 4)]
        mean = [sum(r[k] for r in ring) / len(ring) for k in range(3)]
        var = sum(sum((r[k] - mean[k]) ** 2 for k in range(3)) for r in ring) / len(ring)
        score = sum((m - t) ** 2 for m, t in zip(mean, median)) * 25 + var * 6
        if best is None or score < best[0]:
            best = (score, c, mean)
    centre = best[1]
    span = Vector((patch_px * .5 / w, patch_px * .5 / h))   # map inside the uniform neighbourhood
    inv = rig.data.bones['Hand_R'].matrix_local.inverted()
    hand.data.materials.clear()
    hand.data.materials.append(body.data.materials[0])
    huv = hand.data.uv_layers.active.data
    for poly in hand.data.polygons:
        poly.material_index = 0
        for li in poly.loop_indices:
            local = inv @ hand.data.vertices[hand.data.loops[li].vertex_index].co
            huv[li].uv = (centre.x + max(-1, min(1, (local.x + local.y * .5) / .07)) * span.x,
                          centre.y + max(-1, min(1, (local.z + local.y * .5) / .07)) * span.y)
    return {'patch_centre_uv': [round(centre.x, 4), round(centre.y, 4)], 'patch_px': patch_px,
            'patch_rgb': [round(x, 3) for x in best[2]], 'left_hand_median_rgb': [round(x, 3) for x in median]}


def rigid_left_hand(body, rig, side='L', reach=.11):
    """The generated body's bare open hand reads well but auto weights leave most of it on the
    forearm, so it smears into a lump whenever the wrist turns (CastBlast). Re-own every vertex of
    that hand (skin texels near the hand bone, past the wrist) by Hand_<side>, ramping in over the
    first 3 cm past the wrist so the wrist bends like a joint and the fingers keep their shape."""
    import array
    img = next(nd.image for nd in body.data.materials[0].node_tree.nodes if nd.type == 'TEX_IMAGE' and nd.image)
    w, h = img.size
    px = array.array('f', [0.0]) * (w * h * 4)
    img.pixels.foreach_get(px)
    fb, hb = rig.data.bones['Forearm_' + side], rig.data.bones['Hand_' + side]
    axis = (fb.tail_local - fb.head_local).normalized()
    wrist = fb.tail_local
    tip = hb.tail_local + (hb.tail_local - hb.head_local).normalized() * .03
    d = tip - hb.head_local
    uv = body.data.uv_layers.active.data
    colour = {}
    for poly in body.data.polygons:
        for li in poly.loop_indices:
            u, v = uv[li].uv
            x, y = min(w - 1, max(0, int(u * w))), min(h - 1, max(0, int(v * h)))
            i = (y * w + x) * 4
            colour.setdefault(body.data.loops[li].vertex_index, []).append((px[i], px[i + 1], px[i + 2]))
    hand_g = body.vertex_groups.get('Hand_' + side) or body.vertex_groups.new(name='Hand_' + side)
    fore_g = body.vertex_groups.get('Forearm_' + side) or body.vertex_groups.new(name='Forearm_' + side)
    changed = 0
    for v in body.data.vertices:
        along = (v.co - wrist).dot(axis)
        t = max(0.0, min(1.0, (v.co - hb.head_local).dot(d) / d.length_squared))
        if along < -.005 or (v.co - (hb.head_local + d * t)).length > reach:
            continue
        cols = colour.get(v.index, [])
        if not cols:
            continue
        r, g_, b = (sum(c_[k] for c_ in cols) / len(cols) for k in range(3))
        skin = r > .25 and .35 < g_ / r < .78 and .22 < b / r < .68 and not (g_ / r > .55 and b / r < .30)
        if not (skin or (v.co - (hb.head_local + d * t)).length < .03):
            continue
        hand_w = smooth((along + .005) / .035)
        SKIN_VERTS.append(v.index)
        for grp in list(v.groups):
            body.vertex_groups[grp.group].remove([v.index])
        if hand_w > 1e-4:
            hand_g.add([v.index], hand_w, 'REPLACE')
        if hand_w < 1 - 1e-4:
            fore_g.add([v.index], 1 - hand_w, 'REPLACE')
        changed += 1
    return {'rigid_hand_vertices': changed, 'method': 'skin texels near the hand bone re-owned by Hand (3 cm wrist ramp)'}


def robe_weights(body, rig):
    """Priest robe policy for the full-length robe: continuous pelvis/bilateral-leg blend from the
    hip to the hem; the shoes/ankles and the hanging sleeve tips keep their own bones."""
    b = rig.data.bones
    feet = [(b[n].head_local, b[n].tail_local) for n in ('Shin_L', 'Shin_R', 'Foot_L', 'Foot_R')]
    fore = [(b[n].head_local, b[n].tail_local) for n in ('Forearm_L', 'Forearm_R', 'Hand_L', 'Hand_R')]
    groups = {n: body.vertex_groups.get(n) or body.vertex_groups.new(name=n) for n in ('Root', 'Pelvis', 'Thigh_L', 'Thigh_R', 'Shin_L', 'Shin_R')}
    count = 0
    for v in body.data.vertices:
        z = v.co.z
        if z >= HEIGHT * .46 or abs(v.co.x) >= .42:
            continue
        if abs(v.co.x) > .265 and min(g.segment_param(v.co, *seg)[1] for seg in fore) < .16:
            continue  # bell-sleeve tip hanging beside the robe
        shoe = min(g.segment_param(v.co, *seg)[1] for seg in feet) if z < .30 else 1.0
        # Soles/heels sit below the hem: never robe-weight them, and blend the hem onto the shoe.
        fade = (smooth((z - .11) / .05) * smooth((shoe - .04) / .06)) if z < .30 else 1.0
        if fade <= 0:
            continue
        values = skirt_weights(v.co.x, v.co.z, HEIGHT)
        # The hem rides the Root (ground) more than the pelvis, so a kneeling pelvis sinks into
        # the skirt and the dress pools instead of driving the hem through the floor.
        ground = .45 * smooth((.55 - z) / .45)
        values['Root'] = values['Pelvis'] * ground
        values['Pelvis'] *= 1 - ground
        # Hem cloth right around an ankle follows that shin a little, so the foot does not tear
        # a sliver out of the hem when it swings forward.
        if z < .30:
            for side in 'LR':
                d = g.segment_param(v.co, b['Shin_' + side].head_local, b['Shin_' + side].tail_local)[1]
                share = .55 * (1 - smooth((d - .05) / .08)) * (1 - smooth((z - .18) / .12))
                if share > 0:
                    for k in list(values):
                        values[k] *= 1 - share
                    values['Shin_' + side] = values.get('Shin_' + side, 0) + share
        old = {body.vertex_groups[w.group].name: w.weight for w in v.groups}
        total = sum(old.values()) or 1
        new = {n: w / total * (1 - fade) for n, w in old.items()}
        for n, w in values.items():
            new[n] = new.get(n, 0) + w * fade
        best = sorted(new.items(), key=lambda kv: kv[1], reverse=True)[:4]
        norm = sum(w for _, w in best) or 1
        for w in list(v.groups):
            body.vertex_groups[w.group].remove([v.index])
        for n, w in best:
            if w > 1e-5:
                (groups.get(n) or body.vertex_groups.get(n) or body.vertex_groups.new(name=n)).add([v.index], w / norm, 'REPLACE')
        count += 1
    return count


BODY_KEYS = {
    'Idle': [(0, {'SpineUpper': ('X', 1.0), 'Head': ('Z', -4)}), (24, {'$root_z': .008, 'SpineUpper': (('X', -1.0), ('Z', 2)), 'Head': (('Z', 6), ('X', 2)), 'UpperArm_L': ('X', 3)}),
             (48, {'$root_z': .003, 'SpineUpper': ('X', .4), 'Head': (('Z', -2), ('X', -2)), 'UpperArm_L': ('X', -2)}), (72, {'SpineUpper': ('X', 1.0), 'Head': ('Z', -4)})],
    'Walk': [
        (0, {'Thigh_L': ('X', 20), 'Thigh_R': ('X', -18), 'Shin_R': ('X', 14), 'UpperArm_L': ('X', -12), 'SpineLower': ('Z', 2)}),
        (5, {'$root_z': .018, 'Thigh_L': ('X', 3), 'Thigh_R': ('X', -3), 'Shin_L': ('X', 10), 'Shin_R': ('X', 7)}),
        (11, {'Thigh_L': ('X', -18), 'Thigh_R': ('X', 20), 'Shin_L': ('X', 14), 'UpperArm_L': ('X', 12), 'SpineLower': ('Z', -2)}),
        (16, {'$root_z': .018, 'Thigh_L': ('X', -3), 'Thigh_R': ('X', 3), 'Shin_L': ('X', 7), 'Shin_R': ('X', 10)}),
        (22, {'Thigh_L': ('X', 20), 'Thigh_R': ('X', -18), 'Shin_R': ('X', 14), 'UpperArm_L': ('X', -12), 'SpineLower': ('Z', 2)}),
    ],
    # Staff thrust: the sun ring is driven at the target and the bolt leaves it (contact frame).
    'Attack': [(0, {}), (7, {'SpineLower': ('Z', 8), 'SpineUpper': (('Z', 12), ('X', 4)), 'Thigh_R': ('X', -6)}),
               (13, {'$root_y': .06, 'SpineLower': (('X', -6), ('Z', -6)), 'SpineUpper': (('X', -8), ('Z', -12)), 'Thigh_R': ('X', 14), 'Shin_R': ('X', -10), 'Thigh_L': ('X', -8)}),
               (20, {'SpineLower': ('Z', -3), 'SpineUpper': ('Z', -5)}), (30, {})],
    # 曦光術: staff raised high, open left palm up, then the ring is brought down to flare.
    'CastBlast': [(0, {}), (6, {'SpineUpper': ('X', 10), 'Head': ('X', 14), 'UpperArm_L': (('Y', 70), ('X', -36)), 'Forearm_L': ('X', -18)}),
                  (11, {'$root_z': -.025, 'SpineLower': ('X', -8), 'SpineUpper': ('X', -12), 'Head': ('X', -4), 'UpperArm_L': (('Y', 48), ('X', -40)), 'Forearm_L': ('X', -10),
                        'Thigh_L': ('X', 8), 'Thigh_R': ('X', -6)}),
                  (18, {})],
    'Hurt': [(0, {}), (4, {'$root_y': -.06, '$root_z': -.012, 'SpineLower': ('X', 12), 'SpineUpper': (('X', 18), ('Z', 6)), 'Head': (('X', -14), ('Z', 10)),
                          'UpperArm_L': ('X', 18), 'Thigh_R': ('X', -8)}),
             (9, {'$root_y': -.025, 'SpineLower': ('X', 4), 'SpineUpper': ('X', 7), 'Head': ('X', -4), 'UpperArm_L': ('X', 6)}), (15, {})],
    'Death': [(0, {}),
              (6, {'$pelvis_z': -.10, 'Thigh_L': ('X', 22), 'Thigh_R': ('X', 18), 'Shin_L': ('X', -44), 'Shin_R': ('X', -40),
                   'SpineLower': ('X', -6), 'SpineUpper': ('X', 8), 'Head': ('X', -8), 'UpperArm_L': ('X', 10)}),
              (15, {'$pelvis_z': -.38, 'Thigh_L': ('X', 30), 'Thigh_R': ('X', 26), 'Shin_L': ('X', -100), 'Shin_R': ('X', -96), 'Foot_L': ('X', 34), 'Foot_R': ('X', 32),
                    'SpineLower': ('X', -14), 'SpineUpper': ('X', -6), 'Head': ('X', -14), 'UpperArm_L': ('X', 16)}),
              (26, {'$pelvis_z': -.46, 'Thigh_L': ('X', 34), 'Thigh_R': ('X', 30), 'Shin_L': ('X', -108), 'Shin_R': ('X', -104), 'Foot_L': ('X', 38), 'Foot_R': ('X', 36),
                    'SpineLower': ('X', -16), 'SpineUpper': ('X', -12), 'Neck': ('X', -8), 'Head': (('X', -18), ('Y', -12)), 'UpperArm_L': (('X', 24), ('Y', -10)), 'Forearm_L': ('X', 10)}),
              (32, {'$pelvis_z': -.47, 'Thigh_L': ('X', 34), 'Thigh_R': ('X', 30), 'Shin_L': ('X', -110), 'Shin_R': ('X', -106), 'Foot_L': ('X', 38), 'Foot_R': ('X', 36),
                    'SpineLower': ('X', -18), 'SpineUpper': ('X', -14), 'Neck': ('X', -10), 'Head': (('X', -22), ('Y', -14)), 'UpperArm_L': (('X', 26), ('Y', -10)), 'Forearm_L': ('X', 12)}),
              (48, {'$pelvis_z': -.47, 'Thigh_L': ('X', 34), 'Thigh_R': ('X', 30), 'Shin_L': ('X', -110), 'Shin_R': ('X', -106), 'Foot_L': ('X', 38), 'Foot_R': ('X', 36),
                    'SpineLower': ('X', -18), 'SpineUpper': ('X', -14), 'Neck': ('X', -10), 'Head': (('X', -22), ('Y', -14)), 'UpperArm_L': (('X', 26), ('Y', -10)), 'Forearm_L': ('X', 12)})],
}
pk.BODY_KEYS = BODY_KEYS

# Staff keys in the rest-space chest frame: (hand station position, staff axis foot->top).
PLANT = (Vector((.49, .07, 1.02)), Vector((.03, .03, 1)))   # foot planted outside the flared hem
STAFF_KEYS = {
    'Idle': [(0, PLANT), (36, (PLANT[0] + Vector((0, .005, .006)), Vector((.03, .06, 1)))), (72, PLANT)],
    'Walk': [(0, (PLANT[0] + Vector((0, .02, .05)), Vector((.03, .18, 1)))), (11, (PLANT[0] + Vector((0, .05, .07)), Vector((.03, -.04, 1)))),
             (22, (PLANT[0] + Vector((0, .02, .05)), Vector((.03, .18, 1))))],
    'Attack': [(0, PLANT), (7, (Vector((.44, .12, 1.12)), Vector((-.10, .12, 1)))),
               (13, (Vector((.30, .40, 1.18)), Vector((-.10, 1, .55)))), (20, (Vector((.36, .26, 1.10)), Vector((-.04, .60, 1)))), (30, PLANT)],
    'CastBlast': [(0, PLANT), (3, (Vector((.36, .20, 1.42)), Vector((-.62, .42, .62)))), (6, (Vector((.28, .14, 1.78)), Vector((-.75, .45, .30)))), (11, (Vector((.34, .40, 1.26)), Vector((-.10, 1, .32)))), (18, PLANT)],
    'Hurt': [(0, PLANT), (4, (PLANT[0] + Vector((.02, -.05, .02)), Vector((.08, -.16, 1)))), (9, (PLANT[0] + Vector((0, -.02, 0)), Vector((.05, 0, 1)))), (15, PLANT)],
}


def staff_world(rig, clip, frame):
    a, b, t = pk.interp_keys(STAFF_KEYS[clip], frame)
    grip = a[0].lerp(b[0], t)
    axis = a[1].normalized().slerp(b[1].normalized(), t).normalized()
    local = Vector((0, 0, 1)).rotation_difference(axis).to_matrix().to_4x4()
    local.translation = grip - axis * GRIP
    chest = pk.skin(rig, 'SpineUpper')
    if clip not in ('Attack', 'CastBlast'):
        return chest @ local
    level = math.sin(math.pi * min(1, frame / FRAMES[clip])) ** .5
    q = chest.to_quaternion().slerp(pk.skin(rig, 'Root').to_quaternion(), level)
    m = q.to_matrix().to_4x4() @ local
    m.translation = chest @ grip - (m.to_3x3() @ Vector((0, 0, 1))) * GRIP
    return m


def apply_pelvis(rig, clip, frame):
    """'$pelvis_z' sinks the pelvis bone (not the Root), so the Root-weighted hem stays down."""
    state = pk.body_state(clip, frame)
    drop = state.get('$pelvis_z', 0.0)
    if drop:
        pb = rig.pose.bones['Pelvis']
        pb.location = Vector(pb.location) + pb.bone.matrix_local.to_3x3().inverted() @ Vector((0, 0, drop))
        bpy.context.view_layer.update()


def death_staff(rig, frame, start_local):
    """The staff is planted beside the right knee as she sinks, then falls with her and lands
    splayed out on the far side of the body."""
    root = pk.skin(rig, 'Root')
    planted = Matrix.Identity(4)
    planted.translation = Vector((.50, .14, .96)) - Vector((0, 0, GRIP))
    # Kneeling: the staff stays planted ahead-right, leaning in toward her slumped shoulder.
    final = Matrix.Rotation(math.radians(-12), 4, 'Y') @ Matrix.Rotation(math.radians(-10), 4, 'X')
    axis = final.to_3x3() @ Vector((0, 0, 1))
    final.translation = Vector((.48, .36, .64)) - axis * GRIP
    b1, b2 = smooth(frame / 9), smooth((frame - 10) / 16)
    m = start_local.copy()
    for target, w in ((planted, b1), (final, b2)):
        q = m.to_quaternion().slerp(target.to_quaternion(), w)
        tr = m.translation.lerp(target.translation, w)
        m = q.to_matrix().to_4x4()
        m.translation = tr
    return root @ m, b2


def staff_points(staff):
    return min((staff @ Vector((0, 0, s))).z for s in (0, .5, 1, 1.5, STAFF + .12)) - .03


def reference_hand(staff):
    rot = staff.to_3x3()
    axis = rot @ Vector((0, 0, 1))
    grip = staff @ Vector((0, 0, GRIP))
    reach = (rot @ REACH).normalized()
    wrist = grip - reach * PALM
    y = reach
    z = (axis - y * axis.dot(y)).normalized()
    x = y.cross(z).normalized()
    m = Matrix((x, y, x.cross(y))).transposed().to_4x4()
    m.translation = wrist
    return m


def author_clips(rig, body):
    scene = bpy.context.scene
    scene.render.fps = FPS
    rig.animation_data_create()
    report = {'ik_residual_m': {}, 'per_frame': {}, 'death_floor_lift_m': []}
    pk.apply_body(rig, 'Idle', 0)
    ref_staff = staff_world(rig, 'Idle', 0)
    ref_hand = reference_hand(ref_staff)
    staffs = {}
    for clip in CLIPS:
        action = bpy.data.actions.new(clip)
        action.use_fake_user = True
        rig.animation_data.action = action
        g.set_action(rig, clip)
        worst = 0.0
        staffs[clip] = {}
        start_local = None
        for frame in range(FRAMES[clip] + 1):
            scene.frame_set(frame)
            pk.apply_body(rig, clip, frame)
            apply_pelvis(rig, clip, frame)
            if clip == 'Death':
                if start_local is None:
                    start_local = staff_world(rig, 'Idle', 0)
                staff, _ = death_staff(rig, frame, start_local)
            else:
                staff = staff_world(rig, clip, frame)
            res = pk.solve_arm(rig, 'R', staff @ ref_staff.inverted() @ ref_hand, POLE, roll=(staff @ Vector((0, 0, GRIP)), staff.to_3x3() @ Vector((0, 0, 1)), SHAFT_R + .003, 180, (clip, 'R')))
            if clip == 'Death' and frame:
                floor = min(pk.evaluated_min_z([body]), staff_points(staff))
                root = rig.pose.bones['Root']
                m = root.matrix.copy()
                m.translation.z += max(0.0, .002 - floor)   # lift only: the pooled hem rests on the ground
                root.matrix = m
                bpy.context.view_layer.update()
                report['death_floor_lift_m'].append(round(.010 - floor, 4))
                staff, _ = death_staff(rig, frame, start_local)
                res = pk.solve_arm(rig, 'R', staff @ ref_staff.inverted() @ ref_hand, POLE, roll=(staff @ Vector((0, 0, GRIP)), staff.to_3x3() @ Vector((0, 0, 1)), SHAFT_R + .003, 180, (clip, 'R')))
            worst = max(worst, res)
            report['per_frame'].setdefault(clip, []).append([frame, round(res, 4)])
            staffs[clip][frame] = staff.copy()
            for pb in rig.pose.bones:
                pb.keyframe_insert('rotation_quaternion', frame=frame, group=pb.name)
                pb.keyframe_insert('location', frame=frame, group=pb.name)
        report['ik_residual_m'][clip] = round(worst, 5)
    pk.fix_quaternion_continuity()
    g.set_action(rig, 'Idle')
    scene.frame_set(0)
    return ref_staff, staffs, report


def staff_parts(detail):
    """Shaft, leather grip, gold collars, a foot ferrule and an OPEN gold sun ring with rays."""
    w = {'Hand_R': 1.0}
    seg = 12 if detail == 0 else 8
    parts = []
    shaft = g.Part('staff_shaft', 'AssemblyDetail_oak')
    pk.lathe(shaft, [(.02, .0165), (.6, SHAFT_R), (1.4, SHAFT_R), (STAFF - .06, .0170)], seg, w)
    parts.append(shaft)
    grip = g.Part('staff_grip', 'AssemblyDetail_leather')
    bands = 6 if detail == 0 else 3
    pk.lathe(grip, [(GRIP - .085 + .17 * k / (bands * 2), SHAFT_R + (.0032 if k % 2 else .0020)) for k in range(bands * 2 + 1)], seg, w)
    parts.append(grip)
    foot = g.Part('staff_foot', 'AssemblyDetail_brass')
    pk.lathe(foot, [(0, .008), (.012, .019), (.06, .0195), (.072, .0175)], seg, w)
    parts.append(foot)
    for z0 in (STAFF - .10, STAFF - .045):
        collar = g.Part('staff_collar', 'AssemblyDetail_brass')
        pk.lathe(collar, [(z0, .018), (z0 + .008, .026), (z0 + .022, .026), (z0 + .03, .018)], seg + 4 if detail == 0 else seg, w)
        parts.append(collar)
    center = Vector((0, 0, STAFF + .12))
    ring = g.Part('sun_ring', 'AssemblyDetail_brass')
    rings, centers = [], []
    n = 28 if detail == 0 else 14
    for k in range(n + 1):
        a = 2 * math.pi * k / n
        c = center + Vector((math.cos(a) * .115, 0, math.sin(a) * .115))
        centers.append(c)
        tangent = Vector((-math.sin(a), 0, math.cos(a)))
        radial = Vector((math.cos(a), 0, math.sin(a)))
        rings.append(ring.ring(c, radial, Vector((0, 1, 0)), .011, .009, 8 if detail == 0 else 6, weights=w))
    ring.loft(rings, centers, cap_start=False, cap_end=False, repeat=.10)
    parts.append(ring)
    neck = g.Part('ring_neck', 'AssemblyDetail_brass')
    pk.lathe(neck, [(STAFF - .02, .018), (STAFF, .014), (center.z - .115 + .004, .010)], seg, w)
    parts.append(neck)
    for k in range(12):
        a = 2 * math.pi * k / 12
        radial = Vector((math.cos(a), 0, math.sin(a)))
        if radial.z < -.8:
            continue  # the neck occupies the bottom ray
        ray = g.Part('sun_ray', 'AssemblyDetail_brass')
        long = .085 if k % 2 == 0 else .055
        base, tip = center + radial * .128, center + radial * (.128 + long)
        side = Vector((0, 1, 0)).cross(radial).normalized()
        rings = [ray.ring(base, side, Vector((0, 1, 0)), .013, .006, 6, p=2.4, weights=w),
                 ray.ring(tip, side, Vector((0, 1, 0)), .0015, .0015, 6, weights=w)]
        ray.loft(rings, [base, tip], repeat=.10)
        parts.append(ray)
    return parts


def build_staff(rig, place, ref_skin, mats, detail):
    parts = []
    for p in staff_parts(detail):
        p = p.transformed(place)
        g.to_bind(p, ref_skin)
        parts.append(p)
    obj = g.parts_to_object(f'MageSunStaff_LOD{detail}', parts, rig, mats)
    obj['rtsProceduralParts'] = json.dumps(sorted({p.name for p in parts}))
    obj.data.set_sharp_from_angle(angle=math.radians(60))
    return obj


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
    decimate(body, 15400)
    rig = pk.build_armature(marks)
    bind_auto(body, rig)
    arm_changes = {s: g.reweight_arm_chain(body, rig, s) for s in 'LR'}
    robe = robe_weights(body, rig)
    sleeves = sleeve_weights(body, rig)
    smoothed = pk.spatial_smooth_weights(body, lambda c: .08 < abs(c.x) < .36 and 1.05 < c.z < 1.46)
    repaired = fill_sparse_auto_weights(body, rig)
    pk.limit_normalize(body)
    gathered = gather_sleeve(body, rig, 'R')
    wr = g.wrist_radius_of([body], rig, 'R')
    wr_l = g.wrist_radius_of([body], rig, 'L')
    # Cut deep inside the sleeves so the cut rim never shows at the wrist; the left (open) hand of
    # the generated body is replaced by a procedural open hand (roster_hands.build_open_hand).
    cut = pk.trim_wrist(body, rig, 'R', proximal=.05)
    cut_l = rigid_left_hand(body, rig, 'L')
    pk.limit_normalize(body)
    mats = {}
    for kind in ('leather', 'oak', 'brass'):
        m = surface(kind)
        m.name = 'AssemblyDetail_' + kind
        mats[m.name] = m
    bare = material('BareSkinHand', (.70, .40, .31), 0, .58)   # linear; matches the lit generated left hand (~sRGB .86/.66/.59)
    g.CLIPS = CLIPS
    ref_staff, staffs, motion = author_clips(rig, body)
    g.set_action(rig, 'Idle')
    bpy.context.scene.frame_set(0)
    ref_skin = g.skin_matrices(rig)
    rot = ref_staff.to_3x3()
    grip = ref_staff @ Vector((0, 0, GRIP))
    axis = (rot @ Vector((0, 0, 1))).normalized()
    wrist = ref_skin['Forearm_R'] @ rig.data.bones['Forearm_R'].tail_local
    # The mage's hands are bare: the closed hand uses a skin surface instead of the glove leather.
    hand_mats = dict(mats)
    hand_mats['AssemblyDetail_leather'] = bare
    hand0, rec = closed_hand('AssemblyHand_R_LOD0', rig, 'R', grip, axis, SHAFT_R + .003, wrist, min(.050, max(.036, wr)), 0, ref_skin, hand_mats, False)
    rec['cut'] = cut
    records = [rec]
    staff0 = build_staff(rig, ref_staff, ref_skin, mats, 0)
    staff1 = build_staff(rig, ref_staff, ref_skin, mats, 1)
    body1 = body.copy()
    body1.data = body.data.copy()
    bpy.context.collection.objects.link(body1)
    body1.name = UNIT + 'OriginalBody_LOD1'
    hand1, _ = lod1_hand('AssemblyHand_R_LOD0')
    rec['skin_patch'] = skin_texture_hand(hand0, body, rig)
    skin_texture_hand(hand1, body, rig)
    open_rec = {'side': 'L', 'kind': 'generated open hand kept, rigidly re-weighted', 'weights': cut_l}
    records.append(dict(rec, lod=1))
    budget = pk.protected_lod_budget(body1, [hand1, staff1])
    pk.limit_normalize(body1)
    objs = {0: [body, hand0, staff0], 1: [body1, hand1, staff1]}
    counts = {f'lod{l}': {o.name: g.tri_count(o) for o in v} for l, v in objs.items()}
    totals = {l: sum(v.values()) for l, v in counts.items()}
    assert totals['lod0'] <= 19900 and 7000 <= totals['lod1'] <= 9900, totals
    weights = {o.name: weight_metrics(o) for v in objs.values() for o in v}
    assert not any(w['unweighted'] or w['max_influences'] > 4 or w['max_weight_sum_error'] > .01 for w in weights.values()), weights
    lifts = g.lift_sinking_frames(rig, objs[0], clips=('Idle', 'Walk', 'Attack', 'CastBlast', 'Hurt'))
    ground = g.ground_report(rig, objs[0])
    ground1 = g.ground_report(rig, objs[1])
    crossings = pk.source_crossings(rig, body, staff0)
    bounds = g.conservative_bounds(objs[0] + objs[1], rig)
    for o in objs[0] + objs[1]:
        o['rtsConservativeBounds'] = bounds[o.name]
    stride = 2.8 * FRAMES['Walk'] / FPS
    motion_meta = {'version': 1, 'locomotion': {'clip': 'Walk', 'strideMeters': round(stride, 4), 'cycleSeconds': FRAMES['Walk'] / FPS},
                   'attack': {'clip': 'Attack', 'durationSeconds': FRAMES['Attack'] / FPS, 'contactSeconds': CONTACT_FRAME / FPS}}
    bpy.context.scene['rtsMotion'] = motion_meta
    setup_render_scene(HEIGHT + .6)
    scene = bpy.context.scene
    scene.world.color = (.45, .45, .45)
    for o in objs[1]:
        o.hide_render = True
    cam = Vector((0, .2, 1.1))
    renders = {}
    for clip in CLIPS:
        g.set_action(rig, clip)
        n = FRAMES[clip]
        for frame in sorted({0, n // 4, n // 2, (3 * n) // 4, n}):
            scene.frame_set(frame)
            renders[f'{clip}-{frame}'] = render_view(f'{clip}{frame}', cam + Vector((4.4, 4.4, 3.3)), cam, 3.2, 360, 420, qa / f'blender/{clip.lower()}-{frame:02d}.png')
    g.set_action(rig, 'Idle')
    scene.frame_set(0)
    for view, loc in (('front', Vector((0, 6, 0))), ('side', Vector((6, 0, 0))), ('back', Vector((0, -6, 0)))):
        renders[view] = render_view(view, cam + loc, cam, 2.9, 560, 760, qa / f'blender/{view}.png')
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
    report = {'unit': UNIT, 'source': source, 'fps': FPS, 'frames': FRAMES, 'contact_frame': CONTACT_FRAME, 'contact_seconds': CONTACT_FRAME / FPS,
              'cast_flare_frame': CAST_FRAME, 'rtsMotion': motion_meta, 'bones': list(rig.data.bones.keys()), 'clips': list(CLIPS),
              'arm_chain_reweighted_vertices': arm_changes, 'robe_skirt_vertices': robe, 'sleeve_reowned_vertices': sleeves, 'gathered_right_sleeve_vertices': gathered, 'shoulder_smoothed_vertices': smoothed,
              'repaired_sparse_weights': len(repaired), 'wrist_radius_m': wr, 'hands': records, 'open_hands': [open_rec], 'triangles': counts, 'totals': totals,
              'lod1_budget': budget, 'weights': weights, 'motion': motion, 'root_lift': lifts, 'ground': {'lod0': ground, 'lod1': ground1},
              'source_crossings': crossings, 'bounds': bounds, 'renders': renders, 'blend': {'path': blend.as_posix(), 'sha256': pk.sha(blend)},
              'exports': exports, 'runtime_publish_allowed': False}
    pk.save(qa / 'build.json', report)
    print('ROSTER_MAGE=' + json.dumps({'totals': totals, 'ik': motion['ik_residual_m'], 'crossings': {c: len(v) for c, v in crossings.items()}, 'ground': ground}), flush=True)


if __name__ == '__main__':
    main()
