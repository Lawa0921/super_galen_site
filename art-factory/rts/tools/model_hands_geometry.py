"""Parametric original hand geometry for the hand polish pass (2026-10-16).

Canonical right hand, metres. Origin = grip (handle) centre, +Z = along the handle toward the thumb / index side,
+X = back-of-hand normal, +Y = wrist -> knuckle direction (the wrist sits at -Y). Fingers curl counter-clockwise
about +Z (from +X through +Y to -X); the thumb wraps the opposite way over the index / middle fingers. A left hand
is the mirror image (x -> -x) applied by the caller.

Every digit is built from separate phalanx capsules (rounded superellipse sections with domed ends) joined at
knuckles, so a closed grip reads as four fingers and a thumb rather than one swept sleeve. Gauntlet styles add
articulated steel lames per phalanx, knuckle domes, overlapping dorsal plates; glove styles keep leather digits.
No mesh is imported or sampled: all vertices come from the code below and the measured grip / wrist.
"""
import numpy as np
from model_polish_geometry import Part, TILE


def _n(v):
    v = np.asarray(v, np.float64)
    return v / (np.linalg.norm(v, axis=-1, keepdims=True) + 1e-12)


def superellipse(n, p):
    a = np.linspace(0, 2 * np.pi, n, endpoint=False)
    c, s = np.cos(a), np.sin(a)
    return np.sign(c) * np.abs(c) ** (2 / p), np.sign(s) * np.abs(s) ** (2 / p)


def capsule(material, centers, U, V, hu, hv, n, p=2.4, poles=(None, None)):
    """Closed tube through ring centres (k,3) with section axes U,V (k,3), half sizes hu,hv (k); optional pole
    points close each end (domed tips). Smooth normals, seam-duplicated UVs, outward winding."""
    centers = np.asarray(centers, np.float64); k = len(centers)
    U = _n(np.broadcast_to(U, centers.shape)); V = _n(np.broadcast_to(V, centers.shape))
    hu = np.broadcast_to(np.asarray(hu, np.float64), (k,)); hv = np.broadcast_to(np.asarray(hv, np.float64), (k,))
    cu, cv = superellipse(n, p)
    ring = centers[:, None] + U[:, None] * (hu[:, None, None] * cu[None, :, None]) + V[:, None] * (hv[:, None, None] * cv[None, :, None])
    P = ring.reshape(-1, 3)
    wrapped = lambda r, j: r * n + (j % n)
    tris = []
    for r in range(k - 1):
        for j in range(n):
            a, b, c, d = wrapped(r, j), wrapped(r, j + 1), wrapped(r + 1, j + 1), wrapped(r + 1, j)
            tris += [(a, b, c), (a, c, d)]
    extra = []
    for end, pole in ((0, poles[0]), (k - 1, poles[1])):
        if pole is None:
            continue
        pi = len(P) + len(extra); extra.append(np.asarray(pole, np.float64))
        for j in range(n):
            a, b = wrapped(end, j), wrapped(end, j + 1)
            tris.append((a, b, pi) if end == k - 1 else (b, a, pi))
    if extra:
        P = np.vstack([P, extra])
    T = np.asarray(tris, np.int64)
    # Outward winding: positive signed volume about the centroid.
    c0 = P.mean(0); vol = np.einsum('ij,ij->i', P[T[:, 0]] - c0, np.cross(P[T[:, 1]] - c0, P[T[:, 2]] - c0)).sum()
    if vol < 0:
        T = T[:, [0, 2, 1]]
    fn = np.cross(P[T[:, 1]] - P[T[:, 0]], P[T[:, 2]] - P[T[:, 0]])
    N = np.zeros_like(P)
    for q in range(3):
        np.add.at(N, T[:, q], fn)
    N = _n(N)
    # UVs: duplicate the seam column so u runs 0..circumference.
    seg = np.linalg.norm(np.diff(centers, axis=0), axis=1); v = np.concatenate([[0], np.cumsum(seg)]) / TILE
    circ = 2 * np.pi * float(max(hu.max(), hv.max())) / TILE
    rows = k * n
    seam = np.arange(k) * n  # column 0 of every ring
    P2 = np.vstack([P, P[seam]]); N2 = np.vstack([N, N[seam]])
    uv = np.zeros((len(P2), 2))
    jj = np.tile(np.arange(n), k); rr = np.repeat(np.arange(k), n)
    uv[:rows, 0] = jj / n * circ; uv[:rows, 1] = v[rr]
    pole_v = [v[0] - 0.02] * (poles[0] is not None) + [v[-1] + 0.02] * (poles[1] is not None)
    uv[rows:rows + len(extra), 0] = circ / 2; uv[rows:rows + len(extra), 1] = pole_v
    uv[len(P):, 0] = circ; uv[len(P):, 1] = v
    # Triangles crossing from column n-1 to column 0 use the duplicate.
    T2 = T.copy()
    for t in T2:
        cols = [(x % n) if x < rows else -1 for x in t]
        if (n - 1) in cols and 0 in cols:
            for q in range(3):
                if t[q] < rows and t[q] % n == 0:
                    t[q] = len(P) + t[q] // n
    return Part(material, P2.astype(np.float32), N2.astype(np.float32), uv.astype(np.float32), T2.reshape(-1).astype(np.uint32))


