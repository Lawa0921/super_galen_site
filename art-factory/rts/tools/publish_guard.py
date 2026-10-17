"""Publish only the reviewed production guard; earlier failed pilots stay archived."""
from pathlib import Path
import hashlib
import json
import shutil

ROOT=Path(__file__).resolve().parents[3]
FACTORY=ROOT/'art-factory/rts'
RUNTIME=ROOT/'public/assets/games/rts'
RUN=FACTORY/'runs/guard-neural-pilot/production-v2'

def read(path):
    return json.loads(path.read_text(encoding='utf-8'))

def write(path,value):
    path.write_text(json.dumps(value,ensure_ascii=False,indent=2)+'\n',encoding='utf-8',newline='\n')

mechanical=read(RUN/'qa/structural.json')
visual=read(RUN/'qa/visual-diff.json')
assert visual['frames_compared']==10 and visual['max_channel_delta_8bit']<=1 and visual['max_changed_channel_samples_per_frame']<=6
assert all(lod['animation_max_sample_delta']==0 and lod['material_definitions_exact'] for lod in mechanical['lods'])
webgl=read(RUN/'qa/three.json')
validator=read(RUN/'qa/khronos.json')
assert webgl['status']=='pass' and all(webgl['changed'].values()) and not webgl['errors']
assert webgl['clips']==webgl['lowClips']==['Attack','Death','Hurt','Idle','Walk']
assert len(validator['assets'])==2 and all(a['issues']['numErrors']==0 for a in validator['assets'])
records=[]
for lod in (0,1):
    source=RUN/'candidate'/f'guard-production-lod{lod}.glb'
    data=source.read_bytes();digest=hashlib.sha256(data).hexdigest()
    checked=mechanical['lods'][lod]['candidate']
    assert checked['sha256']==digest and checked['all_primitive_weights_valid']
    assert len(checked['skin_joint_names'])==1 and len(checked['skin_joint_names'][0])==20
    assert sorted(checked['clip_channels'])==webgl['clips']
    assert any(a['sha256']==digest for a in validator['assets'])
    asset_id='guard' if lod==0 else 'guard-lod1'
    target=RUNTIME/'models'/f'{asset_id}.glb';shutil.copyfile(source,target)
    records.append({'id':asset_id,'status':'published','url':f'/assets/games/rts/models/{asset_id}.glb',
                    'sha256':digest,'bytes':len(data),'candidate':source.relative_to(ROOT).as_posix(),
                    'source':(RUN/'raw/guard-production-v2.blend').relative_to(ROOT).as_posix(),
                    'qa':(RUN/'qa/structural.json').relative_to(ROOT).as_posix(),
                    'visual_review':'Root accepted body, sword/shield, motion frame grid and both team colours with both LODs in actual Three.js WebGL',
                    'animation_review':'Twenty-joint skeleton and five named clips; actual ModelInstance bones and weapon poses changed on both LODs',
                    'validator_warnings':'Four NODE_SKINNED_MESH_NON_ROOT warnings across both LODs; actual translated instances and animated poses verified in target Three.js renderer',
                    'runtime_publish_allowed':True})
registry_path=FACTORY/'manifests/unit-registry.json';registry=read(registry_path)
registry['assets']=[a for a in registry['assets'] if a['id'] not in ('guard','guard-lod1')]+records
write(registry_path,registry)
manifest_path=RUNTIME/'model-registry.json';manifest=read(manifest_path)
manifest['assets']['guard']={'url':records[0]['url'],'lod1':records[1]['url'],'status':'published','scale':1,'yaw':0}
write(manifest_path,manifest)
contract_path=FACTORY/'contracts/guard-neural-pilot.json';contract=read(contract_path)
if 'initial_pilot' not in contract:
    contract['initial_pilot']={key:contract[key] for key in ('status','candidate','editable_source','qa','approval_note')}
contract.update({'status':'production-v2-published','runtime_publish_allowed':True,
                 'active_run':'production-v2','assembly_human_review':'root-webgl-reviewed; user overall art acceptance pending',
                 'candidate':records[0]['candidate'],'editable_source':records[0]['source'],
                 'qa':(RUN/'qa').relative_to(ROOT).as_posix(),
                 'proposed_runtime_target':'public/assets/games/rts/models/guard.glb',
                 'not_in_scope':['other characters'],
                 'approval_note':'Production-v2 safely merges same-skin/material equipment and passes root actual WebGL team/LOD/five-action review. Previous production-v1 is archived; failed initial v1/v2 neural pilots remain outside runtime.'})
contract['production_v1'].update({'status':'superseded-by-production-v2','runtime_publish_allowed':False})
contract['production_v2']={'status':'published','runtime_publish_allowed':True,'runtime_bytes':sum(a['bytes'] for a in records),'visual_tolerance':'At most six 8-bit channel samples per frame differ by one level; ten checked frames','qa':(RUN/'qa').relative_to(ROOT).as_posix()}
write(contract_path,contract)
write(RUN/'qa/root-review.json',{'status':'approved-for-runtime','reviewer':'root','evidence':['three.json','three-idle-teams-lods.png','three-attack-teams-lods.png','visual-diff.json','khronos.json'],'user_overall_art_acceptance':'pending-user-preview'})
print(json.dumps({'published':'guard','lods':2,'bytes':sum(record['bytes'] for record in records)}))
