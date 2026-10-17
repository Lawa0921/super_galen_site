"""Read-only structural QA for the guard GLB container."""
import json
import struct
import hashlib
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
RUN=ROOT/'runs'/'guard-pilot'/'2026-10-04-original'
path=RUN/'candidate'/'dawnrealm-guard-pilot.glb'
data=path.read_bytes()
magic,version,total=struct.unpack_from('<III',data)
assert magic==0x46546C67 and version==2 and total==len(data)
length,kind=struct.unpack_from('<II',data,12)
assert kind==0x4E4F534A
doc=json.loads(data[20:20+length])
triangles=0
mesh_nodes=0
unskinned=[]
missing_attributes=[]
overall_min=[float('inf')]*3
overall_max=[float('-inf')]*3
for node in doc.get('nodes',[]):
    if 'mesh' in node:
        mesh_nodes+=1
        if 'skin' not in node:unskinned.append(node.get('name'))
for mesh in doc.get('meshes',[]):
    for primitive in mesh.get('primitives',[]):
        attributes=primitive.get('attributes',{})
        if not {'POSITION','NORMAL','TEXCOORD_0','JOINTS_0','WEIGHTS_0'}.issubset(attributes):
            missing_attributes.append(mesh.get('name'))
        bounds=doc['accessors'][attributes['POSITION']]
        for axis in range(3):
            overall_min[axis]=min(overall_min[axis],bounds['min'][axis])
            overall_max[axis]=max(overall_max[axis],bounds['max'][axis])
        if 'indices' in primitive:
            triangles+=doc['accessors'][primitive['indices']]['count']//3
        else:
            triangles+=doc['accessors'][primitive['attributes']['POSITION']]['count']//3
names=[a.get('name') for a in doc.get('animations',[])]
materials=doc.get('materials',[])
team=[m for m in materials if m.get('name','').startswith('TeamCloth')]
report={
    'glb_bytes':len(data),'sha256':hashlib.sha256(data).hexdigest(),
    'mesh_nodes':mesh_nodes,'skin_count':len(doc.get('skins',[])),
    'unskinned_mesh_nodes':unskinned,'missing_required_vertex_attributes':missing_attributes,
    'triangles':triangles,'animation_names':names,
    'bounds_gltf_min':overall_min,'bounds_gltf_max':overall_max,
    'dimensions_m':[round(b-a,4) for a,b in zip(overall_min,overall_max)],
    'animation_channels':{a.get('name'):len(a.get('channels',[])) for a in doc.get('animations',[])},
    'material_count':len(materials),'team_cloth_pbr':bool(team and team[0].get('pbrMetallicRoughness')),
}
report['structural_pass']=(not unskinned and not missing_attributes and report['skin_count']>=1 and
                set(['Idle','Walk','Attack','Hurt','Death']).issubset(names) and
                report['team_cloth_pbr'] and triangles<=20000)
report['production_ready']=False
report['remaining_visual_risk']='Surface detailing, dynamic motion and death ground contact require review; no external glTF validator run.'
(RUN/'qa'/'glb-qa.json').write_bytes((json.dumps(report,indent=2)+'\n').encode('utf-8'))
print(json.dumps(report,indent=2))
if not report['structural_pass']:
    raise SystemExit('Guard GLB structural QA failed')
