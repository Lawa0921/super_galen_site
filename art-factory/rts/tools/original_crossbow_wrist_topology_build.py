"""Local original sleeve retopology, sampled from the existing textured surface.

Only this run's candidate is written. Frozen carry sources and runtime stay intact.
"""
import ast,bpy,bmesh,hashlib,json,math,os,sys
from pathlib import Path
from mathutils import Matrix,Vector
from mathutils.bvhtree import BVHTree
from mathutils.geometry import barycentric_transform
sys.path.insert(0,str(Path(__file__).parent))
from original_crossbow_wrist_cut_probe import prepare_cut,CUTS,CUT_PAIR_REPORTS,CUT_REGION_REPORTS
from original_crossbow_wrist_topology_probe import OLD,RUN
from original_crossbow_interface_probe import evaluated,winding

def smooth(t):return t*t*(3-2*t)

def ordered_ring(graph):
    assert graph and all(len(neighbors)==2 for neighbors in graph.values()),'Cut is not a closed unbranched ring'
    first=min(graph,key=lambda v:tuple(v.co));ring=[first];prior=None;v=first
    while True:
        nxt=min((n for n in graph[v] if n!=prior),key=lambda p:tuple(p.co))
        if nxt==first:break
        assert nxt not in ring,'Premature cycle';ring.append(nxt);prior,v=v,nxt
    assert len(ring)==len(graph),'Multiple cut loops'
    return ring

def skin_matrix(obj,rig,weights):
    matrix=Matrix(((0.,)*4,)*4)
    for index,weight in weights.items():
        name=obj.vertex_groups[index].name;skin=rig.pose.bones[name].matrix@rig.data.bones[name].matrix_local.inverted()
        for i in range(4):
            for j in range(4):matrix[i][j]+=skin[i][j]*weight
    return matrix

