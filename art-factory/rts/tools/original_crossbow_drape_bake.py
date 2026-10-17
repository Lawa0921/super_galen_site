"""Re-unwrap only the original skirt and bake its original high-poly color.

The runtime mesh positions, topology, skin and animation remain unchanged.
"""
import ast,base64,bpy,hashlib,json,os,subprocess,sys
import numpy as np
from pathlib import Path
sys.path.insert(0,str(Path(__file__).parent))
from original_crossbow_drape_uv import SOURCE,RUN,ROOT,load_mother

def emission_copy(material,image=None):
    result=material.copy();nodes=result.node_tree.nodes;bsdf=next(n for n in nodes if n.type=='BSDF_PRINCIPLED');output=next(n for n in nodes if n.type=='OUTPUT_MATERIAL')
    if image:
        tex=nodes.new('ShaderNodeTexImage');tex.image=image;color=tex.outputs['Color']
    else:color=bsdf.inputs['Base Color'].links[0].from_socket
    emission=nodes.new('ShaderNodeEmission');result.node_tree.links.new(color,emission.inputs['Color']);result.node_tree.links.new(emission.outputs[0],output.inputs['Surface']);return result

def skirt_faces(body):
    # Include the full cloth to the belt: diagnosed upper-skirt flecks lie at
    # z=1.020..1.066, above the previous 1.035 cutoff (whole-face selection).
    return [p for p in body.data.polygons if all(.665<v.co.z<1.17 and abs(v.co.x)<.325 for v in [body.data.vertices[i] for i in p.vertices])]

def skirt_patch(body,lod):
    faces=skirt_faces(body)
    assert len(faces)>200,'Missing original skirt selection'
    ids=sorted({i for p in faces for i in p.vertices});mapping={i:k for k,i in enumerate(ids)}
    mesh=bpy.data.meshes.new('QASkirtBakeTarget');mesh.from_pydata([body.data.vertices[i].co for i in ids],[],[[mapping[i] for i in p.vertices] for p in faces]);mesh.update()
    obj=bpy.data.objects.new('QASkirtBakeTarget',mesh);bpy.context.scene.collection.objects.link(obj)
    bpy.ops.object.select_all(action='DESELECT');obj.select_set(True);bpy.context.view_layer.objects.active=obj
    mesh.uv_layers.new(name='OriginalSkirtUV')
    if '--coverage-only' not in sys.argv:
        source=RUN/f'raw/skirt-atlas-lod{lod}.json';output=RUN/f'qa/skirt-atlas-lod{lod}.json'
        source.write_text(json.dumps({'vertices':[list(v.co) for v in mesh.vertices],'faces':[list(p.vertices) for p in mesh.polygons]})+'\n')
        python=os.environ.get('RTS_UV_PYTHON',str(Path.home()/'.cache/codex-rts3d/venv/Scripts/python.exe'))
        process=subprocess.run([python,str(Path(__file__).with_name('original_crossbow_atlas.py')),str(source),str(output)],capture_output=True,text=True,creationflags=subprocess.CREATE_NO_WINDOW if os.name=='nt' else 0)
        print(process.stdout,process.stderr);process.check_returncode()
        layout=json.loads(output.read_text())
        assert layout['source_sha256']==hashlib.sha256(source.read_bytes()).hexdigest()
        assert min(layout['padding_at_1024'])>=12,'Insufficient bake padding'
        for p,corners in zip(mesh.polygons,layout['face_corners']):
            for i,uv in zip(p.loop_indices,corners):mesh.uv_layers.active.data[i].uv=uv
        from original_crossbow_drape_verify import raster_check
        check=raster_check(mesh,list(range(len(mesh.polygons))),np.ones((1024,1024)))
        assert check['overlapping_interior_texels']==0,check
    for p in mesh.polygons:p.use_smooth=True
    return obj,faces

def bake(mother,target,source_mat,lod,label,color_space):
    scene=bpy.context.scene;scene.render.engine='CYCLES';scene.cycles.samples=8;scene.cycles.device='CPU';scene.render.bake.use_selected_to_active=True;scene.render.bake.cage_extrusion=.025;scene.render.bake.max_ray_distance=.05;scene.render.bake.margin=12
    image=bpy.data.images.new(f'OriginalCrossbowSkirt_{label}_LOD{lod}',width=1024,height=1024,alpha=False);image.colorspace_settings.name=color_space
    target_mat=bpy.data.materials.new(f'QABake_{label}_{lod}');tex=target_mat.node_tree.nodes.new('ShaderNodeTexImage');tex.image=image;target_mat.node_tree.nodes.active=tex
    target.data.materials.clear();target.data.materials.append(target_mat);mother.data.materials.clear();mother.data.materials.append(source_mat)
    bpy.ops.object.select_all(action='DESELECT');mother.hide_render=False;target.hide_render=False;mother.select_set(True);target.select_set(True);bpy.context.view_layer.objects.active=target
    bpy.ops.object.bake(type='EMIT')
    folder='qa' if label=='coverage' else 'candidate'
    path=RUN/f'{folder}/skirt-{label}-lod{lod}-1024.png';image.filepath_raw=str(path);image.file_format='PNG';image.save();image.pack();return image,path

