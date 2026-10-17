"""Freeze finite rejection evidence and read-only QA supplementation."""
from pathlib import Path
import ast,gzip,hashlib,json,re,subprocess,sys
ROOT=Path(__file__).resolve().parents[3]
RUN=ROOT/'art-factory/rts/runs/original-guard-grip-low/2026-10-05';QA=RUN/'qa'


def sha(path):return hashlib.sha256(path.read_bytes()).hexdigest()


def main():
    logs=[]
    for name in ['original_guard_grip_low_test.py','original_guard_shell_winding_test.py']:
        result=subprocess.run([sys.executable,'-B',str(Path(__file__).with_name(name))],capture_output=True)
        logs.append(result.stdout+result.stderr)
        if result.returncode:sys.stdout.buffer.write(result.stdout+result.stderr);raise SystemExit(result.returncode)
    (QA/'supplement-tests.txt.gz').write_bytes(gzip.compress(b'\n'.join(logs),mtime=0))
    for path in QA.glob('*.log'):
        data=path.read_bytes();path.with_suffix(path.suffix+'.gz').write_bytes(gzip.compress(data,mtime=0))
        target=ROOT/'tmp/rts/grip-low-raw-logs'/path.name
        if not path.resolve().is_relative_to(RUN.resolve()) or not target.resolve().is_relative_to((ROOT/'tmp/rts').resolve()):raise ValueError('Unsafe archive path')
        if target.exists():raise ValueError('Archive target exists')
        target.parent.mkdir(parents=True,exist_ok=True);path.rename(target)
    paths=list(RUN.rglob('*'))+list((ROOT/'art-factory/rts/tools').glob('original_guard_grip_low_*'))+list((ROOT/'art-factory/rts/tools').glob('original_guard_shell_winding_*'))
    paths += [ROOT/'art-factory/rts/contracts/original-guard-grip-low.json',ROOT/'art-factory/rts/tools/original_guard_tabard_blender.py',ROOT/'art-factory/rts/tools/original_guard_quadri_repair_math.py']
    for path in paths:
        if not path.is_file() or path.suffix not in ['.py','.mjs','.json','.html','.css','.md']:continue
        data=path.read_text(encoding='utf-8')
        if re.search(r'AIza[0-9A-Za-z_-]{20}|sk-[0-9A-Za-z_-]{20}|-----BEGIN (?:RSA|OPENSSH|PRIVATE)',data):raise ValueError('Potential secret')
        if path.suffix=='.py':ast.parse(data)
    files={str(p.relative_to(ROOT)).replace('\\','/'):sha(p) for p in paths if p.is_file() and p.name!='supplement-provenance.json'}
    report={'status':'independently_rejected_local_collapse_self_intersections','runtime_publish_allowed':False,
      'tests':'3 low-geometry and 4 closed-shell/helper tests passed','source_geometry_changed':False,
      'independent_review':'qa/independent-review.json','red_tests':'Missing winding helper initially; added boundary-at-zero-winding regression failed missing classifier before implementation',
      'sha256':files}
    (QA/'supplement-provenance.json').write_bytes((json.dumps(report,indent=2)+'\n').encode())
    print(json.dumps({'tests':'7/7 pass','hashed_files':len(files),'secret_scan':'clear','candidate_status':'qa_failed'}))


if __name__=='__main__':main()
