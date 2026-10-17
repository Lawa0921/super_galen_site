"""Prove existing geometry and four non-Attack evaluated clips are retained."""
import bpy,json,hashlib,sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).parent))
from original_crossbow_fullbody_build import SOURCE,RUN
from original_crossbow_attack_probe import activate
def snapshot(path,names=None):
    bpy.ops.wm.open_mainfile(filepath=str(path));rig=bpy.data.objects['crossbowRig20']
    names=names or list(rig.pose.bones.keys());geometry={}
    for name in ('crossbowOriginalBody_LOD0','crossbowOriginalBody_LOD1','OriginalCrossbowArticulatedHand_L','OriginalCrossbowClosedGrip_R'):
        obj=bpy.data.objects[name];m=obj.data
        raw={'vertices':[list(v.co) for v in m.vertices],'faces':[list(p.vertices) for p in m.polygons],
             'weights':[[(obj.vertex_groups[g.group].name,g.weight) for g in v.groups] for v in m.vertices],
             'uv':[[list(x.uv) for x in layer.data] for layer in m.uv_layers]}
        geometry[name]=hashlib.sha256(json.dumps(raw,sort_keys=True).encode()).hexdigest()
    poses={}
    for clip in ('Idle','Walk','Hurt','Death'):
        end=round(activate(rig,clip).frame_range[1]);poses[clip]={}
        for k in range(end*8+1):
            f=k/8;activate(rig,clip,f)
            poses[clip][f]={n:[v for row in rig.pose.bones[n].matrix for v in row] for n in names}
    return names,geometry,poses
names,before,old=snapshot(SOURCE);_,after,new=snapshot(RUN/'candidate/complete-crossbow.blend',names)
errors={clip:max(abs(x-y) for f,pose in frames.items() for n,a in pose.items() for x,y in zip(a,new[clip][f][n])) for clip,frames in old.items()}
report={'source_sha256':hashlib.sha256(SOURCE.read_bytes()).hexdigest(),'candidate_sha256':hashlib.sha256((RUN/'candidate/complete-crossbow.blend').read_bytes()).hexdigest(),
        'geometry_equal':before==after,'geometry_hashes':after,'non_attack_world_matrix_max_errors':errors,
        'note':'Local curves of HandPalm_L and LoadedBolt changed because of the common contact driver. Evaluated original bone poses are compared instead.',
        'runtime_publish_allowed':False}
(RUN/'qa/preservation.json').write_text(json.dumps(report,indent=2)+'\n',newline='\n');print('FULLBODY_PRESERVATION',json.dumps(report))
assert before==after and max(errors.values())<.0001
