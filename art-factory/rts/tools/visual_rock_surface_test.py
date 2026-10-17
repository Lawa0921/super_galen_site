"""Reject folded/open rock surfaces and discontinuous interior UV charts."""
import argparse,json,sys
from pathlib import Path
import bpy,bmesh
from mathutils import Vector

NAMES=['Rifted granite central crest','Broken left apron','Sheared right stratum','Forward splinter ridge',
 'Mine rocky left buttress','Mine rocky right buttress','Mine hill rear mass','Mine weathered crest',
 'Glinting gold-vein outcrop','Glinting gold-vein high face','Exposed gold lode on entry cliff','Loose gold-bearing ore at portal']

def inspect():
 rows=[];failures=[]
 for obj in bpy.data.objects:
  if obj.type!='MESH' or obj.name not in NAMES:continue
  mesh=obj.data;bm=bmesh.new();bm.from_mesh(mesh)
  boundary=sum(not e.is_manifold for e in bm.edges);volume=bm.calc_volume(signed=True);bm.free()
  mesh.calc_loop_triangles();points=[v.co for v in mesh.vertices];aspect=0;degenerate=0
  for tri in mesh.loop_triangles:
   a,b,c=[points[i] for i in tri.vertices];area2=(b-a).cross(c-a).length
   degenerate+=area2<1e-10
   aspect=max(aspect,max((b-a).length_squared,(c-b).length_squared,(a-c).length_squared)/max(1e-10,area2))
  inversions=sum(points[(j+1)*11+i].z<=points[j*11+i].z for j in range(4) for i in range(11))
  uv=mesh.uv_layers.active;links={};seams=0;checks=0
  # Exclude the intentional longitude wrap and top/bottom chart boundaries.
  cap_centers={len(points)-2,len(points)-1} if len(points) in (57,68) else set()
  for poly in mesh.polygons:
   if cap_centers.intersection(poly.vertices) or all(v//11 in (0,) for v in poly.vertices) or all(v//11==4 for v in poly.vertices):continue
   loops=list(poly.loop_indices)
   for x,y in zip(loops,loops[1:]+loops[:1]):
    u,v=mesh.loops[x].vertex_index,mesh.loops[y].vertex_index;key=tuple(sorted((u,v)))
    ends={u:uv.data[x].uv.copy(),v:uv.data[y].uv.copy()};links.setdefault(key,[]).append(ends)
  for (u,v),sides in links.items():
   if len(sides)!=2 or (u%11==v%11==0):continue
   checks+=1;seams+=any((sides[0][k]-sides[1][k]).length>1e-5 for k in (u,v))
  top_range=max(v.z for v in points[44:55])-min(v.z for v in points[44:55])
  base_range=max(v.z for v in points[:11])-min(v.z for v in points[:11])
  row={'object':obj.name,'vertices':len(points),'triangles':len(mesh.loop_triangles),'nonmanifold_edges':boundary,'signed_volume':volume,'nontri_faces':sum(len(p.vertices)!=3 for p in mesh.polygons),'degenerate_triangles':degenerate,'ring_inversions':inversions,'max_aspect':aspect,'interior_uv_checks':checks,'interior_uv_seams':seams,'top_crown_z_range_m':top_range};rows.append(row)
  row['base_z_range_m']=base_range
  for key,ok in [('closed',boundary==0),('positive_volume',volume>0),('triangles',row['nontri_faces']==0),('nondegenerate',degenerate==0),('monotonic_rings',inversions==0),('triangle_quality',aspect<=15),('continuous_side_uv',checks>0 and seams==0),('no_sawtooth_crown',top_range<=1e-5),('no_folded_ground_cap',base_range<=1e-5)]:
   if not ok:failures.append(obj.name+': '+key)
 assert len(rows) in (4,8),len(rows)
 return {'rows':rows,'failures':failures,'artistic_quality_proven':False}

if __name__=='__main__':
 p=argparse.ArgumentParser();p.add_argument('--source',type=Path,required=True);p.add_argument('--report',type=Path,required=True)
 a=p.parse_args(sys.argv[sys.argv.index('--')+1:]);bpy.ops.wm.open_mainfile(filepath=str(a.source.resolve()));report=inspect()
 a.report.parent.mkdir(parents=True,exist_ok=True);a.report.write_text(json.dumps(report,indent=2)+'\n');print(json.dumps(report));assert not report['failures']
