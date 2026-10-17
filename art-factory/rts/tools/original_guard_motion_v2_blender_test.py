"""Visual-mechanics regression tests for the rejected v1 motion candidate.

These checks deliberately evaluate geometry and contacts rather than accepting
bone-angle labels as evidence of a hit, weapon clearance, or landing.
"""

import math
import sys
import unittest
from pathlib import Path

import bpy
from mathutils import Vector

sys.path.insert(0, str(Path(__file__).resolve().parent))
from original_guard_motion_build import ARMATURE_NAME, FPS, create_actions
from original_guard_motion_spec import ATTACK_CONTACT_S, JOG_CYCLE_S


TARGET_PLANE_Y_M = 0.62
TARGET_MIN_Z_M = 0.62
TARGET_MAX_Z_M = 1.32
WALK_SWORD_CLEARANCE_M = 0.035


def material_vertex_indices(obj, material_name):
    material_index = next(index for index, material in enumerate(obj.data.materials) if material.name == material_name)
    return sorted({vertex for polygon in obj.data.polygons if polygon.material_index == material_index for vertex in polygon.vertices})


def evaluated_vertices(obj, indices=None):
    evaluated = obj.evaluated_get(bpy.context.evaluated_depsgraph_get())
    mesh = evaluated.to_mesh()
    vertices = mesh.vertices if indices is None else (mesh.vertices[index] for index in indices)
    points = [evaluated.matrix_world @ vertex.co for vertex in vertices]
    evaluated.to_mesh_clear()
    return points


def material_plane_intersections(obj, material_name, plane_y):
    material_index = next(index for index, material in enumerate(obj.data.materials) if material.name == material_name)
    evaluated = obj.evaluated_get(bpy.context.evaluated_depsgraph_get())
    mesh = evaluated.to_mesh()
    points = []
    for polygon in mesh.polygons:
        if polygon.material_index != material_index:
            continue
        vertices = [evaluated.matrix_world @ mesh.vertices[index].co for index in polygon.vertices]
        for start, end in zip(vertices, vertices[1:] + vertices[:1]):
            start_distance = start.y - plane_y
            end_distance = end.y - plane_y
            if start_distance == 0.0:
                points.append(start)
            elif start_distance * end_distance < 0.0:
                amount = -start_distance / (end_distance - start_distance)
                points.append(start.lerp(end, amount))
    evaluated.to_mesh_clear()
    return points


def quaternion_distance_degrees(first, second):
    return math.degrees(first.rotation_difference(second).angle)


