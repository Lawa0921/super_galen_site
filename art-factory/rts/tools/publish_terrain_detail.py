"""Publish root-reviewed generated terrain after both actual map assemblies pass."""
from pathlib import Path
from PIL import Image
import hashlib,json,shutil
ROOT=Path(__file__).resolve().parents[3];FACTORY=ROOT/'art-factory/rts';RUN=FACTORY/'runs/terrain-detail/2026-10-05-v1'
def read(path):return json.loads(path.read_text(encoding='utf-8'))
def write(path,data):path.write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n',encoding='utf-8',newline='\n')
def sha(path):return hashlib.sha256(path.read_bytes()).hexdigest()
scene=read(FACTORY/'runs/map-previews/2026-10-05-v2/qa/three.json');assert scene['status']=='pass' and not scene['errors']
road=RUN/'candidate/dirt-road-side-alpha.png';optimized=RUN/'candidate/dirt-road-side-alpha.webp'
with Image.open(road) as source:
    source.save(optimized,format='WEBP',quality=80,method=6,exact=True)
    with Image.open(optimized) as decoded:
        assert decoded.size==(1024,1024) and decoded.mode=='RGBA'
        assert decoded.getchannel('A').tobytes()==source.getchannel('A').tobytes()
records=[]
for asset_id,candidate in [('dirt-road',optimized),('river-water',RUN/'candidate/river-water.webp')]:
    target=ROOT/'public/assets/games/rts/terrain'/f'{asset_id}.webp';shutil.copyfile(candidate,target)
    raw=RUN/'raw'/f'{asset_id}-generated.png'
    records.append({'id':asset_id,'status':'published','url':f'/assets/games/rts/terrain/{asset_id}.webp','bytes':target.stat().st_size,'sha256':sha(target),
      'raw':raw.relative_to(ROOT).as_posix(),'raw_sha256':sha(raw),'candidate':candidate.relative_to(ROOT).as_posix(),
      'source':'art-factory/rts/tools/terrain_detail_process.py','qa':(RUN/'qa/root-review.json').relative_to(ROOT).as_posix(),
      'visual_review':'Root inspected tile/contact and both actual Battlefield routes, bridges and pass openings','runtime_publish_allowed':True})
write(RUN/'qa/root-review.json',{'status':'approved-for-runtime','reviewer':'root','maps':['river','pass'],'webgl_qa':'art-factory/rts/runs/map-previews/2026-10-05-v2/qa/three.json',
  'road_postprocess':'Generated source -> tiled 1024 RGBA side-alpha PNG -> WebP q80 method6 exact; decoded alpha byte-identical',
  'road_png_sha256':sha(road),'road_webp_sha256':sha(optimized),'user_visual_acceptance':'Pending assembled user preview; not claimed'})
registry=read(FACTORY/'manifests/terrain-registry.json');ids={r['id'] for r in records};registry['assets']=[r for r in registry['assets'] if r['id'] not in ids]+records;write(FACTORY/'manifests/terrain-registry.json',registry)
contract=read(FACTORY/'contracts/terrain-detail.json');contract.update(status='published',runtime_publish_allowed=True,assembly_human_review='root actual maps reviewed; user preview available at delivery',runtime_road='public/assets/games/rts/terrain/dirt-road.webp',runtime_water='public/assets/games/rts/terrain/river-water.webp');write(FACTORY/'contracts/terrain-detail.json',contract)
print(json.dumps({'files':len(records),'bytes':sum(r['bytes'] for r in records)}))
