"""Verify local preservation and complete terminal containment in the actual glove."""
import bpy,json,sys,hashlib
from pathlib import Path
from mathutils import Vector
sys.path.insert(0,str(Path(__file__).parent))
from original_crossbow_interface_probe import ready,evaluated,winding,SOURCE,RUN,QA
from original_crossbow_cuff_boundary import complete_boundary

def digest(value):return hashlib.sha256(json.dumps(value,sort_keys=True).encode()).hexdigest()
def snapshot():
    objects={}
    for obj in bpy.data.objects:
        if obj.type!='MESH':continue
        objects[obj.name]={'vertices':[list(v.co) for v in obj.data.vertices],
            'topology':digest([list(p.vertices) for p in obj.data.polygons]),
            'uv':digest([list(v.uv) for layer in obj.data.uv_layers for v in layer.data]),
            'materials':digest([p.material_index for p in obj.data.polygons]),
            'weights':digest([[{obj.vertex_groups[g.group].name:g.weight} for g in v.groups] for v in obj.data.vertices])}
    rig=bpy.data.objects['crossbowRig20']
    bones=digest({b.name:[list(row) for row in b.matrix_local] for b in rig.data.bones})
    curves=digest({a.name:[(fc.data_path,fc.array_index,[(list(k.co),k.interpolation) for k in fc.keyframe_points]) for layer in a.layers for strip in layer.strips for slot in a.slots for bag in [strip.channelbag(slot)] if bag for fc in bag.fcurves] for a in bpy.data.actions})
    return objects,bones,curves

def main():
    bpy.ops.wm.open_mainfile(filepath=str(SOURCE));original,bind,curves=snapshot()
    folder=Path(sys.argv[sys.argv.index('--folder')+1]) if '--folder' in sys.argv else RUN/'interface-candidate'
    source=folder/'original-crossbow-grip.blend'
    report=json.loads((folder/'cuff-rebuild-report.json').read_text())
    bpy.ops.wm.open_mainfile(filepath=str(source));candidate,new_bind,new_curves=snapshot()
    assert bind==new_bind and curves==new_curves
    changes={}
    for name,old in original.items():
        new=candidate[name]
        for key in ('topology','uv','materials','weights'):assert old[key]==new[key],(name,key)
        changed={i for i,(a,b) in enumerate(zip(old['vertices'],new['vertices'])) if (Vector(a)-Vector(b)).length>1e-7}
        allowed=set()
        for side in ('R','L'):
            body=report['records'][side]['bodies'].get(name,{})
            allowed.update(v['index'] for v in body.get('changes',[]))
        assert changed<=allowed,(name,'Unlisted mesh change',changed-allowed)
        if changed:
            mesh=bpy.data.objects[name]
            for index in changed:
                vertex=mesh.data.vertices[index];old_point=Vector(old['vertices'][index])
                side='R' if old_point.x>0 else 'L';hand=bpy.data.objects['crossbowRig20'].data.bones['Hand_'+side]
                weights={mesh.vertex_groups[g.group].name:g.weight for g in vertex.groups}
                assert (old_point-hand.head_local).length<.22 and weights.get('Hand_'+side,0)+weights.get('Forearm_'+side,0)>.95,('Outside independent distal forearm ROI',name,index)
        changes[name]=len(changed)
    rig=bpy.data.objects['crossbowRig20'];ready(rig);containment=[]
    for side in ('R','L'):
        hp,ht,_=evaluated(bpy.data.objects['OriginalCrossbowClosedGrip_'+side])
        for name,record in report['records'][side]['bodies'].items():
            obj=bpy.data.objects[name];points,tris,_=evaluated(obj);ids,edges,components=complete_boundary(obj.data,set(record['terminal_indices']),require_closed=False)
            degrees={i:sum(i in edge for edge in edges) for i in ids}
            samples=[points[i] for i in ids]
            for i,j in edges:samples.extend(points[i].lerp(points[j],t) for t in (.25,.5,.75))
            for tri in tris:
                if set(tri)<=ids:
                    a,b,c=[points[i] for i in tri]
                    samples.extend([(a+b+c)/3,(a+b)/2,(a+c)/2,(b+c)/2])
            values=[winding(p,hp,ht) for p in samples]
            containment.append({'side':side,'body':name,'samples':len(samples),'boundary_vertices':len(ids),'boundary_edges':len(edges),'boundary_components':len(components),'branch_vertices':[i for i,d in degrees.items() if d!=2],'missing_report_vertices':len(ids-set(record['terminal_indices'])),'outside':sum(abs(w)<.9 for w in values),'min_abs_winding':min(abs(w) for w in values)})
    result={'source':str(source),'preserved':['body topology','UVs','material slots','all weights','20 bind bones','all 5 original curves','weapon and gloves geometry','vertices outside reported local cuff region'],
            'changed_vertices':changes,'terminal_containment':containment,'pass':all(r['outside']==0 and r['missing_report_vertices']==0 and not r['branch_vertices'] for r in containment),'runtime_publish_allowed':False}
    (QA/'cuff-preservation-containment.json').write_text(json.dumps(result,indent=2)+'\n');print('CUFF_VERIFY',json.dumps(result))
    assert result['pass'],'Terminal cap escapes the actual closed glove'
if __name__=='__main__':main()
