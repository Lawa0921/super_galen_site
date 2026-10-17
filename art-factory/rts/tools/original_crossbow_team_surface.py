"""Migrate original body tint to texels; leave GLB binary data byte-identical."""
import base64,copy,hashlib,io,json,re,struct,sys
from pathlib import Path
import numpy as np
from PIL import Image
from human_units_team_mask import blue_fabric_mask,feather_mask,category_statistics,recolor_preview
ROOT=Path(__file__).resolve().parents[3]
SOURCE=ROOT/'art-factory/rts/runs/original-crossbow-wrist-topology/2026-10-06-v1'
RUN=ROOT/'art-factory/rts/runs/original-crossbow-team-surface/2026-10-06-v1'

def sha(data):return hashlib.sha256(data).hexdigest()
def decode(data):
    magic,version,total=struct.unpack_from('<III',data)
    assert magic==0x46546c67 and version==2 and total==len(data)
    size,kind=struct.unpack_from('<II',data,12);assert kind==0x4e4f534a
    return json.loads(data[20:20+size]),data[20+size:]
def encode(g,tail):
    text=json.dumps(g,separators=(',',':'),ensure_ascii=False).encode('utf8');text+=b' '*((-len(text))%4)
    return struct.pack('<III',0x46546c67,2,20+len(text)+len(tail))+struct.pack('<II',len(text),0x4e4f534a)+text+tail
def body_mesh(g,lod):
    matches=[n['mesh'] for n in g['nodes'] if n.get('name')==f'crossbowOriginalBody_LOD{lod}']
    if len(matches)!=1:raise ValueError('Exactly one named original body is required')
    return matches[0]
def base_material(g,lod):
    mesh=body_mesh(g,lod);indices={p['material'] for p in g['meshes'][mesh]['primitives']}
    base=[i for i in indices if 'TeamCloth' not in g['materials'][i].get('name','')]
    if len(base)!=1:raise ValueError('Original untinted body albedo material is ambiguous')
    return base[0]
def body_image(g,tail,lod):
    mat=g['materials'][base_material(g,lod)];index=mat['pbrMetallicRoughness']['baseColorTexture']['index']
    image=g['images'][g['textures'][index]['source']];view=g['bufferViews'][image['bufferView']]
    size,kind=struct.unpack_from('<II',tail);assert kind==0x004e4942 and size==len(tail)-8
    start=8+view.get('byteOffset',0);return tail[start:start+view['byteLength']]
def convert(original,lod,mask_uri):
    if not isinstance(mask_uri,str) or not re.fullmatch(r'data:image/png;base64,[A-Za-z0-9+/=]+',mask_uri) or len(mask_uri)>3000000:raise ValueError('Embedded PNG mask required')
    g=copy.deepcopy(original);mesh=body_mesh(g,lod);base=base_material(g,lod)
    mat=copy.deepcopy(g['materials'][base]);mat['name']='TeamClothMasked_crossbow_original';mat.setdefault('extras',{})['teamTintMask']=mask_uri
    mat['pbrMetallicRoughness']['baseColorFactor']=[1,1,1,1]
    new=len(g['materials']);g['materials'].append(mat)
    previous=[]
    for p in g['meshes'][mesh]['primitives']:previous.append(p['material']);p['material']=new
    return g,{'body_mesh':mesh,'original_base_material':base,'old_primitive_materials':previous,'new_material':new}

def main():
    for folder in ('raw','candidate','qa'):(RUN/folder).mkdir(parents=True,exist_ok=True)
    first=(SOURCE/'candidate/original-crossbow-grip-lod0.glb').read_bytes();g,tail=decode(first);albedo=body_image(g,tail,0)
    (RUN/'raw/original-embedded-body-albedo.jpg').write_bytes(albedo)
    rgb=np.asarray(Image.open(io.BytesIO(albedo)).convert('RGB'));assert rgb.shape==(1024,1024,3)
    mask=feather_mask(blue_fabric_mask(rgb));mask_path=RUN/'candidate/team-mask-1024.png';Image.fromarray(mask,'L').save(mask_path)
    categories=category_statistics(rgb,mask)
    assert categories['royal_blue']['pixels']>2500 and categories['royal_blue']['mean_mask']>.95,categories
    assert all(categories[k]['mean_mask'] is None or categories[k]['mean_mask']<.05 for k in ('neutral_silver','warm_gold','warm_skin_or_leather')),categories
    for name,color in [('blue',(40,87,125)),('red',(135,56,45))]:
        preview=recolor_preview(rgb,mask,color);assert np.array_equal(preview[mask==0],rgb[mask==0])
        Image.fromarray(preview).save(RUN/f'qa/atlas-{name}.png')
    uri='data:image/png;base64,'+base64.b64encode(mask_path.read_bytes()).decode('ascii');rows=[]
    for lod in (0,1):
        name=f'original-crossbow-grip-lod{lod}.glb';source=(SOURCE/'candidate'/name).read_bytes();original,tail=decode(source)
        assert body_image(original,tail,lod)==albedo,'LOD atlases differ; no implicit transfer allowed'
        result,record=convert(original,lod,uri);output=encode(result,tail);(RUN/'candidate'/name).write_bytes(output)
        verify,verify_tail=decode(output);assert tail==verify_tail
        assert body_image({**verify,'materials':original['materials'],'meshes':original['meshes']},verify_tail,lod)==albedo
        rows.append({'lod':lod,**record,'source_sha256':sha(source),'candidate_sha256':sha(output),'binary_chunk_sha256':sha(tail),'binary_byte_identical':True})
    report={'source_run':str(SOURCE),'original_albedo_sha256':sha(albedo),'mask_sha256':sha(mask_path.read_bytes()),'mask_size':[1024,1024],'mask_categories':categories,'rows':rows,'pass':True,'runtime_publish_allowed':False,
        'scope':'Material-only GLB JSON migration; all geometry, UV, weights, bind data, clips and original image binary data unchanged. Existing original mesh boundary failures are inherited.'}
    (RUN/'qa/material-migration.json').write_text(json.dumps(report,indent=2)+'\n')
    print('TEAM_SURFACE',json.dumps(report))
if __name__=='__main__':main()
