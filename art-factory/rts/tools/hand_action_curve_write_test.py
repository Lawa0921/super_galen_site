"""Real Blender regression for keys closer than keyframe_insert's merge distance."""
import bpy, sys, unittest
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent))
from original_guard_walk_refine import action_fcurves

LEGACY = '--legacy-insert' in sys.argv


class ExactCurveWriteTests(unittest.TestCase):
    def curve(self, times, values):
        obj = bpy.data.objects.new('CurveWriteTest', None)
        bpy.context.collection.objects.link(obj)
        obj.keyframe_insert(data_path='location', index=0, frame=0)
        curve = next(action_fcurves(obj.animation_data.action))
        curve.keyframe_points.clear()
        if LEGACY:
            for time, value in zip(times, values):
                obj.location.x = value
                obj.keyframe_insert(data_path='location', index=0, frame=time)
        else:
            from hand_action_curve_write import replace_linear_curve
            replace_linear_curve(curve, times, values)
        return curve

    def test_adjacent_subframe_keys_keep_their_times_and_values(self):
        times, values = [1.484375, 1.4921875], [1., 2.]
        curve = self.curve(times, values)
        self.assertEqual(len(curve.keyframe_points), 2)
        self.assertEqual([list(k.co) for k in curve.keyframe_points], [[times[0], 1.], [times[1], 2.]])

    def test_dense_samples_interpolate_linearly_without_replacing_neighbors(self):
        curve = self.curve([0., 1/256, 2/256], [0., 1., 0.])
        self.assertEqual(len(curve.keyframe_points), 3)
        self.assertAlmostEqual(curve.evaluate(1/512), .5, places=6)
        self.assertAlmostEqual(curve.evaluate(3/512), .5, places=6)

    @unittest.skipIf(LEGACY, 'Validation belongs to replacement writer')
    def test_duplicate_time_rejected_before_mutating_curve(self):
        from hand_action_curve_write import replace_linear_curve
        curve = self.curve([0., 1.], [0., 1.])
        before = [list(k.co) for k in curve.keyframe_points]
        with self.assertRaises(ValueError):
            replace_linear_curve(curve, [0., 0.], [2., 3.])
        self.assertEqual([list(k.co) for k in curve.keyframe_points], before)


suite = unittest.defaultTestLoader.loadTestsFromTestCase(ExactCurveWriteTests)
result = unittest.TextTestRunner(verbosity=2).run(suite)
if not result.wasSuccessful():
    raise AssertionError('Real Blender curve-write regression failed')
