"""Open quad patches over explicitly identified cylindrical surface branches.

Missing patches stay missing; topology ambiguities are authoring errors rather
than permission to close finger gaps or join unrelated source surfaces.
"""
import collections
import math


def pair_verified_hits(hits, *, min_normal, min_thickness):
    """Pair adjacent oriented crossings, never the first and last shell hits."""
    if len(hits)%2:return {'pairs':[],'reason':'unpaired'}
    if any(not math.isfinite(h['radius']) or h['radius']<=0 for h in hits):
        return {'pairs':[],'reason':'invalid_radius'}
    if any(b['radius']<=a['radius'] for a,b in zip(hits,hits[1:])):
        return {'pairs':[],'reason':'unsorted_hits'}
    pairs=[]
    for inner,outer in zip(hits[::2],hits[1::2]):
        if not (inner['normal_dot'] < -min_normal and outer['normal_dot'] > min_normal):
            return {'pairs':[],'reason':'winding_or_tangent'}
        if inner.get('component') is None or inner.get('component')!=outer.get('component'):
            return {'pairs':[],'reason':'different_components'}
        if outer['radius']-inner['radius']<min_thickness:
            return {'pairs':[],'reason':'thin_interval'}
        pairs.append({'inner':inner,'outer':outer})
    return {'pairs':pairs,'reason':None}


def pick_owned_pair(hits, owners, *, min_normal, min_thickness):
    """Source triangle ownership is authoritative; a spatial ROI is not identity."""
    result=pair_verified_hits(hits,min_normal=min_normal,min_thickness=min_thickness)
    if result['reason']:return {'pair':None,'reason':result['reason']}
    selected=[p for p in result['pairs'] if p['inner']['face'] in owners['inner'] and p['outer']['face'] in owners['outer']]
    if len(selected)!=1:return {'pair':None,'reason':'ambiguous_owned_pairs' if selected else 'unowned_source_pair'}
    return {'pair':selected[0],'reason':None}