def phalanx(material, A, B, W, hw, ht, ext_a, ext_b, detail, dome_a=True, dome_b=True, n=None, p=2.3, scale=1.0, inset=(0.0, 1.0),
            rings_a=None, rings_b=None, mid=None):
    """Rounded segment from joint A to joint B. W = width axis (along the handle). hw/ht = (start, end) half width /
    half thickness. ext_* = dome length past each joint (overlap that forms the knuckle). inset clips the straight
    part (used for plates that leave the joints exposed)."""
    A = np.asarray(A, np.float64); B = np.asarray(B, np.float64)
    L = float(np.linalg.norm(B - A)); t = (B - A) / L
    Wv = _n(np.asarray(W) - t * np.dot(W, t)); Vv = _n(np.cross(t, Wv))
    n = n or (8 if detail else 6)
    ma = rings_a if rings_a is not None else (2 if detail else 1)
    mb = rings_b if rings_b is not None else (2 if detail else 1)
    s0, s1 = inset[0] * L, inset[1] * L
    samples = []  # (s, f, lerp u)
    if dome_a:
        for q in range(1, ma + 1):  # from the tip toward the straight part
            th = (np.pi / 2) * q / (ma + 1); samples.append((s0 - ext_a * np.cos(th), np.sin(th), 0.0))
    inner = [0.0, 0.5, 1.0] if (detail if mid is None else mid) else [0.0, 1.0]
    for u in inner:
        samples.append((s0 + (s1 - s0) * u, 1.0, u))
    if dome_b:
        for q in range(1, mb + 1):
            th = (np.pi / 2) * (1 - q / (mb + 1)); samples.append((s1 + ext_b * np.cos(th), np.sin(th), 1.0))
    s = np.array([x[0] for x in samples]); f = np.array([x[1] for x in samples]); u = np.array([x[2] for x in samples])
    hu = (hw[0] + (hw[1] - hw[0]) * u) * f * scale; hv = (ht[0] + (ht[1] - ht[0]) * u) * f * scale
    centers = A[None] + t[None] * s[:, None]
    poles = (A + t * (s0 - ext_a) if dome_a else None, A + t * (s1 + ext_b) if dome_b else None)
    return capsule(material, centers, Wv, Vv, hu, hv, n, p=p, poles=poles)


def digit_chain(material, J, W, hws, hts, tip_ext, n=6):
    """Far-LOD digit: one capsule through all joints (no per-joint domes), same joint positions as LOD0."""
    J = np.asarray(J, np.float64); k = len(J)
    t = np.zeros_like(J)
    t[0] = J[1] - J[0]; t[-1] = J[-1] - J[-2]
    for i in range(1, k - 1):
        t[i] = _n(J[i] - J[i - 1]) + _n(J[i + 1] - J[i])
    t = _n(t); Wb = _n(np.broadcast_to(W, J.shape) - t * np.einsum('ij,j->i', t, np.asarray(W, np.float64))[:, None]) if np.ndim(W) == 1 else _n(W)
    V = _n(np.cross(t, Wb))
    return capsule(material, J, Wb, V, hws, hts, n, p=2.3, poles=(J[0] - t[0] * hts[0] * 0.9, J[-1] + t[-1] * tip_ext))


