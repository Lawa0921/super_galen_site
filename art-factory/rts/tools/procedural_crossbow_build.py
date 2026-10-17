"""Original procedural crossbow (stock, pistol grip, rail, nut, trigger, bridle, prod limbs, string, stirrup).

Pure code primitives in the crossbow rig's bind space; the layout keeps the landmarks of the clean
CrossbowWeapon it replaces (stock along +Y at x=0.4755, pistol grip under the trigger, prod at y~0.49), so
the existing Hand_R attachment and baked clips stay valid. Imported by procedural_gauntlet_build.py.
"""
import math

from mathutils import Vector

X0, Z0 = 0.4755, 1.097


def _smooth(x):
    x = max(0.0, min(1.0, x))
    return x * x * (3 - 2 * x)


def _frame(tangent, up_hint):
    t = tangent.normalized()
    u = (up_hint - t * up_hint.dot(t))
    if u.length < 1e-6:
        u = t.orthogonal()
    u.normalize()
    return t.cross(u).normalized(), u  # side axis, up axis


def _sweep(Part, name, mat, path, sizes, n, p=2.0, up=Vector((0, 0, 1)), cap=True, rep=0.05):
    part = Part(name, mat)
    rings, centers = [], []
    for k, c in enumerate(path):
        a = path[min(k + 1, len(path) - 1)] - path[max(k - 1, 0)]
        side, upv = _frame(a, up)
        sx, sz = sizes[k]
        centers.append(c)
        rings.append(part.ring(c, side, upv, sx, sz, n, p=p, weights={"Hand_R": 1.0}))
    part.loft(rings, centers, cap_start=cap, cap_end=cap, repeat=rep)
    return part


