"""Controlled local publication after structural and actual-browser QA.

No deployment. Historical sources and registry snapshots are kept for rollback.
"""
import json
import shutil
from detail_materials import ROOT,RUN,TEXTURES,BASE,sha,read_glb


def load(path):return json.loads(path.read_text(encoding='utf-8'))
def write(path,value):path.write_text(json.dumps(value,indent=2,ensure_ascii=False)+'\n',encoding='utf-8')


def main():
    build=load(RUN/'qa/build.json');structural=load(RUN/'qa/structural.json')
    browser=load(RUN/'qa/browser/report.json');assembly=load(RUN/'qa/candidate-assembly/assembly.json')
    review=load(RUN/'qa/root-review.json')
    assert structural['status']=='passed' and browser['status']=='passed' and not browser['errors']
    assert review['runtime_publish_allowed'] is True
    assert assembly['candidateDetail'] and {r['map'] for r in assembly['results']}=={'river','pass'}
    assert all(not r['errors'] and r['depletion']['remaining']==0 for r in assembly['results'])
    audited={r['filename']:r for r in structural['rows']}
    snapshots=RUN/'raw/previous-registries';snapshots.mkdir(parents=True,exist_ok=True)
    registries={}
    for name in ('building','prop','unit'):
        path=ROOT/f'art-factory/rts/manifests/{name}-registry.json'
        if not (snapshots/path.name).exists():shutil.copy2(path,snapshots/path.name)
        registries[name]=(path,load(path))
    material_names=set()
    for row in build:
        candidate=ROOT/row['candidate'];filename=candidate.name;assert sha(candidate)==row['sha256']==audited[filename]['sha256']
        assert sha(ROOT/row['source'])==row['source_sha256']
        doc,_=read_glb(candidate)
        for image in doc.get('images',[]):
            if image.get('uri','').startswith(BASE):material_names.add(image['uri'].removeprefix(BASE))
        key='unit' if 'lod' in row else 'prop' if row['id']=='rock' else 'building'
        ident=row['id']+('-lod1' if row.get('lod')==1 else '')
        entry=next(a for a in registries[key][1]['assets'] if a['id']==ident)
        target=ROOT/'public'/entry['url'].lstrip('/')
        # Publication overwrites only the known prior revision, or the exact same candidate on a rerun.
        assert sha(target) in (entry['sha256'],row['sha256'])
        shutil.copy2(candidate,target);assert sha(target)==row['sha256']
        entry.update(status='published',sha256=row['sha256'],bytes=target.stat().st_size,
                     candidate=str(candidate.relative_to(ROOT)).replace('\\','/'),source=row['source'].replace('\\','/'),source_sha256=row['source_sha256'],
                     qa=str((RUN/'qa/structural.json').relative_to(ROOT)).replace('\\','/'),
                     root_review=str((RUN/'qa/root-review.json').relative_to(ROOT)).replace('\\','/'),
                     assembly_evidence=str((RUN/'qa/published/assembly.json').relative_to(ROOT)).replace('\\','/'),
                     visual_review='Original surface and architectural refinement; source and actual WebGL A/B reviewed.',
                     assembly_review='Two-map selection, fog and gather depletion passed; user overall art acceptance pending.',
                     runtime_publish_allowed=True,publication_scope='local worktree only',user_overall_art_acceptance='pending')
    destination=ROOT/'public/assets/games/rts/materials/detail-v1';destination.mkdir(parents=True,exist_ok=True)
    materials=[]
    for name in sorted(material_names):
        source=TEXTURES/name;target=destination/name;shutil.copy2(source,target)
        materials.append({'id':name,'url':'/assets/games/rts/materials/detail-v1/'+name,'candidate':str(source.relative_to(ROOT)).replace('\\','/'),'sha256':sha(target),'bytes':target.stat().st_size,'status':'published','runtime_publish_allowed':True})
    for path,registry in registries.values():write(path,registry)
    write(ROOT/'art-factory/rts/manifests/detail-material-registry.json',{'contract':'art-factory/rts/contracts/detail-refinement.json','source_qa':str((RUN/'qa/materials.json').relative_to(ROOT)).replace('\\','/'),'assets':materials})
    contract=ROOT/'art-factory/rts/contracts/detail-refinement.json';data=load(contract)
    data.update(status='published',runtime_publish_allowed=True,assembly_human_review='Root reviewed actual WebGL candidate and two maps; user overall art acceptance pending',qa=str((RUN/'qa/root-review.json').relative_to(ROOT)).replace('\\','/'))
    write(contract,data)
    write(RUN/'qa/publication.json',{'status':'published-local','models':len(build),'materials':len(materials),'material_bytes':sum(m['bytes'] for m in materials),'runtime_models':[{'file':r['filename'],'sha256':r['sha256']} for r in structural['rows']],'user_overall_art_acceptance':'pending'})
    print('Published local:',len(build),'models and',len(materials),'shared texture files')


if __name__=='__main__':main()
