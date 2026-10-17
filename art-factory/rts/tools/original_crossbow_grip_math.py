"""Small deterministic vector math for retargeting an original two-bone crossbow support arm."""
from __future__ import annotations
import math

Vec = tuple[float, float, float]

def _add(a: Vec, b: Vec) -> Vec:
    return (a[0]+b[0], a[1]+b[1], a[2]+b[2])

def _sub(a: Vec, b: Vec) -> Vec:
    return (a[0]-b[0], a[1]-b[1], a[2]-b[2])

def _mul(a: Vec, scalar: float) -> Vec:
    return (a[0]*scalar, a[1]*scalar, a[2]*scalar)

def _dot(a: Vec, b: Vec) -> float:
    return a[0]*b[0] + a[1]*b[1] + a[2]*b[2]

def _cross(a: Vec, b: Vec) -> Vec:
    return (a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0])

def _unit(v: Vec, fallback: Vec=(1.0,0.0,0.0)) -> Vec:
    length=math.sqrt(_dot(v,v))
    if length < 1e-10:
        return fallback
    return _mul(v,1.0/length)

def solve_two_bone(start: Vec, target: Vec, pole: Vec, upper_length: float, lower_length: float) -> tuple[Vec,Vec]:
    """Return elbow and reachable end for a fixed-length two-segment chain.

    The pole is a preferred bend direction; it is projected perpendicular to
    the shoulder-to-wrist line. Unreachable requests are clamped at full reach,
    while near-folded requests are clamped to a small stable minimum distance.
    """
    if upper_length <= 0.0 or lower_length <= 0.0:
        raise ValueError("bone lengths must be positive")
    delta=_sub(target,start)
    raw_distance=math.sqrt(_dot(delta,delta))
    direction=_unit(delta,(0.0,1.0,0.0))
    epsilon=min(1e-5, min(upper_length,lower_length)*1e-4)
    min_reach=abs(upper_length-lower_length)+epsilon
    max_reach=upper_length+lower_length-epsilon
    distance=max(min_reach,min(max_reach,raw_distance))
    actual_end=_add(start,_mul(direction,distance))
    projected=_sub(pole,_mul(direction,_dot(pole,direction)))
    if math.sqrt(_dot(projected,projected))<1e-8:
        axis=(0.0,0.0,1.0) if abs(direction[2])<0.9 else (0.0,1.0,0.0)
        projected=_cross(direction,axis)
    bend=_unit(projected,(1.0,0.0,0.0))
    along=(upper_length*upper_length-lower_length*lower_length+distance*distance)/(2.0*distance)
    height=math.sqrt(max(0.0,upper_length*upper_length-along*along))
    elbow=_add(_add(start,_mul(direction,along)),_mul(bend,height))
    return elbow,actual_end

def _norm(v: Vec) -> float:
    return math.sqrt(_dot(v,v))

def _unit_checked(v: Vec) -> Vec:
    length=_norm(v)
    if length < 1e-10:
        raise ValueError("cannot build an arm frame from a zero-length segment")
    return _mul(v,1.0/length)

def arm_section_frame(start: Vec, end: Vec, front: Vec=(0.0,1.0,0.0)) -> tuple[Vec,Vec,Vec]:
    """Return an orthonormal (axis, front-projected u, lateral v) arm frame."""
    axis=_unit_checked(_sub(end,start))
    projected=_sub(front,_mul(axis,_dot(front,axis)))
    if _norm(projected) < 1e-8:
        fallback=(1.0,0.0,0.0) if abs(axis[0])<0.9 else (0.0,0.0,1.0)
        projected=_sub(fallback,_mul(axis,_dot(fallback,axis)))
    u=_unit_checked(projected)
    v=_unit_checked(_cross(axis,u))
    return axis,u,v

def _smooth01(x: float) -> float:
    x=max(0.0,min(1.0,float(x)))
    return x*x*(3.0-2.0*x)

def arm_skin_weights(t: float) -> tuple[float,float,float,float]:
    """Weights for Shoulder, UpperArm, Forearm, Hand along a continuous sleeve."""
    t=max(0.0,min(1.0,float(t)))
    sh=1.0-_smooth01(t/.30)
    upper=(1.0-sh)*(1.0-_smooth01((t-.48)/.23))
    fore=(1.0-sh)-upper
    hand_blend=_smooth01((t-.87)/.13)
    fore*=1.0-hand_blend
    hand=hand_blend
    total=sh+upper+fore+hand
    return (sh/total,upper/total,fore/total,hand/total)
