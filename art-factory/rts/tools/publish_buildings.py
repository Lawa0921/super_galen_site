"""Publish mechanically verified building v2 GLBs, retaining source hashes."""
from pathlib import Path
import hashlib, json, shutil, struct

ROOT=Path(__file__).resolve().parents[3]
FACTORY=ROOT/'art-factory/rts'
RUN=FACTORY/'runs/kingdom-buildings/2026-10-04-v2'
qa=json.loads((RUN/'qa/report.json').read_text(encoding='utf-8'))
assert qa['mechanical_pass'] and qa['candidate_count']==13 and not qa['errors']
runtime=ROOT/'public/assets/games/rts'
(runtime/'models').mkdir(parents=True,exist_ok=True)
registry_path=runtime/'model-registry.json'
registry=json.loads(registry_path.read_text(encoding='utf-8')) if registry_path.exists() else {'assets':{}}
records=[]
for asset in qa['assets']:
    assert all(asset['qa_checks'].values()), asset['id']
    source=RUN/'candidate'/f"{asset['id']}.glb"
    raw=source.read_bytes()
    assert hashlib.sha256(raw).hexdigest()==asset['sha256_glb']
    magic,version,length=struct.unpack('<4sII',raw[:12])
    assert magic==b'glTF' and version==2 and length==len(raw)
    target=runtime/'models'/source.name
    shutil.copyfile(source,target)
    assert hashlib.sha256(target.read_bytes()).hexdigest()==asset['sha256_glb']
    entry={'url':f"/assets/games/rts/models/{source.name}",'status':'published','scale':1,'yaw':0}
    registry['assets'][asset['id']]=entry
    records.append({'id':asset['id'],**entry,'sha256':asset['sha256_glb'],'bytes':len(raw),
                    'candidate':str(source.relative_to(ROOT)).replace('\\','/'),
                    'source':'art-factory/rts/'+asset['blend'].replace('\\','/'),'qa':'art-factory/rts/runs/kingdom-buildings/2026-10-04-v2/qa/report.json',
                    'visual_review':'root reviewed closeup and 64px contact; building silhouettes differentiated',
                    'assembly_review':'pending-final-battlefield','runtime_publish_allowed':True})
registry_path.write_text(json.dumps(registry,indent=2)+'\n',encoding='utf-8',newline='\n')
(FACTORY/'manifests/building-registry.json').write_text(json.dumps({'assets':records},indent=2)+'\n',encoding='utf-8',newline='\n')
contract=FACTORY/'contracts/kingdom-buildings.json'
data=json.loads(contract.read_text(encoding='utf-8'))
data.update({'status':'published','runtime_publish_allowed':True,'active_run':'2026-10-04-v2','source_mode':'original-Blender-scripted-mesh-with-generated-textures',
             'rejected_runs':['2026-10-04-original-blender'],'assembly_human_review':'pending-final-battlefield'})
contract.write_text(json.dumps(data,indent=2,ensure_ascii=False)+'\n',encoding='utf-8',newline='\n')
print(json.dumps({'published':len(records),'bytes':sum(r['bytes'] for r in records),'remaining_models':12}))
