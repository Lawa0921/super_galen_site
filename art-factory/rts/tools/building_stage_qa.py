"""Actual GLB Blender roundtrip, source equivalence and fixed-camera previews."""
import bpy
import collections
import json
import math
import sys
from pathlib import Path
from mathutils import Vector
sys.dont_write_bytecode = True
sys.path.insert(0, str(Path(__file__).resolve().parent))
from building_stage_build import ROOT, MAIN, RUN, IDS, read, save, sha, bounds, triangle_rows, digest_rows
from building_stage_classify import THRESHOLDS

def normal_samples(objects):
    rows = collections.defaultdict(list)
    for obj in objects:
        mesh = obj.data; mesh.calc_loop_triangles(); uv = mesh.uv_layers.active
        transform = obj.matrix_world.to_3x3().inverted().transposed()
        for tri in mesh.loop_triangles:
            material = mesh.materials[tri.material_index].name.split('.')[0]
            for vertex, loop in zip(tri.vertices, tri.loops):
                pos = obj.matrix_world @ mesh.vertices[vertex].co
                key = (material, tuple(round(float(v),4) for v in (*pos,*uv.data[loop].uv)))
                rows[key].append(tuple((transform @ mesh.corner_normals[loop].vector).normalized()))
    return rows

def compare_normals(before, after):
    distances = []; examples = []
    for key, source in before.items():
        targets = after[key]
        for normal in source:
            target = min(targets,key=lambda n:sum((a-b)**2 for a,b in zip(normal,n)))
            distance = math.sqrt(sum((a-b)**2 for a,b in zip(normal,target)))
            distances.append(distance)
            if distance>0.001 and len(examples)<8: examples.append({'vertex_key':key,'before':normal,'after':target,'distance':distance})
    return {'samples':len(distances),'max_vector_delta':max(distances),'mean_vector_delta':sum(distances)/len(distances),'samples_over_001':sum(d>0.001 for d in distances),'examples':examples}

def directed_normal_samples(objects):
    rows=collections.defaultdict(list)
    for obj in objects:
        mesh=obj.data;mesh.calc_loop_triangles();uv=mesh.uv_layers.active
        transform=obj.matrix_world.to_3x3().inverted().transposed()
        for tri in mesh.loop_triangles:
            corners=[];normals=[]
            for vertex,loop in zip(tri.vertices,tri.loops):
                pos=obj.matrix_world@mesh.vertices[vertex].co
                corners.append(tuple(round(float(v),4) for v in (*pos,*uv.data[loop].uv)))
                normals.append(tuple((transform@mesh.corner_normals[loop].vector).normalized()))
            rotation=min(range(3),key=lambda i:tuple(corners[i:]+corners[:i]))
            key=(mesh.materials[tri.material_index].name.split('.')[0],tuple(corners[rotation:]+corners[:rotation]))
            rows[key].append(normals[rotation:]+normals[:rotation])
    return rows

def compare_directed_normals(before,after):
    unmatched=set(before)^set(after);distances=[];ambiguous=0
    for key in set(before)&set(after):
        source=before[key];candidate=after[key]
        if any(value!=source[0] for value in source[1:]) or any(value!=candidate[0] for value in candidate[1:]): ambiguous+=1
        if len(source)!=len(candidate): unmatched.add(key)
        # Conservative measurement over every candidate pair for duplicates; no nearest-side inference.
        for first in source:
            for second in candidate:
                distances.extend(math.sqrt(sum((a-b)**2 for a,b in zip(x,y))) for x,y in zip(first,second))
    maximum=max(distances)
    return {'method':'complete directed material+triangle(position/UV@1e-4), cyclic corner correspondence; conservative all-pairs if duplicate triangle',
            'matched_triangle_keys':len(set(before)&set(after)),'ambiguous_triangle_keys':ambiguous,'unmatched_triangle_keys':len(unmatched),
            'samples':len(distances),'max_vector_delta':maximum,'max_angle_degrees':math.degrees(2*math.asin(min(1,maximum/2))),
            'mean_vector_delta':sum(distances)/len(distances),'tolerance_vector_delta':.005,'passed':not unmatched and not ambiguous and maximum<=.005}

