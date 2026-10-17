"""Evaluate the authored Death action against the studio ground plane."""
import bpy
import json
from pathlib import Path

root=Path(__file__).resolve().parents[1]
run=root/'runs'/'guard-pilot'/'2026-10-04-revision-v2'
bpy.ops.wm.open_mainfile(filepath=str(run/'raw'/'dawnrealm-guard-pilot.blend'))
rig=bpy.data.objects['GuardRig']
for track in rig.animation_data.nla_tracks:track.mute=True
rig.animation_data.action=bpy.data.actions['Death']
bpy.context.scene.frame_set(40)
depsgraph=bpy.context.evaluated_depsgraph_get()
targets=('Helmet enclosed skull','Forged breastplate','Sabaton shaped leather sole -1',
         'Sabaton shaped leather sole 1','Longsword · tapered diamond blade')
result={}
for name in targets:
    obj=bpy.data.objects[name]
    evaluated=obj.evaluated_get(depsgraph)
    mesh=evaluated.to_mesh()
    zs=[(evaluated.matrix_world @ vert.co).z for vert in mesh.vertices]
    result[name]={'min_z_m':round(min(zs),4),'max_z_m':round(max(zs),4)}
    evaluated.to_mesh_clear()
report={'clip':'Death','frame':40,'ground_z_m':0.008,
        'root_pose_location':list(rig.pose.bones['Root'].location),
        'root_pose_rotation':list(rig.pose.bones['Root'].rotation_euler),
        'bounds_by_component':result,
        'helmet_ground_gap_m':round(result['Helmet enclosed skull']['min_z_m']-.008,4),
        'runtime_publish_allowed':False}
chest=result['Forged breastplate']['min_z_m']
report['ground_contact_pass']=(abs(chest-.008)<.035 and
    all(result[name]['min_z_m']>=-.015 for name in targets))
(run/'qa'/'death-contact.json').write_bytes((json.dumps(report,indent=2)+'\n').encode('utf-8'))
print('DEATH_CONTACT '+json.dumps(report))
if not report['ground_contact_pass']:
    raise SystemExit('Death pose penetrates or floats above the ground')
