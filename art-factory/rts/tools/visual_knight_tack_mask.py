"""Use original saddlecloth texels as the mounted unit's team-colour mask."""
import argparse,hashlib,json,sys
from pathlib import Path
import numpy as np
from PIL import Image,ImageDraw,ImageFilter
sys.path.insert(0,str(Path(__file__).parent))
from human_units_team_mask import blue_fabric_mask,feather_mask,category_statistics
p=argparse.ArgumentParser();p.add_argument('--source',type=Path,required=True);p.add_argument('--run',type=Path,required=True);a=p.parse_args()
run=a.run.resolve();(run/'candidate').mkdir(parents=True,exist_ok=True);(run/'qa').mkdir(parents=True,exist_ok=True)
rgb=np.asarray(Image.open(a.source).convert('RGB'));h,w=rgb.shape[:2]
region=Image.new('L',(w,h));draw=ImageDraw.Draw(region)
for polygon in json.loads((run/'qa/horse-cloth-region.json').read_text())['uv_polygons']:
    draw.polygon([(u*(w-1),(1-v)*(h-1)) for u,v in polygon],fill=255)
region=np.asarray(region.filter(ImageFilter.MaxFilter(5)))>0
# The generated embroidered saddlecloth is muted charcoal blue rather than
# the saturated infantry fabric. Restrict its neutral-colour selection to
# the actual saddle surface, keeping mane, hooves, gold and brown leather.
red,green,blue=np.moveaxis(rgb.astype(float),2,0)
cloth=region&(blue>18)&(blue<130)&(red-green<8)&(green-blue<10)&(blue-red>-12)
mask=feather_mask(cloth.astype(np.uint8)*255);stats=category_statistics(rgb,mask)
assert int(cloth.sum())>1000,('Missing source saddlecloth texels',int(cloth.sum()))
assert all(stats[k]['mean_mask'] is None or stats[k]['mean_mask']<.05 for k in ('warm_gold','warm_skin_or_leather')),stats
Image.fromarray(mask).save(run/'candidate/horse-team-mask-1024.png')
(run/'qa/horse-team-mask.json').write_text(json.dumps({'source':str(a.source),'source_sha256':hashlib.sha256(a.source.read_bytes()).hexdigest(),'source_albedo_unchanged':True,'region':'original horse saddle UV faces, abs(x)>.20, y[-.72,.45], z[.88,1.50]','muted_cloth_pixels':int(cloth.sum()),'categories':stats},indent=2)+'\n');print(stats)
