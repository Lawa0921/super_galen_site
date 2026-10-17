"""Actual runtime mesh roles for the reviewed unit asset families."""
def collision_group(name):
 if any(token in name for token in ('Body','NeuralWarhorse','GuardRigidPlate')):return 'body'
 if any(token in name for token in ('Axe','Sword','Shield','Staff','ProceduralCrossbow','KnightLance','RosterPike','RangerLongbow','RangerBowString','RangerArrow','RangerQuiver','MageSunStaff')):return 'weapon'
 return None
