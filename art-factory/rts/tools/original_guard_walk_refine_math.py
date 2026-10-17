"""Pure geometry for original Walk refinement; never changes link lengths."""
import math

def _vec(value):
    out=tuple(float(x) for x in value)
    if len(out)!=3 or not all(math.isfinite(x) for x in out):
        raise ValueError("a finite 3D vector is required")
    return out

def solve_two_link(hip, ankle, original_knee, length1, length2):
    hip,ankle,original_knee=map(_vec,(hip,ankle,original_knee))
    if not all(math.isfinite(x) and x>0 for x in (length1,length2)):
        raise ValueError("positive finite link lengths are required")
    delta=tuple(ankle[i]-hip[i] for i in range(3));distance=math.sqrt(sum(x*x for x in delta))
    if distance>length1+length2+1e-9 or distance<abs(length1-length2)+1e-9:
        raise ValueError(f"unreachable ankle: distance={distance:.9f}, links={length1:.9f}+{length2:.9f}")
    axis=tuple(x/distance for x in delta)
    pole=tuple(original_knee[i]-hip[i] for i in range(3))
    along=sum(pole[i]*axis[i] for i in range(3))
    pole=tuple(pole[i]-along*axis[i] for i in range(3))
    pole_length=math.sqrt(sum(x*x for x in pole))
    if pole_length<1e-8:
        raise ValueError("original knee pole is degenerate; an explicit anatomical pole is required")
    pole=tuple(x/pole_length for x in pole)
    projection=(length1*length1-length2*length2+distance*distance)/(2*distance)
    bend_radius=math.sqrt(max(0.0,length1*length1-projection*projection))
    knee=tuple(hip[i]+projection*axis[i]+bend_radius*pole[i] for i in range(3))
    return {"knee":knee,"distance":distance,"reach_margin":length1+length2-distance,
            "source_pole_offset":pole_length,"bend_radius":bend_radius,
            "length1_error":math.dist(hip,knee)-length1,"length2_error":math.dist(knee,ankle)-length2}

def transition_correction(position_delta, velocity_delta, elapsed, duration):
    """A correction with prescribed position/velocity at zero and zero C2 tail."""
    position_delta,velocity_delta=map(_vec,(position_delta,velocity_delta))
    if not math.isfinite(duration) or duration<=0 or not math.isfinite(elapsed):
        raise ValueError("finite positive transition duration required")
    u=min(1.0,max(0.0,elapsed/duration))
    h00=1-10*u**3+15*u**4-6*u**5
    h10=u-6*u**3+8*u**4-3*u**5
    return tuple(position_delta[i]*h00+velocity_delta[i]*duration*h10 for i in range(3))

def smootherstep(value):
    u=min(1.0,max(0.0,float(value)))
    return u*u*u*(u*(u*6-15)+10)
