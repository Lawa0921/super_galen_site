"""Extend the bridge's source voussoirs into a full textured stone barrel."""
import argparse,json,sys,hashlib
from pathlib import Path
import bpy,bmesh
sys.path.insert(0,str(Path(__file__).parent))
import buildings_v2_generate as architecture
from detail_materials import externalize_building
from visual_hand_rework import mesh_fingerprint
from visual_bridge_test import inspect

p=argparse.ArgumentParser();p.add_argument('--source',type=Path,required=True);p.add_argument('--run',type=Path,required=True)
a=p.parse_args(sys.argv[sys.argv.index('--')+1:]);run=a.run.resolve()
for folder in ('raw','candidate','qa'):(run/folder).mkdir(parents=True,exist_ok=True)
bpy.ops.wm.open_mainfile(filepath=str(a.source.resolve()))
arches=[o for o in bpy.data.objects if o.type=='MESH' and 'Bridge true masonry arch' in o.name and 'voussoir' in o.name]
assert len(arches)==24
unchanged={o.name:mesh_fingerprint(o) for o in bpy.data.objects if o.type=='MESH' and o not in arches}
world_points={o.name:[o.matrix_world@v.co for v in o.data.vertices] for o in arches}
low=min(p.y for points in world_points.values() for p in points);high=max(p.y for points in world_points.values() for p in points)
changes=[]
for obj in arches:
    points=world_points[obj.name];middle=sum(p.y for p in points)/len(points)
    if middle>0:
        bpy.data.objects.remove(obj,do_unlink=True);continue
    inverse=obj.matrix_world.inverted()
    for vertex,point in zip(obj.data.vertices,points):
        point.y=low if point.y<middle else high;vertex.co=inverse@point
    bm=bmesh.new();bm.from_mesh(obj.data);bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));bm.to_mesh(obj.data);bm.free();obj.data.update()
    # The source facade UVs stay intact; only the newly extended longitudinal
    # faces receive metric UVs so six metres of stone does not stretch one tile.
    uv=obj.data.uv_layers.active
    for poly in obj.data.polygons:
        if abs(poly.normal.y)>.9:continue
        across=0 if abs(poly.normal.z)>abs(poly.normal.x) else 2
        for loop in poly.loop_indices:
            point=obj.matrix_world@obj.data.vertices[obj.data.loops[loop].vertex_index].co
            uv.data[loop].uv=(point.y*1.8,point[across]*1.8)
    changes.append({'object':obj.name,'span_m':[low,high],'source_geometry':'original closed 8-vertex voussoir extended between original facade planes'})
assert len(changes)==12
for name,digest in unchanged.items():assert mesh_fingerprint(bpy.data.objects[name])==digest,('Unrelated source part changed',name)
qa=inspect();assert not qa['failures'],qa['failures']
bpy.context.preferences.filepaths.save_version=0;bpy.ops.file.pack_all();bpy.ops.wm.save_as_mainfile(filepath=str(run/'raw/stone-bridge.blend'))
objects=[o for o in bpy.data.objects if o.type=='MESH'];architecture.g.M={m.name:m for m in bpy.data.materials};joined=architecture.join_by_material(objects)
bpy.ops.object.select_all(action='DESELECT')
for obj in joined:obj.select_set(True)
bpy.context.view_layer.objects.active=joined[0];out=run/'candidate/stone-bridge.glb'
bpy.ops.export_scene.gltf(filepath=str(out),export_format='GLB',use_selection=True,export_yup=True,export_apply=True,export_normals=True,export_texcoords=True,export_materials='EXPORT')
externalize_building(out)
report={'source':str(a.source),'source_sha256':hashlib.sha256(a.source.read_bytes()).hexdigest(),'changes':changes,'unchanged_mesh_fingerprints':unchanged,'qa':qa,'candidate_sha256':hashlib.sha256(out.read_bytes()).hexdigest(),'bytes':out.stat().st_size,'runtime_publish_allowed':False,'artistic_quality_proven':False}
(run/'qa/build.json').write_text(json.dumps(report,indent=2)+'\n')
