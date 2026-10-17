"""Monotone C1 retime of the authored swing, not a changed damage timer."""
import math

def source_frame(frame:float, advance_frames:float=2.0)->float:
    if not math.isfinite(frame) or not 0<=advance_frames<=3:
        raise ValueError('Finite time and bounded original-pose advance required')
    if frame<=8 or frame>=24:return frame
    t=(frame-8)/8 if frame<=16 else (24-frame)/8
    smooth=t*t*(3-2*t)
    return frame+advance_frames*smooth

def contact_failures(damage_gaps,authored_gap):
    failures=[]
    if not damage_gaps:failures.append('no_measured_damage_strike')
    if any(not isinstance(v,(float,int)) or not math.isfinite(v) or v>.001 for v in damage_gaps):
        failures.append('damage_before_physical_contact')
    if not isinstance(authored_gap,(float,int)) or not math.isfinite(authored_gap) or authored_gap>.001:
        failures.append('authored_contact_pose_misses')
    return failures
