"""Refine registered original Blender sources; emit factory candidates only."""
import bpy
import json
import math
import sys
from pathlib import Path
from mathutils import Vector
sys.path.insert(0,str(Path(__file__).resolve().parent))
import buildings_generate as g
import buildings_v2_generate as v2
from detail_materials import ROOT,RUN,TEXTURES,MATERIALS,SOURCES,sha,externalize_building,patch_equipment,original_registry


def material_maps(mat,surface,architectural=True):
    mat.use_nodes=True;nt=mat.node_tree;bsdf=nt.nodes.get('Principled BSDF')
    for socket in ('Base Color','Normal','Roughness','Metallic'):
        for link in list(bsdf.inputs[socket].links):nt.links.remove(link)
    def image(kind):
        suffix='jpg' if kind=='color' else 'png';path=TEXTURES/f'{surface}-{kind}.{suffix}'
        im=bpy.data.images.load(str(path),check_existing=True)
        if kind!='color':im.colorspace_settings.name='Non-Color'
        im.pack();tex=nt.nodes.new('ShaderNodeTexImage');tex.image=im
        if architectural:
            uv=nt.nodes.new('ShaderNodeUVMap');uv.uv_map='Architectural UV';nt.links.new(uv.outputs['UV'],tex.inputs['Vector'])
        return tex
    if 'TeamCloth' not in mat.name:
        nt.links.new(image('color').outputs['Color'],bsdf.inputs['Base Color'])
    normal=nt.nodes.new('ShaderNodeNormalMap');normal.inputs['Strength'].default_value=.45 if surface!='cloth' else .65
    nt.links.new(image('normal').outputs['Color'],normal.inputs['Color']);nt.links.new(normal.outputs['Normal'],bsdf.inputs['Normal'])
    sep=nt.nodes.new('ShaderNodeSeparateColor');nt.links.new(image('mr').outputs['Color'],sep.inputs['Color'])
    nt.links.new(sep.outputs['Green'],bsdf.inputs['Roughness']);nt.links.new(sep.outputs['Blue'],bsdf.inputs['Metallic'])


def box_from(source,name,offset,size,mat,bevel=0):
    obj=g.box(name,(0,0,0),size,mat,bevel)
    obj.matrix_world=source.matrix_world.copy();obj.location=source.matrix_world@Vector(offset)
    return obj


def architectural_detail(objects):
    walls=[o for o in objects if o.active_material and o.active_material.name=='IvoryLimestone' and max(o.dimensions)>.8 and o.location.z>.8]
    windows=[o for o in objects if o.name.startswith('Recessed amber window')]
    recesses=0
    for glass in windows:
        bounds=[Vector(c) for c in glass.bound_box];w=max(v.x for v in bounds)-min(v.x for v in bounds);h=max(v.z for v in bounds)-min(v.z for v in bounds)
        center=glass.matrix_world@Vector((0,.15,0))
        wall=next((o for o in walls if all(min(c[k] for c in o.bound_box)-.025 <= (o.matrix_world.inverted()@center)[k] <= max(c[k] for c in o.bound_box)+.025 for k in range(3))),None)
        if wall:
            cutter=box_from(glass,'Window recess cutter',(0,.10,0),(w*.94,.48,h*.95),'IvoryLimestone')
            mod=wall.modifiers.new('Masonry recessed opening','BOOLEAN');mod.operation='DIFFERENCE';mod.solver='EXACT';mod.object=cutter
            bpy.context.view_layer.objects.active=wall;bpy.ops.object.modifier_apply(modifier=mod.name)
            bpy.data.objects.remove(cutter,do_unlink=True)
            # Keep the surrounding arch at its original location. The glazing is set back.
            glass.location += glass.matrix_world.to_quaternion()@Vector((0,.13,0));recesses+=1
        # Small timber shutter leaves and iron pins, a readable depth cue at the sill.
        for sign in (-1,1):
            shutter=box_from(glass,'Framed oak window shutter',(sign*(w*.5+.11),-.005,0),(.15,.055,h*.79),'DarkTimber',.008)
            for z in (-h*.23,h*.23):
                box_from(shutter,'Shutter iron strap',(0,-.034,z),(.17,.024,.038),'Ironwork',.004)
    doors=[o for o in objects if o.name.startswith('Vertical oak door plank')]
    for plank in doors:
        w=plank.dimensions.x;h=plank.dimensions.z
        for sign in (-1,1):
            box_from(plank,'Wrought oak door hinge',(0,-.04,sign*h*.29),(w*.92,.035,.065),'Ironwork',.006)
    # Forged gussets visibly join existing structural timbers; no arbitrary prop scatter.
    for timber in [o for o in objects if 'timber stud' in o.name]:
        h=timber.dimensions.z
        for sign in (-1,1):box_from(timber,'Timber mortise iron plate',(0,-.09,sign*(h*.5-.14)),(.185,.025,.13),'Ironwork',.008)
    return {'recessed_windows':recesses,'shutter_pairs':len(windows),'door_planks_detailed':len(doors)}


