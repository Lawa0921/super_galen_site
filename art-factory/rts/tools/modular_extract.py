"""Ingest locked original editable models into a reusable Collection asset kit.

Blender --background --python modular_extract.py. Does not write runtime files.
"""
import bpy
import hashlib
import json
import re
import sys
import uuid
from pathlib import Path
from mathutils import Matrix,Vector
sys.path.insert(0,str(Path(__file__).resolve().parent))
from modular_contract import sha,verify_sources,resolve_recipe,projected_uv

ROOT=Path(__file__).resolve().parents[3]
RUN=ROOT/'art-factory/rts/runs/modular-kingdom/2026-10-08-v1'
IDENTITY=[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1]
CATEGORIES=['window','door','roof','foundation','structure','ornament','bridge-deck','bridge-parapet','bridge-arch','bridge-pier']

def save(path,data):
    path.parent.mkdir(parents=True,exist_ok=True)
    path.write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n',encoding='utf-8',newline='\n')
def flatten(m):return [round(float(v),9) for row in m for v in row]
def name(o):return o.get('ingest_name',o.name)
def starts(o,terms):return name(o).startswith(tuple(terms))
def center(o):return sum((o.matrix_world@Vector(v) for v in o.bound_box),Vector())/8
def bounds(objects):
    points=[o.matrix_world@v.co for o in objects for v in o.data.vertices]
    return [[min(p[k] for p in points) for k in range(3)],[max(p[k] for p in points) for k in range(3)]]
def frame(anchor):
    if anchor is None:return Matrix.Identity(4)
    m=anchor.matrix_world.to_quaternion().to_matrix().to_4x4()
    # Mount at the bottom center of the semantic anchor, with no scale.
    local=Vector((0,0,min(v[2] for v in anchor.bound_box)))
    p=anchor.matrix_world@local
    m.translation=Vector(tuple(round(v,2) for v in p));return m

def groups(objects,asset):
    result=[];remaining=set(objects)
    def add(category,label,items,anchor=None):
        items=[o for o in items if o in remaining]
        if items:result.append((category,label,items,frame(anchor)));remaining.difference_update(items)
    for category,anchor_name,prefixes in [
        ('window','Recessed amber window',['Recessed amber window','Lancet window','Stone sill','Lead vertical mullion','Lead horizontal cames','Framed oak window shutter','Shutter iron strap']),
        ('door','Deep shadow of open entrance',['Deep shadow of open entrance','Vertical oak door plank','Main portal','Brass door pull','Wrought oak door hinge']),
        ('roof','Individually coursed overlapping slate shingles',['Individually coursed overlapping slate shingles','Structural pitched roof plane','Carved front rake board','Carved rear rake board','Timber eaves fascia','Brass capped ridge'])]:
        anchors=sorted([o for o in remaining if name(o).startswith(anchor_name)],key=name)
        selected=[o for o in remaining if starts(o,prefixes)]
        buckets={a:[] for a in anchors}
        for o in selected:
            if anchors:buckets[min(anchors,key=lambda a:(center(a)-center(o)).length_squared)].append(o)
        for i,a in enumerate(anchors):add(category,f'{category}-{i:02}',buckets[a],a)
    if asset=='stone-bridge':
        for category,prefix in [('bridge-deck','Cambered dressed road paving'),('bridge-parapet','Individual parapet limestone block')]:
            for i,o in enumerate(sorted(remaining,key=name)):
                if name(o).startswith(prefix):add(category,f'{category}-{i:02}',[o],o)
        add('bridge-arch','bridge-arches',[o for o in remaining if name(o).startswith('Bridge true masonry arch')])
        add('bridge-pier','bridge-piers',[o for o in remaining if 'pier' in name(o) or 'spandrel' in name(o)])
    add('foundation','foundation',[o for o in remaining if any(s in name(o).lower() for s in ['foundation','plinth','entry stair'])])
    # Match authored component words: "bridge" contains "ridge" but is not a roof.
    add('roof','roof-special',[o for o in remaining if re.search(r'\b(?:roof|slate|eaves|ridge|rake board)\b',name(o),re.IGNORECASE)])
    add('ornament','ornament',[o for o in remaining if any(s in name(o).lower() for s in ['banner','sun ','solar','ray ','crest','flag'])])
    add('structure','structure',list(remaining))
    assert len([o for _,_,items,_ in result for o in items])==len(objects)
    assert len(set(o for _,_,items,_ in result for o in items))==len(objects)
    return result

