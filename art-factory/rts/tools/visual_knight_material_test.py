"""Held mounted equipment must use registered maps and noncollapsed UVs."""
import argparse,json,sys
from pathlib import Path
import bpy

def equipment():
 return [o for o in bpy.data.objects if o.type=='MESH' and o.name.startswith(('KnightLance_','KnightSunShield_','ForgedStirrup_','StirrupLeather_'))]

def inspect():
 failures=[];rows=[]
 for obj in equipment():
  uv=obj.data.uv_layers.active;zero=0;maps={}
  if uv is None:failures.append(obj.name+': UV inactive');continue
  for poly in obj.data.polygons:
   pts=[uv.data[li].uv for li in poly.loop_indices];area=sum(abs((pts[i].x-pts[0].x)*(pts[i+1].y-pts[0].y)-(pts[i].y-pts[0].y)*(pts[i+1].x-pts[0].x)) for i in range(1,len(pts)-1));zero+=area<1e-10
  if zero:failures.append(obj.name+': collapsed UV faces')
  for mat in obj.data.materials:
   images=[n.image.name for n in mat.node_tree.nodes if n.type=='TEX_IMAGE' and n.image];maps[mat.name]=images
   expected=2 if 'TeamCloth' in mat.name else 3
   if len(images)<expected:failures.append(obj.name+'/'+mat.name+': missing generated surface maps')
  rows.append({'object':obj.name,'zero_area_uv_faces':zero,'maps':maps})
 assert len(equipment())==6
 return {'rows':rows,'failures':failures,'artistic_quality_proven':False}

if __name__=='__main__':
 p=argparse.ArgumentParser();p.add_argument('--source',type=Path,required=True);p.add_argument('--report',type=Path,required=True)
 a=p.parse_args(sys.argv[sys.argv.index('--')+1:]);bpy.ops.wm.open_mainfile(filepath=str(a.source.resolve()));report=inspect()
 a.report.parent.mkdir(parents=True,exist_ok=True);a.report.write_text(json.dumps(report,indent=2)+'\n');print(json.dumps(report));assert not report['failures']
