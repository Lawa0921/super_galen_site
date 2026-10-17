"""Rig-space control math for the original game animation, not physics simulation."""
import math

def joint_position(start,end,a,b,pole):
    delta=tuple(y-x for x,y in zip(start,end));d=math.sqrt(sum(v*v for v in delta))
    if min(a,b)<=0 or d>=a+b-1e-7 or d<=abs(a-b)+1e-7:raise ValueError('Target outside unstretched two-segment reach')
    axis=tuple(v/d for v in delta);p=tuple(x-y for x,y in zip(pole,start));dot=sum(x*y for x,y in zip(p,axis))
    plane=tuple(x-y*dot for x,y in zip(p,axis));length=math.sqrt(sum(v*v for v in plane))
    if length<1e-8:raise ValueError('Pole is collinear with target')
    along=(d*d+a*a-b*b)/(2*d);height=math.sqrt(max(0.,a*a-along*along))
    return tuple(s+u*along+v/length*height for s,u,v in zip(start,axis,plane))

def smooth(value):
    t=max(0.,min(1.,value));return t*t*(3-2*t)

def stages(frame):
    f=max(0.,min(72.,float(frame)))
    draw=1-smooth((f-12)/.5) if f<32 else smooth((f-32)/8)
    deploy=smooth((f-26)/6)*(1-smooth((f-42)/4))
    bolt='rail' if f<=12 or f>=62 else 'hidden' if f<26 else 'quiver' if f<=50 else 'hand'
    return {'draw':draw,'deploy':deploy,'bolt':bolt}

def constrained_joint(start,end,a,b,heading,preferred,bend_limit=75):
    """Closest continuous elbow on the two-bone circle with a wrist cone."""
    def dot(x,y):return sum(i*j for i,j in zip(x,y))
    def sub(x,y):return tuple(i-j for i,j in zip(x,y))
    def mul(x,t):return tuple(i*t for i in x)
    def unit(x):
        n=math.sqrt(dot(x,x))
        if n<1e-12:raise ValueError('Direction has zero length')
        return mul(x,1/n)
    def cross(x,y):return (x[1]*y[2]-x[2]*y[1],x[2]*y[0]-x[0]*y[2],x[0]*y[1]-x[1]*y[0])
    delta=sub(end,start);d=math.sqrt(dot(delta,delta))
    if min(a,b)<=0 or d>=a+b-1e-7 or d<=abs(a-b)+1e-7:raise ValueError('Target outside unstretched two-segment reach')
    axis=unit(delta);direction=unit(heading);along=(d*d+a*a-b*b)/(2*d)
    height=math.sqrt(max(0,a*a-along*along));c=d-along
    p=sub(preferred,start);preferred_plane=sub(p,mul(axis,dot(p,axis)))
    if dot(preferred_plane,preferred_plane)<1e-12:
        basis=tuple(1. if i==min(range(3),key=lambda j:abs(axis[j])) else 0. for i in range(3))
        preferred_plane=sub(basis,mul(axis,dot(basis,axis)))
    projected=sub(direction,mul(axis,dot(direction,axis)));h=math.sqrt(dot(projected,projected))
    if h<1e-10:
        if c*dot(axis,direction)/b<math.cos(math.radians(bend_limit))-1e-9:
            raise ValueError('No solution inside wrist cone')
        radial=unit(preferred_plane)
    else:
        optimal=mul(projected,-1/h)
        radial=unit(preferred_plane) if dot(preferred_plane,preferred_plane)>1e-12 else optimal
        bound=(b*math.cos(math.radians(bend_limit))-c*dot(axis,direction))/(height*h)
        if bound>1+1e-9:raise ValueError('No solution inside wrist cone')
        allowed=math.acos(max(-1,min(1,bound)))
        theta=math.atan2(dot(axis,cross(optimal,radial)),dot(optimal,radial))
        theta=max(-allowed,min(allowed,theta));side=cross(axis,optimal)
        radial=tuple(x*math.cos(theta)+y*math.sin(theta) for x,y in zip(optimal,side))
    return tuple(s+x*along+r*height for s,x,r in zip(start,axis,radial))
