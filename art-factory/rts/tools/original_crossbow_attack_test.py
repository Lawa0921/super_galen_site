"""Visible attack requirements measured from actual Blender-evaluated bone/rail samples."""
import json,math,sys,unittest
from pathlib import Path
RUN=Path(__file__).resolve().parents[1]/'runs/original-crossbow-attack/2026-10-06-v1'
BASELINE='--baseline' in sys.argv
if BASELINE:sys.argv.remove('--baseline')
DATA=json.loads((RUN/f'qa/{"baseline" if BASELINE else "candidate"}-motion.json').read_text())
def point(clip,frame):return next(r for r in DATA['rows'] if r['clip']==clip and r['frame']==frame)
class OriginalAttackTest(unittest.TestCase):
    def test_modeled_rail_faces_target_through_aim_and_release(self):
        for frame in range(8,13):self.assertLess(point('Attack',frame)['rail_forward_angle_deg'],3,'held-across-body rail must turn toward the target')
        self.assertGreater(point('Attack',12)['trigger'][2]-point('Idle',0)['trigger'][2],.18,'aim pose must actually lift the weapon')
    def test_reload_releases_support_hand_then_recovers(self):
        rows=[point('Attack',f) for f in range(24,33)]
        # Offset from the weapon's support point changes only if the supporting
        # hand actually moves independently; whole-weapon bob does not count.
        offsets=[[r['bones']['Hand_L'][i]-r['support'][i] for i in range(3)] for r in rows]
        self.assertGreater(max(math.dist(a,b) for a in offsets for b in offsets),.07,'old fixed grip has no reload hand movement')
        for name in point('Attack',0)['bones']:
            self.assertLess(math.dist(point('Attack',0)['bones'][name],point('Attack',40)['bones'][name]),1e-5)
    def test_complete_cycle_and_positive_ranged_clearance(self):
        self.assertEqual(DATA['fps'],24)
        self.assertEqual([r['frame'] for r in DATA['rows'] if r['clip']=='Attack'],list(range(41)))
        for r in DATA['rows']:
            if r['clip']=='Attack':self.assertGreater(r['rail_front'][2],1.05)
    def test_support_grasp_remains_rigid_while_raising_and_lowering(self):
        for frame in [*range(21),*range(36,41)]:self.assertLess(point('Attack',frame)['grasp_drift_m'],2e-5)
    def test_endpoint_arms_match_idle_without_transition_pop(self):
        for frame in [0,40]:self.assertLess(point('Attack',frame)['idle_arm_matrix_error'],2e-5)
if __name__=='__main__':unittest.main()