def ellipsoid(material, center, axes, radii, detail, n=None):
    """Ellipsoid with semi-axes radii along the three unit axes (axes[0] is the pole axis)."""
    a0, a1, a2 = (_n(a) for a in axes)
    m = 4 if detail else 3; n = n or (10 if detail else 6)
    th = np.linspace(0, np.pi, m + 2)[1:-1]
    centers = np.asarray(center)[None] + a0[None] * (-np.cos(th) * radii[0])[:, None]
    return capsule(material, centers, a1, a2, np.sin(th) * radii[1], np.sin(th) * radii[2], n, p=2.0,
                   poles=(np.asarray(center) - a0 * radii[0], np.asarray(center) + a0 * radii[0]))


def slab(material, path, W, Nrm, hw, ht, detail, bow=0.0, n=None):
    """Flat curved plate along `path` (k,3): width axis W, plate normal Nrm (per ring or one), half width hw (k),
    half thickness ht; `bow` lowers the plate edges toward -Nrm (convex across the width)."""
    path = np.asarray(path, np.float64); k = len(path)
    n = n or (12 if detail else 8)
    Wb = _n(np.broadcast_to(W, path.shape)); Nb = _n(np.broadcast_to(Nrm, path.shape))
    hw = np.broadcast_to(np.asarray(hw, np.float64), (k,))
    cu, cv = superellipse(n, 4.0)
    ring = path[:, None] + Wb[:, None] * (hw[:, None, None] * cu[None, :, None]) + Nb[:, None] * (ht * cv[None, :, None] - bow * (cu ** 2)[None, :, None])
    # Re-use capsule's topology by passing explicit rings: rebuild through capsule with unit axes then overwrite.
    part = capsule(material, path, Wb, Nb, hw, np.full(k, ht), n, p=4.0,
                   poles=(path[0] - _n(path[1] - path[0]) * 0.002, path[-1] + _n(path[-1] - path[-2]) * 0.002))
    P = part.position.astype(np.float64); rows = k * n
    P[:rows] = ring.reshape(-1, 3); P[rows + 2:] = ring[:, 0]
    return _renormal(Part(material, P.astype(np.float32), part.normal, part.uv, part.indices))


def _renormal(part):
    P = part.position.astype(np.float64); T = part.indices.reshape(-1, 3).astype(np.int64)
    fn = np.cross(P[T[:, 1]] - P[T[:, 0]], P[T[:, 2]] - P[T[:, 0]])
    # Weld seam duplicates for smoothing by position.
    key = np.round(P / 1e-6).astype(np.int64); _, inv = np.unique(key, axis=0, return_inverse=True); inv = inv.reshape(-1)
    acc = np.zeros((inv.max() + 1, 3))
    for q in range(3):
        np.add.at(acc, inv[T[:, q]], fn)
    return Part(part.material, part.position, _n(acc[inv]).astype(np.float32), part.uv, part.indices)


def lathe_tube(material, axis_origin, axis_dir, profile, detail, n=None):
    """Solid of revolution about axis_dir from axis_origin: profile [(s, radius)] with domed/flat closing poles."""
    d = _n(axis_dir); u = _n(np.cross(d, [0.3, 1, 0.2])); v = np.cross(d, u)
    n = n or (16 if detail else 10)
    s = np.array([q[0] for q in profile]); r = np.array([q[1] for q in profile])
    centers = np.asarray(axis_origin)[None] + d[None] * s[:, None]
    return capsule(material, centers, u, v, r, r, n, p=2.0,
                   poles=(np.asarray(axis_origin) + d * s[0], np.asarray(axis_origin) + d * s[-1]))


# ----------------------------------------------------------------------------------------------------------------
# finger chains

def chord_chain(theta0, lengths, r_in, z, sense=1.0):
    """Joints of a digit closing around the inner circle r_in (about +Z; sense +1 counter-clockwise, -1 clockwise):
    every phalanx is a straight chord touching r_in at its middle, so the digit hugs the handle without entering it."""
    phi = 2 * np.arctan(np.asarray(lengths) / (2 * r_in))
    ang = theta0 + sense * np.concatenate([[0], np.cumsum(phi)])
    adj = [phi[0]] + [max(phi[i], phi[i + 1]) for i in range(len(phi) - 1)] + [phi[-1]]
    rad = r_in / np.cos(np.asarray(adj) / 2)
    return np.stack([rad * np.cos(ang), rad * np.sin(ang), np.full(len(ang), z)], 1)


