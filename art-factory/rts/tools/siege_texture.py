"""Deterministic processing of original generated siege material swatches."""
import hashlib
import json
from pathlib import Path

import numpy as np
from PIL import Image

ROOT=Path(__file__).resolve().parents[1]
RUN=ROOT/'runs'/'kingdom-siege'/'2026-10-04-original'
TEXTURES=(('hewn-oak',2.15),('forged-iron',1.55),('navy-cloth',0.82))


def sha(path):return hashlib.sha256(path.read_bytes()).hexdigest()


def tile_edges(rgb,margin=24):
    arr=rgb.astype(np.float32)
    for i in range(margin):
        weight=(margin-i)/(margin+1)
        pair=(arr[:,i,:]+arr[:,-i-1,:])*0.5
        arr[:,i,:]=arr[:,i,:]*(1-weight)+pair*weight
        arr[:,-i-1,:]=arr[:,-i-1,:]*(1-weight)+pair*weight
    for i in range(margin):
        weight=(margin-i)/(margin+1)
        pair=(arr[i,:,:]+arr[-i-1,:,:])*0.5
        arr[i,:,:]=arr[i,:,:]*(1-weight)+pair*weight
        arr[-i-1,:,:]=arr[-i-1,:,:]*(1-weight)+pair*weight
    arr[:,0,:]=(arr[:,0,:]+arr[:,-1,:])*0.5
    arr[:,-1,:]=arr[:,0,:]
    arr[0,:,:]=(arr[0,:,:]+arr[-1,:,:])*0.5
    arr[-1,:,:]=arr[0,:,:]
    return np.uint8(np.clip(arr,0,255))


def seam_error(arr):
    a=arr.astype(np.float32)
    return round(float((np.abs(a[:,0]-a[:,-1]).mean()+np.abs(a[0]-a[-1]).mean())/2),3)


def normal_from_color(color,strength):
    lum=np.dot(color.astype(np.float32)/255,[.2126,.7152,.0722])
    dx=(np.roll(lum,-1,axis=1)-np.roll(lum,1,axis=1))*strength
    dy=(np.roll(lum,-1,axis=0)-np.roll(lum,1,axis=0))*strength
    vec=np.stack((-dx,-dy,np.ones_like(dx)),axis=2)
    vec/=np.linalg.norm(vec,axis=2,keepdims=True)
    return Image.fromarray(np.uint8(np.clip((vec*.5+.5)*255,0,255)),'RGB')


def process(stem,strength):
    source=RUN/'raw'/'textures'/f'{stem}-source.png'
    folder=RUN/'candidate'/'textures';folder.mkdir(parents=True,exist_ok=True)
    image=Image.open(source).convert('RGB')
    resized=np.asarray(image.resize((512,512),Image.Resampling.LANCZOS))
    color=tile_edges(resized)
    if stem=='navy-cloth':
        # Keep the generated weave but remove baked blue: TeamCloth's tint
        # factor can then change cleanly from blue to an opposing team color.
        luminance=np.dot(color.astype(np.float32),[.2126,.7152,.0722])
        neutral=np.uint8(np.clip(158+(luminance-luminance.mean())*.88,0,255))
        color=np.repeat(neutral[:,:,None],3,axis=2)
    base=folder/f'{stem}-basecolor.jpg';Image.fromarray(color).save(base,quality=90,subsampling=0)
    normal=folder/f'{stem}-normal.png';normal_from_color(color,strength).save(normal)
    return {'id':stem,'source':str(source.relative_to(ROOT)),'source_sha256':sha(source),
            'source_px':image.size,'basecolor':str(base.relative_to(ROOT)),
            'basecolor_sha256':sha(base),'normal':str(normal.relative_to(ROOT)),
            'normal_sha256':sha(normal),'processed_size_px':[512,512],
            'team_tint_mode':'neutralized_generated_weave' if stem=='navy-cloth' else 'source_color',
            'seam_mae_before':seam_error(resized),'seam_mae_after':seam_error(color)}


if __name__=='__main__':
    rows=[process(*entry) for entry in TEXTURES]
    dest=RUN/'qa';dest.mkdir(parents=True,exist_ok=True)
    (dest/'textures.json').write_bytes(json.dumps(rows,indent=2).encode('utf-8'))
    print(json.dumps([(r['id'],r['seam_mae_after']) for r in rows]))