def import_model(path):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=str(path)); bpy.context.view_layer.update()
    return [obj for obj in bpy.context.scene.objects if obj.type == 'MESH']

def material_signature(objects):
    rows = []
    for material in {slot.material for obj in objects for slot in obj.material_slots if slot.material}:
        nodes = []
        for node in material.node_tree.nodes:
            if node.type == 'TEX_IMAGE' and node.image:
                pixels = list(node.image.pixels[:])
                # Blender import pixels are deterministic, independent of image URI/name.
                import numpy as np, hashlib
                digest = hashlib.sha256(np.asarray(pixels, dtype='<f4').tobytes()).hexdigest()
                nodes.append((tuple(node.image.size), digest, node.interpolation, node.extension))
        shader = next(node for node in material.node_tree.nodes if node.type == 'BSDF_PRINCIPLED')
        values = {}
        for key in ['Base Color', 'Metallic', 'Roughness', 'IOR', 'Alpha', 'Emission Color', 'Emission Strength']:
            value = shader.inputs[key].default_value
            values[key] = round(float(value), 6) if isinstance(value, (int,float)) else tuple(round(float(v),6) for v in value)
        rows.append((json.dumps(values, sort_keys=True), sorted(nodes)))
    return sorted(rows)

def lighting():
    scene = bpy.context.scene; scene.render.engine = 'BLENDER_EEVEE'
    scene.render.resolution_x = 768; scene.render.resolution_y = 768; scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = 'PNG'; scene.render.film_transparent = False
    scene.world = bpy.data.worlds.new('QA neutral world'); scene.world.use_nodes = True
    scene.world.node_tree.nodes['Background'].inputs[0].default_value = (.20,.24,.29,1)
    scene.world.node_tree.nodes['Background'].inputs[1].default_value = .42
    for name, pos, energy, size in [('Warm key',(4,-6,11),1650,6),('Cool fill',(-6,-1,6),950,5),('Back rim',(2,6,7),1150,4)]:
        light = bpy.data.lights.new(name,'AREA'); light.energy = energy; light.size = size
        obj = bpy.data.objects.new(name,light); bpy.context.scene.collection.objects.link(obj)
        obj.location = pos; obj.rotation_euler = (-obj.location).to_track_quat('-Z','Y').to_euler()
    bpy.ops.mesh.primitive_plane_add(size=200,location=(0,0,-.015))
    floor = bpy.context.object; floor.name = 'QA floor excluded from candidate'
    mat = bpy.data.materials.new('QA charcoal floor'); mat.use_nodes = True
    mat.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = (.075,.095,.09,1)
    mat.node_tree.nodes['Principled BSDF'].inputs['Roughness'].default_value = .92; floor.data.materials.append(mat)
    scene.view_settings.view_transform = 'AgX'; scene.view_settings.look = 'AgX - Medium High Contrast'
    cam = bpy.data.cameras.new('Fixed RTS evidence camera'); cam.type = 'ORTHO'; cam.ortho_scale = 10
    obj = bpy.data.objects.new('Fixed RTS evidence camera',cam); bpy.context.scene.collection.objects.link(obj)
    obj.location = (8,-11,12); obj.rotation_euler = (Vector((0,0,1.35))-obj.location).to_track_quat('-Z','Y').to_euler(); scene.camera = obj
    return scene

