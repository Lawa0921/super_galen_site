"""Semantic-frame and small-mesh QA helpers; no anatomy inferred from PCA."""
import math
from collections import defaultdict

def add(a,b): return tuple(x+y for x,y in zip(a,b))
def sub(a,b): return tuple(x-y for x,y in zip(a,b))
def mul(a,s): return tuple(x*s for x in a)
def dot(a,b): return sum(x*y for x,y in zip(a,b))
def cross(a,b): return (a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0])
def norm(a): return math.sqrt(dot(a,a))
def unit(a):
    length=norm(a)
    if length<1e-12: raise ValueError('Undefined direction/radial vector')
    return mul(a,1/length)
def project_radial(a,axis): return sub(a,mul(axis,dot(a,axis)))
def rotate(matrix,a): return tuple(dot(row,a) for row in matrix)

def fit_semantic_frame(cs,source_axis,ws,cc,target_axis,wc):
    sa,ta=unit(source_axis),unit(target_axis)
    sr0,tr0=project_radial(sub(ws,cs),sa),project_radial(sub(wc,cc),ta)
    sr,tr=unit(sr0),unit(tr0)
    st,tt=cross(sa,sr),cross(ta,tr)
    rotation=[[tr[i]*sr[j]+tt[i]*st[j]+ta[i]*sa[j] for j in range(3)] for i in range(3)]
    scale=norm(tr0)/norm(sr0)
    translation=sub(cc,mul(rotate(rotation,cs),scale))
    mapped_wrist=add(mul(rotate(rotation,ws),scale),translation)
    residual=sub(wc,mapped_wrist)
    determinant=dot(rotation[0],cross(rotation[1],rotation[2]))
    return {'scale':scale,'rotation':rotation,'translation':translation,'mapped_wrist':mapped_wrist,
        'mapped_axis':rotate(rotation,sa),'rotation_determinant':determinant,
        'source_radial_m':norm(sr0),'target_radial_m':norm(tr0),
        'source_wrist_axial_m':dot(sub(ws,cs),sa),'target_wrist_axial_m':dot(sub(wc,cc),ta),
        'axial_residual_m':dot(residual,ta),'radial_residual_m':norm(project_radial(residual,ta)),
        'source_radial_direction':sr,'target_radial_direction':tr,'target_tangent_direction':tt}

def triangulate(faces):
    for face in faces:
        for i in range(1,len(face)-1): yield (face[0],face[i],face[i+1])

def edge_uses(faces):
    result=defaultdict(list)
    for index,face in enumerate(faces):
        for a,b in zip(face,face[1:]+face[:1]): result[tuple(sorted((a,b)))].append((a,b,index))
    return result

def topology(vertices,faces):
    uses=edge_uses(faces)
    triangles=list(triangulate(faces))
    degenerate=sum(norm(cross(sub(vertices[b],vertices[a]),sub(vertices[c],vertices[a])))<1e-12 for a,b,c in triangles)
    return {'vertices':len(vertices),'faces':len(faces),'triangles':len(triangles),
        'boundary_edges':sum(len(items)==1 for items in uses.values()),
        'nonmanifold_edges':sum(len(items)>2 or key[0]==key[1] for key,items in uses.items()),
        'winding_edges':sum(len(items)==2 and items[0][:2]==items[1][:2] for items in uses.values()),
        'degenerate_triangles':degenerate}

def ordered_boundary_loops(faces):
    uses=edge_uses(faces);neighbors=defaultdict(set)
    for (a,b),items in uses.items():
        if len(items)==1:
            neighbors[a].add(b);neighbors[b].add(a)
    if any(len(items)!=2 for items in neighbors.values()): raise ValueError('Invalid boundary: not closed simple loops')
    remaining=set(neighbors);loops=[]
    while remaining:
        first=min(remaining);loop=[first];previous=None;current=first
        while True:
            following=min(neighbors[current]-({previous} if previous is not None else set()))
            if following==first: break
            if following in loop: raise ValueError('Boundary crosses itself topologically')
            loop.append(following);previous,current=current,following
        remaining.difference_update(loop);loops.append(loop)
    return loops

