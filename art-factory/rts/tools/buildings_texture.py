"""Preserve source textures and derive compact, wrap-correct RTS material maps."""
import hashlib
import json
import math
from pathlib import Path
from PIL import Image, ImageStat

ROOT=Path(__file__).resolve().parents[1]
RUN=ROOT/'runs'/'kingdom-buildings'/'2026-10-04-v2'
OUT=RUN/'candidate'/'textures'
OUT.mkdir(parents=True,exist_ok=True)


def tile_edges(image,band=28):
    im=image.copy().convert('RGB')
    w,h=im.size
    px=im.load()
    for y in range(h):
        for k in range(band):
            a=px[k,y];b=px[w-1-k,y]
            t=0.5*(1-k/band)
            px[k,y]=tuple(round(a[c]*(1-t)+b[c]*t) for c in range(3))
            px[w-1-k,y]=tuple(round(b[c]*(1-t)+a[c]*t) for c in range(3))
    for x in range(w):
        for k in range(band):
            a=px[x,k];b=px[x,h-1-k]
            t=0.5*(1-k/band)
            px[x,k]=tuple(round(a[c]*(1-t)+b[c]*t) for c in range(3))
            px[x,h-1-k]=tuple(round(b[c]*(1-t)+a[c]*t) for c in range(3))
    return im


def seam_mae(im):
    p=im.convert('RGB').load();w,h=im.size
    values=[]
    for y in range(h):values.extend(abs(p[0,y][c]-p[w-1,y][c]) for c in range(3))
    for x in range(w):values.extend(abs(p[x,0][c]-p[x,h-1][c]) for c in range(3))
    return round(sum(values)/len(values),2)


def normal_from_color(im,strength=2.7):
    small=im.resize((256,256),Image.Resampling.LANCZOS).convert('L')
    src=small.load(); out=Image.new('RGB',small.size); dst=out.load()
    w,h=small.size
    for y in range(h):
        for x in range(w):
            gx=(src[(x+1)%w,y]-src[(x-1)%w,y])/255.0
            gy=(src[x,(y+1)%h]-src[x,(y-1)%h])/255.0
            nx=-gx*strength; ny=-gy*strength;nz=1.0
            l=math.sqrt(nx*nx+ny*ny+nz*nz)
            dst[x,y]=(round(127.5*(nx/l+1)),round(127.5*(ny/l+1)),round(127.5*(nz/l+1)))
    return out


rows=[]
for name in ('ivory-ashlar','navy-slate'):
    src=RUN/'raw'/'textures'/f'{name}-source.png'
    raw=Image.open(src).convert('RGB')
    small=raw.resize((384,384),Image.Resampling.LANCZOS)
    tile=tile_edges(small)
    base=OUT/f'{name}-basecolor.jpg'
    tile.save(base,quality=84,subsampling=0,optimize=True)
    normal=OUT/f'{name}-normal.png'
    normal_from_color(tile,2.4 if name=='ivory-ashlar' else 3.0).save(normal,optimize=True)
    rows.append({'id':name,'raw':str(src.relative_to(ROOT)),'raw_sha256':hashlib.sha256(src.read_bytes()).hexdigest(),
                 'raw_size':raw.size,'basecolor':str(base.relative_to(ROOT)),'basecolor_sha256':hashlib.sha256(base.read_bytes()).hexdigest(),
                 'normal':str(normal.relative_to(ROOT)),'normal_sha256':hashlib.sha256(normal.read_bytes()).hexdigest(),
                 'seam_mae_source':seam_mae(small),'seam_mae_processed':seam_mae(tile),
                 'basecolor_bytes':base.stat().st_size,'normal_bytes':normal.stat().st_size})
(RUN/'qa').mkdir(parents=True,exist_ok=True)
(RUN/'qa'/'textures.json').write_bytes(json.dumps(rows,indent=2).encode('utf-8'))
print(json.dumps(rows,indent=2))
