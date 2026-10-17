"""Parametric originals for the polished weapons and shields (model polish 2026-10-16).

Each builder returns a list of Parts in the local weapon frame described in model_polish_geometry. `detail` = 1 builds
LOD0, `detail` = 0 builds the reduced LOD1 (fewer rings/segments, same silhouette and grip location).
Material keys are logical: blade, darksteel, brass, leather, oak, team.
"""
import numpy as np
from model_polish_geometry import Part, grid, lathe, cap, TILE

# ---------------------------------------------------------------------------------------------------------------------
# helpers


def rotate(parts, axis, angle):
    c, s = np.cos(angle), np.sin(angle)
    if axis == 'x':
        r = np.array([[1, 0, 0], [0, c, -s], [0, s, c]])
    elif axis == 'y':
        r = np.array([[c, 0, s], [0, 1, 0], [-s, 0, c]])
    else:
        r = np.array([[c, -s, 0], [s, c, 0], [0, 0, 1]])
    m = np.eye(4); m[:3, :3] = r
    return [p.transformed(m) for p in parts]


def translate(parts, offset):
    m = np.eye(4); m[:3, 3] = offset
    return [p.transformed(m) for p in parts]


def scale(parts, factors):
    m = np.diag([factors[0], factors[1], factors[2], 1.0])
    return [p.transformed(m) for p in parts]


def face_toward(parts, direction):
    """Flip parts whose average normal points away from `direction` (winding and normals together)."""
    out = []
    d = np.asarray(direction, np.float64)
    for p in parts:
        if float((p.normal @ d).mean()) < 0:
            t = p.indices.reshape(-1, 3)[:, [0, 2, 1]].reshape(-1)
            p = Part(p.material, p.position, -p.normal, p.uv, t.astype(np.uint32))
        out.append(p)
    return out


def chaikin(points, iterations=2, keep=()):
    """Closed-polygon corner rounding; indices in `keep` stay sharp (e.g. the heater point)."""
    pts = np.asarray(points, np.float64); sharp = np.zeros(len(pts), bool); sharp[list(keep)] = True
    for _ in range(iterations):
        out, flags = [], []
        for i in range(len(pts)):
            a, b = pts[i], pts[(i + 1) % len(pts)]
            if sharp[i]:
                out.append(a); flags.append(True)
            else:
                out.append(0.75 * a + 0.25 * b if not sharp[i] else a); flags.append(False)
            out.append(0.25 * a + 0.75 * b if not sharp[(i + 1) % len(pts)] else b * 0.999 + a * 0.001); flags.append(False)
        pts = np.asarray(out); sharp = np.asarray(flags)
    return pts


def smoothstep(x):
    x = np.clip(x, 0, 1)
    return x * x * (3 - 2 * x)


def dome(material, radius, height, rings, segments, base=0.0):
    """Hemispherical-ish dome around +Y starting at y=base."""
    a = np.linspace(0, np.pi / 2, rings)
    prof = [(base + height * np.sin(t), max(radius * np.cos(t), 0.0004)) for t in a]
    return lathe(material, prof, segments)


def box(material, size, center=(0, 0, 0), bevel=0.0):
    """Axis aligned box as six flat grids (hard edges); optional chamfer ring is skipped for simplicity."""
    sx, sy, sz = np.asarray(size) / 2; cx, cy, cz = center
    faces = []
    corners = {
        '+x': [[sx, -sy, sz], [sx, -sy, -sz], [sx, sy, -sz], [sx, sy, sz]],
        '-x': [[-sx, -sy, -sz], [-sx, -sy, sz], [-sx, sy, sz], [-sx, sy, -sz]],
        '+y': [[-sx, sy, sz], [sx, sy, sz], [sx, sy, -sz], [-sx, sy, -sz]],
        '-y': [[-sx, -sy, -sz], [sx, -sy, -sz], [sx, -sy, sz], [-sx, -sy, sz]],
        '+z': [[-sx, -sy, sz], [sx, -sy, sz], [sx, sy, sz], [-sx, sy, sz]],
        '-z': [[sx, -sy, -sz], [-sx, -sy, -sz], [-sx, sy, -sz], [sx, sy, -sz]],
    }
    for quad in corners.values():
        q = np.asarray(quad, np.float64) + [cx, cy, cz]
        pts = np.array([[q[0], q[1]], [q[3], q[2]]])
        faces.append(grid(material, pts))
    return faces


