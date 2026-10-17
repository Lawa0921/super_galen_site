"""Derive editable courtyard modules from locked original kingdom sources.

Run in Blender. Writes only the assembly-refinement factory run.
"""
import bpy
import hashlib
import json
import math
import shutil
import sys
from pathlib import Path
from mathutils import Matrix, Vector
sys.path.insert(0, str(Path(__file__).resolve().parent))
from courtyard_layout import layout
from roof_winding import oriented_roof_faces
from modular_extract import ROOT, IDENTITY, save, flatten, mesh_signature, bounds
from modular_contract import sha, projected_uv, resolve_recipe, verify_sources
import modular_assemble
from detail_materials import TEXTURES, BASE, read_glb, write_glb, repack_external_images

OLD = ROOT/'art-factory/rts/runs/modular-kingdom/2026-10-08-v1'
RUN = ROOT/'art-factory/rts/runs/assembly-refinement/2026-10-08-v2'
ROAD = ROOT/'public/assets/games/rts/terrain/dirt-road.webp'


def externalize(path):
    doc, binary = read_glb(path)
    sources = {p.read_bytes(): BASE+p.name for p in TEXTURES.iterdir() if p.is_file()}
    sources[(RUN/'raw/dirt-road.png').read_bytes()] = '../terrain/dirt-road.png'
    uris = {}
    for i, img in enumerate(doc.get('images', [])):
        view = doc['bufferViews'][img['bufferView']]
        raw = binary[view.get('byteOffset', 0):view.get('byteOffset', 0)+view['byteLength']]
        if raw not in sources:
            raise ValueError('Unregistered courtyard image: '+img.get('name', ''))
        uris[i] = sources[raw]
    doc, binary = repack_external_images(doc, binary, uris)
    write_glb(path, doc, binary)


