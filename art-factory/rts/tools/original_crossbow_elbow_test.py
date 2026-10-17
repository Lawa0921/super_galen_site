import math,unittest
from original_crossbow_fullbody_math import constrained_joint

def sub(a,b):return tuple(x-y for x,y in zip(a,b))
def length(a):return math.sqrt(sum(x*x for x in a))
def angle(a,b):return math.degrees(math.acos(max(-1,min(1,sum(x*y for x,y in zip(a,b))/length(a)/length(b)))))

class ElbowContinuity(unittest.TestCase):
    def test_exact_lengths_and_feasible_wrist_cone(self):
        p=constrained_joint((0,0,0),(.25,0,0),.1675,.184,(0,0,1),(0,0,-1))
        self.assertAlmostEqual(length(p),.1675,places=7)
        self.assertAlmostEqual(length(sub((.25,0,0),p)),.184,places=7)
        self.assertLessEqual(angle(sub((.25,0,0),p),(0,0,1)),75.00001)

    def test_previous_elbow_does_not_flip_at_opposite_preference(self):
        previous=(0,.1,0);points=[]
        for i in range(201):
            t=(i-100)*.0005
            end=(.24,t,.01);heading=(.4,.01+t,1)
            previous=constrained_joint((0,0,0),end,.1675,.184,heading,previous)
            points.append(previous)
        self.assertAlmostEqual(length(points[0]),.1675,places=7)
        self.assertLess(max(length(sub(a,b)) for a,b in zip(points,points[1:])),.002)

    def test_impossible_target_is_not_stretched(self):
        with self.assertRaises(ValueError):constrained_joint((0,0,0),(1,0,0),.1675,.184,(0,0,1),(0,1,0))

    def test_impossible_wrist_cone_is_explicit(self):
        with self.assertRaisesRegex(ValueError,'wrist cone'):
            constrained_joint((0,0,0),(.25,0,0),.1675,.184,(-1,0,0),(0,1,0))

    def test_collinear_preference_has_a_stable_fallback(self):
        p=constrained_joint((0,0,0),(.25,0,0),.1675,.184,(1,0,0),(.1,0,0))
        self.assertAlmostEqual(length(p),.1675,places=7)
        self.assertAlmostEqual(length(sub((.25,0,0),p)),.184,places=7)
        self.assertEqual(p,constrained_joint((0,0,0),(.25,0,0),.1675,.184,(1,0,0),(.1,0,0)))

if __name__=='__main__':unittest.main()
