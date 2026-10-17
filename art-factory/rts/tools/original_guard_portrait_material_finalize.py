"""Freeze original material projection failures, source hashes and real-browser QA."""
from pathlib import Path
import ast,gzip,hashlib,json,re,subprocess,sys
ROOT=Path(__file__).resolve().parents[3]
RUN=ROOT/'art-factory/rts/runs/original-guard-portrait-material/2026-10-05';QA=RUN/'qa'


def sha(path):return hashlib.sha256(path.read_bytes()).hexdigest()


def main():
    result=subprocess.run([sys.executable,'-B',str(Path(__file__).with_name('original_guard_portrait_material_test.py'))],capture_output=True)
    (QA/'tests.txt.gz').write_bytes(gzip.compress(result.stdout+result.stderr,mtime=0))
    if result.returncode:sys.stdout.buffer.write(result.stdout+result.stderr);raise SystemExit(result.returncode)
    contract=json.loads((ROOT/'art-factory/rts/contracts/original-guard-portrait-material.json').read_text(encoding='utf-8'))
    geometry=json.loads((QA/'geometry.json').read_text(encoding='utf-8'));browser=json.loads((QA/'browser/report.json').read_text(encoding='utf-8'))
    if sha(ROOT/contract['source_blend'])!=contract['source_blend_sha256']:raise ValueError('Original Blend changed')
    if geometry['sampled_pose_max_difference_m']!=0:raise ValueError('Authored poses changed')
    for suffix in ['blend','glb']:
        if sha(RUN/('candidate/original-guard-portrait-material.'+suffix))!=geometry[suffix+'_sha256']:raise ValueError('Candidate mismatch')
    if browser['status']!='rejected_material_browser_pose_and_visible_motion_pass':raise ValueError('Browser did not pass')
    for asset in browser['assets']:
        if sha(ROOT/asset['route'].lstrip('/'))!=asset['sha256']:raise ValueError('Served reference differs')
    texture=json.loads((QA/'texture.json').read_text(encoding='utf-8'))
    for path,expected in texture['sources_sha256'].items():
        if sha(ROOT/path)!=expected:raise ValueError('Source art differs')
    for path in QA.glob('*.log'):
        data=path.read_bytes();path.with_suffix(path.suffix+'.gz').write_bytes(gzip.compress(data,mtime=0))
        target=ROOT/'tmp/rts/portrait-material-raw-logs'/path.name
        if not path.resolve().is_relative_to(RUN.resolve()) or not target.resolve().is_relative_to((ROOT/'tmp/rts').resolve()):raise ValueError('Unsafe archive path')
        if target.exists():raise ValueError('Archive target exists')
        target.parent.mkdir(parents=True,exist_ok=True);path.rename(target)
    paths=list(RUN.rglob('*'))+list((ROOT/'art-factory/rts/tools').glob('original_guard_portrait_material_*'))
    paths += [ROOT/'art-factory/rts/contracts/original-guard-portrait-material.json',ROOT/'art-factory/rts/tools/original_guard_portrait_study_viewer.ts',ROOT/'art-factory/rts/tools/original_guard_tabard_blender.py',ROOT/'art-factory/rts/runs/original-guard-portrait-study/2026-10-05/review.css']
    for path in paths:
        if not path.is_file() or path.suffix not in ['.py','.mjs','.ts','.html','.css','.json','.md']:continue
        data=path.read_text(encoding='utf-8')
        if re.search(r'AIza[0-9A-Za-z_-]{20}|sk-[0-9A-Za-z_-]{20}|-----BEGIN (?:RSA|OPENSSH|PRIVATE)',data):raise ValueError('Potential secret')
        if path.suffix=='.py':ast.parse(data)
    files={str(p.relative_to(ROOT)).replace('\\','/'):sha(p) for p in paths if p.is_file() and p.name!='provenance.json'}
    report={'status':'independently_rejected_material_registration','runtime_publish_allowed':False,
      'red_tests':'Missing projection helper first; later visor/hem landmark regression failed actual154.3/280.7 vs expected125/230 before the semantic vertical mapping implementation',
      'tests':'4/4 pass','candidate_geometry_and_sampled_authored_poses_unchanged':True,'browser':'Five poses,11911 exported vertices each, nine served asset hashes, visible motion, desktop/mobile controls, errors[]',
      'limitations':'UV raster has 451 duplicate texel samples not independently classified as overlap versus shared boundaries; all materials remain rejected.',
      'sha256':files}
    (QA/'provenance.json').write_bytes((json.dumps(report,indent=2)+'\n').encode())
    print(json.dumps({'tests':'4/4 pass','hashed_files':len(files),'source_and_candidate_hashes':'match','secret_scan':'clear','material_status':'qa_failed'}))


if __name__=='__main__':main()
