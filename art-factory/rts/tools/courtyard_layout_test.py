import unittest
from courtyard_layout import layout


class CourtyardTests(unittest.TestCase):
    def test_functional_yards_have_earth_infill_and_shared_edge_modules(self):
        for asset in ('barracks','stable','workshop'):
            data=layout(asset)
            self.assertGreater(data['earth']['width']*data['earth']['depth'],16)
            self.assertLessEqual(data['earth']['z_top'],.51)
            self.assertTrue(any(p['part']=='dressed-edge-1m' for p in data['pieces']))
            self.assertTrue(any(p['part']=='entry-step' for p in data['pieces']))
            for p in data['pieces']:
                self.assertLessEqual(abs(p['x'])+p['width']/2,data['footprint'][0]/2)
                self.assertLessEqual(abs(p['y'])+p['depth']/2,data['footprint'][1]/2)
            # The entry remains continuous at the original wall-foot level.
            self.assertEqual(data['earth']['z_top'],.50)

    def test_no_wide_pale_slab_can_be_reintroduced(self):
        for asset in ('barracks','stable','workshop'):
            data=layout(asset)
            for p in data['pieces']:
                if p['part']=='dressed-edge-1m':self.assertLessEqual(min(p['width'],p['depth']),.30)
            self.assertLess(data['stone_surface_area'],data['footprint'][0]*data['footprint'][1]*.25)

    def test_unreviewed_building_has_no_generic_fallback(self):
        with self.assertRaises(ValueError):layout('chapel')


if __name__=='__main__':unittest.main()
