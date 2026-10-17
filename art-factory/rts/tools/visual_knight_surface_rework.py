"""Repair the existing generated horse surface in a separate candidate run.

Keeps the original UV/source textures, bone transforms and motion clips. The
existing source is retained; this does not create replacement primitive legs.
"""
import argparse
import hashlib
import json
import sys
from pathlib import Path
import bpy
import bmesh
from mathutils.kdtree import KDTree

sys.path.insert(0,str(Path(__file__).parent))
from visual_knight_surface_test import audit

ROOT=Path(__file__).resolve().parents[3]
BASE=ROOT/'art-factory/rts/runs/all-models/2026-10-15-knight-mouth/raw'


def repair(horse):
    before=audit(horse)
    bm=bmesh.new();bm.from_mesh(horse.data)
    upper={tuple(v.co) for v in bm.verts if v.co.z>.76 and v.link_faces}
    region=[v for v in bm.verts if v.co.z<.74]
    bmesh.ops.remove_doubles(bm,verts=region,dist=.003)
    bmesh.ops.dissolve_degenerate(bm,edges=[e for e in bm.edges if max(v.co.z for v in e.verts)<.74],dist=.00001)
    # Follow complete boundary loops. Truncating a loop at a height plane left
    # open seams where the generated lower leg meets its upper surface.
    pending={e for e in bm.edges if e.is_boundary};boundary=[]
    while pending:
        edge=pending.pop();component={edge};stack=[edge]
        while stack:
            edge=stack.pop()
            adjacent={other for v in edge.verts for other in v.link_edges if other in pending}
            pending.difference_update(adjacent);component.update(adjacent);stack.extend(adjacent)
        if any(min(v.co.z for v in e.verts)<.68 for e in component):boundary.extend(component)
    oldfaces=set(bm.faces)
    filled=bmesh.ops.holes_fill(bm,edges=boundary,sides=0)['faces']
    # Transfer boundary-loop UVs from original neighbouring faces. UV splits
    # remain per-loop; merging coincident vertices does not merge their UVs.
    uv=bm.loops.layers.uv.active
    for face in filled:
        if uv:
            for loop in face.loops:
                neighbours=[q for q in loop.vert.link_loops if q.face in oldfaces]
                if neighbours:
                    closest=min(neighbours,key=lambda q:(q.face.calc_center_median()-face.calc_center_median()).length)
                    loop[uv].uv=closest[uv].uv.copy();face.material_index=closest.face.material_index
    bmesh.ops.triangulate(bm,faces=filled)
    # Some source seams already overlap. Do not retain an added patch over
    # two existing surface faces at the same edge.
    for edge in list(bm.edges):
        if not edge.is_valid:continue
        if len(edge.link_faces)>2:
            extra=[f for f in edge.link_faces if f not in oldfaces]
            for face in extra[:len(edge.link_faces)-2]:
                if face.is_valid:bmesh.ops.delete(bm,geom=[face],context='FACES_ONLY')
    bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces))
    bmesh.ops.delete(bm,geom=[v for v in bm.verts if not v.link_faces],context='VERTS')
    assert upper <= {tuple(v.co) for v in bm.verts},'Upper source geometry moved'
    bm.to_mesh(horse.data);bm.free()
    # A small set of source vertices had no valid deform weight. Restore from
    # the closest existing weighted surface vertex, then normalize every sum.
    valid=[v for v in horse.data.vertices if sum(w.weight for w in v.groups)>.0001]
    tree=KDTree(len(valid))
    for i,v in enumerate(valid):tree.insert(v.co,i)
    tree.balance();restored=0
    for v in horse.data.vertices:
        values={w.group:w.weight for w in v.groups if w.weight>0}
        total=sum(values.values())
        if total<.0001:
            _,index,distance=tree.find(v.co)
            assert distance<.04,('Unweighted source vertex too far from weighted surface',v.index,distance)
            values={w.group:w.weight for w in valid[index].groups if w.weight>0};total=sum(values.values());restored+=1
        for group,weight in values.items():horse.vertex_groups[group].add([v.index],weight/total,'REPLACE')
    horse.data.update()
    return {'before':before,'after':audit(horse),'filled_faces':len(filled),'restored_unweighted_vertices':restored,
            'upper_geometry_unchanged':True,'source_uvs_preserved':True}


def main():
    p=argparse.ArgumentParser();p.add_argument('--run',type=Path,required=True);p.add_argument('--lod',type=int,choices=(0,1),required=True)
    a=p.parse_args(sys.argv[sys.argv.index('--')+1:]);run=a.run.resolve();lod=a.lod
    for folder in ('raw','candidate','qa'):(run/folder).mkdir(parents=True,exist_ok=True)
    source=BASE/f'knight-lod{lod}.blend'
    bpy.ops.wm.open_mainfile(filepath=str(source))
    horse=bpy.data.objects[f'NeuralWarhorse_LOD{lod}']
    report=repair(horse)
    report.update(source=str(source.relative_to(ROOT)),source_sha256=hashlib.sha256(source.read_bytes()).hexdigest(),
                  status='candidate_requires_visual_review',runtime_publish_allowed=False,artistic_quality_proven=False)
    (run/f'qa/surface-lod{lod}.json').write_bytes((json.dumps(report,indent=2)+'\n').encode())
    bpy.context.preferences.filepaths.save_version=0
    bpy.ops.wm.save_as_mainfile(filepath=str(run/f'raw/knight-lod{lod}.blend'))
    print(json.dumps({k:v for k,v in report.items() if k not in ('before','after')}))


if __name__=='__main__':main()