def main():
    assert hashlib.sha256(SOURCE.read_bytes()).hexdigest()=='91d1048ab31dad70e4e66b2a99cea3d666de6e8fb201f9a084f16c00b5922ffe'
    for name in ('raw','candidate','qa'):(RUN/name).mkdir(parents=True,exist_ok=True)
    coverage_only='--coverage-only' in sys.argv
    bpy.ops.wm.open_mainfile(filepath=str(RUN/'candidate/original-crossbow-grip.blend' if coverage_only else SOURCE));rig=bpy.data.objects['crossbowRig20'];rig.data.pose_position='REST';bpy.context.view_layer.update()
    bodies=[bpy.data.objects[f'crossbowOriginalBody_LOD{lod}'] for lod in (0,1)];original=bodies[0].data.materials[0];mother=load_mother()
    if coverage_only:
        white=emission_copy(original);node=next(n for n in white.node_tree.nodes if n.type=='EMISSION')
        for link in list(node.inputs['Color'].links):white.node_tree.links.remove(link)
        node.inputs['Color'].default_value=(1,1,1,1)
        for lod,body in enumerate(bodies):
            patch,faces=skirt_patch(body,lod)
            for face,temp in zip(faces,patch.data.polygons):
                for a,b in zip(face.loop_indices,temp.loop_indices):patch.data.uv_layers.active.data[b].uv=body.data.uv_layers.active.data[a].uv
            bake(mother,patch,white,lod,'coverage','Non-Color');bpy.data.objects.remove(patch,do_unlink=True)
        return
    mask_bytes=base64.b64decode(original['teamTintMask'].split(',')[1]);mask_path=RUN/'raw/original-team-mask-1024.png';mask_path.write_bytes(mask_bytes);mask=bpy.data.images.load(str(mask_path));mask.colorspace_settings.name='Non-Color'
    source_albedo=emission_copy(original);source_mask=emission_copy(original,mask);records=[]
    for lod,body in enumerate(bodies):
        patch,faces=skirt_patch(body,lod)
        albedo,albedo_path=bake(mother,patch,source_albedo,lod,'albedo','sRGB')
        _,mask_out=bake(mother,patch,source_mask,lod,'mask','Non-Color')
        material=original.copy();material.name=f'TeamClothMasked_crossbow_skirt_LOD{lod}';bsdf=next(n for n in material.node_tree.nodes if n.type=='BSDF_PRINCIPLED');tex=material.node_tree.nodes.new('ShaderNodeTexImage');tex.image=albedo;material.node_tree.links.new(tex.outputs['Color'],bsdf.inputs['Base Color']);material['teamTintMask']='data:image/png;base64,'+base64.b64encode(mask_out.read_bytes()).decode()
        index=len(body.data.materials);body.data.materials.append(material)
        for face,temp in zip(faces,patch.data.polygons):
            assert len(face.loop_indices)==len(temp.loop_indices)
            face.material_index=index
            for a,b in zip(face.loop_indices,temp.loop_indices):body.data.uv_layers.active.data[a].uv=patch.data.uv_layers.active.data[b].uv
        records.append({'lod':lod,'faces':[p.index for p in faces],'material_index':index,'albedo_sha256':hashlib.sha256(albedo_path.read_bytes()).hexdigest(),'mask_sha256':hashlib.sha256(mask_out.read_bytes()).hexdigest(),'texture_size':[1024,1024]})
        bpy.data.objects.remove(patch,do_unlink=True)
    bpy.data.objects.remove(mother,do_unlink=True);rig.data.pose_position='POSE';bpy.context.scene.render.engine='BLENDER_EEVEE';bpy.context.view_layer.update()
    out=RUN/'candidate';bpy.context.preferences.filepaths.save_version=0;bpy.ops.wm.save_as_mainfile(filepath=str(out/'original-crossbow-grip.blend'))
    (out/'drape-report.json').write_text(json.dumps({'source_sha256':hashlib.sha256(SOURCE.read_bytes()).hexdigest(),'method':'Original canonical albedo/mask selected-to-active EMIT bake to local skirt UVs; no geometry/skin changes','records':records,'runtime_publish_allowed':False},indent=2)+'\n')
    if '--no-export' in sys.argv:return
    exporter=Path(__file__).with_name('original_crossbow_grip_build.py');tree=ast.parse(exporter.read_text(encoding='utf8'));fn=next(n for n in tree.body if isinstance(n,ast.FunctionDef) and n.name=='export_lod')
    for node in ast.walk(fn):
        if isinstance(node,ast.Call) and isinstance(node.func,ast.Attribute) and node.func.attr=='gltf':node.keywords.append(ast.keyword(arg='export_extras',value=ast.Constant(True)))
    ast.fix_missing_locations(fn);ns={'bpy':bpy,'os':os};exec(compile(ast.Module(body=[fn],type_ignores=[]),str(exporter),'exec'),ns)
    weapons=[bpy.data.objects[f'CrossbowWeapon_LOD{lod}'] for lod in (0,1)];hands=[bpy.data.objects['OriginalCrossbowClosedGrip_'+s] for s in ('R','L')]
    for lod in (0,1):ns['export_lod'](rig,bodies,weapons,[],hands,str(out/f'original-crossbow-grip-lod{lod}.glb'),bodies[lod].name,weapons[lod].name)
    meta=json.loads((SOURCE.parent/'weapon-candidate-report.json').read_text());meta['drape_source_sha256']=hashlib.sha256(SOURCE.read_bytes()).hexdigest();meta['files']={p.name:hashlib.sha256(p.read_bytes()).hexdigest() for p in out.iterdir() if p.suffix in ('.blend','.glb')};(out/'weapon-candidate-report.json').write_text(json.dumps(meta,indent=2)+'\n');print('DRAPE_BAKED',json.dumps(meta['files']))
if __name__=='__main__':main()
