import hashlib,json,os,unittest
from pathlib import Path
ROOT=Path(__file__).resolve().parents[3]
RUN=Path(os.environ.get('GUARD_GLOVE_ARTIFACT_RUN',ROOT/'art-factory/rts/runs/guard-hand-glove/2026-10-09-v2'))
def read(p):return json.loads(p.read_text(encoding='utf8'))
class ActualArtifactTests(unittest.TestCase):
    def test_actual_shell_source_and_import_mechanical_gates(self):
        g=read(RUN/'qa/geometry.json');q=read(RUN/'qa/reimport-interface.json')
        self.assertEqual(g['failures'],[])
        self.assertEqual(g['topology']['boundary_edges'],28)
        for record in [g,q]:
            topology=record.get('topology',record.get('welded_topology_QA_only_precision7'))
            for name in ['nonmanifold_edges','winding_edges','degenerate_triangles']:self.assertEqual(topology[name],0)
            for pairs in record['self_contacts'].values():self.assertEqual(pairs,[])
        self.assertEqual(q['actual_imported_handle_clearance']['violating_triangles'],0)

    def test_actual_roundtrip_true_cuff_and_hash_binding(self):
        q=read(RUN/'qa/reimport-interface.json');g=read(RUN/'qa/geometry.json')
        self.assertEqual(q['actual_v35_cuff_strict_triangle_crossings'],[])
        self.assertEqual(q['failures'],[]);self.assertTrue(q['actual_comparison']['pass'])
        self.assertEqual(q['actual_comparison']['matched_triangles'],q['source_triangle_count'])
        self.assertEqual(q['actual_comparison']['unmatched_count'],0)
        self.assertLessEqual(q['source_ring_max_position_delta_m'],1e-7)
        for name,key in [('guard-right-hand-soft-glove-clay.blend','candidate_blend_sha256'),('guard-right-hand-soft-glove-clay-lod0.glb','candidate_glb_sha256')]:
            sha=hashlib.sha256((RUN/'candidate'/name).read_bytes()).hexdigest();self.assertEqual(sha,q[key]);self.assertEqual(sha,g[key])
if __name__=='__main__':unittest.main()