def build_crossbow_parts(Part, detail: int):
    """Return (parts, landmarks) where landmarks hold bind-space vertex lists for grip fitting."""
    hi = detail == 0
    n_wood, n_small, steps = (12, 8, 14) if hi else (8, 5, 7)
    parts = []
    # Stock: rounded beam, slightly deeper and wider at the butt, tapering to the bridle.
    ys = [-0.075 + (0.53 + 0.075) * i / steps for i in range(steps + 1)]
    path = [Vector((X0, y, Z0 + 0.004 * (y > 0.3))) for y in ys]
    sizes = []
    for y in ys:
        u = (y + 0.075) / 0.605
        butt = 1.0 + 0.18 * (1 - _smooth(u / 0.15))
        sizes.append((0.026 * butt * (1 - 0.18 * u), 0.034 * butt * (1 - 0.22 * u)))
    stock = _sweep(Part, "stock", "WorkedAshWood", path, sizes, n_wood, p=3.0, up=Vector((0, 0, 1)), rep=0.12)
    parts.append(stock)
    # Pistol grip under the nut/trigger, raked back like a hand-held crossbow tiller grip.
    g_top, g_bot = Vector((X0, 0.005, Z0 - 0.02)), Vector((X0, -0.04, 0.885))
    gsteps = 6 if hi else 3
    path = [g_top.lerp(g_bot, i / gsteps) for i in range(gsteps + 1)]
    sizes = [(0.02 * (1 + 0.12 * math.sin(math.pi * i / gsteps)), 0.027 * (1 + 0.12 * math.sin(math.pi * i / gsteps)))
             for i in range(gsteps + 1)]
    grip = _sweep(Part, "stock_pistol_grip", "WorkedAshWood", path, sizes, n_wood, p=2.2, up=Vector((0, 1, 0)), rep=0.12)
    parts.append(grip)
    # Leather wrap where the support hand holds the fore-stock.
    wrap_path = [Vector((X0, 0.2 + 0.1 * i / 3, Z0 + 0.0005)) for i in range(4)]
    wrap = _sweep(Part, "stock_wrap", "WornLeatherGrip", wrap_path, [(0.0245, 0.032)] * 4, n_wood, p=3.0, rep=0.05)
    parts.append(wrap)
    # Steel rail (bolt groove edges) on top of the stock.
    rail_path = [Vector((X0, 0.0 + 0.5 * i / 4, Z0 + 0.036)) for i in range(5)]
    parts.append(_sweep(Part, "stock_rail", "ForgedToolSteel", rail_path, [(0.011, 0.0035)] * 5, 6 if hi else 4, p=4.0, rep=0.05))
    # Rotating nut (latch) and its axle.
    nut_c = Vector((X0, 0.13, Z0 + 0.04))
    nut_path = [nut_c + Vector((d, 0, 0)) for d in (-0.03, 0.03)]
    parts.append(_sweep(Part, "trigger_nut", "DarkIron", nut_path, [(0.013, 0.013)] * 2, n_small, up=Vector((0, 0, 1)), rep=0.03))
    # Trigger blade with a small guard loop, in front of the pistol grip.
    t_path = [Vector((X0, 0.05, Z0 - 0.034)), Vector((X0, 0.062, Z0 - 0.07)), Vector((X0, 0.05, Z0 - 0.1))]
    parts.append(_sweep(Part, "trigger", "DarkIron", t_path, [(0.004, 0.007)] * 3, n_small, up=Vector((0, 1, 0)), rep=0.03))
    loop = [Vector((X0, 0.01 + 0.075 * (0.5 - 0.5 * math.cos(math.pi * i / 6)), Z0 - 0.036 - 0.05 * math.sin(math.pi * i / 6)))
            for i in range(7)]
    parts.append(_sweep(Part, "trigger_guard", "DarkIron", loop, [(0.003, 0.003)] * 7, 5 if hi else 4, up=Vector((1, 0, 0)), rep=0.03))
    # Bridle binding the prod to the stock.
    b_path = [Vector((X0, 0.465 + 0.05 * i / 2, Z0 + 0.003)) for i in range(3)]
    parts.append(_sweep(Part, "prod_bridle", "DarkIron", b_path, [(0.03, 0.037)] * 3, n_wood, p=3.5, rep=0.04))
    # Prod: two tapered steel limbs sweeping back to recurved tips, with iron tip caps.
    tips = []
    lsteps = 9 if hi else 5
    for s, label in ((-1, "L"), (1, "R")):
        path, sizes = [], []
        for i in range(lsteps + 1):
            u = i / lsteps
            y = 0.49 - 0.07 * u * u + 0.014 * _smooth((u - 0.82) / 0.18)
            path.append(Vector((X0 + s * (0.012 + 0.3 * u), y, Z0 + 0.018 + 0.004 * u)))
            sizes.append((0.0085 * (1 - 0.45 * u), 0.019 * (1 - 0.45 * u)))
        parts.append(_sweep(Part, "prod_" + label, "ForgedToolSteel", path, sizes, n_small, p=2.6, up=Vector((0, 0, 1)), rep=0.08))
        tip = path[-1]
        tips.append(tip)
        parts.append(_sweep(Part, "prod_tip_" + label, "DarkIron", [tip - Vector((s * 0.012, 0, 0)), tip + Vector((s * 0.006, 0, 0))],
                            [(0.008, 0.012)] * 2, n_small, up=Vector((0, 0, 1)), rep=0.03))
    # String: from each tip, drawn back to the nut.
    nock = Vector((X0, 0.135, Z0 + 0.05))
    for s, tip in zip(("L", "R"), tips):
        spath = [tip.lerp(nock, i / 4) for i in range(5)]
        parts.append(_sweep(Part, "string_" + s, "HempString", spath, [(0.0028, 0.0028)] * 5, 5 if hi else 4,
                            up=Vector((0, 0, 1)), rep=0.05))
    # Stirrup: a forged foot loop ahead of the prod.
    st = []
    for i in range(9 if hi else 5):
        a = math.pi * i / (8 if hi else 4)
        st.append(Vector((X0 - 0.048 * math.cos(a), 0.515 + 0.13 * math.sin(a) ** 0.8, Z0 + 0.004 - 0.025 * math.sin(a))))
    parts.append(_sweep(Part, "stirrup", "ForgedToolSteel", st, [(0.0065, 0.0065)] * len(st), n_small, up=Vector((0, 0, 1)), rep=0.05))
    landmarks = {"pistol_grip": [v.copy() for v in grip.verts], "stock": [v.copy() for v in stock.verts if 0.12 < v.y < 0.42],
                 "pistol_axis": (g_top - g_bot).normalized(), "pistol_center": g_top.lerp(g_bot, 0.55),
                 "stock_axis": Vector((0, 1, 0)), "stock_center": Vector((X0, 0.27, Z0))}
    return parts, landmarks
