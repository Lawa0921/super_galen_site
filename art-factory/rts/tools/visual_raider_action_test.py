"""Require a readable whole-body axe attack with planted support feet."""
import argparse,json,sys
from pathlib import Path
import bpy,numpy as np
from mathutils import Vector
sys.path.insert(0,str(Path(__file__).parent))
import procedural_gauntlet_build as g
from visual_knight_motion_test import positions

p=argparse.ArgumentParser();p.add_argument('--source',type=Path,required=True);p.add_argument('--report',type=Path,required=True)
a=p.parse_args(sys.argv[sys.argv.index('--')+1:]);bpy.ops.wm.open_mainfile(filepath=str(a.source.resolve()));rig=next(o for o in bpy.data.objects if o.type=='ARMATURE')
weapon=bpy.data.objects['RaiderShortAxe_LOD0'];body=bpy.data.objects['neutral-raiderOriginalBody_LOD0'];height=max(v.co.z for v in body.data.vertices)
steel={v for poly in weapon.data.polygons if any(x in weapon.data.materials[poly.material_index].name.lower() for x in ('steel','iron')) for v in poly.vertices};assert steel,'Missing original forged axe head'
g.set_action(rig,'Attack');bpy.context.scene.frame_set(0);feet={s:rig.pose.bones['Foot_'+s].matrix.copy() for s in 'LR'};original=positions(weapon);maxfoot=0;poses={}
wrist=Vector((.393500000238,.027882000431,.971826970577))
for frame in np.linspace(0,40,161):
    bpy.context.scene.frame_set(int(frame),subframe=float(frame%1))
    for side in 'LR':maxfoot=max(maxfoot,max(abs(rig.pose.bones['Foot_'+side].matrix[i][j]-feet[side][i][j]) for i in range(4) for j in range(4)))
    if frame in (6,13):
        points=positions(weapon);fore=rig.pose.bones['Forearm_R'];w=fore.matrix@fore.bone.matrix_local.inverted()@wrist
        poses[int(frame)]={'steel_max_z':float(points[list(steel),2].max()),'steel_max_y':float(points[list(steel),1].max()),'wrist_z':w.z,'spine_y':rig.pose.bones['SpineUpper'].head.y}
recovery=float(np.linalg.norm(positions(weapon)-original,axis=1).max());failures=[]
if poses[6]['steel_max_z']<height+.20:failures.append('Wind-up steel blade must visibly clear the head by 20 cm')
if poses[6]['wrist_z']<height*.80:failures.append('Wind-up must lift the hand, not merely stand the axe upright at the waist')
if poses[13]['steel_max_y']<.70:failures.append('Strike must extend the axe head ahead of the body silhouette')
if poses[13]['spine_y']-poses[6]['spine_y']<.10:failures.append('Torso does not participate in anticipation and strike')
if maxfoot>.003:failures.append('Supporting feet slide or rotate during the attack')
if recovery>.015:failures.append('Attack does not recover to its original carry pose')
report={'source':str(a.source),'keyposes':poses,'maximum_foot_matrix_error':maxfoot,'recovery_distance_m':recovery,'failures':failures,'artistic_quality_proven':False}
a.report.parent.mkdir(parents=True,exist_ok=True);a.report.write_text(json.dumps(report,indent=2)+'\n');print(json.dumps(report));assert not failures,'; '.join(failures)
