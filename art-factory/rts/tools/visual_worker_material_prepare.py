"""Extrude generated atlas gutters and use the existing per-texel team mask."""
import argparse,hashlib,json,sys
from pathlib import Path
import numpy as np
from PIL import Image
sys.path.insert(0,str(Path(__file__).parent))
from human_units_team_mask import blue_fabric_mask,feather_mask,category_statistics

p=argparse.ArgumentParser();p.add_argument('--source',type=Path,required=True);p.add_argument('--run',type=Path,required=True);a=p.parse_args()
run=a.run.resolve()
for part in ('raw','candidate','qa'):(run/part).mkdir(parents=True,exist_ok=True)
source=np.asarray(Image.open(a.source).convert('RGB'));empty=np.max(source,axis=2)==0
valid=~empty;padded=source.copy()
# Synchronous four-neighbour expansion is a deterministic Manhattan-nearest
# source lookup. Never combine channels from different source texels.
neighbours=[((slice(1,None),slice(None)),(slice(None,-1),slice(None))),((slice(None,-1),slice(None)),(slice(1,None),slice(None))),((slice(None),slice(1,None)),(slice(None),slice(None,-1))),((slice(None),slice(None,-1)),(slice(None),slice(1,None)))]
for _ in range(64):
    before=valid.copy()
    for dest,origin in neighbours:
        take=(~valid[dest])&before[origin]
        padded[dest][take]=padded[origin][take];valid[dest][take]=True
fill=empty&valid
# This is atlas padding from existing source pixels, never painted replacement art.
assert np.array_equal(padded[~empty],source[~empty]);assert np.all(np.max(padded[fill],axis=1)>0)
Image.fromarray(padded).save(run/'raw/worker-gutter-padded-2048.png')
body=run/'candidate/body-1024-q90.jpg';Image.fromarray(padded).resize((1024,1024),Image.Resampling.LANCZOS).save(body,quality=90,subsampling=0,optimize=True)
rgb=np.asarray(Image.open(body).convert('RGB'));mask=feather_mask(blue_fabric_mask(rgb));Image.fromarray(mask).save(run/'candidate/team-mask-1024.png')
stats=category_statistics(rgb,mask)
assert stats['royal_blue']['mean_mask']>.95,stats
assert all(stats[k]['mean_mask'] is None or stats[k]['mean_mask']<.05 for k in ('neutral_silver','warm_gold','warm_skin_or_leather')),stats
report={'source':str(a.source),'source_sha256':hashlib.sha256(a.source.read_bytes()).hexdigest(),'method':'Manhattan-nearest original texel atlas gutter extrusion, maximum 64px; all nonzero source texels unchanged','filled_black_gutter_pixels':int(fill.sum()),'mask_categories':stats,'runtime_publish_allowed':False}
(run/'qa/worker-material-prep.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps(report))
