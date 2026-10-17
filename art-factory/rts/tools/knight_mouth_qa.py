"""Evaluate mouth contact and the two shared rein joints across every clip."""
import bpy,json,hashlib,sys
from mathutils import Vector
from mathutils.bvhtree import BVHTree
from pathlib import Path
ROOT=Path(__file__).resolve().parents[3]
RUN=ROOT/'art-factory/rts/runs/all-models/2026-10-15-knight-mouth'

def points(obj):
    e=obj.evaluated_get(bpy.context.evaluated_depsgraph_get());m=e.to_mesh()
    p=[e.matrix_world@v.co for v in m.vertices];f=[list(t.vertices) for t in m.polygons]
    e.to_mesh_clear();return p,f

def main():
    baseline='--baseline' in sys.argv;rows=[];files=[]
    for lod in (0,1):
        file=(ROOT/f'art-factory/rts/runs/all-models/2026-10-14-knight-v3/raw/knight-lod{lod}-repaired.blend') if baseline else RUN/f'raw/knight-lod{lod}.blend'
        bpy.ops.wm.open_mainfile(filepath=str(file))
        files.append({'lod':lod,'source':file.relative_to(ROOT).as_posix(),'sha256':hashlib.sha256(file.read_bytes()).hexdigest()})
        horse=next(o for o in bpy.context.scene.objects if o.type=='MESH' and o.name.startswith('NeuralWarhorse'))
        rein=next(o for o in bpy.context.scene.objects if o.type=='MESH' and o.name.startswith('LeatherRein'))
        rig=next(m.object for m in horse.modifiers if m.type=='ARMATURE')
        for clip in ('Idle','Walk','Attack','Hurt','Death'):
            for o in bpy.context.scene.objects:
                if o.animation_data:
                    o.animation_data.action=None
                    for t in o.animation_data.nla_tracks:t.mute=t.name!=clip
            strip=next(t for t in rig.animation_data.nla_tracks if t.name==clip).strips[0]
            for sample in range(31):
                frame=strip.frame_start+(strip.frame_end-strip.frame_start)*sample/30
                bpy.context.scene.frame_set(int(frame),subframe=frame-int(frame));bpy.context.view_layer.update()
                hp,hf=points(horse);tree=BVHTree.FromPolygons(hp,hf);rp,_=points(rein)
                centres=[sum(rp[i:i+6],Vector())/6 for i in range(0,48,6)]
                contact=[tree.find_nearest(centres[i])[3] for i in (0,4)]
                joints=[(centres[a]-centres[b]).length for a,b in ((1,2),(5,6))]
                rows.append({'lod':lod,'clip':clip,'fraction':sample/30,'contact_m':contact,'joint_gap_m':joints})
    failures=[r for r in rows if max(r['contact_m'])>.008 or max(r['joint_gap_m'])>1e-5]
    result={'status':'failed' if failures else 'passed','poses':len(rows),'mouth_contacts':len(rows)*2,'joint_checks':len(rows)*2,
            'max_mouth_distance_m':max(max(r['contact_m']) for r in rows),'max_joint_gap_m':max(max(r['joint_gap_m']) for r in rows),
            'files':files,'failures':failures,'rows':rows}
    path=RUN/f'qa/reins-{"red" if baseline else "final"}.json';path.write_text(json.dumps(result,indent=2),encoding='utf8')
    print(json.dumps({k:v for k,v in result.items() if k not in ('rows','failures','files')}),flush=True)
    assert not failures,'Reins detach from mouth or split at articulated joints'

if __name__=='__main__':main()
