"""Preserve accepted original palm/CMC; expose four separated finger ports."""
import bpy,bmesh,json,hashlib
from pathlib import Path
ROOT=Path(__file__).resolve().parents[3]
RUN=ROOT/'art-factory/rts/runs/original-glove-joints/2026-10-07-v1'
SOURCE=ROOT/'art-factory/rts/runs/original-glove-retopo/2026-10-07-v1/candidate/quad-base.blend'
EXPECTED='5bce5971e1482eadc9a81d5ed82f251007873221d40708cbeedcc30bc805d7e9'
assert hashlib.sha256(SOURCE.read_bytes()).hexdigest()==EXPECTED
for folder in ['raw','candidate','qa','prompts']:(RUN/folder).mkdir(parents=True,exist_ok=True)
bpy.ops.wm.open_mainfile(filepath=str(SOURCE));obj=[o for o in bpy.context.scene.objects if o.type=='MESH'][0]
bm=bmesh.new();bm.from_mesh(obj.data);bm.verts.ensure_lookup_table()
original=[list(v.co) for v in bm.verts];tag=bm.verts.layers.int.new('OriginalVertex')
for v in bm.verts:v[tag]=v.index+1
heights={'Index':.345,'Middle':.345,'Ring':.285,'Little':.285}
# Actual cut probe shows the Index/Middle web remains joined through .330.
# Keep its original saddle; Ring/Little separate earlier and retain room for
# the Little PIP support ring. Never move a joint merely to fit one cut plane.
for height,positive_x in [(.345,True),(.285,False)]:
    existing=set(bm.verts)
    bmesh.ops.bisect_plane(bm,geom=list(bm.verts)+list(bm.edges)+list(bm.faces),dist=1e-7,plane_co=(0,0,height),plane_no=(0,0,1),clear_inner=False,clear_outer=False)
    for v in bm.verts:
        if v not in existing:v[tag]=0
    removed=[f for f in bm.faces if f.calc_center_median().z>height+1e-6 and f.calc_center_median().y>-.03 and (f.calc_center_median().x>-.07)==positive_x]
    bmesh.ops.delete(bm,geom=removed,context='FACES')
loose=[v for v in bm.verts if not v.link_faces]
if loose:bmesh.ops.delete(bm,geom=loose,context='VERTS')
bm.verts.index_update();bm.verts.ensure_lookup_table()
unseen={v for v in bm.verts if v.is_boundary};loops=[]
while unseen:
    first=next(iter(unseen));current=first;previous=None;ordered=[]
    while True:
        assert current in unseen,'Boundary repeats before completing cycle'
        unseen.remove(current);ordered.append(current.index)
        neighbors=[e.other_vert(current) for e in current.link_edges if e.is_boundary]
        assert len(neighbors)==2,'Boundary is not a cycle'
        nxt=neighbors[0] if neighbors[0] is not previous else neighbors[1]
        previous,current=current,nxt
        if current==first:break
    loops.append(ordered)
ports=[loop for loop in loops if any(max(abs(bm.verts[i].co.z-height) for i in loop)<1e-5 for height in set(heights.values()))]
assert len(loops)==5 and len(ports)==4,(len(loops),len(ports))
ports.sort(key=lambda loop:sum(bm.verts[i].co.x for i in loop)/len(loop),reverse=True)
preserved=[{'source_vertex':v[tag]-1,'candidate_vertex':v.index} for v in bm.verts if v[tag]>0]
required={i for i,p in enumerate(original) if p[2]<=(.345 if p[0]>-.07 else .285) or p[1]<-.03}
assert required<={r['source_vertex'] for r in preserved}
assert all(list(bm.verts[r['candidate_vertex']].co)==original[r['source_vertex']] for r in preserved)
data={'source_sha256':EXPECTED,'cut_heights':heights,'vertices':[list(v.co) for v in bm.verts],'faces':[[v.index for v in f.verts] for f in bm.faces],'ports':dict(zip(['Index','Middle','Ring','Little'],ports)),'preserved_vertices':preserved,'protected_source_vertices':len(required),'coordinate_contract':'Unscaled original Blender coordinates, +Z fingers, -Y palm.','runtime_publish_allowed':False}
(RUN/'raw/palm-with-ports.json').write_text(json.dumps(data,indent=2)+'\n',encoding='utf-8')
print(json.dumps({'vertices':len(bm.verts),'faces':len(bm.faces),'ports':{name:len(loop) for name,loop in data['ports'].items()},'protected_vertices':len(required),'preserved_vertices':len(preserved)}))
bm.free()
