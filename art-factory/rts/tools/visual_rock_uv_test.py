"""Detect collapsed or excessively stretched UVs on repaired rock surfaces."""
import argparse,json,sys
from pathlib import Path
import bpy
p=argparse.ArgumentParser();p.add_argument('--source',type=Path,required=True);p.add_argument('--report',type=Path,required=True);a=p.parse_args(sys.argv[sys.argv.index('--')+1:]);bpy.ops.wm.open_mainfile(filepath=str(a.source.resolve()))
obj=bpy.data.objects['Joined original structural strata'];obj.data.calc_loop_triangles();uv=obj.data.uv_layers.active;ratios=[]
for t in obj.data.loop_triangles:
    p0,p1,p2=(obj.data.vertices[i].co for i in t.vertices);u0,u1,u2=(uv.data[i].uv for i in t.loops);area=(p1-p0).cross(p2-p0).length;ua=u1-u0;ub=u2-u0;ratios.append(abs(ua.x*ub.y-ua.y*ub.x)/area)
bad=sum(not .12<=x<=.26 for x in ratios);report={'triangles':len(ratios),'minimum_uv_area_per_square_metre':min(ratios),'maximum_uv_area_per_square_metre':max(ratios),'distorted_triangles':bad};a.report.parent.mkdir(parents=True,exist_ok=True);a.report.write_text(json.dumps(report,indent=2)+'\n');print(json.dumps(report));assert bad==0,'Source texture is stretched or collapsed'
