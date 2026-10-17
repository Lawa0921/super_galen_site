"""Publish the exact original guard reviewed in Blender and real Three.js.

This command does not create an approval. A separate root review, structural
audit and browser/Khronos reports must already identify these exact files.
"""
import argparse
import hashlib
import json
from pathlib import Path

ROOT=Path(__file__).resolve().parents[3]
FACTORY=ROOT/'art-factory/rts'
CLIPS=['Attack','Death','Hurt','Idle','Walk']

def read(path):
    return json.loads(path.read_text(encoding='utf-8'))

def digest(data):
    return hashlib.sha256(data).hexdigest()

def write(path,value):
    temporary=path.with_name(path.name+'.next')
    temporary.write_text(json.dumps(value,ensure_ascii=False,indent=2)+'\n',encoding='utf-8',newline='\n')
    temporary.replace(path)

def preflight(run):
    run=Path(run)
    review=read(run/'qa/root-review.json')
    structure=read(run/'qa/runtime-structure.json')
    bounds=read(run/'qa/runtime-bounds.json')
    webgl=read(run/'qa/three.json')
    khronos=read(run/'qa/khronos.json')
    if review.get('status')!='approved-for-runtime':
        raise ValueError('Full-body visual review has not approved this candidate')
    if structure.get('status')!='pass' or webgl.get('status')!='pass':
        raise ValueError('Structural and browser checks must pass')
    if bounds.get('status')!='pass':
        raise ValueError('Exported skin bounds must cover every sampled action')
    if webgl.get('errors') or webgl.get('clips')!=CLIPS or webgl.get('lowClips')!=CLIPS:
        raise ValueError('Browser errors or missing five-action LOD coverage')
    if any(webgl.get('changed',{}).get(name) is not True for name in ('walk','attack','hurt','death')):
        raise ValueError('Browser action changes are incomplete')
    if khronos.get('errors')!=0 or any(a.get('issues',{}).get('numErrors')!=0 for a in khronos.get('assets',[])):
        raise ValueError('Khronos validation must contain no errors')
    buffers=[(run/'candidate'/f'original-guard-assembly-lod{lod}.glb').read_bytes() for lod in (0,1)]
    assets=[{'lod':lod,'sha256':digest(data),'bytes':len(data)} for lod,data in enumerate(buffers)]
    expected={a['lod']:a['sha256'] for a in assets}
    for label,rows in (('visual',review.get('assets',[])),('structural',structure.get('lods',[])),('skin bounds',bounds.get('lods',[])),('browser',webgl.get('sourceAssets',[]))):
        checked={(int(a['lod'][-1]) if a.get('lod') in ('lod0','lod1') else a.get('lod')):a.get('sha256') for a in rows}
        if len(rows)!=2 or checked!=expected:
            raise ValueError(f'{label} report hash differs from current candidate')
    checked=[a.get('sha256') for a in khronos.get('assets',[])]
    if len(checked)!=2 or sorted(checked)!=sorted(expected.values()):
        raise ValueError('Khronos report hash differs from current candidate')
    source=run/'candidate/original-guard-assembly.blend'
    source_hash=digest(source.read_bytes())
    if review.get('source_sha256')!=source_hash:
        raise ValueError('Editable source differs from the reviewed source')
    if not review.get('evidence') or any(not (run/'qa'/name).is_file() for name in review['evidence']):
        raise ValueError('Visual evidence files are missing')
    return {'assets':assets,'buffers':buffers,'source':source,'source_sha256':source_hash,'review':review}

def publish(run):
    run=Path(run).resolve()
    if not run.is_relative_to(FACTORY/'runs'):
        raise ValueError('Candidate must be inside this repository art factory')
    checked=preflight(run)
    runtime=ROOT/'public/assets/games/rts'
    registry_path=FACTORY/'manifests/unit-registry.json'
    manifest_path=runtime/'model-registry.json'
    registry,manifest=read(registry_path),read(manifest_path)
    contract_path=FACTORY/'contracts/original-guard-assembly.json'
    previous_path=FACTORY/'contracts/guard-neural-pilot.json'
    contract,previous=read(contract_path),read(previous_path)
    records=[]
    for asset,data in zip(checked['assets'],checked['buffers']):
        lod=asset['lod']
        asset_id='guard' if lod==0 else 'guard-lod1'
        target=runtime/'models'/f'{asset_id}.glb'
        temporary=target.with_name(target.name+'.next')
        temporary.write_bytes(data)
        temporary.replace(target)
        records.append({'id':asset_id,'status':'published','url':f'/assets/games/rts/models/{asset_id}.glb',
            'bytes':asset['bytes'],'sha256':asset['sha256'],
            'candidate':(run/'candidate'/f'original-guard-assembly-lod{lod}.glb').relative_to(ROOT).as_posix(),
            'source':checked['source'].relative_to(ROOT).as_posix(),'source_sha256':checked['source_sha256'],
            'qa':(run/'qa/root-review.json').relative_to(ROOT).as_posix(),
            'visual_review':'Root reviewed the complete original guard, five actions, both LODs and team colors in the actual renderer.',
            'animation_review':'Authored original clips and rig; both GLB scene rtsMotion records match the simulator timing contract.',
            'known_visual_limits':checked['review'].get('known_visual_limits',[]),
            'runtime_publish_allowed':True})
    registry['assets']=[a for a in registry['assets'] if a['id'] not in ('guard','guard-lod1')]+records
    manifest['assets']['guard']={'url':records[0]['url'],'lod1':records[1]['url'],'status':'published','scale':1,'yaw':0}
    write(registry_path,registry)
    write(manifest_path,manifest)
    contract.update({'status':'published','runtime_publish_allowed':True,
        'runtime_assets':records,'root_review':(run/'qa/root-review.json').relative_to(ROOT).as_posix(),
        'user_overall_art_acceptance':'pending-user-preview'})
    # The build tool remains isolated; this separately reviewed publisher owns
    # the explicit copy into the local runtime.
    contract['build_tool_scope']='Candidate generation only; no src/public changes. Local publication is performed by publish_original_guard.py after independent review.'
    forbidden=contract.get('source_rules',{}).get('forbidden',[])
    contract.setdefault('source_rules',{})['forbidden']=[item for item in forbidden if item not in ('runtime publication','altering src or public')]
    write(contract_path,contract)
    previous.update({'status':'superseded-by-original-guard-assembly','runtime_publish_allowed':False,
        'superseded_by':'art-factory/rts/contracts/original-guard-assembly.json'})
    if 'production_v2' in previous:
        previous['production_v2'].update({'status':'superseded','runtime_publish_allowed':False})
    write(previous_path,previous)
    result={'published':'guard','assets':checked['assets'],'source_sha256':checked['source_sha256'],
            'scope':'local runtime only; no push or deployment'}
    write(run/'qa/publication.json',result)
    return result

if __name__=='__main__':
    parser=argparse.ArgumentParser()
    parser.add_argument('--run',type=Path,default=FACTORY/'runs/original-guard-assembly/2026-10-05')
    parser.add_argument('--check-only',action='store_true')
    args=parser.parse_args()
    if args.check_only:
        result=preflight(args.run)
        print(json.dumps({'status':'ready','assets':result['assets']}))
    else:
        print(json.dumps(publish(args.run)))
