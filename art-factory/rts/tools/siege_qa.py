"""Independent GLB, animation-channel, material and provenance audit."""
import hashlib
import json
import struct
from pathlib import Path

from PIL import Image,ImageChops,ImageStat

ROOT=Path(__file__).resolve().parents[1]
RUN=ROOT/'runs'/'kingdom-siege'/'2026-10-04-original'
CONTRACT=json.loads((ROOT/'contracts'/'siege.json').read_text(encoding='utf-8'))


def sha(path):return hashlib.sha256(path.read_bytes()).hexdigest()


def parse_glb(path):
    raw=path.read_bytes()
    assert raw[:4]==b'glTF' and struct.unpack_from('<I',raw,4)[0]==2
    assert struct.unpack_from('<I',raw,8)[0]==len(raw)
    offset=12;chunks={}
    while offset<len(raw):
        size,tag=struct.unpack_from('<I4s',raw,offset);offset+=8
        chunks[tag]=raw[offset:offset+size];offset+=size
    return json.loads(chunks[b'JSON']),chunks.get(b'BIN\x00',b'')


def accessor_values(data,binary,index):
    access=data['accessors'][index];view=data['bufferViews'][access['bufferView']]
    width={'SCALAR':1,'VEC2':2,'VEC3':3,'VEC4':4,'MAT4':16}[access['type']]
    fmt={5126:'f',5125:'I',5123:'H',5121:'B'}[access['componentType']]
    size=struct.calcsize('<'+fmt*width)
    stride=view.get('byteStride',size)
    start=view.get('byteOffset',0)+access.get('byteOffset',0)
    return [struct.unpack_from('<'+fmt*width,binary,start+i*stride)
            for i in range(access['count'])]


def channel_span(data,binary,animation,node_name,path):
    for channel in animation['channels']:
        target=channel['target']
        if data['nodes'][target['node']].get('name')!=node_name or target['path']!=path:continue
        samples=accessor_values(data,binary,animation['samplers'][channel['sampler']]['output'])
        return max(max(values[i] for values in samples)-min(values[i] for values in samples)
                   for i in range(len(samples[0])))
    return 0


def compare_images(lod):
    a=Image.open(RUN/'qa'/'renders'/f'siege-lod{lod}.png').convert('RGBA')
    b=Image.open(RUN/'qa'/'roundtrip'/f'siege-lod{lod}-idle-quarter.png').convert('RGBA')
    return [round(v,4) for v in ImageStat.Stat(ImageChops.difference(a,b)).mean]