def structural(asset):
    build = read(RUN/'qa'/f'{asset}-build.json')
    candidate = RUN/'candidate'/f'{asset}.glb'
    original = MAIN/'public/assets/games/rts/models'/f'{asset}.glb'
    assert sha(original) == build['origin']['sha256']
    objects = import_model(original); original_rows = triangle_rows(objects, precision=4)
    original_normals = normal_samples(objects)
    original_directed_normals = directed_normal_samples(objects)
    original_normal_rows = triangle_rows(objects, precision=4, include_normals=True)
    original_materials = material_signature(objects); original_bounds = bounds(objects)
    objects = import_model(candidate); candidate_rows = triangle_rows(objects, precision=4)
    candidate_normals = normal_samples(objects)
    candidate_directed_normals = directed_normal_samples(objects)
    directed_normal_difference = compare_directed_normals(original_directed_normals,candidate_directed_normals)
    normal_difference = compare_normals(original_normals,candidate_normals)
    candidate_normal_rows = triangle_rows(objects, precision=4, include_normals=True)
    candidate_materials = material_signature(objects); candidate_bounds = bounds(objects)
    checks = {'full_geometry_positions_uv_materials_winding_vs_published_1e4': original_rows == candidate_rows,
              'directed_corner_normal_difference_within_declared_005_vector_tolerance': directed_normal_difference['passed'],
              'material_shader_factors_and_image_pixels_match_published': original_materials == candidate_materials,
              'bounds_match_published_1e5': all(abs(a-b)<1e-5 for ar,br in zip(original_bounds,candidate_bounds) for a,b in zip(ar,br)),
              'pivot_zero': all(obj.location.length<1e-6 for obj in objects),
              'unit_scale': all(all(abs(v-1)<1e-6 for v in obj.scale) for obj in objects),
              'finite_uv': all(obj.data.uv_layers and all(math.isfinite(v) for uv in obj.data.uv_layers.active.data for v in uv.uv) for obj in objects),
              'all_meshes_stage_tagged': all(isinstance(obj.get('rtsConstructionStage'),int) and 0<=obj['rtsConstructionStage']<=3 for obj in objects),
              'all_meshes_part_tagged': all(obj.get('rtsPartIds') and obj.get('rtsSourcePartIds') and obj.get('rtsSourceObjects') for obj in objects),
              'thresholds_match': list(bpy.context.scene.get('rtsConstruction',{}).get('thresholds',[])) == THRESHOLDS}
    # glTF Scene extras can be imported as properties on a scene-root Empty instead.
    if not checks['thresholds_match']:
        checks['thresholds_match'] = any(list(o.get('rtsConstruction',{}).get('thresholds',[])) == THRESHOLDS for o in bpy.context.scene.objects)
    degenerate = 0; triangles = 0
    for obj in objects:
        obj.data.calc_loop_triangles(); triangles += len(obj.data.loop_triangles)
        degenerate += sum(t.area<1e-10 for t in obj.data.loop_triangles)
    checks['zero_degenerate_triangles'] = degenerate == 0
    missing = list((original_rows-candidate_rows).items())[:5]; extra = list((candidate_rows-original_rows).items())[:5]
    row = {'id': asset, 'blender': bpy.app.version_string, 'candidate_sha256':sha(candidate), 'checks':checks,
           'passed':all(checks.values()), 'triangle_count':triangles, 'degenerate_triangles':degenerate,
           'published_bounds_z_up':original_bounds,'reimport_bounds_z_up':candidate_bounds,
           'published_digest_1e4':digest_rows(original_rows),'candidate_digest_1e4':digest_rows(candidate_rows),
           'published_missing_triangle_count':sum((original_rows-candidate_rows).values()),
           'candidate_extra_triangle_count':sum((candidate_rows-original_rows).values()),
           'mismatch_examples':{'missing':missing,'extra':extra},
           'loop_normal_difference':normal_difference,
           'directed_corner_normal_difference':directed_normal_difference,
           'exact_normal_counter_1e4_match':original_normal_rows==candidate_normal_rows,
           'reimport_mesh_pivots':[{'name':o.name,'location':list(o.location),'scale':list(o.scale)} for o in objects],
           'runtime_publish_allowed':False}
    save(RUN/'qa'/f'{asset}-reimport.json',row)
    print('REIMPORT',asset,json.dumps(checks),flush=True)
    return row