def refine_rock(objects):
    for obj in objects:
        if obj.type!='MESH':continue
        oldmin=Vector(tuple(min(v.co[k] for v in obj.data.vertices) for k in range(3)))
        oldmax=Vector(tuple(max(v.co[k] for v in obj.data.vertices) for k in range(3)))
        bpy.context.view_layer.objects.active=obj
        sub=obj.modifiers.new('Original strata surface tessellation','SUBSURF');sub.subdivision_type='SIMPLE';sub.levels=1
        bpy.ops.object.modifier_apply(modifier=sub.name)
        tex=bpy.data.textures.new('Generated granite relief',type='IMAGE');tex.image=bpy.data.images.load(str(TEXTURES/'granite-color.jpg'),check_existing=True)
        dis=obj.modifiers.new('Shallow generated mineral relief','DISPLACE');dis.texture=tex;dis.texture_coords='UV';dis.strength=.14;dis.mid_level=.55
        bpy.ops.object.modifier_apply(modifier=dis.name)
        for vertex in obj.data.vertices:
            for k in range(3):vertex.co[k]=max(oldmin[k],min(oldmax[k],vertex.co[k]))
        normal=obj.modifiers.new('Strata weighted normals','WEIGHTED_NORMAL');normal.keep_sharp=True
    return {'relief':'generated granite image displacement, clamped inside previous per-part bounds'}


