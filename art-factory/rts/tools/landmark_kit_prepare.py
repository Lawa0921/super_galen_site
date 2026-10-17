"""Freeze only required original project inputs; no runtime writes."""
import hashlib,json,shutil
from pathlib import Path
from PIL import Image
ROOT=Path(__file__).resolve().parents[3]
RUN=ROOT/'art-factory/rts/runs/landmark-kit/2026-10-08-v1'
MAIN=Path('C:/Users/bag57/projects/super_galen_site/.claude/worktrees/rts')
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def prepare():
    for p in ('raw/inputs','candidate/textures','qa','prompts','raw/recipe'): (RUN/p).mkdir(parents=True,exist_ok=True)
    paths=[
        'art-factory/rts/runs/kingdom-buildings/2026-10-04-v2/contract.json',
        'art-factory/rts/runs/kingdom-buildings/2026-10-04-v2/raw/textures/ivory-ashlar-source.png',
        'art-factory/rts/contracts/siege.json',
        'art-factory/rts/runs/kingdom-siege/2026-10-04-original/raw/textures/hewn-oak-source.png',
        'art-factory/rts/runs/kingdom-siege/2026-10-04-original/candidate/textures/hewn-oak-basecolor.jpg',
        'art-factory/rts/contracts/original-guard-surface-materials.json',
        'art-factory/rts/runs/original-guard-surface-materials/2026-10-05/raw/surface-atlas.png',
        'art-factory/rts/runs/original-guard-surface-materials/2026-10-05/candidate/brass-512.png',
        'art-factory/rts/runs/original-guard-surface-materials/2026-10-05/prompts/surface-atlas.txt',
        'art-factory/rts/runs/original-guard-surface-materials/2026-10-05/prompts/surface-atlas-correction.txt',
        'art-factory/rts/runs/detail-refinement/2026-10-07-v1/qa/materials.json',
        'art-factory/rts/tools/detail_materials.py',
        'art-factory/rts/tools/siege_texture.py',
        'art-factory/rts/tools/original_guard_surface_material.py',
        'art-factory/rts/runs/original-guard-surface-materials/2026-10-05/qa/tiles.json',
    ]
    # Optional source recipe is recorded as missing, never fabricated.
    sources=[]
    for rel in paths:
        src=MAIN/rel
        if not src.exists():sources.append({'original_path':str(src),'missing':True});continue
        dst=RUN/'raw/inputs'/rel.removeprefix('art-factory/rts/');dst.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(src,dst)
        sources.append({'original_path':str(src),'frozen':dst.relative_to(ROOT).as_posix(),'sha256':sha(src),'bytes':src.stat().st_size})
    for surface,size in [('ashlar',384),('cutstone',256),('oak',256),('brass',128)]:
        for suffix in ('color.jpg','normal.png','mr.png'):
            src=MAIN/'art-factory/rts/runs/detail-refinement/2026-10-07-v1/candidate/materials'/f'{surface}-{suffix}'
            frozen=RUN/'raw/inputs/maps'/src.name;frozen.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(src,frozen)
            dst=RUN/'candidate/textures'/src.name
            im=Image.open(frozen).convert('RGB');outsize=size if suffix=='color.jpg' else 128
            im=im.resize((outsize,outsize),Image.Resampling.LANCZOS)
            if suffix.endswith('jpg'):im.save(dst,quality=84,subsampling=0,optimize=True)
            else:im.save(dst,optimize=True)
            sources.append({'original_path':str(src),'frozen':frozen.relative_to(ROOT).as_posix(),'sha256':sha(src),'candidate':dst.relative_to(ROOT).as_posix(),'candidate_sha256':sha(dst),'candidate_bytes':dst.stat().st_size,'dimensions':[outsize,outsize],'operation':'deterministic Lanczos resize; JPEG84/PNG; generated source color retained; no painted pixels'})
    (RUN/'raw/sources.json').write_text(json.dumps({'source_mode':'original authored Blender control meshes expressly authorized by task brief; existing builtin-imagegen material pixels; no third-party downloads','sources':sources},indent=2)+'\n')
    brief=ROOT/'.superpowers/sdd/2026-10-08-rts-3d-landmark-kit/task-1-brief.md'
    shutil.copy2(brief,RUN/'prompts/authored-model-brief.md')
    shutil.copy2(ROOT/'docs/superpowers/specs/2026-10-04-browser-rts-design.md',RUN/'raw/inputs/style-source.md')
    contract={'id':'landmark-kit-2026-10-08','screen_id':'rts-river-and-highland-landmarks','screen_breakdown':{'river':['river-gatehouse','river-shrine'],'highland':['highland-watchtower','quarry-ruins'],'placements':'four instances per map, each archetype mirrored pair; runtime integration deferred'},'style_source':'docs/superpowers/specs/2026-10-04-browser-rts-design.md','source_mode':'original Blender recipe and reused original imagegen PBR derivatives','category':'3d-modular-environment','mode_inference_decision':{'selected_profile':'opaque_background','confidence':'high','extension':'3D closed manifold mesh; RGB opaque UV/PBR maps; deterministic export/LOD and reimport QA','rationale':'Opaque 3D stone/timber landmarks; alpha chroma-key is inapplicable'},'status':'candidate','runtime_publish_allowed':False,'asset_generation_manual_review':False,'assembly_human_review':'pending independent review and root runtime integration','footprint':{'horizontal':[-1.9,1.9],'ground_pivot':[0,0,0],'source_up':'Z','glb_up':'Y','scale':1,'min_ground':-.08,'max_height':5.2},'limits':{'lod0_triangle_target':[6000,16000],'lod1_triangle_target':[2000,5000],'max_materials':4,'per_map_pair_compressed_download_target_bytes':2000000},'assets':['river-gatehouse','river-shrine','highland-watchtower','quarry-ruins'],'materials':['OriginalIvoryAshlar','OriginalCutLimestone','OriginalHewnOak','OriginalWarmBrass'],'forbidden':['third-party models or motions','readable text','flags','resource icons','simple untreated primitive stacks','zero-thickness walls','floating modules','runtime publication'],'qa_gates':['red-green geometry tests','true GLB reimport for all eight LODs','bounds/pivot/axis/unit scales','closed thick components, intentional openings described','nondegenerate triangles and finite UVs/normals','packed and embedded images','Khronos validator zero errors','front/back/two oblique views per model and RTS assembly reimport renders','source and recipe SHA256'], 'intentional_openings':{'river-gatehouse':'Arch-shaped recess above a full timber barricade and rubble-filled entry; decorative blocked footprint, never a traversable gate','river-shrine':'Exposed terrace and broken columns; every component capped with thickness','highland-watchtower':'Two real windows through a 0.28 m thick wall, plus roofless interior and irregular ruined crown; wall shell has sill/reveal surfaces, no open mesh boundary','quarry-ruins':'Open timber lifting frame and worked-rock fracture grooves; rope tube capped, every stone solid'}}
    out=ROOT/'art-factory/rts/contracts/landmark-kit-2026-10-08.json';out.parent.mkdir(parents=True,exist_ok=True);out.write_text(json.dumps(contract,indent=2)+'\n')
    print(json.dumps({'frozen_sources':len(sources),'missing':[s['original_path'] for s in sources if s.get('missing')],'texture_bytes':sum(p.stat().st_size for p in (RUN/'candidate/textures').iterdir())}))
if __name__=='__main__':prepare()
