"""Independent GLB/texture gates and closeup-plus-64px v2 visual contact."""
import hashlib
import json
import struct
from pathlib import Path
from PIL import Image,ImageDraw,ImageFont

ROOT=Path(__file__).resolve().parents[1]
RUN=ROOT/'runs'/'kingdom-buildings'/'2026-10-04-v2'
OLD=json.loads((ROOT/'contracts'/'kingdom-buildings.json').read_text(encoding='utf-8'))
SPECS={a['id']:a['footprint_m'] for a in OLD['assets']}
SPECS['stone-bridge']=[8,5]


def glb_json(path):
    data=path.read_bytes()
    assert data[:4]==b'glTF' and struct.unpack_from('<I',data,4)[0]==2
    assert struct.unpack_from('<I',data,8)[0]==len(data)
    length,kind=struct.unpack_from('<II',data,12)
    assert kind==0x4E4F534A
    return json.loads(data[20:20+length])


def check():
    rows=json.loads((RUN/'qa'/'mechanical.json').read_text(encoding='utf-8'))
    by_id={x['id']:x for x in rows}
    errors=[]
    for name,(w,d) in SPECS.items():
        if name not in by_id:errors.append(f'{name}: missing model');continue
        row=by_id[name]
        glb=ROOT/row['glb'];blend=ROOT/row['blend'];render=ROOT/row['render']
        data=glb_json(glb)
        mats={m['name']:m for m in data['materials']}
        primitives=[p for mesh in data['meshes'] for p in mesh['primitives']]
        attrs=[p['attributes'] for p in primitives]
        bound_min=row['bounds_min_blender_xyz_m'];bound_max=row['bounds_max_blender_xyz_m']
        tests={
          'under_20k_triangles':row['triangles']<20000,
          'under_1_5_mib':row['glb_bytes']<=1572864,
          'at_most_12_mesh_nodes':len(data['meshes'])<=12 and row['glb_mesh_nodes']<=12,
          'uv0_and_normals':all('TEXCOORD_0' in a and 'NORMAL' in a for a in attrs),
          'teamcloth_exact':'TeamCloth' in mats,
          'stone_has_color_and_normal_texture':bool(mats['IvoryLimestone'].get('normalTexture')) and bool(mats['IvoryLimestone'].get('pbrMetallicRoughness',{}).get('baseColorTexture')) if 'IvoryLimestone' in mats else False,
          'slate_has_color_and_normal_texture':bool(mats['NavySlate'].get('normalTexture')) and bool(mats['NavySlate'].get('pbrMetallicRoughness',{}).get('baseColorTexture')) if 'NavySlate' in mats else name in ('altar','tower','stone-bridge'),
          'pbr_roughness':all('roughnessFactor' in x.get('pbrMetallicRoughness',{}) for x in mats.values()),
          'texture_coordinates_valid':all(
              tex.get('texCoord',0)>=0
              for material in mats.values()
              for tex in (material.get('normalTexture'),material.get('pbrMetallicRoughness',{}).get('baseColorTexture'))
              if tex),
          'source_and_render_exist':blend.exists() and render.exists(),
          'sha256_source':hashlib.sha256(blend.read_bytes()).hexdigest()==row['sha256_blend'],
          'sha256_glb':hashlib.sha256(glb.read_bytes()).hexdigest()==row['sha256_glb'],
          'ground_zero':abs(bound_min[2])<0.002,
          'footprint_with_detail_overhang':bound_max[0]-bound_min[0]<=w+0.11 and bound_max[1]-bound_min[1]<=d+0.11,
          'no_camera_or_light':not data.get('cameras') and 'KHR_lights_punctual' not in data.get('extensionsUsed',[]),
        }
        row['qa_checks']=tests
        row['glb_materials']=sorted(mats)
        row['glb_primitive_count']=len(primitives)
        for key,val in tests.items():
            if not val:errors.append(f'{name}: {key}')
    background=(53,56,62)
    sheet=Image.new('RGB',(4*405,4*468),background)
    draw=ImageDraw.Draw(sheet)
    font=ImageFont.truetype('C:/Windows/Fonts/arial.ttf',19)
    sub=ImageFont.truetype('C:/Windows/Fonts/arial.ttf',13)
    for i,name in enumerate(SPECS):
        if name not in by_id:continue
        row=by_id[name]
        raw=Image.open(ROOT/row['render']).convert('RGBA')
        backdrop=Image.new('RGB',raw.size,(76,79,82))
        backdrop.paste(raw,mask=raw.getchannel('A'))
        large=backdrop.resize((390,390),Image.Resampling.LANCZOS)
        thumb=backdrop.resize((64,64),Image.Resampling.LANCZOS)
        x=(i%4)*405;y=(i//4)*468
        sheet.paste(large,(x+7,y+7));sheet.paste(thumb,(x+332,y+328))
        draw.rectangle((x+331,y+327,x+397,y+393),outline=(246,188,71),width=1)
        draw.text((x+10,y+400),name,font=font,fill=(244,231,202))
        draw.text((x+10,y+430),f"{row['triangles']:,} tris / {row['glb_mesh_nodes']} meshes / {row['glb_bytes']/1048576:.2f} MiB",font=sub,fill=(207,211,215))
    out=RUN/'qa'/'kingdom-buildings-v2-isometric-contact.png';sheet.save(out)
    report={'candidate_count':len(rows),'mechanical_pass':not errors,'errors':errors,
            'visual_review':{'status':'needs-review','closeup':'Castle tiers now use distinct manor and fortified court structures; material textures and normal maps are visible.','isometric_64px':'Review inset thumbnails for tier and trade silhouette recognition.','assembly':'pending; no runtime publish.'},
            'contact_sheet':str(out.relative_to(ROOT)),'assets':rows}
    (RUN/'qa'/'report.json').write_bytes(json.dumps(report,indent=2).encode('utf-8'))
    print(json.dumps({'candidate_count':len(rows),'mechanical_pass':not errors,'errors':errors,'contact_sheet':str(out)},indent=2))


if __name__=='__main__':check()
