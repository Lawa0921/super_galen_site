"""Require a closed outward-facing barrel beneath the original bridge deck."""
import argparse,json,sys
from pathlib import Path
import bpy,bmesh
from mathutils import Vector

def inspect():
    arches=[o for o in bpy.data.objects if o.type=='MESH' and 'Bridge true masonry arch' in o.name and 'voussoir' in o.name]
    rows=[];failures=[]
    for obj in arches:
        bm=bmesh.new();bm.from_mesh(obj.data);bm.transform(obj.matrix_world)
        ys=[v.co.y for v in bm.verts];volume=bm.calc_volume(signed=True)
        row={'object':obj.name,'minimum_y':min(ys),'maximum_y':max(ys),'nonmanifold_edges':sum(not e.is_manifold for e in bm.edges),'signed_volume':volume}
        rows.append(row);bm.free()
        if volume<=0 or row['nonmanifold_edges']:failures.append(obj.name+': invalid closed outward stone')
    spanning=[r for r in rows if r['minimum_y']<=-3.127 and r['maximum_y']>=3.127]
    if len(spanning)!=12:failures.append('Expected all 12 source arch segments to span both bridge facades')
    paving=[o for o in bpy.data.objects if o.name.startswith('Cambered dressed road paving')]
    tops=[max((o.matrix_world@Vector(p)).z for p in o.bound_box) for o in paving]
    if len(tops)!=8 or any(abs(z-.025)>1e-5 for z in tops):failures.append('Original level navigation deck changed')
    return {'arches':rows,'spanning_segments':len(spanning),'paving_heights':tops,'failures':failures,'artistic_quality_proven':False}

if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--source',type=Path,required=True);p.add_argument('--report',type=Path,required=True)
    a=p.parse_args(sys.argv[sys.argv.index('--')+1:]);bpy.ops.wm.open_mainfile(filepath=str(a.source.resolve()));r=inspect();r['source']=str(a.source)
    a.report.parent.mkdir(parents=True,exist_ok=True);a.report.write_text(json.dumps(r,indent=2)+'\n');print(json.dumps(r));assert not r['failures'],'; '.join(r['failures'])
