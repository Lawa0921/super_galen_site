"""Thicken and weld the authored quarrel vanes; refit the heavy variant."""
import argparse,json,hashlib,sys
from pathlib import Path
import bpy,bmesh
from mathutils import Vector
sys.path.insert(0,str(Path(__file__).parent))
from detail_build import material_maps
from detail_materials import externalize_building
from visual_projectile_test import inspect

SB=.65/1.02

def apply(obj,modifier):
 bpy.context.view_layer.objects.active=obj;obj.select_set(True);bpy.ops.object.modifier_apply(modifier=modifier.name);obj.select_set(False)

def union(target,operand):
 modifier=target.modifiers.new('Weld original source junction','BOOLEAN');modifier.operation='UNION';modifier.solver='EXACT';modifier.material_mode='TRANSFER';modifier.object=operand
 apply(target,modifier);bpy.data.objects.remove(operand,do_unlink=True)

def main():
 p=argparse.ArgumentParser();p.add_argument('--source',type=Path,required=True);p.add_argument('--run',type=Path,required=True)
 a=p.parse_args(sys.argv[sys.argv.index('--')+1:]);run=a.run.resolve()
 for folder in ('raw','candidate','qa'):(run/folder).mkdir(parents=True,exist_ok=True)
 for asset in ('bolt','heavy-bolt'):
  bpy.ops.wm.open_mainfile(filepath=str(a.source.resolve()));heavy=asset=='heavy-bolt';objects=[o for o in bpy.data.objects if o.type=='MESH'];changes=[]
  shaft=next(o for o in objects if 'shaft' in o.name);head=next(o for o in objects if 'point' in o.name);fins=[o for o in objects if 'fletching' in o.name]
  assert len(objects)==4 and len(fins)==2
  for obj in objects:
   original_uv=[list(loop.uv) for loop in obj.data.uv_layers.active.data]
   if heavy:
    for vertex in obj.data.vertices:
     raw=vertex.co/SB+Vector((0,.27,0));q=raw.copy()
     if obj is head:q.y=.55-(.78-raw.y)*SB*1.30;scale=1.50
     elif obj is shaft:
      back=-.55+.025*SB*1.15;front=.55-.21*SB*1.30+.045*SB*1.30
      q.y=back+(raw.y+.215)/.830*(front-back);scale=1.30
     else:q.y=-.55+(raw.y+.24)*SB*1.15;scale=1.25
     q.x=raw.x*SB*scale;q.z=raw.z*SB*scale;vertex.co=q
   assert [list(loop.uv) for loop in obj.data.uv_layers.active.data]==original_uv
   material_maps(obj.active_material,'oak' if obj is shaft else 'steel' if obj is head else 'leather')
   bsdf=obj.active_material.node_tree.nodes.get('Principled BSDF');bsdf.inputs['Metallic'].default_value=1;bsdf.inputs['Roughness'].default_value=1
   if obj in fins:
    modifier=obj.modifiers.new('Physical source vane thickness','SOLIDIFY');modifier.thickness=.003 if heavy else .002;modifier.offset=0;modifier.use_even_offset=True;apply(obj,modifier)
    correction=(-.55 if heavy else -.325)-min(v.co.y for v in obj.data.vertices)
    for vertex in obj.data.vertices:vertex.co.y+=correction
   bm=bmesh.new();bm.from_mesh(obj.data);bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));bm.to_mesh(obj.data);bm.free();obj.data.update()
   changes.append({'part':obj.name,'source_uv_preserved_before_weld':True,'material':obj.active_material.name,'dimensions_before_weld':[max(v.co[k] for v in obj.data.vertices)-min(v.co[k] for v in obj.data.vertices) for k in range(3)]})
  for operand in fins+[head]:union(shaft,operand)
  bm=bmesh.new();bm.from_mesh(shaft.data);bmesh.ops.triangulate(bm,faces=list(bm.faces),quad_method='BEAUTY',ngon_method='BEAUTY');bm.to_mesh(shaft.data);bm.free();shaft.data.update()
  shaft.name='Closed source-derived '+asset
  qa=inspect(asset);assert not qa['failures'],qa['failures']
  bpy.context.preferences.filepaths.save_version=0;bpy.ops.file.pack_all();bpy.ops.wm.save_as_mainfile(filepath=str(run/f'raw/{asset}.blend'))
  bpy.ops.object.select_all(action='DESELECT');shaft.select_set(True);bpy.context.view_layer.objects.active=shaft;output=run/f'candidate/{asset}.glb'
  bpy.ops.export_scene.gltf(filepath=str(output),export_format='GLB',use_selection=True,export_yup=True,export_apply=True,export_normals=True,export_tangents=True,export_texcoords=True,export_materials='EXPORT',export_animations=False)
  externalize_building(output)
  report={'source':str(a.source),'source_sha256':hashlib.sha256(a.source.read_bytes()).hexdigest(),'changes':changes,'qa':qa,'heavy_part_scales':{'shaft_width':1.30,'head_length':1.30,'head_width':1.50,'vane_length':1.15,'vane_span':1.25,'vane_thickness':1.50} if heavy else None,'candidate_sha256':hashlib.sha256(output.read_bytes()).hexdigest(),'runtime_publish_allowed':False,'artistic_quality_proven':False}
  (run/f'qa/{asset}-build.json').write_text(json.dumps(report,indent=2)+'\n')

if __name__=='__main__':main()
