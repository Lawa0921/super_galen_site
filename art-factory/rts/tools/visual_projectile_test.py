"""Physical projectile shells, material coverage and part-specific proportions."""
import argparse,json,sys,math
from pathlib import Path
import bpy,bmesh

def inspect(asset):
 objects=[o for o in bpy.data.objects if o.type=='MESH'];rows=[];failures=[];points=[];parts={}
 for obj in objects:
  bm=bmesh.new();bm.from_mesh(obj.data);open_edges=sum(not e.is_manifold for e in bm.edges);volume=bm.calc_volume(signed=True)
  unseen=set(bm.verts);components=0
  while unseen:
   components+=1;stack=[unseen.pop()]
   while stack:
    for edge in stack.pop().link_edges:
     for v in edge.verts:
      if v in unseen:unseen.remove(v);stack.append(v)
  bm.free();row={'object':obj.name,'nonmanifold_edges':open_edges,'components':components,'volume':volume};rows.append(row)
  if open_edges or volume<=0 or components!=1:failures.append(obj.name+': open/disconnected/nonpositive shell')
  uv=obj.data.uv_layers.active
  if not uv or not all(math.isfinite(x) for loop in uv.data for x in loop.uv):failures.append(obj.name+': missing/nonfinite UV')
  for poly in obj.data.polygons:
   mat=obj.data.materials[poly.material_index].name
   for vi in poly.vertices:
    point=obj.matrix_world@obj.data.vertices[vi].co;points.append(point);parts.setdefault(mat,[]).append(point)
 if len(objects)!=1:failures.append('Entire shaft, head and vanes must be a connected closed shell')
 length=max(p.y for p in points)-min(p.y for p in points);target=1.1 if asset=='heavy-bolt' else .65
 if abs(length-target)>1e-5:failures.append('Incorrect overall length')
 extents={name:[max(p[k] for p in ps)-min(p[k] for p in ps) for k in range(3)] for name,ps in parts.items()}
 heavy=asset=='heavy-bolt'
 for match,dimension,expected in [('Oak',0,.03950980392*(1.30 if heavy else 1)),('Iron',0,.0637254902*(1.50 if heavy else 1))]:
  entry=next((v for k,v in extents.items() if match in k),None)
  if entry is None or abs(entry[dimension]-expected)>.0001:failures.append(match+': incorrect part proportions')
 return {'asset':asset,'rows':rows,'overall_length_m':length,'material_extents_m':extents,'failures':failures,'artistic_quality_proven':False}

if __name__=='__main__':
 p=argparse.ArgumentParser();p.add_argument('--source',type=Path,required=True);p.add_argument('--asset',required=True);p.add_argument('--report',type=Path,required=True)
 a=p.parse_args(sys.argv[sys.argv.index('--')+1:]);bpy.ops.wm.open_mainfile(filepath=str(a.source.resolve()));report=inspect(a.asset)
 a.report.parent.mkdir(parents=True,exist_ok=True);a.report.write_text(json.dumps(report,indent=2)+'\n');print(json.dumps(report));assert not report['failures']
