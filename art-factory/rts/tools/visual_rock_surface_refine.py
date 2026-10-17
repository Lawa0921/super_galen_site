"""Repair the registered stratified rock surfaces, retaining authored XY rings."""
import argparse,hashlib,json,math,sys
from pathlib import Path
import bpy,bmesh
from mathutils import Vector
sys.path.insert(0,str(Path(__file__).parent))
from visual_rock_surface_test import NAMES,inspect
from visual_hand_rework import mesh_fingerprint
from detail_build import material_maps
from detail_materials import externalize_building

PARAMS=dict(zip(NAMES,[(0,1.46),(0,.68),(0,.92),(0,.43),(0,2.45),(0,2.66),(0,3.02),(1.98,1.06),(.67,1.24),(1.22,1.03),(.56,1.54),(0,.51)]))
HEIGHTS=[0,.21,.53,.78,1]

def quality(points,faces):
 return max(max((points[b]-points[a]).length_squared,(points[c]-points[b]).length_squared,(points[a]-points[c]).length_squared)/max(1e-12,(points[b]-points[a]).cross(points[c]-points[a]).length) for a,b,c in faces)

def refine(obj):
 old=[v.co.copy() for v in obj.data.vertices];assert len(old)==55,(obj.name,len(old))
 center,height=PARAMS[obj.name];points=[v.copy() for v in old]
 for j,zt in enumerate(HEIGHTS):
  taper=max(0,min(1,(zt-.53)/.47));taper=1-taper*taper*(3-2*taper)
  for i in range(11):points[j*11+i].z=max(0,center+height*zt+min(.10,height*.08)*math.sin(i*3.4+j*1.8)*min(1,zt+.1)*taper)
 for point in points[:11]:point.z=center
 drift=max((a-b).length for a,b in zip(old,points));centroid=(sum(old,Vector())-sum(points,Vector())).length/55
 assert drift<=.101 and centroid<=.003,(obj.name,drift,centroid)
 assert all(a.x==b.x and a.y==b.y for a,b in zip(old,points))
 faces=[];charts=[]
 # Arc length in U and distance along the ring columns in V keep each
 # shared endpoint identical, with only the intentional back wrap seam.
 circumference=sum((points[(i+1)%11+11]-points[i+11]).length for i in range(11))
 u=[0]
 for i in range(11):u.append(u[-1]+(points[(i+1)%11+11]-points[i+11]).length*.5)
 v=[[0]*11 for _ in range(5)]
 for j in range(1,5):
  for i in range(11):v[j][i]=v[j-1][i]+(points[j*11+i]-points[(j-1)*11+i]).length*.5
 def band(lower,upper,lv,uv):
  for i in range(11):
   a=lower+i;b=lower+(i+1)%11;c=upper+(i+1)%11;d=upper+i
   alternatives=[[(a,b,c),(a,c,d)],[(a,b,d),(b,c,d)]]
   selected=min(alternatives,key=lambda fs:quality(points,fs));coords={a:(u[i],lv[i]),b:(u[i+1],lv[(i+1)%11]),c:(u[i+1],uv[(i+1)%11]),d:(u[i],uv[i])}
   for face in selected:faces.append(face);charts.append([coords[k] for k in face])
 for j in range(3):band(j*11,(j+1)*11,v[j],v[j+1])
 before=len(faces);band(33,44,v[3],v[4])
 if quality(points,faces[before:])>15:
  del faces[before:];del charts[before:];mid=len(points)
  points.extend(points[33+i].lerp(points[44+i],2/3) for i in range(11))
  mv=[v[3][i]+(v[4][i]-v[3][i])*2/3 for i in range(11)]
  band(33,mid,v[3],mv);band(mid,44,mv,v[4])
 for ring in (0,4):
  ci=len(points);points.append(sum(points[ring*11:(ring+1)*11],Vector())/11)
  for i in range(11):
   a=ring*11+i;b=ring*11+(i+1)%11;face=(ci,a,b) if ring==4 else (ci,b,a)
   faces.append(face);charts.append([(points[k].x*.5,points[k].y*.5) for k in face])
 materials=list(obj.data.materials);mesh=bpy.data.meshes.new(obj.name+' closed source strata');mesh.from_pydata(points,[],faces);mesh.update()
 for mat in materials:mesh.materials.append(mat)
 uv=mesh.uv_layers.new(name='Architectural UV')
 for poly,coords in zip(mesh.polygons,charts):
  for li,coord in zip(poly.loop_indices,coords):uv.data[li].uv=coord
 obj.data=mesh;obj.modifiers.clear();obj['keep_native_uv']=True
 return {'object':obj.name,'max_original_ring_drift_m':drift,'original_ring_centroid_drift_m':centroid,'source_materials':[m.name for m in materials],'closed_faces':len(faces),'side_uv_circumference_m':circumference}

