"""Publish root-reviewed original quarrels after structural and browser QA."""
from pathlib import Path
import hashlib,json,shutil
ROOT=Path(__file__).resolve().parents[3]
FACTORY=ROOT/'art-factory/rts'
RUN=FACTORY/'runs/projectiles/2026-10-05-v1'
RUNTIME=ROOT/'public/assets/games/rts'
def read(path): return json.loads(path.read_text(encoding='utf-8'))
def write(path,data): path.write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n',encoding='utf-8',newline='\n')
qa=read(RUN/'qa/verify.json');webgl=read(RUN/'qa/three.json');validator=read(RUN/'qa/khronos.json')
assert webgl['status']=='pass' and not webgl['errors'] and webgl['expired']['count']==0
assert len(validator['assets'])==2 and all(a['issues']['numErrors']==0 for a in validator['assets'])
records=[]
manifest=read(RUNTIME/'model-registry.json')
for asset_id in ('bolt','heavy-bolt'):
    source=RUN/'candidate'/f'{asset_id}.glb';data=source.read_bytes();digest=hashlib.sha256(data).hexdigest()
    assert qa[asset_id]['glb']['sha256']==digest and any(a['sha256']==digest for a in validator['assets'])
    target=RUNTIME/'models'/source.name;shutil.copyfile(source,target)
    url=f'/assets/games/rts/models/{asset_id}.glb'
    records.append({'id':asset_id,'status':'published','url':url,'bytes':len(data),'sha256':digest,
        'source':(RUN/'candidate'/f'{asset_id}.blend').relative_to(ROOT).as_posix(),
        'candidate':source.relative_to(ROOT).as_posix(),'qa':(RUN/'qa/three.json').relative_to(ROOT).as_posix(),
        'visual_review':'Root accepted original shape and actual Three.js ProjectileLayer forward tips, motion and expiry',
        'runtime_publish_allowed':True})
    manifest['assets'][asset_id]={'url':url,'status':'published','scale':1,'yaw':0}
write(FACTORY/'manifests/projectile-registry.json',{'assets':records});write(RUNTIME/'model-registry.json',manifest)
profile=read(FACTORY/'profile.json')
if 'manifests/projectile-registry.json' not in profile['registries']:profile['registries'].append('manifests/projectile-registry.json')
write(FACTORY/'profile.json',profile)
contract=read(FACTORY/'contracts/projectiles.json');contract.update({'status':'published','runtime_publish_allowed':True,'assembly_human_review':'root-webgl-reviewed','remaining_review':'None for this local asset publication; full-game art pack and performance acceptance remain separate.'})
write(FACTORY/'contracts/projectiles.json',contract)
print(json.dumps({'published':[a['id'] for a in records],'bytes':sum(a['bytes'] for a in records)}))
