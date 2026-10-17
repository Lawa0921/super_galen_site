import unittest
import numpy as np
from original_glove_thumb_skin import repair
class ThumbOwnershipTests(unittest.TestCase):
    bones={'Thumb1_L':{'head':[0,0,0],'tail':[1,0,0]},'Thumb2_L':{'head':[1,0,0],'tail':[2,0,0]},'Thumb3_L':{'head':[2,0,0],'tail':[3,0,0]}}
    def test_index_collar_cannot_be_driven_by_thumb_tip(self):
        actual=repair({'Thumb3_L':.3,'Index1_L':.6,'Middle1_L':.1},[2.5,1,0],self.bones,False,{'Index'},.1)
        self.assertNotIn('Thumb3_L',actual);self.assertAlmostEqual(actual['Index1_L'],6/7);self.assertAlmostEqual(actual['Middle1_L'],1/7)
    def test_thumb_joint_blend_follows_chain_instead_of_global_z(self):
        actual=repair({'Thumb3_L':1},[1,0,0],self.bones,True,set(),.1)
        self.assertAlmostEqual(actual['Thumb1_L'],.5);self.assertAlmostEqual(actual['Thumb2_L'],.5)
    def test_true_distal_thumb_retains_distal_ownership(self):
        self.assertEqual(repair({'Thumb3_L':1},[2.5,0,0],self.bones,True,set(),.1),{'Thumb3_L':1})
    def test_unaffected_finger_weights_remain_identical(self):
        w={'Index1_L':.4,'Index2_L':.6};self.assertEqual(repair(w,[2,1,0],self.bones,False,{'Index'},.1),w)
    def test_non_thumb_web_blends_remain_identical_on_middle_collar(self):
        # A named port is a surface boundary, not exclusive skeletal ownership.
        # Removing a neighbouring finger's small weight folded the narrow web.
        weights={'Middle1_L':.75,'Index1_L':.20,'Index2_L':.05}
        self.assertEqual(repair(weights,[2,1,0],self.bones,False,{'Middle'},.1),weights)
    def test_real_middle_web_does_not_fold_after_semantic_repair(self):
        import json
        from pathlib import Path
        from original_glove_grip_math import deform
        from original_glove_self_contact import triangle_pair_gaps
        root=Path(__file__).resolve().parents[3]
        hand=json.loads((root/'art-factory/rts/runs/original-glove-weapon-fit/2026-10-07-v1/raw/hand.json').read_text())
        for i in [907,546,910]:
            hand['weights'][i]=repair(hand['weights'][i],hand['points'][i],hand['bones'],False,{'Middle'})
        angles={n:[30,35,20] for n in ['Index','Middle','Ring','Little']};angles['Thumb']=[20,30,20]
        swings={n:{'axis':[0,1,0],'degrees':v} for n,v in zip(['Index','Middle','Ring','Little'],[3,6,0,-2])}
        gap=triangle_pair_gaps(deform(hand,angles,swings),np.array(hand['faces']),np.array([[1111,2065]]))[0]
        self.assertGreater(gap,.00015)
if __name__=='__main__':unittest.main()
