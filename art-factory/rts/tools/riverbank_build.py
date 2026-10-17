"""Author a continuous original embankment; source detail comes from generated terrain."""
import bpy,sys,json,hashlib,numpy as np
from pathlib import Path
sys.path.insert(0,str(Path(__file__).parent))
from riverbank_surface import surface
ROOT=Path(__file__).resolve().parents[3];RUN=ROOT/'art-factory/rts/runs/riverbank/2026-10-07-v1'
bpy.ops.wm.read_factory_settings(use_empty=True);height=np.load(RUN/'raw/relief.npy');nx,ny=12,48
vertices=[surface(i/nx,j/ny,height) for j in range(ny+1) for i in range(nx+1)];faces=[]
for j in range(ny):
    for i in range(nx):
        a=j*(nx+1)+i;faces.append((a,a+1,a+nx+2,a+nx+1))
boundary=list(range(nx+1))+[j*(nx+1)+nx for j in range(1,ny+1)]+[ny*(nx+1)+i for i in range(nx-1,-1,-1)]+[j*(nx+1) for j in range(ny-1,0,-1)]
bottom=len(vertices);vertices.append((0,0,-.03))
for a,b in zip(boundary,boundary[1:]+boundary[:1]):faces.append((b,a,bottom))
mesh=bpy.data.meshes.new('OriginalRiverbankSurface');mesh.from_pydata(vertices,[],faces);mesh.update();obj=bpy.data.objects.new('OriginalRiverbank',mesh);bpy.context.scene.collection.objects.link(obj)
uv=mesh.uv_layers.new(name='SourceTerrainUV')
for poly in mesh.polygons:
    poly.use_smooth=True
    for loop in poly.loop_indices:
        p=mesh.vertices[mesh.loops[loop].vertex_index].co;uv.data[loop].uv=(p.x+.5,(p.y+2)/4)
mat=bpy.data.materials.new('OriginalRiverbankStoneSoil');mat.use_nodes=True;bsdf=mat.node_tree.nodes.get('Principled BSDF');bsdf.inputs['Metallic'].default_value=0;bsdf.inputs['Roughness'].default_value=.9
for name,input_name,color_space in [('color','Base Color','sRGB'),('roughness','Roughness','Non-Color'),('normal',None,'Non-Color')]:
    tex=mat.node_tree.nodes.new('ShaderNodeTexImage');tex.image=bpy.data.images.load(str(RUN/f'raw/riverbank-{name}.png'));tex.image.colorspace_settings.name=color_space;tex.image.pack()
    if input_name:mat.node_tree.links.new(tex.outputs['Color'],bsdf.inputs[input_name])
    else:
        normal=mat.node_tree.nodes.new('ShaderNodeNormalMap');normal.inputs['Strength'].default_value=.75;mat.node_tree.links.new(tex.outputs['Color'],normal.inputs['Color']);mat.node_tree.links.new(normal.outputs['Normal'],bsdf.inputs['Normal'])
mesh.materials.append(mat);obj.select_set(True);bpy.context.view_layer.objects.active=obj
obj['source_assets']='Project-generated river-shingle, forest-floor and lush-grass';obj['asset_role']='Original low rocky riverbank, outer -X to water +X, repeat along Z in runtime';obj['runtime_publish_allowed']=False
bpy.ops.wm.save_as_mainfile(filepath=str(RUN/'raw/riverbank.blend'))
out=RUN/'rejected/raised-sections/riverbank.glb';bpy.ops.export_scene.gltf(filepath=str(out),export_format='GLB',use_selection=True,export_animations=False,export_yup=True,export_tangents=True,export_extras=True,export_materials='EXPORT')
mesh.calc_loop_triangles();report={'sha256':hashlib.sha256(out.read_bytes()).hexdigest(),'bytes':out.stat().st_size,'triangles':len(mesh.loop_triangles),'materials':len(mesh.materials),'dimensions_blender':list(obj.dimensions),'runtime_publish_allowed':False}
(RUN/'qa/authoring.json').write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8',newline='\n');print(json.dumps(report))
