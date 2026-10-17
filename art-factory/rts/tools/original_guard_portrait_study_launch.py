"""Bounded hidden Blender source/rig generation for the portrait candidate."""
from pathlib import Path
import json,subprocess,time,sys
ROOT=Path(__file__).resolve().parents[3];QA=ROOT/'art-factory/rts/runs/original-guard-portrait-study/2026-10-05/qa';QA.mkdir(parents=True,exist_ok=True)
mode='render' if '--render' in sys.argv else 'blender'
script=Path(__file__).with_name('original_guard_portrait_study_'+mode+'.py')
with (QA/(mode+'-stdout.log')).open('wb') as out,(QA/(mode+'-stderr.log')).open('wb') as err:
    p=subprocess.Popen([r'C:/Program Files/Blender Foundation/Blender 5.2/blender.exe','--background','--factory-startup','--python',str(script)],cwd=ROOT,stdout=out,stderr=err,creationflags=subprocess.CREATE_NO_WINDOW)
report={'pid':p.pid,'started_epoch':time.time(),'script':str(script.relative_to(ROOT))};(QA/(mode+'-handle.json')).write_bytes((json.dumps(report,indent=2)+'\n').encode());print(json.dumps(report))
