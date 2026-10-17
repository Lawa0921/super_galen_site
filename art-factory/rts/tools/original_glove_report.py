"""Freeze the local hand milestone without approving unfinished character art."""
import hashlib,json
from pathlib import Path

ROOT=Path(__file__).resolve().parents[3]
RUN=ROOT/'art-factory/rts/runs/original-articulated-glove/2026-10-06-v1'
QA=RUN/'qa'
def read(name):return json.loads((QA/name).read_text(encoding='utf-8'))
def write(name,value):(QA/name).write_text(json.dumps(value,ensure_ascii=False,indent=2)+'\n',encoding='utf-8',newline='\n')
def digest(p):return hashlib.sha256(p.read_bytes()).hexdigest()

auth=read('authoring.json');files=auth['files']
tools=read('tool-verification.json');assert tools['pass'] and all(r['exit_code']==0 for r in tools['checks'])
for name,sha in tools['source_sha256'].items():assert digest(Path(__file__).parent/name)==sha,name
for name,sha in files.items():assert digest(RUN/'candidate'/name)==sha,name
topology=read('candidate-topology.json');deform=read('deformation-dense.json');export=read('actual-export.json');browser=read('browser/report.json');validator=read('gltf-validator.json');capture=read('capture.json')
for report in [topology,deform,export,browser,capture]:assert report['pass']
for report in [topology,deform]:
    for name,sha in report['source_sha256'].items():assert files[name]==sha,name
assert export['files']==files
assert len(topology['rows'])==4 and all(r['finger_bones']==15 for r in topology['rows'])
assert len(deform['rows'])==388
assert len(export['rows'])==4 and all(r['samples']==385 and r['bones']==16 for r in export['rows'])
assert len(browser['rows'])==48
for row in browser['rows']:assert row['sha']==files[f"glove-{row['side']}-lod{row['lod']}.glb"] and row['boneCount']==16
for name,row in validator.items():assert row['source_sha256']==files[name] and row['issues']['numErrors']==0
assert capture['source']['sha']==files['glove-r-lod0.glb']
contract=json.loads((ROOT/'art-factory/rts/contracts/original-articulated-glove.json').read_text(encoding='utf-8'))
assert digest(ROOT/contract['reference_source'])==contract['reference_sha256']
assert digest(ROOT/auth['surface_source'])==auth['surface_sha256']

result={
 'asset_status':'qa_failed','mechanical_milestone_pass':True,'runtime_publish_allowed':False,
 'candidate_files':files,'original_source_unchanged':True,'project_generated_leather_unchanged':True,
 'checks':{
  'geometry_regressions':{'tests':3,'pass':tools['pass'],'source':'tool-verification.json; actual Python unittest output'},
  'topology':{'meshes':4,'components_each':1,'genus_each':0,'finger_bones_each':15,'pass':topology['pass']},
  'deformation':{'sampled_poses':len(deform['rows']),'step_frames':deform['step_frames'],'max_non_coplanar_crossings':max(r['intersections'] for r in deform['rows']),'max_wrist_drift_m':max(r['wrist_drift_m'] for r in deform['rows']),'max_bone_length_relative_error':max(r['max_bone_length_relative_error'] for r in deform['rows']),'max_loop_endpoint_error_m':max(r['loop_endpoint_error_m'] for r in deform['rows']),'pass':deform['pass']},
  'glb_roundtrip':{'sampled_poses':sum(r['samples'] for r in export['rows']),'step_frames':export['sample_step_frames'],'max_matrix_error':max(r['matrix_error'] for r in export['rows']),'max_surface_error_m':max(r['surface_error_m'] for r in export['rows']),'pass':export['pass']},
  'validator':{name:{'errors':r['issues']['numErrors'],'warnings':r['issues']['numWarnings']} for name,r in validator.items()},
  'chromium':{'views':48,'play_pause':browser['play_pause'],'errors':browser['errors'],'pass':browser['pass']},
  'strict_review_typescript':{'pass':tools['pass'],'scope':'original_glove_scene.ts only; actual tsc execution in tool-verification.json'},
 },
 'limitations':[
  'Standalone hand deformation is a local milestone, not completed commercial character art.',
  'Palm/dorsal anatomy, glove tailoring/seams, material finish and wrist/cuff character fitting remain unfinished.',
  'No weapon/body fitting, reload/string/bolt mechanism, attack release timing or runtime portrait integration.',
  'Deformation checks sample half frames and noncoplanar triangle intersections; not a proof of continuous collision freedom or full-character contact.',
  'Each GLB retains one NODE_SKINNED_MESH_NON_ROOT warning. Actual import/playback and surface parity pass.',
  'No new full-site or 80-unit performance claim; gameplay/runtime assets were not changed in this milestone.'
 ],
 'preview':'http://127.0.0.1:4334/articulated-glove/',
 'still':'http://127.0.0.1:4334/articulated-glove/still.png',
 'video':'http://127.0.0.1:4334/articulated-glove/playback.webm'
}
write('release-results.json',result)
write('evidence-index.json',{'authoritative_current':['authoring.json','candidate-topology.json','deformation-dense.json','actual-export.json','gltf-validator.json','browser/report.json','capture.json','release-results.json'],'historical':['baseline-topology.json','deformation-coarse.json','../iterations/'],'note':'Coarse deformation and archived QA can describe prior hashes; use dense and exact candidate hashes for the current milestone. Blender stills were refreshed in v6; Chromium pose pictures use the same final assets and precede only a review-note wording update.','runtime_publish_allowed':False})
print(json.dumps({'mechanical_milestone_pass':True,'asset_status':'qa_failed','poses':388,'export_poses':1540,'browser_views':48,'runtime_publish_allowed':False}))