def main():
 p=argparse.ArgumentParser();p.add_argument('--asset',choices=['rock','gold-mine'],required=True);p.add_argument('--source',type=Path,required=True);p.add_argument('--run',type=Path,required=True)
 a=p.parse_args(sys.argv[sys.argv.index('--')+1:]);run=a.run.resolve()
 for folder in ('raw','candidate','qa'):(run/folder).mkdir(parents=True,exist_ok=True)
 bpy.ops.wm.open_mainfile(filepath=str(a.source.resolve()))
 unchanged={o.name:mesh_fingerprint(o) for o in bpy.data.objects if o.type=='MESH' and o.name not in PARAMS}
 changes=[refine(o) for o in bpy.data.objects if o.type=='MESH' and o.name in PARAMS]
 for name,digest in unchanged.items():assert mesh_fingerprint(bpy.data.objects[name])==digest
 if a.asset=='rock':material_maps(bpy.data.materials['GrayRock'],'granite')
 qa=inspect();assert not qa['failures'],qa['failures']
 bpy.context.preferences.filepaths.save_version=0;bpy.ops.file.pack_all();bpy.ops.wm.save_as_mainfile(filepath=str(run/f'raw/{a.asset}-editable-strata.blend'))
 # Union only the structural rocks. Preserve the separate original gold veins,
 # entrance timbers and stone footings, including their source material names.
 structural=[bpy.data.objects[name] for name in NAMES[:4] if name in bpy.data.objects] if a.asset=='rock' else [bpy.data.objects[name] for name in NAMES[4:8]]
 original_points=[o.matrix_world@v.co for o in structural for v in o.data.vertices]
 bounds=[[min(p[k] for p in original_points),max(p[k] for p in original_points)] for k in range(3)]
 target=structural[0];joined_names=[o.name for o in structural]
 for operand in structural[1:]:
  mod=target.modifiers.new('Join the original solid rock strata','BOOLEAN');mod.operation='UNION';mod.solver='EXACT';mod.material_mode='TRANSFER';mod.object=operand
  bpy.context.view_layer.objects.active=target;target.select_set(True);bpy.ops.object.modifier_apply(modifier=mod.name);bpy.data.objects.remove(operand,do_unlink=True)
 target.name='Joined original structural strata';target['source_strata']=joined_names
 bm=bmesh.new();bm.from_mesh(target.data);nonmanifold=sum(not e.is_manifold for e in bm.edges);volume=bm.calc_volume(signed=True);bm.free()
 final_points=[target.matrix_world@v.co for v in target.data.vertices]
 final_bounds=[[min(p[k] for p in final_points),max(p[k] for p in final_points)] for k in range(3)]
 bound_error=max(abs(a-b) for p,q in zip(bounds,final_bounds) for a,b in zip(p,q));assert nonmanifold==0 and volume>0 and bound_error<=1e-6,(nonmanifold,volume,bound_error)
 union={'source_parts':joined_names,'nonmanifold_edges':nonmanifold,'signed_volume':volume,'union_bounds_error_m':bound_error}
 bpy.context.preferences.filepaths.save_version=0;bpy.ops.file.pack_all();bpy.ops.wm.save_as_mainfile(filepath=str(run/f'raw/{a.asset}.blend'))
 bpy.ops.object.select_all(action='DESELECT');objects=[o for o in bpy.data.objects if o.type=='MESH']
 for obj in objects:obj.select_set(True)
 bpy.context.view_layer.objects.active=objects[0];output=run/f'candidate/{a.asset}.glb'
 bpy.ops.export_scene.gltf(filepath=str(output),export_format='GLB',use_selection=True,export_yup=True,export_apply=True,export_normals=True,export_texcoords=True,export_materials='EXPORT',export_animations=False)
 if a.asset=='rock':externalize_building(output)
 report={'source':str(a.source),'source_sha256':hashlib.sha256(a.source.read_bytes()).hexdigest(),'changes':changes,'unchanged_mesh_fingerprints':unchanged,'qa':qa,'union':union,'candidate_sha256':hashlib.sha256(output.read_bytes()).hexdigest(),'runtime_publish_allowed':False,'artistic_quality_proven':False}
 (run/f'qa/{a.asset}-build.json').write_text(json.dumps(report,indent=2)+'\n')

if __name__=='__main__':main()
