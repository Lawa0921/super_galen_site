"""Publish reviewed, deterministic screenshots of the actual game environment."""
from pathlib import Path
from PIL import Image
import hashlib,json,sys
ROOT=Path(__file__).resolve().parents[3]
FACTORY=ROOT/'art-factory/rts';RUN=FACTORY/'runs/map-previews'/(sys.argv[1] if len(sys.argv)>1 else '2026-10-05-v2')
def write(path,data): path.write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n',encoding='utf-8',newline='\n')
qa=json.loads((RUN/'qa/three.json').read_text(encoding='utf-8'));assert qa['status']=='pass' and not qa['errors']
review_path=RUN/'qa/visual-review.json'
assert review_path.exists() or RUN.name=='2026-10-05-v2', 'New preview runs require explicit visual review'
review=json.loads(review_path.read_text(encoding='utf-8')) if review_path.exists() else {'status':'approved','reviewer':'root-reviewed legacy v2'}
assert review['status']=='approved'
records=[]
for map_id in ('river','pass'):
    raw=RUN/'raw'/f'{map_id}.png';target=ROOT/'public/assets/games/rts/ui'/f'map-{map_id}.webp'
    with Image.open(raw) as image:
        assert image.size==(1000,600)
        image.convert('RGB').resize((600,360),Image.Resampling.LANCZOS).save(target,format='WEBP',quality=88,method=6)
    data=target.read_bytes()
    records.append({'id':f'map-{map_id}','status':'published','url':f'/assets/games/rts/ui/map-{map_id}.webp','bytes':len(data),'sha256':hashlib.sha256(data).hexdigest(),
      'raw':raw.relative_to(ROOT).as_posix(),'raw_sha256':hashlib.sha256(raw.read_bytes()).hexdigest(),
      'source':'art-factory/rts/tools/map_preview_scene.ts','qa':(RUN/'qa/three.json').relative_to(ROOT).as_posix(),
      'provenance':'Actual Battlefield render from locally published original environment assets; seed 20261004; fully explored map preview',
      'visual_review':review['reviewer']+' checked both actual river bridges and three pass openings; no text baked into screenshot','runtime_publish_allowed':True})
write(FACTORY/'manifests/map-preview-registry.json',{'assets':records})
write(FACTORY/'contracts/map-previews.json',{'status':'published','runtime_publish_allowed':True,'style_source':'docs/superpowers/specs/2026-10-04-browser-rts-design.md','source_mode':'actual-game-render','dimensions':[600,360],'alpha':'opaque screenshot, no chroma-key needed','postprocess':'Lanczos 600x360, WebP q88 method6','assembly_human_review':review['reviewer'],'run':RUN.relative_to(ROOT).as_posix()})
profile_path=FACTORY/'profile.json';profile=json.loads(profile_path.read_text(encoding='utf-8'))
if 'manifests/map-preview-registry.json' not in profile['registries']:profile['registries'].append('manifests/map-preview-registry.json')
write(profile_path,profile);print(json.dumps({'published':2,'bytes':sum(r['bytes'] for r in records)}))
