"""Publication preflight rejects stale or incomplete visual evidence."""
import hashlib
import json
import tempfile
import unittest
from pathlib import Path
from publish_original_guard import preflight

class PublicationTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory()
        self.run=Path(self.temp.name)
        (self.run/'candidate').mkdir()
        (self.run/'qa').mkdir()
        self.assets=[]
        for lod in (0,1):
            data=f'validated immutable candidate {lod}'.encode()
            (self.run/'candidate'/f'original-guard-assembly-lod{lod}.glb').write_bytes(data)
            self.assets.append({'lod':lod,'sha256':hashlib.sha256(data).hexdigest()})
        source=b'editable original source'
        (self.run/'candidate/original-guard-assembly.blend').write_bytes(source)
        self.review={'status':'approved-for-runtime','assets':self.assets,
                     'source_sha256':hashlib.sha256(source).hexdigest(),'evidence':['review.png']}
        (self.run/'qa/review.png').write_bytes(b'preserved visual evidence')
        self.save('root-review.json',self.review)
        self.save('runtime-structure.json',{'status':'pass','lods':self.assets})
        self.save('runtime-bounds.json',{'status':'pass','lods':self.assets})
        self.save('three.json',{'status':'pass','sourceAssets':self.assets,'errors':[],
                  'clips':['Attack','Death','Hurt','Idle','Walk'],
                  'lowClips':['Attack','Death','Hurt','Idle','Walk'],
                  'changed':dict.fromkeys(['walk','attack','hurt','death'],True)})
        self.save('khronos.json',{'errors':0,'assets':[dict(a,issues={'numErrors':0}) for a in self.assets]})
    def tearDown(self): self.temp.cleanup()
    def save(self,name,value): (self.run/'qa'/name).write_text(json.dumps(value),encoding='utf-8')
    def test_accepts_exactly_the_reviewed_bytes(self):
        result=preflight(self.run)
        self.assertEqual([a['sha256'] for a in result['assets']],[a['sha256'] for a in self.assets])
        self.assertEqual(len(result['buffers']),2)
    def test_accepts_structural_auditor_lod_labels(self):
        self.save('runtime-structure.json',{'status':'pass','lods':[dict(a,lod='lod'+str(a['lod'])) for a in self.assets]})
        self.assertEqual(len(preflight(self.run)['assets']),2)
    def test_rejects_a_rebuild_after_review(self):
        (self.run/'candidate/original-guard-assembly-lod1.glb').write_bytes(b'rebuilt')
        with self.assertRaisesRegex(ValueError,'hash'): preflight(self.run)
    def test_requires_independent_visual_review(self):
        self.review['status']='candidate'
        self.save('root-review.json',self.review)
        with self.assertRaisesRegex(ValueError,'visual'): preflight(self.run)
    def test_requires_both_lods_in_webgl_evidence(self):
        report=json.loads((self.run/'qa/three.json').read_text())
        report['sourceAssets']=report['sourceAssets'][:1]
        self.save('three.json',report)
        with self.assertRaisesRegex(ValueError,'hash'): preflight(self.run)
    def test_rejects_changed_editable_source(self):
        (self.run/'candidate/original-guard-assembly.blend').write_bytes(b'changed source')
        with self.assertRaisesRegex(ValueError,'source'): preflight(self.run)
    def test_rejects_a_stale_exported_skin_bounds_check(self):
        stale=[dict(a) for a in self.assets]
        stale[1]['sha256']='stale-export'
        self.save('runtime-bounds.json',{'status':'pass','lods':stale})
        with self.assertRaisesRegex(ValueError,'hash'): preflight(self.run)
    def test_rejects_vertices_outside_the_exported_skin_bounds(self):
        self.save('runtime-bounds.json',{'status':'fail','lods':self.assets})
        with self.assertRaisesRegex(ValueError,'bounds'): preflight(self.run)

if __name__=='__main__': unittest.main()
