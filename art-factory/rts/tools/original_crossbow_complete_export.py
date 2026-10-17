"""Derive original glove LODs and export the complete five-clip character."""
import bpy,json,hashlib,struct,ast,sys,argparse
from pathlib import Path
ROOT=Path(__file__).resolve().parents[3]
parser=argparse.ArgumentParser();parser.add_argument('--run',default='art-factory/rts/runs/original-crossbow-complete/2026-10-07-v1')
args=parser.parse_args(sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else [])
RUN=(ROOT/args.run).resolve()
assert RUN.is_relative_to(ROOT/'art-factory/rts/runs'),'Export must remain inside the asset factory'
SOURCE=RUN/'candidate/complete-crossbow.blend'
bpy.ops.wm.open_mainfile(filepath=str(SOURCE));rig=bpy.data.objects['crossbowRig20']
authoring=json.loads((RUN/'qa/authoring.json').read_text())
assert hashlib.sha256(SOURCE.read_bytes()).hexdigest()==authoring['candidate_sha256'],'Stale source hash'
extra=authoring.get('equipment',{}).get('new_objects',[])
assert all(n in bpy.data.objects for n in extra),'Missing original equipment mesh'
action_ranges={a.name:list(a.frame_range) for a in bpy.data.actions if a.name in ('Idle','Walk','Attack','Hurt','Death')}
assert len(action_ranges)==5,'All five character clips are required'
if extra:assert action_ranges['Attack']==[0.,72.],'Full-body Attack must retain all 72 authored frames'
source_fps=bpy.context.scene.render.fps
for name,ratio in [('OriginalCrossbowArticulatedHand_L',.48),('OriginalCrossbowClosedGrip_R',.5)]:
    src=bpy.data.objects[name];obj=src.copy();obj.data=src.data.copy();obj.name=name+'_LOD1';bpy.context.scene.collection.objects.link(obj)
    bpy.ops.object.select_all(action='DESELECT');obj.select_set(True);bpy.context.view_layer.objects.active=obj
    dec=obj.modifiers.new('OriginalGloveDistanceLOD','DECIMATE');dec.ratio=ratio
    bpy.ops.object.modifier_move_up(modifier=dec.name)
    bpy.ops.object.modifier_apply(modifier=dec.name)
    obj.hide_render=True
bpy.context.preferences.filepaths.save_version=0
bpy.ops.wm.save_as_mainfile(filepath=str(RUN/'candidate/complete-crossbow-export.blend'))
curves=[fc for a in bpy.data.actions for layer in a.layers for strip in layer.strips for slot in a.slots for bag in [strip.channelbag(slot)] if bag for fc in bag.fcurves]
for fc in curves:
    for k in fc.keyframe_points:k.co.x*=8;k.handle_left.x*=8;k.handle_right.x*=8
    fc.update()
bpy.context.scene.render.fps*=8
source=Path(__file__).with_name('original_crossbow_hand_export.py')
tree=ast.parse(source.read_text());fn=next(n for n in tree.body if isinstance(n,ast.FunctionDef) and n.name=='promote_identity_skin_roots')
exec(compile(ast.Module(body=[fn],type_ignores=[]),str(source),'exec'))
rows=[]
for lod in [0,1]:
    bpy.ops.object.select_all(action='DESELECT');rig.select_set(True)
    names=[f'crossbowOriginalBody_LOD{lod}',f'CrossbowWeapon_LOD{lod}','OriginalLoadedBolt']+[n+('_LOD1' if lod else '') for n in ['OriginalCrossbowArticulatedHand_L','OriginalCrossbowClosedGrip_R']]+extra
    for n in names:bpy.data.objects[n].select_set(True)
    bpy.context.view_layer.objects.active=rig;output=RUN/f'candidate/original-crossbow-grip-lod{lod}.glb'
    bpy.ops.export_scene.gltf(filepath=str(output),export_format='GLB',use_selection=True,export_animations=True,export_nla_strips=False,export_force_sampling=True,export_optimize_animation_size=False,export_frame_step=1,export_skins=True,export_morph=False,export_materials='EXPORT',export_apply=True,export_yup=True,export_extras=True)
    promote_identity_skin_roots(output)
    rows.append({'lod':lod,'objects':names,'triangles':sum(sum(len(p.vertices)-2 for p in bpy.data.objects[n].data.polygons) for n in names),'bytes':output.stat().st_size,'sha256':hashlib.sha256(output.read_bytes()).hexdigest()})
(RUN/'qa/export.json').write_text(json.dumps({'rows':rows,'source_sha256':hashlib.sha256(SOURCE.read_bytes()).hexdigest(),'source_fps':source_fps,'action_frame_ranges':action_ranges,'runtime_publish_allowed':False},indent=2)+'\n',newline='\n')
print('COMPLETE_EXPORT',json.dumps(rows))