def wrap_chain(start, lengths, r_in):
    """Joints of a finger that closes counter-clockwise (about +Z) around the inner circle r_in: each phalanx runs
    along the tangent from its proximal joint, so straight segments wrap the handle without entering it."""
    pts = [np.asarray(start[:2], np.float64)]
    for L in lengths:
        P = pts[-1]; rho = float(np.linalg.norm(P))
        if rho <= r_in * 1.0005:
            P = P / rho * r_in * 1.0005; rho = r_in * 1.0005
        phi = np.arctan2(P[1], P[0]) + np.arccos(r_in / rho)
        T = r_in * np.array([np.cos(phi), np.sin(phi)])
        d = _n(T - P)
        pts.append(P + d * L)
    return np.array([[p[0], p[1], start[2]] for p in pts])


def fk_chain(start, direction, lengths, bends, spread=0.0):
    """Joints by forward kinematics: bends (radians) rotate the running direction counter-clockwise about +Z
    (curling toward the palm, -X). `spread` tilts the chain toward +Z (finger fan)."""
    pts = [np.asarray(start, np.float64)]; d = _n(np.asarray(direction, np.float64))
    for L, b in zip(lengths, bends):
        c, s = np.cos(b), np.sin(b)
        d = _n(np.array([d[0] * c - d[1] * s, d[0] * s + d[1] * c, d[2]]) + np.array([0, 0, spread]))
        pts.append(pts[-1] + d * L)
    return np.array(pts)


FINGERS = (  # name, z slot (finger widths from the centre), lengths (prox, mid, dist), half width, knuckle angle deg
    ('index', 1.5, (0.040, 0.025, 0.020), 0.0094, 3.0),
    ('middle', 0.5, (0.044, 0.028, 0.021), 0.0098, 0.0),
    ('ring', -0.5, (0.041, 0.026, 0.020), 0.0092, 4.0),
    ('pinky', -1.5, (0.033, 0.021, 0.018), 0.0082, 13.0),
)

STYLES = {
    'plate': dict(glove='leather', plate='blade', trim='blade', lames=True, dorsal=2, cuff='blade', cuff_flare=1.12, cuff_len=0.05, studs=None, band=None),
    'plate-brass': dict(glove='leather', plate='blade', trim='brass', lames=True, dorsal=2, cuff='blade', cuff_flare=1.12, cuff_len=0.052, studs=None, band='brass'),
    'leather': dict(glove='leather', plate=None, trim=None, lames=False, dorsal=0, cuff='leather', cuff_flare=1.12, cuff_len=0.058, studs=None, band='leather'),
    'leather-studded': dict(glove='leather', plate=None, trim='darksteel', lames=False, dorsal=0, cuff='leather', cuff_flare=1.12, cuff_len=0.058, studs='darksteel', band='darksteel'),
    'leather-fine': dict(glove='leather', plate=None, trim='brass', lames=False, dorsal=0, cuff='leather', cuff_flare=1.10, cuff_len=0.058, studs=None, band='brass'),
}

POSES = {  # empty-hand poses: per-joint bends (MCP, PIP, DIP) in degrees, finger fan, thumb bends
    'relaxed': dict(bends=(32, 42, 24), pinky_extra=10, fan=0.03, thumb=(18, 22)),
    'open': dict(bends=(10, 14, 8), pinky_extra=6, fan=0.09, thumb=(8, 10)),
}


