"""Whole-asset caps and closed retopology; original entrance/ore must be exact."""
import argparse,hashlib,json,sys
from pathlib import Path
import bpy,bmesh
from mathutils import Vector

def fingerprint(obj):
    return hashlib.sha256(repr(([[float(x) for x in v.co] for v in obj.data.vertices],[list(p.vertices) for p in obj.data.polygons],[p.material_index for p in obj.data.polygons],[m.name for m in obj.data.materials])).encode()).hexdigest()
def metrics(obj):
    obj.data.calc_loop_triangles();aspect=[]
    for tri in obj.data.loop_triangles:
        a,b,c=(obj.data.vertices[i].co for i in tri.vertices);area=(b-a).cross(c-a).length*.5
        aspect.append(max((b-a).length_squared,(c-b).length_squared,(a-c).length_squared)/(2*area) if area else 1e9)
    bm=bmesh.new();bm.from_mesh(obj.data);volume=bm.calc_volume(signed=True);bad=sum(not e.is_manifold for e in bm.edges);bm.free()
    points=[obj.matrix_world@v.co for v in obj.data.vertices]
    return {'tris':len(obj.data.loop_triangles),'max_aspect':max(aspect),'bad_aspect':sum(x>15 for x in aspect),'volume':volume,'nonmanifold':bad,'bounds':[[min(p[k] for p in points),max(p[k] for p in points)] for k in range(3)]}
def main():
    p=argparse.ArgumentParser();p.add_argument('--asset',choices=['rock','gold-mine'],required=True);p.add_argument('--source',type=Path,required=True);p.add_argument('--reference',type=Path,required=True);p.add_argument('--report',type=Path,required=True);a=p.parse_args(sys.argv[sys.argv.index('--')+1:])
    bpy.ops.wm.open_mainfile(filepath=str(a.reference.resolve()));old=metrics(bpy.data.objects['Joined original structural strata']);other={o.name:fingerprint(o) for o in bpy.data.objects if o.type=='MESH' and o.name!='Joined original structural strata'}
    bpy.ops.wm.open_mainfile(filepath=str(a.source.resolve()));obj=bpy.data.objects['Joined original structural strata'];new=metrics(obj);fail=[]
    triangles=sum(metrics(o)['tris'] for o in bpy.data.objects if o.type=='MESH');cap=2000 if a.asset=='rock' else 8000
    if triangles>cap:fail.append('Whole asset triangle cap')
    if new['nonmanifold'] or new['volume']<=0:fail.append('Open or inverted rock')
    if new['bad_aspect']:fail.append('Sliver triangles survive')
    if abs(new['volume']/old['volume']-1)>.02:fail.append('Original rock volume changed over 2%')
    if max(abs(a-b) for x,y in zip(old['bounds'],new['bounds']) for a,b in zip(x,y))>.04:fail.append('Original silhouette bounds changed over 4 cm')
    if {o.name:fingerprint(o) for o in bpy.data.objects if o.type=='MESH' and o.name!=obj.name}!=other:fail.append('Entrance/ore/unrelated source mesh changed')
    uv=obj.data.uv_layers.active
    if not uv or len(uv.data)!=len(obj.data.loops):fail.append('Missing transferred UV')
    report={'asset':a.asset,'triangles':triangles,'target':new,'failures':fail,'artistic_quality_proven':False};a.report.parent.mkdir(parents=True,exist_ok=True);a.report.write_text(json.dumps(report,indent=2)+'\n');print(json.dumps(report));assert not fail,fail
if __name__=='__main__':main()
