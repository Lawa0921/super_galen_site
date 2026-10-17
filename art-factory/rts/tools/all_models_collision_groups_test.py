import unittest
from all_models_collision_groups import collision_group

class ArticulatedArmorTest(unittest.TestCase):
 def test_generated_guard_plates_are_body_collision_surfaces(self):
  self.assertEqual(collision_group('GuardRigidPlate_Forearm_L_LOD1/GuardArmor'),'body')
 def test_guard_plate_does_not_turn_a_glove_into_a_collision_surface(self):
  self.assertIsNone(collision_group('GuardAssemblyHand_R_LOD1/Leather'))

class CollisionGroups(unittest.TestCase):
 def test_rider_and_horse_are_both_protected_bodies(self):
  for name in ['MountedKnightBody_LOD0/guard-neural','NeuralWarhorse_LOD1/guard-neural']:
   self.assertEqual(collision_group(name),'body')
 def test_lance_and_shield_are_tested_equipment(self):
  for name in ['KnightRig/KnightLance_LOD0','KnightSunShield_LOD1/Shell']:
   self.assertEqual(collision_group(name),'weapon')
 def test_hand_contact_is_not_misclassified_as_body_penetration(self):
  self.assertIsNone(collision_group('KnightRig/KnightCommanderHand_R_LOD0'))
 def test_existing_infantry_categories_remain(self):
  self.assertEqual(collision_group('workerOriginalBody_LOD0/guard-neural'),'body')
  self.assertEqual(collision_group('WorkerCraftAxe_LOD0/AshHaft'),'weapon')
class RosterExpansion(unittest.TestCase):
 def test_roster_pike_is_tested_equipment(self):
  for name in ['pikemanRig20/RosterPike_LOD0','RosterPike_LOD1/RosterPike_LOD1_1']:
   self.assertEqual(collision_group(name),'weapon')
 def test_roster_body_and_hands_keep_their_roles(self):
  self.assertEqual(collision_group('pikemanOriginalBody_LOD0/guard-neural-uv'),'body')
  self.assertIsNone(collision_group('AssemblyHand_L_LOD0/AssemblyHand_L_LOD0Mesh'))
class RangerEquipment(unittest.TestCase):
 def test_bow_string_and_arrow_are_tested_equipment(self):
  for name in ['RangerLongbow_LOD0/RangerLongbow_LOD0Mesh','RangerBowString_LOD1/RangerBowString_LOD1Mesh','RangerArrow_LOD0/RangerArrow_LOD0Mesh_2','RangerQuiver_LOD1/RangerQuiver_LOD1Mesh','MageSunStaff_LOD0/MageSunStaff_LOD0Mesh_1']:
   self.assertEqual(collision_group(name),'weapon')
if __name__=='__main__':unittest.main()
