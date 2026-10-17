"""Verify v2 texel masks, GLB extras, preserved skeleton and ground behavior."""

import argparse
import base64
import hashlib
import io
import json
import re
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

from human_units_verify import glb_json, inspect_glb


def sha256_bytes(data):
    return hashlib.sha256(data).hexdigest()


def sha256(path):
    return sha256_bytes(Path(path).read_bytes())


def inspect_mask_metadata(material, unit):
    failures = []
    if material.get('name') != f'TeamClothMasked_{unit}':
        failures.append('masked_body_material_name')
    factor = material.get('pbrMetallicRoughness', {}).get('baseColorFactor', [1, 1, 1, 1])
    if len(factor) != 4 or any(abs(float(value)-1) > 1e-6 for value in factor):
        failures.append('white_base_factor')
    uri = material.get('extras', {}).get('teamTintMask')
    data = None
    if not isinstance(uri, str) or not re.fullmatch(r'data:image/png;base64,[A-Za-z0-9+/=]+', uri):
        failures.append('embedded_png_data_uri')
    else:
        try:
            data = base64.b64decode(uri.split(',', 1)[1], validate=True)
            with Image.open(io.BytesIO(data)) as image:
                if image.format != 'PNG' or image.mode != 'L' or image.size != (1024, 1024):
                    failures.append('grayscale_1024_png')
        except (OSError, ValueError):
            failures.append('valid_png_data')
    return {'name':material.get('name'),'mask_sha256':sha256_bytes(data) if data else None,
            'mask_bytes':len(data) if data else None,'base_color_factor':factor,'failures':failures}


def compare_fronts(v1, v2):
    entries = [('v1 blue face material',v1/'qa/front.png'),('v2 blue texel mask',v2/'qa/front.png'),
               ('v2 red texel mask',v2/'qa/front-red.png')]
    canvas=Image.new('RGB',(640*3,832),(31,34,39))
    draw=ImageDraw.Draw(canvas)
    for index,(label,path) in enumerate(entries):
        with Image.open(path) as opened:
            rgba=opened.convert('RGBA')
        canvas.paste(rgba,(index*640,32),rgba)
        draw.text((index*640+12,10),label,fill=(240,240,240))
    path=v2/'qa/before-after-blue-red.png'
    canvas.save(path)
    return {'path':str(path),'sha256':sha256(path)}


def verify(root, unit):
    if unit not in ('priest', 'commander'):
        raise ValueError('Masked v2 limited to priest and commander')
    base = root/'art-factory/rts/runs/human-units'
    v1,v2 = base/'2026-10-05-v1'/unit,base/'2026-10-05-v2'/unit
    prep = json.loads((v2/'qa/team-mask-prep.json').read_text(encoding='utf-8'))
    old = json.loads((v1/'qa/production-build.json').read_text(encoding='utf-8'))
    build = json.loads((v2/'qa/production-build.json').read_text(encoding='utf-8'))
    mask_path = v2/'candidate/team-mask-1024.png'
    source_mask_sha = sha256(mask_path)
    glbs = {}
    for lod in ('lod0','lod1'):
        path = v2/'candidate'/f'{unit}-production-{lod}.glb'
        standard = inspect_glb(path,True)
        doc = glb_json(path)
        masked = [material for material in doc.get('materials',[]) if material.get('name') == f'TeamClothMasked_{unit}']
        metadata = inspect_mask_metadata(masked[0],unit) if len(masked)==1 else {'failures':['one_masked_body_material']}
        if metadata.get('mask_sha256') != source_mask_sha:
            metadata['failures'].append('embedded_mask_sha_matches_source')
        body_material_index = doc['materials'].index(masked[0]) if len(masked)==1 else -1
        body_primitives = [primitive for mesh in doc.get('meshes',[]) if 'guard-neural-uv' in mesh.get('name','')
                           for primitive in mesh.get('primitives',[])]
        if len(body_primitives)!=1 or body_primitives[0].get('material')!=body_material_index:
            metadata['failures'].append('one_body_primitive_uses_masked_material')
        if len(doc.get('images',[])) != 1:
            metadata['failures'].append('one_original_rgb_body_image')
        glbs[lod] = {'standard':standard,'metadata':metadata,'passed':standard['passed'] and not metadata['failures']}
    with Image.open(mask_path) as image:
        mask = np.asarray(image.convert('L'))
    categories = prep['categories']
    categories_pass = (categories['royal_blue']['mean_mask'] >= .95
                       and all(categories[name]['mean_mask'] <= .05 for name in ('neutral_silver','warm_gold','warm_skin_or_leather'))
                       and categories['broad_blue_residual_pixels'] / categories['royal_blue']['pixels'] < .03)
    geometry_same = old['triangles'] == build['triangles'] and old['weights'] == build['weights'] and old['clips'] == build['clips'] and old['ground'] == build['ground']
    source_same = (prep['source_sha256'] == prep['raw_copy_sha256'] == sha256(prep['source_albedo'])
                   and sha256(v1/'candidate/body-1024-q90.jpg') == sha256(v2/'candidate/body-1024-q90.jpg'))
    combined = sum(item['standard']['bytes'] for item in glbs.values())
    roundtrip_path = v2/'qa/roundtrip.json'
    roundtrip = json.loads(roundtrip_path.read_text(encoding='utf-8')) if roundtrip_path.exists() else {}
    roundtrip_pass = all(roundtrip.get(lod,{}).get('bones')==20 and
                         set(roundtrip.get(lod,{}).get('actions',[]))=={'Idle','Walk','Attack','Hurt','Death'}
                         for lod in ('lod0','lod1'))
    with Image.open(v2/'qa/blue-64.png') as blue_image, Image.open(v2/'qa/red-64.png') as red_image:
        blue_preview = np.asarray(blue_image.convert('RGBA'))
        red_preview = np.asarray(red_image.convert('RGBA'))
    preview_changed_pixels = int(np.any(blue_preview[...,:3]!=red_preview[...,:3],axis=2).sum())
    preview_pass = np.array_equal(blue_preview[...,3],red_preview[...,3]) and preview_changed_pixels > 50
    comparison = compare_fronts(v1,v2)
    report = {'unit':unit,'source_raw_rgb_preserved':source_same,'mask_sha256':source_mask_sha,'mask_min_max':[int(mask.min()),int(mask.max())],
              'categories':categories,'mask_samples_pass':categories_pass,'geometry_motion_ground_identical_to_v1':geometry_same,
              'glbs':glbs,'roundtrip_pass':roundtrip_pass,'blue_red_64_changed_pixels':preview_changed_pixels,
              'blue_red_64_preview_pass':bool(preview_pass),'comparison':comparison,'combined_glb_bytes':combined,'combined_under_3mb':combined<3000000,
              'passed':all(item['passed'] for item in glbs.values()) and source_same and categories_pass and geometry_same and combined<3000000 and roundtrip_pass and preview_pass,
              'visual_review_required':True,'runtime_publish_allowed':False}
    (v2/'qa/production-verify.json').write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8',newline='\n')
    return report


def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('--project-root',type=Path,required=True)
    parser.add_argument('--unit',choices=('priest','commander'),required=True)
    args=parser.parse_args()
    report=verify(args.project_root.resolve(),args.unit)
    print('HUMAN_MASKED_VERIFY='+json.dumps({'unit':args.unit,'passed':report['passed'],'bytes':report['combined_glb_bytes'],
          'mask_sha256':report['mask_sha256']}),flush=True)
    if not report['passed']:
        raise SystemExit(1)


if __name__=='__main__':
    main()