def ring_sweep(material, path, normals, section, closed_path=False, twist_up=None):
    """Sweep a 2D section (k,2) along a 3D path (n,3). normals: (n,3) 'up' vectors defining the section's second axis."""
    path = np.asarray(path, np.float64); up = np.asarray(normals, np.float64)
    tangent = np.gradient(path, axis=0)
    if closed_path:
        tangent = np.roll(path, -1, 0) - np.roll(path, 1, 0)
    tangent /= np.linalg.norm(tangent, axis=1, keepdims=True)
    side = np.cross(tangent, up); side /= np.linalg.norm(side, axis=1, keepdims=True)
    up = np.cross(side, tangent)
    sec = np.asarray(section, np.float64)
    pts = path[:, None, :] + sec[None, :, 0:1] * side[:, None, :] + sec[None, :, 1:2] * up[:, None, :]
    return grid(material, pts, closed_u=True, closed_v=closed_path)


def round_section(rx, ry, k):
    a = np.linspace(0, 2 * np.pi, k, endpoint=False)
    return np.stack([rx * np.cos(a), ry * np.sin(a)], axis=1)


# ---------------------------------------------------------------------------------------------------------------------
# sword


def blade(p, detail):
    """Lenticular blade with a central fuller, crisp edge bevels and an ogive point. Local +Y = toward tip."""
    n = p.get('rings', 18) if detail else 8
    y0, length = p['blade_start'], p['blade_length']
    t = np.linspace(0, 1, n)
    t = 1 - (1 - t) ** 1.35  # denser rings toward the point
    y = y0 + length * t
    tip_start = 0.80
    taper = 1 - p.get('taper', 0.22) * t
    point = np.where(t < tip_start, 1.0, np.sqrt(np.clip(1 - np.clip((t - tip_start) / (1 - tip_start), 0, 1) ** 1.6, 0, 1)))
    w = p['half_width'] * taper * point
    w[-1] = 0
    th = p['half_thickness'] * (1 - 0.35 * t) * np.maximum(point, 0.0)
    th[-1] = 0
    fuller_len = p.get('fuller', 0.72)
    fuller = p['fuller_depth'] * smoothstep((fuller_len - t) / 0.12) * smoothstep(t / 0.04)
    fw = 0.30  # fuller half width as fraction of blade half width
    # Section columns across +X half (mirrored for -X); z on the upper face.
    def face(sign_z):
        cols = []
        # edge strip: edge -> bevel line
        edge = [np.stack([w, y, 0 * w], 1), np.stack([w * 0.62, y, th * 0.78 * sign_z], 1)]
        flat = [np.stack([w * 0.62, y, th * 0.78 * sign_z], 1), np.stack([w * fw * 1.25, y, th * sign_z], 1)]
        fsteps = 4 if detail else 2
        ful = [np.stack([w * fw * 1.25 * (1 - s), y, (th - fuller * np.sin(np.pi * 0.5 * s)) * sign_z], 1)
               for s in np.linspace(0, 1, fsteps)]
        return edge, flat, ful
    parts = []
    for sign_z in (1, -1):
        edge, flat, ful = face(sign_z)
        for strip in (edge, flat, ful):
            for sx in (1, -1):
                cols = [np.stack([c[:, 0] * sx, c[:, 1], c[:, 2]], 1) for c in strip]
                pts = np.stack(cols, axis=1)  # rows along blade, cols across
                flip = (sx * sign_z) > 0
                parts.append(grid('blade', pts, flip=flip))
    # Base cap hidden inside the guard keeps the blade closed.
    return parts


