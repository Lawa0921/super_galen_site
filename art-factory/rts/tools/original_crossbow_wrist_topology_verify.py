"""Independent full-boundary regression and local retopology preservation checks."""
import bpy,bmesh,json,sys,hashlib
from pathlib import Path
from collections import Counter
from mathutils import Vector
sys.path.insert(0,str(Path(__file__).parent))
from original_crossbow_wrist_topology_probe import OLD,RUN
from original_crossbow_interface_probe import evaluated,winding
from original_crossbow_cuff_boundary import complete_boundary
from original_crossbow_cuff_verify import snapshot

def pose(rig,clip='Idle',frame=0):
    a=bpy.data.actions[clip];rig.animation_data.action=a;rig.animation_data.action_slot=a.slots[0]
    bpy.context.scene.frame_set(int(frame),subframe=frame%1);bpy.context.view_layer.update()

def baseline():
    bpy.ops.wm.open_mainfile(filepath=str(OLD/'candidate/original-crossbow-grip.blend'))
    rig=bpy.data.objects['crossbowRig20'];pose(rig);old=json.loads((OLD/'interface-candidate/cuff-rebuild-report.json').read_text());rows=[]
    for lod in (0,1):
        obj=bpy.data.objects[f'crossbowOriginalBody_LOD{lod}'];p,_,_=evaluated(obj)
        for side in ('R','L'):
            hp,ht,_=evaluated(bpy.data.objects['OriginalCrossbowClosedGrip_'+side])
            ids,edges,parts=complete_boundary(obj.data,set(old['records'][side]['bodies'][obj.name]['terminal_indices']),False)
            degree=Counter(i for edge in edges for i in edge)
            samples=[p[i] for i in ids]+[p[i].lerp(p[j],t) for i,j in edges for t in (.25,.5,.75)]
            outside=sum(abs(winding(s,hp,ht))<.9 for s in samples)
            rows.append({'lod':lod,'side':side,'boundary_vertices':len(ids),'boundary_edges':len(edges),'branch_vertices':[i for i,d in degree.items() if d!=2],'outside_samples':outside,'pass':len(parts)==1 and all(d==2 for d in degree.values()) and outside==0})
    report={'rows':rows,'pass':all(r['pass'] for r in rows),'runtime_publish_allowed':False}
    (RUN/'qa/baseline-regression.json').write_text(json.dumps(report,indent=2)+'\n');print('BASELINE',json.dumps(report));assert report['pass'],'Existing complete wrist boundaries are branched or escape glove'

