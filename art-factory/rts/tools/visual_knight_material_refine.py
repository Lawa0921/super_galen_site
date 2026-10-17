"""Complete mounted gear UVs and bind its existing generated surface sets."""
import argparse,json,hashlib,sys
from pathlib import Path
import bpy
sys.path.insert(0,str(Path(__file__).parent))
from visual_knight_material_test import equipment,inspect
from visual_hand_rework import mesh_fingerprint
from detail_build import material_maps

MAPS={'AshLanceShaft':'oak','DarkSaddleLeather':'leather','ForgedLanceSteel':'steel','ForgedSteel':'steel','TeamCloth_Shield':'cloth','WarmBrass':'brass','WornLeather':'leather','RefittedAgedBrassTack':'brass'}

def main():
 p=argparse.ArgumentParser();p.add_argument('--source',type=Path,required=True);p.add_argument('--run',type=Path,required=True);p.add_argument('--lod',type=int,required=True)
 a=p.parse_args(sys.argv[sys.argv.index('--')+1:]);run=a.run.resolve()
 for folder in ('raw','candidate','qa'):(run/folder).mkdir(parents=True,exist_ok=True)
 bpy.ops.wm.open_mainfile(filepath=str(a.source.resolve()));fingerprints={o.name:mesh_fingerprint(o) for o in bpy.data.objects if o.type=='MESH'};changes=[];materials=set()
 for obj in equipment():
  mesh=obj.data;uv=mesh.uv_layers[0] if mesh.uv_layers else mesh.uv_layers.new(name='Architectural UV');uv.name='Architectural UV';mesh.uv_layers.active_index=0;uv.active_render=True;repaired=[]
  for poly in mesh.polygons:
   pts=[uv.data[li].uv for li in poly.loop_indices];area=sum(abs((pts[i].x-pts[0].x)*(pts[i+1].y-pts[0].y)-(pts[i].y-pts[0].y)*(pts[i+1].x-pts[0].x)) for i in range(1,len(pts)-1))
   if area<1e-10:
    axes=[i for i in range(3) if i!=max(range(3),key=lambda k:abs(poly.normal[k]))]
    for li in poly.loop_indices:
     point=mesh.vertices[mesh.loops[li].vertex_index].co;uv.data[li].uv=(point[axes[0]]*2,point[axes[1]]*2)
    repaired.append(poly.index)
  materials.update(mesh.materials);changes.append({'object':obj.name,'planar_repaired_faces':repaired})
 for mat in materials:
  kind=MAPS[mat.name.split('.')[0]];material_maps(mat,kind);bsdf=mat.node_tree.nodes.get('Principled BSDF');bsdf.inputs['Metallic'].default_value=1;bsdf.inputs['Roughness'].default_value=1
  if 'TeamCloth' not in mat.name:bsdf.inputs['Base Color'].default_value=(1,1,1,1)
 for name,digest in fingerprints.items():assert mesh_fingerprint(bpy.data.objects[name])==digest
 qa=inspect();assert not qa['failures'],qa['failures']
 bpy.context.preferences.filepaths.save_version=0;bpy.ops.file.pack_all();bpy.ops.wm.save_as_mainfile(filepath=str(run/f'raw/knight-lod{a.lod}.blend'))
 for obj in bpy.data.objects:
  if obj.animation_data:
   obj.animation_data.action=None
   for track in obj.animation_data.nla_tracks:track.mute=False
 bpy.ops.object.select_all(action='DESELECT')
 for obj in bpy.data.objects:
  if obj.type in ('MESH','ARMATURE'):obj.select_set(True)
 bpy.context.view_layer.objects.active=bpy.data.objects['MountedKnightRig'];output=run/'candidate'/('knight.glb' if a.lod==0 else 'knight-lod1.glb')
 bpy.ops.export_scene.gltf(filepath=str(output),export_format='GLB',use_selection=True,export_yup=True,export_normals=True,export_texcoords=True,export_materials='EXPORT',export_extras=True,export_skins=True,export_def_bones=True,export_animations=True,export_animation_mode='NLA_TRACKS',export_nla_strips=True,export_anim_slide_to_zero=True,export_image_format='JPEG',export_jpeg_quality=90)
 report={'source':str(a.source),'source_sha256':hashlib.sha256(a.source.read_bytes()).hexdigest(),'changes':changes,'unchanged_mesh_fingerprints':fingerprints,'qa':qa,'candidate_sha256':hashlib.sha256(output.read_bytes()).hexdigest(),'runtime_publish_allowed':False,'artistic_quality_proven':False}
 (run/f'qa/material-{a.lod}.json').write_text(json.dumps(report,indent=2)+'\n')

if __name__=='__main__':main()