def mesh_signature(mesh):
    def numbers(values):return [round(float(x),5) for x in values]
    data={'v':[numbers(v.co) for v in mesh.vertices],'f':[list(p.vertices) for p in mesh.polygons],
          'uv':[[numbers(l.uv) for l in uv.data] for uv in mesh.uv_layers],
          'normals':[numbers(n.vector) for n in mesh.corner_normals],
          'materials':[m['kit_material_hash'] for m in mesh.materials],
          'slots':[p.material_index for p in mesh.polygons]}
    return hashlib.sha256(json.dumps(data,sort_keys=True,separators=(',',':')).encode()).hexdigest()

def main():
    RUN.mkdir(parents=True,exist_ok=True)
    lock_path=RUN/'raw/source-lock.json'
    if lock_path.exists():locked=json.loads(lock_path.read_text(encoding='utf-8'))
    else:
        if '--init' not in sys.argv or any((RUN/p).exists() for p in ('kit.json','raw/kingdom-kit.blend','recipes')):raise ValueError('Missing source lock: initialize an explicitly new run with --init; an existing run cannot be reinitialized')
        entries=json.loads((ROOT/'art-factory/rts/manifests/building-registry.json').read_text(encoding='utf-8'))['assets']
        locked=[]
        for entry in entries:
            assert entry.get('source_sha256'),entry['id']
            locked.append({'id':entry['id'],'path':entry['source'],'sha256':entry['source_sha256'],'previous_candidate':entry['candidate'],'previous_sha256':entry['sha256']})
        save(lock_path,locked)
    assert len(locked)==13
    verify_sources(ROOT,locked)
    verify_sources(ROOT,[{'path':e['previous_candidate'],'sha256':e['previous_sha256']} for e in locked])
    catalog_text=(ROOT/'src/scripts/games/rts/catalog.ts').read_text(encoding='utf-8')
    footprints={m[1]:[float(m[2]),float(m[3])] for m in re.finditer(r'^  ([a-z]+): \{[^\n]*?width:([\d.]+),depth:([\d.]+)',catalog_text,re.M)}
    footprints.update({'townhall-tier2':footprints['townhall'],'townhall-tier3':footprints['townhall'],'stone-bridge':[8,6]})
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene=bpy.context.scene;scene.unit_settings.system='METRIC';scene.unit_settings.scale_length=1
    library=bpy.data.collections.new('Kingdom modular asset library');library.use_fake_user=True
    material_pool={};material_cache={};parts={};recipes=[];audit=[]
    def material(original):
        pointer=original.as_pointer()
        if pointer in material_cache:return material_cache[pointer]
        base=re.sub(r'\.\d{3}$','',original.name)
        info={'name':base,'diffuse':list(original.diffuse_color),'nodes':[]}
        if original.use_nodes:
            for node in original.node_tree.nodes:
                item={'type':node.bl_idname}
                if node.type=='TEX_IMAGE' and node.image:
                    packed=node.image.packed_file
                    item['image']=hashlib.sha256(bytes(packed.data)).hexdigest() if packed else sha(bpy.path.abspath(node.image.filepath))
                    item['space']=node.image.colorspace_settings.name
                else:
                    item['inputs']={s.name:([round(float(v),6) for v in s.default_value] if hasattr(s.default_value,'__len__') and not isinstance(s.default_value,str) else s.default_value) for s in node.inputs if hasattr(s,'default_value') and not s.is_linked}
                info['nodes'].append(item)
        key=hashlib.sha256(json.dumps(info,sort_keys=True,default=str).encode()).hexdigest()
        if key not in material_pool:
            original.name=base if not any(m.name==base for m in material_pool.values()) else base+'__'+key[:8]
            original['kit_material_hash']=key;material_pool[key]=original
        material_cache[pointer]=material_pool[key]
        return material_pool[key]
    for entry in locked:
        asset=entry['id'];temporary=bpy.data.collections.new('Ingest '+asset);scene.collection.children.link(temporary)
        with bpy.data.libraries.load(str(ROOT/entry['path']),link=False) as (source,dest):
            original_names=list(source.objects);dest.objects=list(original_names)
        objects=[]
        for original_name,obj in zip(original_names,dest.objects):
            if obj is None:continue
            if obj.type!='MESH':bpy.data.objects.remove(obj);continue
            obj['ingest_name']=original_name;temporary.objects.link(obj);objects.append(obj)
        bpy.context.view_layer.update()
        original_bounds=bounds(objects);recipe={'version':1,'id':asset,'units':'meters','coordinate':'Blender Z-up, front -Y','footprint':footprints[asset],
            'source':entry,'sockets':[],'instances':[],'grid':{'structuralMeters':1,'legacyAnchorMeters':.01,'mode':'dimensioned-existing-variants'}}
        item_frames={};object_total=0
        for category,label,items,transform in groups(objects,asset):
            meshes=[];digests=[];local=transform.inverted();original_labels=[]
            for obj in sorted(items,key=name):
                evaluated=obj.evaluated_get(bpy.context.evaluated_depsgraph_get())
                mesh=bpy.data.meshes.new_from_object(evaluated,preserve_all_data_layers=True,depsgraph=bpy.context.evaluated_depsgraph_get())
                matrix=local@obj.matrix_world;normal_matrix=matrix.to_3x3().inverted().transposed()
                normals=[(normal_matrix@n.vector).normalized() for n in mesh.corner_normals]
                mesh.transform(matrix);mesh.normals_split_custom_set(normals);mesh.update()
                # Old arch moulding vertices/UVs were authored in whole-building
                # coordinates. Rebase these UVs at the original 0.5 repeat/m so
                # moving a complete window does not bake a new texture offset.
                if category=='window' and name(obj).startswith('Lancet window moulding'):
                    for poly in mesh.polygons:
                        for li in poly.loop_indices:
                            mesh.uv_layers.active.data[li].uv=projected_uv(mesh.vertices[mesh.loops[li].vertex_index].co,poly.normal)
                for i,mat in enumerate(list(mesh.materials)):mesh.materials[i]=material(mat)
                digests.append(mesh_signature(mesh));meshes.append((obj,mesh));original_labels.append(name(obj))
            digest=hashlib.sha256((category+':'+':'.join(sorted(digests))).encode()).hexdigest()
            ident=category+'-'+digest[:16]
            if ident not in parts:
                collection=bpy.data.collections.new('KIT_'+ident);library.children.link(collection)
                for obj,mesh in meshes:
                    part_object=bpy.data.objects.new(name(obj),mesh);collection.objects.link(part_object)
                    part_object['source_node']=name(obj)
                collection.asset_mark();collection.asset_data.description=f'Original kingdom {category}; metric, fixed dimensions; source-locked.'
                collection.asset_data.author='Original RTS project';collection.asset_data.catalog_id=str(uuid.uuid5(uuid.NAMESPACE_URL,'rts/kit/'+category))
                collection['part_id']=ident;collection['part_version']=1
                bb=bounds(list(collection.objects))
                parts[ident]={'version':1,'category':category,'collection':collection.name,'interface':category+':'+digest[:16],
                    'mount':IDENTITY,'bounds':bb,'geometry_sha256':digest,'mesh_count':len(meshes),
                    'triangles':sum(sum(len(p.vertices)-2 for p in mesh.polygons) for _,mesh in meshes),
                    'materials':sorted(set(m.name for _,mesh in meshes for m in mesh.materials)),'sources':[],'used_by':[],
                    'uv_exception':'Lancet window moulding rebased to part-local projection at original 0.5 repeat/m' if category=='window' else None}
            else:
                for _,mesh in meshes:bpy.data.meshes.remove(mesh)
            parts[ident]['sources'].append({'asset':asset,'nodes':original_labels,'source_sha256':entry['sha256']})
            if asset not in parts[ident]['used_by']:parts[ident]['used_by'].append(asset)
            recipe['instances'].append({'id':label,'part':ident,'matrix':flatten(transform)})
            item_frames[label]=transform;object_total+=len(items)
        # Facade parts attach through named host sockets. The locked host retains
        # the actual pre-existing cut-out geometry; socket motion follows host.
        for item in recipe['instances']:
            part=parts[item['part']]
            if part['category'] not in ('window','door') or 'structure' not in item_frames:continue
            socket_id=item['id']+'-mount';relative=item_frames['structure'].inverted()@item_frames[item['id']]
            recipe['sockets'].append({'id':socket_id,'host':'structure','interface':part['interface'],'matrix':flatten(relative),
                'opening':'preserved in source-locked host mesh','toleranceMeters':.00002})
            host_part=next(i['part'] for i in recipe['instances'] if i['id']=='structure')
            parts[host_part].setdefault('sockets',{})[socket_id]={'interface':part['interface'],'matrix':flatten(relative),'toleranceMeters':.00002}
            del item['matrix'];item['socket']=socket_id
        resolve_recipe(recipe,parts)
        recipe_file=RUN/'recipes'/f'{asset}.json';save(recipe_file,recipe);recipes.append({'id':asset,'path':f'recipes/{asset}.json','sha256':sha(recipe_file)})
        audit.append({'id':asset,'source_meshes':len(objects),'assigned_meshes':object_total,'parts':len(recipe['instances']),'source_bounds':original_bounds})
        for obj in objects:bpy.data.objects.remove(obj,do_unlink=True)
        bpy.data.collections.remove(temporary)
        print('KIT_EXTRACT',asset,len(recipe['instances']),len(parts),flush=True)
    # Keep definitions available in Asset Browser without overlapping meshes in
    # the library's opening scene. Assembly files instantiate linked collections.
    library.use_fake_user=True
    raw=RUN/'raw';raw.mkdir(exist_ok=True)
    bpy.ops.file.pack_all();bpy.ops.wm.save_as_mainfile(filepath=str(raw/'kingdom-kit.blend'))
    cats='VERSION 1\n'+'\n'.join(f'{uuid.uuid5(uuid.NAMESPACE_URL,"rts/kit/"+c)}:Kingdom/{c}:{c}' for c in CATEGORIES)+'\n'
    (raw/'blender_assets.cats.txt').write_text(cats,encoding='utf-8',newline='\n')
    manifest={'version':1,'kit':'original-kingdom-v1','library':{'path':'raw/kingdom-kit.blend','sha256':sha(raw/'kingdom-kit.blend')},'parts':parts,'recipes':recipes,
        'source_lock':'raw/source-lock.json','source_lock_sha256':sha(lock_path),'asset_generation_manual_review':False,'runtime_publish_allowed':False}
    save(RUN/'kit.json',manifest);save(RUN/'qa/extraction.json',{'assets':audit,'parts':len(parts),'sharedAcrossPrefabs':[ident for ident,p in parts.items() if len(p['used_by'])>1]})
    print('KIT_DONE',len(parts),len(recipes),flush=True)

if __name__=='__main__':main()
