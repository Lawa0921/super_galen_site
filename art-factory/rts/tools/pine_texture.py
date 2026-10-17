"""Deterministic packing of generated pine boughs; never paints new foliage."""
from pathlib import Path
import hashlib,json
import numpy as np
from PIL import Image
from scipy.ndimage import distance_transform_edt
ROOT=Path(__file__).resolve().parents[1]
RUN=ROOT/'runs/highland-pine/2026-10-06-v1'

def pack(source):
    if source.mode!='RGBA':raise ValueError('Generated alpha channel required')
    pixels=np.asarray(source)
    if (pixels[:,:,3]>96).mean()>.9:raise ValueError('Transparent alpha gutters required')
    atlas=Image.new('RGBA',(1024,1024),(0,0,0,0))
    for row in range(2):
        for col in range(2):
            cell=source.crop((col*source.width//2,row*source.height//2,(col+1)*source.width//2,(row+1)*source.height//2))
            alpha=np.asarray(cell)[:,:,3];ys,xs=np.where(alpha>=96)
            if len(xs)<100:raise ValueError('Missing generated spray')
            crop=cell.crop((int(xs.min()),int(ys.min()),int(xs.max()+1),int(ys.max()+1)))
            scale=min(472/crop.width,472/crop.height)
            crop=crop.resize((round(crop.width*scale),round(crop.height*scale)),Image.Resampling.LANCZOS)
            rgba=np.asarray(crop).copy();rgba[:,:,3]=np.where(rgba[:,:,3]>=96,255,0)
            atlas.paste(Image.fromarray(rgba),(col*512+(512-crop.width)//2,row*512+(512-crop.height)//2))
    rgba=np.asarray(atlas).copy();opaque=rgba[:,:,3]>0
    distance,nearest=distance_transform_edt(~opaque,return_indices=True)
    padding=(~opaque)&(distance<=8)
    rgba[padding,:3]=rgba[nearest[0][padding],nearest[1][padding],:3]
    return Image.fromarray(rgba)

def main():
    raw=RUN/'raw/needle-bough-atlas.png'
    atlas=pack(Image.open(raw));out=RUN/'candidate/textures/pine-needle-atlas.png';out.parent.mkdir(parents=True,exist_ok=True);atlas.save(out,optimize=True)
    a=np.asarray(atlas);alpha=a[:,:,3];rows=[]
    for row in range(2):
        for col in range(2):
            cell=alpha[row*512:(row+1)*512,col*512:(col+1)*512];ys,xs=np.where(cell>0)
            rows.append({'variant':row*2+col,'opaque_pixels':len(xs),'bounds_px':[int(xs.min()),int(ys.min()),int(xs.max()+1),int(ys.max()+1)]})
    report={'source':str(raw.relative_to(ROOT)),'source_sha256':hashlib.sha256(raw.read_bytes()).hexdigest(),'atlas_sha256':hashlib.sha256(out.read_bytes()).hexdigest(),'size':atlas.size,'partial_alpha_pixels':int(((alpha>0)&(alpha<255)).sum()),'cells':rows,'processing':'2x2 cell extraction, original-color resampling, binary alpha and 8px nearest-color padding outside alpha only','runtime_publish_allowed':False}
    (RUN/'qa/texture.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps(report))
if __name__=='__main__':main()
