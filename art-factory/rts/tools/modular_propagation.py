"""Isolated edit/rebuild proof. Never mutates the approved base library/runtime."""
import bpy
import hashlib
import json
import shutil
import sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parent))
from modular_extract import ROOT,RUN,save,mesh_signature
from modular_assemble import assemble
from modular_contract import sha

def main():
    manifest=json.loads((RUN/'kit.json').read_text(encoding='utf-8'))
    baseline_sha=sha(RUN/manifest['library']['path'])
    target=next(ident for ident,p in manifest['parts'].items() if p['category']=='window' and set(p['used_by'])=={'townhall-tier2','townhall-tier3'})
    probe=RUN/'qa/propagation';(probe/'raw').mkdir(parents=True,exist_ok=True);(probe/'recipes').mkdir(exist_ok=True)
    shutil.copyfile(RUN/manifest['source_lock'],probe/'raw/source-lock.json')
    for asset in ['townhall-tier2','townhall-tier3']:shutil.copyfile(RUN/'recipes'/f'{asset}.json',probe/'recipes'/f'{asset}.json')
    bpy.ops.wm.open_mainfile(filepath=str(RUN/manifest['library']['path']))
    collection=bpy.data.collections[manifest['parts'][target]['collection']]
    member=next(o for o in collection.objects if o.get('source_node','').startswith('Lead vertical mullion'))
    for vertex in member.data.vertices:vertex.co.x+=.04
    member.data.update();collection['part_version']=2
    manifest['parts'][target]['version']=2
    manifest['parts'][target]['geometry_sha256']=hashlib.sha256(('window:'+':'.join(sorted(mesh_signature(o.data) for o in collection.objects))).encode()).hexdigest()
    bpy.ops.wm.save_as_mainfile(filepath=str(probe/'raw/kingdom-kit.blend'))
    manifest['library']['sha256']=sha(probe/'raw/kingdom-kit.blend');manifest['test_fixture_only']=True
    save(probe/'kit.json',manifest)
    results=[]
    for asset in ['townhall-tier2','townhall-tier3']:
        before=json.loads((RUN/'qa/assemblies'/f'{asset}.json').read_text(encoding='utf-8'))
        after=assemble(asset,probe)
        recipe=json.loads((probe/'recipes'/f'{asset}.json').read_text(encoding='utf-8'))
        expected=sorted(i['id'] for i in recipe['instances'] if i['part']==target)
        changed=sorted(i for i in before['part_mesh_signatures'] if before['part_mesh_signatures'][i]!=after['part_mesh_signatures'][i])
        assert changed==expected and changed,(asset,changed,expected)
        assert before['sha256']!=after['sha256']
        results.append({'asset':asset,'changed_instances':changed,'unmodified_instances':len(recipe['instances'])-len(changed),'before_sha256':before['sha256'],'after_sha256':after['sha256']})
    assert sha(RUN/'raw/kingdom-kit.blend')==baseline_sha
    save(RUN/'qa/propagation.json',{'status':'passed','test_fixture_only':True,'shared_part':target,'edit':'Translate one original lead mullion +0.04m in local X; bump part version to 2 in isolated library','results':results,'original_library_unchanged':True,'runtime_publish_allowed':False})
    print('PROPAGATION_PASSED',target,flush=True)
if __name__=='__main__':main()
