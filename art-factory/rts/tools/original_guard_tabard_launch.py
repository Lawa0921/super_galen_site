"""Run one hidden Blender build/render job; never open a visible terminal."""
from pathlib import Path
import json,subprocess,sys,time
ROOT=Path(__file__).resolve().parents[3]
QA=ROOT/'art-factory/rts/runs/original-guard-tabard/2026-10-05/qa'
QA.mkdir(parents=True,exist_ok=True)
mode='render' if '--render' in sys.argv else 'blender'
script=Path(__file__).with_name(f'original_guard_tabard_{mode}.py')
with (QA/f'{mode}-stdout.log').open('wb') as out,(QA/f'{mode}-stderr.log').open('wb') as err:
    p=subprocess.Popen([r'C:/Program Files/Blender Foundation/Blender 5.2/blender.exe','--background','--factory-startup','--python',str(script)],cwd=ROOT,stdout=out,stderr=err,creationflags=subprocess.CREATE_NO_WINDOW)
report={'pid':p.pid,'mode':mode,'started_epoch':time.time(),'script':str(script.relative_to(ROOT))}
(QA/f'{mode}-handle.json').write_bytes((json.dumps(report,indent=2)+'\n').encode())
print(json.dumps(report))
