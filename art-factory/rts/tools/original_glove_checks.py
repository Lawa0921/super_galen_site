"""Run the small source checks and retain their real exit codes and input hashes."""
import hashlib,json,os,shutil,subprocess,sys
from pathlib import Path
ROOT=Path(__file__).resolve().parents[3]
QA=ROOT/'art-factory/rts/runs/original-articulated-glove/2026-10-06-v1/qa'
commands=[
 ['geometry_regressions',[sys.executable,'art-factory/rts/tools/original_glove_geometry_test.py']],
 ['strict_review_typescript',[shutil.which('node'),'node_modules/typescript/bin/tsc','--noEmit','--strict','--target','ES2022','--module','ESNext','--moduleResolution','Bundler','--lib','ES2022,DOM,DOM.Iterable','--skipLibCheck','art-factory/rts/tools/original_glove_scene.ts']]
]
records=[]
for name,args in commands:
 result=subprocess.run(args,cwd=ROOT,capture_output=True,text=True,encoding='utf-8',creationflags=subprocess.CREATE_NO_WINDOW if os.name=='nt' else 0)
 records.append({'name':name,'command':args,'exit_code':result.returncode,'stdout':result.stdout,'stderr':result.stderr})
 print(name,result.returncode)
files=['original_glove_geometry.py','original_glove_geometry_test.py','original_glove_scene.ts']
report={'pass':all(r['exit_code']==0 for r in records),'checks':records,'source_sha256':{f:hashlib.sha256((Path(__file__).parent/f).read_bytes()).hexdigest() for f in files}}
(QA/'tool-verification.json').write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8',newline='\n')
sys.exit(0 if report['pass'] else 1)