def main():
    if '--baseline' in sys.argv:return baseline()
    bpy.ops.wm.open_mainfile(filepath=str(OLD/'candidate/original-crossbow-grip.blend'));original,bind,curves=snapshot()
    original_mesh={}
    for lod in (0,1):
        o=bpy.data.objects[f'crossbowOriginalBody_LOD{lod}'];m=o.data
        original_mesh[o.name]={'faces':[tuple(p.vertices) for p in m.polygons],
          'uv':[[tuple(m.uv_layers.active.data[i].uv) for i in p.loop_indices] for p in m.polygons],
          'materials':[p.material_index for p in m.polygons],
          'weights':[{o.vertex_groups[g.group].name:g.weight for g in v.groups} for v in m.vertices]}
    bpy.ops.wm.open_mainfile(filepath=str(RUN/'candidate/original-crossbow-grip.blend'));candidate,new_bind,new_curves=snapshot()
    assert bind==new_bind and curves==new_curves,'Bind or animation changed'
    for name,record in original.items():
        if name.startswith('crossbowOriginalBody_LOD'):continue
        assert record==candidate[name],('Non-body mesh changed',name)
    rig=bpy.data.objects['crossbowRig20'];pose(rig);rows=[];preservation=[];failures=[]
    report=json.loads((RUN/'candidate/wrist-topology-report.json').read_text())
    for lod in (0,1):
        o=bpy.data.objects[f'crossbowOriginalBody_LOD{lod}'];m=o.data;old=original_mesh[o.name]
        source=m.attributes['OriginalSourceVertex'];ids=[v.value-1 for v in source.data]
        retained=0
        for v,index in zip(m.vertices,ids):
            if index<0:continue
            assert list(v.co)==original[o.name]['vertices'][index],('Retained position changed',lod,index)
            weights={o.vertex_groups[g.group].name:g.weight for g in v.groups}
            assert weights==old['weights'][index],('Retained weights changed',lod,index)
            retained+=1
        lookup={tuple(f):i for i,f in enumerate(old['faces'])};intact=0
        for p in m.polygons:
            mapped=tuple(ids[i] for i in p.vertices)
            if min(mapped)<0:continue
            assert mapped in lookup,('Unexpected face outside new strip',lod,mapped)
            old_i=lookup[mapped]
            assert p.material_index==old['materials'][old_i]
            assert [tuple(m.uv_layers.active.data[i].uv) for i in p.loop_indices]==old['uv'][old_i],('Retained UV changed',lod,old_i)
            intact+=1
        preservation.append({'lod':lod,'retained_vertices_exact':retained,'retained_faces_uv_material_exact':intact})
        bm=bmesh.new();bm.from_mesh(m);bm.verts.ensure_lookup_table();mark=bm.verts.layers.int.get('WristRepairSide');terminal=bm.verts.layers.int.get('WristTerminalSide')
        points,triangles,_=evaluated(o)
        for side,code in [('R',1),('L',2)]:
            if lod==0 and side=='L':
                record=json.loads((OLD/'interface-candidate/cuff-rebuild-report.json').read_text())['records'][side]['bodies'][o.name]
                indexmap={i:k for k,i in enumerate(ids) if i>=0}
                rim,edges,parts=complete_boundary(m,{indexmap[i] for i in record['terminal_indices']},False)
                degrees=Counter(i for edge in edges for i in edge)
                assert len(parts)==1 and all(d==2 for d in degrees.values())
                cap=[points[i] for i in rim]+[points[i].lerp(points[j],t) for i,j in edges for t in (.25,.5,.75)]
                assert all(ids[i]>=0 for i in rim)
                regional=[];seam_edges=[];nonmanifold=[]
            else:
                regional=[v for v in bm.verts if v[mark]==code]
                assert regional,'No repair region'
                # This checks every incident edge and face fan, including the
                # junction with the retained body, not just a reported rim.
                seam_edges=list({e for v in regional for e in v.link_edges if e.is_boundary})
                nonmanifold=[v.index for v in regional if not v.is_manifold]
                patch_layer=bm.faces.layers.int.get('WristRepairFace')
                patch_faces=[f for f in bm.faces if f[patch_layer]==code]
                assert all(e.is_manifold for f in patch_faces for e in f.edges),('Unsealed new strip',lod,side)
                assert min(f.calc_area() for f in patch_faces)>1e-12,('Zero area new face',lod,side)
                if seam_edges or nonmanifold:
                    failures.append({'lod':lod,'side':side,'reason':'Full junction still includes inherited proximal source boundary edges','edges':len(seam_edges),'nonmanifold_vertices':nonmanifold})
                rim={v.index for v in bm.verts if v[terminal]==code}
                edges=[tuple(e.vertices) for e in m.edges if set(e.vertices)<=rim]
                cap=[points[i] for i in rim]+[points[i].lerp(points[j],t) for i,j in edges for t in (.25,.5,.75)]
                cap.extend(sum((points[i] for i in tri),Vector())/3 for tri in triangles if set(tri)<=rim)
                for i in rim:
                    w={o.vertex_groups[g.group].name:g.weight for g in m.vertices[i].groups}
                    assert w=={'Hand_'+side:1.0},('Terminal must follow glove rigidly',lod,side,w)
            hp,ht,_=evaluated(bpy.data.objects['OriginalCrossbowClosedGrip_'+side]);values=[abs(winding(p,hp,ht)) for p in cap]
            assert min(values)>.9,('Terminal escapes glove',lod,side,min(values))
            for v in regional:
                w={o.vertex_groups[g.group].name:g.weight for g in m.vertices[v.index].groups}
                assert set(w)<={part+'_'+side for part in ('UpperArm','Forearm','Hand')} and abs(sum(w.values())-1)<1e-5
            rows.append({'lod':lod,'side':side,'repair_vertices':len(regional),'terminal_vertices':len(rim),'containment_samples':len(cap),'minimum_abs_winding':min(values),'terminal_containment_pass':True,'new_strip_closed':True,'full_junction_closed':not seam_edges and not nonmanifold,'inherited_proximal_boundary_edges':[{'vertices':[v.index for v in e.verts],'world':[list(points[v.index]) for v in e.verts]} for e in seam_edges]})
        bm.free()
    result={'pass':not failures,'failures':failures,'source_sha256':hashlib.sha256((RUN/'candidate/original-crossbow-grip.blend').read_bytes()).hexdigest(),'preserved':['20 bind matrices','all original animation curves','all weapon and glove data','every retained original vertex and weight','every intact original face UV and material','complete original LOD0 left wrist'],'preservation':preservation,'rows':rows,'runtime_publish_allowed':False}
    (RUN/'qa/topology-preservation.json').write_text(json.dumps(result,indent=2)+'\n');print('WRIST_TOPOLOGY',json.dumps(result))
    assert result['pass'],'Complete surface gate remains failed; see inherited junction seams'

if __name__=='__main__':main()
