import unittest
from original_glove_geometry import cage,topology

class OriginalGloveTest(unittest.TestCase):
    def setUp(self):self.data=cage()
    def test_five_digits_join_only_through_a_closed_genus_zero_palm(self):
        t=topology(self.data);self.assertEqual(t['components'],1);self.assertEqual(t['nonmanifold_edges'],0);self.assertEqual(t['genus'],0)
        self.assertEqual(set(self.data['tips']),{'Thumb','Index','Middle','Ring','Little'})
        tips=list(self.data['tips'].values())
        for i,a in enumerate(tips):
            for b in tips[i+1:]:self.assertTrue(set(a).isdisjoint(b))
    def test_finger_weights_are_normalized_and_wrist_is_rigid(self):
        names={b['name'] for b in self.data['bones']};self.assertEqual(len(names),16)
        self.assertTrue({'Thumb1','Thumb2','Thumb3'}<=names)
        for weights in self.data['weights']:
            self.assertAlmostEqual(sum(weights.values()),1,places=7);self.assertTrue(set(weights)<=names);self.assertTrue(all(0<w<=1 for w in weights.values()))
        for i in self.data['wrist']:self.assertEqual(self.data['weights'][i],{'Hand':1})
    def test_digit_lengths_and_tags_keep_distinct_silhouettes(self):
        z={name:max(self.data['vertices'][i][2] for i in ids) for name,ids in self.data['tips'].items()}
        self.assertGreater(z['Middle'],z['Index']);self.assertGreater(z['Index'],z['Little']);self.assertLess(z['Thumb'],z['Little'])
        self.assertEqual(set(self.data['tags']),{'palm','Thumb','Index','Middle','Ring','Little'})
if __name__=='__main__':unittest.main()