def build_chart_shell(samples, *, verified_edges=(), verified_cells=(), seam_verified=False, angle_values=None):
    """Emit only four-edge verified cells; never infer or cap a source boundary.

    A caller must identify one adjacent entry/exit ray pair per sample and prove
    continuity on each edge. This is a topology helper, not that proof. Explicit
    authored closures and non-radial anatomy belong in separate cage patches.
    """
    angles=len(samples);rows=len(samples[0]) if angles else 0
    if angles<3 or rows<2 or any(len(column)!=rows for column in samples):
        raise ValueError('Expected a rectangular periodic surface chart')
    heights={}
    theta=list(angle_values) if angle_values is not None else [2*math.pi*a/angles for a in range(angles)]
    if len(theta)!=angles or any(not math.isfinite(v) for v in theta) or any(b<=a for a,b in zip(theta,theta[1:])):
        raise ValueError('Chart angles must be finite and increase')
    if theta[-1]-theta[0]>=2*math.pi:raise ValueError('Chart angles must not duplicate the seam')
    for column in samples:
        for row,sample in enumerate(column):
            if sample is None:continue
            if sample.get('radial_intervals')!=1:raise ValueError('Multiple or unverified radial layers need separate semantic patches')
            if not isinstance(sample.get('branch'),str) or not sample['branch'].strip():raise ValueError('Each sample needs an explicit semantic branch')
            t,inner,outer=(sample.get(key) for key in ('t','inner','outer'))
            if any(not isinstance(v,(int,float)) or not math.isfinite(v) for v in (t,inner,outer)) or not 0<inner<outer:
                raise ValueError('Invalid or crossed source radii')
            if row in heights and abs(heights[row]-t)>1e-9:raise ValueError('Axial samples must align across charts')
            heights[row]=t
    ordered=sorted(heights)
    if any(heights[b]<=heights[a] for a,b in zip(ordered,ordered[1:])):raise ValueError('Axial samples must increase')
    for z in range(rows):
        authored=[samples[a][z].get('theta',theta[a]) for a in range(angles) if samples[a][z] is not None]
        if any(not isinstance(v,(int,float)) or not math.isfinite(v) for v in authored) or any(b<=a for a,b in zip(authored,authored[1:])) or (authored and authored[-1]-authored[0]>=2*math.pi):
            raise ValueError('Authored angles must increase without crossing or duplicating the seam')
    def edge_key(a,b):return tuple(sorted((tuple(a),tuple(b))))
    verified={edge_key(*edge) for edge in verified_edges}
    interiors={tuple(cell) for cell in verified_cells}
    cells=set();unresolved=[]
    for a in range(angles if seam_verified else angles-1):
        for z in range(rows-1):
            corners=[(a,z),((a+1)%angles,z),((a+1)%angles,z+1),(a,z+1)]
            values=[samples[x][y] for x,y in corners]
            reason=None
            if any(v is None for v in values):reason='missing_source'
            elif len({v['branch'] for v in values})!=1:reason='different_branches'
            elif any(edge_key(p,q) not in verified for p,q in zip(corners,corners[1:]+corners[:1])):reason='unverified_edge'
            elif (a,z) not in interiors:reason='unverified_interior'
            if reason:unresolved.append({'angle':a,'row':z,'reason':reason})
            else:cells.add((a,z))
    for a in range(angles):
        for z in range(rows):
            adjacent=[cell for cell in (((a-1)%angles,z-1),((a-1)%angles,z),(a,z-1),(a,z)) if cell in cells]
            if len(adjacent)==2 and adjacent[0][0]!=adjacent[1][0] and adjacent[0][1]!=adjacent[1][1]:
                raise ValueError('Ambiguous diagonal source contact requires separate semantic patches')
    vertices=[];quads=[];grid_keys=[];face_sources=[];indices={}
    def vertex(a,z,side):
        a%=angles;key=(a,z,side)
        if key not in indices:
            sample=samples[a][z];radius=sample['outer' if side else 'inner'];angle=sample.get('theta',theta[a])
            indices[key]=len(vertices);vertices.append([radius*math.cos(angle),radius*math.sin(angle),sample['t']]);grid_keys.append(list(key))
        return indices[key]
    def face(keys,source):
        quads.append([vertex(*key) for key in keys]);face_sources.append(source)
    for a,z in sorted(cells):
        corners=[(a,z),((a+1)%angles,z),((a+1)%angles,z+1),(a,z+1)]
        outer=[(*p,1) for p in corners];inner=[(*p,0) for p in corners]
        provenance={'angle':a,'row':z,'branch':samples[a][z]['branch']}
        face(outer,{**provenance,'surface':'outer'})
        face([inner[i] for i in (0,3,2,1)],{**provenance,'surface':'inner'})
    remaining=set(cells);components=0
    while remaining:
        components+=1;todo=[remaining.pop()]
        while todo:
            a,z=todo.pop()
            for neighbor in (((a-1)%angles,z),((a+1)%angles,z),(a,z-1),(a,z+1)):
                if neighbor in remaining:remaining.remove(neighbor);todo.append(neighbor)
    mesh_neighbors=[set() for _ in vertices]
    for quad in quads:
        for a,b in zip(quad,quad[1:]+quad[:1]):mesh_neighbors[a].add(b);mesh_neighbors[b].add(a)
    unseen=set(range(len(vertices)));mesh_components=0
    while unseen:
        mesh_components+=1;todo=[unseen.pop()]
        while todo:
            for neighbor in mesh_neighbors[todo.pop()]:
                if neighbor in unseen:unseen.remove(neighbor);todo.append(neighbor)
    edge_counts=collections.Counter(tuple(sorted((a,b))) for quad in quads for a,b in zip(quad,quad[1:]+quad[:1]))
    boundary_neighbors=collections.defaultdict(set)
    for (a,b),count in edge_counts.items():
        if count==1:boundary_neighbors[a].add(b);boundary_neighbors[b].add(a)
    boundary_degree_errors=[v for v,n in boundary_neighbors.items() if len(n)!=2]
    unseen=set(boundary_neighbors);boundary_loops=0
    while unseen:
        todo=[unseen.pop()];closed=True
        while todo:
            v=todo.pop();closed&=len(boundary_neighbors[v])==2
            for neighbor in boundary_neighbors[v]:
                if neighbor in unseen:unseen.remove(neighbor);todo.append(neighbor)
        boundary_loops+=int(closed)
    return {'vertices':vertices,'quads':quads,'grid_keys':grid_keys,'face_sources':face_sources,
            'cell_domain_components':components,'mesh_components':mesh_components,
            'boundary_loops':boundary_loops,'boundary_degree_errors':boundary_degree_errors,
            'unresolved_cells':unresolved,'boundary_policy':'leave_open'}
