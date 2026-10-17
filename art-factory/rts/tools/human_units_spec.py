"""Unit-specific proportions, neutral rest bones and exact RTS clip names."""

from math import tanh


UNITS = {
    'worker': {'height_m': 1.75, 'gear': 'work_axe', 'teamcloth': True},
    'crossbow': {'height_m': 1.80, 'gear': 'crossbow', 'teamcloth': True},
    'priest': {'height_m': 1.83, 'gear': 'staff', 'teamcloth': True},
    'commander': {'height_m': 1.94, 'gear': 'sword_shield', 'teamcloth': True},
    'neutral-raider': {'height_m': 1.79, 'gear': 'raider_axe', 'teamcloth': False},
}


BONE_NAMES = (
    'Root', 'Pelvis', 'SpineLower', 'SpineUpper', 'Neck', 'Head',
    'Shoulder_L', 'UpperArm_L', 'Forearm_L', 'Hand_L',
    'Shoulder_R', 'UpperArm_R', 'Forearm_R', 'Hand_R',
    'Thigh_L', 'Shin_L', 'Foot_L', 'Thigh_R', 'Shin_R', 'Foot_R',
)


def derive_landmarks(config, arm_half_span_m, foot_half_spacing_m):
    """Give every generated body its own fitted shoulder/hand/foot span."""
    height = config['height_m']
    arms = arm_half_span_m
    feet = foot_half_spacing_m
    bones = {
        'Root': ((0, 0, 0), (0, 0, .12 * height), None),
        'Pelvis': ((0, 0, .12 * height), (0, 0, .45 * height), 'Root'),
        'SpineLower': ((0, 0, .45 * height), (0, 0, .62 * height), 'Pelvis'),
        'SpineUpper': ((0, 0, .62 * height), (0, 0, .77 * height), 'SpineLower'),
        'Neck': ((0, 0, .77 * height), (0, 0, .87 * height), 'SpineUpper'),
        'Head': ((0, 0, .87 * height), (0, 0, .99 * height), 'Neck'),
    }
    for side, sign in (('L', -1), ('R', 1)):
        shoulder = (sign * arms * .36, 0, height * .765)
        upper = (sign * arms * .60, 0, height * .71)
        elbow = (sign * arms * .75, 0, height * .625)
        wrist = (sign * arms * .90, 0, height * .53)
        fingertip = (sign * arms, 0, height * .465)
        bones[f'Shoulder_{side}'] = (shoulder, upper, 'SpineUpper')
        bones[f'UpperArm_{side}'] = (upper, elbow, f'Shoulder_{side}')
        bones[f'Forearm_{side}'] = (elbow, wrist, f'UpperArm_{side}')
        bones[f'Hand_{side}'] = (wrist, fingertip, f'Forearm_{side}')
        hip = (sign * feet * .8, 0, height * .445)
        knee = (sign * feet, 0, height * .255)
        ankle = (sign * feet * 1.03, 0, height * .062)
        toe = (sign * feet * 1.03, height * .10, height * .032)
        bones[f'Thigh_{side}'] = (hip, knee, 'Pelvis')
        bones[f'Shin_{side}'] = (knee, ankle, f'Thigh_{side}')
        bones[f'Foot_{side}'] = (ankle, toe, f'Shin_{side}')
    return {'height_m': height, 'arm_half_span_m': arms, 'foot_half_spacing_m': feet, 'bones': bones}


def skirt_weights(x, z, height):
    """Continuous robe weights prevent a center seam tearing into two leg flaps."""
    leg_share = min(.42, max(.20, .46 - .38 * z / height))
    bias = .5 + .5 * tanh(x / (.14 * height))
    return {'Pelvis': 1 - leg_share, 'Thigh_L': leg_share * (1 - bias), 'Thigh_R': leg_share * bias}


