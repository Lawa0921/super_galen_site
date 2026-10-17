import sys,unittest
from original_glove_geometry import cage as baseline,topology

def roots(data,name):
    ids=set()
    for face in data['faces']:
        if name in [data['tags'][i] for i in face]:
            ids.update(i for i in face if data['tags'][i]=='palm')
    return ids

def vertex_link_errors(data):
    links=[{} for _ in data['vertices']]
    for face in data['faces']:
        for j,v in enumerate(face):
            a,b=face[j-1],face[(j+1)%len(face)]
            links[v].setdefault(a,[]).append(b);links[v].setdefault(b,[]).append(a)
    bad=[]
    for i,link in enumerate(links):
        if any(len(adj)!=2 for adj in link.values()):bad.append(i);continue
        visited=set();stack=[next(iter(link))]
        while stack:
            item=stack.pop()
            if item in visited:continue
            visited.add(item);stack.extend(link[item])
        if len(visited)!=len(link):bad.append(i)
    return bad

class TailoredGloveTest(unittest.TestCase):
    def setUp(self):
        if '--baseline' in sys.argv:self.data=baseline()
        else:
            from original_glove_tailoring_geometry import cage
            self.data=cage()
    def test_webs_have_two_separate_sides_instead_of_shared_tip(self):
        names=['Index','Middle','Ring','Little']
        for a,b in zip(names,names[1:]):
            left,right=roots(self.data,a),roots(self.data,b)
            self.assertTrue(left and right)
            self.assertFalse(left&right,'A shared radial point creates the sharp V web')
            gap=min(self.data['vertices'][i][0] for i in right)-max(self.data['vertices'][i][0] for i in left)
            self.assertGreaterEqual(gap,.002)
    def test_surface_and_vertex_links_form_one_closed_manifold(self):
        t=topology(self.data);self.assertEqual(t['components'],1);self.assertEqual(t['genus'],0)
        self.assertEqual(t['nonmanifold_edges'],0);self.assertEqual(vertex_link_errors(self.data),[])
    def test_original_bind_and_normalized_weights_are_preserved(self):
        self.assertEqual(self.data['bones'],baseline()['bones'])
        names={b['name'] for b in self.data['bones']}
        for w in self.data['weights']:
            self.assertAlmostEqual(sum(w.values()),1,places=7);self.assertTrue(set(w)<=names)
        for i in self.data['wrist']:self.assertEqual(self.data['weights'][i],{'Hand':1})
    def test_finger_root_has_a_gradual_radial_transition(self):
        # The old first ring lost 2.8-5.4mm of depth in 6mm, making a visible
        # shoulder even when local palm subdivision was completely disabled.
        for name in ['Index','Middle','Ring','Little']:
            root=[self.data['vertices'][i] for i in roots(self.data,name)]
            points=[p for p,tag in zip(self.data['vertices'],self.data['tags']) if tag==name]
            first=min(p[2] for p in points);ring=[p for p in points if abs(p[2]-first)<1e-8]
            root_z=max(p[2] for p in root);distance=first-root_z
            self.assertGreater(distance,0)
            for p in ring:
                radial=min(((p[0]-q[0])**2+(p[1]-q[1])**2)**.5 for q in root)
                self.assertLess(radial/distance,.20,name+' has an abrupt root shoulder')

if __name__=='__main__':unittest.main(argv=[sys.argv[0]])