def main():
    kit = json.loads((OLD/'kit.json').read_text(encoding='utf-8'))
    verify_sources(OLD, [kit['library']])
    bpy.ops.wm.open_mainfile(filepath=str(OLD/kit['library']['path']))
    library = bpy.data.collections.get('Kingdom modular asset library')
    template = next(o for o in bpy.data.objects if o.type == 'MESH' and o.name.startswith('Entry stair 1'))
    material = template.data.materials[0]
    road_image = bpy.data.images.load(str(RUN/'raw/dirt-road.png'), check_existing=True)
    road_image.pack()
    earth_mat = bpy.data.materials.new('CourtyardCompactedEarth')
    earth_mat.use_nodes = True
    nodes = earth_mat.node_tree.nodes
    bsdf = next(n for n in nodes if n.type == 'BSDF_PRINCIPLED')
    bsdf.inputs['Roughness'].default_value = .97
    tex = nodes.new('ShaderNodeTexImage'); tex.image = road_image
    uv_node=nodes.new('ShaderNodeUVMap');uv_node.uv_map='Architectural UV'
    earth_mat.node_tree.links.new(uv_node.outputs['UV'],tex.inputs['Vector'])
    earth_mat.node_tree.links.new(tex.outputs['Color'], bsdf.inputs['Base Color'])
    earth_mat['kit_material_hash'] = hashlib.sha256(('original-earth:'+sha(ROAD)+':roughness=.97').encode()).hexdigest()
    derived = {}
    refined_roofs = {}

    def refine_shelter(ident):
        original=kit['parts'][ident];old=bpy.data.collections[original['collection']]
        collection=bpy.data.collections.new('KIT_workshop-supported-frame');library.children.link(collection)
        objects=[];supports=0
        for obj in old.objects:
            mesh=obj.data.copy();label=obj.get('source_node',obj.name)
            if label.startswith('Open engineering shelter post'):
                # Cut the top of each original timber to the actual pitch plane.
                # Keep the foot, grain scale and existing horizontal placement.
                for vertex in mesh.vertices:
                    if vertex.co.z>3.09:vertex.co.z=3.17+1.26*(1-abs(vertex.co.x)/3.14)+.008
                mesh.update()
                for poly in mesh.polygons:
                    for li in poly.loop_indices:mesh.uv_layers.active.data[li].uv=projected_uv(mesh.vertices[mesh.loops[li].vertex_index].co,poly.normal)
                supports+=1
            clone=bpy.data.objects.new(label,mesh);clone.matrix_world=obj.matrix_world.copy();clone['source_node']=label
            collection.objects.link(clone);objects.append(clone)
        if supports!=4:raise ValueError('Expected four original shelter posts')
        digest=hashlib.sha256(('structure:'+':'.join(sorted(mesh_signature(o.data) for o in objects))).encode()).hexdigest()
        new_id='structure-supported-'+digest[:16];collection.name='KIT_'+new_id
        collection.asset_mark();collection['part_id']=new_id;collection['part_version']=1
        part=dict(original);part.update(collection=collection.name,geometry_sha256=digest,bounds=bounds(objects),used_by=[],
            sources=[dict(asset='original-shelter-support-repair',nodes=[ident],source_sha256=sha(OLD/kit['library']['path']))],
            refinement=dict(supports=4,roofContactToleranceMeters=.008))
        kit['parts'][new_id]=part;return new_id

    def refine_roof(ident, asset):
        cache_key=(ident, asset=='workshop')
        if cache_key in refined_roofs:return refined_roofs[cache_key]
        original=kit['parts'][ident];old=bpy.data.collections[original['collection']]
        collection=bpy.data.collections.new('KIT_refined-'+ident+('-open' if asset=='workshop' else ''))
        library.children.link(collection);objects=[];panels=[];flipped=0
        for obj in old.objects:
            mesh=obj.data.copy();label=obj.get('source_node',obj.name)
            if label.startswith(('Structural pitched roof plane','Individually coursed overlapping slate shingles')):
                faces,corners=oriented_roof_faces([list(v.co) for v in mesh.vertices],[tuple(p.vertices) for p in mesh.polygons],label.startswith('Individually'))
                replacement=bpy.data.meshes.new(mesh.name+' outward');replacement.from_pydata([list(v.co) for v in mesh.vertices],[],faces)
                for mat in mesh.materials:replacement.materials.append(mat)
                for layer in mesh.uv_layers:
                    uv=replacement.uv_layers.new(name=layer.name)
                    for before,after,order in zip(mesh.polygons,replacement.polygons,corners):
                        for li,corner in zip(after.loop_indices,order):uv.data[li].uv=layer.data[before.loop_indices[corner]].uv
                normals=[]
                for before,after,order in zip(mesh.polygons,replacement.polygons,corners):
                    reverse=order[0]!=0;flipped+=int(reverse)
                    for corner in order:normals.append(mesh.corner_normals[before.loop_indices[corner]].vector*(-1 if reverse else 1))
                replacement.normals_split_custom_set(normals);replacement.update();mesh=replacement
            clone=bpy.data.objects.new(label,mesh);clone.matrix_world=obj.matrix_world.copy();clone['source_node']=label
            collection.objects.link(clone);objects.append(clone)
            if label.startswith('Structural pitched roof plane'):panels.append(clone)
        if panels:
            low,high=bounds(panels);x0,x1=low[0]+.20,high[0]-.20;center=(x0+x1)/2
            z0=low[2]-(.24 if asset=='workshop' else .10);z1=high[2]-.025
            stone=next(m for m in bpy.data.materials if m.name.startswith('IvoryLimestone') and m.get('kit_material_hash') and any(n.type=='TEX_IMAGE' for n in m.node_tree.nodes))
            for side in ([1] if asset=='workshop' else [-1,1]):
                y=(low[1]+.20 if side==-1 else high[1]-.20);depth=.16
                verts=[(x0,y-depth/2,z0),(x1,y-depth/2,z0),(center,y-depth/2,z1),
                       (x0,y+depth/2,z0),(x1,y+depth/2,z0),(center,y+depth/2,z1)]
                mesh=bpy.data.meshes.new('Ashlar gable closure');mesh.from_pydata(verts,[],[(0,1,2),(5,4,3),(0,3,4,1),(1,4,5,2),(2,5,3,0)])
                mesh.materials.append(stone);mesh.update();uv=mesh.uv_layers.new(name='Architectural UV')
                for poly in mesh.polygons:
                    for li in poly.loop_indices:uv.data[li].uv=projected_uv(mesh.vertices[mesh.loops[li].vertex_index].co,poly.normal)
                obj=bpy.data.objects.new('Closed original ashlar gable',mesh);collection.objects.link(obj);objects.append(obj)
        digest=hashlib.sha256(('roof:'+':'.join(sorted(mesh_signature(o.data) for o in objects))).encode()).hexdigest()
        new_id='roof-refined-'+digest[:16];collection.name='KIT_'+new_id
        collection.asset_mark();collection['part_id']=new_id;collection['part_version']=1
        part=dict(original);part.update(collection=collection.name,geometry_sha256=digest,bounds=bounds(objects),mesh_count=len(objects),
            triangles=sum(sum(len(p.vertices)-2 for p in o.data.polygons) for o in objects),used_by=[],
            sources=[dict(asset='original-roof-winding-repair',nodes=[ident],source_sha256=sha(OLD/kit['library']['path']))],
            refinement=dict(reversed_polygons=flipped,uv_corners_preserved=True,closed_gables=1 if asset=='workshop' else 2))
        kit['parts'][new_id]=part;refined_roofs[cache_key]=new_id
        return new_id

    def register(label, mesh, source):
        mesh.update(); mesh.calc_loop_triangles()
        ident = 'courtyard-'+label
        collection = bpy.data.collections.new('KIT_'+ident); library.children.link(collection)
        obj = bpy.data.objects.new(label, mesh); collection.objects.link(obj)
        obj['source_node'] = source
        collection.asset_mark(); collection.asset_data.description = 'Original kingdom courtyard module; dimensions baked, rigid placement only.'
        collection.asset_data.author = 'Original RTS project'
        collection['part_id'] = ident; collection['part_version'] = 1
        digest = hashlib.sha256(('foundation:'+mesh_signature(mesh)).encode()).hexdigest()
        kit['parts'][ident] = dict(version=1, category='foundation', collection=collection.name,
            interface=ident, mount=IDENTITY, bounds=bounds([obj]), geometry_sha256=digest,
            mesh_count=1, triangles=len(mesh.loop_triangles), materials=[m.name for m in mesh.materials],
            sources=[dict(asset='original-courtyard-derivative', nodes=[source],
                          source_sha256=sha(OLD/kit['library']['path']))], used_by=[], uv_exception=None)
        derived[label] = ident
        return ident

    def profiled_stone(label, dimensions):
        # Retain the original tread's bevel topology and edge widths. Resize the
        # broad planar spans, then author UVs at the original physical texel scale.
        mesh = template.data.copy()
        points = [v.co.copy() for v in mesh.vertices]
        low = Vector([min(v[k] for v in points) for k in range(3)])
        high = Vector([max(v[k] for v in points) for k in range(3)])
        center = (low+high)/2; half = (high-low)/2
        for vertex in mesh.vertices:
            for k in range(3):
                v = vertex.co[k]-center[k]
                vertex.co[k] = math.copysign(max(0, dimensions[k]/2-(half[k]-abs(v))), v)
        mesh.update()
        for poly in mesh.polygons:
            for li in poly.loop_indices:
                mesh.uv_layers.active.data[li].uv = projected_uv(mesh.vertices[mesh.loops[li].vertex_index].co, poly.normal)
        return register(label, mesh, template.get('source_node', template.name))

    profiled_stone('dressed-edge-1m', (1, .24, .52))
    profiled_stone('dressed-corner', (.46, .46, .52))
    profiled_stone('entry-shoulder-short', (.3, .24, .52))
    profiled_stone('entry-shoulder-long', (.8, .24, .52))
    for i in range(3): profiled_stone('entry-step-'+str(i), (2.4, .28, .18+i*.16))

    def earth(w, d):
        label = f'earth-{int(w)}x{int(d)}'
        if label in derived: return derived[label]
        # A low berm meets the surrounding ground. The concave notch leaves the
        # three entry treads uncovered; the last tread meets the inner yard.
        top = [(-w/2+.28, -d/2+.28), (-1.2, -d/2+.28), (-1.2, -d/2+.92),
               (1.2, -d/2+.92), (1.2, -d/2+.28), (w/2-.28, -d/2+.28),
               (w/2-.28, d/2-.28), (-w/2+.28, d/2-.28)]
        bottom = [(-w/2+.04, -d/2+.04), (-1.2, -d/2+.04), (-1.2, -d/2+.92),
                  (1.2, -d/2+.92), (1.2, -d/2+.04), (w/2-.04, -d/2+.04),
                  (w/2-.04, d/2-.04), (-w/2+.04, d/2-.04)]
        verts = [(x, y, .50) for x, y in top]+[(x, y, .008) for x, y in bottom]
        faces = [tuple(range(8)), tuple(reversed(range(8, 16)))]
        faces += [(i, (i+1)%8, (i+1)%8+8, i+8) for i in range(8)]
        mesh = bpy.data.meshes.new(label); mesh.from_pydata(verts, [], faces)
        mesh.materials.append(earth_mat); mesh.update()
        uv = mesh.uv_layers.new(name='Architectural UV')
        for poly in mesh.polygons:
            for li in poly.loop_indices:
                p = mesh.vertices[mesh.loops[li].vertex_index].co
                axes=(0,1) if abs(poly.normal.z)>.9 else ((1,2) if abs(poly.normal.x)>abs(poly.normal.y) else (0,2))
                uv.data[li].uv = (p[axes[0]]*.45, p[axes[1]]*.45)
        return register(label, mesh, str(ROAD.relative_to(ROOT)))

    recipes = []
    for entry in kit['recipes']:
        recipe = json.loads((OLD/entry['path']).read_text(encoding='utf-8'))
        asset = recipe['id']
        if asset in ('barracks', 'stable', 'workshop'):
            snapshot=RUN/f'raw/before/{asset}.glb';snapshot.parent.mkdir(parents=True,exist_ok=True)
            if not snapshot.exists():shutil.copy2(ROOT/recipe['source']['previous_candidate'],snapshot)
            data = layout(asset); w, d = data['footprint']
            recipe['instances'] = [p for p in recipe['instances'] if p['id'] != 'foundation']
            for p in recipe['instances']:
                if kit['parts'][p['part']]['category']=='roof':p['part']=refine_roof(p['part'],asset)
                elif asset=='workshop' and p['id']=='structure':p['part']=refine_shelter(p['part'])
            recipe['instances'].append(dict(id='courtyard-earth', part=earth(w, d), matrix=IDENTITY))
            for i, p in enumerate(data['pieces']):
                label = p['part']+('-'+str(p['level']) if p['part']=='entry-step' else '')
                transform = Matrix.Rotation(math.radians(p['angle']), 4, 'Z')
                transform.translation = (p['x'], p['y'], p['z_top']/2 if p['part']=='entry-step' else .28)
                recipe['instances'].append(dict(id=f'courtyard-{i:02}', part=derived[label], matrix=flatten(transform)))
            recipe['courtyard'] = dict(layout=data, source='Original profiled entry stone and original dirt-road surface',
                                      wallFootHeight=.54, yardHeight=.50, sharedScalePolicy='rigid placements only')
        resolve_recipe(recipe, kit['parts'])
        save(RUN/entry['path'], recipe)
        recipes.append(dict(id=asset, path=entry['path'], sha256=sha(RUN/entry['path'])))
    for part in kit['parts'].values(): part['used_by'] = []
    for entry in recipes:
        recipe = json.loads((RUN/entry['path']).read_text(encoding='utf-8'))
        for ident in {p['part'] for p in recipe['instances']}: kit['parts'][ident]['used_by'].append(recipe['id'])
    # Source locks include the actual authoring library and original texture.
    locked = json.loads((OLD/kit['source_lock']).read_text(encoding='utf-8'))
    locked += [dict(path=str((OLD/kit['library']['path']).relative_to(ROOT)), sha256=kit['library']['sha256']),
               dict(path=str(ROAD.relative_to(ROOT)), sha256=sha(ROAD))]
    save(RUN/'raw/source-lock.json', locked)
    bpy.context.scene['refinement_source'] = kit['library']['sha256']
    library_path = RUN/'raw/kingdom-kit.blend'
    bpy.ops.wm.save_as_mainfile(filepath=str(library_path))
    shutil.copy2(OLD/'raw/blender_assets.cats.txt', RUN/'raw/blender_assets.cats.txt')
    kit.update(library=dict(path='raw/kingdom-kit.blend', sha256=sha(library_path)), recipes=recipes,
               source_lock='raw/source-lock.json', source_lock_sha256=sha(RUN/'raw/source-lock.json'),
               runtime_publish_allowed=False, status='candidate', refinement='Functional courtyard assembly v2')
    save(RUN/'kit.json', kit)
    modular_assemble.externalize_building = externalize
    for asset in ('barracks', 'stable', 'workshop'): modular_assemble.assemble(asset, run=RUN)


if __name__ == '__main__': main()
