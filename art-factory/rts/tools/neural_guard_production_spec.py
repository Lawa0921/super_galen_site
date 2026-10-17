"""Fixed guard rest skeleton and five small pose timelines; Blender-free contract."""

from math import isfinite


BONE_SPECS = [
    ("Root", None, (0, 0, -0.459102), (0, 0, -0.34)),
    ("Pelvis", "Root", (0, 0, -0.34), (0, 0, -0.06)),
    ("SpineLower", "Pelvis", (0, 0, -0.06), (0, 0, 0.13)),
    ("SpineUpper", "SpineLower", (0, 0, 0.13), (0, 0, 0.28)),
    ("Neck", "SpineUpper", (0, 0, 0.28), (0, 0, 0.37)),
    ("Head", "Neck", (0, 0, 0.37), (0, 0, 0.49)),
    ("Shoulder_L", "SpineUpper", (0, 0.075, 0.275), (0, 0.13, 0.245)),
    ("UpperArm_L", "Shoulder_L", (0, 0.13, 0.245), (0, 0.18, 0.105)),
    ("Forearm_L", "UpperArm_L", (0, 0.18, 0.105), (0, 0.22, -0.025)),
    ("Hand_L", "Forearm_L", (0, 0.22, -0.025), (0, 0.23, -0.11)),
    ("Shoulder_R", "SpineUpper", (0, -0.075, 0.275), (0, -0.13, 0.245)),
    ("UpperArm_R", "Shoulder_R", (0, -0.13, 0.245), (0, -0.18, 0.105)),
    ("Forearm_R", "UpperArm_R", (0, -0.18, 0.105), (0, -0.22, -0.025)),
    ("Hand_R", "Forearm_R", (0, -0.22, -0.025), (0, -0.23, -0.11)),
    ("Thigh_L", "Pelvis", (0, 0.075, -0.08), (0, 0.09, -0.25)),
    ("Shin_L", "Thigh_L", (0, 0.09, -0.25), (0, 0.10, -0.39)),
    ("Foot_L", "Shin_L", (0, 0.10, -0.39), (0.08, 0.10, -0.45)),
    ("Thigh_R", "Pelvis", (0, -0.075, -0.08), (0, -0.09, -0.25)),
    ("Shin_R", "Thigh_R", (0, -0.09, -0.25), (0, -0.10, -0.39)),
    ("Foot_R", "Shin_R", (0, -0.10, -0.39), (0.08, -0.10, -0.45)),
]


def transformed_point(source, source_ground, scale):
    """Tripo +X front/Z up -> Blender +Y front/Z up, ground -> 0."""
    x, y, z = source
    return (-scale * y, scale * x, scale * (z - source_ground))


def validate_bones(specs):
    names = [name for name, _, _, _ in specs]
    if len(names) != len(set(names)) or len(names) != 20:
        raise ValueError("Guard rig requires exactly 20 unique bones")
    parents = {name: parent for name, parent, _, _ in specs}
    if sum(parent is None for parent in parents.values()) != 1:
        raise ValueError("Guard rig requires one root")
    for name, parent, head, tail in specs:
        if parent is not None and parent not in parents:
            raise ValueError(f"Missing parent for {name}")
        if any(not isfinite(value) for value in (*head, *tail)) or head == tail:
            raise ValueError(f"Invalid segment for {name}")
        seen = {name}
        while parent is not None:
            if parent in seen:
                raise ValueError(f"Bone cycle at {name}")
            seen.add(parent)
            parent = parents[parent]


# Each pose maps bone name to (world-space rotation axis, degrees). The special
# $root_z key is a ground-relative vertical offset in normalized meters.
CLIP_FRAMES = {
    "Idle": [
        (0, {"SpineUpper": ("Y", -1.2), "UpperArm_L": ("Y", -1), "UpperArm_R": ("Y", 1)}),
        (20, {"$root_z": 0.013, "SpineUpper": ("Y", 1.2), "UpperArm_L": ("Y", 1), "UpperArm_R": ("Y", -1)}),
        (40, {"SpineUpper": ("Y", -1.2), "UpperArm_L": ("Y", -1), "UpperArm_R": ("Y", 1)}),
    ],
    "Walk": [
        (0, {"Thigh_L": ("X", 25), "Thigh_R": ("X", -25), "Shin_R": ("X", 18), "UpperArm_L": ("X", -17), "UpperArm_R": ("X", 17)}),
        (10, {"$root_z": 0.038, "Thigh_L": ("X", 5), "Thigh_R": ("X", -5), "Shin_L": ("X", 15), "Shin_R": ("X", 9)}),
        (20, {"Thigh_L": ("X", -25), "Thigh_R": ("X", 25), "Shin_L": ("X", 18), "UpperArm_L": ("X", 17), "UpperArm_R": ("X", -17)}),
        (30, {"$root_z": 0.038, "Thigh_L": ("X", -5), "Thigh_R": ("X", 5), "Shin_L": ("X", 9), "Shin_R": ("X", 15)}),
        (40, {"Thigh_L": ("X", 25), "Thigh_R": ("X", -25), "Shin_R": ("X", 18), "UpperArm_L": ("X", -17), "UpperArm_R": ("X", 17)}),
    ],
    "Attack": [
        (0, {"UpperArm_R": ("X", -10), "Forearm_R": ("X", 10)}),
        (6, {"SpineUpper": ("X", 10), "UpperArm_R": ("X", -45), "Forearm_R": ("X", 45), "Hand_R": ("X", -60), "Shoulder_R": ("X", -15)}),
        (13, {"SpineUpper": ("X", -18), "UpperArm_R": ("X", 65), "Forearm_R": ("X", -40), "Hand_R": ("X", 60), "Shoulder_R": ("X", 15), "UpperArm_L": ("X", 18)}),
        (22, {"SpineUpper": ("X", -8), "UpperArm_R": ("X", -30), "Forearm_R": ("X", 15), "Hand_R": ("X", 15)}),
        (40, {"UpperArm_R": ("X", -10), "Forearm_R": ("X", 10)}),
    ],
    "Hurt": [
        (0, {}),
        (6, {"SpineLower": ("X", 18), "SpineUpper": ("X", 25), "Head": ("X", -12), "UpperArm_L": ("X", -24), "UpperArm_R": ("X", -16)}),
        (14, {"SpineLower": ("X", 8), "SpineUpper": ("X", 11)}),
        (28, {}),
    ],
    "Death": [
        (0, {}),
        (10, {"$root_z": 0.05, "Root": ("X", -20), "UpperArm_L": ("X", 12), "UpperArm_R": ("X", -8)}),
        (20, {"$root_z": 0.20, "Root": ("X", -55), "UpperArm_L": ("X", 15), "UpperArm_R": ("X", 10)}),
        (36, {"$root_z": 0.21, "Root": ("X", -86), "UpperArm_L": ("X", 22), "UpperArm_R": ("X", 18), "Forearm_R": ("X", -15)}),
        (50, {"$root_z": 0.21, "Root": ("X", -86), "UpperArm_L": ("X", 22), "UpperArm_R": ("X", 18), "Forearm_R": ("X", -15)}),
    ],
}


validate_bones(BONE_SPECS)
