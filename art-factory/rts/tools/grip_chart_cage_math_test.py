"""Open source-patch topology regressions; these do not approve anatomy."""
import collections
import importlib.util
import math
import unittest
from pathlib import Path


class ControlledChartTests(unittest.TestCase):
    def builder(self):
        spec=importlib.util.spec_from_file_location('grip_chart_cage_math',Path(__file__).with_name('grip_chart_cage_math.py'))
        module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
        return module.build_chart_shell

    def samples(self,angles=8,rows=5):
        return [[{'t':j*.1,'inner':.2,'outer':.3,'radial_intervals':1,'branch':'finger-a'} for j in range(rows)] for _ in range(angles)]

    def edges(self,samples,periodic=False):
        n=len(samples);m=len(samples[0]);edges=[]
        for a in range(n):
            for z in range(m):
                if z+1<m:edges.append(((a,z),(a,z+1)))
                if a+1<n or periodic:edges.append(((a,z),((a+1)%n,z)))
        return edges

    def cells(self,samples):
        return [(a,z) for a in range(len(samples)) for z in range(len(samples[0])-1)]

    def boundary_count(self,faces):
        counts=collections.Counter(tuple(sorted((a,b))) for face in faces for a,b in zip(face,face[1:]+face[:1]))
        self.assertTrue(all(count<=2 for count in counts.values()))
        return sum(count==1 for count in counts.values())

    def test_unknown_continuity_emits_no_faces(self):
        result=self.builder()(self.samples())
        self.assertEqual(result['quads'],[])
        self.assertGreater(len(result['unresolved_cells']),0)

    def test_periodic_patch_remains_open_at_unclassified_axial_boundaries(self):
        samples=self.samples()
        result=self.builder()(samples,verified_edges=self.edges(samples,True),verified_cells=self.cells(samples),seam_verified=True)
        self.assertEqual(len(result['vertices']),80)
        self.assertEqual(len(result['quads']),64)
        self.assertEqual(self.boundary_count(result['quads']),32)
        self.assertEqual(result['cell_domain_components'],1)
        self.assertEqual(result['mesh_components'],2)
        self.assertEqual(result['boundary_loops'],4)
        self.assertEqual(result['boundary_degree_errors'],[])
        self.assertFalse(any(f['surface']=='boundary' for f in result['face_sources']))

    def test_seam_is_open_without_explicit_permission_even_with_verified_edges(self):
        samples=self.samples()
        result=self.builder()(samples,verified_edges=self.edges(samples,True),verified_cells=self.cells(samples))
        self.assertEqual(len(result['quads']),56)
        self.assertFalse(any(f['angle']==7 for f in result['face_sources']))
        self.assertEqual(result['boundary_loops'],2)
        self.assertEqual(result['boundary_degree_errors'],[])

    def test_different_semantic_branches_never_connect(self):
        samples=self.samples()
        for column in samples[4:]:
            for sample in column:sample['branch']='finger-b'
        result=self.builder()(samples,verified_edges=self.edges(samples,True),verified_cells=self.cells(samples),seam_verified=True)
        self.assertEqual(len(result['quads']),48)
        self.assertFalse(any(f['angle'] in (3,7) for f in result['face_sources']))
        self.assertEqual(result['cell_domain_components'],2)
        self.assertEqual(result['mesh_components'],4)

    def test_missing_finger_gap_is_open_and_never_spanned(self):
        samples=self.samples(rows=7)
        for column in samples:column[3]=None
        result=self.builder()(samples,verified_edges=self.edges(samples,True),verified_cells=self.cells(samples),seam_verified=True)
        self.assertEqual(self.boundary_count(result['quads']),64)
        for face in result['quads']:
            heights=[result['vertices'][i][2] for i in face]
            self.assertFalse(min(heights)<.3<max(heights))
        self.assertEqual(result['cell_domain_components'],2)
        self.assertEqual(result['mesh_components'],4)

    def test_multiple_radial_layers_need_an_explicit_selected_pair(self):
        samples=self.samples();samples[2][2]['radial_intervals']=2
        with self.assertRaisesRegex(ValueError,'radial layers'):self.builder()(samples)

    def test_missing_semantic_identity_is_rejected(self):
        samples=self.samples();del samples[2][2]['branch']
        with self.assertRaisesRegex(ValueError,'branch'):self.builder()(samples)

    def test_invalid_crossed_radii_are_rejected(self):
        samples=self.samples();samples[2][2]['outer']=.1
        with self.assertRaisesRegex(ValueError,'radii'):self.builder()(samples)

    def test_diagonal_only_surface_contact_requires_separate_patches(self):
        samples=[[None]*5 for _ in range(6)]
        for a,z in ((1,1),(1,2),(2,1),(2,2),(2,3),(3,2),(3,3)):
            samples[a][z]={'t':z*.1,'inner':.2,'outer':.3,'radial_intervals':1,'branch':'finger-a'}
        with self.assertRaisesRegex(ValueError,'diagonal'):self.builder()(samples,verified_edges=self.edges(samples),verified_cells=self.cells(samples))

    def test_verified_edges_do_not_justify_an_unmeasured_cell_interior(self):
        samples=self.samples()
        result=self.builder()(samples,verified_edges=self.edges(samples))
        self.assertEqual(result['quads'],[])
        self.assertTrue(all(cell['reason']=='unverified_interior' for cell in result['unresolved_cells']))

    def test_authored_curved_columns_preserve_each_control_points_angle(self):
        samples=self.samples()
        for a,column in enumerate(samples):
            for z,sample in enumerate(column):sample['theta']=2*math.pi*a/len(samples)+z*.02
        result=self.builder()(samples,verified_edges=self.edges(samples),verified_cells=self.cells(samples))
        for position,(a,z,side) in zip(result['vertices'],result['grid_keys']):
            radius=samples[a][z]['outer' if side else 'inner'];angle=samples[a][z]['theta']
            self.assertAlmostEqual(position[0],radius*math.cos(angle))
            self.assertAlmostEqual(position[1],radius*math.sin(angle))

    def test_crossed_authored_columns_are_rejected(self):
        samples=self.samples();samples[3][2]['theta']=0
        with self.assertRaisesRegex(ValueError,'Authored angles'):self.builder()(samples)


if __name__=='__main__':unittest.main()
