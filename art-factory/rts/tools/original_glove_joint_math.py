"""Surface-loop stitching for original source-derived finger joint topology."""
import math


def blend_half_width(radius,angle_degrees):
    """Sufficient width for an ideal two-bone planar smoothstep LBS band.

    At the inner surface, the local Jacobian is bounded below by its center
    value: (1+cos(theta))/2 - 3*r*sin(theta)/(4*h). Thus h must exceed
    1.5*r*tan(theta/2). This is not a whole-hand collision guarantee.
    """
    if not math.isfinite(radius) or radius<=0 or not math.isfinite(angle_degrees) or not 0<=angle_degrees<150:
        raise ValueError('Requires positive finite radius and a rotation in [0,150) degrees')
    return radius*max(.30,1.5*math.tan(math.radians(angle_degrees)/2))*1.15


def bridge_loops(a,b,ta,tb):
    for loop,values in [(a,ta),(b,tb)]:
        if len(loop)<3 or len(loop)!=len(values) or abs(values[0])>1e-9:
            raise ValueError('A closed loop requires at least three ordered samples starting at zero')
        if values[-1]>=1 or any(y<=x for x,y in zip(values,values[1:])):
            raise ValueError('Loop parameters must increase strictly within [0,1)')
    faces=[];i=j=0
    while i<len(a) or j<len(b):
        na=ta[i+1] if i+1<len(a) else 1 if i<len(a) else float('inf')
        nb=tb[j+1] if j+1<len(b) else 1 if j<len(b) else float('inf')
        if abs(na-nb)<1e-9:
            faces.append([a[i%len(a)],a[(i+1)%len(a)],b[(j+1)%len(b)],b[j%len(b)]]);i+=1;j+=1
        elif na<nb:
            faces.append([a[i%len(a)],a[(i+1)%len(a)],b[j%len(b)]]);i+=1
        else:
            faces.append([a[i%len(a)],b[(j+1)%len(b)],b[j%len(b)]]);j+=1
    return faces
