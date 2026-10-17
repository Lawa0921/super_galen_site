import unittest
import numpy as np
import grip_gap_math as gap


class IntervalTests(unittest.TestCase):
    def interval(self,lo,hi,branch):return {'lo':lo,'hi':hi,'branch':branch}

    def test_small_source_deviation_stays_mapped_to_same_branch(self):
        result=gap.audit_intervals([self.interval(.027,.040,'02')],[self.interval(.0268,.0402,'02')],.0005)
        self.assertTrue(result['passed']);self.assertAlmostEqual(result['max_air_intrusion'],.0002)

    def test_empty_source_is_not_permission_for_a_small_artificial_shell(self):
        self.assertFalse(gap.audit_intervals([],[self.interval(.027,.0271,'02')],.0005)['passed'])

    def test_cage_cannot_fill_the_air_between_separate_layers(self):
        source=[self.interval(.027,.032,'02'),self.interval(.035,.040,'02')]
        self.assertFalse(gap.audit_intervals(source,[self.interval(.027,.040,'02')],.0005)['passed'])

    def test_foreign_solid_overlap_is_rejected_even_within_air_tolerance(self):
        source=[self.interval(.027,.040,'02'),self.interval(.0401,.045,'other-source')]
        self.assertFalse(gap.audit_intervals(source,[self.interval(.027,.0402,'02')],.0005)['passed'])

    def test_wrong_branch_and_excess_air_are_rejected(self):
        source=[self.interval(.027,.040,'02')]
        self.assertFalse(gap.audit_intervals(source,[self.interval(.027,.040,'03')],.0005)['passed'])
        self.assertFalse(gap.audit_intervals(source,[self.interval(.027,.0406,'02')],.0005)['passed'])

    def test_two_branches_cannot_consume_the_same_air_even_with_individual_tolerance(self):
        source=[self.interval(0,1,'02'),self.interval(1.2,2.2,'03')]
        cage=[self.interval(0,1.15,'02'),self.interval(1.05,2.2,'03')]
        result=gap.audit_intervals(source,cage,.2)
        self.assertFalse(result['passed'])
        self.assertTrue(any(f['reason']=='cage_interval_overlap' for f in result['failures']))

    def test_same_branch_overlap_and_exact_touch_also_fail(self):
        source=[self.interval(0,2,'02')]
        for second in (.9,1):
            self.assertFalse(gap.audit_intervals(source,[self.interval(0,1,'02'),self.interval(second,2,'02')],.2)['passed'])

    def test_required_authored_interior_cannot_silently_lose_its_cage_branch(self):
        source=[self.interval(.027,.040,'02')]
        self.assertFalse(gap.audit_intervals(source,[],.0005,required_branches=['02'])['passed'])
        self.assertTrue(gap.audit_intervals(source,[],.0005)['passed'])


class ContactGapTests(unittest.TestCase):
    def test_exact_narrow_contact_overrides_sparse_large_gap_samples(self):
        self.assertFalse(gap.excess_contact_gap(.0004,[.002,.003],.0008))

    def test_exact_and_sampled_large_clearance_establish_excess_gap(self):
        self.assertTrue(gap.excess_contact_gap(.002,[.0021,.003],.0008))

    def test_missing_or_invalid_measurements_cannot_establish_excess_gap(self):
        self.assertFalse(gap.excess_contact_gap(.002,[],.0008))
        with self.assertRaises(ValueError):gap.excess_contact_gap(float('nan'),[.002],.0008)


class TriangleClearanceTests(unittest.TestCase):
    def triangle(self,z=0):return np.array([[0,0,z],[1,0,z],[0,1,z]],float)

    def test_parallel_faces_have_exact_clearance_and_witnesses(self):
        result=gap.triangle_clearance(self.triangle(),self.triangle(.02))
        self.assertAlmostEqual(result['distance'],.02)
        self.assertAlmostEqual(np.linalg.norm(np.array(result['first'])-result['second']),.02)

    def test_piercing_edges_are_contact_even_when_all_vertices_are_outside(self):
        other=np.array([[.2,.2,-1],[.2,.2,1],[2,2,1]])
        self.assertLess(gap.triangle_clearance(self.triangle(),other)['distance'],1e-10)

    def test_coplanar_containment_and_edge_touch_are_contact(self):
        contained=np.array([[.1,.1,0],[.2,.1,0],[.1,.2,0]])
        touching=np.array([[1,0,0],[2,0,0],[1,1,0]])
        self.assertLess(gap.triangle_clearance(self.triangle(),contained)['distance'],1e-10)
        self.assertLess(gap.triangle_clearance(self.triangle(),touching)['distance'],1e-10)

    def test_skew_edges_and_small_scaled_triangles_preserve_distance(self):
        other=np.array([[1,1,.2],[2,1,.2],[1,2,.2]])
        expected=(.5+.04)**.5
        self.assertAlmostEqual(gap.triangle_clearance(self.triangle(),other)['distance'],expected)
        self.assertAlmostEqual(gap.triangle_clearance(self.triangle()*.001,other*.001)['distance'],expected*.001)

    def test_mesh_aabb_pruning_still_finds_the_pair_beyond_the_initial_witness(self):
        a=np.array([self.triangle(),self.triangle(10)])
        b=np.array([self.triangle(2),self.triangle(10.1)])
        result=gap.mesh_clearance(a,b,initial_pair=(0,0))
        self.assertAlmostEqual(result['distance'],.1)
        self.assertEqual(result['triangle_pair'],[1,1])

    def test_degenerate_source_triangle_is_treated_as_its_edges(self):
        line=np.array([[0,0,0],[1,0,0],[.5,0,0]],float)
        self.assertAlmostEqual(gap.triangle_clearance(line,self.triangle(1))['distance'],1)


if __name__=='__main__':unittest.main()
