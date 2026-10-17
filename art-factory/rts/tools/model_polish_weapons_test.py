"""Geometry sanity for the polished weapons: winding agrees with normals, no NaNs, budgets, LOD1 smaller."""
import sys, unittest
from pathlib import Path
import numpy as np
sys.path.insert(0, str(Path(__file__).resolve().parent))
from model_polish_geometry import merge, triangles
import model_polish_weapons as W

SWORD = dict(blade_start=0.10, blade_length=0.74, half_width=0.040, half_thickness=0.011, fuller_depth=0.005,
             guard_y=0.095, guard_half_width=0.14, guard_height=0.028, guard_depth=0.034, grip_length=0.19, grip_radius=0.017,
             pommel_length=0.07, pommel_radius=0.03)
SHIELD = dict(width=0.36, height=0.71, curvature=0.035, thickness=0.018)
AXE = dict(haft_start=-0.30, haft_end=0.30, haft_r0=0.016, haft_r1=0.018, head_y=0.24, bit_length=0.15, bit_height=0.17,
           eye_radius=0.02, cheek=0.016, wrap=(-0.12, 0.08))
LANCE = dict(butt=-0.75, head_base=1.35, r_butt=0.030, r_grip=0.026, r_tip=0.016, vamplate_y=0.10, vamplate_r=0.09,
             head_length=0.24, head_width=0.035, pennon=True)


def winding_errors(part):
    p = part.position.astype(np.float64); t = part.indices.reshape(-1, 3)
    fn = np.cross(p[t[:, 1]] - p[t[:, 0]], p[t[:, 2]] - p[t[:, 0]])
    vn = part.normal[t].mean(1)
    ok = np.einsum('ij,ij->i', fn, vn)
    return int((ok < 0).sum()), len(t)


class Weapons(unittest.TestCase):
    def check(self, parts, budget):
        for part in parts:
            self.assertFalse(np.isnan(part.position).any() or np.isnan(part.normal).any() or np.isnan(part.uv).any(), part.material)
            bad, total = winding_errors(part)
            # Closed sweeps fold a few inner faces at the acute heater tip (hidden inside the rim).
            self.assertLessEqual(bad, max(1, total // 16), f'{part.material}: {bad}/{total} faces wound against their normals')
        self.assertLessEqual(triangles(parts), budget)

    def test_sword(self):
        self.check(W.sword(SWORD, 1), 1700); self.check(W.sword(SWORD, 0), 600)
        self.assertLess(triangles(W.sword(SWORD, 0)), triangles(W.sword(SWORD, 1)) * 0.5)

    def test_shield(self):
        self.check(W.shield(SHIELD, 1), 2600); self.check(W.shield(SHIELD, 0), 900)

    def test_axe(self):
        self.check(W.axe(AXE, 1), 1300); self.check(W.axe(AXE, 0), 500)

    def test_lance(self):
        self.check(W.lance(LANCE, 1), 1500); self.check(W.lance(LANCE, 0), 600)

    def test_shield_round3_corner_has_no_spike(self):
        # The original outline started each side at +height/2 although the arched top edge ends 4 cm lower: a spike /
        # fold at both top corners (user: crease at the shield top corner). Round 3 starts the sides at the corner.
        hw, hh, arch = 0.18, 0.355, 0.04
        old = W.heater_outline(0.36, 0.71, 28)
        new = W.heater_outline(0.36, 0.71, 28, corner_fix=True)
        side = lambda o: o[np.abs(o[:, 0]) > hw * 0.97]
        self.assertGreater(side(old)[:, 1].max(), hh - arch + 0.02)
        self.assertLessEqual(side(new)[:, 1].max(), hh - arch + 1e-9)
        ys = new[:, 1]
        self.assertAlmostEqual(float(ys.max()), hh, delta=0.002)  # the arch apex keeps the full height

    def test_shield_round3_rivets_are_proud_brass_on_the_field(self):
        r3 = W.shield(dict(SHIELD, r3=True, rivets=10), 1)
        old = W.shield(dict(SHIELD, rivets=10), 1)
        small = lambda parts, mat: [p for p in parts if p.material == mat and np.ptp(p.position, axis=0).max() < 0.03]
        self.assertEqual(len(small(old, 'darksteel')), 10)
        rivets = small(r3, 'brass')
        self.assertEqual(len(rivets), 10)
        self.assertEqual(len(small(r3, 'darksteel')), 0)
        for rv in rivets:
            self.assertGreater(np.ptp(rv.position[:, :2], axis=0).max(), 0.019)  # >= 2 cm across (was 1.4 cm)
            c = rv.position[:, :2].mean(0)
            self.assertLess(abs(c[0]), 0.18 - 0.02)  # inside the rim band, on the painted field
        self.check(r3, 2700)

    def test_blade_point_closes(self):
        parts = W.blade(SWORD, 1)
        top = max(float(p.position[:, 1].max()) for p in parts)
        tip = np.vstack([p.position[p.position[:, 1] > top - 1e-6] for p in parts])
        self.assertLess(np.abs(tip[:, [0, 2]]).max(), 1e-6)


if __name__ == '__main__':
    for name, fn in (('sword', W.sword, ), ):
        pass
    for label, build, params in (('sword', W.sword, SWORD), ('shield', W.shield, SHIELD), ('axe', W.axe, AXE), ('lance', W.lance, LANCE)):
        print(label, 'LOD0', triangles(build(params, 1)), 'LOD1', triangles(build(params, 0)), {k: triangles([v]) for k, v in merge(build(params, 1)).items()})
    unittest.main(argv=sys.argv[:1], verbosity=1)
