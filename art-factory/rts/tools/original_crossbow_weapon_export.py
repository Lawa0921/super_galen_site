"""Validate actual GLB pose parity and ground clearance for each authored LOD."""
import bpy
import hashlib
import json
from pathlib import Path
import sys
from mathutils.kdtree import KDTree

run=Path(sys.argv[sys.argv.index('--')+1]).resolve()
baseline='--geometry-baseline' in sys.argv
attack_subframes='--attack-subframes' in sys.argv
sample_rate=16 if attack_subframes else 4
folder=run/('geometry-candidate' if baseline else 'candidate')
file_hashes={p.name:hashlib.sha256(p.read_bytes()).hexdigest() for p in folder.iterdir() if p.suffix in ('.blend','.glb')}
bpy.ops.wm.open_mainfile(filepath=str(folder/'original-crossbow-grip.blend'))
rig=bpy.data.objects['crossbowRig20']
source_fps=bpy.context.scene.render.fps/bpy.context.scene.render.fps_base
def frame(f):
    bpy.context.scene.frame_set(int(f),subframe=f%1);bpy.context.view_layer.update()
def activate(rig,a):
    rig.animation_data.action=a;rig.animation_data.action_slot=a.slots[0]
    for track in rig.animation_data.nla_tracks:track.mute=True
def vertices(obj):
    e=obj.evaluated_get(bpy.context.evaluated_depsgraph_get());m=e.to_mesh()
    result=[e.matrix_world@v.co for v in m.vertices];e.to_mesh_clear();return result
def skin(rig):return {p.name:rig.matrix_world@p.matrix@p.bone.matrix_local.inverted() for p in rig.pose.bones}
weapons=[bpy.data.objects[f'CrossbowWeapon_LOD{lod}'] for lod in (0,1)]
rest={lod:[w.matrix_world@v.co for v in w.data.vertices] for lod,w in enumerate(weapons)}
sample={};floor={lod:100 for lod in (0,1)}
for name in (['Death'] if baseline else ['Attack'] if attack_subframes else ['Idle','Walk','Attack','Hurt','Death']):
    a=bpy.data.actions[name];activate(rig,a);sample[name]={}
    for i in range(round(a.frame_range[1]*sample_rate)+1):
        f=i/sample_rate;frame(f);positions={lod:vertices(w) for lod,w in enumerate(weapons)}
        for lod,pts in positions.items():floor[lod]=min(floor[lod],min(p.z for p in pts))
        if not baseline:sample[name][f]={'skin':skin(rig),'positions':positions}
if baseline:
    result={'scope':'Actual old Death, quarter-frame source evaluation, both LODs','minimum_weapon_z_m':floor,'pass':min(floor.values())>=.005}
    (run/'qa/death-ground-baseline.json').write_text(json.dumps(result,indent=2)+'\n');print(json.dumps(result))
    assert result['pass'],'Original Death drives the weapon below ground'
    raise SystemExit(0)
rows=[]
for lod in (0,1):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=str(folder/f'original-crossbow-grip-lod{lod}.glb'))
    rig=next(o for o in bpy.data.objects if o.type=='ARMATURE')
    weapon=next(o for o in bpy.data.objects if o.type=='MESH' and o.name.startswith('CrossbowWeapon_'))
    body=next(o for o in bpy.data.objects if o.type=='MESH' and 'Body' in o.name)
    rig.data.pose_position='REST';bpy.context.view_layer.update();points=vertices(weapon)
    tree=KDTree(len(rest[lod]))
    for i,p in enumerate(rest[lod]):tree.insert(p,i)
    tree.balance();mapping=[tree.find(p)[1] for p in points];rest_error=max(tree.find(p)[2] for p in points)
    rig.data.pose_position='POSE';bpy.context.view_layer.update()
    for name,poses in sample.items():
        a=next(a for a in bpy.data.actions if a.name==name or a.name.endswith('|'+name));activate(rig,a)
        record={'lod':lod,'clip':name,'samples':len(poses),'rest_max_error_m':rest_error,'matrix_max_error':0,'vertex_max_error_m':0,'minimum_weapon_z_m':100,'minimum_body_z_m':100,'max_sample_vertex_step_m':0}
        previous=None
        for f,expected in poses.items():
            frame(f);actual=skin(rig);points=vertices(weapon)
            assert actual.keys()==expected['skin'].keys()
            record['matrix_max_error']=max(record['matrix_max_error'],max(abs(matrix[i][j]-expected['skin'][name][i][j]) for name,matrix in actual.items() for i in range(4) for j in range(4)))
            record['vertex_max_error_m']=max(record['vertex_max_error_m'],max((p-expected['positions'][lod][mapping[i]]).length for i,p in enumerate(points)))
            record['minimum_weapon_z_m']=min(record['minimum_weapon_z_m'],min(p.z for p in points))
            body_low=min(p.z for p in vertices(body))
            record['minimum_body_z_m']=min(record['minimum_body_z_m'],body_low)
            if name=='Death':record['final_death_body_min_z_m']=body_low
            if previous:record['max_sample_vertex_step_m']=max(record['max_sample_vertex_step_m'],max((p-q).length for p,q in zip(points,previous)))
            previous=points
        record['max_vertex_speed_m_per_s']=record['max_sample_vertex_step_m']*sample_rate*source_fps
        rows.append(record)
# Preserve the previous 0.06 m per quarter frame limit at 24 FPS, independent
# of sampling density. A finer sample must never make a fast motion pass.
result={'source_minimum_weapon_z_m':floor,'rows':rows,'vertex_speed_limit_m_per_s':5.76,'pass':all(r['matrix_max_error']<.0001 and r['vertex_max_error_m']<.0001 and r['minimum_weapon_z_m']>.005 and r['max_vertex_speed_m_per_s']<5.76 and (r['clip']!='Death' or (r['minimum_body_z_m']>-.005 and r['final_death_body_min_z_m']<.01)) for r in rows)}
assert all(hashlib.sha256((folder/name).read_bytes()).hexdigest()==value for name,value in file_hashes.items()),'Candidate changed during verification'
result['candidate_files_sha256']=file_hashes
result['sample_step_frames']=1/sample_rate
(run/f'qa/{"attack-export-subframes" if attack_subframes else "actual-export-verification"}.json').write_text(json.dumps(result,indent=2)+'\n');print('WEAPON_EXPORT',json.dumps(result));assert result['pass']
