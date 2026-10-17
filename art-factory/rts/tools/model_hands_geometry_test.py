"""Hand geometry gate: digits wrap the handle without entering it, winding agrees with normals, no NaNs, budgets."""
import sys, unittest
from pathlib import Path
import numpy as np
sys.path.insert(0, str(Path(__file__).resolve().parent))
from model_hands_geometry import hand_parts, chord_chain, cuff_parts, FINGERS, STYLES  # noqa: E402


def winding_errors(part):
    p = part.position.astype(np.float64); t = part.indices.reshape(-1, 3)
    fn = np.cross(p[t[:, 1]] - p[t[:, 0]], p[t[:, 2]] - p[t[:, 0]])
    area = np.linalg.norm(fn, axis=1); keep = area > 1e-10
    ok = np.einsum('ij,ij->i', fn[keep], part.normal[t[keep]].mean(1))
    return int((ok < 0).sum()), int(keep.sum())


def seg_dist_to_axis(a, b):
    """Minimum distance of segment ab (xy plane) to the origin."""
    a, b = np.asarray(a[:2]), np.asarray(b[:2]); d = b - a
    t = np.clip(-np.dot(a, d) / max(np.dot(d, d), 1e-12), 0, 1)
    return float(np.linalg.norm(a + d * t))


SPEC = dict(pose='grip', grip_radius=0.018, wrist_local=(0.0, -0.085, -0.02))


class Hands(unittest.TestCase):
    def test_chord_chain_hugs_but_never_enters_the_handle(self):
        r_in = 0.03
        for _, _, lengths, _, ang in FINGERS:
            J = chord_chain(np.radians(ang), lengths, r_in, 0.0)
            for a, b in zip(J, J[1:]):
                self.assertGreaterEqual(seg_dist_to_axis(a, b), r_in * 0.999)
                self.assertLess(seg_dist_to_axis(a, b), r_in * 1.06)  # each phalanx (nearly) touches the inner circle
            wrap = np.degrees(np.arctan2(J[-1][1], J[-1][0]) - np.arctan2(J[0][1], J[0][0])) % 360
            self.assertGreater(wrap, 120)  # a closed finger, not a straight stub

    def test_every_style_and_pose_is_clean_and_within_budget(self):
        for style in STYLES:
            for pose in ('grip', 'fist', 'relaxed', 'open'):
                for detail, budget in ((1, 3500), (0, 900)):
                    with self.subTest(style=style, pose=pose, detail=detail):
                        parts, info = hand_parts(dict(SPEC, pose=pose, style=style), detail)
                        tris = 0
                        for p, kind in parts:
                            self.assertEqual(kind, 'hand')
                            for arr in (p.position, p.normal, p.uv):
                                self.assertFalse(np.isnan(arr).any(), (style, pose, p.material))
                            bad, n = winding_errors(p)
                            self.assertLessEqual(bad, max(2, n // 50), (style, pose, p.material))
                            tris += len(p.indices) // 3
                        self.assertLessEqual(tris, budget)
                        self.assertGreater(tris, 300 if detail else 150)

    def test_closed_grip_digits_stay_outside_the_grip_surface(self):
        parts, _ = hand_parts(dict(SPEC, style='plate'), 1)
        allp = np.vstack([p.position for p, _ in parts])
        near = allp[np.abs(allp[:, 2]) < 0.04]
        radial = np.hypot(near[:, 0], near[:, 1])
        # fingers, palm and thumb surround the handle; nothing sinks more than 2 mm into it
        self.assertGreater(float(radial.min()), SPEC['grip_radius'] - 0.002)
        ang = np.degrees(np.arctan2(near[:, 1], near[:, 0])) % 360
        covered = np.unique((ang // 15).astype(int))
        self.assertGreaterEqual(len(covered), 20)  # >= 300 degrees of the handle are enclosed by the hand

    def test_articulated_digits_are_separate_pieces(self):
        parts, _ = hand_parts(dict(SPEC, style='leather'), 1)
        # 4 fingers x 3 phalanges + thumb (metacarpal + 2) + palm + thenar + hypothenar
        self.assertGreaterEqual(len(parts), 18)
        lod1, _ = hand_parts(dict(SPEC, style='leather'), 0)
        self.assertLess(sum(len(p.indices) for p, _ in lod1), sum(len(p.indices) for p, _ in parts))

    def test_cuff_is_an_open_bell_with_its_poles_inside_the_hand(self):
        for style in STYLES:
            parts, L = cuff_parts(style, np.zeros(3), np.array([0, 1.0, 0]), 0.03, 1.0, 1)
            shell = parts[0]
            ys = shell.position[:, 1]
            self.assertGreater(float(ys.max()), L * 0.95)
            # the open end has an inner wall: some vertices near the rim lie inside the outer radius
            rim = shell.position[ys > L * 0.9]
            r = np.hypot(rim[:, 0], rim[:, 2])
            self.assertLess(float(r.min()), float(r.max()) - 0.002)


if __name__ == '__main__':
    unittest.main()