def clip_frames(unit):
    if unit not in UNITS:
        raise ValueError(f'Unknown unit: {unit}')
    idle = [(0, {'SpineUpper': ('Y', -1.0)}), (20, {'$root_z': .010, 'SpineUpper': ('Y', 1.0)}), (40, {'SpineUpper': ('Y', -1.0)})]
    walk = [
        (0, {'Thigh_L': ('X', 24), 'Thigh_R': ('X', -24), 'Shin_R': ('X', 16), 'UpperArm_L': ('X', -15), 'UpperArm_R': ('X', 15)}),
        (10, {'$root_z': .025, 'Thigh_L': ('X', 3), 'Thigh_R': ('X', -3), 'Shin_L': ('X', 12), 'Shin_R': ('X', 8)}),
        (20, {'Thigh_L': ('X', -24), 'Thigh_R': ('X', 24), 'Shin_L': ('X', 16), 'UpperArm_L': ('X', 15), 'UpperArm_R': ('X', -15)}),
        (30, {'$root_z': .025, 'Thigh_L': ('X', -3), 'Thigh_R': ('X', 3), 'Shin_L': ('X', 8), 'Shin_R': ('X', 12)}),
        (40, {'Thigh_L': ('X', 24), 'Thigh_R': ('X', -24), 'Shin_R': ('X', 16), 'UpperArm_L': ('X', -15), 'UpperArm_R': ('X', 15)}),
    ]
    attacks = {
        'worker': [(0, {}), (6, {'UpperArm_R': ('Y', -88), 'Forearm_R': ('Y', -16), 'SpineUpper': ('X', 8)}), (13, {'UpperArm_R': ('Y', -18), 'Forearm_R': ('Y', 18), 'SpineUpper': ('X', -15)}), (25, {}), (40, {})],
        'crossbow': [(0, {}), (8, {'Shoulder_R': ('Z', 55), 'Shoulder_L': ('Z', -55), 'UpperArm_R': ('Y', -80), 'UpperArm_L': ('Y', 50), 'Forearm_R': ('X', 12), 'Forearm_L': ('X', 20)}), (16, {'Shoulder_R': ('Z', 65), 'Shoulder_L': ('Z', -65), 'UpperArm_R': ('Y', -87), 'UpperArm_L': ('Y', 55), 'Forearm_R': ('X', 8), 'Forearm_L': ('X', 16), 'SpineUpper': ('X', -4)}), (28, {}), (40, {})],
        'priest': [(0, {}), (8, {'UpperArm_R': ('Y', -50), 'Forearm_R': ('Y', -15), 'UpperArm_L': ('Y', 24)}), (18, {'UpperArm_R': ('Y', -75), 'Forearm_R': ('Y', -22), 'UpperArm_L': ('Y', 48), 'SpineUpper': ('X', -8)}), (32, {}), (40, {})],
        'commander': [(0, {}), (7, {'UpperArm_R': ('Y', -95), 'Forearm_R': ('Y', -20), 'SpineUpper': ('Z', -18)}), (16, {'UpperArm_R': ('Y', -10), 'Forearm_R': ('Y', 20), 'SpineUpper': ('Z', 22)}), (30, {}), (40, {})],
        'neutral-raider': [(0, {}), (6, {'UpperArm_R': ('Y', -85), 'Forearm_R': ('Y', -18)}), (13, {'UpperArm_R': ('Y', -12), 'Forearm_R': ('Y', 20), 'SpineUpper': ('X', -16)}), (27, {}), (40, {})],
    }
    hurt = [(0, {}), (6, {'SpineLower': ('X', 16), 'SpineUpper': ('X', 24), 'Head': ('X', -10), 'UpperArm_L': ('X', -18)}), (15, {'SpineUpper': ('X', 8)}), (28, {})]
    death = [(0, {}), (10, {'Root': ('X', -18), 'UpperArm_L': ('X', 10)}), (20, {'Root': ('X', -53), 'UpperArm_L': ('X', 18)}), (36, {'Root': ('X', -86), 'UpperArm_L': ('X', 20), 'UpperArm_R': ('X', 16)}), (50, {'Root': ('X', -86), 'UpperArm_L': ('X', 20), 'UpperArm_R': ('X', 16)})]
    death_hand = {'crossbow':('Hand_R',115), 'priest':('Hand_R',-22), 'commander':('Hand_L',80)}.get(unit)
    if death_hand:
        for _, state in death[-2:]:
            state[death_hand[0]] = ('X', death_hand[1])
    return {'Idle': idle, 'Walk': walk, 'Attack': attacks[unit], 'Hurt': hurt, 'Death': death}
