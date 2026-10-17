"""Run in Blender so the real extraction classifier is exercised without files."""
import sys
import unittest
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parent))
from modular_extract import groups


class SourceObject:
    def __init__(self,name):self.name=name
    def get(self,key,fallback=None):return fallback


class SourceCategoryTests(unittest.TestCase):
    def test_bridge_word_is_not_a_roof_ridge(self):
        deck=SourceObject('Bridge thick stone road deck')
        result=groups([deck],'stone-bridge')
        self.assertEqual(result[0][0],'structure')
        self.assertEqual(result[0][2],[deck])

    def test_authored_roof_ridge_and_rake_board_remain_roof_components(self):
        for name in ('Brass capped ridge','Slate roof covering','Carved front rake board','Timber eaves fascia'):
            with self.subTest(name=name):
                roof=SourceObject(name)
                result=groups([roof],'townhall')
                self.assertEqual(result[0][0],'roof')
                self.assertEqual(result[0][2],[roof])


if __name__=='__main__':
    result=unittest.TextTestRunner(verbosity=2).run(unittest.defaultTestLoader.loadTestsFromTestCase(SourceCategoryTests))
    if not result.wasSuccessful():raise RuntimeError('Modular source classification regression')
