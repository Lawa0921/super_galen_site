"""Regression checks for tears in the generated horse's lower-leg surfaces."""
import argparse
import json
import sys
from pathlib import Path
import bpy
import bmesh


def audit(horse):
    bm=bmesh.new();bm.from_mesh(horse.data)
    # UV seams duplicate positions in the imported source. They are not tears.
    raw_boundary=sum(e.is_boundary for e in bm.edges)
    bmesh.ops.remove_doubles(bm,verts=list(bm.verts),dist=1e-6)
    lower=[e for e in bm.edges if max(v.co.z for v in e.verts)<.68]
    boundary=[e for e in lower if e.is_boundary]
    nonmanifold=[e for e in lower if not e.is_manifold]
    used={i for p in horse.data.polygons for i in p.vertices}
    result={'object':horse.name,'raw_boundary_edges':raw_boundary,'lower_edges':len(lower),
            'lower_boundary_edges':len(boundary),'lower_nonmanifold_edges':len(nonmanifold),
            'boundary_midpoints':[list((e.verts[0].co+e.verts[1].co)*.5) for e in boundary],
            'vertices':len(horse.data.vertices),
            'invalid_weight_vertices':sum(abs(sum(w.weight for w in v.groups)-1)>.001 for v in horse.data.vertices if v.index in used)}
    bm.free();return result


if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--source',type=Path,required=True);p.add_argument('--report',type=Path,required=True)
    a=p.parse_args(sys.argv[sys.argv.index('--')+1:])
    bpy.ops.wm.open_mainfile(filepath=str(a.source.resolve()))
    horse=next(o for o in bpy.data.objects if o.type=='MESH' and o.name.startswith('NeuralWarhorse_'))
    result=audit(horse)
    failures=[]
    if result['lower_nonmanifold_edges']:failures.append('Lower legs/hooves contain open or non-manifold edges')
    if result['invalid_weight_vertices']:failures.append('Horse skin weights are not normalized')
    result.update(source=str(a.source),failures=failures,artistic_quality_proven=False)
    a.report.parent.mkdir(parents=True,exist_ok=True)
    a.report.write_bytes((json.dumps(result,indent=2)+'\n').encode())
    print(json.dumps({k:v for k,v in result.items() if k!='boundary_midpoints'}))
    if failures:raise AssertionError('; '.join(failures))
