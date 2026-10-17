"""Controlled local publication of reviewed recipe-built original prefabs."""
import json
import shutil
from pathlib import Path
from modular_contract import sha,verify_sources,resolve_recipe

ROOT=Path(__file__).resolve().parents[3]
RUN=ROOT/'art-factory/rts/runs/modular-kingdom/2026-10-08-v1'
def read(path):return json.loads(path.read_text(encoding='utf-8'))
def write(path,value):path.write_text(json.dumps(value,ensure_ascii=False,indent=2)+'\n',encoding='utf-8',newline='\n')
def rel(path):return path.relative_to(ROOT).as_posix()

def main():
    kit=read(RUN/'kit.json');verify_sources(RUN,[kit['library'],{'path':kit['source_lock'],'sha256':kit['source_lock_sha256']},*kit['recipes']])
    verify_sources(ROOT,read(RUN/kit['source_lock']))
    structural=read(RUN/'qa/structural.json');browser=read(RUN/'qa/browser/report.json');review=read(RUN/'qa/root-review.json');propagation=read(RUN/'qa/propagation.json')
    assembly=read(RUN/'qa/candidate-assembly/assembly.json')
    assert structural['status']==browser['status']==propagation['status']=='passed' and not browser['errors']
    assert review['runtime_publish_allowed'] and review['kit_sha256']==kit['library']['sha256']
    assert {r['map'] for r in assembly['results']}=={'river','pass'} and all(not r['errors'] and r['depletion']['remaining']==0 for r in assembly['results'])
    path=ROOT/'art-factory/rts/manifests/building-registry.json';registry=read(path)
    snapshot=RUN/'raw/building-registry-before.json'
    if not snapshot.exists():shutil.copy2(path,snapshot)
    audited={r['id']:r for r in structural['rows']};work=[]
    for recipe_entry in kit['recipes']:
        ident=recipe_entry['id'];recipe=read(RUN/recipe_entry['path']);resolve_recipe(recipe,kit['parts'])
        build=read(RUN/'qa/assemblies'/f'{ident}.json');entry=next(a for a in registry['assets'] if a['id']==ident)
        candidate=ROOT/build['candidate'];source=ROOT/build['source'];target=ROOT/'public'/entry['url'].lstrip('/')
        assert build['kit_sha256']==kit['library']['sha256'] and build['recipe_sha256']==recipe_entry['sha256']
        assert sha(source)==build['source_sha256'] and sha(candidate)==build['sha256']==audited[ident]['sha256']
        assert sha(target) in (entry['sha256'],build['sha256'])
        work.append((entry,recipe,build,candidate,source,target))
    # All sources/targets verified before the first runtime replacement.
    for entry,recipe,build,candidate,source,target in work:
        shutil.copy2(candidate,target);assert sha(target)==build['sha256']
        entry.update(status='published',sha256=build['sha256'],bytes=target.stat().st_size,source=rel(source),source_sha256=build['source_sha256'],candidate=rel(candidate),
            recipe=build['recipe'],recipe_sha256=build['recipe_sha256'],modular_kit=rel(RUN/'kit.json'),source_dependencies=[rel(RUN/kit['library']['path'])],
            qa=rel(RUN/'qa/structural.json'),root_review=rel(RUN/'qa/root-review.json'),assembly_evidence=rel(RUN/'qa/published/assembly.json'),
            visual_review='Linked original collection assembly, exploded and single-part browser review; source geometry retained with local window moulding UV exception.',
            assembly_review='Both maps selection/fog/gather depletion passed; overall user art acceptance pending.',runtime_publish_allowed=True,publication_scope='local worktree only')
    write(path,registry)
    write(ROOT/'art-factory/rts/manifests/modular-kit-registry.json',{'contract':'art-factory/rts/contracts/modular-kingdom.json','kit':rel(RUN/'kit.json'),
        'library':{'source':rel(RUN/kit['library']['path']),'sha256':kit['library']['sha256'],'status':'approved','runtime_publish_allowed':False},
        'parts':len(kit['parts']),'cross_prefab_shared_parts':sum(len(p['used_by'])>1 for p in kit['parts'].values()),
        'published_prefabs':[{'id':e['id'],'url':e['url'],'sha256':b['sha256'],'recipe':b['recipe'],'status':'published','runtime_publish_allowed':True} for e,r,b,c,s,t in work]})
    contract=ROOT/'art-factory/rts/contracts/modular-kingdom.json';data=read(contract);data.update(status='published',runtime_publish_allowed=True,qa=rel(RUN/'qa/root-review.json'));write(contract,data)
    screens_path=ROOT/'art-factory/rts/manifests/screen-breakdown.json';screens=read(screens_path)
    screens['screens']=[s for s in screens['screens'] if s['id']!='rts-modular-kingdom-review']
    screens['screens'].insert(0,{'id':'rts-modular-kingdom-review','assets':[e['id'] for e,r,b,c,s,t in work],'contract':rel(contract),'runtime':'public/assets/games/rts/models',
        'review_surface':'http://127.0.0.1:4334/modular-kingdom/','processing':'Original linked collection kit and recipe assembly; material-batched GLB','status':'published','runtime_publish_allowed':True,'assembly_status':'root-reviewed; user-overall-art-acceptance-pending'})
    write(screens_path,screens)
    write(RUN/'qa/publication.json',{'status':'published-local','models':[{'id':e['id'],'sha256':b['sha256'],'source':b['source']} for e,r,b,c,s,t in work],
        'kit_sha256':kit['library']['sha256'],'geometry_and_draw_budget':'same as previous 13 models within floating-point precision','user_art_acceptance':'pending','external_deployment':False})
    print(json.dumps({'published_local_models':len(work),'parts':len(kit['parts'])}))

if __name__=='__main__':main()
