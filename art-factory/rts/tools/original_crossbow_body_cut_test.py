"""Regression: a closed mother must retain a single clean wrist boundary.

Run after body_build --before-cuff. Covers both arms and preserves torso faces.
"""
import bpy,json,sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).parent))
from original_crossbow_wrist_cut_probe import prepare_cut,CUT_REGION_REPORTS,CUTS,OLD
from original_crossbow_wrist_topology_build import ordered_ring
ROOT=Path(__file__).resolve().parents[3]
bpy.ops.wm.open_mainfile(filepath=str(ROOT/'tmp/rts/body-before-cuff.blend'))
body=bpy.data.objects['OriginalCrossbowCanonicalBody'];rig=bpy.data.objects['crossbowRig20'];rows=[]
for side in ('R','L'):
    torso={v.index+1 for v in body.data.vertices if abs(v.co.x)<.18}
    bm,source,_,ring,edges,graph,_,_=prepare_cut(body,rig,side,.130)
    remaining=set(graph);components=[]
    while remaining:
        todo=[next(iter(remaining))];seen=set()
        while todo:
            v=todo.pop()
            if v in seen:continue
            seen.add(v);todo.extend(graph[v]-seen)
        remaining-=seen;components.append({'vertices':len(seen),'bounds':[[min(v.co[i] for v in seen),max(v.co[i] for v in seen)] for i in range(3)]})
    print('CUT_COMPONENTS',side,json.dumps(components))
    assert len(ordered_ring(graph))==len(ring)
    assert set(edges)=={e for e in bm.edges if e.is_boundary},'Unexpected non-cut openings'
    assert all(len(e.link_faces) in (1,2) for e in bm.edges),'Non-manifold edge'
    assert torso<={v[source] for v in bm.verts},'Torso vertices deleted'
    rows.append({'side':side,'ring_vertices':len(ring),'boundary_edges':len(edges),'torso_preserved':True});bm.free()
bpy.ops.wm.open_mainfile(filepath=str(OLD/'candidate/original-crossbow-grip.blend'))
rig=bpy.data.objects['crossbowRig20'];action=bpy.data.actions['Idle'];rig.animation_data.action=action;rig.animation_data.action_slot=action.slots[0];bpy.context.scene.frame_set(0);bpy.context.view_layer.update()
expected={(0,'R'):39,(1,'R'):30,(1,'L'):36}
for (lod,side),distance in CUTS.items():
    body=bpy.data.objects[f'crossbowOriginalBody_LOD{lod}'];bm,_,_,ring,_,graph,_,_=prepare_cut(body,rig,side,distance)
    assert not CUT_REGION_REPORTS[(body.name,side)]['strict_closed_source']
    assert len(ordered_ring(graph))==expected[(lod,side)]
    rows.append({'case':'legacy_split_source','lod':lod,'side':side,'ring_vertices':len(ring)});bm.free()
print('BODY_CUT_TEST',json.dumps({'pass':True,'cases':rows}))
