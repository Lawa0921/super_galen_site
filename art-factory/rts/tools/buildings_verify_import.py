"""Independent Blender round-trip check of the exported candidate GLBs."""
import bpy
import json
from pathlib import Path
from mathutils import Vector

ROOT=Path(__file__).resolve().parents[1]
RUN=ROOT/'runs'/'kingdom-buildings'/'2026-10-04-original-blender'
contract=json.loads((ROOT/'contracts'/'kingdom-buildings.json').read_text(encoding='utf-8'))
rows=[]
for asset in contract['assets']:
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.object.delete(use_global=False)
    for mat in list(bpy.data.materials):bpy.data.materials.remove(mat)
    name=asset['id']
    bpy.ops.import_scene.gltf(filepath=str(RUN/'candidate'/f'{name}.glb'))
    objects=[ob for ob in bpy.context.scene.objects if ob.type=='MESH']
    corners=[ob.matrix_world@Vector(c) for ob in objects for c in ob.bound_box]
    xyz_min=[min(v[i] for v in corners) for i in range(3)]
    xyz_max=[max(v[i] for v in corners) for i in range(3)]
    mats={mat.name for ob in objects for mat in ob.data.materials}
    entrance=[ob for ob in objects if 'Deep shadow of open entrance' in ob.name or
              'Shadowed tower entrance' in ob.name]
    entrance_y=min((ob.matrix_world.translation.y for ob in entrance),default=None)
    row={'id':name,'mesh_count':len(objects),'min_blender_xyz_m':[round(v,4) for v in xyz_min],
         'max_blender_xyz_m':[round(v,4) for v in xyz_max],
         'teamcloth': 'TeamCloth' in mats,
         'ground_zero':abs(xyz_min[2])<0.002,
         'entrance_negative_y_after_import':entrance_y<0 if entrance_y is not None else None}
    rows.append(row)
    assert row['teamcloth'] and row['ground_zero'],row
    assert row['entrance_negative_y_after_import'] is not False,row
path=RUN/'qa'/'import-roundtrip.json'
path.write_bytes(json.dumps(rows,indent=2).encode('utf-8'))
print(f'ROUNDTRIP PASS {len(rows)} GLBs')
