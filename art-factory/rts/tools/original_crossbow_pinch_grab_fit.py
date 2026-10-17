"""Analytic axial grasp rotation, then bracketed root for wrist feasibility."""
import bpy, json, sys, math
from pathlib import Path
from mathutils import Matrix, Vector, Quaternion
sys.path.insert(0, str(Path(__file__).parent))
import original_crossbow_fullbody_build as build
from original_crossbow_fullbody_props import add_equipment, QUIVER_BOLT, DOWN
from original_crossbow_attack_probe import activate
from original_crossbow_pinch_surface_probe import RUN

build.RUN = RUN
layout = json.loads((RUN/'raw/pinch-layout.json').read_text())
bpy.ops.wm.open_mainfile(filepath=str(build.SOURCE))
rig = bpy.data.objects['crossbowRig20']; original = build.capture(rig)
activate(rig,'Idle',0); add_equipment(rig,layout['quiver_bolt_raise_m'])
for frames in original.values():
    for matrices in frames.values():
        for name in ('LeverUpper','LeverLink','LeverHandle','QuiverRoot','LeftInteraction'):
            matrices[name] = rig.data.bones[name].matrix_local.copy()
neutral = original['Idle'][0.]
pose = build.body_pose(rig,neutral,50.)
quiver = pose['Pelvis'] @ rig.data.bones['Pelvis'].matrix_local.inverted()
bolt = quiver @ Matrix.LocRotScale(QUIVER_BOLT+Vector((0,0,layout['quiver_bolt_raise_m'])),DOWN@Quaternion((0,1,0),math.pi),Vector((1,1,1)))
meta = json.loads(build.ANCHOR_PATH.read_text())
anchor = Matrix(meta['source_bones']['Hand_L']['matrix'])
grasp = build.contact(Vector((0,layout['bolt_contact_y'],0)),Quaternion((0,1,0),math.radians(120))@Quaternion((1,0,0),math.radians(40)),Vector(layout['contact_source']))
center = bolt @ Vector((0,layout['bolt_contact_y'],0))
wrist = (bolt @ grasp @ anchor).translation
axis = (bolt.to_3x3() @ Vector((0,1,0))).normalized()
r = wrist-center; r -= axis*r.dot(axis)
v = pose['UpperArm_L'].translation-center; v -= axis*v.dot(axis)
delta = math.degrees(math.atan2(axis.dot(r.cross(v)),r.dot(v)))
a = rig.data.bones['UpperArm_L'].length; b = rig.data.bones['Forearm_L'].length

def quality(roll):
    report = build.author_motion(rig, original, bolt_roll=roll, dry_run=True)
    samples = report['wrist']+[{'frame':r['frame'],'upper':r['upper'],'palm':r['target'],'direction':r['direction']} for r in report['unreachable'] if r['side']=='L']
    angles = []
    for row in samples:
        if not 49.75 <= row['frame'] <= 50.625: continue
        dvec = Vector(row['palm'])-Vector(row['upper']); d=dvec.length
        along = (d*d+a*a-b*b)/(2*d); height=math.sqrt(max(0,a*a-along*along))
        dot = dvec.normalized().dot(Vector(row['direction']))
        maximum_cosine = ((d-along)*dot+height*math.sqrt(max(0,1-dot*dot)))/b
        angles.append(math.degrees(math.acos(max(-1,min(1,maximum_cosine)))))
    return max(angles), report

start, _ = quality(120.)
end, end_report = quality(120.+delta)
assert end < 73., f'Analytic shoulder-facing grasp is infeasible: {end}'
lo, hi = 0., 1.
for _ in range(16):
    mid=(lo+hi)/2; value,_=quality(120.+delta*mid)
    if value>73.: lo=mid
    else: hi=mid
roll=120.+delta*hi
value, report=quality(roll)
result={'original_roll':120.,'analytic_delta':delta,'selected_roll':roll,'original_minimum_wrist_bend':start,
        'selected_minimum_wrist_bend':value,'unreachable':report['unreachable'],
        'method':'Analytic shoulder-facing axial rotation brackets a bisection root; no angular grid search. 73-degree minimum feasible bend leaves 2-degree authoring-cone reserve.',
        'runtime_publish_allowed':False}
(RUN/'qa/grasp-roll-fit.json').write_text(json.dumps(result,indent=2)+'\n',newline='\n')
print('GRASP_ROLL_FIT',json.dumps(result))
assert not report['unreachable'], 'A corrected grasp must remain reachable over the entire clip'
layout['bolt_roll_degrees']=roll
(RUN/'raw/pinch-layout.json').write_text(json.dumps(layout,indent=2)+'\n',newline='\n')
