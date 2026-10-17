"""Rasterize registered generated reference pixels into the frozen original UVs."""
from pathlib import Path
import hashlib,json
import numpy as np
from PIL import Image
from scipy.ndimage import distance_transform_edt
from original_guard_portrait_material_math import project_pixels,sample_rgba,view_weights
ROOT=Path(__file__).resolve().parents[3]
RUN=ROOT/'art-factory/rts/runs/original-guard-portrait-material/2026-10-05'
SIZE=1024


def sha(path):return hashlib.sha256(path.read_bytes()).hexdigest()


def main():
    source_contract=json.loads((ROOT/'art-factory/rts/runs/original-guard-materials/2026-10-05/qa/projection-source-contract.json').read_text())
    sources=source_contract['sources'];images=[]
    for source in sources:
        path=ROOT/source['path']
        if sha(path)!=source['sha256']:raise ValueError('Reference source differs: '+source['id'])
        images.append(np.asarray(Image.open(path).convert('RGBA'),float)/255)
    # Separate semantic anchors. Source images are not asserted to be aligned
    # orthographic views; the first candidate must pass visual registration.
    registrations=[
      {'id':'front','right':[-1,0,0],'head':{'anchor':[0,1.86],'pixel':[510,20],'scale':[790,790]},'torso':{'anchor':[0,1.56],'pixel':[512,261],'scale':[790,760]}},
      {'id':'back','right':[1,0,0],'head':{'anchor':[0,1.86],'pixel':[510,20],'scale':[790,790]},'torso':{'anchor':[0,1.56],'pixel':[510,246],'scale':[790,760]}},
      {'id':'left-facing','right':[0,-1,0],'head':{'anchor':[0,1.86],'pixel':[144,8],'scale':[640,630]},'torso':{'anchor':[0,1.56],'pixel':[160,198],'scale':[640,620]}},
      {'id':'right-facing','right':[0,1,0],'head':{'anchor':[0,1.86],'pixel':[175,8],'scale':[640,630]},'torso':{'anchor':[0,1.56],'pixel':[167,198],'scale':[640,620]}}
    ]
    registrations[0]['head']['z_landmarks']=[[1.53,230],[1.69,125],[1.86,20]]
    registrations[1]['head']['z_landmarks']=[[1.61,178],[1.77,90],[1.86,20]]
    for spec in registrations[2:]:spec['head']['z_landmarks']=[[1.53,175],[1.69,95],[1.86,8]]
    for spec in registrations:
        spec['shoulder']=dict(spec['torso'])
    registrations[0]['torso']={'anchor':[0,1.54],'pixel':[512,261],'scale':[790,550]}
    registrations[1]['torso']={'anchor':[0,1.54],'pixel':[510,246],'scale':[790,600]}
    mesh=np.load(RUN/'candidate/projection-mesh.npz');vertices=mesh['vertices'];faces=mesh['faces'];uv=mesh['uv'];normals=mesh['normals']
    indices=[];points=[];sample_normals=[];visibility=[]
    for triangle,tex in zip(faces,uv):
        xy=tex*SIZE;xy[:,1]=SIZE-xy[:,1]
        lo=np.maximum(np.floor(xy.min(axis=0)).astype(int),0);hi=np.minimum(np.ceil(xy.max(axis=0)).astype(int),SIZE-1)
        if np.any(hi<lo):continue
        yy,xx=np.mgrid[lo[1]:hi[1]+1,lo[0]:hi[0]+1];p=np.column_stack((xx.ravel()+.5,yy.ravel()+.5))
        transform=np.column_stack((xy[1]-xy[0],xy[2]-xy[0]))
        if abs(np.linalg.det(transform))<1e-10:continue
        bc12=(p-xy[0])@np.linalg.inv(transform).T;bc=np.column_stack((1-bc12.sum(axis=1),bc12));keep=np.all(bc>=-1e-9,axis=1)
        if not np.any(keep):continue
        bc=bc[keep];indices.append((yy.ravel()[keep]*SIZE+xx.ravel()[keep]).astype(int));points.append(bc@vertices[triangle]);sample_normals.append(bc@normals[triangle]);visibility.append(bc@mesh['visibility'][triangle])
    indices=np.concatenate(indices);points=np.concatenate(points);sample_normals=np.concatenate(sample_normals);visibility=np.concatenate(visibility)
    sample_normals/=np.maximum(np.linalg.norm(sample_normals,axis=1,keepdims=True),1e-12)
    head=(points[:,2]>=1.585-.4*points[:,1])&(np.abs(points[:,0])<.145)
    shoulder=(np.abs(points[:,0])>=.16)&~head
    colors=[];alpha=[]
    for source,image in zip(registrations,images):
        pixels=project_pixels(points,source,head)
        pixels[shoulder]=project_pixels(points[shoulder],{**source,'torso':source['shoulder']},np.zeros(shoulder.sum(),bool))
        rgb,a=sample_rgba(image,pixels);colors.append(rgb);alpha.append(a)
    colors=np.stack(colors,axis=1);alpha=np.stack(alpha,axis=1)
    weights=view_weights(sample_normals,mesh['directions'],np.clip((visibility-.5)*2,0,1),alpha)
    composed=np.einsum('nij,ni->nj',colors,weights);fallback=weights.sum(axis=1)==0
    # Hidden/uncovered surfaces reuse a real silver plate crop from the original
    # front reference. No painted replacement pixels or geometric repair.
    crop=images[0][1130:1280,315:380]
    u=np.mod(points[:,0]*1100,crop.shape[1]-1);v=np.mod(points[:,2]*1100,crop.shape[0]-1)
    fallback_rgb,_=sample_rgba(crop,np.column_stack((u,v)));composed[fallback]=fallback_rgb[fallback]
    atlas=np.zeros((SIZE*SIZE,3),float);atlas[indices]=composed;mask=np.zeros(SIZE*SIZE,bool);mask[indices]=True
    atlas=atlas.reshape(SIZE,SIZE,3);mask=mask.reshape(SIZE,SIZE)
    distances,nearest=distance_transform_edt(~mask,return_indices=True);padding=(distances<=8)&~mask
    atlas[padding]=atlas[nearest[0][padding],nearest[1][padding]]
    Image.fromarray(np.uint8(np.clip(atlas*255,0,255))).save(RUN/'candidate/original-guard-portrait-basecolor.png')
    # Approximate material response from the generated color, not measured PBR.
    cloth=(atlas[:,:,2]>atlas[:,:,0]*1.2)&(atlas[:,:,2]>atlas[:,:,1]*1.06)
    rough=np.where(cloth,.82,.48);metal=np.where(cloth,0,.65)
    orm=np.stack((np.ones_like(rough),rough,metal),axis=-1)
    Image.fromarray(np.uint8(orm*255)).save(RUN/'candidate/original-guard-portrait-response.png')
    (RUN/'qa/registration.json').write_bytes((json.dumps({'sources':sources,'registration':registrations,'head_region':'z>=1.585-.4*y and abs(x)<.145','shoulder_region':'abs(x)>=.16 outside head','notes':'Approximate independent anchors and visor/hem landmarks; not an accepted registration until same-camera inspection'},indent=2)+'\n').encode())
    report={'status':'textured_pending_registration_review','runtime_publish_allowed':False,'size':[SIZE,SIZE],
      'unique_covered_texels':int(mask.sum()),'raster_samples':len(indices),'duplicate_texel_samples':len(indices)-len(np.unique(indices)),
      'fallback_samples':int(fallback.sum()),'fallback_fraction':float(fallback.mean()),'head_fallback_fraction':float(fallback[head].mean()),
      'sources_sha256':{s['path']:s['sha256'] for s in sources},'basecolor_sha256':sha(RUN/'candidate/original-guard-portrait-basecolor.png'),
      'response_sha256':sha(RUN/'candidate/original-guard-portrait-response.png'),
      'limits':['Generated view lighting remains baked into color; not physically measured albedo','Visibility is barycentrically interpolated per vertex, not exact per texel','Projection must not conceal existing geometric defects or be mistaken for repaired chest relief']}
    (RUN/'qa/texture.json').write_bytes((json.dumps(report,indent=2)+'\n').encode())
    print('MATERIAL_TEXTURE',json.dumps({k:report[k] for k in ['unique_covered_texels','fallback_fraction','head_fallback_fraction']}))


if __name__=='__main__':main()
