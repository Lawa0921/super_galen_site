"""Bake original generated surface pixels through the fixed mesh's region masks."""
from pathlib import Path
import json, hashlib
import numpy as np
from PIL import Image
from scipy.ndimage import distance_transform_edt
from original_guard_semantic_material_math import triplanar_sample
from original_guard_semantic_material_raster import RUN, ROOT, SIZE, CACHE


def sha(path): return hashlib.sha256(path.read_bytes()).hexdigest()


def to_linear(rgb):
    return np.where(rgb <= .04045, rgb / 12.92, ((rgb + .055) / 1.055)**2.4)


def to_srgb(rgb):
    return np.where(rgb <= .0031308, rgb * 12.92, 1.055*np.maximum(rgb, 0)**(1/2.4)-.055)


def main():
    contract=json.loads((ROOT/'art-factory/rts/contracts/original-guard-semantic-material.json').read_text(encoding='utf-8'))
    atlas_report=json.loads((RUN/'qa/atlas.json').read_text(encoding='utf-8'))
    if atlas_report['conflicting_pixels']:raise ValueError('Resolve UV conflicts before texture bake')
    if sha(RUN/'candidate/projection-mesh.npz')!=atlas_report['source_sha256']:raise ValueError('UV source changed')
    if sha(CACHE)!=atlas_report['cache_sha256']:raise ValueError('Raster cache changed')
    samples=np.load(CACHE)
    indices,points,normals,material=[samples[k] for k in ('indices','points','normals','material')]
    colors=np.zeros((len(points),3));response=np.zeros_like(colors);sources={}
    parameters=[('steel',0,.080,.57,.70),('brass',1,.055,.48,.72),('navy-cloth',2,.030,.89,0.)]
    for name,region,repeat_m,roughness,metallic in parameters:
        source=contract['surface_tiles'][name];path=ROOT/source['path']
        if sha(path)!=source['sha256']:raise ValueError('Generated source changed: '+name)
        tile=to_linear(np.asarray(Image.open(path).convert('RGB'),float)/255)
        selected=material==region
        colors[selected]=to_srgb(triplanar_sample(tile,points[selected],normals[selected],repeat_m))
        response[selected]=[1,roughness,metallic]
        sources[name]={'path':source['path'],'sha256':source['sha256'],'repeat_m':repeat_m,'roughness':roughness,'metallic':metallic}
    mask=np.zeros(SIZE*SIZE,bool);mask[indices]=True;mask=mask.reshape(SIZE,SIZE)
    distances,nearest=distance_transform_edt(~mask,return_indices=True)
    padding=(distances<=8)&~mask
    outputs={}
    for name,data in [('basecolor',colors),('response',response)]:
        atlas=np.zeros((SIZE*SIZE,3));atlas[indices]=data;atlas=atlas.reshape(SIZE,SIZE,3)
        atlas[padding]=atlas[nearest[0][padding],nearest[1][padding]]
        path=RUN/('candidate/original-guard-semantic-'+name+'.png')
        Image.fromarray(np.uint8(np.clip(np.rint(atlas*255),0,255))).save(path)
        outputs[name]={'path':str(path.relative_to(ROOT)).replace('\\','/'),'sha256':sha(path)}
    report={'status':'surface_baked_pending_visual_review','runtime_publish_allowed':False,'size':[SIZE,SIZE],'unique_surface_texels':int(mask.sum()),'padding_pixels':8,'sampled_uv_conflicts':0,'sources':sources,'outputs':outputs,'source_pixel_policy':'Linear-light triplanar interpolation of original generated surface tiles only. Material response is authored, not measured PBR. No concept-view motif pixels.','limits':['Authored analytic mesh-region masks require visual acceptance','No repair of original visor groove, crest relief or fused armor geometry','UV conflict claim covers this exact 2048 texel-center raster, not all continuous UV intersections']}
    (RUN/'qa/texture.json').write_bytes((json.dumps(report,indent=2)+'\n').encode())
    print(json.dumps({'surface_texels':int(mask.sum()),'size':SIZE,'sources':list(sources)}))


if __name__=='__main__':main()
