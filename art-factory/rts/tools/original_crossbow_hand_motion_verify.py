"""Source shot preservation and authored recovery continuity at 1/8 frame."""
import bpy,json,hashlib,sys,math
from pathlib import Path
sys.path.insert(0,str(Path(__file__).parent))
from original_crossbow_attack_probe import activate
from original_glove_deformation import evaluated
ROOT=Path(__file__).resolve().parents[3];RUN=ROOT/'art-factory/rts/runs/original-crossbow-articulated-hand/2026-10-07-v1'
SOURCE=ROOT/'art-factory/rts/runs/original-crossbow-attack/2026-10-06-v1/candidate/original-crossbow-grip.blend';FINAL=RUN/'candidate/articulated-connector.blend'
bpy.ops.wm.open_mainfile(filepath=str(SOURCE));rig=bpy.data.objects['crossbowRig20'];names=[b.name for b in rig.data.bones if b.name not in ['Shoulder_L','UpperArm_L','Forearm_L','Hand_L']];original={}
for sample in range(161):
    f=sample/8;activate(rig,'Attack',f);original[f]={'bones':{n:rig.pose.bones[n].matrix.copy() for n in names},'weapon':evaluated(bpy.data.objects['CrossbowWeapon_LOD0'])[0],'right_hand':evaluated(bpy.data.objects['OriginalCrossbowClosedGrip_R'])[0]}
bpy.ops.wm.open_mainfile(filepath=str(FINAL));rig=bpy.data.objects['crossbowRig20'];matrix_error=weapon_error=right_error=0.;speed=angle_speed=0.;recovery_speed=recovery_angle=0.;previous=None;dt=1/(24*8);worst=None
for sample in range(321):
    f=sample/8;activate(rig,'Attack',f);wp=evaluated(bpy.data.objects['CrossbowWeapon_LOD0'])[0];matrices={p.name:p.matrix.copy() for p in rig.pose.bones}
    if f in original:
        expected=original[f];matrix_error=max(matrix_error,max(abs(matrices[n][i][j]-m[i][j]) for n,m in expected['bones'].items() for i in range(4) for j in range(4)))
        weapon_error=max(weapon_error,max((p-q).length for p,q in zip(wp,expected['weapon'])))
        right_error=max(right_error,max((p-q).length for p,q in zip(evaluated(bpy.data.objects['OriginalCrossbowClosedGrip_R'])[0],expected['right_hand'])))
    if previous:
        v=max((p-q).length/dt for p,q in zip(wp,previous[0]))
        angles=[m.to_quaternion().rotation_difference(previous[1][n].to_quaternion()).angle for n,m in matrices.items()]
        a=max(math.degrees(min(angle,abs(math.tau-angle)))/dt for angle in angles)
        if v>speed:speed=v;worst=f
        angle_speed=max(angle_speed,a)
        if f>=36:recovery_speed=max(recovery_speed,v);recovery_angle=max(recovery_angle,a)
    previous=(wp,matrices)
report={'source_sha256':hashlib.sha256(SOURCE.read_bytes()).hexdigest(),'candidate_sha256':hashlib.sha256(FINAL.read_bytes()).hexdigest(),'preserved_shot_samples':161,'preserved_non_left_arm_bones':names,'shot_matrix_error':matrix_error,'shot_weapon_surface_error_m':weapon_error,'shot_right_hand_surface_error_m':right_error,'attack_samples':321,'max_weapon_speed_m_s':speed,'worst_weapon_frame':worst,'max_bone_angular_speed_deg_s':angle_speed,'recovery_36_to_40_max_weapon_speed_m_s':recovery_speed,'recovery_36_to_40_max_bone_angular_speed_deg_s':recovery_angle,'pass':matrix_error<1e-5 and weapon_error<1e-5 and right_error<1e-5 and speed<5.76 and recovery_angle<720,'scope':'Source aim/shot through frame20 preserved outside left arm; the newly authored hold/recovery has no sampled speed discontinuity. This does not validate mechanical reloading or general animation acting.','runtime_publish_allowed':False}
(RUN/'qa/motion.json').write_text(json.dumps(report,indent=2)+'\n');print('MOTION',json.dumps(report));assert report['pass']