class OriginalGuardMotionV2Test(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        source = Path(sys.argv[sys.argv.index("--") + 1]).resolve()
        bpy.ops.wm.open_mainfile(filepath=str(source))
        cls.armature = bpy.data.objects[ARMATURE_NAME]
        cls.actions = create_actions(cls.armature)
        cls.sword = bpy.data.objects["KingdomSteelSword_LOD0"]
        cls.shield = bpy.data.objects["KingdomSunShield_LOD0"]
        cls.body = bpy.data.objects["GuardBody_LOD0"]

    def use_action(self, name, frame):
        self.armature.animation_data.action = self.actions[name]
        bpy.context.scene.frame_set(frame)

    def test_attack_marker_is_first_fast_directional_target_plane_entry(self):
        """Marker must be the first forward blade entry, not a stalled pose."""

        contact_frame = round(ATTACK_CONTACT_S * FPS)
        blade_indices = material_vertex_indices(self.sword, "ForgedSteel")
        blade_centers = []
        valid_contact = []
        contact_heights = []
        for frame in range(37):
            self.use_action("Attack", frame)
            blade_points = evaluated_vertices(self.sword, blade_indices)
            blade_centers.append(sum(blade_points, Vector()) / len(blade_points))
            intersections = material_plane_intersections(self.sword, "ForgedSteel", TARGET_PLANE_Y_M)
            heights = [point.z for point in intersections if TARGET_MIN_Z_M <= point.z <= TARGET_MAX_Z_M]
            valid_contact.append(bool(heights))
            contact_heights.append(heights)
        speeds = [0.0] * len(blade_centers)
        forward_velocities = [0.0] * len(blade_centers)
        for frame in range(1, len(blade_centers) - 1):
            delta = blade_centers[frame + 1] - blade_centers[frame - 1]
            speeds[frame] = delta.length / (2.0 / FPS)
            forward_velocities[frame] = delta.y / (2.0 / FPS)
        entries = [
            frame for frame in range(1, len(valid_contact) - 1)
            if valid_contact[frame] and not valid_contact[frame - 1] and forward_velocities[frame] >= 1.0
        ]
        exits = [
            frame for frame in range(1, len(valid_contact) - 1)
            if not valid_contact[frame] and valid_contact[frame - 1] and forward_velocities[frame] <= -0.5
        ]
        self.assertEqual(entries, [contact_frame], f"marker={contact_frame}, forward entries={entries}")
        self.assertEqual(len(exits), 1, f"directional exits={exits}")
        self.assertGreater(exits[0], contact_frame)
        self.assertGreaterEqual(speeds[contact_frame], 3.0, f"blade marker speed={speeds[contact_frame]}")
        self.assertTrue(contact_heights[contact_frame])

    def test_walk_has_guarded_upper_body_and_sword_ground_clearance(self):
        """A 3 m/s guard run must not drag the sword or lock the torso."""

        minimum_sword_z = float("inf")
        spine_rotations = []
        shield_centers = []
        for frame in range(round(JOG_CYCLE_S * FPS) + 1):
            self.use_action("Walk", frame)
            minimum_sword_z = min(minimum_sword_z, *(point.z for point in evaluated_vertices(self.sword)))
            spine_rotations.append(self.armature.pose.bones["SpineUpper"].rotation_quaternion.copy())
            shield_points = evaluated_vertices(self.shield)
            shield_centers.append(sum(shield_points, Vector()) / len(shield_points))
        torso_arc = max(
            quaternion_distance_degrees(first, second)
            for first in spine_rotations
            for second in spine_rotations
        )
        shield_travel = max((first - second).length for first in shield_centers for second in shield_centers)
        self.assertGreater(minimum_sword_z, WALK_SWORD_CLEARANCE_M, f"sword min z={minimum_sword_z}")
        self.assertGreaterEqual(torso_arc, 8.0, f"torso arc={torso_arc}")
        self.assertGreaterEqual(shield_travel, 0.045, f"shield travel={shield_travel}")

    def test_idle_has_weight_shift_breathing_shield_adjustment_and_gaze_pause(self):
        """Idle changes must remain readable without claiming facial animation."""

        root_x = []
        chest_rotations = []
        shield_centers = []
        head_rotations = []
        for frame in range(73):
            self.use_action("Idle", frame)
            root_x.append((self.armature.matrix_world @ self.armature.pose.bones["Root"].head).x)
            chest_rotations.append(self.armature.pose.bones["SpineUpper"].rotation_quaternion.copy())
            head_rotations.append(self.armature.pose.bones["Head"].rotation_quaternion.copy())
            points = evaluated_vertices(self.shield)
            shield_centers.append(sum(points, Vector()) / len(points))
        chest_arc = max(quaternion_distance_degrees(a, b) for a in chest_rotations for b in chest_rotations)
        shield_travel = max((a - b).length for a in shield_centers for b in shield_centers)
        gaze_pause = max(
            quaternion_distance_degrees(head_rotations[frame], head_rotations[frame + 1])
            for frame in range(16, 22)
        )
        self.assertGreaterEqual(max(root_x) - min(root_x), 0.025)
        self.assertGreaterEqual(chest_arc, 4.0)
        self.assertGreaterEqual(shield_travel, 0.025)
        self.assertLessEqual(gaze_pause, 0.12, f"gaze does not pause: {gaze_pause} deg/frame")

    def test_death_finishes_with_body_and_equipment_ground_contact(self):
        """Landing requires surface contact and head/neck weapon clearance."""

        spine_angles = []
        foot_points = {"L": [], "R": []}
        for frame in range(49):
            self.use_action("Death", frame)
            spine_angles.append(math.degrees(self.armature.pose.bones["SpineLower"].rotation_quaternion.angle))
            for side in ("L", "R"):
                foot_points[side].append(self.armature.matrix_world @ self.armature.pose.bones[f"Foot_{side}"].head)
        self.use_action("Death", 48)
        body_points = evaluated_vertices(self.body)
        sword_points = evaluated_vertices(self.sword)
        shield_points = evaluated_vertices(self.shield)
        head = self.armature.matrix_world @ self.armature.pose.bones["Head"].head
        neck = self.armature.matrix_world @ self.armature.pose.bones["Neck"].head
        head_neck_clearance = min(min((point - head).length, (point - neck).length) for point in sword_points)
        metrics = {
            "body_min_z": min(point.z for point in body_points),
            "shield_min_z": min(point.z for point in shield_points),
            "sword_min_z": min(point.z for point in sword_points),
            "head_z": head.z,
            "sword_head_neck_clearance": head_neck_clearance,
            "max_spine_lower_rotation_deg": max(spine_angles),
            "max_foot_reposition_m": max(
                (point - points[0]).length
                for points in foot_points.values()
                for point in points
            ),
        }
        checks = {
            "body_above_ground": metrics["body_min_z"] >= -0.035,
            "shield_ground_contact": -0.05 <= metrics["shield_min_z"] <= 0.10,
            "sword_ground_contact": -0.05 <= metrics["sword_min_z"] <= 0.10,
            "head_landed": metrics["head_z"] <= 0.42,
            "sword_clear_of_head_neck": metrics["sword_head_neck_clearance"] >= 0.13,
            "torso_not_single_hinge": metrics["max_spine_lower_rotation_deg"] <= 70.0,
            "feet_reposition_during_collapse": metrics["max_foot_reposition_m"] >= 0.12,
        }
        for name, passed in checks.items():
            with self.subTest(name=name):
                self.assertTrue(passed, metrics)


if __name__ == "__main__":
    unittest.main(argv=[sys.argv[0]], verbosity=2)
