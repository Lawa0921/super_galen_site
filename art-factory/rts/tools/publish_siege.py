"""Publish the reviewed original siege unit, retaining both model LODs."""
from pathlib import Path
import hashlib
import json
import shutil

ROOT=Path(__file__).resolve().parents[3]
FACTORY=ROOT/'art-factory/rts'
RUNTIME=ROOT/'public/assets/games/rts'
RUN=FACTORY/'runs/kingdom-siege/2026-10-05-rigid-skin-v3'

def read(path):
    return json.loads(path.read_text(encoding='utf-8'))

def write(path,value):
    path.write_text(json.dumps(value,ensure_ascii=False,indent=2)+'\n',encoding='utf-8',newline='\n')

qa=read(RUN/'qa/structural.json')
webgl=read(RUN/'qa/three.json')
validator=read(RUN/'qa/khronos.json')
numeric=read(RUN/'qa/numeric-animation.json')
assert len(numeric)==2 and all(lod['sampled_total']==195 and max(lod['errors'].values())<1e-5 for lod in numeric)
assert webgl['status']=='pass'
assert all(webgl['changed'].values()) and not webgl['errors']
assert len(validator['assets'])==2 and all(a['issues']['numErrors']==0 for a in validator['assets'])
for browser in ('chromium','firefox','webkit'):
    comparison=read(RUN/f'qa/three-diff-{browser}/report.json')
    assert comparison['status']=='pass' and len(comparison['cases'])==14 and not comparison['errors']
    assert all(case['hitMismatches']==0 and case['skinned']==6 and case['newMeshes']==8
               and case['meanChannelDelta']<.3 and case['normalMeanChannelDelta']<.3 for case in comparison['cases'])
registry_path=FACTORY/'manifests/unit-registry.json'
registry=read(registry_path) if registry_path.exists() else {'assets':[]}
records=[]
for lod in (0,1):
    source=RUN/'candidate'/f'siege-lod{lod}.glb'
    data=source.read_bytes()
    digest=hashlib.sha256(data).hexdigest()
    checked=next(item for item in qa['lods'] if item['lod']==lod)
    assert checked['candidate_sha256']==digest and checked['draws_before']==29 and checked['draws_after']==8
    assert any(a['sha256']==digest for a in validator['assets'])
    asset_id='siege' if lod==0 else 'siege-lod1'
    target=RUNTIME/'models'/f'{asset_id}.glb'
    shutil.copyfile(source,target)
    records.append({'id':asset_id,'status':'published','url':f'/assets/games/rts/models/{asset_id}.glb',
                    'sha256':digest,'bytes':len(data),'candidate':source.relative_to(ROOT).as_posix(),
                    'source':(RUN/'raw'/f'siege-lod{lod}.blend').relative_to(ROOT).as_posix(),
                    'qa':(RUN/'qa/structural.json').relative_to(ROOT).as_posix(),
                    'visual_review':'Root accepted both team colours and both LODs; actual Three.js beauty, normal, shadow, ray hits and frustum-edge differential passed in three browser engines',
                    'animation_review':'Five original clips and rigid bowstrings retained; all 195 key/midpoint poses preserve vertices and actual Three skin normals below 1e-5',
                    'validator_warnings':'Generated tangent space, six warnings across both files; no errors',
                    'runtime_publish_allowed':True})
registry['assets']=[a for a in registry['assets'] if a['id'] not in ('siege','siege-lod1')]+records
write(registry_path,registry)
manifest_path=RUNTIME/'model-registry.json'
manifest=read(manifest_path)
manifest['assets']['siege']={'url':records[0]['url'],'lod1':records[1]['url'],'status':'published','scale':1,'yaw':0}
write(manifest_path,manifest)
profile_path=FACTORY/'profile.json'
profile=read(profile_path)
if 'manifests/unit-registry.json' not in profile['registries']:
    profile['registries'].append('manifests/unit-registry.json')
write(profile_path,profile)
contract_path=FACTORY/'contracts/siege.json'
contract=read(contract_path)
if 'runtime_v1' not in contract:
    contract['runtime_v1']=contract['runtime_candidate']
contract['runtime_v1'].update({'status':'superseded-by-rigid-skin-v3','runtime_publish_allowed':False})
contract.update({'status':'published','runtime_publish_allowed':True,'assembly_human_review':'root-webgl-reviewed; user overall art acceptance pending',
                 'active_run':'2026-10-05-rigid-skin-v3','runtime_bytes':sum(record['bytes'] for record in records)})
contract['runtime_candidate']={'run':RUN.relative_to(FACTORY).as_posix(),'source_run':'runs/kingdom-siege/2026-10-04-original',
    'method':'Preserved animation nodes become thirteen single-weight skin joints; six material batches plus two original rigid bowstrings',
    'bounds':'ModelInstance uses the asset conservative sphere covering all five clips',
    'qa':(RUN/'qa').relative_to(ROOT).as_posix(),'runtime_publish_allowed':True}
write(contract_path,contract)
write(RUN/'qa/root-review.json',{'status':'approved-for-runtime','reviewer':'root','candidate_sha256':[r['sha256'] for r in records],
    'evidence':['three.json','three-idle-teams-lods.png','three-attack-teams-lods.png','three-diff-chromium/report.json','three-diff-firefox/report.json','three-diff-webkit/report.json','numeric-animation.json','khronos.json'],
    'user_overall_art_acceptance':'pending-user-preview'})
print(json.dumps({'published':'siege','lods':2,'bytes':sum(record['bytes'] for record in records)}))
