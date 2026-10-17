"""Verify one evidence-based clean proximal cut per broken wrist, in posed space."""
import bpy,bmesh,json,sys
from pathlib import Path
from mathutils import Vector
sys.path.insert(0,str(Path(__file__).parent))
from original_crossbow_interface_probe import evaluated
from original_crossbow_wrist_topology_probe import OLD,RUN
CUTS={(0,'R'):.035,(1,'R'):.075,(1,'L'):.130}
CUT_PAIR_REPORTS={}
CUT_REGION_REPORTS={}

def prepare_cut(body,rig,side,distance):
    points,_,_=evaluated(body);bm=bmesh.new();bm.from_mesh(body.data);bm.verts.ensure_lookup_table()
    source_layer=bm.verts.layers.int.get('OriginalSourceVertex')
    if source_layer is None:
        source_layer=bm.verts.layers.int.new('OriginalSourceVertex')
        for v in bm.verts:v[source_layer]=v.index+1
    # Allocate custom data before retaining BMVert references: adding a layer
    # can invalidate Python wrappers when Blender reallocates that data.
    for name in ('WristRepairSide','WristTerminalSide'):
        if bm.verts.layers.int.get(name) is None:bm.verts.layers.int.new(name)
    strict_closed=all(e.is_manifold for e in bm.edges)
    # The restored mother still has its discarded neural hands. Their donor
    # weights are undefined, so cut that original anatomy in bind space;
    # selecting it after deformation can slice a folded finger a second time.
    if not strict_closed:
        for v,p in zip(bm.verts,points):v.co=p
    original=set(bm.verts);deform=bm.verts.layers.deform.verify();sign=1 if side=='R' else -1
    groups={body.vertex_groups[name].index for name in ('UpperArm_'+side,'Forearm_'+side,'Hand_'+side)}
    region=[v for v in bm.verts if sum(v[deform].get(g,0) for g in groups)>.50 and sign*body.data.vertices[v.index].co.x>.24 and body.data.vertices[v.index].co.z<1.27]
    if strict_closed:
        wrist=rig.data.bones['Hand_'+side].head_local.copy();axis=(rig.data.bones['Forearm_'+side].head_local-wrist).normalized()
    else:
        wrist=rig.pose.bones['Hand_'+side].head.copy();axis=(rig.pose.bones['Forearm_'+side].head-wrist).normalized()
    cut=wrist+axis*distance
    region_set=set(region);faces={f for f in bm.faces if set(f.verts)<=region_set}
    initial=len(faces);growth=[]
    if strict_closed:
        # Weights select a semantic seed, never the limits of a closed cut.
        # Complete its edge-connected distal surface until every perimeter
        # edge lies wholly in the retained half-space. This prevents a face
        # with one sub-threshold vertex from being skipped by the bisector.
        while True:
            edges={e for f in faces for e in f.edges}
            additions={f for e in edges if any((v.co-cut).dot(axis)<=1e-7 for v in e.verts) for f in e.link_faces if f not in faces}
            if not additions:break
            assert len(faces|additions)<len(bm.faces)*.25,'Cut region escaped arm'
            assert all(sign*body.data.vertices[v.index].co.x>.20 for f in additions for v in f.verts),'Cut region reached torso'
            faces|=additions;growth.append(len(additions))
        edges={e for f in faces for e in f.edges};verts={v for f in faces for v in f.verts}
        geom=list(verts)+list(edges)+list(faces)
    else:
        geom=region+[e for e in bm.edges if set(e.verts)<=region_set]+list(faces)
    CUT_REGION_REPORTS[(body.name,side)]={'strict_closed_source':strict_closed,'cut_space':'original_bind' if strict_closed else 'pose','initial_faces':initial,'expanded_faces':len(faces),'growth_layers':growth}
    bmesh.ops.bisect_plane(bm,geom=geom,dist=1e-7,plane_co=cut,plane_no=-axis,clear_outer=True)
    for v in bm.verts:
        if v not in original:v[source_layer]=0
    loose=[v for v in bm.verts if not v.link_faces]
    if loose:bmesh.ops.delete(bm,geom=loose,context='VERTS')
    ring=[v for v in bm.verts if v not in original and abs((v.co-cut).dot(axis))<1e-5]
    # Preserve all interior cut samples. A distance weld of the whole ring
    # collapsed legitimate neighboring points and created a bow-tie on R0.
    # Only pair degree-1 endpoints of the cut paths, retaining per-loop UV.
    ring_set=set(ring);boundary=[e for e in bm.edges if e.is_boundary and set(e.verts)<=ring_set]
    degree={v:sum(v in e.verts for e in boundary) for v in ring}
    ends={v for v,d in degree.items() if d==1};pairs=[]
    if strict_closed:
        assert not ends and all(d==2 for d in degree.values()),'Closed source cut did not produce closed loops'
    while ends:
        assert len(ends)>=2,('Unpaired cut endpoint',body.name,side)
        ordered=sorted(ends,key=lambda v:tuple(v.co))
        a,b=min(((a,b) for k,a in enumerate(ordered) for b in ordered[k+1:]),key=lambda pair:(pair[0].co-pair[1].co).length)
        gap=(a.co-b.co).length;assert gap<.0015,('Cut gap needs investigation',body.name,side,gap)
        ends-={a,b};pairs.append({'gap_m':gap,'endpoints_world':[list(a.co),list(b.co)]})
        weights={i:(a[deform].get(i,0)+b[deform].get(i,0))*.5 for i in set(a[deform].keys())|set(b[deform].keys())}
        a.co=(a.co+b.co)*.5;bmesh.ops.weld_verts(bm,targetmap={b:a})
        a[deform].clear()
        for i,w in weights.items():a[deform][i]=w/sum(weights.values())
    CUT_PAIR_REPORTS[(body.name,side)]=pairs
    ring=[v for v in bm.verts if v not in original and abs((v.co-cut).dot(axis))<1e-5]
    ring_set=set(ring);edges=[e for e in bm.edges if e.is_boundary and set(e.verts)<=ring_set]
    ring=list({v for e in edges for v in e.verts})
    graph={v:set() for v in ring}
    for e in edges:
        a,b=e.verts;graph[a].add(b);graph[b].add(a)
    if strict_closed:
        matrices={group.index:rig.pose.bones[group.name].matrix@rig.data.bones[group.name].matrix_local.inverted() for group in body.vertex_groups}
        for vert in bm.verts:vert.co=sum((weight*(matrices[index]@vert.co) for index,weight in vert[deform].items()),Vector())
        wrist=rig.pose.bones['Hand_'+side].head.copy();axis=(rig.pose.bones['Forearm_'+side].head-wrist).normalized();cut=wrist+axis*distance
    return bm,source_layer,deform,ring,edges,graph,cut,axis

