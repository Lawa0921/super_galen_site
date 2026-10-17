"""Build linked editable prefabs and batched runtime candidates from kit recipes."""
import bpy
import hashlib
import json
import sys
from pathlib import Path
from mathutils import Matrix
sys.path.insert(0,str(Path(__file__).resolve().parent))
from modular_contract import sha,safe_path,verify_sources,resolve_recipe
from modular_extract import ROOT,RUN,save,bounds,mesh_signature
from detail_materials import externalize_building

def assemble(asset,run=RUN,output=None):
    manifest=json.loads((run/'kit.json').read_text(encoding='utf-8'))
    if manifest['version']!=1:raise ValueError('Unsupported kit version')
    recipe_entry=next((r for r in manifest['recipes'] if r['id']==asset),None)
    if not recipe_entry:raise ValueError('Unknown prefab')
    verify_sources(run,[manifest['library'],{'path':manifest['source_lock'],'sha256':manifest['source_lock_sha256']},recipe_entry])
    verify_sources(ROOT,json.loads(safe_path(run,manifest['source_lock']).read_text(encoding='utf-8')))
    recipe=json.loads(safe_path(run,recipe_entry['path']).read_text(encoding='utf-8'))
    if recipe['id']!=asset:raise ValueError('Prefab identity mismatch')
    resolved=resolve_recipe(recipe,manifest['parts']);library=safe_path(run,manifest['library']['path'])
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.context.scene.unit_settings.system='METRIC';bpy.context.scene.unit_settings.scale_length=1
    names=sorted(set(row['collection'] for row in resolved))
    with bpy.data.libraries.load(str(library),link=True) as (source,dest):
        if any(n not in source.collections for n in names):raise ValueError('Missing library collection')
        dest.collections=names
    collections={c.name:c for c in dest.collections}
    source_objects=[]
    for row in resolved:
        obj=bpy.data.objects.new(row['id'],None);bpy.context.scene.collection.objects.link(obj)
        obj.instance_type='COLLECTION';obj.instance_collection=collections[row['collection']]
        obj.matrix_world=Matrix([row['matrix'][i:i+4] for i in range(0,16,4)])
        obj['part_id']=row['part'];obj['kit_version']=manifest['parts'][row['part']]['version']
        source_objects.append(obj)
    bpy.context.view_layer.update()
    output=output or run
    source=output/'raw/assemblies'/f'{asset}.blend';source.parent.mkdir(parents=True,exist_ok=True)
    for lib in bpy.data.libraries:lib.filepath=bpy.path.relpath(lib.filepath,start=str(source.parent))
    bpy.context.scene['recipe']=str((run/'recipes'/f'{asset}.json').relative_to(ROOT))
    bpy.context.scene['kit_sha256']=manifest['library']['sha256']
    bpy.ops.wm.save_as_mainfile(filepath=str(source))
    # A collection instance is not a scene Mesh. Evaluate its object instances
    # explicitly so export never silently omits the complete modular assembly.
    depsgraph=bpy.context.evaluated_depsgraph_get();objects=[];part_digests={};part_vertices={}
    for instance in depsgraph.object_instances:
        if not instance.is_instance or instance.object.type!='MESH':continue
        evaluated=instance.object;mesh=bpy.data.meshes.new_from_object(evaluated,preserve_all_data_layers=True,depsgraph=depsgraph)
        root=instance.parent.original
        ident=root.get('part_id');placement=root.name
        if not ident:raise ValueError('Untracked collection instance')
        mesh.calc_loop_triangles()
        part_digests.setdefault(placement,[]).append(mesh_signature(mesh))
        part_vertices[placement]=part_vertices.get(placement,0)+len(mesh.vertices)
        obj=bpy.data.objects.new('Export '+placement+' '+evaluated.name,mesh)
        obj.matrix_world=instance.matrix_world.copy();objects.append(obj)
    if not objects:raise ValueError('No evaluated instance geometry')
    for row in resolved:
        part=manifest['parts'][row['part']]
        signature=hashlib.sha256((part['category']+':'+':'.join(sorted(part_digests[row['id']]))).encode()).hexdigest()
        if signature!=part['geometry_sha256']:raise ValueError('Part content mismatch: '+row['part'])
    review_groups={}
    for obj in objects:
        bpy.context.scene.collection.objects.link(obj)
        placement=obj.name.removeprefix('Export ').split(' ',1)[0]
        if placement not in review_groups:
            group=bpy.data.objects.new(placement,None);bpy.context.scene.collection.objects.link(group)
            row=next(r for r in resolved if r['id']==placement)
            group['part_id']=row['part'];group['category']=manifest['parts'][row['part']]['category']
            review_groups[placement]=group
        obj.parent=review_groups[placement]
    for obj in source_objects:bpy.data.objects.remove(obj,do_unlink=True)
    bpy.context.view_layer.update()
    bb=bounds(objects);triangles=sum(len(o.data.loop_triangles) for o in objects)
    expected=sum(manifest['parts'][r['part']]['mesh_count'] for r in resolved)
    if len(objects)!=expected:raise ValueError(f'Lost assembly pieces: {len(objects)} != {expected}')
    review=output/'review'/f'{asset}.glb';review.parent.mkdir(parents=True,exist_ok=True)
    bpy.ops.object.select_all(action='DESELECT')
    for obj in [*objects,*review_groups.values()]:obj.select_set(True)
    bpy.context.view_layer.objects.active=objects[0]
    bpy.ops.export_scene.gltf(filepath=str(review),export_format='GLB',use_selection=True,export_yup=True,export_apply=True,export_normals=True,export_texcoords=True,export_materials='EXPORT',export_extras=True)
    externalize_building(review)
    for obj in objects:obj.parent=None
    for group in review_groups.values():bpy.data.objects.remove(group,do_unlink=True)
    # Export copy only: join by canonical material to retain the existing small
    # runtime draw count. The linked source saved above remains fully editable.
    batches={}
    for obj in objects:
        if len(obj.data.materials)!=1:raise ValueError('Expected one source material per original mesh')
        batches.setdefault(obj.active_material.name,[]).append(obj)
    joined=[]
    for material,items in batches.items():
        data=bpy.data.meshes.new(material+' export');target=bpy.data.objects.new(material+' merged',data)
        bpy.context.scene.collection.objects.link(target);data.materials.append(items[0].active_material)
        bpy.ops.object.select_all(action='DESELECT')
        for obj in items:obj.select_set(True)
        target.select_set(True);bpy.context.view_layer.objects.active=target;bpy.ops.object.join();joined.append(target)
    bpy.ops.object.select_all(action='DESELECT')
    for obj in joined:obj.select_set(True)
    bpy.context.view_layer.objects.active=joined[0]
    candidate=output/'candidate'/f'{asset}.glb';candidate.parent.mkdir(parents=True,exist_ok=True)
    bpy.ops.export_scene.gltf(filepath=str(candidate),export_format='GLB',use_selection=True,export_yup=True,export_apply=True,export_normals=True,export_texcoords=True,export_materials='EXPORT')
    externalize_building(candidate)
    report={'id':asset,'recipe':str((run/'recipes'/f'{asset}.json').relative_to(ROOT)),'recipe_sha256':sha(run/'recipes'/f'{asset}.json'),
        'source':str(source.relative_to(ROOT)),'source_sha256':sha(source),'candidate':str(candidate.relative_to(ROOT)),'sha256':sha(candidate),
        'kit_sha256':manifest['library']['sha256'],'linked_collections':len(names),'instances':len(resolved),'meshes':len(objects),
        'runtime_meshes':len(joined),'triangles':triangles,'bounds':bb,'part_mesh_signatures':{k:sorted(v) for k,v in part_digests.items()},
        'part_vertices':part_vertices,'runtime_publish_allowed':False}
    save(output/'qa/assemblies'/f'{asset}.json',report)
    print('ASSEMBLED',asset,len(resolved),len(objects),len(joined),triangles,flush=True)
    return report

if __name__=='__main__':
    args=sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else ['all']
    ids=[r['id'] for r in json.loads((RUN/'kit.json').read_text(encoding='utf-8'))['recipes']] if args==['all'] else args
    for asset in ids:assemble(asset)
