"""Locate the actual tiny face in source and round-tripped sculpture."""
import bpy,bmesh,json
from pathlib import Path
RUN=Path(__file__).resolve().parents[3]/'art-factory/rts/runs/original-glove-sculpt/2026-10-06-v1'
rows=[]
for ext in ['blend','glb']:
    if ext=='blend':bpy.ops.wm.open_mainfile(filepath=str(RUN/'candidate/sculpt.blend'))
    else:
        bpy.ops.wm.read_factory_settings(use_empty=True);bpy.ops.import_scene.gltf(filepath=str(RUN/'candidate/sculpt.glb'))
    obj=next(o for o in bpy.context.scene.objects if o.type=='MESH');bm=bmesh.new();bm.from_mesh(obj.data)
    raw_tiny=sum(f.calc_area()<1e-12 for f in bm.faces)
    bmesh.ops.triangulate(bm,faces=list(bm.faces))
    tiny=[{'area':f.calc_area(),'vertices':[list(v.co) for v in f.verts],'edges':[e.calc_length() for e in f.edges]} for f in bm.faces if f.calc_area()<1e-12]
    rows.append({'source':ext,'tiny_before_triangulation':raw_tiny,'tiny_after_triangulation':tiny});bm.free()
(RUN/'qa/degenerate-probe.json').write_text(json.dumps(rows,indent=2)+'\n',encoding='utf-8');print(json.dumps(rows))