def hand_parts(spec, detail):
    """spec: pose ('grip' | 'fist' | 'relaxed' | 'open'), grip_radius, wrist_local (3,), style, scale.
    Returns [(Part, kind)] in the canonical right-hand frame; kind 'hand' (rigid) or 'cuff-anchor' metadata."""
    s = spec.get('scale', 1.0); st = STYLES[spec['style']]; pose = spec['pose']
    fw = 0.0205 * s; ht0, ht1 = 0.0089 * s, 0.0071 * s; gap = 0.0016
    rg = spec['grip_radius'] if pose == 'grip' else (0.0045 * s if pose == 'fist' else 0.0)
    r_in = rg + gap + ht0
    Wl = np.asarray(spec['wrist_local'], np.float64)
    # Centre the fist along the handle toward the wrist (forearm meets the hand behind the middle fingers), inside
    # the usable grip length the caller measured.
    lo, hi = spec.get('z_range', (-0.6 * fw, 0.6 * fw))
    zc = float(np.clip(Wl[2] * 0.8, lo, hi)) if lo <= hi else 0.5 * (lo + hi)
    parts = []
    glove, plate = st['glove'], st['plate']
    Z = np.array([0, 0, 1.0])
    knuckles = []
    tips = []
    curled = pose in ('grip', 'fist')
    for name, slot, lengths, hw, ang in FINGERS:
        L = np.asarray(lengths) * s; hw = hw * s
        z = zc + slot * fw
        if curled:
            J = chord_chain(np.radians(ang), L, r_in, z)
        else:
            P = POSES[pose]
            extra = P['pinky_extra'] if name == 'pinky' else 0
            start = np.array([0.0, -0.004 * (abs(slot) - 0.5) * s, z])
            b = np.radians([P['bends'][0] + extra, P['bends'][1] + extra * 0.5, P['bends'][2]])
            J = fk_chain(start, [0, 1, 0], L, b, spread=P['fan'] * slot / 1.5)
        knuckles.append(J[0]); tips.append(J[-1])
        hts = [(ht0, ht0 * 0.95), (ht0 * 0.93, ht1 * 1.05), (ht1 * 1.02, ht1 * 0.88)]
        hws = [(hw, hw * 0.96), (hw * 0.95, hw * 0.9), (hw * 0.9, hw * 0.82)]
        if not detail:
            parts.append((digit_chain(glove, J, Z, np.array([hw, hw * 0.94, hw * 0.88, hw * 0.8]), np.array([ht0, ht0 * 0.95, ht1, ht1 * 0.86]), ht1 * 1.1), 'hand'))
        for q in range(3 if detail else 0):
            last = q == 2
            parts.append((phalanx(glove, J[q], J[q + 1], Z, hws[q], hts[q], ext_a=hts[q][0] * (1.05 if q == 0 else 0.8),
                                  ext_b=hts[q][1] * (1.2 if last else 0.8), detail=detail, rings_a=1, rings_b=(2 if last and detail else 1),
                                  mid=(detail and q == 0)), 'hand'))
            if st['lames'] and not last:
                parts.append((phalanx(plate, J[q], J[q + 1], Z, (hws[q][0] * 1.1, hws[q][1] * 1.08), (hts[q][0] * 1.06 + 0.0015, hts[q][1] * 1.05 + 0.0015),
                                      ext_a=0.0025 * s, ext_b=0.0025 * s, detail=detail, inset=(0.14, 0.86), p=2.8, rings_a=1, rings_b=1, mid=False), 'hand'))
        if (st['plate'] or st['studs']) and detail:
            # Knuckle dome over the MCP joint, on the back side.
            out = _n(np.array([J[0][0], J[0][1], 0])) if curled else np.array([1.0, 0, 0])
            mat = st['plate'] or st['studs']
            parts.append((ellipsoid(mat, J[0] + out * (ht0 * 0.55), [out, Z, np.cross(Z, out)], (0.0055 * s, hw * 1.05, 0.0085 * s), detail), 'hand'))
    knuckles = np.array(knuckles); kc = knuckles.mean(0)
    if pose == 'fist':  # closed empty fist: fill the tunnel the curled fingers leave around the (virtual) handle
        parts.append((ellipsoid(glove, np.array([0, 0, zc]), [Z, [1, 0, 0], [0, 1, 0]], (2.1 * fw, r_in * 1.02, r_in * 1.02), detail), 'hand'))
    # Palm / hand body: wrist -> knuckle line, wide and thin at the knuckles, rounder at the wrist.
    if curled:
        kpath_end = kc
    else:
        kpath_end = np.array([0.0, -0.002 * s, zc])
    wr = np.array([Wl[0], Wl[1], Wl[2]])  # the palm runs into the cuff at the measured wrist
    us = np.array([0.0, 0.25, 0.55, 0.82, 1.0]) if detail else np.array([0.0, 0.5, 1.0])
    pc = wr[None] + (kpath_end - wr)[None] * us[:, None]
    pdir = _n(kpath_end - wr)
    back_n = _n(np.cross(pdir, Z))  # perpendicular to the path in the curl plane
    if back_n[0] < 0:
        back_n = -back_n
    span = (knuckles[:, 2].max() - knuckles[:, 2].min()) / 2 + 0.0085 * s
    phw = 0.021 * s + (span * 0.97 - 0.021 * s) * np.clip(us * 1.3, 0, 1)
    pht = (0.0150 + (0.0115 - 0.0150) * us + 0.0015 * np.sin(np.pi * us)) * s
    # Push the palm centre toward the back so the fist closes on the handle side.
    pc = pc + back_n[None] * (0.0015 * s)
    parts.append((capsule(glove, pc, np.broadcast_to(Z, pc.shape), np.broadcast_to(back_n, pc.shape), phw, pht, 12 if detail else 8, p=2.15,
                          poles=(pc[0] - pdir * 0.012 * s, pc[-1] + pdir * 0.007 * s)), 'hand'))
    # Thenar (thumb root) and hypothenar pads on the palm side.
    inward = -back_n
    thenar_c = wr + (kpath_end - wr) * 0.42 + inward * (0.008 * s) + Z * (span * 0.55)
    parts.append((ellipsoid(glove, thenar_c, [pdir, Z, inward], (0.025 * s, 0.0145 * s, 0.0125 * s), detail), 'hand'))
    hyp_c = wr + (kpath_end - wr) * 0.5 + inward * (0.006 * s) - Z * (span * 0.55)
    parts.append((ellipsoid(glove, hyp_c, [pdir, Z, inward], (0.022 * s, 0.011 * s, 0.0095 * s), detail), 'hand'))
    # Thumb: from the thenar, wrapping the other way over the index / middle fingers (grip) or alongside (empty).
    tl = np.array([0.031, 0.027]) * s; tht, thw = 0.0098 * s, 0.0108 * s
    if curled:
        r_t = r_in + ht0 * 1.25
        a0 = np.arctan2(thenar_c[1], thenar_c[0]) - np.radians(12)
        TJ = chord_chain(a0, tl, r_t, zc + 1.5 * fw + 0.4 * fw, sense=-1.0)
        TJ = np.vstack([thenar_c + Z * (0.25 * fw), TJ])  # metacarpal from the thenar root, then the two phalanges
    else:
        P = POSES[pose]
        base = thenar_c + Z * (0.004 * s)
        d0 = _n(pdir * 0.75 + Z * 0.45 + inward * 0.35)
        TJ = [base]
        dirs = d0
        for L, b in zip(tl, np.radians(P['thumb'])):
            dirs = _n(dirs * np.cos(b) + inward * np.sin(b))
            TJ.append(TJ[-1] + dirs * L)
        TJ = np.array(TJ)
    thumb_w = _n(np.cross(_n(TJ[-1] - TJ[0]), inward)) if not curled else Z
    if not detail:
        k = len(TJ)
        parts.append((digit_chain(glove, TJ, thumb_w, np.linspace(thw * 1.15, thw * 0.85, k), np.linspace(tht * 1.15, tht * 0.9, k), tht * 1.1), 'hand'))
    for q in range(len(TJ) - 1 if detail else 0):
        last = q == len(TJ) - 2
        hw_q = (thw * (1.15 if q == 0 else 1.0), thw * (0.95 if not last else 0.85))
        ht_q = (tht * (1.15 if q == 0 else 1.0), tht * 0.92)
        parts.append((phalanx(glove, TJ[q], TJ[q + 1], thumb_w, hw_q, ht_q, ext_a=ht_q[0] * 0.8, ext_b=ht_q[1] * (1.2 if last else 0.8), detail=detail,
                              rings_a=1, rings_b=(2 if last and detail else 1), mid=False), 'hand'))
        if st['lames'] and q == 1:
            parts.append((phalanx(plate, TJ[q], TJ[q + 1], thumb_w, (hw_q[0] * 1.12, hw_q[1] * 1.1), (ht_q[0] * 1.08 + 0.0016, ht_q[1] * 1.06 + 0.0016),
                                  ext_a=0.0025 * s, ext_b=0.0025 * s, detail=detail, inset=(0.12, 0.8), p=2.8, rings_a=1, rings_b=1, mid=False), 'hand'))
    # Gauntlet dorsal plates: overlapping lames from the knuckle line back toward the wrist, and a knuckle bar.
    if st['dorsal']:
        for q in range(st['dorsal'] if detail else 1):
            u0, u1 = 0.95 - q * 0.27, 0.95 - q * 0.27 - 0.32
            uu = np.linspace(u0, max(0.05, u1), 3 if detail else 2)
            path = wr[None] + (kpath_end - wr)[None] * uu[:, None]
            hwq = (0.024 * s + (span - 0.024 * s) * np.clip(uu * 1.25, 0, 1)) * (0.9 - 0.05 * q)
            lift = (0.0165 * s + (0.0112 * s - 0.0165 * s) * uu) + 0.0012 * s + (st['dorsal'] - q) * 0.0008
            path = path + back_n[None] * (lift[:, None] + 0.0015 * s)
            parts.append((slab(plate, path, Z, back_n, hwq, 0.0017 * s, detail, bow=0.009 * s, n=10 if detail else 6), 'hand'))
        bar = np.array([kc - Z * (span - 0.004 * s), kc + Z * (span - 0.004 * s)])
        out = _n(np.array([kc[0], kc[1], 0])) if curled else back_n
        bar = bar + out * (ht0 * 0.95 + 0.0035 * s) - pdir * 0.006 * s
        parts.append((phalanx(st['trim'], bar[0], bar[1], out, (0.0042 * s, 0.0042 * s), (0.0034 * s, 0.0034 * s), 0.003 * s, 0.003 * s, detail, n=8 if detail else 6), 'hand'))
    return parts, dict(wrist=wr, palm_dir=pdir, back=back_n, span=float(span), knuckle_center=kc, tips=np.array(tips), thumb_tip=TJ[-1])