def asset(lod,recorded,imported):
    source=RUN/'raw'/f'siege-lod{lod}.blend'
    path=RUN/'candidate'/f'siege-lod{lod}.glb'
    data,binary=parse_glb(path)
    mesh=[p for item in data['meshes'] for p in item['primitives']]
    triangles=sum(data['accessors'][p['indices']]['count']//3 for p in mesh)
    materials=data['materials']
    names=[m['name'] for m in materials]
    clips={a['name']:a for a in data['animations']}
    root=next(n for n in data['nodes'] if n.get('name')=='SiegeRoot')
    visual=[n.get('name','') for n in data['nodes'] if 'mesh' in n]
    team=next(m for m in materials if m['name']=='TeamCloth')
    color=team['pbrMetallicRoughness'].get('baseColorFactor')
    spans={
        'walk_fl_rotation':channel_span(data,binary,clips['Walk'],'WheelPivot_FL','rotation'),
        'walk_fr_rotation':channel_span(data,binary,clips['Walk'],'WheelPivot_FR','rotation'),
        'walk_rl_rotation':channel_span(data,binary,clips['Walk'],'WheelPivot_RL','rotation'),
        'walk_rr_rotation':channel_span(data,binary,clips['Walk'],'WheelPivot_RR','rotation'),
        'attack_bolt_translation':channel_span(data,binary,clips['Attack'],'LoadedQuarrelPivot','translation'),
        'attack_bolt_visibility':channel_span(data,binary,clips['Attack'],'LoadedQuarrelPivot','scale'),
        'attack_left_string':channel_span(data,binary,clips['Attack'],'WaxedBowstring_-1','translation'),
        'attack_right_string':channel_span(data,binary,clips['Attack'],'WaxedBowstring_1','translation'),
        'death_bow_rotation':channel_span(data,binary,clips['Death'],'BowFlexPivot','rotation'),
        'hurt_body_rotation':channel_span(data,binary,clips['Hurt'],'ChassisRecoilPivot','rotation'),
        'idle_cloth_rotation':channel_span(data,binary,clips['Idle'],'TeamCloth_pennant_1','rotation'),
    }
    motion_floor={key:(.03 if key=='idle_cloth_rotation' else .04 if key=='hurt_body_rotation' else .08)
                  for key in spans}
    delta=compare_images(lod)
    mapped={'HewnOak','ForgedIron','TeamCloth'}
    checks={
        'glb_source_hashes':sha(path)==recorded['glb_sha256'] and sha(source)==recorded['source_sha256'],
        'triangle_count':triangles==recorded['triangles_blender']==imported['import_triangle_count'],
        'triangle_limit':triangles<CONTRACT['lod_contract']['lod0_max_triangles'],
        'material_exact_team_slot':names.count('TeamCloth')==1,
        'team_tint_factor_and_texture':color is not None and color[2]>color[0]*3 and
            team['pbrMetallicRoughness'].get('baseColorTexture',{}).get('texCoord',0)==0,
        'uv0_normals':all({'POSITION','NORMAL','TEXCOORD_0'}<=set(p['attributes']) for p in mesh),
        'pbr_maps':all(m.get('pbrMetallicRoughness',{}).get('baseColorTexture',{}).get('index') is not None
                       and m.get('normalTexture',{}).get('index') is not None
                       for m in materials if m['name'] in mapped),
        'texture_coordinates':all(t.get('texCoord',0)==0 for m in materials for t in
            [m.get('pbrMetallicRoughness',{}).get('baseColorTexture',{}),m.get('normalTexture',{})] if t),
        'exact_five_clips':set(clips)==set(CONTRACT['animation_contract']['exact_clips'])==set(imported['imported_clips']),
        'all_clips_have_channels':all(len(a['channels'])>0 for a in clips.values()),
        'mechanical_motion_channels':all(value>motion_floor[key] for key,value in spans.items()),
        'ground_and_height':abs(imported['bounds_min_blender_xyz_m'][2])<.02 and
            1.6<=imported['bounds_max_blender_xyz_m'][2]<=2.2,
        'chassis_length':2.0<=imported['bounds_max_blender_xyz_m'][1]-imported['bounds_min_blender_xyz_m'][1]<=2.8,
        'root_collision_metadata_only':root.get('extras',{}).get('collision_radius_m')==.78 and
            not any('Collision' in n or 'Hitbox' in n for n in visual),
        'forward_contract':root.get('extras',{}).get('forward_glb')=='-Z',
        'roundtrip_bounds':all(abs(a-b)<.025 for side in ('min','max') for a,b in zip(
            recorded[f'bounds_{side}_blender_xyz_m'],imported[f'bounds_{side}_blender_xyz_m'])),
        'render_roundtrip':max(delta)<2,
        'runtime_false':recorded['runtime_publish_allowed'] is False,
    }
    if lod==0:
        checks['roundtrip_walk_wheel']=imported['walk_wheel_angle_rad_sample']>.3
        checks['roundtrip_attack_travel']=imported['attack_sample']['bolt_travel_m']>.3
        checks['roundtrip_death_bow']=imported['death_bow_angle_rad_sample']>.3
    return {'lod':lod,'triangles':triangles,'glb_bytes':path.stat().st_size,
            'mesh_nodes':len(data['meshes']),'draw_primitives':len(mesh),'materials':names,
            'clips':{n:len(a['channels']) for n,a in clips.items()},
            'channel_spans':{k:round(v,4) for k,v in spans.items()},
            'render_mean_abs_rgba':delta,'checks':checks,'pass':all(checks.values())}


def textures():
    rows=json.loads((RUN/'qa'/'textures.json').read_text(encoding='utf-8'))
    checks={}
    for r in rows:
        checks[r['id']]=(sha(ROOT/r['source'])==r['source_sha256'] and
            sha(ROOT/r['basecolor'])==r['basecolor_sha256'] and
            sha(ROOT/r['normal'])==r['normal_sha256'] and r['seam_mae_after']==0)
    image=Image.open(RUN/'candidate'/'textures'/'navy-cloth-basecolor.jpg').convert('RGB')
    samples=[image.getpixel(p) for p in ((0,0),(200,200),(511,511))]
    checks['team_weave_neutral']=all(max(rgb)-min(rgb)<=2 for rgb in samples)
    return checks


if __name__=='__main__':
    mechanical={r['lod']:r for r in json.loads((RUN/'qa'/'mechanical.json').read_text())}
    imported={r['lod']:r for r in json.loads((RUN/'qa'/'roundtrip.json').read_text())}
    assets=[asset(i,mechanical[i],imported[i]) for i in (0,1)]
    ratio=assets[1]['triangles']/assets[0]['triangles']
    lod_ratio=CONTRACT['lod_contract']['lod1_target_ratio'][0]<=ratio<=CONTRACT['lod_contract']['lod1_target_ratio'][1]
    tex=textures()
    checks={'lod_ratio':lod_ratio,'textures':all(tex.values())}
    report={'status':'pass' if all(a['pass'] for a in assets) and all(checks.values()) else 'fail',
            'scope':'candidate-only','assets':assets,'lod1_to_lod0_triangle_ratio':ratio,
            'texture_checks':tex,'checks':checks}
    (RUN/'qa'/'structural.json').write_bytes(json.dumps(report,indent=2).encode('utf-8'))
    print(json.dumps({'status':report['status'],'triangles':[a['triangles'] for a in assets],
                      'lod_ratio':round(ratio,3),'failed':[(a['lod'],[k for k,v in a['checks'].items() if not v]) for a in assets],
                      'texture_checks':tex},indent=2))
    if report['status']!='pass':raise SystemExit(1)
