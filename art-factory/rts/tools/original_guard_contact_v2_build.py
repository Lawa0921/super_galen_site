"""Original guard swing retime and exact dense export; candidate-only writes."""
from pathlib import Path
import bpy,json,hashlib,sys,math,argparse,numpy as np
from mathutils import Vector
sys.path.insert(0,str(Path(__file__).resolve().parent))
from original_guard_walk_refine import action_fcurves
from original_guard_contact_v2_math import source_frame
from original_guard_contact_v2_bounds import refresh_bounds
from original_guard_assembly_build import setup_camera

parser=argparse.ArgumentParser();parser.add_argument('--source',type=Path,required=True);parser.add_argument('--run',type=Path,required=True);parser.add_argument('--advance',type=float,default=2);parser.add_argument('--skip-render',action='store_true')
args=parser.parse_args(sys.argv[sys.argv.index('--')+1:]);source=args.source.resolve();run=args.run.resolve()
root=Path(__file__).resolve().parents[3]
if not run.is_relative_to(root/'art-factory/rts/runs/original-guard-assembly'):raise ValueError('Candidate must remain inside original guard runs')
(run/'candidate').mkdir(parents=True,exist_ok=True);(run/'qa').mkdir(exist_ok=True)
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
source_sha=sha(source);bpy.ops.wm.open_mainfile(filepath=str(source));rig=bpy.data.objects['GuardRig20'];scene=bpy.context.scene
scene.render.fps=30;scene.render.fps_base=1
if any(p.constraints for p in rig.pose.bones):raise RuntimeError('Bake constraints before using this explicit curve export')
def signature(action):
    rows=[(f.data_path,f.array_index,[(list(k.co),k.interpolation,list(k.handle_left),list(k.handle_right)) for k in f.keyframe_points]) for f in action_fcurves(action)]
    return hashlib.sha256(json.dumps(rows,sort_keys=True).encode()).hexdigest()
protected={a.name:signature(a) for a in bpy.data.actions if a.name!='Attack'}
action=bpy.data.actions['Attack'];curves=list(action_fcurves(action));start,end=map(float,action.frame_range);density=8
frames=[start+i/density for i in range(round((end-start)*density)+1)]
values=[(f,[(t,f.evaluate(source_frame(t,args.advance))) for t in frames]) for f in curves]
for curve,samples in values:
    curve.keyframe_points.clear();curve.keyframe_points.add(len(samples));curve.keyframe_points.foreach_set('co',[v for pair in samples for v in pair])
    for point in curve.keyframe_points:point.interpolation='LINEAR'
    curve.update()
assert protected=={a.name:signature(a) for a in bpy.data.actions if a.name!='Attack'}
rig.animation_data.action=bpy.data.actions['Idle'];scene.frame_set(0);bpy.context.view_layer.update()
blend=run/'candidate/original-guard-assembly.blend';bpy.context.preferences.filepaths.save_version=0;bpy.ops.wm.save_as_mainfile(filepath=str(blend))
meshes=[o for o in bpy.data.objects if o.type=='MESH' and o.name.endswith(('LOD0','LOD1'))]
reference=[]
# Midframes expose the previous Hurt export simplification error. Include attack contact explicitly.
for clip in ['Idle','Walk','Attack','Hurt','Death']:
    act=bpy.data.actions[clip];rig.animation_data.action=act;end=float(act.frame_range[1]);times=sorted(set([0,end*.125,end*.25,end*.375,end*.5,end*.625,end*.75,end*.875,end]+([15.5,16,16.5,17,18] if clip=='Attack' else [])))
    for frame in times:
        scene.frame_set(int(frame),subframe=frame%1);bpy.context.view_layer.update();dep=bpy.context.evaluated_depsgraph_get();row={'clip':clip,'frame':frame,'objects':{},'skin_matrices':{}}
        for bone in rig.pose.bones:row['skin_matrices'][bone.name]=[list(r) for r in (bone.matrix@bone.bone.matrix_local.inverted())]
        for obj in meshes:
            ev=obj.evaluated_get(dep);mesh=ev.to_mesh();coords=np.empty(len(mesh.vertices)*3,dtype=np.float32);mesh.vertices.foreach_get('co',coords);coords=coords.reshape(-1,3)
            matrix=np.array(ev.matrix_world);coords=coords@matrix[:3,:3].T+matrix[:3,3]
            row['objects'][obj.name]={'min':coords.min(axis=0).tolist(),'max':coords.max(axis=0).tolist()};ev.to_mesh_clear()
        reference.append(row)
(run/'qa/blender-pose-extrema.json').write_text(json.dumps(reference,separators=(',',':')))
if not args.skip_render:
    for obj in meshes:obj.hide_render=not obj.name.endswith('LOD0')
    for clip,frame,view,name in [('Attack',16,'threequarter','contact-front'),('Attack',16,'side','contact-side'),('Hurt',7.5,'front','hurt-mid'),('Walk',6,'front','walk')]:
        rig.animation_data.action=bpy.data.actions[clip];scene.frame_set(int(frame),subframe=frame%1);setup_camera(view,Vector((0,0,.92)),run);scene.camera.data.ortho_scale=2.3;scene.render.resolution_x=720;scene.render.resolution_y=800;scene.render.filepath=str(run/'qa'/f'{name}.png');bpy.ops.render.render(write_still=True)
envelope=refresh_bounds(rig,meshes)
(run/'qa/source-envelope.json').write_text(json.dumps(envelope,indent=2)+'\n')
bpy.ops.wm.save_as_mainfile(filepath=str(blend))
# Dense sampling retains source Bézier subframes. Scaling time by a power of two is exact.
for act in bpy.data.actions:
    for f in action_fcurves(act):
        for k in f.keyframe_points:k.co.x*=density;k.handle_left.x*=density;k.handle_right.x*=density
        f.update()
scene.render.fps=30*density;scene.frame_start=0;scene.frame_end=72*density
rig.animation_data.action=bpy.data.actions['Idle'];scene.frame_set(0)
exports=[]
for lod in (0,1):
    bpy.ops.object.select_all(action='DESELECT');selected=[rig]+[o for o in meshes if o.name.endswith('LOD'+str(lod))]
    for o in selected:o.hide_set(False);o.hide_viewport=False;o.hide_render=False;o.select_set(True)
    bpy.context.view_layer.objects.active=rig
    path=run/f'candidate/original-guard-assembly-lod{lod}.glb'
    bpy.ops.export_scene.gltf(filepath=str(path),export_format='GLB',use_selection=True,export_animations=True,export_animation_mode='ACTIONS',export_force_sampling=True,export_frame_step=1,export_optimize_animation_size=False,export_image_format='JPEG',export_jpeg_quality=92,export_skins=True,export_yup=True,export_def_bones=True,export_extras=True)
    exports.append({'lod':lod,'path':str(path),'sha256':sha(path),'bytes':path.stat().st_size})
assert sha(source)==source_sha
report={'status':'candidate_requires_independent_visual_and_contact_review','runtime_publish_allowed':False,'source':{'path':str(source),'sha256':source_sha},'source_unchanged':True,'blend':{'path':str(blend),'sha256':sha(blend)},'exports':exports,'protected_action_signatures':protected,'retime':{'method':'C1 monotone mapping from original authored poses; all attack channels move together','contact_frame':16,'source_contact_frame':source_frame(16,args.advance),'clip_seconds':1.2,'catalog_damage_timing_changed':False,'catalog_range_changed':False},'export_sampling_hz':30*density,'optimization':False}
(run/'qa/build.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps(report))