def build(asset,registry):
    entry=next(a for a in registry['assets'] if a['id']==asset);src=ROOT/entry['source']
    bpy.ops.wm.open_mainfile(filepath=str(src));bpy.context.scene.render.engine='BLENDER_EEVEE'
    for o in list(bpy.context.scene.objects):
        if o.type in ('CAMERA','LIGHT'):bpy.data.objects.remove(o,do_unlink=True)
    g.M={m.name:m for m in bpy.data.materials};g.RUN=RUN
    if asset!='rock':
        for name in ('DarkTimber','Ironwork'):
            if name not in g.M:
                mat=bpy.data.materials.new(name);mat.use_nodes=True;g.M[name]=mat
    objects=[o for o in bpy.context.scene.objects if o.type=='MESH']
    for mat in list(bpy.data.materials):
        if mat.name in MATERIALS:material_maps(mat,MATERIALS[mat.name])
    detail=refine_rock(objects) if asset=='rock' else architectural_detail(objects)
    objects=[o for o in bpy.context.scene.objects if o.type=='MESH']
    for obj in objects:
        if obj.data.uv_layers.active:obj.data.uv_layers.active.name='Architectural UV'
    g.uv_all(objects)
    # Wood grain follows the longest local timber axis rather than projected world orientation.
    for o in objects:
        if not o.active_material or MATERIALS.get(o.active_material.name)!='oak':continue
        axis=max(range(3),key=lambda k:max(c[k] for c in o.bound_box)-min(c[k] for c in o.bound_box))
        uv=o.data.uv_layers.active
        for poly in o.data.polygons:
            other=max((k for k in range(3) if k!=axis),key=lambda k:1-abs(poly.normal[k]))
            end_axes=[k for k in range(3) if k!=axis]
            for li in poly.loop_indices:
                co=o.data.vertices[o.data.loops[li].vertex_index].co
                uv.data[li].uv=(co[end_axes[0]]*1.8,co[end_axes[1]]*1.8) if abs(poly.normal[axis])>.9 else (co[axis]*.6,co[other]*1.8)
    g.ASSETS.setdefault(asset,(3,3))
    g.render_preview(asset,objects)
    source=RUN/'raw'/f'{asset}.blend';source.parent.mkdir(parents=True,exist_ok=True)
    bpy.ops.file.pack_all();bpy.ops.wm.save_as_mainfile(filepath=str(source))
    joined=v2.join_by_material(objects)
    bpy.ops.object.select_all(action='DESELECT')
    for o in joined:o.select_set(True)
    bpy.context.view_layer.objects.active=joined[0]
    out=RUN/'candidate'/f'{asset}.glb'
    bpy.ops.export_scene.gltf(filepath=str(out),export_format='GLB',use_selection=True,export_yup=True,export_apply=True,export_normals=True,export_texcoords=True,export_materials='EXPORT')
    externalize_building(out)
    triangles=sum(sum(len(p.vertices)-2 for p in o.data.polygons) for o in joined)
    row={'id':asset,'source_previous':entry['source'],'source_previous_sha256':sha(src),'source':str(source.relative_to(ROOT)),
         'source_sha256':sha(source),'candidate':str(out.relative_to(ROOT)),'sha256':sha(out),'bytes':out.stat().st_size,
         'triangles':triangles,'mesh_nodes':len(joined),'detail':detail,'runtime_publish_allowed':False}
    assert triangles<(4000 if asset=='rock' else 20000),row
    return row


def units():
    registry=original_registry('unit')
    rows=[]
    for unit in ('guard','crossbow'):
        entry=next(a for a in registry['assets'] if a['id']==unit)
        src=ROOT/entry['source'];bpy.ops.wm.open_mainfile(filepath=str(src))
        for mat in list(bpy.data.materials):
            if mat.name in MATERIALS:material_maps(mat,MATERIALS[mat.name],False)
        blend=RUN/'raw'/f'{unit}.blend';bpy.ops.file.pack_all();bpy.ops.wm.save_as_mainfile(filepath=str(blend))
        for lod in (0,1):
            ident=unit+('-lod1' if lod else '');filename=ident+'.glb'
            prior=next(a for a in registry['assets'] if a['id']==ident);old=ROOT/prior['candidate'];assert sha(old)==prior['sha256']
            out=RUN/'candidate'/filename;modified=patch_equipment(old,out)
            rows.append({'id':unit,'lod':lod,'source_previous':entry['source'],'source_previous_sha256':sha(src),
                         'source':str(blend.relative_to(ROOT)),'source_sha256':sha(blend),'runtime_previous_sha256':sha(old),
                         'candidate':str(out.relative_to(ROOT)),'sha256':sha(out),'materials':modified,'bytes':out.stat().st_size,
                         'runtime_publish_allowed':False,'geometry_and_animation':'unchanged binary payload; material-only GLB patch'})
    return rows


if __name__=='__main__':
    args=sys.argv[sys.argv.index('--')+1:];report=RUN/'qa/build.json'
    rows=json.loads(report.read_text()) if report.exists() else []
    if args==['units']:new=units()
    else:
        buildings=original_registry('building')
        props=original_registry('prop')
        ids=[a['id'] for a in buildings['assets']]+['rock'] if args==['all'] else args
        new=[build(a,props if a=='rock' else buildings) for a in ids]
    keys={(r['id'],r.get('lod')) for r in new};rows=[r for r in rows if (r['id'],r.get('lod')) not in keys]+new
    report.write_text(json.dumps(rows,indent=2)+'\n',encoding='utf-8');print('DETAIL_BUILD',json.dumps(new))
