"""Verify every pre-existing bone/action and attached art against the frozen assembly."""
import bpy,sys,json,hashlib
from pathlib import Path
ROOT=Path(__file__).resolve().parents[3];RUN=ROOT/'art-factory/rts/runs/original-crossbow-cuff-motion/2026-10-07-v1'
OLD=ROOT/'art-factory/rts/runs/original-crossbow-articulated-hand/2026-10-07-v1/candidate/articulated-connector.blend';NEW=RUN/'candidate/cuff-bands.blend'
sys.path.insert(0,str(Path(__file__).parent))
def snapshot():
    rig=bpy.data.objects['crossbowRig20'];bones={b.name:([list(r) for r in b.matrix_local],b.parent.name if b.parent else None,b.length) for b in rig.data.bones};curves={};art={}
    for action in bpy.data.actions:
        for layer in action.layers:
            for strip in layer.strips:
                for slot in action.slots:
                    bag=strip.channelbag(slot)
                    if bag:
                        for fc in bag.fcurves:curves[(action.name,fc.data_path,fc.array_index)]=[(list(k.co),list(k.handle_left),list(k.handle_right),k.interpolation) for k in fc.keyframe_points]
    for name in ['OriginalCrossbowArticulatedHand_L','OriginalCrossbowClosedGrip_R','CrossbowWeapon_LOD0','CrossbowWeapon_LOD1']:
        o=bpy.data.objects[name];m=o.data;art[name]=([list(v.co) for v in m.vertices],[{o.vertex_groups[g.group].name:g.weight for g in v.groups} for v in m.vertices],[list(p.vertices) for p in m.polygons],[list(l.uv) for l in m.uv_layers.active.data] if m.uv_layers.active else None,[x.name for x in m.materials])
    return bones,curves,art
bpy.ops.wm.open_mainfile(filepath=str(OLD));b,c,a=snapshot();bpy.ops.wm.open_mainfile(filepath=str(NEW));nb,nc,na=snapshot()
assert all(nb[n]==v for n,v in b.items());assert all(nc[k]==v for k,v in c.items());assert a==na
report={'source_sha256':hashlib.sha256(OLD.read_bytes()).hexdigest(),'candidate_sha256':hashlib.sha256(NEW.read_bytes()).hexdigest(),'original_bones_exact':len(b),'original_action_curves_exact':len(c),'original_attached_meshes_exact':list(a),'added_bones':sorted(set(nb)-set(b)),'pass':True,'runtime_publish_allowed':False}
(RUN/'qa/assembly-preservation.json').write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8',newline='\n');print(json.dumps(report))
