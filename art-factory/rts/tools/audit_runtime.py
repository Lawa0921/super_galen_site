"""Audit published art paths and hashes without accepting incomplete model packs."""
from pathlib import Path
import hashlib,json
from runtime_readiness import quality_summary
from asset_source_integrity import verify_asset_sources

REQUIRED=['worker','guard','crossbow','priest','knight','siege','commander','neutral-raider','townhall','townhall-tier2','townhall-tier3','house','barracks','lumbermill','forge','altar','tower','chapel','stable','workshop','stone-bridge','oak','pine','rock','gold-mine','timber-pile','bolt','heavy-bolt','river-gatehouse','river-shrine','highland-watchtower','quarry-ruins']


def require(condition,message):
    if not condition:
        raise ValueError(message)


def audit(root:Path):
    root=root.resolve(); factory=root/'art-factory/rts'
    runtime=(root/'public/assets/games/rts').resolve()
    profile=json.loads((factory/'profile.json').read_text(encoding='utf-8'))
    declared={}; current_hashes={}; source_checks=[]
    for registry in profile['registries']:
        data=json.loads((factory/registry).read_text(encoding='utf-8'))
        if 'assets' not in data:
            require('library' in data and 'candidate_prefabs' in data,f'Invalid registry: {registry}')
            continue  # Authoring libraries are not runtime asset registries.
        for asset in data['assets']:
            url=asset.get('runtime',asset.get('url'))
            require(isinstance(url,str) and url.startswith('/assets/games/rts/'),f'Invalid runtime URL: {url}')
            target=(root/'public'/url.lstrip('/')).resolve()
            require(target.is_relative_to(runtime),f'Runtime outside asset root: {target}')
            require(asset['status']=='published',f'Unpublished asset: {asset["id"]}')
            require(target.is_file(),f'Missing runtime asset: {target}')
            require(hashlib.sha256(target.read_bytes()).hexdigest()==asset['sha256'],f'runtime SHA256 mismatch: {asset["id"]}')
            require(target not in declared,f'Duplicate runtime asset: {url}')
            declared[target]=asset['id']; current_hashes[url]=asset['sha256']
            source_checks.append({'asset':asset['id'],'registry':registry,**verify_asset_sources(root,asset)})
    actual={p.resolve() for p in runtime.rglob('*') if p.is_file() and p.suffix in ('.glb','.png','.webp','.jpg','.jpeg')}
    require(actual==set(declared),{'unregistered':[str(p) for p in actual-set(declared)],'missing':[str(p) for p in set(declared)-actual]})
    manifest=json.loads((runtime/'model-registry.json').read_text(encoding='utf-8'))
    missing=[asset for asset in REQUIRED if asset not in manifest['assets']]
    quality_path=factory/'manifests/commercial-readiness.json'
    quality=json.loads(quality_path.read_text(encoding='utf-8')) if quality_path.is_file() else None
    report={'published_path_qa':'passed','asset_count':len(actual),'bytes':sum(p.stat().st_size for p in actual),'missing_required_models':missing,
            'declared_source_hash_qa':'passed','source_checks':source_checks,
            'source_binding_complete':all(not check['unbound_fields'] and not check['unresolved_hash_fields'] for check in source_checks),
            **quality_summary(missing,current_hashes,quality)}
    (factory/'manifests/runtime-qa.json').write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8',newline='\n')
    return report


if __name__=='__main__':
    print(json.dumps(audit(Path(__file__).resolve().parents[3])))