def repair(body,rig,side,distance,sample_body=None):
    points,_,_=evaluated(body);mesh=body.data
    originals=[v.co.copy() for v in mesh.vertices]
    sign=1 if side=='R' else -1;code=1 if side=='R' else 2
    groups={body.vertex_groups[part+'_'+side].index for part in ('UpperArm','Forearm','Hand')}
    donor=sample_body or body;sample_mesh=donor.data;sample_mesh.calc_loop_triangles();sample_points=points if donor==body else evaluated(donor)[0]
    sample_groups={donor.vertex_groups[part+'_'+side].index for part in ('UpperArm','Forearm','Hand')}
    roi={v.index for v in sample_mesh.vertices if sign*v.co.x>.24 and v.co.z<1.27 and sum(g.weight for g in v.groups if g.group in sample_groups)>.50}
    triangles=[t for t in sample_mesh.loop_triangles if set(t.vertices)<=roi]
    surf=BVHTree.FromPolygons(sample_points,[tuple(t.vertices) for t in triangles],all_triangles=True)
    uvdata=sample_mesh.uv_layers.active.data
    def sample_uv(point):
        nearest,_,index,_=surf.find_nearest(point);tri=triangles[index]
        return barycentric_transform(nearest,*[sample_points[i] for i in tri.vertices],*[Vector((*uvdata[i].uv,0)) for i in tri.loops]).xy
    bm,source,deform,_,_,graph,cut,axis=prepare_cut(body,rig,side,distance)
    # Current BMesh order still starts with retained source vertices; record
    # original bind positions by persistent source ID (including prior repair).
    attr=mesh.attributes.get('OriginalSourceVertex')
    prior_ids=[x.value for x in attr.data] if attr else list(range(1,len(originals)+1))
    prior_by_id={i:p for i,p in zip(prior_ids,originals) if i>0}
    # A second side also contains previous new vertices (ID 0). Their posed
    # coordinates are restored by their unchanged skin matrix below.
    ring=ordered_ring(graph);center=sum((v.co for v in ring),Vector())/len(ring)
    # Keep face winding consistent with the retained proximal surface.
    edge=next(e for e in ring[0].link_edges if ring[1] in e.verts)
    face=edge.link_faces[0]
    follows=any(loop.vert==ring[0] and loop.link_loop_next.vert==ring[1] for loop in face.loops)
    if follows:ring.reverse()
    hand=rig.pose.bones['Hand_'+side];hp,ht,_=evaluated(bpy.data.objects['OriginalCrossbowClosedGrip_'+side])
    glove=BVHTree.FromPolygons(hp,ht,all_triangles=True)
    u=axis.cross(Vector((0,0,1))).normalized();vaxis=axis.cross(u).normalized();cap=hand.head+axis*.003
    for _ in range(2):
        for direction in (u,vaxis):
            a=glove.ray_cast(cap,direction,.1)[3];b=glove.ray_cast(cap,-direction,.1)[3]
            assert a is not None and b is not None;cap+=direction*(a-b)*.5
    radius=min(glove.ray_cast(cap,u*math.cos(i*math.tau/64)+vaxis*math.sin(i*math.tau/64),.1)[3] for i in range(64))*.68
    assert radius>.006 and abs(winding(cap,hp,ht))>.9
    mark=bm.verts.layers.int.get('WristRepairSide') or bm.verts.layers.int.new('WristRepairSide')
    terminal=bm.verts.layers.int.get('WristTerminalSide') or bm.verts.layers.int.new('WristTerminalSide')
    face_mark=bm.faces.layers.int.get('WristRepairFace') or bm.faces.layers.int.new('WristRepairFace')
    uv=bm.loops.layers.uv.active;hand_index=body.vertex_groups['Hand_'+side].index
    start=[p.co.copy() for p in ring]
    # An arm cross-section must not inherit unrelated per-island skin weights:
    # near-coincident samples on R0 had different Hand/Forearm blends and
    # expanded thin edges by 28x in Attack. Author one continuous blend per
    # section; only newly cut vertices are affected, never retained source.
    common={index:sum(p[deform].get(index,0) for p in ring)/len(ring) for index in groups}
    common={i:w for i,w in common.items() if w>1e-8};total=sum(common.values());common={i:w/total for i,w in common.items()}
    strict_closed=CUT_REGION_REPORTS[(body.name,side)]['strict_closed_source']
    if strict_closed:
        # Canonical skin is already continuous. Preserve interpolated cut
        # weights so the ring has no new transition against retained faces.
        weights=[dict(p[deform]) for p in ring]
    else:
        for p in ring:
            p[deform].clear()
            for i,w in common.items():p[deform][i]=w
        weights=[common.copy() for p in ring]
    radial=[(p-center)-axis*(p-center).dot(axis) for p in start]
    directions=[p.normalized() for p in radial]
    uv_rings=[[sample_uv(p) for p in start]];bands=[ring];fallbacks=0;profile=[]
    for vert in ring:vert[mark]=code
    # Long low-detail repairs retain more source cross-sections. Near the
    # actual glove, the original sleeve smoothly closes inside its cuff.
    count=max(4,math.ceil(distance/.020))
    for k in range(1,count+1):
        t=k/count;middle=center.lerp(cap,t);band=[];uv_band=[];radii=[]
        for j,direction in enumerate(directions):
            hit,_,_,ray_distance=surf.ray_cast(middle,direction,.15)
            if hit is None:
                nearest,_,_,_=surf.find_nearest(middle+direction*(radial[j].length*(1-t)+radius*t))
                original_radius=max(radius,(nearest-middle).dot(direction));fallbacks+=1
            else:original_radius=ray_distance
            # Sampled contour dominates the proximal sleeve. Final 35% is
            # an authored cloth taper to the measured internal glove ring.
            blend=smooth(max(0,min(1,(t-.65)/.35)))
            r=original_radius*(1-blend)+radius*blend
            p=middle+direction*r
            if k==count:p=cap+direction*radius
            vert=bm.verts.new(p);vert[source]=0;vert[mark]=code
            hand_mix=smooth(t)
            w={i:value*(1-hand_mix) for i,value in weights[j].items() if value*(1-hand_mix)>1e-8}
            w[hand_index]=w.get(hand_index,0)+hand_mix
            total=sum(w.values())
            for i,value in w.items():vert[deform][i]=value/total
            if k==count:vert[terminal]=code
            band.append(vert);uv_band.append(sample_uv(p));radii.append(r)
        bands.append(band);uv_rings.append(uv_band);profile.append({'fraction':t,'radius_min_m':min(radii),'radius_max_m':max(radii)})
    # UVs are per-loop: preserve atlas islands instead of welding UVs across
    # seams. Each new face samples a single nearest source triangle for a
    # continuous local mapping, including wrap boundaries.
    newfaces=[]
    for k in range(count):
        for j in range(len(ring)):
            n=(j+1)%len(ring);verts=[bands[k][j],bands[k][n],bands[k+1][n],bands[k+1][j]]
            face=bm.faces.new(verts);face[face_mark]=code;face.material_index=0;face.smooth=True
            midpoint=sum((p.co for p in verts),Vector())/4
            _,_,source_i,_=surf.find_nearest(midpoint);tri=triangles[source_i]
            srcpoints=[sample_points[i] for i in tri.vertices];srcuv=[Vector((*uvdata[i].uv,0)) for i in tri.loops]
            for loop in face.loops:loop[uv].uv=barycentric_transform(loop.vert.co,*srcpoints,*srcuv).xy
            newfaces.append(face)
    tip=bm.verts.new(cap);tip[source]=0;tip[mark]=code;tip[terminal]=code;tip[deform][hand_index]=1
    for j in range(len(ring)):
        face=bm.faces.new([bands[-1][j],bands[-1][(j+1)%len(ring)],tip]);face[face_mark]=code;face.material_index=0;face.smooth=True
        for loop in face.loops:loop[uv].uv=sample_uv(loop.vert.co)
        newfaces.append(face)
    assert all(e.is_manifold for face in newfaces for e in face.edges),'Unsealed sleeve strip or cut-ring edge'
    inherited=[e for vert in ring for e in vert.link_edges if e.is_boundary]
    # Inverse skin only generated vertices; original bind coordinates remain
    # bit-for-bit identical. Previous opposite-side repair is left unchanged
    # within floating point inverse-skin accuracy.
    for vert in bm.verts:
        if vert[source]>0:vert.co=prior_by_id[vert[source]]
        else:vert.co=skin_matrix(body,rig,dict(vert[deform])).inverted()@vert.co
    bmesh.ops.triangulate(bm,faces=newfaces,quad_method='BEAUTY',ngon_method='BEAUTY')
    bm.to_mesh(mesh);bm.free();mesh.update();bpy.context.view_layer.update()
    return {'side':side,'body':body.name,'cut_distance_m':distance,'cut_vertices':len(ring),'cut_region':CUT_REGION_REPORTS[(body.name,side)],'cut_section_weights':{body.vertex_groups[i].name:w for i,w in common.items()},'endpoint_pairs':CUT_PAIR_REPORTS[(body.name,side)],'inherited_proximal_seam_edges':len(set(inherited)),'new_bands':count,'contour_fallbacks':fallbacks,'sampled_profile':profile,'cap_radius_m':radius,'cap_center_world':list(cap),'method':'Existing original arm contour sampled by radial surface intersections; original atlas projected per face; measured internal glove cap'}

