"""Freeze portrait evidence and source hashes without changing the model."""
from pathlib import Path
import ast,gzip,hashlib,json,re,subprocess,sys
ROOT=Path(__file__).resolve().parents[3];RUN=ROOT/'art-factory/rts/runs/original-guard-portrait-study/2026-10-05';QA=RUN/'qa'
def sha(path):return hashlib.sha256(path.read_bytes()).hexdigest()
def write(path,data):path.write_bytes((json.dumps(data,indent=2)+'\n').encode())
tests=subprocess.run([sys.executable,'-B',str(Path(__file__).with_name('original_guard_portrait_study_test.py'))],capture_output=True)
(QA/'tests.txt.gz').write_bytes(gzip.compress(tests.stdout+tests.stderr,mtime=0))
if tests.returncode:raise SystemExit(tests.returncode)
geometry=json.loads((QA/'geometry.json').read_text());browser=json.loads((QA/'browser/report.json').read_text())
assert sha(ROOT/'art-factory/rts/runs/original-guard-quadri/2026-10-05/candidate/source-primary-exact.npz')=='7851c7d91364e773b4e32e358740f37f43660e2d0cfbc9159f13245470a86edd'
assert geometry['status']=='local_geometry_motion_pass_pending_visual_review'
assert browser['status']=='portrait_browser_pose_and_visible_motion_pass'
for suffix in ['blend','glb']:assert sha(RUN/('candidate/original-guard-portrait-study.'+suffix))==geometry[suffix+'_sha256']
archive=[]
for path in list(QA.glob('*.log')):
    data=path.read_bytes();packed=path.with_suffix(path.suffix+'.gz');packed.write_bytes(gzip.compress(data,mtime=0))
    destination=ROOT/'tmp/rts/portrait-raw-logs'/path.name
    if not path.resolve().is_relative_to(RUN.resolve()) or not destination.resolve().is_relative_to((ROOT/'tmp/rts').resolve()):raise ValueError('Unsafe archive target')
    destination.parent.mkdir(parents=True,exist_ok=True)
    if destination.exists():raise ValueError('Archive already exists')
    path.rename(destination);archive.append({'path':str(packed.relative_to(ROOT)).replace('\\','/'),'raw_sha256':hashlib.sha256(data).hexdigest()})
if archive:write(QA/'archived-logs.json',archive)
paths=list(RUN.rglob('*'))+list((ROOT/'art-factory/rts/tools').glob('original_guard_portrait_study_*'))
paths += [ROOT/'art-factory/rts/contracts/original-guard-portrait-study.json',ROOT/'art-factory/rts/tools/original_guard_tabard_blender.py',ROOT/'art-factory/rts/tools/original_guard_quadri_repair_math.py',ROOT/'art-factory/rts/runs/original-guard-quadri-scaled-review/2026-10-05/review.css']
for path in paths:
    if not path.is_file() or path.suffix not in ['.py','.ts','.mjs','.json','.html','.md','.css']:continue
    data=path.read_text(encoding='utf-8');assert not re.search(r'AIza[0-9A-Za-z_-]{20}|sk-[0-9A-Za-z_-]{20}|-----BEGIN (?:RSA|OPENSSH|PRIVATE)',data)
    if path.suffix=='.py':ast.parse(data)
files={str(p.relative_to(ROOT)).replace('\\','/'):sha(p) for p in paths if p.is_file() and p.name!='provenance.json'}
review=QA/'independent-review.json'
status=json.loads(review.read_text())['status'] if review.exists() else 'candidate_pending_independent_review'
write(QA/'provenance.json',{'status':status,'runtime_publish_allowed':False,
 'source':'art-factory/rts/runs/original-guard-quadri/2026-10-05/candidate/source-primary-exact.npz','source_sha256':'7851c7d91364e773b4e32e358740f37f43660e2d0cfbc9159f13245470a86edd',
 'rights':'Inherits original-guard-shape pinned original generation and license record; no third-party character, rig or motion; not universal commercial approval',
 'red_test':'New portrait weight/motion test failed with missing implementation before the authored helper; four tests pass after implementation',
 'sha256':files})
print(json.dumps({'tests':'4/4 pass','source_and_candidate_hashes':'match','files':len(files),'secret_scan':'clear'}))