def clearance_samples(vertices,faces,center,axis,radius,subdivisions=8):
    axis=unit(axis);minimum=float('inf');violations=0;count=0
    for ia,ib,ic in triangulate(faces):
        a,b,c=vertices[ia],vertices[ib],vertices[ic]
        for i in range(subdivisions+1):
            for j in range(subdivisions+1-i):
                u,v=i/subdivisions,j/subdivisions
                p=add(add(mul(a,1-u-v),mul(b,u)),mul(c,v))
                r=norm(project_radial(sub(p,center),axis));minimum=min(minimum,r);count+=1
                violations+=r<radius-1e-8
    return {'samples':count,'min_radius_m':minimum,'min_clearance_m':minimum-radius,'violations':violations,
        'method':'Barycentric triangle samples; complementary exact Blender intersection QA required'}

def exact_clearance(vertices,faces,center,axis,radius):
    """Exact minimum projected triangle distance to the infinite grip axis."""
    axis=unit(axis);minimum=float('inf');violations=0;worst=None;count=0
    for count,triangle in enumerate(triangulate(faces),1):
        points=[project_radial(sub(vertices[i],center),axis) for i in triangle]
        signs=[dot(cross(a,b),axis) for a,b in zip(points,points[1:]+points[:1])]
        area=dot(cross(sub(points[1],points[0]),sub(points[2],points[0])),axis)
        if abs(area)>1e-15 and (all(value>=-1e-15 for value in signs) or all(value<=1e-15 for value in signs)):
            distance=0
            e0,e1=sub(points[1],points[0]),sub(points[2],points[0])
            d00,d01,d11=dot(e0,e0),dot(e0,e1),dot(e1,e1)
            d20,d21=dot(mul(points[0],-1),e0),dot(mul(points[0],-1),e1)
            denominator=d00*d11-d01*d01
            u,v=(d11*d20-d01*d21)/denominator,(d00*d21-d01*d20)/denominator
            weights=(1-u-v,u,v)
        else:
            candidates=[]
            for index,(a,b) in enumerate(zip(points,points[1:]+points[:1])):
                edge=sub(b,a);length=dot(edge,edge)
                amount=max(0,min(1,-dot(a,edge)/length)) if length>1e-24 else 0
                bary=[0,0,0];bary[index]=1-amount;bary[(index+1)%3]=amount
                candidates.append((norm(add(a,mul(edge,amount))),tuple(bary)))
            distance,weights=min(candidates,key=lambda item:item[0])
        if distance<minimum:
            point=tuple(sum(vertices[vertex][axis]*weight for vertex,weight in zip(triangle,weights)) for axis in range(3))
            minimum,worst=distance,{'triangle_index':count-1,'vertex_ids':triangle,
                'barycentric_weights':weights,'closest_surface_point_m':point}
        violations+=distance<radius-1e-8
    return {'triangles':count,'min_radius_m':minimum,'min_clearance_m':minimum-radius,
        'violating_triangles':violations,'worst':worst,'method':'Analytic projected triangle origin-containment plus minimum segment distance; entire triangle interiors, infinite cylinder'}

def capped_signed_volume(vertices,faces):
    """Virtually cap directed open loops to check global orientation; no mesh edit."""
    vertices=list(vertices);closed=list(faces)
    ordered_boundary_loops(faces)  # Reject ambiguous boundary junctions first.
    directed={a:b for items in edge_uses(faces).values() if len(items)==1 for a,b,_ in items}
    remaining=set(directed)
    while remaining:
        first=min(remaining);loop=[first]
        while directed[loop[-1]]!=first:loop.append(directed[loop[-1]])
        remaining.difference_update(loop)
        center=tuple(sum(vertices[i][axis] for i in loop)/len(loop) for axis in range(3))
        index=len(vertices);vertices.append(center)
        closed.extend((b,a,index) for a,b in zip(loop,loop[1:]+loop[:1]))
    origin=vertices[0]
    return sum(dot(sub(vertices[a],origin),cross(sub(vertices[b],origin),sub(vertices[c],origin)))/6
        for a,b,c in triangulate(closed))
