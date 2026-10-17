"""Check the exact exported runtime contract, including preserved team masks."""
import json,struct,hashlib
from pathlib import Path
ROOT=Path(__file__).resolve().parents[3];RUN=ROOT/'art-factory/rts/runs/original-crossbow-articulated-hand/2026-10-07-v1';rows=[]
for lod in (0,1):
    path=RUN/f'candidate/original-crossbow-grip-lod{lod}.glb';data=path.read_bytes();length,kind=struct.unpack_from('<II',data,12);assert kind==0x4e4f534a;gltf=json.loads(data[20:20+length])
    assert [len(s['joints']) for s in gltf['skins']]==[36]
    assert {a['name'] for a in gltf['animations']}=={'Idle','Walk','Attack','Hurt','Death'}
    children={i for n in gltf['nodes'] for i in n.get('children',[])}
    assert all(i not in children for i,n in enumerate(gltf['nodes']) if 'mesh' in n and 'skin' in n),'Skinned mesh nodes must be scene roots'
    masks=[m for m in gltf['materials'] if 'TeamCloth' in m.get('name','')];assert masks
    assert all(m.get('extras',{}).get('teamTintMask','').startswith('data:image/png;base64,') for m in masks),'Original embedded cloth masks were lost during GLB export'
    assert all('uri' not in image for image in gltf['images']),'Character textures must be embedded'
    rows.append({'lod':lod,'sha256':hashlib.sha256(data).hexdigest(),'bones':36,'clips':5,'original_team_mask_materials':len(masks),'textures_embedded':len(gltf['images'])})
report={'pass':True,'rows':rows,'runtime_publish_allowed':False};(RUN/'qa/glb-structure.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps(report))
