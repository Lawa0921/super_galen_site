"""Finite local glove cleanup and face-directed collar helpers."""
from guard_hand_foundation_math import edge_uses

def directed_boundary_loops(faces):
    successor={}
    for uses in edge_uses(faces).values():
        if len(uses)>2 or len(uses)==2 and uses[0][:2]!=tuple(reversed(uses[1][:2])):
            raise ValueError('Invalid manifold/oriented edge uses')
        if len(uses)==1:
            a,b,_=uses[0]
            if a in successor:raise ValueError('Non-simple boundary successor')
            successor[a]=b
    if set(successor)!=set(successor.values()):raise ValueError('Non-simple boundary predecessor')
    remaining=set(successor);loops=[]
    while remaining:
        first=min(remaining);loop=[first]
        while successor[loop[-1]]!=first:
            following=successor[loop[-1]]
            if following in loop:raise ValueError('Boundary revisits vertex')
            loop.append(following)
        remaining.difference_update(loop);loops.append(loop)
    return loops

def equal_ring_bridge(inner, outer):
    if len(inner)!=len(outer) or len(inner)<3 or len(set(inner+outer))!=len(inner+outer):
        raise ValueError('Collar requires separate same-count simple rings')
    return [[inner[(i+1)%len(inner)],inner[i],outer[i],outer[(i+1)%len(inner)]] for i in range(len(inner))]

def patch_offset(point, center, radii, displacement, enabled=True):
    if min(radii)<=0:raise ValueError('Undefined ROI support')
    q=sum(((p-c)/r)**2 for p,c,r in zip(point,center,radii))
    weight=(1-q)**2 if q<1 and enabled else 0
    return tuple(p+d*weight for p,d in zip(point,displacement))

def proximal_cuff_release(point_local, forearm_h, forearm_radius, axis_z):
    import math
    if axis_z>=-1e-6:raise ValueError('Cuff release requires the actual downward forearm axis')
    r,t,z=point_local
    support=.005<r<.035 and .020<z<.047 and abs(t)<.046 and forearm_radius>.044 and .002<forearm_h<.0161
    target_h=.0148+.0012*(.5+.5*math.cos(t*80))
    amount=(target_h-forearm_h)/(-axis_z) if support and forearm_h<target_h else 0
    return (r,t,z-amount)
