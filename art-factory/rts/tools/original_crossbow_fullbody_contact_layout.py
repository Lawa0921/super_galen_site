"""Compare authored rigid grasp frames, preserving arm lengths and all contact paths."""
import bpy,json,sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).parent))
from original_crossbow_fullbody_build import SOURCE,RUN,capture,author_motion
from original_crossbow_fullbody_props import add_equipment
from original_crossbow_attack_probe import activate
bpy.ops.wm.open_mainfile(filepath=str(SOURCE));rig=bpy.data.objects['crossbowRig20']
original=capture(rig);activate(rig,'Idle',0);add_equipment(rig)
for frames in original.values():
    for matrices in frames.values():
        for name in ('LeverUpper','LeverLink','LeverHandle','QuiverRoot','LeftInteraction'):matrices[name]=rig.data.bones[name].matrix_local.copy()
rows=[]
if '--fold' in sys.argv:
    for angle in range(-90,151,30):
        report=author_motion(rig,original,dry_run=True,fold_roll=angle)
        rows.append({'fold_roll':angle,'unreachable':len(report['unreachable']),'max_bend':report['max_wrist_bend'],
                     'worst':max(report['wrist'],key=lambda r:r['bend_degrees'])})
    rows.sort(key=lambda r:(r['unreachable'],r['max_bend']))
    (RUN/'qa/fold-contact-layout.json').write_text(json.dumps(rows,indent=2)+'\n',newline='\n')
    print('FOLD_LAYOUT',json.dumps(rows[:3]));raise SystemExit(0)
for tilt in (0,20,40,60,80):
    for bolt in range(-120,121,30):
        handle=30
        report=author_motion(rig,original,handle,bolt,dry_run=True,bolt_tilt=tilt)
        row={'handle_roll':handle,'bolt_roll':bolt,'bolt_tilt':tilt,'unreachable':len(report['unreachable']),
             'max_bend':report['max_wrist_bend'],'phases':{str(a):max((r['bend_degrees'] for r in report['wrist'] if a<=r['frame']<=b),default=180) for a,b in [(0,20),(20,46),(46,50),(50,62),(62,72)]}}
        rows.append(row)
best=sorted(rows,key=lambda r:(r['unreachable'],r['max_bend']))
(RUN/'qa/contact-layout.json').write_text(json.dumps({'best':best[:12],'all':rows},indent=2)+'\n',newline='\n')
print('CONTACT_LAYOUT',json.dumps(best[:6]))
