"""Apply the existing infantry release budget to staged model bytes too."""
import unittest,os
from pathlib import Path
from procedural_gauntlet_publish import read_glb

ROOT = Path(__file__).resolve().parents[3]
RUN = ROOT / os.environ.get('RTS_ASSEMBLY_RUN','art-factory/rts/runs/all-models/2026-10-14-v1')


class InfantryCandidateBudgetTest(unittest.TestCase):
    def test_guard_retains_near_and_far_release_budgets(self):
        for lod, limit in ((0, 20000), (1, 10000)):
            with self.subTest(lod=lod):
                doc, _ = read_glb(RUN / f'candidate/guard{"-lod1" if lod else ""}.glb')
                triangles = sum(doc['accessors'][p['indices']]['count'] // 3
                                for node in doc['nodes'] if 'mesh' in node
                                for p in doc['meshes'][node['mesh']]['primitives'])
                self.assertGreater(triangles, 4000 if lod else 8000)
                self.assertLessEqual(triangles, limit)


if __name__ == '__main__':
    unittest.main()
