"""Publish only the complete, reviewed assembly into the local worktree."""
from pathlib import Path
import hashlib,json

ROOT=Path(__file__).resolve().parents[3]
RUN=ROOT/'art-factory/rts/runs/commander-assembly/2026-10-14-v1'
def read(p):return json.loads(p.read_bytes())
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def relative(p):return p.relative_to(ROOT).as_posix()
def save(p,d):p.write_bytes((json.dumps(d,ensure_ascii=False,indent=2)+'\n').encode())

def main():
    review=read(RUN/'qa/independent-review.json')
    assert review['status']=='approved-complete-assembly-local-runtime'
    source=RUN/'raw/commander-assembly.blend';source_sha=sha(source)
    build=read(RUN/'qa/build.json');browser=read(RUN/'qa/browser.json')
    validation=read(RUN/'qa/gltf-validator.json');game=read(RUN/'qa/game/evidence.json')
    integrity=read(RUN/'qa/glb-integrity.json')
    for name in ('source-parity','assembly-check','collision'):
        report=read(RUN/f'qa/{name}.json');assert report['status']=='passed' and report['source_sha256']==source_sha
    assert integrity['status']=='passed' and validation['errors']==0
    assert not browser['errors'] and not game['errors']
    assert len(browser['floor'])==32 and all(r['samples']==61 and r['minimumFloor']>=-.002 for r in browser['floor'])
    assert game['selectionPortraitVisible'] and game['bothServedModelHashesMatch']
    assert len(game['pictures'])==3 and all(len(p['samples'])==32 for p in game['pictures'])
    assert game['download']['firstMapEstimatedGzipBytes']<=35000000
    assert review['source_sha256']==source_sha
    registry_path=ROOT/'art-factory/rts/manifests/unit-registry.json'
    manifest_path=ROOT/'public/assets/games/rts/model-registry.json'
    commercial_path=ROOT/'art-factory/rts/manifests/commercial-readiness.json'
    audit_path=ROOT/'art-factory/rts/runs/commercial-readiness/2026-10-09/qa/published-unit-source-audit.json'
    contract_path=ROOT/'art-factory/rts/contracts/commander-assembly-refinement.json'
    registry,manifest,commercial,contract=map(read,(registry_path,manifest_path,commercial_path,contract_path))
    assert contract['status']=='candidate' and not contract['runtime_publish_allowed']
    assets=[]
    for lod in (0,1):
        ident='commander'+('-lod1' if lod else '')
        candidate=RUN/f'candidate/commander-lod{lod}.glb';target=ROOT/f'public/assets/games/rts/models/{ident}.glb'
        before=RUN/f'raw/before/commander-lod{lod}.glb';row=next(r for r in registry['assets'] if r['id']==ident)
        assert sha(target)==sha(before)==row['sha256']
        checksum=sha(candidate)
        for report,key in ((build,'candidates'),(validation,'assets'),(game,'assets'),(browser,'assets'),(review,'assets'),(integrity,'assets')):
            assert report[key][lod]['sha256']==checksum
        assets.append({'id':ident,'candidate':relative(candidate),'target':relative(target),'sha256':checksum,'previous_sha256':sha(before),'source':relative(source),'source_sha256':source_sha})
    # Back up only this task's registry targets; preserve unrelated dirty work.
    for p in (registry_path,manifest_path,commercial_path,audit_path,contract_path):
        backup=RUN/'raw/before'/p.name;assert not backup.exists();backup.write_bytes(p.read_bytes())
    root_review=RUN/'qa/root-review.json'
    known_limits=['At extreme macro zoom the Death right leather cuff has a pointed fold; independently reviewed as overlapping cuff/armor, not a wrist gap.','glTF retains five non-root skinned-node warnings per LOD; actual runtime, LODs and portraits verified.']
    evidence=('source-lock.json','qa/build.json','qa/source-parity.json','qa/assembly-check.json','qa/collision.json','qa/glb-integrity.json','qa/gltf-validator.json','qa/browser.json','qa/game/evidence.json','qa/independent-review.json')
    save(root_review,{'status':'approved-complete-assembly-local-runtime','scope':contract['scope'],'assets':assets,'runtime_publish_allowed':True,'known_limits':known_limits,'user_overall_art_acceptance':'pending','evidence':[{'path':relative(RUN/p),'sha256':sha(RUN/p)} for p in evidence]})
    audit=audit_path.read_bytes().decode('utf8')
    for item in assets:
        row=next(r for r in registry['assets'] if r['id']==item['id']);candidate=ROOT/item['candidate']
        row.update(status='published',bytes=candidate.stat().st_size,sha256=item['sha256'],candidate=item['candidate'],candidate_sha256=item['sha256'],source=item['source'],source_sha256=source_sha,qa=relative(root_review),qa_sha256=sha(root_review),root_review=relative(root_review),runtime_publish_allowed=True,publication_scope='local worktree only',visual_review='Complete hand/equipment assembly approved: separate curled digits and armor plates, textured cuffs, fitted sword and shield grips, corrected Death wrist pivots and weapon clearance; both LODs, teams, all eight clips and actual game portrait verified.',known_visual_limits='; '.join(known_limits),assembly_revision={'source_lock':relative(RUN/'source-lock.json'),'previous_sha256':item['previous_sha256'],'scope':contract['scope']})
        (ROOT/item['target']).write_bytes(candidate.read_bytes())
        manifest['assets']['commander']['lod1Sha256' if item['id'].endswith('-lod1') else 'sha256']=item['sha256']
        assert audit.count(item['previous_sha256'])==1;audit=audit.replace(item['previous_sha256'],item['sha256'])
    manifest['assets']['commander']['source']=relative(source)
    newline='\r\n' if '\r\n' in audit else '\n'
    audit=audit.replace('{'+newline,'{'+newline+'    "commander_assembly_refinement": "'+relative(root_review)+'",'+newline,1)
    audit_path.write_bytes(audit.encode())
    contract.update(status='published',runtime_publish_allowed=True,root_review=relative(root_review),known_limits=known_limits)
    for p,d in ((registry_path,registry),(manifest_path,manifest),(contract_path,contract)):save(p,d)
    for name in ('model-registry.json','models/commander.glb','models/commander-lod1.glb'):
        key='assets/games/rts/'+name;commercial['asset_hashes'][key]=sha(ROOT/'public'/key)
    save(commercial_path,commercial)
    for item in assets:assert sha(ROOT/item['target'])==item['sha256']
    save(RUN/'qa/publication.json',{'status':'published-local-worktree','assets':assets,'external_deployment':False,'user_overall_art_acceptance':'pending'})
    html=RUN/'review.html';html.write_bytes(html.read_bytes().replace('完整裝配候選'.encode(),'目前遊戲版本'.encode()))
    print(json.dumps({'status':'published-local-worktree','assets':[{'id':r['id'],'sha256':r['sha256']} for r in assets]}))

if __name__=='__main__':main()
