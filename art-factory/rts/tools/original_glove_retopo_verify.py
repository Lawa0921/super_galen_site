"""Read actual source and evaluated surfaces; do not equate topology with art."""
import bpy,bmesh,json,hashlib,sys
from pathlib import Path
from mathutils.bvhtree import BVHTree
sys.path.insert(0,str(Path(__file__).parent))
from original_glove_deformation import evaluated,crossings
ROOT=Path(__file__).resolve().parents[3];RUN=ROOT/'art-factory/rts/runs/original-glove-retopo/2026-10-07-v1'
source=RUN/'candidate/original-retopo-l.blend';bpy.ops.wm.open_mainfile(filepath=str(source))
obj=bpy.data.objects['OriginalRetopoGlove_L_LOD0'];rig=bpy.data.objects['OriginalHandRig_L']
bm=bmesh.new();bm.from_mesh(obj.data);bm.verts.ensure_lookup_table()
boundary=[e for e in bm.edges if e.is_boundary];graph={}
for edge in boundary:
    a,b=(v.index for v in edge.verts);graph.setdefault(a,set()).add(b);graph.setdefault(b,set()).add(a)
def components(graph):
    unseen=set(graph);count=0
    while unseen:
        count+=1;stack=[next(iter(unseen))]
        while stack:
            vertex=stack.pop()
            if vertex not in unseen:continue
            unseen.remove(vertex);stack.extend(graph[vertex])
    return count
full={v.index:{n.other_vert(v).index for n in v.link_edges} for v in bm.verts}
tests={'single_surface_component':components(full)==1,'one_intentional_wrist_boundary':components(graph)==1 and len(graph)==40 and all(len(v)==2 for v in graph.values()),'no_other_nonmanifold_edges':all(e.is_boundary or e.is_manifold for e in bm.edges),'no_near_zero_faces':all(f.calc_area()>1e-12 for f in bm.faces),'triangle_budget':sum(len(f.verts)-2 for f in bm.faces)<=4000,'sixteen_original_bones':len(rig.data.bones)==16,'normalized_weights':all(abs(sum(g.weight for g in v.groups)-1)<1e-6 for v in obj.data.vertices)}
bm.free();rows=[]
for frame in [0,9,18,24,33,42,48]:
    bpy.context.scene.frame_set(frame);bpy.context.view_layer.update();points,tris=evaluated(obj)
    bvh=BVHTree.FromPolygons(points,tris,all_triangles=True);bad=[];regions={}
    for a,b in bvh.overlap(bvh):
        if a>=b or len(set(tris[a])&set(tris[b]))>=2:continue
        if crossings([points[i] for i in tris[a]],[points[i] for i in tris[b]]):
            bad.append([a,b]);names=[]
            for tri in [tris[a],tris[b]]:
                skin={}
                for index in tri:
                    for group in obj.data.vertices[index].groups:
                        name=obj.vertex_groups[group.group].name;skin[name]=skin.get(name,0)+group.weight
                names.append(max(skin,key=skin.get))
            key='/'.join(sorted(names));regions[key]=regions.get(key,0)+1
    rows.append({'frame':frame,'noncoplanar_crossings':len(bad),'regions':regions,'first_triangle_pairs':bad[:20]})
report={'source_sha256':hashlib.sha256(source.read_bytes()).hexdigest(),'geometry_tests':tests,'geometry_pass':all(tests.values()),'motion_rows':rows,'sampled_motion_pass':all(r['noncoplanar_crossings']==0 for r in rows),'scope':'Actual Blender mesh geometry and seven evaluated animation poses. Noncoplanar triangle crossings exclude shared edges. Not exhaustive or a visual/art approval.','runtime_publish_allowed':False}
(RUN/'qa/geometry-motion.json').write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8');print(json.dumps(report));assert report['geometry_pass'] and report['sampled_motion_pass']
