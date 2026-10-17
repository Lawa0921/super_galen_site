"""Blender asset regression: shaped shield and unchanged character/animation."""
import bpy, bmesh, hashlib, json, sys
from pathlib import Path

ROOT=Path(__file__).resolve().parents[3]
RUN=ROOT/'art-factory/rts/runs/commander-shield/2026-10-14-v1'
SOURCE=ROOT/'art-factory/rts/runs/work-cast/2026-10-11-v2/raw/commander-work-cast.blend'

def protected():
    rows=[]
    for o in sorted(bpy.data.objects,key=lambda o:o.name):
        if o.type=='MESH' and 'Shield' not in o.name:
            rows.append([o.name,[list(v.co) for v in o.data.vertices],
                [[*p.vertices,p.material_index] for p in o.data.polygons],
                [[[g.group,g.weight] for g in v.groups] for v in o.data.vertices],
                [[list(v.uv) for v in uv.data] for uv in o.data.uv_layers],
                [m.name for m in o.data.materials],[list(r) for r in o.matrix_world]])
        if o.type=='ARMATURE':
            rows.append([o.name,[[b.name,b.parent.name if b.parent else None,[list(r) for r in b.matrix_local]] for b in o.data.bones]])
    for a in sorted(bpy.data.actions,key=lambda a:a.name):
        rows.append([a.name,[[c.data_path,c.array_index,[[*p.co,*p.handle_left,*p.handle_right,p.interpolation] for p in c.keyframe_points]] for layer in a.layers for strip in layer.strips for slot in a.slots for bag in [strip.channelbag(slot)] if bag for c in bag.fcurves]])
    return hashlib.sha256(json.dumps(rows,sort_keys=True).encode()).hexdigest()

def geometry(o):
    verts=[v.co for v in o.data.vertices];zmin=min(v.z for v in verts);zmax=max(v.z for v in verts)
    width=max(v.x for v in verts)-min(v.x for v in verts)
    lower=[v for v in verts if v.z<zmin+(zmax-zmin)*.18]
    ratio=(max(v.x for v in lower)-min(v.x for v in lower))/width
    assert ratio<.62, f'{o.name}: lower shield remains rectangular ({ratio:.3f})'
    bm=bmesh.new();bm.from_mesh(o.data)
    report=dict(vertices=len(verts),triangles=sum(len(p.vertices)-2 for p in o.data.polygons),
        taper_ratio=ratio,nonmanifold_edges=sum(not e.is_manifold for e in bm.edges),zero_area_faces=sum(f.calc_area()<1e-12 for f in bm.faces),
        bounds=[[min(v[i] for v in verts),max(v[i] for v in verts)] for i in range(3)])
    bm.free()
    assert report['nonmanifold_edges']==0 and report['zero_area_faces']==0,report
    assert report['triangles']<3500,report
    assert [g.name for g in o.vertex_groups]==['Hand_L']
    assert all(len(v.groups)==1 and abs(v.groups[0].weight-1)<1e-7 for v in o.data.vertices)
    assert len(o.data.uv_layers)==1
    assert all(report['bounds'][i][0]>=lo-.001 and report['bounds'][i][1]<=hi+.001 for i,(lo,hi) in enumerate([(-.624,-.184),(.202,.331),(.744,1.406)])),report
    required={'bowed_shield','formed_steel_rim','brass_inlay','dawn_boss'}
    assert required.issubset(json.loads(o['original_weapon_parts']))
    return report

def main():
    target=Path(sys.argv[sys.argv.index('--')+1]) if '--' in sys.argv else RUN/'raw/commander-shield.blend'
    bpy.ops.wm.open_mainfile(filepath=str(SOURCE));before=protected()
    bpy.ops.wm.open_mainfile(filepath=str(target));assert protected()==before,'Protected body/weapon/rig/actions changed'
    rows={str(lod):geometry(bpy.data.objects[f'CommanderDawnShield_LOD{lod}']) for lod in (0,1)}
    assert rows['1']['triangles']<rows['0']['triangles']
    report=dict(status='passed',protected_sha256=before,clips=sorted(a.name for a in bpy.data.actions),geometry=rows)
    (RUN/'qa/model-check.json').write_text(json.dumps(report,indent=2)+'\n')
    print('SHIELD_CHECK_PASS',json.dumps(report))

if __name__=='__main__':main()
