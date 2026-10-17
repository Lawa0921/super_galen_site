"""Original landmark module control meshes, independent of Blender."""
import math

def arch_profile(inner, outer, start, end, segments):
    if not 0<inner<outer or not 0<end-start<=2*math.pi or segments<1:
        raise ValueError('Positive radii, ordered angles, at least one segment required')
    angles=[start+(end-start)*i/segments for i in range(segments+1)]
    return [(outer*math.cos(a),outer*math.sin(a)) for a in angles]+[(inner*math.cos(a),inner*math.sin(a)) for a in reversed(angles)]

def extruded_profile(points, depth):
    if depth<=0 or len(points)<3:raise ValueError('A thick polygon is required')
    area=sum(p[0]*points[(i+1)%len(points)][1]-points[(i+1)%len(points)][0]*p[1] for i,p in enumerate(points))/2
    if abs(area)<1e-10:raise ValueError('Degenerate profile')
    points=list(points if area>0 else reversed(points));n=len(points)
    vertices=[(x,y,z) for y in (-depth/2,depth/2) for x,z in points]
    faces=[tuple(range(n)),tuple(reversed(range(n,n*2)))]+[(i,n+i,n+(i+1)%n,(i+1)%n) for i in range(n)]
    return vertices,faces

def assert_footprint(vertices, limit=1.9, min_z=-.08, max_z=5.2):
    if not vertices:raise ValueError('Empty asset')
    for x,y,z in vertices:
        if not all(math.isfinite(k) for k in (x,y,z)) or abs(x)>limit+1e-7 or abs(y)>limit+1e-7 or not min_z-1e-7<=z<=max_z+1e-7:
            raise ValueError(f'Footprint overflow: {(x,y,z)}')
