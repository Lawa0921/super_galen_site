"""Inspect GLB candidate metadata and prepare orthographic visual review sheets."""
import json
import struct
import hashlib
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

ROOT=Path(__file__).resolve().parents[1]
RUN=ROOT/'runs'/'kingdom-buildings'/'2026-10-04-original-blender'
CONTRACT=json.loads((ROOT/'contracts'/'kingdom-buildings.json').read_text(encoding='utf-8'))


def gltf_json(path):
    data=path.read_bytes()
    assert data[:4]==b'glTF'
    assert struct.unpack_from('<I',data,4)[0]==2
    assert struct.unpack_from('<I',data,8)[0]==len(data)
    length,kind=struct.unpack_from('<II',data,12)
    assert kind==0x4E4F534A
    return json.loads(data[20:20+length])


def main():
    metrics=json.loads((RUN/'qa'/'mechanical.json').read_text(encoding='utf-8'))
    by_id={m['id']:m for m in metrics}
    errors=[]
    for spec in CONTRACT['assets']:
        name=spec['id']; m=by_id[name]
        path=ROOT/m['candidate']; gltf=gltf_json(path)
        materials={x['name'] for x in gltf['materials']}
        primitives=[p for mesh in gltf['meshes'] for p in mesh['primitives']]
        attrs=[p['attributes'] for p in primitives]
        checks={
            'triangles_under_20k':m['triangles']<20000,
            'glb_under_1_5_mib':path.stat().st_size<=1572864,
            'uv_all_primitives':all('TEXCOORD_0' in a for a in attrs),
            'normals_all_primitives':all('NORMAL' in a for a in attrs),
            'teamcloth_exact_name':'TeamCloth' in materials,
            'pbr_roughness_all_materials':all('roughnessFactor' in x.get('pbrMetallicRoughness',{}) for x in gltf['materials']),
            'blend_exists':(ROOT/m['source']).exists(),
            'blend_hash_matches':hashlib.sha256((ROOT/m['source']).read_bytes()).hexdigest()==m['sha256_blend'],
            'glb_hash_matches':hashlib.sha256(path.read_bytes()).hexdigest()==m['sha256_glb'],
            'render_exists':(ROOT/m['render']).exists(),
            'origin_ground_in_blender':abs(m['bounds_min_blender_xyz_m'][2])<0.001,
            'no_camera_or_light_in_glb':not gltf.get('cameras') and not any('KHR_lights_punctual' in x for x in gltf.get('extensionsUsed',[])),
        }
        m['glb_materials']=sorted(materials)
        m['glb_mesh_primitives']=len(primitives)
        m['checks']=checks
        for check,okay in checks.items():
            if not okay:errors.append(f'{name}: {check}')
        w,d=spec['footprint_m']
        dims=m['dimensions_blender_xyz_m']
        if dims[0]>w+0.1 or dims[1]>d+0.1:
            errors.append(f'{name}: bounds {dims[:2]} exceed footprint {w}x{d}')
    contact=Image.new('RGB',(4*405,3*470),(28,31,37))
    draw=ImageDraw.Draw(contact)
    font=ImageFont.truetype('C:/Windows/Fonts/arial.ttf',19)
    small=ImageFont.truetype('C:/Windows/Fonts/arial.ttf',13)
    for i,spec in enumerate(CONTRACT['assets']):
        name=spec['id']; m=by_id[name]
        x=(i%4)*405;y=(i//4)*470
        raw=Image.open(ROOT/m['render']).convert('RGBA')
        backdrop=Image.new('RGB',raw.size,(78,81,82))
        backdrop.paste(raw,mask=raw.getchannel('A'))
        large=backdrop.resize((390,390),Image.Resampling.LANCZOS)
        contact.paste(large,(x+7,y+7))
        thumb=backdrop.resize((64,64),Image.Resampling.LANCZOS)
        contact.paste(thumb,(x+331,y+330))
        draw.rectangle((x+330,y+329,x+396,y+395),outline=(243,191,77),width=1)
        draw.text((x+11,y+402),name,font=font,fill=(242,229,200))
        draw.text((x+11,y+431),f"{m['triangles']:,} tris | {m['glb_bytes']/1048576:.2f} MiB",font=small,fill=(200,204,208))
    sheet=RUN/'qa'/'kingdom-buildings-isometric-contact.png'
    contact.save(sheet)
    result={'assets':metrics,'errors':errors,'mechanical_pass':not errors,
            'contact_sheet':str(sheet.relative_to(ROOT)),
            'visual_review':{
                'status':'needs-revision',
                'closeup':'Architectural meshes and trade silhouettes present; broad wall and roof surfaces remain visually sparse against the supplied high-detail concept.',
                'isometric_64px':'Tower, chapel, forge chimney, lumbermill wheel and open altar read. Townhall tiers and barracks/stable/workshop still have subtle differentiation at 64px.',
                'release_decision':'Candidate only. Do not publish to runtime until visual refinement and assembly review.'
            }}
    (RUN/'qa'/'report.json').write_bytes(json.dumps(result,indent=2).encode('utf-8'))
    print(json.dumps({'mechanical_pass':not errors,'errors':errors,'contact_sheet':str(sheet)},indent=2))


if __name__=='__main__':main()
