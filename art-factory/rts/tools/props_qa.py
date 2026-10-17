"""Independent structural audit of four candidate prop GLBs and their source maps."""
import hashlib
import json
import os
import struct
from pathlib import Path

from PIL import Image, ImageChops, ImageStat

ROOT=Path(__file__).resolve().parents[1]
RUN=ROOT/'runs'/'kingdom-props'/os.environ.get('KINGDOM_PROPS_RUN','2026-10-04-original')
CONTRACT=json.loads((ROOT/'contracts'/'kingdom-props.json').read_text(encoding='utf-8'))


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def glb(path):
    raw=path.read_bytes()
    assert raw[:4]==b'glTF' and struct.unpack_from('<I',raw,4)[0]==2
    assert struct.unpack_from('<I',raw,8)[0]==len(raw)
    size,tag=struct.unpack_from('<I4s',raw,12)
    assert tag==b'JSON'
    return json.loads(raw[20:20+size])


def audit_asset(spec, recorded, imported):
    name=spec['id']
    path=RUN/'candidate'/f'{name}.glb'
    source=RUN/'raw'/f'{name}.blend'
    data=glb(path)
    materials=data['materials']
    primitives=[p for mesh in data['meshes'] for p in mesh['primitives']]
    triangles=sum(data['accessors'][p['indices']]['count']//3 for p in primitives)
    checks={
        'glb_sha256_matches_record':sha(path)==recorded['sha256_glb'],
        'blend_sha256_matches_record':sha(source)==recorded['sha256_blend'],
        'triangle_budget':triangles<=spec['max_triangles'],
        'triangle_count_matches_blender':triangles==recorded['triangles'],
        'material_budget':len(materials)<=spec['max_materials'],
        'joined_meshes_by_material':len(data['meshes'])<=len(materials),
        'uv0_and_normals':all({'POSITION','NORMAL','TEXCOORD_0'}<=set(p['attributes']) for p in primitives),
        'y_up':data.get('asset',{}).get('version')=='2.0',
        'runtime_false':recorded['runtime_publish_allowed'] is False,
        'ground_zero':abs(recorded['bounds_min_blender_xyz_m'][2])<0.04,
        'roundtrip_triangle_count':triangles==imported['import_triangle_count'],
        'roundtrip_mesh_count':len(data['meshes'])==imported['import_mesh_count'],
        'roundtrip_bounds':all(abs(a-b)<0.04 for key in ('min','max') for a,b in zip(
            recorded[f'bounds_{key}_blender_xyz_m'],imported[f'blender_import_bounds_{key}_xyz_m'])),
        'footprint':all(max(abs(recorded['bounds_min_blender_xyz_m'][i]),
                             abs(recorded['bounds_max_blender_xyz_m'][i]))<=spec['footprint_m'][i]/2+0.15
                        for i in (0,1)),
    }
    original=Image.open(RUN/'qa'/'renders'/f'{name}.png').convert('RGBA')
    roundtrip=Image.open(RUN/'qa'/'roundtrip'/f'{name}.png').convert('RGBA')
    delta=ImageStat.Stat(ImageChops.difference(original,roundtrip)).mean
    checks['render_matches_roundtrip']=max(delta)<2.0
    mapped={'oak':{'Bark'},'rock':{'GrayRock'},'gold-mine':{'GoldOre','MineRock','MineTimber'},
            'timber-pile':{'Bark','EndGrain'}}[name]
    checks['pbr_basecolor_and_normal']=all(
        m.get('pbrMetallicRoughness',{}).get('baseColorTexture',{}).get('index') is not None
        and m.get('normalTexture',{}).get('index') is not None
        for m in materials if m['name'] in mapped)
    checks['uv_texture_coordinates']=all(
        t.get('texCoord',0)==0 for m in materials for t in
        [m.get('pbrMetallicRoughness',{}).get('baseColorTexture',{}),m.get('normalTexture',{})]
        if t)
    if name=='oak':
        leaves=next(m for m in materials if m['name']=='LeafCutout')
        checks['leaf_mask_double_sided']=(leaves.get('alphaMode')=='MASK'
            and leaves.get('doubleSided') is True and 0.45<=leaves.get('alphaCutoff',0)<=0.52)
        bounds=recorded['bounds_max_blender_xyz_m'][2]
        checks['oak_height']=spec['height_m'][0]<=bounds<=spec['height_m'][1]
        if RUN.name.endswith('oak-v2'):
            span=[recorded['bounds_max_blender_xyz_m'][i]-recorded['bounds_min_blender_xyz_m'][i]
                  for i in (0,1)]
            checks['mature_crown_span']=all(6<=extent<=8 for extent in span)
            checks['leaf_density_revision']=3<=recorded['leaf_card_count']/145<=4.5
            old=ROOT/'runs'/'kingdom-props'/'2026-10-04-original'/'candidate'/'textures'/'oak-leaf-atlas.png'
            checks['original_generated_atlas_reused']=sha(old)==sha(RUN/'candidate'/'textures'/'oak-leaf-atlas.png')
    if name=='gold-mine':
        anchors=[n for n in data['nodes'] if n.get('name')=='ResourceClickAnchor']
        checks['click_anchor']=(len(anchors)==1 and anchors[0].get('extras',{}).get('resource_type')=='gold')
    return {'id':name,'triangles':triangles,'materials':[m['name'] for m in materials],
            'mesh_count':len(data['meshes']),'bytes':path.stat().st_size,
            'sha256_glb':sha(path),'sha256_blend':sha(source),
            'render_mean_abs_rgba':[round(v,3) for v in delta],
            'checks':checks,'pass':all(checks.values())}


def audit_texture():
    path=RUN/'candidate'/'textures'/'oak-leaf-atlas.png'
    im=Image.open(path).convert('RGBA')
    alpha=im.getchannel('A')
    extrema=alpha.getextrema()
    histogram=alpha.histogram()
    checks={'rgba':im.mode=='RGBA','has_transparency_and_opaque':histogram[0]>0 and histogram[255]>0,
            'no_partial_alpha_haze':sum(histogram[1:255])==0,
            'expected_dimensions':im.size==(768,512)}
    return {'path':str(path.relative_to(ROOT)),'sha256':sha(path),'alpha_extrema':extrema,
            'transparent_fraction':histogram[0]/(im.width*im.height),'checks':checks,'pass':all(checks.values())}


def main():
    recorded={r['id']:r for r in json.loads((RUN/'qa'/'mechanical.json').read_text())}
    imported={r['id']:r for r in json.loads((RUN/'qa'/'roundtrip.json').read_text())}
    specs=[dict(spec) for spec in CONTRACT['assets'] if spec['id'] in recorded]
    if RUN.name.endswith('oak-v2'):
        revision=next(r for r in CONTRACT['revisions'] if r['run_id']==RUN.name)
        oak=next(s for s in specs if s['id']==revision['asset_id'])
        for field in ('footprint_m','height_m','max_triangles','max_materials'):
            oak[field]=revision[field]
    assets=[audit_asset(spec,recorded[spec['id']],imported[spec['id']]) for spec in specs]
    textures=audit_texture()
    result={'status':'pass' if all(a['pass'] for a in assets) and textures['pass'] else 'fail',
            'scope':'candidate-only','assets':assets,'leaf_atlas':textures}
    out=RUN/'qa'/'structural.json';out.write_bytes(json.dumps(result,indent=2).encode('utf-8'))
    print(json.dumps({'status':result['status'],'assets':[(a['id'],a['triangles'],a['mesh_count'],a['pass']) for a in assets],
                      'leaf_atlas':textures['pass']},indent=2))
    if result['status']!='pass':raise SystemExit(1)


if __name__=='__main__':main()
