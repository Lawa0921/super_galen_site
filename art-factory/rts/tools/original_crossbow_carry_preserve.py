"""Independent preservation check for the combined local source candidate."""
import bpy,json,sys,hashlib
from pathlib import Path
from mathutils import Vector
sys.path.insert(0,str(Path(__file__).parent))
from original_crossbow_interface_probe import RUN,SOURCE,QA
from original_crossbow_cuff_verify import snapshot

def curves():
    return {a.name:{(fc.data_path,fc.array_index):[(list(k.co),k.interpolation) for k in fc.keyframe_points] for layer in a.layers for strip in layer.strips for slot in a.slots for bag in [strip.channelbag(slot)] if bag for fc in bag.fcurves} for a in bpy.data.actions}

def weights():
    return {o.name:[{o.vertex_groups[g.group].name:g.weight for g in v.groups} for v in o.data.vertices] for o in bpy.data.objects if o.type=='MESH'}

def main():
    bpy.ops.wm.open_mainfile(filepath=str(SOURCE));old,bind,_=snapshot();old_curves=curves();old_weights=weights()
    source=RUN/'candidate/original-crossbow-grip.blend';bpy.ops.wm.open_mainfile(filepath=str(source))
    new,new_bind,_=snapshot();new_curves=curves();new_weights=weights();assert bind==new_bind
    seams=json.loads((RUN/'seam-candidate/shoulder-rebuild-report.json').read_text())['records']
    cuffs=json.loads((RUN/'interface-candidate/cuff-rebuild-report.json').read_text())['records'];records={}
    for name,before in old.items():
        after=new[name]
        for key in ('topology','uv','materials'):assert before[key]==after[key],(name,key)
        assert len(before['vertices'])==len(after['vertices'])
        moved={i for i,(a,b) in enumerate(zip(before['vertices'],after['vertices'])) if (Vector(a)-Vector(b)).length>1e-7}
        allowed_moves={v['index'] for record in cuffs.values() for v in record['bodies'].get(name,{}).get('changes',[])}
        assert moved<=allowed_moves,(name,'unexpected geometry',moved-allowed_moves)
        weighted={i for i,(a,b) in enumerate(zip(old_weights[name],new_weights[name])) if a!=b}
        allowed_weights={i for record in seams.get(name,[]) for i in record['indices']}
        assert weighted<=allowed_weights,(name,'unexpected weights',weighted-allowed_weights)
        for index in weighted:
            point=Vector(before['vertices'][index]);assert 1.18<point.z<1.66 and abs(point.x)<.40
            assert abs(sum(new_weights[name][index].values())-1)<1e-6 and len(new_weights[name][index])<=4
        records[name]={'position_changes':len(moved),'weight_changes':len(weighted)}
    arm_names={part+'_'+side for part in ('Shoulder','UpperArm','Forearm','Hand') for side in ('R','L')}
    action_rows={}
    for name,before in old_curves.items():
        after=new_curves[name];assert before.keys()==after.keys()
        changed=[key for key in before if before[key]!=after[key]];allowed=arm_names|({'Root'} if name=='Death' else set())
        assert all(any('"'+bone+'"' in key[0] for bone in allowed) for key in changed),(name,'unexpected non-arm curve')
        action_rows[name]={'changed_curves':len(changed),'allowed_bones':sorted(allowed)}
    result={'source_sha256':hashlib.sha256(source.read_bytes()).hexdigest(),'preserved':['20 bind bones','all topology, UVs and material assignment','weapon and glove geometry/weights','body outside local sleeve positions and shoulder seam weights','all non-arm animation except original Death Root revision','waist geometry and weights'],'objects':records,'actions':action_rows,'pass':True,'runtime_publish_allowed':False}
    (QA/'carry-preservation.json').write_text(json.dumps(result,indent=2)+'\n');print('CARRY_PRESERVATION',json.dumps(result))
if __name__=='__main__':main()
