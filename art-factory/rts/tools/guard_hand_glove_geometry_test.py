import unittest,math
from guard_hand_glove_geometry import sleeve_plane_contour,anatomy_strokes,angular_collar_zipper,validate_cut_integrity
from guard_hand_foundation_math import topology

class GloveGeometryTests(unittest.TestCase):
    def test_negative_cut_cannot_drop_geometry_outside_cutter_bounds(self):
        before={'min':[.38975,-.04595,.77424],'max':[.52150,.03059,.89555]}
        broken={'min':[.46489,-.03124,.78056],'max':[.51213,.00568,.84747]}
        cutter={'min':[.46489,-.03124,.712],'max':[.51089,.01476,.918]}
        with self.assertRaisesRegex(ValueError,'untouched'):
            validate_cut_integrity(before,broken,cutter)
        self.assertTrue(validate_cut_integrity(before,before,cutter))
    def test_actual_plane_slice_provenance_and_closed_ordered_contour(self):
        v=[(-1,-1,-1),(1,-1,-1),(1,1,-1),(-1,1,-1),(-1,-1,1),(1,-1,1),(1,1,1),(-1,1,1)]
        f=[(0,1,5),(0,5,4),(1,2,6),(1,6,5),(2,3,7),(2,7,6),(3,0,4),(3,4,7)]
        result=sleeve_plane_contour(v,f,(0,0,0),(0,0,1))
        self.assertEqual(len(result['loops']),1)
        loop=result['loops'][0];self.assertEqual(len(loop),8)
        for p in loop:self.assertEqual(p[2],0)
        self.assertEqual(set(e['source_triangle_id'] for e in result['segments']),set(range(8)))
        for e in result['segments']:
            for endpoint in e['endpoints']:
                self.assertEqual(len(endpoint['source_edge_vertex_ids']),2)
                self.assertGreaterEqual(endpoint['edge_fraction'],0);self.assertLessEqual(endpoint['edge_fraction'],1)
    def test_tangent_coplanar_plane_refuses_fake_interface(self):
        with self.assertRaisesRegex(ValueError,'Coplanar|closed'):
            sleeve_plane_contour([(0,0,0),(1,0,0),(0,1,0)],[(0,1,2)],(0,0,0),(0,0,1))
    def test_all_digits_have_three_named_bone_segments_individual_lengths(self):
        result=anatomy_strokes();digits=result['digits'];self.assertEqual(set(digits),{'INDEX','MIDDLE','RING','LITTLE','THUMB'})
        lengths={}
        for name,d in digits.items():
            self.assertEqual(d['landmark_names'],['CMC','MCP','IP','TIP'] if name=='THUMB' else ['MCP','PIP','DIP','TIP'])
            self.assertEqual(len(d['landmarks_local_m']),4)
            lengths[name]=sum(math.dist(a,b) for a,b in zip(d['landmarks_local_m'],d['landmarks_local_m'][1:]))
            self.assertGreater(len(d['volume_strokes']),2)
        self.assertGreater(lengths['MIDDLE'],lengths['INDEX'])
        self.assertGreater(lengths['INDEX'],lengths['LITTLE'])
        self.assertLess(lengths['THUMB'],lengths['MIDDLE'])
        self.assertNotIn('inherited_cage',result)
    def test_palm_has_separate_thenar_hypothenar_and_central_hollow(self):
        a=anatomy_strokes();names={s['region'] for s in a['palm_strokes']}
        self.assertTrue({'THENAR','HYPOTHENAR','PALM_BACK','WRIST'}<=names)
        self.assertTrue(a['central_hollow']['subtract'])
        self.assertFalse(a['individual_finger_bones_required'])
    def test_nonuniform_real_slice_spacing_uses_angle_not_index_fraction(self):
        inside=[(.8*math.cos(i*2*math.pi/16),.8*math.sin(i*2*math.pi/16),1) for i in range(16)]
        angles=[.01,.03,.08,.12,.15,.20,.25,.30,.90,1.5,2,2.5,3,3.7,4.2,5,5.8]
        outside=[(math.cos(a),math.sin(a),0) for a in angles]
        r=angular_collar_zipper(inside,outside,(0,0,1),(0,0,0),(0,0,1))
        self.assertEqual(sorted(r['outer_order']),list(range(len(outside))))
        v=inside+[outside[i] for i in r['outer_order']]
        t=topology(v,r['faces'])
        for key in ('degenerate_triangles','nonmanifold_edges','winding_edges'):self.assertEqual(t[key],0)
        self.assertEqual(t['boundary_edges'],len(inside)+len(outside))
        self.assertLess(max(r['paired_phase_gap_radians']),.85)

if __name__=='__main__':unittest.main()
