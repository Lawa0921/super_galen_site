"""Real GLB Blender roundtrip and rendered evidence; does not touch runtime."""
import bpy,bmesh,json,math,sys,hashlib
from mathutils import Vector
from pathlib import Path
ROOT=Path(__file__).resolve().parents[3];RUN=ROOT/'art-factory/rts/runs/landmark-kit/2026-10-08-v1'
sys.dont_write_bytecode=True
sys.path.insert(0,str(Path(__file__).resolve().parent))
from landmark_kit_geometry import assert_footprint
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def import_asset(path):
    bpy.ops.wm.read_factory_settings(use_empty=True);bpy.ops.import_scene.gltf(filepath=str(path));bpy.context.view_layer.update()
    return [o for o in bpy.context.scene.objects if o.type=='MESH']
def inspect(path,objects):
    vertices=[tuple(o.matrix_world@v.co) for o in objects for v in o.data.vertices];assert_footprint(vertices)
    bounds=[[min(v[k] for v in vertices) for k in range(3)],[max(v[k] for v in vertices) for k in range(3)]]
    topology=[];degenerate=0;finite_uv=True;finite_normals=True;unit_scale=True;uv_missing=[]
    for o in objects:
        m=o.data;m.calc_loop_triangles()
        degenerate+=sum(1 for t in m.loop_triangles if t.area<1e-10)
        if not m.uv_layers:uv_missing.append(o.name)
        for l in m.uv_layers:
            finite_uv &= all(math.isfinite(v) for uv in l.data for v in uv.uv)
        finite_normals &= all(all(math.isfinite(x) for x in v.normal) and .98<v.normal.length<1.02 for v in m.vertices)
        unit_scale &= all(abs(x-1)<1e-5 for x in o.scale)
        bm=bmesh.new();bm.from_mesh(m);bmesh.ops.remove_doubles(bm,verts=list(bm.verts),dist=.000001)
        topology.append({'mesh':o.name,'welded_vertices':len(bm.verts),'open_boundary_edges':sum(e.is_boundary for e in bm.edges),'nonmanifold_edges':sum(not e.is_manifold for e in bm.edges),'loose_vertices':sum(not v.link_faces for v in bm.verts),'signed_volume':bm.calc_volume(signed=True)})
        bm.free()
    images=[{'name':im.name,'dimensions':list(im.size),'packed':bool(im.packed_file),'missing':bool(not im.has_data or min(im.size)==0)} for im in bpy.data.images if im.type=='IMAGE']
    row={'candidate':path.relative_to(ROOT).as_posix(),'sha256':sha(path),'bounds_source_z_up_after_reimport':bounds,'triangles':sum(len(o.data.loop_triangles) for o in objects),'materials':len({s.material.name for o in objects for s in o.material_slots if s.material}),'mesh_groups':len(objects),'pivot_locations':[list(o.location) for o in objects],'pivot_zero':all(o.location.length<1e-6 for o in objects),'unit_scale':unit_scale,'uv_missing':uv_missing,'uv_finite':finite_uv,'normal_finite_unit_length':finite_normals,'degenerate_triangles':degenerate,'topology_after_position_weld':topology,'embedded_images':images,'intentional_open_mesh_boundaries':'none; real windows, roofless ring, fracture surfaces and broken stumps are closed solids','passed':not degenerate and not uv_missing and finite_uv and finite_normals and unit_scale and all(not r['open_boundary_edges'] and not r['loose_vertices'] and r['signed_volume']>0 for r in topology) and all(not i['missing'] for i in images)}
    return row