def cuff_parts(style, wrist, forearm_dir, radius, scale, detail, cover_cut=False, length=None):
    """Cuff in posed space around the forearm end: s = 0 at the wrist, positive toward the elbow. Returns parts
    with their axial coordinate so the caller can blend Hand -> Forearm weights along it."""
    st = STYLES[style]; s = scale; L = (length or st['cuff_len']) * s; flare = st['cuff_flare']
    r = radius
    if cover_cut:  # bare arm cut at the wrist: full radius over the cut rim, then a short taper into the hand
        prof = [(-0.042 * s, r * 0.66), (-0.034 * s, r * 0.9), (-0.024 * s, r * 0.99), (L * 0.5, r * (1 + (flare - 1) * 0.4)), (L * 0.92, r * flare), (L, r * flare * 0.9)]
    elif st['cuff'] == 'leather':  # glove gauntlet cuff: reaches over the wrist stump, tapers into the hand
        prof = [(-0.034 * s, r * 0.62), (-0.022 * s, r * 0.82), (-0.004 * s, r * 0.94), (L * 0.55, r * (1 + (flare - 1) * 0.45)), (L * 0.92, r * flare), (L, r * flare * 0.9)]
    else:
        prof = [(-0.016 * s, r * 0.62), (-0.006 * s, r * 0.9), (0.006 * s, r * 0.98), (L * 0.55, r * (1 + (flare - 1) * 0.45)), (L * 0.92, r * flare), (L, r * flare * 0.9)]
    # Open bell: the profile turns over the rim and runs back inside (wall ~3 mm), so the open end shows the cuff's
    # interior around the arm instead of a capped disc; both poles end up inside the hand.
    wall = 0.003 * s
    inner = [(L - 0.002 * s, r * flare * 0.9 - wall), (L * 0.55, r * (1 + (flare - 1) * 0.45) - wall), (prof[2][0], prof[2][1] - wall)]
    if not detail:
        prof = [prof[0], prof[2], prof[4], prof[5]] + [inner[0], inner[2]]
    else:
        prof = prof + inner
    parts = [lathe_tube(st['cuff'], wrist, forearm_dir, prof, detail, n=None if detail else 8)]
    if not detail:  # far LOD: the cuff silhouette only
        return parts, L
    if st['band']:
        bp = [(L * 0.18, r * 1.0), (L * 0.22, r * 1.07), (L * 0.36, r * 1.08), (L * 0.40, r * 1.02)]
        parts.append(lathe_tube(st['band'], wrist, forearm_dir, bp, detail, n=14 if detail else 8))
    if st['cuff'] != 'leather' and st['trim'] and st['trim'] != st['cuff']:
        rp = [(L * 0.86, r * flare * 0.99), (L * 0.9, r * flare * 1.04), (L * 0.98, r * flare * 1.03), (L * 1.0, r * flare * 0.95)]
        parts.append(lathe_tube(st['trim'], wrist, forearm_dir, rp, detail, n=16 if detail else 10))
    return parts, L