def main():
    bpy.ops.wm.open_mainfile(filepath=str(OLD/'candidate/original-crossbow-grip.blend'));rig=bpy.data.objects['crossbowRig20'];a=bpy.data.actions['Idle']
    rig.animation_data.action=a;rig.animation_data.action_slot=a.slots[0];bpy.context.scene.frame_set(0);bpy.context.view_layer.update();rows=[]
    for (lod,side),distance in CUTS.items():
        body=bpy.data.objects[f'crossbowOriginalBody_LOD{lod}'];bm,_,_,ring,edges,graph,cut,axis=prepare_cut(body,rig,side,distance)
        components=[];remaining=set(ring)
        while remaining:
            queue=[next(iter(remaining))];seen=set()
            while queue:
                v=queue.pop()
                if v in seen:continue
                seen.add(v);queue.extend(graph[v]-seen)
            remaining-=seen;components.append(len(seen))
        ends=[v for v in ring if len(graph[v])==1]
        rows.append({'lod':lod,'side':side,'cut_distance_m':distance,'vertices':len(ring),'edges':len(edges),'degrees':{str(degree):sum(len(graph[v])==degree for v in ring) for degree in set(map(len,graph.values()))},'components':components,'endpoints':[{'world':list(v.co),'nearest_other_endpoint_m':min(((v.co-u.co).length for u in ends if u!=v),default=None),'linked_faces':len(v.link_faces)} for v in ends],'pass':len(components)==1 and all(len(graph[v])==2 for v in ring)})
        bm.free()
    report={'rows':rows,'pass':all(r['pass'] for r in rows),'runtime_publish_allowed':False};(RUN/'qa/cut-sections.json').write_text(json.dumps(report,indent=2)+'\n');print('CUT_SECTIONS',json.dumps(report));assert report['pass']
if __name__=='__main__':main()
