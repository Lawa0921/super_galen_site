"""Procedural original closed-grip gauntlets and guard legwear; rebuild worker, crossbow and guard.

Every new vertex in this tool is computed from code primitives (superellipse rings swept along
analytic arcs and lofts), the rig's bones and the clean weapon's grip axis. No mesh is imported,
appended, sampled, ray-cast or used as a fitting reference. Clean inputs only:
  worker   : human-units/2026-10-05-v1 worker-production-v1.blend (TripoSR body, Blender rig/axe/clips)
  crossbow : human-units/2026-10-05-v1 crossbow-production-v1.blend body (TripoSR) +
             detail-refinement crossbow.blend rig, baked two-hand clips and procedural weapon
             (its restricted grip objects are deleted unopened; its glove-fitted body is not used)
  guard    : guard-neural-pilot production-v1 guard-production-v1.blend (original builtin-imagegen concept ->
             TripoSR (MIT) body, same pipeline as the other human units; Blender sword/shield) + only the
             authored 30 fps clips from detail-refinement guard.blend (no mesh from it is used).

Usage: blender --background --factory-startup --python-exit-code 1 --python procedural_gauntlet_build.py --
       --unit worker|crossbow|guard --run <run dir> [--skip-render]
"""
from __future__ import annotations

import hashlib
import json
import math
import os
import sys
from pathlib import Path

import bpy
import bmesh
from mathutils import Matrix, Vector

sys.path.insert(0, str(Path(__file__).resolve().parent))
from procedural_crossbow_build import build_crossbow_parts  # noqa: E402

ROOT = Path(__file__).resolve().parents[3]
TOOL = Path(__file__).resolve()
CLIPS = ("Idle", "Walk", "Attack", "Hurt", "Death")
# Object names produced by the Hunyuan-derived chain. They are deleted from the clean source
# before any new geometry exists and must never appear in an output.
RESTRICTED_PREFIXES = ("WorkerOriginalGrip", "OriginalCrossbowClosedGrip", "GuardBoot_", "GuardHandGrip_",
                       "GuardPaddedLegLayer", "GuardLegArmor_", "OriginalGripLowCandidate")
SOURCES = {
    "worker": {"blend": "art-factory/rts/runs/human-units/2026-10-05-v1/worker/candidate/worker-production-v1.blend"},
    "crossbow": {"blend": "art-factory/rts/runs/detail-refinement/2026-10-07-v1/raw/crossbow.blend",
                 "body_blend": "art-factory/rts/runs/human-units/2026-10-05-v1/crossbow/candidate/crossbow-production-v1.blend"},
    # A2: the guard uses the same TripoSR concept pipeline as the other human units (guard-neural-pilot
    # production-v1: original builtin-imagegen concept -> TripoSR, MIT), plus the guard's authored 30 fps
    # clips from the original guard rig (identical bind pose for all 20 shared bones; checked at build time).
    "guard": {"blend": "art-factory/rts/runs/guard-neural-pilot/production-v1/candidate/guard-production-v1.blend",
              "clips_blend": "art-factory/rts/runs/detail-refinement/2026-10-07-v1/raw/guard.blend"},
}


def sha(path: Path) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for block in iter(lambda: f.read(1 << 20), b""):
            h.update(block)
    return h.hexdigest()


def smooth(x: float) -> float:
    x = max(0.0, min(1.0, x))
    return x * x * (3 - 2 * x)


# ----------------------------------------------------------------------------------------------
# Geometry kernel: rings of superellipse cross-sections joined into quads, with physical UVs.
# ----------------------------------------------------------------------------------------------
class Part:
    """Accumulates one mesh part: vertices, quad/tri faces, per-loop UVs and per-vertex weights."""

    def __init__(self, name: str, material: str):
        self.name, self.material = name, material
        self.verts: list[Vector] = []
        self.weights: list[dict[str, float]] = []
        self.faces: list[tuple[int, ...]] = []
        self.uvs: list[tuple[tuple[float, float], ...]] = []

    def ring(self, center, U, V, a, b, n, p=2.0, phase=0.0, weights=None):
        idx = []
        for j in range(n):
            phi = phase + 2 * math.pi * j / n
            c, s = math.cos(phi), math.sin(phi)
            sx = math.copysign(abs(c) ** (2.0 / p), c)
            sy = math.copysign(abs(s) ** (2.0 / p), s)
            idx.append(len(self.verts))
            self.verts.append(Vector(center) + Vector(U) * (a * sx) + Vector(V) * (b * sy))
            self.weights.append(dict(weights or {}))
        return idx

    def loft(self, rings, centers, cap_start=True, cap_end=True, repeat=0.06):
        """Quads between consecutive rings; u along path length, v around the perimeter."""
        n = len(rings[0])
        dist = [0.0]
        for k in range(1, len(centers)):
            dist.append(dist[-1] + (Vector(centers[k]) - Vector(centers[k - 1])).length)
        perim = []
        for r in rings:
            perim.append(sum((self.verts[r[(j + 1) % n]] - self.verts[r[j]]).length for j in range(n)))
        for k in range(len(rings) - 1):
            a, b = rings[k], rings[k + 1]
            for j in range(n):
                j2 = (j + 1) % n
                self.faces.append((a[j], a[j2], b[j2], b[j]))
                va, vb = perim[k] / repeat, perim[k + 1] / repeat
                self.uvs.append(((dist[k] / repeat, va * j / n), (dist[k] / repeat, va * (j + 1) / n),
                                 (dist[k + 1] / repeat, vb * (j + 1) / n), (dist[k + 1] / repeat, vb * j / n)))
        for ring_idx, center, flip in ((rings[0], centers[0], True), (rings[-1], centers[-1], False)):
            if (flip and not cap_start) or (not flip and not cap_end):
                continue
            ci = len(self.verts)
            self.verts.append(sum((self.verts[i] for i in ring_idx), Vector()) / n)
            self.weights.append(dict(self.weights[ring_idx[0]]))
            for j in range(n):
                j2 = (j + 1) % n
                tri = (ci, ring_idx[j2], ring_idx[j]) if flip else (ci, ring_idx[j], ring_idx[j2])
                self.faces.append(tri)
                uv = []
                for vi in tri:
                    d = self.verts[vi] - self.verts[ci]
                    uv.append((0.5 + d.x / repeat, 0.5 + (d.y + d.z) / repeat))
                self.uvs.append(tuple(uv))

    def transformed(self, matrix: Matrix, mirror_x=False):
        out = Part(self.name, self.material)
        out.weights = [dict(w) for w in self.weights]
        for v in self.verts:
            p = Vector((-v.x, v.y, v.z)) if mirror_x else v.copy()
            out.verts.append(matrix @ p)
        if mirror_x:
            out.faces = [tuple(reversed(f)) for f in self.faces]
            out.uvs = [tuple(reversed(u)) for u in self.uvs]
        else:
            out.faces, out.uvs = list(self.faces), list(self.uvs)
        return out


def parts_to_object(name: str, parts: list[Part], rig, materials: dict, uv_name="UVMap"):
    """Create one skinned mesh object from several parts (each its own closed shell)."""
    verts, faces, uvs, mats, weights = [], [], [], [], []
    slot_names = []
    for part in parts:
        if part.material not in slot_names:
            slot_names.append(part.material)
        base = len(verts)
        verts.extend(part.verts)
        weights.extend(part.weights)
        for f, uv in zip(part.faces, part.uvs):
            faces.append(tuple(base + i for i in f))
            uvs.append(uv)
            mats.append(slot_names.index(part.material))
    mesh = bpy.data.meshes.new(name + "Mesh")
    mesh.from_pydata([tuple(v) for v in verts], [], faces)
    mesh.validate(clean_customdata=False)
    uv_layer = mesh.uv_layers.new(name=uv_name)
    for poly, uv, mi in zip(mesh.polygons, uvs, mats):
        poly.material_index = mi
        poly.use_smooth = True
        for li, coord in zip(poly.loop_indices, uv):
            uv_layer.data[li].uv = coord
    for m in slot_names:
        mesh.materials.append(materials[m])
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.scene.collection.objects.link(obj)
    obj.parent = rig
    obj.matrix_parent_inverse = Matrix.Identity(4)
    groups = {}
    for i, w in enumerate(weights):
        total = sum(w.values()) or 1.0
        for bone, value in w.items():
            if value <= 1e-5:
                continue
            if bone not in groups:
                groups[bone] = obj.vertex_groups.new(name=bone)
            groups[bone].add([i], value / total, "REPLACE")
    mod = obj.modifiers.new("Skin", "ARMATURE")
    mod.object = rig
    # Shade smooth with angle-based sharp edges for crisp knuckle/cuff creases.
    try:
        mesh.set_sharp_from_angle(angle=math.radians(50))
    except Exception:
        pass
    return obj


# ----------------------------------------------------------------------------------------------
# Closed-grip gauntlet in a canonical right-hand frame.
#   origin = grip (haft) centre, +Z = thumb direction along the haft, +X = back-of-hand normal,
#   +Y = Z x X = wrist -> knuckle direction. Fingers curl about +Z from +X through +Y to -X.
# ----------------------------------------------------------------------------------------------
GAUNTLET_DEFAULTS = {
    "finger_width": 0.0235,       # along the haft, per finger
    "finger_thickness": 0.0215,   # radial
    "gap": 0.0015,                # clearance between haft surface and finger inner face
    "repeat": 0.06,               # physical UV tile size in metres
}


