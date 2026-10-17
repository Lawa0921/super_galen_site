import unittest
import grip_gap_chart as chart


class LayerTests(unittest.TestCase):
    def hit(self,radius,face,normal,**extra):return dict(radius=radius,face=face,normal_dot=normal,**extra)

    def test_source_requires_both_faces_of_the_same_frozen_branch(self):
        owners={'02':{'inner':{1},'outer':{2}},'03':{'inner':{3},'outer':{4}}}
        hits=[self.hit(.02,1,-1),self.hit(.04,2,1)]
        self.assertEqual(chart.classify_layers(hits,owners=owners)['intervals'][0]['branch'],'02')
        hits[1]['face']=4
        self.assertEqual(chart.classify_layers(hits,owners=owners)['intervals'][0]['branch'],'other-source')

    def test_cage_semantics_do_not_join_different_branches_or_require_connected_sides(self):
        hits=[self.hit(.02,1,-1,branch='02',surface='inner',component=0),self.hit(.04,2,1,branch='02',surface='outer',component=1)]
        self.assertTrue(chart.classify_layers(hits)['complete'])
        hits[1]['branch']='03'
        self.assertFalse(chart.classify_layers(hits)['complete'])

    def test_odd_tangent_and_thin_rays_remain_unverified(self):
        a=self.hit(.02,1,-1,branch='02',surface='inner')
        b=self.hit(.04,2,1,branch='02',surface='outer')
        self.assertFalse(chart.classify_layers([a])['complete'])
        self.assertFalse(chart.classify_layers([a,{**b,'normal_dot':.01}])['complete'])
        self.assertFalse(chart.classify_layers([a,{**b,'radius':.02001}])['complete'])
        self.assertTrue(chart.classify_layers([])['complete'])


class AdaptiveTests(unittest.TestCase):
    def sample(self,x,y):return {'signature':['air'],'complete':True,'passed':True,'endpoints':[]}

    def test_uniform_air_requires_refinement_comparison_before_sampled_acceptance(self):
        result=chart.adaptive_cells(self.sample,[0,1],[0,1],max_depth=2,tolerance=.001)
        self.assertEqual(len(result['accepted']),4)
        self.assertFalse(result['unresolved'])
        self.assertTrue(all(c['level']==1 and c['parent_error_m']==0 for c in result['accepted']))

    def test_branch_changes_stay_unresolved_at_maximum_depth(self):
        def trace(x,y):return {**self.sample(x,y),'signature':['air' if x<.51 else 'solid']}
        result=chart.adaptive_cells(trace,[0,1],[0,1],max_depth=2,tolerance=.001)
        self.assertTrue(result['unresolved'])
        self.assertTrue(all(c['level']==2 for c in result['unresolved']))

    def test_world_space_curvature_and_failed_probes_cannot_pass_as_stable(self):
        def curved(x,y):return {**self.sample(x,y),'endpoints':[[x,y,x*x]],'signature':['solid']}
        result=chart.adaptive_cells(curved,[0,1],[0,1],max_depth=2,tolerance=.0001)
        self.assertFalse(result['accepted'])
        self.assertTrue(all(c['error_m']>.0001 for c in result['unresolved']))
        result=chart.adaptive_cells(lambda x,y:{**self.sample(x,y),'passed':False},[0,1],[0,1],max_depth=2,tolerance=.001)
        self.assertFalse(result['accepted'])


class CoverageTests(unittest.TestCase):
    def cell(self,source,cage):return {'signature':[source,cage]}

    def test_air_and_one_branch_cannot_approve_a_two_branch_chart(self):
        cells=[self.cell([],[]),self.cell(['02'],['02']),self.cell(['other-source'],[])]
        result=chart.assess_coverage(cells,['02','03'])
        self.assertFalse(result['passed']);self.assertEqual(result['missing_branches'],['03'])
        self.assertEqual(result['accepted_by_branch'],{'02':1,'03':0})

    def test_both_branches_and_sampled_air_are_required(self):
        cells=[self.cell(['02'],['02']),self.cell(['03'],['03'])]
        self.assertFalse(chart.assess_coverage(cells,['02','03'])['passed'])
        result=chart.assess_coverage(cells+[self.cell([],[])],['02','03'])
        self.assertTrue(result['passed']);self.assertEqual(result['sampled_air_cells'],1)


if __name__=='__main__':unittest.main()
