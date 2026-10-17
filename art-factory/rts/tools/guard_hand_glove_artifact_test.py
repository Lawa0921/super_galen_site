"""Actual candidate hard gates, deliberately left RED when deliverable fails."""
import json,unittest
from pathlib import Path
ROOT=Path(__file__).resolve().parents[3]
RUN=ROOT/'art-factory/rts/runs/guard-hand-glove/2026-10-09-v1'
def read(name):return json.loads((RUN/'qa'/name).read_text(encoding='utf8'))
class ActualGloveTests(unittest.TestCase):
    def test_actual_skin_has_valid_exterior_and_zero_self_contact(self):
        g=read('geometry.json')
        self.assertEqual(g['topology']['nonmanifold_edges'],0)
        self.assertEqual(g['topology']['winding_edges'],0)
        self.assertTrue(all(not pairs for pairs in g['self_contacts'].values()))
    def test_actual_glb_preserves_all_triangles_and_legal_interface(self):
        q=read('reimport-interface.json')
        self.assertTrue(q['actual_comparison']['pass'])
        self.assertIsNone(q['welded_boundary_error_preserved'])
        self.assertEqual(q['actual_v35_cuff_strict_triangle_crossings'],[])
        self.assertTrue(q['source_ring_correspondence_within_1e_7m'])
if __name__=='__main__':unittest.main()
