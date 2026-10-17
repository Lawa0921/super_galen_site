"""Import every v2 GLB in Blender and check ground, materials and mesh counts."""
import bpy
import json
from pathlib import Path
from mathutils import Vector

ROOT=Path(__file__).resolve().parents[1]
RUN=ROOT/'runs'/'kingdom-buildings'/'2026-10-04-v2'
rows=json.loads((RUN/'qa'/'mechanical.json').read_text(encoding='utf-8'))
results=[]
for item in rows:
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.object.delete(use_global=False)
    for mat in list(bpy.data.materials):bpy.data.materials.remove(mat)
    bpy.ops.import_scene.gltf(filepath=str(ROOT/item['glb']))
    mesh=[ob for ob in bpy.context.scene.objects if ob.type=='MESH']
    pts=[ob.matrix_world@Vector(c) for ob in mesh for c in ob.bound_box]
    minimum=[round(min(p[i] for p in pts),4) for i in range(3)]
    maximum=[round(max(p[i] for p in pts),4) for i in range(3)]
    materials={m.name for ob in mesh for m in ob.data.materials}
    check={'id':item['id'],'import_mesh_count':len(mesh),'bounds_min_xyz_m':minimum,
           'bounds_max_xyz_m':maximum,'ground_zero':abs(minimum[2])<0.002,
           'teamcloth':'TeamCloth' in materials,
           'mesh_count_matches':len(mesh)==item['glb_mesh_nodes'],
           'source_bounds_match':all(abs(minimum[i]-item['bounds_min_blender_xyz_m'][i])<0.02 and
                                     abs(maximum[i]-item['bounds_max_blender_xyz_m'][i])<0.02
                                     for i in range(3))}
    assert all(check[k] for k in ('ground_zero','teamcloth','mesh_count_matches','source_bounds_match')),check
    results.append(check)
    if item['id'] in ('townhall-tier3','stable','stone-bridge'):
        target=Vector((0,0,maximum[2]*0.48))
        bpy.ops.object.camera_add(location=(11,-15,12))
        cam=bpy.context.object
        cam.rotation_euler=(target-cam.location).to_track_quat('-Z','Y').to_euler()
        cam.data.type='ORTHO'
        w=maximum[0]-minimum[0];d=maximum[1]-minimum[1]
        cam.data.ortho_scale=max(w,d,maximum[2])*1.46+1.55
        bpy.context.scene.camera=cam
        bpy.ops.object.light_add(type='AREA',location=(2,-5,11))
        bpy.context.object.data.energy=1700
        bpy.context.object.data.size=7
        bpy.ops.object.light_add(type='AREA',location=(-7,4,8))
        bpy.context.object.data.energy=1150
        bpy.context.object.data.size=6
        bpy.context.scene.render.engine='BLENDER_EEVEE'
        bpy.context.scene.render.resolution_x=560
        bpy.context.scene.render.resolution_y=560
        bpy.context.scene.render.film_transparent=True
        out=RUN/'qa'/'roundtrip-renders'/f"{item['id']}.png"
        out.parent.mkdir(parents=True,exist_ok=True)
        bpy.context.scene.render.filepath=str(out)
        bpy.ops.render.render(write_still=True)
(RUN/'qa'/'import-roundtrip.json').write_bytes(json.dumps(results,indent=2).encode('utf-8'))
print(f'ROUNDTRIP PASS {len(results)} GLBs')
