"""The strengthened gate must reject the actual prior contact/parity/budget failures."""
import unittest,copy
from publish_original_guard_v2 import validate_additional_gates


def reports():
    assets=[{'lod':0,'sha256':'a'},{'lod':1,'sha256':'b'}]
    structure={'lods':[dict(assets[0],triangles=19910),dict(assets[1],triangles=9901)]}
    parity={'status':'pass','lods':[dict(a,maxErrorM=1e-5,maxBoneMatrixError=3.3e-5) for a in assets]}
    cases=[{'lod':l,'groupMode':g,'passed':True,'missingAttackers':[],'surfaceGaps':[0]*(4 if g else 1),'authoredContacts':[{'gap':0}]*(4 if g else 1),'minFootClearance':0} for l in (0,1) for g in (False,True)]
    contact={'status':'pass','sourceAssets':assets,'cases':cases}
    return assets,structure,parity,contact

class GuardDeliveryGateTests(unittest.TestCase):
    def test_complete_exact_coverage_passes(self):validate_additional_gates(*reports())
    def test_prior_miss_rejected_even_with_pass_flag(self):
        args=reports();args[3]['cases'][0]['surfaceGaps']=[.016859]
        with self.assertRaisesRegex(ValueError,'contact'):validate_additional_gates(*args)
    def test_authored_pose_missing_rejected(self):
        args=reports();args[3]['cases'][0]['authoredContacts']=[]
        with self.assertRaisesRegex(ValueError,'authored'):validate_additional_gates(*args)
    def test_no_low_lod_group_case_rejected(self):
        args=reports();args[3]['cases'].pop()
        with self.assertRaisesRegex(ValueError,'coverage'):validate_additional_gates(*args)
    def test_stale_contact_geometry_rejected(self):
        args=reports();args[3]['sourceAssets']=copy.deepcopy(args[0]);args[3]['sourceAssets'][0]['sha256']='stale'
        with self.assertRaisesRegex(ValueError,'hash'):validate_additional_gates(*args)
    def test_old_dense_geometry_rejected(self):
        args=reports();args[1]['lods'][0]['triangles']=92000
        with self.assertRaisesRegex(ValueError,'budget'):validate_additional_gates(*args)
    def test_prior_export_precision_rejected(self):
        args=reports();args[2]['lods'][1]['maxBoneMatrixError']=1.402e-4
        with self.assertRaisesRegex(ValueError,'parity'):validate_additional_gates(*args)
    def test_nonfinite_contact_rejected(self):
        args=reports();args[3]['cases'][1]['surfaceGaps'][0]=float('nan')
        with self.assertRaisesRegex(ValueError,'contact'):validate_additional_gates(*args)

if __name__=='__main__':unittest.main()