def crossguard(p, detail, material='darksteel'):
    """Swept guard with tapered arms curving toward the blade and ball terminals."""
    n = 17 if detail else 7; k = 10 if detail else 6
    half = p['guard_half_width']; yb = p['guard_y']
    x = np.linspace(-half, half, n)
    s = np.abs(x) / half
    path = np.stack([x, yb + p['guard_height'] * 0.5 + p.get('guard_curve', 0.02) * s ** 2, np.zeros(n)], 1)
    hy = p['guard_height'] * 0.5 * (1 - 0.45 * s) ; hz = p['guard_depth'] * 0.5 * (1 - 0.35 * s)
    sec = [np.stack([hz[i] * np.cos(a), hy[i] * np.sin(a)], 1) for i, a in enumerate([np.linspace(0, 2 * np.pi, k, endpoint=False)] * n)]
    tangent = np.gradient(path, axis=0); tangent /= np.linalg.norm(tangent, axis=1, keepdims=True)
    up = np.tile([0, 0, 1.0], (n, 1)); side = np.cross(tangent, up); side /= np.linalg.norm(side, axis=1, keepdims=True)
    pts = np.stack([path[i] + sec[i][:, 0:1] * up[i] + sec[i][:, 1:2] * side[i] for i in range(n)])
    parts = [grid(material, pts, closed_u=True)]
    # Ball / disc terminals.
    for sx in (-1, 1):
        r = p['guard_height'] * 0.42
        ball = lathe(material, [(-r, 0.0005), (-r * 0.7, r * 0.72), (0, r), (r * 0.7, r * 0.72), (r, 0.0005)], 10 if detail else 6)
        ball = rotate([ball], 'z', np.pi / 2)
        parts += translate(ball, [sx * (half + r * 0.6), path[0, 1], 0])
    # Central langet block (ecusson) clasping the blade.
    ec_h = p['guard_height'] * 1.5
    parts += box(material, [p['half_width'] * 1.25, ec_h, p['guard_depth'] * 1.05], [0, yb + ec_h * 0.5, 0])
    return parts


def grip(p, detail):
    """Leather wrap with spiral-like cord ridges and brass ferrules."""
    n = 17 if detail else 6; seg = 10 if detail else 6
    y = np.linspace(-p['grip_length'] / 2, p['grip_length'] / 2, n)
    s = y / (p['grip_length'] / 2)
    ridges = p.get('ridges', 7)
    r = p['grip_radius'] * (1 + 0.10 * (1 - s ** 2)) * (1 + (0.07 * np.abs(np.sin(np.pi * ridges * (s + 1) / 2)) if detail else 0))
    parts = [lathe('leather', list(zip(y, r)), seg, axis_scale=(1, 0.86))]
    fr = p['grip_radius'] * 1.22; fh = p['grip_length'] * 0.07
    for yc in (-p['grip_length'] / 2, p['grip_length'] / 2):
        parts.append(lathe('brass', [(yc - fh, fr * 0.92), (yc - fh * 0.5, fr), (yc + fh * 0.5, fr), (yc + fh, fr * 0.92)], seg, axis_scale=(1, 0.86)))
    return parts


def pommel(p, detail, material='brass'):
    """Faceted scent-stopper pommel with peen button."""
    seg = 8 if detail else 6
    top = -p['grip_length'] / 2 - p['grip_length'] * 0.05
    h = p['pommel_length']; r = p['pommel_radius']
    prof = [(top, r * 0.45), (top - h * 0.15, r * 0.85), (top - h * 0.45, r), (top - h * 0.78, r * 0.72), (top - h * 0.92, r * 0.35), (top - h, 0.0005)]
    return [lathe(material, prof[::-1], seg, axis_scale=(1, 0.72), phase=np.pi / seg)]


def sword(p, detail=1):
    return blade(p, detail) + crossguard(p, detail, p.get('guard_material', 'darksteel')) + grip(p, detail) + pommel(p, detail, p.get('pommel_material', 'brass'))


# ---------------------------------------------------------------------------------------------------------------------
# shield


