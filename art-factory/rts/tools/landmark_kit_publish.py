"""Publish independently approved landmark bytes to this local worktree only."""
import hashlib,json,shutil
from pathlib import Path
ROOT=Path(__file__).resolve().parents[3]
RUN=ROOT/'art-factory/rts/runs/landmark-kit/2026-10-08-v1'
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def write(p,v):p.write_text(json.dumps(v,ensure_ascii=False,indent=2)+'\n',encoding='utf-8',newline='\n')
def verify_reviewed_inputs(root,review,assets):
    reviewed=review.get('reviewed_files',{})
    fields=[('source','source_sha256'),('candidate','sha256'),('lod1_candidate','lod1_sha256'),('terms_record','terms_record_sha256')]
    for asset in assets:
        for field,hash_field in fields:
            path=asset[field];accepted=reviewed.get(path)
            if not accepted or accepted!=asset[hash_field] or sha(root/path)!=accepted:
                raise ValueError('Independent review does not cover current bytes: '+path)
def main():
    review=json.loads((RUN/'qa/independent-asset-review.json').read_text(encoding='utf-8'))
    assert review['decision']=='approved_for_local_runtime_publication'
    assert all(f['status']=='closed' for f in review['findings'])
    assert sha(ROOT/review['controlled_lod_evidence'])==review['controlled_lod_evidence_sha256']
    registry_path=ROOT/'art-factory/rts/manifests/prop-registry.json'
    registry=json.loads(registry_path.read_text(encoding='utf-8'))
    ids=['river-gatehouse','river-shrine','highland-watchtower','quarry-ruins']
    selected=[a for a in registry['assets'] if a['id'] in ids]
    assert len(selected)==len(ids)
    verify_reviewed_inputs(ROOT,review,selected)
    for asset in selected:
        assert sha(ROOT/asset['source'])==asset['source_sha256']
        assert sha(ROOT/asset['terms_record'])==asset['terms_record_sha256']
        for field,hash_field in [('candidate','sha256'),('lod1_candidate','lod1_sha256')]:
            assert sha(ROOT/asset[field])==asset[hash_field]
    copies=[]
    for asset in selected:
        for field,url_field,hash_field in [('candidate','url','sha256'),('lod1_candidate','lod1','lod1_sha256')]:
            target=ROOT/'public'/asset[url_field].lstrip('/')
            assert target.resolve().is_relative_to((ROOT/'public/assets/games/rts/models').resolve())
            if target.exists():assert sha(target)==asset[hash_field], 'Refuse replacement of different runtime bytes'
            shutil.copyfile(ROOT/asset[field],target)
            assert sha(target)==asset[hash_field]
            copies.append({'path':target.relative_to(ROOT).as_posix(),'sha256':sha(target),'bytes':target.stat().st_size})
        asset.update(status='published',runtime_publish_allowed=True,publication_scope='local worktree only',
                     assembly_evidence=review['controlled_lod_evidence'],lod1_max_projected_height_pixels_exclusive=48)
        # Central factory registries enumerate every physical runtime file.
        # The base asset's lod1 reference alone is not a file registration.
        derivative={k:v for k,v in asset.items() if not k.startswith('lod1')}
        derivative.update(id=asset['id']+'-lod1',parent_asset_id=asset['id'],lod=1,url=asset['lod1'],
                          candidate=asset['lod1_candidate'],sha256=asset['lod1_sha256'],bytes=asset['lod1_bytes'],
                          max_projected_height_pixels_exclusive=48)
        existing=next((a for a in registry['assets'] if a['id']==derivative['id']),None)
        if existing:
            assert existing['sha256']==derivative['sha256'] and existing['source']==derivative['source']
            existing.update(derivative)
        else:registry['assets'].append(derivative)
    manifest_path=ROOT/'public/assets/games/rts/model-registry.json'
    manifest=json.loads(manifest_path.read_text(encoding='utf-8'))
    for a in selected:manifest['assets'][a['id']]={k:a[k] for k in ['url','lod1','status','scale','yaw']}
    if manifest.get('landscape'):manifest['landscape'].pop('ruins',None)
    write(manifest_path,manifest);write(registry_path,registry)
    contract_path=ROOT/'art-factory/rts/contracts/landmark-kit-2026-10-08.json'
    contract=json.loads(contract_path.read_text(encoding='utf-8'))
    contract.update(status='published',runtime_publish_allowed=True,publication_scope='local worktree only',
                    assembly_human_review='Independent consultant and root actual two-map renderer/48px LOD review approved; whole-game commercial acceptance remains pending')
    write(contract_path,contract)
    write(RUN/'qa/local-publication.json',{'status':'published_local_worktree','external_deploy':False,'commercial_game_complete':False,
          'review_sha256':sha(RUN/'qa/independent-asset-review.json'),'runtime_registry_sha256':sha(manifest_path),'prop_registry_sha256':sha(registry_path),'files':copies})
    print('Published8 reviewed GLBs to local worktree; no deployment. Final HTTP/build/e2e verification pending.')
if __name__=='__main__':main()