def scene_lighting():
    s=bpy.context.scene;s.render.engine='BLENDER_EEVEE';s.render.image_settings.file_format='PNG';s.render.resolution_percentage=100
    s.world=bpy.data.worlds.new('Neutral studio world');s.world.use_nodes=True;s.world.node_tree.nodes['Background'].inputs[0].default_value=(.24,.30,.37,1);s.world.node_tree.nodes['Background'].inputs[1].default_value=.42
    for name,loc,energy,size in [('Warm daylight',(4,-5,9),1600,6),('Cool fill',(-5,-1,6),850,5),('Back rim',(2,5,7),1200,4)]:
        data=bpy.data.lights.new(name,'AREA');data.energy=energy;data.shape='DISK';data.size=size;o=bpy.data.objects.new(name,data);bpy.context.collection.objects.link(o);o.location=loc;o.rotation_euler=(-o.location).to_track_quat('-Z','Y').to_euler()
    # QA staging floor only; excluded from exported assets.
    bpy.ops.mesh.primitive_plane_add(size=200,location=(0,0,-.065));floor=bpy.context.object;floor.name='QA staging floor (not candidate geometry)'
    mat=bpy.data.materials.new('QA neutral warm slate floor');mat.use_nodes=True;mat.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value=(.07,.09,.10,1);mat.node_tree.nodes['Principled BSDF'].inputs['Roughness'].default_value=.93;floor.data.materials.append(mat)
    s.view_settings.view_transform='AgX';s.view_settings.look='AgX - Medium High Contrast';return s
def camera(position,target,scale):
    data=bpy.data.cameras.new('Evidence camera');data.type='ORTHO';data.ortho_scale=scale;o=bpy.data.objects.new('Evidence camera',data);bpy.context.collection.objects.link(o);o.location=position;o.rotation_euler=(Vector(target)-o.location).to_track_quat('-Z','Y').to_euler();bpy.context.scene.camera=o;return o
def views(asset,objects):
    s=scene_lighting();s.render.resolution_x=720;s.render.resolution_y=720
    height=max((o.matrix_world@v.co).z for o in objects for v in o.data.vertices);target=(0,0,height*.45);scale=max(4.40,height*1.27)
    for name,pos in [('front',(0,-9,height*.45+1.8)),('back',(0,9,height*.45+1.8)),('oblique-left',(-7,-7,height*.45+5)),('oblique-right',(7,7,height*.45+5))]:
        cam=camera(pos,target,scale);s.render.filepath=str(RUN/'qa'/f'{asset}-{name}-reimport.png');bpy.ops.render.render(write_still=True);bpy.data.objects.remove(cam,do_unlink=True)
def overview():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    for i,asset in enumerate(['river-gatehouse','river-shrine','highland-watchtower','quarry-ruins']):
        before=set(bpy.context.scene.objects);bpy.ops.import_scene.gltf(filepath=str(RUN/'candidate'/f'{asset}-lod0.glb'))
        for o in set(bpy.context.scene.objects)-before:
            if o.parent is None:o.location.x+=(i-1.5)*4.6
    s=scene_lighting();s.render.resolution_x=1600;s.render.resolution_y=850
    # Shared fixed RTS camera: downward 55 degrees, same size and light.
    camera((8,-12,21),(0,0,1.0),21);s.render.filepath=str(RUN/'qa/rts-assembly-reimport.png');bpy.ops.render.render(write_still=True)
    bpy.ops.wm.save_as_mainfile(filepath=str(RUN/'qa/reimport-assembly.blend'))
def lod_comparison():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    for lod in (0,1):
        for i,asset in enumerate(['river-gatehouse','river-shrine','highland-watchtower','quarry-ruins']):
            before=set(bpy.context.scene.objects);bpy.ops.import_scene.gltf(filepath=str(RUN/'candidate'/f'{asset}-lod{lod}.glb'))
            for o in set(bpy.context.scene.objects)-before:
                if o.parent is None:o.location.x+=(i-1.5)*4.6;o.location.y+=(lod-.5)*5.0
    s=scene_lighting();s.render.resolution_x=1600;s.render.resolution_y=1100
    camera((0,-12,22),(0,0,1.6),20);s.render.filepath=str(RUN/'qa/lod-comparison-reimport.png');bpy.ops.render.render(write_still=True)
if __name__=='__main__':
    rows=[]
    for path in sorted((RUN/'candidate').glob('*-lod*.glb')):
        objects=import_asset(path);row=inspect(path,objects);rows.append(row)
        if '-lod0' in path.stem:views(path.stem.replace('-lod0',''),objects)
    (RUN/'qa/reimport.json').write_text(json.dumps({'blender_version':bpy.app.version_string,'checks':rows,'passed':all(r['passed'] for r in rows)},indent=2)+'\n')
    overview();lod_comparison();print(json.dumps({'reimport_checks':len(rows),'passed':all(r['passed'] for r in rows)}))
    if not all(r['passed'] for r in rows):raise RuntimeError('Reimport QA failed; inspect saved report')
