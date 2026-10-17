"""Compose existing generated terrain sources into an original bank PBR strip."""
from pathlib import Path
import json,hashlib,shutil
import numpy as np
from PIL import Image,ImageFilter
ROOT=Path(__file__).resolve().parents[3];RUN=ROOT/'art-factory/rts/runs/riverbank/2026-10-07-v1'
for folder in ['raw','candidate','qa','iterations']:(RUN/folder).mkdir(parents=True,exist_ok=True)
sources={'river-shingle':'f14cad201179cd916451c78e95e6013e837b8f3f7ae04033dca5f3e5a233dd4d','forest-floor':'0400950bc7067496fa60525d9fca50757ac6efaa7a2ecf12d08ded9b873da7ab','lush-grass':'931946cff573241d424070c4202c3f752105d5f36a0a234eaddc82feb2885e17'}
pixels={};records=[];size=(512,1024)
for name,sha in sources.items():
    p=ROOT/f'public/assets/games/rts/terrain/{name}.webp';assert hashlib.sha256(p.read_bytes()).hexdigest()==sha
    shutil.copy2(p,RUN/f'raw/source-{name}.webp');im=Image.open(p).convert('RGB').resize((512,512),Image.Resampling.LANCZOS)
    # Mirror V so both ends are a deterministic continuation of the source.
    a=np.asarray(im,dtype=float)/255;pixels[name]=np.concatenate([a,a[::-1]],axis=0);records.append({'asset':name,'path':str(p.relative_to(ROOT)).replace('\\','/'),'sha256':sha})
u=np.linspace(0,1,size[0])[None,:,None];smooth=lambda t:np.clip(t,0,1)**2*(3-2*np.clip(t,0,1))
grass=1-smooth((u-.02)/.27);soil=(1-smooth((u-.18)/.32))*(1-grass);stone=1-grass-soil
color=pixels['lush-grass']*grass+pixels['forest-floor']*soil+pixels['river-shingle']*stone
# Wetness attenuates the existing source color rather than painting new detail.
wet=smooth((u-.70)/.30);color*=1-wet*.20
Image.fromarray(np.uint8(np.clip(color,0,1)*255)).save(RUN/'raw/riverbank-color.png')
rough=np.broadcast_to(.94-.23*wet[:,:,0],(size[1],size[0]));Image.fromarray(np.uint8(rough*255),'L').save(RUN/'raw/riverbank-roughness.png')
luma=pixels['river-shingle']@np.array([.2126,.7152,.0722]);height=np.asarray(Image.fromarray(np.uint8(luma*255)).filter(ImageFilter.GaussianBlur(1.1)),float)/255
np.save(RUN/'raw/relief.npy',height);dy,dx=np.gradient(height);normal=np.stack([-dx*4.096,dy*2.048,np.ones_like(height)],axis=2);normal/=np.linalg.norm(normal,axis=2)[:,:,None]
Image.fromarray(np.uint8((normal*.5+.5)*255)).save(RUN/'raw/riverbank-normal.png')
(RUN/'raw/sources.json').write_text(json.dumps({'sources':records,'processing':'Generated source texture blending, mirrored V, damp toe attenuation and source-derived tangent normal.','runtime_publish_allowed':False},indent=2)+'\n',encoding='utf-8',newline='\n')
print(json.dumps({'textures':3,'dimensions':size,'source_assets':list(sources)}))
