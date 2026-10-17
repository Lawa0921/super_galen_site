import unittest
from building_stage_classify import classify_stage

class ConstructionClassificationTests(unittest.TestCase):
    def test_foundation_and_courtyard_precede_structure(self):
        self.assertEqual(classify_stage('Courtyard entry step', 'foundation', 'courtyard-23'), 0)
        self.assertEqual(classify_stage('Foundation plinth', 'structure'), 0)
    def test_bearing_structure_precedes_roof(self):
        self.assertEqual(classify_stage('Ashlar load-bearing mass', 'structure'), 1)
        self.assertEqual(classify_stage('Timber mortise iron plate', 'structure'), 1)
        self.assertEqual(classify_stage('Structural pitched roof plane', 'roof'), 2)
    def test_roof_word_boundary_does_not_treat_bridge_as_ridge(self):
        self.assertEqual(classify_stage('Bridge ashlar load-bearing mass', 'structure'), 1)
        self.assertEqual(classify_stage('Brass capped ridge', 'structure'), 2)
        self.assertEqual(classify_stage('Carved front rake board', 'structure'), 2)
    def test_equipment_and_openings_are_last(self):
        for name in ['Polearm rack post', 'Training spear.002', 'Hay bedding stack', 'Horse stall dark bay', 'Stall cross rail', 'U-court central horse trough']:
            self.assertEqual(classify_stage(name, 'structure'), 3, name)
        self.assertEqual(classify_stage('Stone sill', 'window'), 3)
        self.assertEqual(classify_stage('TeamCloth removable hanging banner', 'ornament'), 3)
    def test_unknown_category_fails_closed(self):
        with self.assertRaises(ValueError): classify_stage('untracked detail', 'unregistered')
    def test_workshop_roof_supports_precede_equipment(self):
        self.assertEqual(classify_stage('Open engineering shelter post', 'structure'), 1)
        self.assertEqual(classify_stage('Rear stone tool wall', 'structure'), 1)
        for name in ['Broad engineering workbench', 'Workbench leg', 'Wheel radial timber spoke.049', 'Exposed drive gear tooth', 'Iron wheel hub', 'Cantilever hoist jib', 'Hoist diagonal truss', 'Suspended hook chain', 'Large freestanding crane kingpost']:
            self.assertEqual(classify_stage(name, 'structure'), 3, name)

if __name__ == '__main__': unittest.main()
