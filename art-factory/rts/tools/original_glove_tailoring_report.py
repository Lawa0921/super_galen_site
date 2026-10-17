"""Seal current-candidate evidence; mechanical checks never approve its art."""
import hashlib,json,os,re,shutil,subprocess,sys
from pathlib import Path
ROOT=Path(__file__).resolve().parents[3]
RUN=ROOT/'art-factory/rts/runs/original-glove-tailoring/2026-10-06-v1';QA=RUN/'qa'
BASE=ROOT/'art-factory/rts/runs/original-articulated-glove/2026-10-06-v1'
def read(name):return json.loads((QA/name).read_text(encoding='utf-8'))
def write(name,data):(QA/name).write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n',encoding='utf-8',newline='\n')
def sha(path):return hashlib.sha256(path.read_bytes()).hexdigest()
checks=[]
for label,args in [
    ('geometry_regressions',[sys.executable,'art-factory/rts/tools/original_glove_tailoring_geometry_test.py']),
    ('strict_review_typescript',[shutil.which('node'),'node_modules/typescript/bin/tsc','--noEmit','--strict','--target','ES2022','--module','ESNext','--moduleResolution','Bundler','--lib','ES2022,DOM,DOM.Iterable','--skipLibCheck','art-factory/rts/tools/original_glove_tailoring_scene.ts'])]:
    result=subprocess.run(args,cwd=ROOT,capture_output=True,text=True,encoding='utf-8',creationflags=subprocess.CREATE_NO_WINDOW if os.name=='nt' else 0)
    checks.append({'name':label,'command':args,'exit_code':result.returncode,'stdout':result.stdout,'stderr':result.stderr})
write('tool-verification.json',{'pass':all(r['exit_code']==0 for r in checks),'checks':checks})
assert all(r['exit_code']==0 for r in checks)
auth=read('authoring.json');files=auth['files']
for name,value in files.items():assert sha(RUN/'candidate'/name)==value,name
for name,value in auth['baseline_sha256'].items():assert sha(BASE/'candidate'/name)==value,name
for name,value in auth['tools'].items():assert sha(Path(__file__).parent/name)==value,name
assert sha(ROOT/auth['surface_source'])==auth['surface_sha256']
topology=read('candidate-topology.json');deform=read('deformation-dense.json');export=read('actual-export.json');browser=read('browser/report.json');validator=read('gltf-validator.json');rig=read('rig-preservation.json');links=read('vertex-links.json')
for report in [topology,deform,export,browser,rig,links]:assert report['pass']
for report in [topology,deform]:
    for name,value in report['source_sha256'].items():assert files[name]==value,name
assert export['files']==files
assert len(deform['rows'])==388 and sum(r['samples'] for r in export['rows'])==1540
assert len(browser['rows'])==120
base_files=json.loads((BASE/'qa/authoring.json').read_text())['files']
for row in browser['rows']:
    expected=files if row['revision']=='current' else base_files
    assert row['sha']==expected[f"glove-{row['side']}-lod{row['lod']}.glb"] and row['boneCount']==16
for name,row in validator.items():assert row['source_sha256']==files[name] and row['issues']['numErrors']==0
for row in rig['rows']:assert files[f"original-glove-{row['side'].lower()}.blend"]==row['candidate_sha256']
result={
 'asset_status':'qa_failed','revision':'v4-root-bridge','mechanical_checks_pass':True,'commercial_art_pass':False,'runtime_publish_allowed':False,
 'candidate_files':files,'records':auth['records'],
 'checks':{
  'geometry_tests':4,'topology_meshes':len(topology['rows']),'single_cycle_vertex_links':links['pass'],
  'original_bind_and_curves_preserved':rig['pass'],'deformation_sampled_poses':len(deform['rows']),
  'max_sampled_self_crossings':max(r['intersections'] for r in deform['rows']),
  'glb_parity_sampled_poses':sum(r['samples'] for r in export['rows']),
  'glb_max_surface_error_m':max(r['surface_error_m'] for r in export['rows']),
  'validator':{name:{'errors':row['issues']['numErrors'],'warnings':row['issues']['numWarnings']} for name,row in validator.items()},
  'browser_views':len(browser['rows']),'same_pose_switch_error':browser['pose_switch_error'],'browser_errors':browser['errors'],
  'play_pause':browser['play_pause'],'mobile_overflow':browser['mobile_overflow'],'strict_typescript':True
 },
 'visual_result':'Rounded finger caps and cuff improved. The transverse palm/finger-root ridge persists after both local-subdivision isolation and root-transition bridge changes. Stop scalar surface tuning; this candidate is not finished art.',
 'limitations':['No weapon/character fit, reload, portrait integration or full-character performance test.','Half-frame intersection checks are sampled and exclude coplanar overlap; not a continuous collision proof.','Each GLB retains one NODE_SKINNED_MESH_NON_ROOT warning.','The new four-test pass covers geometry behavior, not aesthetic acceptance.','Per-hand mesh cost requires optimization against the full-character budget before integration.'],
 'preview':'http://127.0.0.1:4334/glove-tailoring/',
 'next_direction':'Compare an original generated high-detail isolated glove sculpt. Preserve the authored 16-bone bind and motion; no stock assets.'
}
write('release-results.json',result)
write('evidence-index.json',{'current_revision':'v4-root-bridge','current':['authoring.json','candidate-topology.json','vertex-links.json','rig-preservation.json','deformation-dense.json','actual-export.json','gltf-validator.json','browser/report.json','tool-verification.json','release-results.json'],'historical':'iterations/rejected-pointed-tips is v1; rejected-root-depth-step has v2 geometry/Blender QA but inherited v1 browser/validator; rejected-root-tangent is v3 with matching 120 browser views. Resolve all claims by exact SHA.','runtime_publish_allowed':False})
patterns=[rb'-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----',rb'gh[pousr]_[A-Za-z0-9]{30,}',rb'sk-(?:proj-)?[A-Za-z0-9_-]{40,}']
targets=list(Path(__file__).parent.glob('original_glove_tailoring_*'))+[ROOT/'art-factory/rts/contracts/original-glove-tailoring.json']
targets+=[p for p in QA.rglob('*') if p.suffix in ['.json','.html','.md','.txt']]
hits=[str(p.relative_to(ROOT)) for p in targets if p.is_file() and any(re.search(pattern,p.read_bytes()) for pattern in patterns)]
write('scoped-secret-scan.json',{'pass':not hits,'files':len(targets),'matched_paths':hits,'scope':'New tailoring tools, contract and current text QA only; no credential values printed.'});assert not hits
evidence=[p for p in RUN.rglob('*') if p.is_file() and 'iterations' not in p.parts and p.name!='evidence-sha256.json']
write('evidence-sha256.json',{str(p.relative_to(RUN)).replace('\\','/'):sha(p) for p in sorted(evidence)})
print(json.dumps({'mechanical_checks_pass':True,'commercial_art_pass':False,'runtime_publish_allowed':False,'files_hashed':len(evidence),'checks':result['checks']}))
