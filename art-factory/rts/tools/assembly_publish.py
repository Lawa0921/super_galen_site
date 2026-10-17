"""Publish the five reviewed local assets only after their exact performance gate."""
import hashlib
import json
import shutil
from pathlib import Path

ROOT=Path(__file__).resolve().parents[3]
RUN=ROOT/'art-factory/rts/runs/assembly-refinement/2026-10-08-v2'
IDS=['barracks','stable','workshop','guard','guard-lod1']
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def read(p):return json.loads(p.read_text(encoding='utf-8'))
def save(p,d):p.parent.mkdir(parents=True,exist_ok=True);p.write_text(json.dumps(d,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')


def main():
    perf_path=RUN/'qa/performance-production/performance-assembly-candidate-formal-production-dedicated-portrait.json'
    perf=read(perf_path)
    assert perf['medianFps']>=55 and perf['p95Ms']<33 and perf['maxMs']<500 and not perf['errors']
    assert [perf[k] for k in ['units','buildings','visibleUnits','visibleBuildings','screenUnits','screenBuildings']]==[80,20,80,20,80,20]
    assert perf['portraitKind']=='knight' and perf['draws']['portrait']>0
    assert all(row['issues']['numErrors']==0 for row in read(RUN/'qa/gltf-validator.json'))
    assert all(row['indexed_triangle_attribute_parity'] and row['animation_skin_image_parity'] for row in read(RUN/'qa/guard-bake.json'))
    assert not read(RUN/'qa/preview-browser.json')['errors'] and not read(RUN/'qa/shared-rig-browser.json')['errors']
    download=read(RUN/'qa/download-budget-candidate.json')
    assert download['assetEncodedBytes']<=35_000_000 and not download['errors']
    review=read(RUN/'qa/root-review.json');assert review['visual_pass'] and review['independent_review_pass']
    files=[]
    for ident in IDS:
        source=RUN/f'candidate/{ident}.glb';url=f'/assets/games/rts/models/{ident}.glb'
        actual=next(r['sha256'] for r in perf['browserAssets'] if r['url']==url)
        assert sha(source)==actual,'Candidate changed after performance: '+ident
        snapshot=RUN/f'raw/before/{ident}.glb';snapshot.parent.mkdir(parents=True,exist_ok=True)
        if not snapshot.exists():shutil.copy2(ROOT/('public'+url),snapshot)
        files.append(dict(id=ident,url=url,source=str(source.relative_to(ROOT)).replace('\\','/'),sha256=actual,previous_sha256=sha(snapshot)))
    # Preserve exact previous registries for recovery without touching others' work.
    for kind in ['building','unit','terrain','modular-kit']:
        source=ROOT/f'art-factory/rts/manifests/{kind}-registry.json';backup=RUN/f'raw/before/{kind}-registry.json'
        if not backup.exists():shutil.copy2(source,backup)
    for row in files:
        for root in [ROOT/'public',ROOT/'.vercel/output/static']:
            dest=root/row['url'].lstrip('/');shutil.copy2(ROOT/row['source'],dest);assert sha(dest)==row['sha256']
    for root in [ROOT/'public',ROOT/'.vercel/output/static']:
        shutil.copy2(RUN/'raw/dirt-road.png',root/'assets/games/rts/terrain/dirt-road.png')
    for kind in ['building','unit']:
        path=ROOT/f'art-factory/rts/manifests/{kind}-registry.json';registry=read(path)
        for entry in registry['assets']:
            ident=entry['id']
            if ident not in IDS:continue
            candidate=RUN/f'candidate/{ident}.glb'
            if ident in IDS[:3]:
                source=RUN/f'raw/assemblies/{ident}.blend'
                entry.update(source=str(source.relative_to(ROOT)).replace('\\','/'),source_sha256=sha(source),recipe=f'{RUN.relative_to(ROOT).as_posix()}/recipes/{ident}.json',kit=f'{RUN.relative_to(ROOT).as_posix()}/kit.json')
            else:entry['baked_from']=f'{RUN.relative_to(ROOT).as_posix()}/raw/before/{ident}.glb'
            entry.update(candidate=str(candidate.relative_to(ROOT)).replace('\\','/'),sha256=sha(candidate),bytes=candidate.stat().st_size,
                status='published',runtime_publish_allowed=True,qa=f'{RUN.relative_to(ROOT).as_posix()}/qa/gltf-validator.json',
                root_review=f'{RUN.relative_to(ROOT).as_posix()}/qa/root-review.json',publication_scope='local worktree only',
                assembly_evidence=f'{RUN.relative_to(ROOT).as_posix()}/qa/preview-browser.json',user_overall_art_acceptance='pending')
        save(path,registry)
    terrain_path=ROOT/'art-factory/rts/manifests/terrain-registry.json';terrain=read(terrain_path)
    terrain['assets']=[a for a in terrain['assets'] if a['id']!='courtyard-earth']
    terrain['assets'].append(dict(id='courtyard-earth',status='published',runtime_publish_allowed=True,runtime='/assets/games/rts/terrain/dirt-road.png',
        source='public/assets/games/rts/terrain/dirt-road.webp',source_sha256=sha(ROOT/'public/assets/games/rts/terrain/dirt-road.webp'),
        candidate=f'{RUN.relative_to(ROOT).as_posix()}/raw/dirt-road.png',sha256=sha(RUN/'raw/dirt-road.png'),bytes=(RUN/'raw/dirt-road.png').stat().st_size,
        postprocess='Exact decoded RGB conversion from the approved original WebP to PNG; no new artwork',qa=f'{RUN.relative_to(ROOT).as_posix()}/qa/root-review.json'))
    save(terrain_path,terrain)
    kitpath=ROOT/'art-factory/rts/manifests/modular-kit-registry.json';kit=read(kitpath)
    kit.setdefault('refinements',[]).append(dict(id='assembly-refinement-v2',kit=f'{RUN.relative_to(ROOT).as_posix()}/kit.json',
        status='published',runtime_publish_allowed=True,published_prefabs=IDS[:3],contract='art-factory/rts/contracts/assembly-refinement.json'))
    save(kitpath,kit)
    contract_path=ROOT/'art-factory/rts/contracts/assembly-refinement.json';contract=read(contract_path)
    contract.update(status='published',runtime_publish_allowed=True,publication_scope='local worktree only');save(contract_path,contract)
    save(RUN/'qa/publication.json',dict(status='published',scope='local worktree only',assets=files,performance=str(perf_path.relative_to(ROOT)).replace('\\','/')))
    print(json.dumps(dict(published=[r['id'] for r in files],performance=perf['medianFps'])))


if __name__=='__main__':main()
