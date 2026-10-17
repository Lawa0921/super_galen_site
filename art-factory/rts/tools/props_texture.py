"""Deterministic texture finishing for four original RTS scene props."""
import hashlib
import json
import math
from collections import deque
from pathlib import Path
from PIL import Image
import numpy as np

ROOT=Path(__file__).resolve().parents[1]
RUN=ROOT/'runs'/'kingdom-props'/'2026-10-04-original'
RAW=RUN/'raw'/'textures'
OUT=RUN/'candidate'/'textures'
OUT.mkdir(parents=True,exist_ok=True)


def hash_file(path):return hashlib.sha256(path.read_bytes()).hexdigest()


def wrap_edges(src,band=24):
    im=src.copy().convert('RGB');p=im.load();w,h=im.size
    for y in range(h):
        for k in range(band):
            a=p[k,y];b=p[w-1-k,y];t=0.5*(1-k/band)
            p[k,y]=tuple(round(a[i]*(1-t)+b[i]*t) for i in range(3))
            p[w-1-k,y]=tuple(round(b[i]*(1-t)+a[i]*t) for i in range(3))
    for x in range(w):
        for k in range(band):
            a=p[x,k];b=p[x,h-1-k];t=0.5*(1-k/band)
            p[x,k]=tuple(round(a[i]*(1-t)+b[i]*t) for i in range(3))
            p[x,h-1-k]=tuple(round(b[i]*(1-t)+a[i]*t) for i in range(3))
    return im


def seam_mae(im):
    p=im.convert('RGB').load();w,h=im.size
    vals=[]
    for y in range(h):vals.extend(abs(p[0,y][i]-p[w-1,y][i]) for i in range(3))
    for x in range(w):vals.extend(abs(p[x,0][i]-p[x,h-1][i]) for i in range(3))
    return round(sum(vals)/len(vals),2)


def normal_map(im,strength):
    src=im.resize((256,256),Image.Resampling.LANCZOS).convert('L').load()
    normal=Image.new('RGB',(256,256));dst=normal.load()
    for y in range(256):
        for x in range(256):
            dx=(src[(x+1)%256,y]-src[(x-1)%256,y])/255*strength
            dy=(src[x,(y+1)%256]-src[x,(y-1)%256])/255*strength
            length=math.sqrt(dx*dx+dy*dy+1)
            dst[x,y]=(round(127.5*(1-dx/length)),round(127.5*(1-dy/length)),round(127.5*(1+1/length)))
    return normal


def material_texture(name,repeat=True,strength=2.3):
    raw=RAW/f'{name}-source.png';source=Image.open(raw).convert('RGB')
    small=source.resize((384,384),Image.Resampling.LANCZOS)
    tile=wrap_edges(small) if repeat else small
    base=OUT/f'{name}-basecolor.jpg';tile.save(base,quality=84,subsampling=0,optimize=True)
    norm=OUT/f'{name}-normal.png';normal_map(tile,strength).save(norm,optimize=True)
    return {'id':name,'source':str(raw.relative_to(ROOT)),'source_sha256':hash_file(raw),
            'source_size_px':source.size,'basecolor':str(base.relative_to(ROOT)),
            'basecolor_sha256':hash_file(base),'basecolor_bytes':base.stat().st_size,
            'normal':str(norm.relative_to(ROOT)),'normal_sha256':hash_file(norm),
            'normal_bytes':norm.stat().st_size,
            'seam_mae_before':seam_mae(small) if repeat else None,
            'seam_mae_processed':seam_mae(tile) if repeat else None}


def leaf_atlas():
    raw=RAW/'oak-leaves-source.png';src=Image.open(raw).convert('RGBA')
    # Assign every visible source pixel to the nearest of the five authored
    # leaf sprays; this avoids a neighbour leaking into an atlas cell.
    centers=np.array([(300,240),(1265,220),(765,500),(275,810),(1210,790)])
    yy,xx=np.indices((src.height,src.width))
    distances=np.stack([(xx-cx)**2+(yy-cy)**2 for cx,cy in centers])
    owner=np.argmin(distances,axis=0)
    source_alpha=np.asarray(src.getchannel('A'))
    atlas=Image.new('RGBA',(768,512),(0,0,0,0))
    boxes=[]
    for i in range(5):
        mask=(owner==i)&(source_alpha>=85)
        ys,xs=np.where(mask)
        if not len(xs):raise RuntimeError(f'leaf spray {i} has no alpha')
        bounds=(int(xs.min()),int(ys.min()),int(xs.max())+1,int(ys.max())+1)
        crop=src.crop(bounds)
        crop.putalpha(Image.fromarray((mask[ys.min():ys.max()+1,xs.min():xs.max()+1]*255).astype('uint8')))
        scale=min(226/crop.width,226/crop.height)
        size=(round(crop.width*scale),round(crop.height*scale))
        crop=crop.resize(size,Image.Resampling.LANCZOS)
        crop.putalpha(crop.getchannel('A').point(lambda x:255 if x>=128 else 0))
        col=i%3;row=i//3
        x=col*256+(256-size[0])//2;y=row*256+(256-size[1])//2
        atlas.alpha_composite(crop,(x,y))
        boxes.append([round(col/3,6),round(row/2,6),round((col+1)/3,6),round((row+1)/2,6)])
    # Retain each spray's connected silhouette and remove detached fragments
    # from the generated source near Voronoi boundaries.
    pixels=atlas.load()
    for i in range(5):
        ox=(i%3)*256;oy=(i//3)*256
        visited=set();components=[]
        for ly in range(256):
            for lx in range(256):
                key=(lx,ly)
                if key in visited or pixels[ox+lx,oy+ly][3]==0:continue
                visited.add(key);queue=deque([key]);part=[]
                while queue:
                    cx,cy=queue.popleft();part.append((cx,cy))
                    for nx,ny in ((cx-1,cy),(cx+1,cy),(cx,cy-1),(cx,cy+1)):
                        nk=(nx,ny)
                        if 0<=nx<256 and 0<=ny<256 and nk not in visited and pixels[ox+nx,oy+ny][3]:
                            visited.add(nk);queue.append(nk)
                components.append(part)
        if components:
            keep=max(components,key=len)
            for part in components:
                if part is keep:continue
                for lx,ly in part:pixels[ox+lx,oy+ly]=(0,0,0,0)
    out=OUT/'oak-leaf-atlas.png';atlas.save(out,optimize=True)
    a=atlas.getchannel('A');hist=a.histogram();pixels=atlas.width*atlas.height
    return {'id':'oak-leaves','source':str(raw.relative_to(ROOT)),
            'source_sha256':hash_file(raw),'source_size_px':src.size,
            'atlas':str(out.relative_to(ROOT)),'atlas_sha256':hash_file(out),
            'atlas_bytes':out.stat().st_size,'atlas_size_px':atlas.size,
            'alpha_zero_fraction':round(hist[0]/pixels,4),
            'alpha_opaque_fraction':round(hist[255]/pixels,4),
            'alpha_partial_count':sum(hist[1:255]),'uv_boxes':boxes}


rows=[material_texture('oak-bark',True,2.8),material_texture('gray-rock',True,2.4),
      material_texture('gold-ore',True,2.6),material_texture('oak-endgrain',False,1.7),
      leaf_atlas()]
(RUN/'qa').mkdir(parents=True,exist_ok=True)
(RUN/'qa'/'textures.json').write_bytes(json.dumps(rows,indent=2).encode('utf-8'))
print(json.dumps(rows,indent=2))
