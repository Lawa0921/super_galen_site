"""Detect genuine torso/leg tears, allowing the intentional wrist trim only."""
import argparse,json,sys
from pathlib import Path
import bpy,bmesh
from mathutils import Vector


def audit(body,rig):
    bm=bmesh.new();bm.from_mesh(body.data);bmesh.ops.remove_doubles(bm,verts=list(bm.verts),dist=1e-6)
    wrists=[rig.data.bones['Hand_'+side].head_local for side in 'LR']
    cuts=json.loads(body.get('intentional_cuff_planes','[]'))
    broken=[]
    for edge in bm.edges:
        midpoint=(edge.verts[0].co+edge.verts[1].co)/2
        # Explicit cuts must lie on the recorded plane, not anywhere inside
        # an arbitrary sphere around an often offset hand-bone head.
        allowed=any(abs((midpoint-Vector(c['cut_center'])).dot(Vector(c['plane_normal'])))<1e-4 and (midpoint-Vector(c['cut_center'])).length<c['radius'] for c in cuts) if cuts else min((midpoint-w).length for w in wrists)<=.16
        if not edge.is_manifold and not allowed:broken.append(list(midpoint))
    used={i for p in body.data.polygons for i in p.vertices}
    result={'object':body.name,'vertices':len(body.data.vertices),'triangles':sum(len(p.vertices)-2 for p in body.data.polygons),
            'nonmanifold_edges_away_from_wrists':len(broken),'sample_bad_edge_midpoints':broken[:20],
            'invalid_weight_vertices':sum(abs(sum(w.weight for w in v.groups)-1)>.001 for v in body.data.vertices if v.index in used)}
    bm.free();return result


if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--source',type=Path,required=True);p.add_argument('--report',type=Path,required=True)
    p.add_argument('--object')
    a=p.parse_args(sys.argv[sys.argv.index('--')+1:]);bpy.ops.wm.open_mainfile(filepath=str(a.source.resolve()))
    body=bpy.data.objects[a.object] if a.object else next(o for o in bpy.data.objects if o.name.startswith('MountedKnightBody_'));rig=next(m.object for m in body.modifiers if m.type=='ARMATURE')
    report=audit(body,rig);failures=[]
    if report['nonmanifold_edges_away_from_wrists']:failures.append('Rider body has open or nonmanifold torso/leg surfaces')
    if report['invalid_weight_vertices']:failures.append('Rider weights not normalized')
    report.update(source=str(a.source),failures=failures,artistic_quality_proven=False)
    a.report.parent.mkdir(parents=True,exist_ok=True);a.report.write_bytes((json.dumps(report,indent=2)+'\n').encode());print(json.dumps(report))
    if failures:raise AssertionError('; '.join(failures))