def heater_outline(width, height, n, top_arch=0.04, shoulder=0.42, corner_fix=False):
    """Closed heater outline in the X-Y plane, centred at the origin, counter-clockwise, top edge at +height/2.
    corner_fix (model polish round 3): the sides start at the arched top edge's corner height instead of +height/2,
    which removes the 4 cm spike / fold the original outline made at both top corners."""
    hw, hh = width / 2, height / 2
    pts = []
    # top edge from right to left (slight upward arch)
    m = n // 4
    for t in np.linspace(1, -1, m, endpoint=False):
        pts.append((hw * t, hh + top_arch * (1 - t ** 2) - top_arch))
    # left side down: vertical to shoulder then curve to point
    k = (n - 2 * m) // 2
    for t in np.linspace(0, 1, k, endpoint=False):
        ystart = hh - top_arch * 0
        if t < shoulder:
            top = hh - top_arch if corner_fix else hh
            y = top - (t / shoulder) * (height * shoulder - (hh - top))
            x = -hw
        else:
            u = (t - shoulder) / (1 - shoulder)
            y = hh - height * shoulder - u * (height * (1 - shoulder))
            x = -hw * np.cos(u * np.pi / 2) ** 0.85
        pts.append((x, y))
    pts.append((0.0, -hh))
    for x, y in reversed(pts[m:-1]):
        pts.append((-x, y))
    return np.asarray(pts, np.float64)