def main():
    source=OLD/'candidate/original-crossbow-grip.blend'
    assert hashlib.sha256(source.read_bytes()).hexdigest()=='ee845a8004fd2267070e1459fa97da17d4b9797458185c012f1527303d9718bd'
    bpy.ops.wm.open_mainfile(filepath=str(source));rig=bpy.data.objects['crossbowRig20'];action=bpy.data.actions['Idle']
    rig.animation_data.action=action;rig.animation_data.action_slot=action.slots[0];bpy.context.scene.frame_set(0);bpy.context.view_layer.update()
    rows=[]
    for (lod,side),distance in CUTS.items():rows.append(repair(bpy.data.objects[f'crossbowOriginalBody_LOD{lod}'],rig,side,distance))
    out=RUN/'candidate';out.mkdir(parents=True,exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=str(out/'original-crossbow-grip.blend'))
    (out/'wrist-topology-report.json').write_text(json.dumps({'source':str(source),'rows':rows,'runtime_publish_allowed':False},indent=2)+'\n')
    if '--no-export' not in sys.argv:
        exporter=Path(__file__).with_name('original_crossbow_grip_build.py');tree=ast.parse(exporter.read_text(encoding='utf8'))
        fn=next(n for n in tree.body if isinstance(n,ast.FunctionDef) and n.name=='export_lod');ns={'bpy':bpy,'os':os}
        exec(compile(ast.Module(body=[fn],type_ignores=[]),str(exporter),'exec'),ns)
        bodies=[bpy.data.objects[f'crossbowOriginalBody_LOD{lod}'] for lod in (0,1)];weapons=[bpy.data.objects[f'CrossbowWeapon_LOD{lod}'] for lod in (0,1)]
        hands=[bpy.data.objects['OriginalCrossbowClosedGrip_'+s] for s in ('R','L')]
        for lod in (0,1):ns['export_lod'](rig,bodies,weapons,[],hands,str(out/f'original-crossbow-grip-lod{lod}.glb'),bodies[lod].name,weapons[lod].name)
    report=json.loads((OLD/'candidate/weapon-candidate-report.json').read_text());report['wrist_topology_source']=str(source)
    report['files']={p.name:hashlib.sha256(p.read_bytes()).hexdigest() for p in out.iterdir() if p.suffix in ('.blend','.glb')};report['runtime_publish_allowed']=False
    (out/'weapon-candidate-report.json').write_text(json.dumps(report,indent=2)+'\n');print('WRIST_BUILD',json.dumps({'rows':rows,'files':report['files']}))

if __name__=='__main__':main()
