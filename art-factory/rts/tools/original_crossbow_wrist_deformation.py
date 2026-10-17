"""Measure the complete new sleeve surface through all five authored clips."""
import bpy,hashlib,json,sys
from pathlib import Path
from mathutils import Vector
sys.path.insert(0,str(Path(__file__).parent))
from original_crossbow_wrist_topology_probe import RUN
from original_crossbow_wrist_topology_verify import pose
from original_crossbow_interface_probe import evaluated,winding

def main():
    global RUN
    if '--run' in sys.argv:RUN=Path(sys.argv[sys.argv.index('--run')+1]).resolve()
    source=RUN/'candidate/original-crossbow-grip.blend';source_sha256=hashlib.sha256(source.read_bytes()).hexdigest()
    bpy.ops.wm.open_mainfile(filepath=str(source))
    rig=bpy.data.objects['crossbowRig20'];pose(rig);rows=[];containment=[]
    for lod in (0,1):
        pose(rig,'Idle',0)
        body=bpy.data.objects[f'crossbowOriginalBody_LOD{lod}'];m=body.data
        marks=[d.value for d in m.attributes['WristRepairSide'].data];term=[d.value for d in m.attributes['WristTerminalSide'].data]
        initial,tris,_=evaluated(body);patch=[tri for tri in tris if marks[tri[0]] and len({marks[i] for i in tri})==1]
        edges={tuple(sorted((a,b))) for tri in patch for a,b in zip(tri,tri[1:]+tri[:1])}
        refarea=[(initial[t[1]]-initial[t[0]]).cross(initial[t[2]]-initial[t[0]]).length*.5 for t in patch]
        lengths={e:(initial[e[1]]-initial[e[0]]).length for e in edges}
        assert min(refarea)>1e-12,'Initial patch has zero-area triangle'
        for side,code in [('R',1),('L',2)]:
            if code not in term:continue
            glove=bpy.data.objects['OriginalCrossbowClosedGrip_'+side]
            assert all(len(v.groups)==1 and glove.vertex_groups[v.groups[0].group].name=='Hand_'+side and abs(v.groups[0].weight-1)<1e-6 for v in glove.data.vertices),'Glove is not rigid to its hand'
            assert all(len(v.groups)==1 and body.vertex_groups[v.groups[0].group].name=='Hand_'+side and abs(v.groups[0].weight-1)<1e-6 for v in m.vertices if term[v.index]==code),'Cap does not share glove skin transform'
            # Rigid shared transform preserves containment at every time, not
            # merely sampled frames. Also independently sample each clip end.
            for clip in ('Idle','Walk','Attack','Hurt','Death'):
                pose(rig,clip,0)
                frame=round(bpy.data.actions[clip].frame_range[1]);pose(rig,clip,frame)
                points,_,_=evaluated(body);hp,ht,_=evaluated(glove)
                samples=[points[i] for i,c in enumerate(term) if c==code]
                minimum=min(abs(winding(p,hp,ht)) for p in samples)
                containment.append({'lod':lod,'side':side,'clip':clip,'frame':frame,'samples':len(samples),'minimum_abs_winding':minimum})
        for clip in ('Idle','Walk','Attack','Hurt','Death'):
            pose(rig,clip);end=round(bpy.data.actions[clip].frame_range[1]);minimum_area=100;min_ratio=100;max_ratio=0;min_edge=100;max_edge=0
            for n in range(end*2+1):
                frame=n/2;pose(rig,clip,frame);points,_,_=evaluated(body)
                for tri,reference in zip(patch,refarea):
                    a,b,c=[points[i] for i in tri];area=(b-a).cross(c-a).length*.5
                    minimum_area=min(minimum_area,area);min_ratio=min(min_ratio,area/reference);max_ratio=max(max_ratio,area/reference)
                for (i,j),reference in lengths.items():
                    ratio=(points[i]-points[j]).length/reference;min_edge=min(min_edge,ratio);max_edge=max(max_edge,ratio)
            rows.append({'lod':lod,'clip':clip,'poses':end*2+1,'patch_triangles':len(patch),'minimum_area_m2':minimum_area,'area_ratio':[min_ratio,max_ratio],'edge_length_ratio':[min_edge,max_edge],
                'pass':minimum_area>1e-12 and min_ratio>.10 and max_ratio<4 and min_edge>.25 and max_edge<2})
    result={'pass':all(r['pass'] for r in rows) and all(c['minimum_abs_winding']>.9 for c in containment),'scope':'Original source sleeve triangle area and edge distortion; rigid cap/glove containment. Does not prove no self intersections, good UVs, or closed inherited proximal seams.','rows':rows,'cap_containment':containment,'runtime_publish_allowed':False}
    assert hashlib.sha256(source.read_bytes()).hexdigest()==source_sha256,'Source changed during verification'
    result['source_sha256']=source_sha256
    (RUN/'qa/wrist-deformation.json').write_text(json.dumps(result,indent=2)+'\n');print('WRIST_DEFORMATION',json.dumps({'pass':result['pass'],'rows':rows}));assert result['pass']

if __name__=='__main__':main()
