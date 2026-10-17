"""Real optimized-Python audit must reject tampered runtime data."""
from pathlib import Path
import hashlib,json,subprocess,sys,tempfile,unittest


class RuntimeAuditTests(unittest.TestCase):
    def run_fixture(self, tamper=False):
        with tempfile.TemporaryDirectory() as directory:
            root=Path(directory); factory=root/'art-factory/rts'; runtime=root/'public/assets/games/rts'
            (factory/'manifests').mkdir(parents=True);runtime.mkdir(parents=True)
            digest=hashlib.sha256(b'original').hexdigest()
            (root/'candidate.png').write_bytes(b'original')
            (runtime/'tile.png').write_bytes(b'changed' if tamper else b'original')
            (runtime/'model-registry.json').write_text(json.dumps({'assets':{}}))
            (factory/'profile.json').write_text(json.dumps({'registries':['manifests/tiles.json']}))
            (factory/'manifests/tiles.json').write_text(json.dumps({'assets':[
                {'id':'tile','status':'published','runtime':'/assets/games/rts/tile.png',
                 'sha256':digest,'candidate':'candidate.png'}]}))
            # The independent interpreter really uses -O, not a mocked assert flag.
            result=subprocess.run([sys.executable,'-B','-O','-c',
                'from pathlib import Path; from audit_runtime import audit; audit(Path(__import__("sys").argv[1]))',
                str(root)],cwd=Path(__file__).parent,capture_output=True,text=True)
            report=factory/'manifests/runtime-qa.json'
            return result,json.loads(report.read_text()) if report.exists() else None

    def test_optimized_audit_accepts_intact_bytes_without_approving_game(self):
        result,report=self.run_fixture()
        self.assertEqual(result.returncode,0,result.stderr)
        self.assertEqual(report['asset_count'],1)
        self.assertFalse(report['commercial_quality_approved'])

    def test_optimized_audit_rejects_mutated_runtime_and_writes_no_pass_report(self):
        result,report=self.run_fixture(tamper=True)
        self.assertNotEqual(result.returncode,0)
        self.assertIn('runtime SHA256 mismatch',result.stderr)
        self.assertIsNone(report)


if __name__=='__main__':unittest.main()