def shield(p, detail=1):
    """Curved heater shield: team-painted face, forged rim, brass sun boss with rays, rivets, oak back and straps."""
    W, H, curve, thick = p['width'], p['height'], p['curvature'], p['thickness']
    n_out = 56 if detail else 24
    raw = heater_outline(W, H, n_out // 4 * 4 // 2, corner_fix=bool(p.get('r3')))
    tip = int(np.argmin(raw[:, 1]))
    outline = chaikin(raw, 1, keep=(tip,))
    def z_of(x, y):
        return -curve * (x / (W / 2)) ** 2 - curve * 0.25 * (y / (H / 2)) ** 2
    # Face grid: rows over y, columns across the outline width at that y.
    rows = 20 if detail else 8; cols = 14 if detail else 6
    ys = np.linspace(H / 2 - 0.004, -H / 2 + 0.004, rows)
    def half_width(y):
        right = outline[outline[:, 0] >= -1e-9]
        order = np.argsort(right[:, 1]); return np.interp(y, right[order, 1], right[order, 0])
    inset = p.get('rim_width', 0.009)
    face_pts = []
    for y in ys:
        hwid = max(half_width(y) - inset, 0.002)
        xs = np.linspace(-hwid, hwid, cols)
        face_pts.append(np.stack([xs, np.full(cols, y), z_of(xs, y)], 1))
    face_pts = np.asarray(face_pts)
    uv = np.stack([(face_pts[..., 0] / W + 0.5), (face_pts[..., 1] / H + 0.5)], 2)
    parts = [grid('team', face_pts, uv=uv, flip=True)]
    back = face_pts[::2, ::2].copy() if detail else face_pts.copy(); back[..., 2] -= thick
    parts.append(grid('oak', back))
    # Rim: half-round section swept along the outline at the face curvature.
    path = np.stack([outline[:, 0], outline[:, 1], z_of(outline[:, 0], outline[:, 1]) - thick * 0.5], 1)
    normals = np.tile([0, 0, 1.0], (len(path), 1))
    rw, rd = p.get('rim_band', 0.011), thick * 0.5 + p.get('rim_lift', 0.004)
    section = [(rw * np.cos(a), rd * np.sin(a)) for a in np.linspace(0, 2 * np.pi, 7 if detail else 4, endpoint=False)]
    parts.append(ring_sweep('darksteel', path, normals, section, closed_path=True))
    # Inner brass bead following the rim.
    bead = outline * (1 - (inset * 1.7) / np.array([W / 2, H / 2]))
    bpath = np.stack([bead[:, 0], bead[:, 1], z_of(bead[:, 0], bead[:, 1]) + 0.002], 1)
    parts.append(ring_sweep('brass', bpath, normals, [(0.0045 * np.cos(a), 0.0035 * np.sin(a)) for a in np.linspace(0, 2 * np.pi, 4 if detail else 3, endpoint=False)], closed_path=True))
    # Sun boss with rays.
    bc = p.get('boss_center', (0.0, H * 0.08))
    br = p.get('boss_radius', W * 0.16)
    boss = dome('brass', br, br * 0.45, 7 if detail else 4, 20 if detail else 10)
    boss = rotate([boss], 'x', np.pi / 2)
    parts += translate(boss, [bc[0], bc[1], z_of(bc[0], bc[1]) - 0.001])
    rays = p.get('rays', 8)
    for i in range(rays):
        a = 2 * np.pi * i / rays + np.pi / rays
        length = br * (1.55 if i % 2 == 0 else 1.2)
        tri = []
        for j, s in enumerate(np.linspace(0, 1, 5 if detail else 3)):
            rr = br * 0.92 + (length) * s
            hwid = br * 0.32 * (1 - s) + 0.0015
            cx, cy = bc[0] + rr * np.cos(a), bc[1] + rr * np.sin(a)
            nx, ny = -np.sin(a), np.cos(a)
            zc = z_of(cx, cy)
            hgt = 0.006 * (1 - s) + 0.0015
            tri.append([[cx + nx * hwid, cy + ny * hwid, zc - 0.0005], [cx, cy, zc + hgt], [cx - nx * hwid, cy - ny * hwid, zc - 0.0005]])
        parts += face_toward([grid('brass', np.asarray(tri))], [0, 0, 1])
    parts = face_toward(parts[:1], [0, 0, 1]) + parts[1:2] + parts[2:]
    # Rivets around the rim.
    count = p.get('rivets', 10) if detail else 0
    if count:
        idx = np.linspace(0, len(outline), count, endpoint=False).astype(int)
        for i in idx:
            if p.get('r3'):  # round 3: proud brass rivets on the painted field just inside the bead (were dark-on-dark)
                q = outline[i] * (1 - (inset * 2.9) / np.array([W / 2, H / 2]))
                rv = dome('brass', 0.0105, 0.0075, 3, 8)
            else:
                q = outline[i] * (1 - (inset * 0.9) / np.array([W / 2, H / 2]))
                rv = dome('darksteel', 0.007, 0.005, 2, 6)
            rv = rotate([rv], 'x', np.pi / 2)
            parts += translate(rv, [q[0], q[1], z_of(q[0], q[1]) + 0.0005])
    # Back: two leather enarmes and a guige strap centred on the measured hand position.
    hc = p.get('hand_center', (0.0, 0.0)); hz = z_of(hc[0], hc[1]) - thick
    for dy in p.get('strap_offsets', (-0.06, 0.06)):
        strap_y = hc[1] + dy
        xs = np.linspace(-p.get('strap_half', 0.07), p.get('strap_half', 0.07), 9 if detail else 5)
        loop = 0.028 * np.cos(np.pi * xs / (2 * p.get('strap_half', 0.07)))
        path = np.stack([hc[0] + xs, np.full_like(xs, strap_y), z_of(hc[0] + xs, strap_y) - thick - 0.003 - loop], 1)
        parts.append(ring_sweep('leather', path, np.tile([0, 1.0, 0], (len(xs), 1)), [(0.004 * np.cos(a), 0.016 * np.sin(a)) for a in np.linspace(0, 2 * np.pi, 6 if detail else 4, endpoint=False)]))
    # Back cross battens (oak) for structure.
    if detail:
        for yb in (H * 0.25, -H * 0.12):
            hwid = half_width(yb) - inset * 1.5
            xs = np.linspace(-hwid, hwid, 9)
            path = np.stack([xs, np.full_like(xs, yb), z_of(xs, yb) - thick - 0.006], 1)
            parts.append(ring_sweep('oak', path, np.tile([0, 1.0, 0], (9, 1)), [(0.006 * c, 0.02 * s) for c, s in [(1, 1), (-1, 1), (-1, -1), (1, -1)]]))
    return parts


# ---------------------------------------------------------------------------------------------------------------------
# hafted tools / weapons


def haft(material, y0, y1, r0, r1, detail, swell=0.0, segments=None):
    n = 12 if detail else 3; seg = segments or (10 if detail else 5)
    y = np.linspace(y0, y1, n); s = (y - y0) / (y1 - y0)
    r = r0 + (r1 - r0) * s + swell * np.sin(np.pi * s)
    prof = [(y0 - 1e-4, 0.0005)] + list(zip(y, r)) + [(y1 + 1e-4, 0.0005)]
    return lathe(material, prof, seg, axis_scale=(1, 0.82))


def axe_head(p, detail):
    """Bearded axe head: forged dark-steel cheeks tapering to a ground bright edge, socket collar and short poll.
    Local +X = bit direction, +Y = along the haft."""
    yh = p['head_y']; L = p['bit_length']; H = p['bit_height']; eye = p['eye_radius']
    n = 12 if detail else 5; m = 7 if detail else 3
    def section(s):
        top = H * 0.16 + H * 0.20 * s ** 1.8
        bot = -H * 0.16 - H * 0.62 * s ** 1.5
        thick = p['cheek'] * (1 - 0.86 * s ** 0.8) + 0.0012
        return top, bot, thick
    parts = []
    edge_from = 0.82
    for lo_s, hi_s, mat in ((0.0, edge_from, 'darksteel'), (edge_from, 1.0, 'blade')):
        s = np.linspace(lo_s, hi_s, max(3, int(n * (hi_s - lo_s)) + 2))
        top, bot, thick = section(s)
        x = eye * 1.1 + L * s
        for sign in (1, -1):
            cols = []
            for v in np.linspace(0, 1, m):
                yy = bot + (top - bot) * v
                xe = x + L * 0.08 * np.sin(np.pi * v) * s ** 3  # crescent bit
                zz = sign * thick * (0.62 + 0.38 * np.sin(np.pi * v))
                cols.append(np.stack([xe, yh + yy, zz], 1))
            parts += face_toward([grid(mat, np.stack(cols, axis=1))], [0, 0, sign])
        for v, up in ((0, -1), (1, 1)):  # spine strips close the upper and lower edges
            yy = bot + (top - bot) * v
            xe = x + L * 0.08 * np.sin(np.pi * v) * s ** 3
            strip = np.stack([np.stack([xe, yh + yy, thick * 0.62], 1), np.stack([xe, yh + yy, -thick * 0.62], 1)], 1)
            parts += face_toward([grid(mat, strip)], [0, up, 0])
    # Socket collar wrapping the haft, with a raised lip, and a short square poll behind it.
    seg = 12 if detail else 6
    parts.append(lathe('darksteel', [(yh - H * 0.20, eye * 1.12), (yh - H * 0.16, eye * 1.30), (yh + H * 0.16, eye * 1.30), (yh + H * 0.20, eye * 1.12)], seg, axis_scale=(1.15, 0.9)))
    parts += box('darksteel', [eye * 1.1, H * 0.30, eye * 1.7], [-eye * 1.25, yh, 0])
    return parts


def axe(p, detail=1):
    parts = [haft('oak', p['haft_start'], p['haft_end'], p['haft_r0'], p['haft_r1'], detail, swell=p.get('swell', 0.002))]
    parts += axe_head(p, detail)
    g0, g1 = p['wrap']
    n = 14 if detail else 4
    y = np.linspace(g0, g1, n)
    r = p['haft_r0'] * 1.18 + (0.0018 * np.abs(np.sin(np.pi * 6 * (y - g0) / (g1 - g0))) if detail else 0)
    parts.append(lathe('leather', list(zip(y, np.broadcast_to(r, y.shape))), 10 if detail else 5, axis_scale=(1, 0.82)))
    if not detail:  # LOD1: butt cap and wedge band are sub-pixel at LOD1 distance
        return parts
    # Butt cap and a brass wedge band under the head.
    yb = p['haft_start']
    parts.append(lathe('darksteel', [(yb - 0.004, 0.0005), (yb - 0.003, p['haft_r0'] * 1.05), (yb + 0.022, p['haft_r0'] * 1.2), (yb + 0.028, p['haft_r0'] * 1.08)], 10 if detail else 6, axis_scale=(1, 0.82)))
    yw = p['head_y'] - p['bit_height'] * 0.36
    parts.append(lathe('brass', [(yw - 0.012, p['haft_r1'] * 1.12), (yw, p['haft_r1'] * 1.24), (yw + 0.012, p['haft_r1'] * 1.12)], 10 if detail else 6, axis_scale=(1, 0.82)))
    return parts


def lance(p, detail=1):
    """Fluted ash lance with vamplate, brass ferrules, leaf head and a team pennon."""
    parts = []
    y0, y1 = p['butt'], p['head_base']
    seg = 10 if detail else 6
    n = 18 if detail else 6
    y = np.linspace(y0, y1, n)
    grip_y = 0.0
    # Shaft swells behind the vamplate (rest) and tapers to the head.
    r = np.where(y < grip_y, p['r_grip'] + (p['r_butt'] - p['r_grip']) * (grip_y - y) / (grip_y - y0),
                 p['r_grip'] * 1.35 - (p['r_grip'] * 1.35 - p['r_tip']) * np.clip((y - grip_y) / (y1 - grip_y), 0, 1) ** 0.8)
    r = np.where(np.abs(y - p['vamplate_y']) < 0.12, np.maximum(r, p['r_grip'] * 1.4), r)
    flutes = lathe('oak', [(y0 - 1e-4, 0.0005)] + list(zip(y, r)) + [(y1 + 1e-4, 0.0005)], seg)
    if detail:  # spiral flute ridges
        pos = flutes.position.astype(np.float64)
        ang = np.arctan2(-pos[:, 2], pos[:, 0])
        rad = np.hypot(pos[:, 0], pos[:, 2])
        bump = 1 + 0.06 * np.cos(6 * ang + pos[:, 1] * 9.0)
        pos[:, 0] = np.cos(ang) * rad * bump; pos[:, 2] = -np.sin(ang) * rad * bump
        flutes = Part('oak', pos.astype(np.float32), flutes.normal, flutes.uv, flutes.indices)
    parts.append(flutes)
    # Leather grip wrap.
    gy = np.linspace(-0.08, 0.08, 10 if detail else 4)
    parts.append(lathe('leather', list(zip(gy, np.full_like(gy, p['r_grip'] * 1.12))), seg))
    # Vamplate: steel cone opening toward the tip, with brass edge.
    vy, vr = p['vamplate_y'], p['vamplate_r']
    parts.append(lathe('darksteel', [(vy - 0.004, p['r_grip'] * 1.45), (vy + 0.03, vr * 0.42), (vy + 0.12, vr * 0.92), (vy + 0.135, vr), (vy + 0.14, vr * 0.96), (vy + 0.13, vr * 0.88), (vy + 0.03, vr * 0.36)], 16 if detail else 8))
    parts.append(lathe('brass', [(vy + 0.128, vr * 1.0), (vy + 0.136, vr * 1.04), (vy + 0.144, vr * 0.98)], 16 if detail else 8))
    # Ferrules.
    for fy in (y0 + 0.02, y1 - 0.02):
        rr = np.interp(fy, y, r) * 1.18
        parts.append(lathe('brass', [(fy - 0.02, rr * 0.95), (fy - 0.012, rr), (fy + 0.012, rr), (fy + 0.02, rr * 0.95)], seg))
    # Leaf head (diamond section) with socket.
    hy0, hl = y1 - 0.02, p['head_length']
    socket = lathe('darksteel', [(hy0 - 0.06, p['r_tip'] * 1.2), (hy0, p['r_tip'] * 1.3), (hy0 + 0.03, p['r_tip'] * 1.05)], seg)
    parts.append(socket)
    hp = {'blade_start': hy0 + 0.02, 'blade_length': hl, 'half_width': p['head_width'], 'half_thickness': p['head_width'] * 0.32,
          'fuller_depth': 0.0, 'fuller': 0.0, 'taper': -0.4, 'rings': 9}
    parts += blade(hp, detail)
    # Team pennon behind the head (double-sided swallow-tail).
    if p.get('pennon'):
        py0, ph, pl = hy0 - 0.08, 0.16, 0.30
        cols = 9 if detail else 4
        u = np.linspace(0, 1, cols)
        yy = np.linspace(py0 - ph, py0, 5 if detail else 3)
        pts = []
        for yv in yy:
            v = (yv - (py0 - ph)) / ph
            notch = 0.35 * (1 - abs(v - 0.5) * 2)
            length = pl * (1 - notch * u[-1] ** 1)
            xs = r[-1] + u * length * (1 - 0.0)
            zs = 0.012 * np.sin(u * np.pi * 1.5)
            pts.append(np.stack([xs, np.full(cols, yv) - u * 0.05, zs], 1))
        pts = np.asarray(pts)
        uv = np.stack([pts[..., 0] / pl, (pts[..., 1] - py0 + ph) / ph], 2)
        parts.append(grid('team', pts, uv=uv))
        parts.append(grid('team', pts + [0, 0, -0.001], uv=uv, flip=True))
    return parts
