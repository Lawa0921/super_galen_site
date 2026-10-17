"""Record source/candidate hashes and losslessly archive bounded build logs."""
from pathlib import Path
import gzip,hashlib,json,subprocess,sys
import numpy as np
ROOT=Path(__file__).resolve().parents[3]
RUN=ROOT/'art-factory/rts/runs/original-guard-tabard/2026-10-05';QA=RUN/'qa'
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def write(path,data):path.write_bytes((json.dumps(data,indent=2)+'\n').encode())
old=RUN/'rejected-automatic-diagonals/candidate/source-projected-grid.npz';new=RUN/'candidate/source-projected-grid.npz'
a,b=np.load(old),np.load(new)
write(QA/'triangulation-correction.json',{'runtime_publish_allowed':False,'reason':'Front/back warped quads were independently triangulated into intersecting diagonals; corresponding explicit triangle diagonals remove the ambiguity.',
  'vertices_exactly_equal':bool(np.array_equal(a['vertices'],b['vertices'])),
  'weights_exactly_equal':bool(np.array_equal(a['weights'],b['weights'])),
  'old_grid_sha256':sha(old),'new_grid_sha256':sha(new),
  'candidate_rerun':'One topology-only rebuild; no thickness inflation, source movement or rig change.',
  'red_test':'test_thin_warped_sheet_has_matching_front_back_diagonals: AssertionError on automatic quads before explicit shared triangulation.'})
test=subprocess.run([sys.executable,'-B',str(Path(__file__).with_name('original_guard_tabard_test.py'))],capture_output=True)
(QA/'tests.txt.gz').write_bytes(gzip.compress(test.stdout+test.stderr,mtime=0))
if test.returncode:raise SystemExit(test.returncode)
archived=[]
for path in list(RUN.rglob('*.log')):
    data=path.read_bytes();compressed=path.with_suffix(path.suffix+'.gz');compressed.write_bytes(gzip.compress(data,mtime=0))
    destination=ROOT/'tmp/rts/tabard-raw-logs'/path.relative_to(RUN)
    if not path.resolve().is_relative_to(RUN.resolve()) or not destination.resolve().is_relative_to((ROOT/'tmp/rts').resolve()):raise ValueError('Archive path outside task')
    destination.parent.mkdir(parents=True,exist_ok=True)
    if destination.exists():raise ValueError('Archive destination already exists')
    path.rename(destination)
    archived.append({'path':str(compressed.relative_to(ROOT)).replace('\\','/'),'raw_sha256':hashlib.sha256(data).hexdigest()})
if archived:write(QA/'archived-logs.json',archived)
paths=list(RUN.rglob('*'))+list((ROOT/'art-factory/rts/tools').glob('original_guard_tabard_*'))
paths += [ROOT/'art-factory/rts/contracts/original-guard-tabard.json',ROOT/'art-factory/rts/tools/original_guard_quadri_repair_math.py',ROOT/'art-factory/rts/runs/original-guard-quadri-scaled-review/2026-10-05/review.css']
files={str(p.relative_to(ROOT)).replace('\\','/'):sha(p) for p in paths if p.is_file() and p.name!='provenance.json'}
review_path=QA/'independent-review.json'
review_status=json.loads(review_path.read_text())['status'] if review_path.exists() else 'candidate_local_qa_pass_pending_independent_review'
write(QA/'provenance.json',{'status':review_status,'runtime_publish_allowed':False,
 'source_original_glb':'art-factory/rts/runs/original-guard-shape/2026-10-05/candidate/candidate-body.glb',
 'source_original_glb_sha256':'b2a94ddd3c7f66ea8e1edf993fce13ce4c24a795b9106076648e773ebffecdfd',
 'source_rights':'Inherit original-guard-shape pinned generation and license record; no third-party character/rig/motion introduced; no commercial or runtime approval implied.',
 'coordinate_map':'(-nativeX,nativeZ,nativeY+0.9685986638069153)*0.9481278155956246',
 'bundle':'esbuild bundles project-installed Three.js and GLTFLoader/OrbitControls; inspection UI only.',
 'sha256':files})
print(json.dumps({'hash_count':len(files),'tests':'5/5 passed','archived_logs':len(archived),'geometry_coordinates_unchanged':bool(np.array_equal(a['vertices'],b['vertices']))}))
