"""Independent saved-file splice velocities and actual strike geometry."""
import hashlib
import json
import math
import sys
from pathlib import Path

import bpy
import numpy as np
from mathutils import Quaternion

sys.dont_write_bytecode=True
sys.path.insert(0,str(Path(__file__).parent))
from guard_attack_author import RUN, SOURCE, SOURCE_SHA, PARTS


def angular(a,b,dt):
    q=(b.to_quaternion() @ a.to_quaternion().inverted()).normalized()
    if q.w<0:q.negate()
    v=np.array([q.x,q.y,q.z],float);length=np.linalg.norm(v)
    return np.zeros(3) if length<1e-12 else v/length*(2*math.atan2(length,q.w)/dt)


def main(*, run=RUN, source=SOURCE, source_sha=SOURCE_SHA, boundaries=(9.,18.)):
    RUN, SOURCE, SOURCE_SHA = run, source, source_sha
    info=json.loads((RUN/'qa/authoring.json').read_text(encoding='utf-8'))
    sources=[('before',SOURCE,SOURCE_SHA),('after',RUN/'candidate/guard-authored-attack.blend',info['candidate_sha256'])]
    rows,geometry={},{}
    for label,path,expected in sources:
        assert hashlib.sha256(path.read_bytes()).hexdigest()==expected
        bpy.ops.wm.open_mainfile(filepath=str(path))
        rig,scene=bpy.data.objects['GuardRig20'],bpy.context.scene
        rig.animation_data.action=bpy.data.actions['Attack']
        rows[label]=[]
        for boundary in boundaries:
            for h in (1/16,1/32,1/64,1/128):
                poses=[]
                for frame in (boundary-h,boundary,boundary+h):
                    scene.frame_set(math.floor(frame),subframe=frame%1)
                    poses.append({n:rig.pose.bones[n].matrix.copy() for n in PARTS})
                for name in PARTS:
                    left=np.array(poses[1][name].translation-poses[0][name].translation)/(h/30)
                    right=np.array(poses[2][name].translation-poses[1][name].translation)/(h/30)
                    al=angular(poses[0][name],poses[1][name],h/30)
                    ar=angular(poses[1][name],poses[2][name],h/30)
                    rows[label].append({'boundary':boundary,'step_frames':h,'bone':name,'left_velocity_m_s':left.tolist(),'right_velocity_m_s':right.tolist(),
                                        'velocity_difference_m_s':float(np.linalg.norm(right-left)),
                                        'left_angular_velocity_rad_s':al.tolist(),'right_angular_velocity_rad_s':ar.tolist(),
                                        'angular_velocity_difference_rad_s':float(np.linalg.norm(ar-al))})
        scene.frame_set(16)
        geometry[label]={}
        for lod in (0,1):
            for part in ('KingdomSteelSword','GuardHandGrip_R'):
                name=f'{part}_LOD{lod}'
                obj=bpy.data.objects[name].evaluated_get(bpy.context.evaluated_depsgraph_get())
                mesh=obj.to_mesh()
                geometry[label][name]=np.array([obj.matrix_world@v.co for v in mesh.vertices])
                obj.to_mesh_clear()
    errors={n:float(np.linalg.norm(geometry['before'][n]-geometry['after'][n],axis=1).max()) for n in geometry['before']}
    assert max(errors.values())<=.00005,errors
    report={'status':'saved_file_splice_velocity_diagnostic_strike_geometry_verified','runtime_publish_allowed':False,
            'source_sha256':SOURCE_SHA,'candidate_sha256':info['candidate_sha256'],'contact_frame':16,
            'actual_contact_geometry_max_errors_m':errors,'finite_difference_rows':rows,
            'limitations':['One-sided finite differences include source curvature, key kinks and float32 pose noise; inspect convergence and playback, not equality to zero.',
                           'Contact pose preservation does not approve the new swing path or armor geometry.']}
    (RUN/'qa/splice-and-strike.json').write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8')
    print('CONTACT_GEOMETRY_ERROR',errors,flush=True)
    for label,rr in rows.items():
        print('SPLICE',label,[{k:r[k] for k in ('boundary','bone','velocity_difference_m_s','angular_velocity_difference_rad_s')} for r in rr if r['step_frames']==1/128],flush=True)


if __name__=='__main__':
    if '--attack-start' in sys.argv or '--exterior-tangent' in sys.argv:
        run = RUN.with_name('2026-10-08-v28-authored-attack-start-arc')
        if '--exterior-tangent' in sys.argv:
            run = RUN.with_name('2026-10-08-v29-attack-start-exterior-tangent')
        main(run=run, source=RUN/'candidate/guard-authored-attack.blend',
             source_sha='a57e17a559d60a3912b77d6e5cb6708e888a5e73181e2c5d5e517cb1af103c35', boundaries=(0.,4.))
    else:
        main()
