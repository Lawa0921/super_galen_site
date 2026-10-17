"""Import exported GLBs in clean Blender scenes and render the actual delivered models."""
import bpy
import json
import math
import os
import sys
from pathlib import Path
from mathutils import Vector

ROOT=Path(__file__).resolve().parents[1]
RUN=ROOT/'runs'/'kingdom-props'/os.environ.get('KINGDOM_PROPS_RUN','2026-10-04-original')
ASSETS={'oak':(7,6),'rock':(2.6,2.4),'gold-mine':(5,5),'timber-pile':(2,2)}
if RUN.name.endswith('oak-v2'):
    contract=json.loads((ROOT/'contracts'/'kingdom-props.json').read_text(encoding='utf-8'))
    revision=next(r for r in contract['revisions'] if r['run_id']==RUN.name)
    ASSETS[revision['asset_id']]=tuple(revision['footprint_m'])

def verify(name):
    bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
    bpy.ops.import_scene.gltf(filepath=str(RUN/'candidate'/f'{name}.glb'))
    mesh=[o for o in bpy.context.scene.objects if o.type=='MESH']
    assert mesh
    bounds=[o.matrix_world@Vector(c) for o in mesh for c in o.bound_box]
    lo=[min(v[i] for v in bounds) for i in range(3)]
    hi=[max(v[i] for v in bounds) for i in range(3)]
    tri=sum(sum(len(p.vertices)-2 for p in o.data.polygons) for o in mesh)
    material_names=sorted({slot.material.name for o in mesh for slot in o.material_slots if slot.material})
    high=hi[2];w,d=ASSETS[name]
    scene=bpy.context.scene
    scene.render.engine='BLENDER_EEVEE'
    scene.render.resolution_x=640;scene.render.resolution_y=640
    scene.render.resolution_percentage=100;scene.render.film_transparent=True
    scene.world.color=(0.24,0.24,0.24)
    bpy.ops.object.camera_add(location=(11,-15,max(9,high*1.32)))
    cam=bpy.context.object
    cam.rotation_euler=(Vector((0,0,high*0.50))-cam.location).to_track_quat('-Z','Y').to_euler()
    cam.data.type='ORTHO';cam.data.ortho_scale=max(w,d,high*0.93)*1.38+1.15
    scene.camera=cam
    for loc,energy,size in [((2,-5,12),1900,7),((-7,4,9),1200,6)]:
        bpy.ops.object.light_add(type='AREA',location=loc)
        bpy.context.object.data.energy=energy;bpy.context.object.data.size=size
    dest=RUN/'qa'/'roundtrip';dest.mkdir(parents=True,exist_ok=True)
    scene.render.filepath=str(dest/f'{name}.png')
    bpy.ops.render.render(write_still=True)
    return {'id':name,'blender_import_bounds_min_xyz_m':[round(v,4) for v in lo],
            'blender_import_bounds_max_xyz_m':[round(v,4) for v in hi],
            'import_triangle_count':tri,'import_mesh_count':len(mesh),
            'materials':material_names,'render':str((dest/f'{name}.png').relative_to(ROOT))}

if __name__=='__main__':
    args=sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else list(ASSETS)
    report=RUN/'qa'/'roundtrip.json'
    previous=json.loads(report.read_text(encoding='utf-8')) if report.exists() else []
    rows={row['id']:row for row in previous}
    for name in args:
        print('ROUNDTRIP',name,flush=True);rows[name]=verify(name)
    report.write_bytes(json.dumps([rows[n] for n in ASSETS if n in rows],indent=2).encode('utf-8'))
    print('ROUNDTRIP COMPLETE',flush=True)
