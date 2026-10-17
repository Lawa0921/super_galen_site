"""Geometry acceptance for the actual sculpt artifact, including wrist intent."""
import bpy,bmesh,json,sys,hashlib
from pathlib import Path
ROOT=Path(__file__).resolve().parents[3]
RUN=ROOT/'art-factory/rts/runs/original-glove-sculpt/2026-10-06-v1'
baseline='--baseline' in sys.argv
source=ROOT/'art-factory/rts/runs/original-glove-shape/2026-10-06-v1/candidate/candidate.glb' if baseline else RUN/'candidate/sculpt.glb'
bpy.ops.wm.read_factory_settings(use_empty=True);bpy.ops.import_scene.gltf(filepath=str(source))
objects=[o for o in bpy.context.scene.objects if o.type=='MESH'];assert len(objects)==1
bm=bmesh.new();bm.from_mesh(objects[0].data);bm.verts.ensure_lookup_table()
boundary=[e for e in bm.edges if e.is_boundary];graph={}
for edge in boundary:
    a,b=(v.index for v in edge.verts);graph.setdefault(a,set()).add(b);graph.setdefault(b,set()).add(a)
components=0;unseen=set(graph)
while unseen:
    components+=1;stack=[next(iter(unseen))]
    while stack:
        v=stack.pop()
        if v not in unseen:continue
        unseen.remove(v);stack.extend(graph[v])
tiny=sum(f.calc_area()<1e-12 for f in bm.faces)
plane_error=None
if not baseline and graph:
    from mathutils import Vector
    authored=json.loads((RUN/'qa/authoring.json').read_text(encoding='utf-8'))['wrist']
    axis=Vector(authored['axis']);origin=Vector(authored['origin'])
    plane_error=max(abs((objects[0].matrix_world@bm.verts[i].co-origin).dot(axis)-authored['cut_axis_distance']) for i in graph)
tests={
 'no_near_zero_area_faces':tiny==0,
 'one_intentional_wrist_loop':components==1 and bool(graph) and all(len(v)==2 for v in graph.values()),
 'no_other_nonmanifold_edges':all(e.is_manifold or e.is_boundary for e in bm.edges),
 'wrist_loop_is_planar':plane_error is not None and plane_error<1e-6,
}
report={'source_sha256':hashlib.sha256(source.read_bytes()).hexdigest(),'baseline':baseline,'near_zero_area_faces':tiny,'boundary_edges':len(boundary),'boundary_components':components,'wrist_plane_error':plane_error,'tests':tests,'pass':all(tests.values()),'runtime_publish_allowed':False}
(RUN/'qa').mkdir(parents=True,exist_ok=True);(RUN/'qa'/('baseline.json' if baseline else 'geometry.json')).write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8');print(json.dumps(report));bm.free();assert report['pass'],tests
