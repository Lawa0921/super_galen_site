"""Compare retained source body/UV and non-Attack motion to the actual candidate."""
import bpy,json,hashlib
from pathlib import Path
ROOT=Path(__file__).resolve().parents[3];RUN=ROOT/'art-factory/rts/runs/original-crossbow-complete/2026-10-07-v1'
SOURCE=ROOT/'art-factory/rts/runs/original-crossbow-cuff-motion/2026-10-07-v1/candidate/cuff-bands.blend'
def capture(path):
    bpy.ops.wm.open_mainfile(filepath=str(path));result={}
    for lod in [0,1]:
        obj=bpy.data.objects[f'crossbowOriginalBody_LOD{lod}'];mesh=obj.data;ids=[v.value for v in mesh.attributes['ArticulatedSourceVertex'].data]
        vertices={ids[v.index]:[list(v.co),sorted((obj.vertex_groups[g.group].name,g.weight) for g in v.groups)] for v in mesh.vertices if ids[v.index]>0}
        faces=[]
        for p in mesh.polygons:
            if not all(ids[v]>0 for v in p.vertices):continue
            row=[(ids[mesh.loops[i].vertex_index],list(mesh.uv_layers.active.data[i].uv)) for i in p.loop_indices]
            start=min(range(len(row)),key=lambda i:row[i][0]);faces.append([p.material_index,row[start:]+row[:start]])
        result[lod]={'vertices':vertices,'faces':sorted(faces,key=str)}
    actions={}
    for a in bpy.data.actions:
        if a.name=='Attack':continue
        curves=[]
        for layer in a.layers:
            for strip in layer.strips:
                for slot in a.slots:
                    bag=strip.channelbag(slot)
                    if not bag:continue
                    for fc in bag.fcurves:
                        if 'BowString' in fc.data_path or 'LoadedBolt' in fc.data_path:continue
                        curves.append([fc.data_path,fc.array_index,[[list(k.co),k.interpolation] for k in fc.keyframe_points]])
        actions[a.name]=sorted(curves,key=str)
    result['actions']=actions;return result
before=capture(SOURCE);after=capture(RUN/'candidate/complete-crossbow.blend')
rows=[]
for lod in [0,1]:
    row={'lod':lod,'retained_vertices':len(before[lod]['vertices']),'retained_faces':len(before[lod]['faces']),'positions_weights_equal':before[lod]['vertices']==after[lod]['vertices'],'uv_faces_equal':before[lod]['faces']==after[lod]['faces']}
    rows.append(row)
report={'rows':rows,'non_attack_curves_equal':before['actions']==after['actions'],'runtime_publish_allowed':False}
(RUN/'qa/preservation.json').write_text(json.dumps(report,indent=2)+'\n');print('PRESERVATION',json.dumps(report))
assert report['non_attack_curves_equal'] and all(r['positions_weights_equal'] and r['uv_faces_equal'] for r in rows)
