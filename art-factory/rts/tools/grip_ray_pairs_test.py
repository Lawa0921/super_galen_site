import unittest
import grip_chart_cage_math as chart


class RayPairTests(unittest.TestCase):
    def hit(self,radius,normal,component=0):
        return {'radius':radius,'normal_dot':normal,'component':component,'face':1}

    def pair(self,hits):
        return chart.pair_verified_hits(hits,min_normal=.05,min_thickness=.00025)

    def test_adjacent_pairs_preserve_air_between_two_layers(self):
        hits=[self.hit(.02,-1),self.hit(.03,1),self.hit(.06,-1),self.hit(.08,1)]
        result=self.pair(hits)
        self.assertEqual([(p['inner']['radius'],p['outer']['radius']) for p in result['pairs']],[(.02,.03),(.06,.08)])

    def test_odd_hits_are_unresolved(self):
        self.assertEqual(self.pair([self.hit(.02,-1)])['reason'],'unpaired')

    def test_bad_entry_exit_order_is_unresolved(self):
        self.assertEqual(self.pair([self.hit(.02,1),self.hit(.03,-1)])['reason'],'winding_or_tangent')

    def test_tangent_and_thin_hits_are_unresolved(self):
        self.assertEqual(self.pair([self.hit(.02,-.01),self.hit(.03,1)])['reason'],'winding_or_tangent')
        self.assertEqual(self.pair([self.hit(.02,-1),self.hit(.0201,1)])['reason'],'thin_interval')

    def test_different_components_are_not_paired(self):
        self.assertEqual(self.pair([self.hit(.02,-1),self.hit(.03,1,1)])['reason'],'different_components')

    def owned(self,hits):
        return chart.pick_owned_pair(hits,{'inner':{10,30},'outer':{20,40}},min_normal=.05,min_thickness=.00025)

    def test_ownership_selects_an_adjacent_pair_without_spanning_another_layer(self):
        hits=[{**self.hit(r,n),'face':f} for r,n,f in ((.02,-1,5),(.03,1,6),(.06,-1,10),(.08,1,20))]
        result=self.owned(hits)
        self.assertIsNone(result['reason'])
        self.assertEqual(result['pair']['inner']['radius'],.06)
        self.assertEqual(result['pair']['outer']['radius'],.08)

    def test_same_global_component_and_roi_cannot_substitute_for_owned_outer_face(self):
        hits=[{**self.hit(.02,-1),'face':10},{**self.hit(.03,1),'face':999}]
        self.assertEqual(self.owned(hits)['reason'],'unowned_source_pair')

    def test_two_owned_pairs_are_an_ambiguous_branch_and_stay_unselected(self):
        hits=[{**self.hit(r,n),'face':f} for r,n,f in ((.02,-1,10),(.03,1,20),(.06,-1,30),(.08,1,40))]
        self.assertEqual(self.owned(hits)['reason'],'ambiguous_owned_pairs')


if __name__=='__main__':unittest.main()