def section_point(theta: float, ex: float, ey: float, pexp: float, offset: float):
    """Point and outward normal on a superellipse grip section (semi-axes ex, ey) offset by `offset`."""
    def raw(t):
        c, s_ = math.cos(t), math.sin(t)
        return Vector((ex * math.copysign(abs(c) ** (2.0 / pexp), c), ey * math.copysign(abs(s_) ** (2.0 / pexp), s_), 0))
    e = 1e-3
    tangent = (raw(theta + e) - raw(theta - e)).normalized()
    normal = Vector((tangent.y, -tangent.x, 0))
    if normal.dot(raw(theta)) < 0:
        normal = -normal
    return raw(theta) + normal * offset, normal


def fist_parts(r: float, wrist_local: Vector, wrist_radius: float, cfg: dict, detail: int, glove: str, plate: str,
               section=None):
    fw, ft, gap, rep = cfg["finger_width"], cfg["finger_thickness"], cfg["gap"], cfg["repeat"]
    ex, ey, pexp = section if section else (r, r, 2.0)
    seg, prof = (12, 8) if detail == 0 else (6, 5)
    parts = []
    w_hand = {"Hand": 1.0}
    # Centre the four fingers on the haft, nudged toward the wrist's axial position.
    z_shift = max(-0.6 * fw, min(0.6 * fw, wrist_local.z * 0.35))
    # Mitten-style finger block: one curled sweep around the haft, with three shallow grooves on the
    # outer surface marking four fingers, a knuckle swell and a rounded, slightly receding tip edge.
    block = Part("fingers", glove)
    m = 20 if detail == 0 else 10
    half_axial = 2.0 * fw * 1.02
    end_deg = 318.0
    rings, centers = [], []
    for k in range(seg + 1):
        u = k / seg
        theta = math.radians(-14 + (end_deg + 14) * u)
        base, radial = section_point(theta, ex, ey, pexp, gap + ft / 2)
        swell = 1.0 + 0.2 * math.exp(-((u - 0.1) / 0.08) ** 2)
        tip = 0.55 + 0.45 * smooth((1.0 - u) / 0.12) if u > 0.88 else 1.0
        c = base + Vector((0, 0, z_shift))
        centers.append(c)
        ring = []
        for j in range(m):
            phi = 2 * math.pi * j / m
            cx, cy = math.cos(phi), math.sin(phi)
            sx = math.copysign(abs(cx) ** (2.0 / 2.4), cx)
            sy = math.copysign(abs(cy) ** (2.0 / 3.6), cy)
            # Pinky side recedes and thins a little; index side is fullest.
            z = sy * half_axial * (0.9 + 0.1 * tip)
            zf = (z / fw)  # -2..2 finger units
            taper = 1.0 - 0.12 * smooth((-zf - 0.6) / 1.4)
            groove = 1.0
            if sx > 0.2:
                groove -= 0.2 * sum(math.exp(-((zf - b) / 0.16) ** 2) for b in (-1.0, 0.0, 1.0))
            rad = (ft / 2) * sx * swell * tip * taper * groove
            ring.append(len(block.verts))
            block.verts.append(base + radial * rad + Vector((0, 0, z_shift + z)))
            block.weights.append(dict(w_hand))
        rings.append(ring)
    block.loft(rings, centers, repeat=rep)
    parts.append(block)
    # Closed palm core inside the curl: the fist never reads as a hollow "C" when the grip is
    # narrower than the channel or seen end-on; capped ends close the fist around the haft.
    core = Part("core", glove)
    rings, centers = [], []
    for zc in (-half_axial * 0.9, half_axial * 0.9):
        c = Vector((0, 0, z_shift + zc))
        centers.append(c)
        rings.append(core.ring(c, Vector((1, 0, 0)), Vector((0, 1, 0)), ex + gap + ft * 0.3, ey + gap + ft * 0.3,
                               max(prof + 2, 8), p=pexp, weights=w_hand))
    core.loft(rings, centers, repeat=rep)
    parts.append(core)
    # Thumb: wraps the opposite way over the index finger, from the back of the hand.
    thumb = Part("thumb", glove)
    tt, tw = ft * 1.05, fw * 1.05
    z = 1.45 * fw + z_shift
    rings, centers = [], []
    tseg = max(4, seg * 2 // 3)
    for k in range(tseg + 1):
        u = k / tseg
        theta = math.radians(-38 - 150 * u)
        base, radial = section_point(theta, ex, ey, pexp, gap + ft * 0.92 + tt * 0.4)
        tip = 0.6 + 0.4 * smooth((1.0 - u) / 0.2) if u > 0.8 else 1.0
        c = base + Vector((0, 0, z - 0.25 * fw * u))
        centers.append(c)
        rings.append(thumb.ring(c, radial, Vector((0, 0, 1)), tt / 2 * tip, tw / 2 * (0.8 + 0.2 * tip), prof, p=2.4, weights=w_hand))
    thumb.loft(rings, centers, repeat=rep)
    parts.append(thumb)
    # Hand back + palm: a loft from the knuckle line to the wrist; the wrist end blends to the forearm.
    back = Part("back", plate)
    knuckle = Vector((ex + gap + ft * 0.45, -0.004, z_shift))
    span = wrist_local - knuckle
    steps = 5 if detail == 0 else 3
    rings, centers = [], []
    for k in range(steps + 1):
        u = k / steps
        c = knuckle.lerp(wrist_local, u) + Vector((1, 0, 0)) * (0.006 * math.sin(math.pi * u))
        direction = span.normalized()
        width_axis = (Vector((0, 0, 1)) - direction * direction.z).normalized()
        thick_axis = direction.cross(width_axis).normalized()
        if thick_axis.x < 0:
            thick_axis = -thick_axis
        half_w = (2.0 * fw * 1.02) * (1 - u) + wrist_radius * 1.02 * u
        half_t = (ft * 0.62) * (1 - u) + wrist_radius * 0.8 * u
        fore = smooth((u - 0.45) / 0.55) * 0.75
        centers.append(c)
        rings.append(back.ring(c, thick_axis, width_axis, half_t, half_w, max(prof, 8), p=3.2,
                               weights={"Hand": 1.0 - fore, "Forearm": fore}))
    back.loft(rings, centers, repeat=rep)
    parts.append(back)
    return parts


def cuff_part(wrist: Vector, forearm_dir: Vector, wrist_radius: float, material: str, detail: int,
              flare: float, length: float, repeat: float):
    """Cuff around the forearm end (world/reference space). Proximal rings follow the forearm."""
    part = Part("cuff", material)
    n = 14 if detail == 0 else 8
    f = forearm_dir.normalized()
    U = f.orthogonal().normalized()
    V = f.cross(U).normalized()
    rings, centers = [], []
    samples = [(-length, flare, 1.0), (-length * 0.55, 1.18, 0.85), (-0.004, 1.13, 0.45), (0.018, 1.08, 0.2)]
    for s, scale, fore in samples:
        c = wrist + f * s
        centers.append(c)
        rings.append(part.ring(c, U, V, wrist_radius * scale, wrist_radius * scale * 0.92, n,
                               weights={"Forearm": fore, "Hand": 1 - fore}))
    part.loft(rings, centers, cap_start=False, cap_end=True, repeat=repeat)
    return part


def hand_frame(grip_center: Vector, grip_axis: Vector, wrist: Vector, r: float, cfg: dict, side: str, outward: Vector):
    """Return (matrix canonical->reference, wrist in canonical, thumb axis) choosing the axis sign whose
    back-of-hand normal faces `outward`. Left hands use the mirrored canonical model (x -> -x)."""
    p_mag = r + cfg["gap"] + cfg["finger_thickness"] * 0.5
    best = None
    for sign in (1.0, -1.0):
        a = grip_axis.normalized() * sign
        d = wrist - grip_center
        da = d.dot(a)
        dperp = d - a * da
        D = max(dperp.length, p_mag + 0.03)
        L = math.sqrt(max(1e-6, D * D - p_mag * p_mag))
        p = p_mag if side == "R" else -p_mag
        q = -L
        e1 = dperp.normalized()
        e2 = a.cross(e1)
        alpha = math.atan2(-q, p)
        X = e1 * math.cos(alpha) + e2 * math.sin(alpha)
        Y = a.cross(X)
        back = X if side == "R" else -X
        score = back.dot(outward)
        m = Matrix.Identity(4)
        for row in range(3):
            m[row][0], m[row][1], m[row][2], m[row][3] = X[row], Y[row], a[row], grip_center[row]
        local = m.inverted() @ wrist
        if side == "L":
            local = Vector((-local.x, local.y, local.z))
        if best is None or score > best[0]:
            best = (score, m, local, a)
    return best[1], best[2], best[3]


def build_gauntlet(name, rig, side, grip_center, grip_axis, grip_radius, wrist, forearm_dir, wrist_radius,
                   outward, materials, glove, plate, cuff_mat, detail, ref_matrices, flare=1.26, cuff_len=0.05,
                   scale=1.0, grip_points=None, boxy=False):
    """Build one gauntlet in reference (posed) world space and convert to bind space per vertex."""
    cfg = dict(GAUNTLET_DEFAULTS)
    cfg["finger_width"] *= scale
    cfg["finger_thickness"] *= scale
    m, wrist_local, axis = hand_frame(grip_center, grip_axis, wrist, grip_radius, cfg, side, outward)
    section = None
    if grip_points:
        inv = m.inverted()
        local = [inv @ p for p in grip_points]
        local = [p for p in local if abs(p.z) < 2.6 * cfg["finger_width"]] or local
        xs = sorted(abs(p.x) for p in local)
        ys = sorted(abs(p.y) for p in local)
        pick = lambda v: v[min(len(v) - 1, int(len(v) * 0.95))]
        section = (max(0.012, pick(xs)), max(0.012, pick(ys)), 3.2 if boxy else 2.0)
    parts = [pt.transformed(m, mirror_x=(side == "L")) for pt in
             fist_parts(grip_radius, wrist_local, wrist_radius, cfg, detail, glove, plate, section)]
    parts.append(cuff_part(wrist, forearm_dir, wrist_radius, cuff_mat, detail, flare, cuff_len, cfg["repeat"]))
    bones = {"Hand": "Hand_" + side, "Forearm": "Forearm_" + side}
    for part in parts:
        part.weights = [{bones[k]: v for k, v in w.items()} for w in part.weights]
        to_bind(part, ref_matrices)
    obj = parts_to_object(name, parts, rig, materials)
    obj["rtsProceduralOrigin"] = "procedural_gauntlet_build.py closed-grip gauntlet; code primitives only"
    record = {"object": name, "side": side, "grip_center_ref": list(grip_center), "thumb_axis_ref": list(axis),
              "grip_radius_m": grip_radius, "wrist_ref": list(wrist), "wrist_radius_m": wrist_radius,
              "palm_length_m": (wrist - grip_center).length, "triangles": tri_count(obj), "detail": detail,
              "grip_section_m": list(section) if section else None}
    return obj, record


def to_bind(part: Part, ref_matrices: dict):
    """Map reference-pose world positions to bind space: v_bind = (sum w_i M_i)^-1 v_world."""
    for i, (v, w) in enumerate(zip(part.verts, part.weights)):
        total = sum(w.values()) or 1.0
        blended = Matrix(((0, 0, 0, 0), (0, 0, 0, 0), (0, 0, 0, 0), (0, 0, 0, 0)))
        for bone, value in w.items():
            mat = ref_matrices[bone]
            for r in range(4):
                for c in range(4):
                    blended[r][c] += mat[r][c] * value / total
        part.verts[i] = blended.inverted() @ v


def skin_matrices(rig) -> dict:
    """Current pose skinning matrices (world-from-bind) per bone, with an identity rig transform."""
    out = {}
    for pb in rig.pose.bones:
        out[pb.name] = rig.matrix_world @ pb.matrix @ pb.bone.matrix_local.inverted() @ rig.matrix_world.inverted()
    return out


def tri_count(obj) -> int:
    return sum(len(p.vertices) - 2 for p in obj.data.polygons)


# ----------------------------------------------------------------------------------------------
# Guard legwear: padded leggings, cuisses, poleyns, greaves and boots from bones only.
# ----------------------------------------------------------------------------------------------
def leg_parts(rig, side: str, detail: int):
    b = rig.data.bones
    mw = rig.matrix_world
    hip = mw @ b["Thigh_" + side].head_local
    knee = mw @ b["Shin_" + side].head_local
    ankle = mw @ b["Foot_" + side].head_local
    toe = mw @ b["Foot_" + side].tail_local
    sx = 1.0 if side == "R" else -1.0
    n = 12 if detail == 0 else 7
    rep = 0.07
    parts = []
    T, S, F, K, P = "Thigh_" + side, "Shin_" + side, "Foot_" + side, "KneeSupport_" + side, "Pelvis"
    fwd = Vector((0, 1, 0))
    # Leggings: one continuous tube hip -> ankle with blended weights through the knee.
    leg = Part("leggings", "TeamCloth.001")
    path = [(hip + Vector((0, 0, 0.05)), 0.098, {P: 0.55, T: 0.45}),
            (hip.lerp(knee, 0.18), 0.1, {T: 1.0}),
            (hip.lerp(knee, 0.55), 0.09, {T: 1.0}),
            (knee + Vector((0, 0, 0.035)), 0.078, {T: 0.75, S: 0.25}),
            (knee - Vector((0, 0, 0.03)), 0.074, {T: 0.25, S: 0.75}),
            (knee.lerp(ankle, 0.42), 0.076, {S: 1.0}),
            (ankle + Vector((0, 0, 0.035)), 0.06, {S: 1.0})]
    if detail:
        path = [path[0], path[2], path[3], path[4], path[5], path[6]]
    rings, centers = [], []
    for c, rad, w in path:
        centers.append(c)
        rings.append(leg.ring(c, Vector((1, 0, 0)), fwd, rad, rad * 0.93, n, weights=w))
    leg.loft(rings, centers, cap_start=True, cap_end=True, repeat=rep)
    parts.append(leg)

    def shell(name, top, bottom, rad_top, rad_bot, coverage_deg, thickness, bone_w, mat="GuardSteel_Surface", bulge=0.0):
        """Curved plate covering the front of a limb segment, closed with an inner face."""
        part = Part(name, mat)
        cols = 9 if detail == 0 else 5
        rows = 4 if detail == 0 else 2
        grid_o, grid_i = [], []
        half = math.radians(coverage_deg) / 2
        for ri in range(rows + 1):
            v = ri / rows
            c = top.lerp(bottom, v)
            rad = rad_top * (1 - v) + rad_bot * v
            row_o, row_i = [], []
            for ci in range(cols + 1):
                ang = -half + 2 * half * ci / cols
                radial = Vector((math.sin(ang) * sx, math.cos(ang), 0))  # 0 deg = forward
                lift = 1.0 + bulge * math.sin(math.pi * v) * math.cos(ang)
                row_o.append(len(part.verts)); part.verts.append(c + radial * rad * lift); part.weights.append(dict(bone_w))
                row_i.append(len(part.verts)); part.verts.append(c + radial * (rad * lift - thickness)); part.weights.append(dict(bone_w))
            grid_o.append(row_o); grid_i.append(row_i)
        width = 2 * half * rad_top
        height = (top - bottom).length
        def uv(ri, ci):
            return (ci / cols * width / rep, ri / rows * height / rep)
        for ri in range(rows):
            for ci in range(cols):
                o = (grid_o[ri][ci], grid_o[ri + 1][ci], grid_o[ri + 1][ci + 1], grid_o[ri][ci + 1])
                quad = (o if sx > 0 else tuple(reversed(o)))
                part.faces.append(quad)
                part.uvs.append(tuple(uv(*rc) for rc in ((ri, ci), (ri + 1, ci), (ri + 1, ci + 1), (ri, ci + 1)))
                    if sx > 0 else tuple(uv(*rc) for rc in ((ri, ci + 1), (ri + 1, ci + 1), (ri + 1, ci), (ri, ci))))
                i = (grid_i[ri][ci], grid_i[ri][ci + 1], grid_i[ri + 1][ci + 1], grid_i[ri + 1][ci])
                part.faces.append(i if sx > 0 else tuple(reversed(i)))
                part.uvs.append(((0, 0), (0.1, 0), (0.1, 0.1), (0, 0.1)))
        # Rolled edges: connect outer and inner along the four borders.
        border = ([(ri, 0) for ri in range(rows + 1)], [(ri, cols) for ri in range(rows + 1)],
                  [(0, ci) for ci in range(cols + 1)], [(rows, ci) for ci in range(cols + 1)])
        for edge_i, chain in enumerate(border):
            for (r1, c1), (r2, c2) in zip(chain, chain[1:]):
                q = (grid_o[r1][c1], grid_i[r1][c1], grid_i[r2][c2], grid_o[r2][c2])
                flip = (edge_i in (0, 3)) != (sx < 0)
                part.faces.append(tuple(reversed(q)) if flip else q)
                part.uvs.append(((0, 0), (0.05, 0), (0.05, 0.05), (0, 0.05)))
        return part

    thigh_axis_top = hip.lerp(knee, 0.2)
    parts.append(shell("cuisse", thigh_axis_top, hip.lerp(knee, 0.86), 0.114, 0.096, 210, 0.007, {T: 1.0}, bulge=0.05))
    parts.append(shell("greave", knee - Vector((0, 0, 0.05)), ankle + Vector((0, 0, 0.11)), 0.092, 0.084, 250, 0.007,
                       {S: 1.0}, bulge=0.06))
    # Poleyn (knee cop): a flattened dome on the knee front with a small side wing.
    pol = Part("poleyn", "GuardSteel_Surface")
    pc = knee + fwd * 0.064 + Vector((0, 0, 0.005))
    m = 10 if detail == 0 else 6
    rings, centers = [], []
    for k, (off, rad) in enumerate([(-0.024, 0.008), (-0.013, 0.05), (0.0, 0.062), (0.013, 0.052), (0.022, 0.012)]):
        c = pc + fwd * (off * 0.6)
        centers.append(c)
        rings.append(pol.ring(c, Vector((1, 0, 0)), Vector((0, 0, 1)), rad * 1.05, rad * 1.15, m, weights={K: 0.5, T: 0.25, S: 0.25}))
    pol.loft(rings, centers, repeat=rep)
    parts.append(pol)
    # Boot: shaft tube (shin) + rounded foot block (foot) + low heel; sole flush with the ground plane.
    boot = Part("boot_shaft", "GuardLeather_Surface")
    rings, centers = [], []
    shaft = [(ankle + Vector((0, 0, 0.15)), 0.094, {S: 1.0}), (ankle + Vector((0, 0, 0.125)), 0.086, {S: 1.0}),
             (ankle + Vector((0, 0, 0.06)), 0.078, {S: 1.0}), (ankle + Vector((0, 0, 0.0)), 0.074, {S: 0.6, F: 0.4})]
    for c, rad, w in shaft:
        centers.append(c)
        rings.append(boot.ring(c, Vector((1, 0, 0)), fwd, rad, rad * 0.96, n, weights=w))
    boot.loft(rings, centers, cap_start=False, cap_end=True, repeat=rep)
    parts.append(boot)
    foot = Part("boot_foot", "GuardLeather_Surface")
    heel_y = ankle.y - 0.075
    toe_y = max(toe.y + 0.06, ankle.y + 0.215)
    steps = 6 if detail == 0 else 3
    rings, centers = [], []
    for k in range(steps + 1):
        u = k / steps
        y = heel_y + (toe_y - heel_y) * u
        top_h = 0.14 * (1 - smooth((u - 0.25) / 0.6)) + 0.065 * smooth((u - 0.25) / 0.6)
        if u > 0.9:
            top_h *= 0.6 + 0.4 * (1 - u) / 0.1
        half_w = 0.064 * (0.82 + 0.25 * math.sin(math.pi * min(1.0, u * 1.25))) * (0.55 + 0.45 * smooth((1 - u) / 0.15))
        half_h = max(0.01, top_h / 2)
        c = Vector((ankle.x, y, half_h))
        centers.append(c)
        rings.append(foot.ring(c, Vector((1, 0, 0)), Vector((0, 0, 1)), half_w, half_h, n, p=3.0,
                               weights={F: 1.0} if u > 0.2 else {F: 0.8, S: 0.2}))
    foot.loft(rings, centers, repeat=rep)
    parts.append(foot)
    return parts


# ----------------------------------------------------------------------------------------------
# Source preparation helpers.
# ----------------------------------------------------------------------------------------------
def set_action(rig, name):
    act = bpy.data.actions[name]
    rig.animation_data_create()
    rig.animation_data.action = act
    slots = getattr(act, "slots", None)
    if slots:
        try:
            rig.animation_data.action_slot = slots[0]
        except Exception:
            pass


def remove_restricted():
    removed = []
    for obj in list(bpy.data.objects):
        if obj.name.startswith(RESTRICTED_PREFIXES):
            removed.append(obj.name)
            mesh = obj.data if obj.type == "MESH" else None
            bpy.data.objects.remove(obj, do_unlink=True)
            if mesh is not None and mesh.users == 0:
                bpy.data.meshes.remove(mesh)
    return removed


def weapon_region(obj, material_names, near=None, radius=None):
    """Grip axis of a clean weapon from its own vertices (rest/bind space): centre, axis, median radius."""
    import numpy as np
    me = obj.data
    idx = {i for i, m in enumerate(me.materials) if m and m.name in material_names}
    vs = set()
    for p in me.polygons:
        if p.material_index in idx:
            vs.update(p.vertices)
    pts = [obj.matrix_world @ me.vertices[i].co for i in vs]
    if near is not None:
        pts = [p for p in pts if (p - near).length <= radius]
    P = np.array([tuple(p) for p in pts])
    c = P.mean(0)
    _, _, vt = np.linalg.svd(P - c)
    ax = vt[0]
    proj = (P - c) @ ax
    rad = np.linalg.norm((P - c) - np.outer(proj, ax), axis=1)
    return Vector(c.tolist()), Vector(ax.tolist()).normalized(), float(np.median(rad)), float(proj.min()), float(proj.max())


def region_points(obj, material_names):
    """World (bind-space) vertex positions of a clean weapon's material region."""
    me = obj.data
    idx = {i for i, m in enumerate(me.materials) if m and m.name in material_names}
    vs = {v for p in me.polygons if p.material_index in idx for v in p.vertices}
    return [obj.matrix_world @ me.vertices[i].co for i in vs]


def envelope_reweight(body, rig, side, power=6.0, reach=0.17):
    """Spatially smooth arm/shoulder weights: inverse-distance-to-bone-segment blend (top 4).

    TripoSR shells contain disconnected plates; connectivity-based (bone heat) weights let neighbouring
    plates follow different bones and shred under large arm swings. A purely spatial falloff makes every
    surface point near the arm move like its neighbours, whatever island it belongs to.
    """
    b = rig.data.bones
    arm = [n + "_" + side for n in ("UpperArm", "Forearm", "Hand")]
    cand = arm + ["Shoulder_" + side, "SpineUpper", "Neck"]
    segs = {n: (b[n].head_local, b[n].tail_local) for n in cand if n in b}
    changed = 0
    for v in body.data.vertices:
        sidex = v.co.x if side == "R" else -v.co.x
        if sidex < 0.08:
            continue
        d = {n: max(0.012, segment_param(v.co, *segs[n])[1]) for n in segs}
        if min(d[n] for n in arm) > reach:
            continue
        raw = {n: dist ** -power for n, dist in d.items()}
        best = sorted(raw.items(), key=lambda kv: kv[1], reverse=True)[:4]
        total = sum(w for _, w in best)
        # Fade into the original weights at the edge of the region.
        fade = 1.0 - smooth((min(d[n] for n in arm) - (reach - 0.04)) / 0.04)
        old = {body.vertex_groups[g.group].name: g.weight for g in v.groups}
        tot_old = sum(old.values()) or 1.0
        new = {n: w / tot_old * (1 - fade) for n, w in old.items()}
        for n, w in best:
            new[n] = new.get(n, 0.0) + w / total * fade
        top = sorted(new.items(), key=lambda kv: kv[1], reverse=True)[:4]
        t2 = sum(w for _, w in top) or 1.0
        for g in list(v.groups):
            body.vertex_groups[g.group].remove([v.index])
        for n, w in top:
            if w > 1e-5:
                (body.vertex_groups.get(n) or body.vertex_groups.new(name=n)).add([v.index], w / t2, "REPLACE")
        changed += 1
    return changed


def trim_open_hand(body, rig, side):
    """Delete the clean body's open-hand faces past the wrist; the gauntlet cuff covers the cut."""
    hb = rig.data.bones["Hand_" + side]
    fb = rig.data.bones["Forearm_" + side]
    wrist = hb.head_local
    f = (fb.tail_local - fb.head_local).normalized()
    group = body.vertex_groups.get("Hand_" + side)
    if group is None:
        raise RuntimeError("Body lacks Hand_" + side)
    gi = group.index
    me = body.data
    hand_w = [next((g.weight for g in v.groups if g.group == gi), 0.0) for v in me.vertices]
    bm = bmesh.new()
    bm.from_mesh(me)
    bm.faces.ensure_lookup_table()
    doomed = []
    for face in bm.faces:
        c = face.calc_center_median()
        d = c - wrist
        axial = d.dot(f)
        radial = (d - f * axial).length
        w = sum(hand_w[v.index] for v in face.verts) / len(face.verts)
        if (axial > 0.006 and radial < 0.14 and w > 0.3) or (axial > -0.015 and radial < 0.12 and w > 0.6):
            doomed.append(face)
    bmesh.ops.delete(bm, geom=doomed, context="FACES")
    loose = [v for v in bm.verts if not v.link_faces]
    bmesh.ops.delete(bm, geom=loose, context="VERTS")
    bm.to_mesh(me)
    bm.free()
    me.update()
    return len(doomed)


def segment_param(p, a, b):
    ab = b - a
    t = max(0.0, min(1.0, (p - a).dot(ab) / max(ab.length_squared, 1e-12)))
    return t, (p - (a + ab * t)).length


def reweight_arm_chain(body, rig, side):
    """Give the clean body's arm surface a clean Shoulder->UpperArm->Forearm->Hand chain.

    The production body's arm vertices carry mixed torso weights that leave the sleeve behind when the
    baked two-hand clips fold the arms across the chest. Vertices whose nearest bone segment is an arm
    bone get weights from their position along the chain (smooth blends at shoulder/elbow/wrist);
    torso-side vertices near the armpit are blended by their distance ratio. Bind space only.
    """
    bones = rig.data.bones
    chain = ["Shoulder_" + side, "UpperArm_" + side, "Forearm_" + side, "Hand_" + side]
    torso = ["SpineUpper", "SpineLower", "Neck", "Pelvis"]
    segs = {n: (bones[n].head_local, bones[n].tail_local) for n in chain + torso if n in bones}
    groups = {n: body.vertex_groups.get(n) or body.vertex_groups.new(name=n) for n in chain}
    # Cumulative arc length of the arm chain from the UpperArm head (shoulder joint).
    ua, fa, hd = segs[chain[1]], segs[chain[2]], segs[chain[3]]
    l_ua, l_fa = (ua[1] - ua[0]).length, (fa[1] - fa[0]).length
    changed = 0
    for v in body.data.vertices:
        p = v.co
        d = {n: segment_param(p, *segs[n]) for n in segs}
        arm_n = min(chain[1:], key=lambda n: d[n][1])
        arm_d = d[arm_n][1]
        torso_d = min(d[n][1] for n in torso + [chain[0]])
        sidex = p.x if side == "R" else -p.x
        if sidex < 0.12:
            continue
        # Only the sleeve/hand surface itself: close to an arm bone and clearly closer to it than to the torso.
        reach = 0.085 if arm_n == chain[1] else 0.07
        member = (1.0 - smooth((arm_d - reach) / 0.025)) * smooth((torso_d - arm_d) / 0.04)
        if member <= 0.0:
            continue
        if arm_n == chain[1]:
            s = d[arm_n][0] * l_ua
        elif arm_n == chain[2]:
            s = l_ua + d[arm_n][0] * l_fa
        else:
            s = l_ua + l_fa + d[arm_n][0] * (hd[1] - hd[0]).length
        w_sh = 1.0 - smooth((s + 0.03) / 0.08)
        w_hand = smooth((s - (l_ua + l_fa) + 0.015) / 0.035)
        w_elbow = smooth((s - l_ua + 0.05) / 0.1)
        w_ua = (1.0 - w_sh) * (1.0 - w_elbow)
        w_fa = (1.0 - w_sh) * w_elbow * (1.0 - w_hand)
        w_h = (1.0 - w_sh) * w_elbow * w_hand
        target = {chain[0]: w_sh, chain[1]: w_ua, chain[2]: w_fa, chain[3]: w_h}
        old = {body.vertex_groups[g.group].name: g.weight for g in v.groups}
        total_old = sum(old.values()) or 1.0
        new = {n: w / total_old * (1.0 - member) for n, w in old.items()}
        for n, w in target.items():
            new[n] = new.get(n, 0.0) + w * member
        best = sorted(new.items(), key=lambda kv: kv[1], reverse=True)[:4]
        total = sum(w for _, w in best) or 1.0
        for g in list(v.groups):
            body.vertex_groups[g.group].remove([v.index])
        for n, w in best:
            if w > 1e-5:
                (body.vertex_groups.get(n) or body.vertex_groups.new(name=n)).add([v.index], w / total, "REPLACE")
        changed += 1
    return changed


def wrist_radius_of(meshes, rig, side, pose=True):
    """Forearm radius just above the wrist, measured in bind space on arm-weighted vertices only
    (posed measurements pick up the chest when a clip folds the arm across the body)."""
    import numpy as np
    hb, fb = rig.data.bones["Hand_" + side], rig.data.bones["Forearm_" + side]
    wrist = fb.tail_local
    f = (fb.tail_local - fb.head_local).normalized()
    rs = []
    for obj in meshes:
        gi = {obj.vertex_groups[n].index for n in ("Forearm_" + side, "Hand_" + side) if n in obj.vertex_groups}
        for v in obj.data.vertices:
            if sum(g.weight for g in v.groups if g.group in gi) < 0.5:
                continue
            d = v.co - wrist
            ax = d.dot(f)
            rad = (d - f * ax).length
            if -0.07 < ax < -0.015 and rad < 0.08:
                rs.append(rad)
    value = float(np.percentile(rs, 75)) if len(rs) >= 8 else 0.038
    return max(0.03, min(0.05, value))


def strip_custom_props(obj, keep=("rtsProceduralOrigin", "rtsConservativeBounds", "rtsProceduralParts")):
    for k in list(obj.keys()):
        if k not in keep:
            del obj[k]


def conservative_bounds(objs, rig, step=1, margin=0.03):
    """Bounding sphere (glTF Y-up) of each object's skinned surface over every frame of every clip."""
    import numpy as np
    scene = bpy.context.scene
    dg = bpy.context.evaluated_depsgraph_get()
    pts = {o.name: [] for o in objs}
    for clip in CLIPS:
        set_action(rig, clip)
        start, end = bpy.data.actions[clip].frame_range
        for frame in range(int(start), int(end) + 1, step):
            scene.frame_set(frame)
            for o in objs:
                ev = o.evaluated_get(dg)
                me = ev.to_mesh()
                arr = np.empty(len(me.vertices) * 3)
                me.vertices.foreach_get("co", arr)
                arr = arr.reshape(-1, 3)
                mins, maxs = arr.min(0), arr.max(0)
                pts[o.name].append(mins)
                pts[o.name].append(maxs)
                ev.to_mesh_clear()
    out = {}
    for o in objs:
        P = np.array(pts[o.name])
        lo, hi = P.min(0), P.max(0)
        center = (lo + hi) / 2
        radius = float(np.linalg.norm(hi - lo) / 2 + margin)
        out[o.name] = {"sphere_center_y_up_m": [float(center[0]), float(center[2]), float(-center[1])],
                       "sphere_radius_m": radius, "sampling_margin_m": margin, "sample_hz": int(scene.render.fps / step)}
    set_action(rig, "Idle")
    scene.frame_set(0)
    return out


def lift_sinking_frames(rig, objs, clips=("Idle", "Walk", "Attack", "Hurt"), tolerance=0.004):
    """Raise the Root on frames whose lowest skinned vertex sinks below the ground (e.g. a lunging toe)."""
    import numpy as np
    scene = bpy.context.scene
    dg = bpy.context.evaluated_depsgraph_get()
    out = {}
    root = rig.pose.bones["Root"]
    for clip in clips:
        set_action(rig, clip)
        start, end = (int(x) for x in bpy.data.actions[clip].frame_range)
        lows = {}
        for f in range(start, end + 1):
            scene.frame_set(f)
            low = 9.0
            for o in objs:
                ev = o.evaluated_get(dg)
                me = ev.to_mesh()
                arr = np.empty(len(me.vertices) * 3)
                me.vertices.foreach_get("co", arr)
                low = min(low, float(arr.reshape(-1, 3)[:, 2].min()))
                ev.to_mesh_clear()
            lows[f] = low
        deficit = {f: max(0.0, -lows[f] - tolerance) for f in lows}
        if max(deficit.values()) <= 0:
            continue
        # Smooth the lift over neighbouring frames so the body never pops.
        lift = {f: max(deficit.get(g, 0.0) * (1 - abs(g - f) / 4) for g in range(f - 3, f + 4)) for f in lows}
        for f in sorted(lows):
            scene.frame_set(f)
            m = root.matrix.copy()
            m.translation.z += lift[f]
            root.matrix = m
            bpy.context.view_layer.update()
            root.keyframe_insert("location", frame=f)
        out[clip] = {"max_sink_before_m": round(-min(lows.values()), 4), "max_lift_m": round(max(lift.values()), 4)}
    set_action(rig, "Idle")
    scene.frame_set(0)
    return out


def ground_report(rig, objs):
    """Lowest skinned vertex per clip (feet should touch, not sink below, z = 0)."""
    import numpy as np
    scene = bpy.context.scene
    dg = bpy.context.evaluated_depsgraph_get()
    out = {}
    for clip in CLIPS:
        set_action(rig, clip)
        start, end = bpy.data.actions[clip].frame_range
        lows = []
        for frame in range(int(start), int(end) + 1, 2):
            scene.frame_set(frame)
            low = 9.0
            for o in objs:
                ev = o.evaluated_get(dg)
                me = ev.to_mesh()
                arr = np.empty(len(me.vertices) * 3)
                me.vertices.foreach_get("co", arr)
                low = min(low, float(arr.reshape(-1, 3)[:, 2].min()))
                ev.to_mesh_clear()
            lows.append(low)
        out[clip] = {"min_z_m": round(min(lows), 4), "max_of_frame_minima_m": round(max(lows), 4)}
    set_action(rig, "Idle")
    scene.frame_set(0)
    return out


def grip_tracking(rig, hand_records, weapon_bone_by_side):
    """Per clip, the distance between each fist channel centre and its weapon grip axis (world)."""
    scene = bpy.context.scene
    out = {}
    for rec in hand_records:
        side = rec["side"]
        hb = "Hand_" + side
        wb = weapon_bone_by_side[side]
        set_action(rig, "Idle")
        scene.frame_set(rec["reference_frame"])
        ref = skin_matrices(rig)
        c_bind = ref[hb].inverted() @ Vector(rec["grip_center_ref"])
        g_bind = ref[wb].inverted() @ Vector(rec["grip_center_ref"])
        a_bind = (ref[wb].inverted().to_3x3() @ Vector(rec["thumb_axis_ref"])).normalized()
        per = {}
        for clip in CLIPS:
            set_action(rig, clip)
            start, end = bpy.data.actions[clip].frame_range
            worst = 0.0
            for frame in range(int(start), int(end) + 1):
                scene.frame_set(frame)
                m = skin_matrices(rig)
                c = m[hb] @ c_bind
                g = m[wb] @ g_bind
                a = (m[wb].to_3x3() @ a_bind).normalized()
                d = c - g
                worst = max(worst, (d - a * d.dot(a)).length)
            per[clip] = round(worst, 4)
        out[rec["object"]] = per
    set_action(rig, "Idle")
    scene.frame_set(0)
    return out


# ----------------------------------------------------------------------------------------------
# Units.
# ----------------------------------------------------------------------------------------------
def ensure_material(name, rgb, roughness):
    if name in bpy.data.materials:
        return bpy.data.materials[name]
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    bsdf = m.node_tree.nodes.get("Principled BSDF")
    bsdf.inputs["Base Color"].default_value = (*rgb, 1.0)
    bsdf.inputs["Roughness"].default_value = roughness
    return m


ARM_CHAIN = ("UpperArm", "Forearm", "Hand")


def action_fcurves(act):
    return [fc for layer in act.layers for strip in layer.strips for slot in act.slots
            for bag in [strip.channelbag(slot)] if bag for fc in bag.fcurves]


def offset_hands(rig, offset: Vector, fade_clips=None):
    """Re-key both arm chains so each hand sits `offset` (armature space) from its baked pose.

    Per frame: record the baked hand matrices, key IK targets at the offset copies, evaluate IK
    (rotation-matched, no pole: the solver starts from the baked pose so elbows keep their side),
    then replace the arm-chain keys of every clip with the solved local transforms.
    """
    scene = bpy.context.scene
    fade_clips = fade_clips or {}
    bones = [f"{b}_{s}" for s in "LR" for b in ARM_CHAIN]
    targets = {}
    for s in "LR":
        e = bpy.data.objects.new(f"HandForwardTarget_{s}", None)
        scene.collection.objects.link(e)
        targets[s] = e
    report = {}
    for clip in CLIPS:
        act = bpy.data.actions[clip]
        set_action(rig, clip)
        start, end = (int(x) for x in act.frame_range)
        frames = list(range(start, end + 1))
        baked = {}
        for f in frames:
            scene.frame_set(f)
            w = 1.0
            if clip in fade_clips:
                w = 1.0 - smooth((f - start) / max(1.0, (end - start) * fade_clips[clip]))
            # Blender IK drives the constrained bone's TAIL onto the target: target the offset tail frame.
            baked[f] = {s: (rig.matrix_world @ Matrix.Translation(offset * w) @ rig.pose.bones["Hand_" + s].matrix
                            @ Matrix.Translation((0, rig.pose.bones["Hand_" + s].length, 0))) for s in "LR"}
        cons = []
        for s in "LR":
            pb = rig.pose.bones["Hand_" + s]
            c = pb.constraints.new("IK")
            c.target = targets[s]
            c.chain_count = 3
            c.use_rotation = True
            c.use_stretch = False
            c.iterations = 500
            cons.append((pb, c))
        solved = {}
        worst = 0.0
        for f in frames:
            for s in "LR":
                targets[s].matrix_world = baked[f][s]
            scene.frame_set(f)
            bpy.context.view_layer.update()
            solved[f] = {b: rig.pose.bones[b].matrix.copy() for b in bones}
            for s in "LR":
                err = ((rig.matrix_world @ rig.pose.bones["Hand_" + s].tail) - baked[f][s].translation).length
                worst = max(worst, err)
        for pb, c in cons:
            pb.constraints.remove(c)
        for layer in act.layers:
            for strip in layer.strips:
                for slot in act.slots:
                    bag = strip.channelbag(slot)
                    if bag:
                        for fc in [fc for fc in bag.fcurves if any(f'"{b}"' in fc.data_path for b in bones)]:
                            bag.fcurves.remove(fc)
        for f in frames:
            scene.frame_set(f)
            for b in bones:
                pb = rig.pose.bones[b]
                pb.matrix = solved[f][b]
                bpy.context.view_layer.update()
                pb.keyframe_insert("location", frame=f)
                pb.keyframe_insert("rotation_quaternion", frame=f)
        report[clip] = {"frames": len(frames), "max_ik_residual_m": round(worst, 4)}
    for e in targets.values():
        bpy.data.objects.remove(e, do_unlink=True)
    set_action(rig, "Idle")
    scene.frame_set(0)
    return report


def fit_budget(lods, budgets=(19800, 9900)):
    """Collapse-decimate the largest skinned body of a LOD only when the LOD exceeds its budget."""
    out = {}
    for detail, budget in zip((0, 1), budgets):
        total = sum(tri_count(o) for o in lods[detail])
        if total <= budget:
            continue
        body = max(lods[detail], key=tri_count)
        before = tri_count(body)
        target = before - (total - budget)
        mod = body.modifiers.new("BudgetDecimate", "DECIMATE")
        mod.ratio = target / before
        body.modifiers.move(len(body.modifiers) - 1, 0)
        bpy.context.view_layer.objects.active = body
        bpy.ops.object.modifier_apply(modifier=mod.name)
        out[body.name] = {"before": before, "after": tri_count(body)}
    return out


def prepare_worker(report, detail_objs):
    rig = bpy.data.objects["workerRig20"]
    body0, body1 = bpy.data.objects["workerOriginalBody_LOD0"], bpy.data.objects["workerOriginalBody_LOD1"]
    axes = [bpy.data.objects["WorkerCraftAxe_LOD0"], bpy.data.objects["WorkerCraftAxe_LOD1"]]
    rig.data.pose_position = "REST"
    bpy.context.view_layer.update()
    hb = rig.data.bones["Hand_R"]
    wrist = hb.head_local.copy()
    hand_dir = (hb.tail_local - hb.head_local).normalized()
    back = (Vector((1, 0, 0)) - hand_dir * hand_dir.x).normalized()
    thumb = hand_dir.cross(back).normalized() * -1.0   # = back x hand_dir ... resolves to +Y (forward)
    if thumb.y < 0:
        thumb = -thumb
    # Re-seat the clean axe in a hammer grip: haft across the closed palm (perpendicular to the hand),
    # head forward, blade edge down. Pure rigid transform of the clean axe; no new axe geometry.
    center, axis, r, lo, hi = weapon_region(axes[0], {"WornLeatherGrip"})
    if axis.z < 0:
        axis = -axis
    steel_c, *_ = weapon_region(axes[0], {"ForgedToolSteel"})
    blade = steel_c - center
    blade = (blade - axis * blade.dot(axis)).normalized()
    target_blade = Vector((0, 0, -1))
    target_blade = (target_blade - thumb * target_blade.dot(thumb)).normalized()
    src = Matrix((axis, blade, axis.cross(blade))).transposed()
    dst = Matrix((thumb, target_blade, thumb.cross(target_blade))).transposed()
    rot = (dst @ src.inverted()).to_4x4()
    gauntlet_r = max(r, 0.019)
    palm = 0.074
    grip_pos = center - axis * ((hi - lo) * 0.2)  # hold toward the butt end of the leather wrap
    hold = wrist + hand_dir * palm - back * (gauntlet_r + 0.0015 + 0.0108)
    xf = Matrix.Translation(hold) @ rot @ Matrix.Translation(-grip_pos)
    for axe in axes:
        for v in axe.data.vertices:
            v.co = xf @ v.co
        axe.data.update()
    report["axe_reseat"] = {"grip_from": list(grip_pos), "grip_to": list(hold), "haft_axis": list(thumb),
                            "blade_dir": list(target_blade), "method": "rigid rotation+translation of clean axe"}
    report["trimmed_open_hand_faces"] = {b.name: trim_open_hand(b, rig, "R") for b in (body0, body1)}
    ref = skin_matrices(rig)
    wr = wrist_radius_of([body0], rig, "R")
    fore = rig.data.bones["Forearm_R"]
    mats = {m.name: m for m in bpy.data.materials}
    gauntlets = []
    for detail, suffix in ((0, "LOD0"), (1, "LOD1")):
        obj, rec = build_gauntlet(f"ProceduralGauntlet_R_{suffix}", rig, "R", hold, thumb, gauntlet_r, wrist,
                                  (fore.tail_local - fore.head_local), wr, back, mats, "WornLeatherGrip", "WornLeatherGrip",
                                  "WornLeatherGrip", detail, ref, flare=1.16, cuff_len=0.045,
                                  grip_points=region_points(axes[0], {"WornLeatherGrip"}))
        rec["reference_frame"] = 0
        rec["reference_pose"] = "REST"
        gauntlets.append(obj)
        report.setdefault("gauntlets", []).append(rec)
    rig.data.pose_position = "POSE"
    bpy.context.view_layer.update()
    lods = {0: [body0, axes[0], gauntlets[0]], 1: [body1, axes[1], gauntlets[1]]}
    report["grip_tracking"] = grip_tracking(rig, [report["gauntlets"][0]], {"R": "Hand_R"})
    return rig, lods


def prepare_crossbow(report, body_blend):
    rig = bpy.data.objects["crossbowRig20"]
    # Replace the glove-fitted detail bodies by the untouched clean production bodies.
    for name in ("crossbowOriginalBody_LOD0", "crossbowOriginalBody_LOD1"):
        old = bpy.data.objects[name]
        old.name = name + "_glovefit_removed"
        mesh = old.data
        bpy.data.objects.remove(old, do_unlink=True)
        if mesh.users == 0:
            bpy.data.meshes.remove(mesh)
    before = set(bpy.data.objects) | set(bpy.data.actions) | set(bpy.data.armatures)
    with bpy.data.libraries.load(str(body_blend), link=False) as (src, dst):
        dst.objects = ["crossbowOriginalBody_LOD0", "crossbowOriginalBody_LOD1"]
    bodies = []
    # The clean body's own rig comes along as a dependency: verify identical bind space, then drop it.
    for o in [o for o in bpy.data.objects if o not in before and o.type == "ARMATURE"]:
        worst = max((o.data.bones[b.name].head_local - b.head_local).length for b in rig.data.bones)
        report["clean_body_rig_bind_delta_m"] = worst
        if worst > 1e-4:
            raise RuntimeError("Clean crossbow body rig differs from the clip rig: %.6f" % worst)
        arm = o.data
        bpy.data.objects.remove(o, do_unlink=True)
        if arm.users == 0:
            bpy.data.armatures.remove(arm)
    for a in [a for a in bpy.data.actions if a not in before]:
        bpy.data.actions.remove(a)
    for obj in dst.objects:
        bpy.context.scene.collection.objects.link(obj)
        obj.parent = rig
        obj.matrix_parent_inverse = Matrix.Identity(4)
        for mod in obj.modifiers:
            if mod.type == "ARMATURE":
                mod.object = rig
        # Use the current file's identically named materials (same UV atlas, detail-refined maps).
        for i, m in enumerate(obj.data.materials):
            base = m.name.split(".")[0]
            if base in bpy.data.materials and bpy.data.materials[base] is not m:
                obj.data.materials[i] = bpy.data.materials[base]
        bodies.append(obj)
    body0, body1 = sorted(bodies, key=lambda o: o.name)
    body1.hide_render = True
    report["clean_body_source"] = str(Path(body_blend).relative_to(ROOT)).replace("\\", "/")
    report["trimmed_open_hand_faces"] = {}
    report["arm_chain_reweighted_vertices"] = {}
    for b in (body0, body1):
        for side in "LR":
            if os.environ.get("RTS_NO_ARM_REWEIGHT") != "1":
                report["arm_chain_reweighted_vertices"][f"{b.name}:{side}"] = reweight_arm_chain(b, rig, side)
            report["trimmed_open_hand_faces"][f"{b.name}:{side}"] = trim_open_hand(b, rig, side)
    # A2: replace the crude box weapon with the original procedural crossbow (same bind-space landmarks).
    for name in ("CrossbowWeapon_LOD0", "CrossbowWeapon_LOD1"):
        old = bpy.data.objects[name]
        mesh = old.data
        bpy.data.objects.remove(old, do_unlink=True)
        if mesh.users == 0:
            bpy.data.meshes.remove(mesh)
    ensure_material("HempString", (0.52, 0.44, 0.31), 0.85)
    mats = {m.name: m for m in bpy.data.materials}
    weapons, landmarks = [], None
    for detail, suffix in ((0, "LOD0"), (1, "LOD1")):
        cparts, lm = build_crossbow_parts(Part, detail)
        landmarks = landmarks or lm
        w = parts_to_object(f"ProceduralCrossbow_{suffix}", cparts, rig, mats)
        w["rtsProceduralParts"] = [pt.name for pt in cparts]
        weapons.append(w)
        report.setdefault("crossbow_weapon", []).append({"object": w.name, "triangles": tri_count(w),
                                                         "parts": [pt.name for pt in cparts]})
    # A2: the baked clips pressed the trigger hand into the belly. Move both hands (and the weapon, rigid to
    # Hand_R) forward by re-solving the arm chains with IK and re-keying them; no skin edits.
    report["hand_forward_rebake"] = offset_hands(rig, Vector((0.0, float(os.environ.get("RTS_HAND_FWD", "0.08")), 0.02)), fade_clips={"Death": 0.35})
    set_action(rig, "Idle")
    bpy.context.scene.frame_set(0)
    bpy.context.view_layer.update()
    ref = skin_matrices(rig)
    m_r = ref["Hand_R"]
    pistol_ref = m_r @ landmarks["pistol_center"]
    pistol_axis_ref = (m_r.to_3x3() @ landmarks["pistol_axis"]).normalized()
    stock_axis_ref = (m_r.to_3x3() @ landmarks["stock_axis"]).normalized()
    stock_c = landmarks["stock_center"]
    gauntlets = {0: [], 1: []}
    for side in "RL":
        fb = rig.pose.bones["Forearm_" + side]
        wrist = rig.matrix_world @ fb.tail
        fdir = (fb.tail - fb.head).normalized()
        wr = wrist_radius_of([body0], rig, side)
        if side == "R":
            gc, ga, gr = pistol_ref, pistol_axis_ref, 0.025
            pts = [m_r @ p for p in landmarks["pistol_grip"]]
        else:
            hand = rig.pose.bones["Hand_L"]
            reach = rig.matrix_world @ (hand.head + (hand.tail - hand.head).normalized() * 0.07)
            sc = m_r @ stock_c
            t = max(-0.1, min(0.13, (reach - sc).dot(stock_axis_ref)))
            gc = sc + stock_axis_ref * t
            ga, gr = stock_axis_ref, 0.03
            pts = [m_r @ p for p in landmarks["stock"]]
        outward = Vector((1 if side == "R" else -1, 0, 0))
        for detail, suffix in ((0, "LOD0"), (1, "LOD1")):
            obj, rec = build_gauntlet(f"ProceduralGauntlet_{side}_{suffix}", rig, side, gc, ga, gr, wrist, fdir, wr,
                                      outward, mats, "WornLeatherGrip", "WornLeatherGrip", "WornLeatherGrip", detail, ref,
                                      flare=1.18, cuff_len=0.045, grip_points=pts, boxy=(side == "L"))
            rec["reference_frame"] = 0
            rec["reference_pose"] = "Idle"
            gauntlets[detail].append(obj)
            report.setdefault("gauntlets", []).append(rec)
    lods = {0: [body0, weapons[0]] + gauntlets[0], 1: [body1, weapons[1]] + gauntlets[1]}
    recs = [r for r in report["gauntlets"] if r["detail"] == 0]
    report["grip_tracking"] = grip_tracking(rig, recs, {"R": "Hand_R", "L": "Hand_R"})
    return rig, lods


GUARD_MOTION = {"version": 1, "locomotion": {"clip": "Walk", "strideMeters": 2, "cycleSeconds": 2 / 3},
                "attack": {"clip": "Attack", "durationSeconds": 1.2, "contactSeconds": 16 / 30}}


def prepare_guard(report, clips_blend):
    rig = bpy.data.objects["GuardRig20"]
    scene = bpy.context.scene
    bodies = [bpy.data.objects["GuardBody_LOD0"], bpy.data.objects["GuardBody_LOD1"]]
    # 1. The guard's authored clips (rtsMotion timing contract) from the original guard rig.
    for a in list(bpy.data.actions):
        bpy.data.actions.remove(a)
    with bpy.data.libraries.load(str(clips_blend), link=False) as (src, dst):
        dst.actions = list(CLIPS)
        dst.armatures = list(src.armatures)
    others = [a for a in dst.armatures if a and all(b.name in a.bones for b in rig.data.bones)]
    for a in dst.armatures:
        if a and a not in others:
            bpy.data.armatures.remove(a)
    if not others:
        raise RuntimeError("Guard clip rig not found in clips blend")
    if others:
        other = others[0]
        worst = max(((other.bones[b.name].matrix_local.to_translation() - b.matrix_local.to_translation()).length
                     + max(abs(x - y) for r1, r2 in zip(other.bones[b.name].matrix_local, b.matrix_local) for x, y in zip(r1, r2)))
                    for b in rig.data.bones)
        report["clip_rig_bind_delta"] = worst
        if worst > 1e-4:
            raise RuntimeError("Guard clip rig bind pose differs: %.6f" % worst)
        bpy.data.armatures.remove(other)
    names = {b.name for b in rig.data.bones}
    dropped = 0
    for act in bpy.data.actions:
        for layer in act.layers:
            for strip in layer.strips:
                for slot in act.slots:
                    bag = strip.channelbag(slot)
                    if not bag:
                        continue
                    for fc in list(bag.fcurves):
                        if fc.data_path.startswith('pose.bones["') and fc.data_path.split('"')[1] not in names:
                            bag.fcurves.remove(fc)
                            dropped += 1
    report["dropped_extra_bone_fcurves"] = dropped
    scene.render.fps = 30
    scene.render.fps_base = 1.0
    scene["rtsMotion"] = GUARD_MOTION
    # The authored clips carry the shield on Hand_L (production weighted it to Forearm_L); same bind pose.
    for shield in (bpy.data.objects["KingdomSunShield_LOD0"], bpy.data.objects["KingdomSunShield_LOD1"]):
        g = shield.vertex_groups.get("Forearm_L")
        if g is not None:
            g.name = "Hand_L"
    for b in bodies:
        for side in "LR":
            # Auto weights from the A-pose bind leave armpit/torso islands on the arm bones; the authored
            # combat clips swing the arms far enough to shred them. Give the arms a clean chain first.
            report.setdefault("arm_envelope_reweighted_vertices", {})[f"{b.name}:{side}"] = envelope_reweight(b, rig, side)
            report.setdefault("trimmed_open_hand_faces", {})[f"{b.name}:{side}"] = trim_open_hand(b, rig, side)
    set_action(rig, "Idle")
    scene.frame_set(0)
    bpy.context.view_layer.update()
    ref = skin_matrices(rig)
    mats = {m.name: m for m in bpy.data.materials}
    sword, shield = bpy.data.objects["KingdomSteelSword_LOD0"], bpy.data.objects["KingdomSunShield_LOD0"]
    built = {0: [], 1: []}
    for side, weapon in (("R", sword), ("L", shield)):
        c, a, r, lo, hi = weapon_region(weapon, {"WornLeather"})
        m = ref["Hand_" + side]
        pts = [m @ p for p in region_points(weapon, {"WornLeather"})]
        fb = rig.pose.bones["Forearm_" + side]
        wrist = rig.matrix_world @ fb.tail
        fdir = (fb.tail - fb.head).normalized()
        gc_ref = m @ c
        ga_ref = (m.to_3x3() @ a).normalized()
        t = (wrist - gc_ref).dot(ga_ref)
        half_fist = 2.1 * GAUNTLET_DEFAULTS["finger_width"]
        t = max(lo + half_fist, min(hi - half_fist, t)) if hi - lo > 2 * half_fist else 0.0
        gc_ref = gc_ref + ga_ref * t
        wr = wrist_radius_of([bodies[0]], rig, side) * 1.05
        outward = Vector((1 if side == "R" else -1, 0.25, 0)).normalized()
        for detail, suffix in ((0, "LOD0"), (1, "LOD1")):
            obj, rec = build_gauntlet(f"GuardGauntlet_{side}_{suffix}", rig, side, gc_ref, ga_ref, max(r, 0.02), wrist, fdir, wr,
                                      outward, mats, "ForgedSteel", "ForgedSteel", "ForgedSteel",
                                      detail, ref, flare=1.22, cuff_len=0.055, scale=1.05, grip_points=pts)
            rec["reference_frame"] = 0
            rec["reference_pose"] = "Idle"
            built[detail].append(obj)
            report.setdefault("gauntlets", []).append(rec)
    recs = [r for r in report["gauntlets"] if r["detail"] == 0]
    report["grip_tracking"] = grip_tracking(rig, recs, {"R": "Hand_R", "L": "Hand_L"})
    lods = {}
    for detail, suffix in ((0, "LOD0"), (1, "LOD1")):
        lods[detail] = [bodies[detail], bpy.data.objects[f"KingdomSteelSword_{suffix}"],
                        bpy.data.objects[f"KingdomSunShield_{suffix}"]] + built[detail]
    return rig, lods


def join_assembly(name, objs):
    """Join the guard's body modules into one multi-material skinned mesh (draw-call batching)."""
    for o in objs:
        uv = o.data.uv_layers
        while len(uv) > 1:
            uv.remove(uv[-1])
        if len(uv):
            uv[0].name = "UVMap"
    parts = [o.name for o in objs]
    bpy.ops.object.select_all(action="DESELECT")
    anchor = next(o for o in objs if o.name.startswith("GuardBody_"))
    for o in objs:
        o.hide_set(False)
        o.select_set(True)
    bpy.context.view_layer.objects.active = anchor
    bpy.ops.object.join()
    anchor.name = name
    anchor.data.name = name + "Mesh"
    anchor["rtsProceduralParts"] = parts
    return anchor


def neutralize_uv_nodes():
    for m in bpy.data.materials:
        if m.node_tree:
            for n in m.node_tree.nodes:
                if n.type == "UVMAP":
                    n.uv_map = "UVMap"


# ----------------------------------------------------------------------------------------------
# Export, QA renders and main.
# ----------------------------------------------------------------------------------------------
def export_lod(path: Path, rig, objs):
    bpy.ops.object.select_all(action="DESELECT")
    for o in [rig] + list(objs):
        o.hide_set(False)
        o.hide_viewport = False
        o.select_set(True)
    bpy.context.view_layer.objects.active = rig
    set_action(rig, "Idle")
    bpy.context.scene.frame_set(0)
    bpy.ops.export_scene.gltf(filepath=str(path), export_format="GLB", use_selection=True, export_extras=True,
                              export_animations=True, export_animation_mode="ACTIONS", export_nla_strips=False,
                              export_force_sampling=True, export_optimize_animation_size=False, export_frame_step=1,
                              export_skins=True, export_morph=False, export_materials="EXPORT", export_apply=False,
                              export_yup=True, export_cameras=False, export_lights=False)
    bpy.ops.object.select_all(action="DESELECT")


def render_closeups(out_dir: Path, rig, objs, unit, records):
    import os
    scene = bpy.context.scene
    for o in bpy.data.objects:
        if o.type == "MESH":
            o.hide_render = o not in objs
    engines = [e.identifier for e in bpy.types.RenderSettings.bl_rna.properties["engine"].enum_items]
    scene.render.engine = "BLENDER_EEVEE" if "BLENDER_EEVEE" in engines else engines[0]
    scene.render.resolution_x = scene.render.resolution_y = 560
    scene.render.film_transparent = False
    world = scene.world or bpy.data.worlds.new("QAWorld")
    scene.world = world
    world.use_nodes = True
    world.node_tree.nodes["Background"].inputs[0].default_value = (0.33, 0.37, 0.4, 1)
    for o in list(bpy.data.objects):
        if o.type in ("CAMERA", "LIGHT"):
            bpy.data.objects.remove(o, do_unlink=True)
    sun = bpy.data.objects.new("QASun", bpy.data.lights.new("QASun", "SUN"))
    sun.data.energy = 3.2
    sun.rotation_euler = (math.radians(40), 0, math.radians(30))
    scene.collection.objects.link(sun)
    cam = bpy.data.objects.new("QACam", bpy.data.cameras.new("QACam"))
    cam.data.type = "ORTHO"
    scene.collection.objects.link(cam)
    scene.camera = cam
    files = []
    set_action(rig, "Idle")
    scene.frame_set(0)
    ref = skin_matrices(rig)
    anchors = {r["side"]: ref["Hand_" + r["side"]].inverted() @ Vector(r["grip_center_ref"]) for r in records if r["detail"] == 0}
    for clip, frame in (("Idle", 0), ("Walk", 6), ("Attack", 16)):
        set_action(rig, clip)
        scene.frame_set(frame)
        bpy.context.view_layer.update()
        for focus in ("full", "Hand_R", "Hand_L"):
            if focus != "full" and focus[-1] not in anchors:
                continue
            if focus == "full":
                target, scale = Vector((0, 0, 0.9)), 2.1
            else:
                target, scale = skin_matrices(rig)[focus] @ anchors[focus[-1]], 0.3
            cam.data.ortho_scale = scale
            views = (("front", Vector((0.45, 1, 0.3))), ("back", Vector((-0.35, -1, 0.35))), ("out", Vector((1 if focus.endswith("R") else -1, 0.2, 0.25))))
            for view, d in views if focus != "full" else views[:2]:
                cam.location = target + d.normalized() * 4
                cam.rotation_euler = (target - cam.location).to_track_quat("-Z", "Y").to_euler()
                path = out_dir / f"{unit}-{clip.lower()}-{focus}-{view}.png"
                scene.render.filepath = str(path)
                bpy.ops.render.render(write_still=True)
                files.append(os.path.relpath(path, out_dir.parent).replace("\\", "/"))
    return files


def main():
    argv = sys.argv[sys.argv.index("--") + 1:]
    unit = argv[argv.index("--unit") + 1]
    run = Path(argv[argv.index("--run") + 1]).resolve()
    for sub in ("raw", "candidate", "qa"):
        (run / sub).mkdir(parents=True, exist_ok=True)
    src = ROOT / SOURCES[unit]["blend"]
    report = {"unit": unit, "tool": str(TOOL.relative_to(ROOT)).replace("\\", "/"), "tool_sha256": sha(TOOL),
              "source_blend": SOURCES[unit]["blend"], "source_blend_sha256": sha(src),
              "geometry_origin": "procedural-original (code primitives) + clean TripoSR/Blender source modules",
              "runtime_publish_allowed": False}
    bpy.ops.wm.open_mainfile(filepath=str(src))
    report["removed_restricted_objects"] = remove_restricted()
    for o in list(bpy.data.objects):
        if o.type in ("CAMERA", "LIGHT"):
            bpy.data.objects.remove(o, do_unlink=True)
    if unit == "worker":
        rig, lods = prepare_worker(report, None)
    elif unit == "crossbow":
        body_blend = ROOT / SOURCES[unit]["body_blend"]
        report["body_blend_sha256"] = sha(body_blend)
        rig, lods = prepare_crossbow(report, body_blend)
    else:
        clips_blend = ROOT / SOURCES[unit]["clips_blend"]
        report["clips_blend"] = SOURCES[unit]["clips_blend"]
        report["clips_blend_sha256"] = sha(clips_blend)
        rig, lods = prepare_guard(report, clips_blend)
    neutralize_uv_nodes()
    for a in [a for a in bpy.data.actions if a.name not in CLIPS]:
        bpy.data.actions.remove(a)
    for name in CLIPS:
        if name not in bpy.data.actions:
            raise RuntimeError("Missing clip " + name)
        bpy.data.actions[name].use_fake_user = True
    # Drop every mesh object not exported (source LOD leftovers, restricted remnants).
    exported = set(lods[0]) | set(lods[1])
    for o in list(bpy.data.objects):
        if o.type == "MESH" and o not in exported:
            bpy.data.objects.remove(o, do_unlink=True)
    for o in exported:
        strip_custom_props(o)
    leftovers = [o.name for o in bpy.data.objects if o.name.startswith(RESTRICTED_PREFIXES)]
    if leftovers:
        raise RuntimeError("Restricted objects survived: " + ", ".join(leftovers))
    for detail in (0, 1):
        bounds = conservative_bounds(lods[detail], rig, step=1)
        for o in lods[detail]:
            o["rtsConservativeBounds"] = bounds[o.name]
    report["budget_decimation"] = fit_budget(lods)
    if unit == "guard":
        report["ground_lift"] = lift_sinking_frames(rig, lods[0])
    report["triangles"] = {str(d): {o.name: tri_count(o) for o in lods[d]} for d in (0, 1)}
    report["triangle_totals"] = {str(d): sum(tri_count(o) for o in lods[d]) for d in (0, 1)}
    if report["triangle_totals"]["0"] > 20000 or report["triangle_totals"]["1"] > 10000:
        raise RuntimeError("Triangle budget exceeded: " + json.dumps(report["triangle_totals"]))
    report["ground"] = ground_report(rig, lods[0])
    blend = run / "raw" / f"{unit}-procedural-gauntlet.blend"
    bpy.context.preferences.filepaths.save_version = 0
    bpy.ops.wm.save_as_mainfile(filepath=str(blend))
    report["raw_blend"] = str(blend.relative_to(ROOT)).replace("\\", "/")
    report["raw_blend_sha256"] = sha(blend)
    report["exports"] = {}
    for detail in (0, 1):
        for d2 in (0, 1):
            for o in lods[d2]:
                o.hide_render = d2 != detail
        path = run / "candidate" / f"{unit}-lod{detail}.raw.glb"
        export_lod(path, rig, lods[detail])
        report["exports"][str(detail)] = {"path": str(path.relative_to(ROOT)).replace("\\", "/"), "bytes": path.stat().st_size}
    if "--skip-render" not in argv:
        report["closeups"] = render_closeups(run / "qa", rig, lods[0], unit, report.get("gauntlets", []))
    (run / "qa" / "build.json").write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print("PROCEDURAL_GAUNTLET_DONE " + json.dumps({"unit": unit, "tris": report["triangle_totals"],
                                                     "grip": report.get("grip_tracking"), "ground": report["ground"]}))


if __name__ == "__main__":
    main()