def render(asset):
    objects = import_model(RUN/'candidate'/f'{asset}.glb'); scene = lighting()
    transforms = {obj.name:[float(v) for row in obj.matrix_world for v in row] for obj in objects}
    rows = []
    for progress in [0,.2,.5,.75,1]:
        visible = []
        for obj in objects:
            shown = progress >= THRESHOLDS[obj['rtsConstructionStage']]
            obj.hide_render = not shown; obj.hide_set(not shown)
            if shown: visible.append(obj)
            assert transforms[obj.name] == [float(v) for row in obj.matrix_world for v in row]
        image = RUN/'qa/renders'/f'{asset}-p{round(progress*100):03d}.png'; image.parent.mkdir(parents=True, exist_ok=True)
        scene.render.filepath = str(image); bpy.ops.render.render(write_still=True)
        rows.append({'progress':progress,'stages_visible':sorted({o['rtsConstructionStage'] for o in visible}),
                     'image':image.relative_to(ROOT).as_posix(),'sha256':sha(image),
                     'visible_bounds_z_up':bounds(visible),'all_transforms_unchanged':True})
    save(RUN/'qa'/f'{asset}-previews.json', {'id':asset,'fixed_camera':{'position':[8,-11,12],'target':[0,0,1.35],'ortho_scale':10},'rows':rows,'runtime_publish_allowed':False})

def render_ab(asset):
    for version,path in [('published',MAIN/'public/assets/games/rts/models'/f'{asset}.glb'),('candidate',RUN/'candidate'/f'{asset}.glb')]:
        import_model(path);scene=lighting()
        image=RUN/'qa/renders'/f'{asset}-completed-{version}.png'
        scene.render.filepath=str(image);bpy.ops.render.render(write_still=True)

def source_check(asset):
    build=read(RUN/'qa'/f'{asset}-build.json');source=ROOT/build['source']
    bpy.ops.wm.open_mainfile(filepath=str(source));bpy.context.view_layer.update()
    objects=[o for o in bpy.context.scene.objects if o.type=='MESH']
    materials={m for o in objects for m in o.data.materials};images={n.image for m in materials for n in m.node_tree.nodes if n.type=='TEX_IMAGE' and n.image}
    checks={'mesh_objects_are_local_editable':all(o.library is None and o.data.library is None for o in objects),
            'used_materials_are_local':all(m.library is None for m in materials),'used_images_are_local_packed':all(i.library is None and i.packed_file for i in images),
            'individual_component_count':len(objects)==len(build['part_provenance']),
            'source_geometry_digest_at1e5_matches':digest_rows(triangle_rows(objects))==build['source_geometry_digest_1e5'],
            'all_source_parts_identity_retained':all(o.get('rtsPartIds') and o.get('rtsSourcePartIds') and o.get('rtsSourceObjects') for o in objects)}
    save(RUN/'qa'/f'{asset}-source-editability.json',{'id':asset,'source_sha256':sha(source),'checks':checks,'passed':all(checks.values()),'editable_components':len(objects),'local_used_materials':len(materials),'packed_local_used_images':len(images),'library_records_in_file':[lib.filepath for lib in bpy.data.libraries]})
    if not all(checks.values()): raise RuntimeError('Source editability check failed')

if __name__ == '__main__':
    mode = sys.argv[sys.argv.index('--')+1] if '--' in sys.argv else 'structural'
    if mode == 'render':
        for asset in IDS: render(asset)
    elif mode == 'ab':
        for asset in IDS: render_ab(asset)
    elif mode == 'source':
        for asset in IDS: source_check(asset)
    else:
        rows = [structural(asset) for asset in IDS]; save(RUN/'qa/reimport-summary.json',rows)
        if not all(row['passed'] for row in rows): raise RuntimeError('Construction candidate QA failed; evidence retained')
