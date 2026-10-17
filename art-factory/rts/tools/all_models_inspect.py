"""Read published character sources; record actual rig/mesh interfaces."""
import bpy,json,sys,hashlib
from pathlib import Path
from mathutils import Vector
ROOT=Path(__file__).resolve().parents[3];RUN=ROOT/'art-factory/rts/runs/all-models/2026-10-14-v1'
sys.path.insert(0,str(Path(__file__).parent))
import procedural_gauntlet_build as g
def main():
    registry=json.loads((ROOT/'art-factory/rts/manifests/unit-registry.json').read_bytes());out=[]
    for unit in ('worker','guard','crossbow'):
        row=next(r for r in registry['assets'] if r['id']==unit);p=ROOT/row['source'];bpy.ops.wm.open_mainfile(filepath=str(p));rig=next(o for o in bpy.data.objects if o.type=='ARMATURE')
        g.set_action(rig,'Idle');bpy.context.scene.frame_set(0);ref=g.skin_matrices(rig)
        record={'id':unit,'source':row['source'],'sha256':hashlib.sha256(p.read_bytes()).hexdigest(),'bones':{},'meshes':[]}
        for s in 'LR':
            for name in ('UpperArm_','Forearm_','Hand_'):
                b=rig.pose.bones[name+s];record['bones'][b.name]={'parent':b.parent.name if b.parent else None,'inherit_rotation':b.bone.use_inherit_rotation,'location':list(b.location),'rest_head':list(b.bone.head_local),'rest_tail':list(b.bone.tail_local),'idle_head':list(b.head),'idle_tail':list(b.tail)}
        for o in bpy.data.objects:
            if o.type!='MESH' or not o.name.endswith('LOD0'):continue
            m={'name':o.name,'materials':[a.name for a in o.data.materials],'vertices':len(o.data.vertices),'props':{k:o[k] for k in o.keys() if k not in ('rtsConservativeBounds',)}}
            if 'Body' in o.name:
                for s in 'LR':
                    group=o.vertex_groups.get('Hand_'+s);ids=[v.index for v in o.data.vertices if group and any(x.group==group.index and x.weight>.4 for x in v.groups)]
                    if ids:
                        pts=[o.data.vertices[i].co for i in ids];m['hand_'+s]={'count':len(ids),'minimum':[min(v[a] for v in pts) for a in range(3)],'maximum':[max(v[a] for v in pts) for a in range(3)]}
            record['meshes'].append(m)
        out.append(record)
    (RUN/'qa/interfaces.json').write_bytes((json.dumps(out,indent=2,default=list)+'\n').encode());print(json.dumps(out,default=list))
if __name__=='__main__':main()
