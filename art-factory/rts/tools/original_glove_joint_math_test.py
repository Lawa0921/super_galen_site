import math,unittest
from collections import Counter
from original_glove_joint_math import bridge_loops,blend_half_width


class JointLoopTests(unittest.TestCase):
    def test_unequal_loops_form_an_outward_annulus_without_missing_seam(self):
        na,nb=9,12
        ta=[i/na for i in range(na)];tb=[i/nb for i in range(nb)]
        points=[(math.cos(t*2*math.pi),math.sin(t*2*math.pi),z) for z,ts in [(0,ta),(1,tb)] for t in ts]
        faces=bridge_loops(list(range(na)),list(range(na,na+nb)),ta,tb)
        edges=Counter(tuple(sorted((a,b))) for face in faces for a,b in zip(face,face[1:]+face[:1]))
        self.assertEqual(sum(n==1 for n in edges.values()),na+nb)
        self.assertTrue(all(n in [1,2] for n in edges.values()))
        self.assertEqual(len(points)-len(edges)+len(faces),0)
        for face in faces:
            p,q,r=[points[i] for i in face[:3]]
            u=[q[i]-p[i] for i in range(3)];v=[r[i]-p[i] for i in range(3)]
            normal=[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]]
            center=[sum(points[j][i] for j in face)/len(face) for i in range(3)]
            self.assertGreater(normal[0]*center[0]+normal[1]*center[1],0)

    def test_matched_joint_rings_keep_all_quads(self):
        ts=[i/12 for i in range(12)]
        faces=bridge_loops(list(range(12)),list(range(12,24)),ts,ts)
        self.assertEqual(len(faces),12)
        self.assertTrue(all(len(face)==4 for face in faces))

    def test_nonmonotone_boundary_is_rejected_before_building_faces(self):
        with self.assertRaises(ValueError):bridge_loops([0,1,2],[3,4,5],[0,.7,.4],[0,.3,.6])

    def test_blend_band_preserves_local_orientation_on_inner_joint_surface(self):
        radius=.14;angle=math.radians(86);width=blend_half_width(radius,86)
        def skin(y,z):
            t=max(0,min(1,(z+width)/(2*width)));w=t*t*(3-2*t)
            return ((1-w)*y+w*(math.cos(angle)*y-math.sin(angle)*z),(1-w)*z+w*(math.sin(angle)*y+math.cos(angle)*z))
        epsilon=1e-7
        for fraction in [-.8,-.4,0,.4,.8]:
            y,z=-radius,width*fraction
            yp,ym=skin(y+epsilon,z),skin(y-epsilon,z);zp,zm=skin(y,z+epsilon),skin(y,z-epsilon)
            dy=[(a-b)/(2*epsilon) for a,b in zip(yp,ym)];dz=[(a-b)/(2*epsilon) for a,b in zip(zp,zm)]
            self.assertGreater(dy[0]*dz[1]-dy[1]*dz[0],0)

    def test_blend_band_rejects_invalid_geometry_or_unbounded_rotation(self):
        for radius,angle in [(0,86),(-.1,86),(.1,180),(.1,float('nan'))]:
            with self.assertRaises(ValueError):blend_half_width(radius,angle)


if __name__=='__main__':unittest.main()
