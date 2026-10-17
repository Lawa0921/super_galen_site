"""Author original continuous gloves, fifteen finger joints and keyed articulation."""
import bpy,bmesh,hashlib,json,math,sys
from pathlib import Path
from mathutils import Matrix,Vector,Quaternion
sys.path.insert(0,str(Path(__file__).parent))
from original_glove_geometry import cage,smooth
ROOT=Path(__file__).resolve().parents[3];RUN=ROOT/'art-factory/rts/runs/original-articulated-glove/2026-10-06-v1'
LEATHER=ROOT/'art-factory/rts/runs/original-guard-surface-materials/2026-10-05/candidate/leather-512.png'

def material():
    mat=bpy.data.materials.new('OriginalKingdomSuppleLeather');mat.use_nodes=True
    bsdf=mat.node_tree.nodes.get('Principled BSDF');bsdf.inputs['Roughness'].default_value=.72
    image=bpy.data.images.load(str(LEATHER));image.pack();texture=mat.node_tree.nodes.new('ShaderNodeTexImage');texture.image=image;texture.extension='REPEAT'
    mat.node_tree.links.new(texture.outputs['Color'],bsdf.inputs['Base Color']);return mat

def make_rig(data,side):
    sign=1 if side=='R' else -1;arm=bpy.data.armatures.new('OriginalFingerArmature_'+side);rig=bpy.data.objects.new('OriginalHandRig_'+side,arm);bpy.context.collection.objects.link(rig)
    bpy.context.view_layer.objects.active=rig;rig.select_set(True);bpy.ops.object.mode_set(mode='EDIT')
    for record in data['bones']:
        bone=arm.edit_bones.new(record['name']+'_'+side);bone.head=(sign*record['head'][0],*record['head'][1:]);bone.tail=(sign*record['tail'][0],*record['tail'][1:])
        if record['parent']:bone.parent=arm.edit_bones[record['parent']+'_'+side]
    bpy.ops.object.mode_set(mode='OBJECT');return rig

def make_mesh(data,rig,mat,side,lod):
    sign=1 if side=='R' else -1;mesh=bpy.data.meshes.new('OriginalFiveDigitCage');mesh.from_pydata([(sign*x,y,z) for x,y,z in data['vertices']],[],data['faces']);mesh.update()
    obj=bpy.data.objects.new(f'OriginalArticulatedGlove_{side}_LOD{lod}',mesh);bpy.context.collection.objects.link(obj);obj.data.materials.append(mat)
    for name in [b['name'] for b in data['bones']]:obj.vertex_groups.new(name=name+'_'+side)
    for i,weights in enumerate(data['weights']):
        for name,weight in weights.items():obj.vertex_groups[name+'_'+side].add([i],weight,'REPLACE')
    bm=bmesh.new();bm.from_mesh(mesh);bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));bm.to_mesh(mesh);bm.free()
    bpy.ops.object.select_all(action='DESELECT');obj.select_set(True);bpy.context.view_layer.objects.active=obj
    mod=obj.modifiers.new('AuthoredSurfaceSubdivision','SUBSURF');mod.levels=1;mod.subdivision_type='CATMULL_CLARK';bpy.ops.object.modifier_apply(modifier=mod.name)
    if lod==1:
        # Reduce the smooth rest surface rather than reverting to a six-sided
        # cage whose palm-side PIP edges invert in the same finger pose.
        mod=obj.modifiers.new('PreserveRoundedJointSurface','DECIMATE');mod.ratio=.60;bpy.ops.object.modifier_apply(modifier=mod.name)
    mesh=obj.data;uv=mesh.uv_layers.new(name='OriginalLeatherTileUV')
    for p in mesh.polygons:
        p.use_smooth=True;axis=max(range(3),key=lambda i:abs(p.normal[i]));axes=[i for i in range(3) if i!=axis]
        for li in p.loop_indices:
            co=mesh.vertices[mesh.loops[li].vertex_index].co;uv.data[li].uv=(co[axes[0]]*12,co[axes[1]]*12)
    obj.parent=rig;modifier=obj.modifiers.new('OriginalFingerSkin','ARMATURE');modifier.object=rig
    obj['authorship']='Original continuous palm and five digit cage; original fifteen-joint hand motion; project-generated leather'
    obj['uv_contract']='Intentional repeating material UV; overlap and wrapping permitted for the original tile, not a painted atlas.'
    return obj

def pose_matrices(rig,side,amount):
    sign=1 if side=='R' else -1;matrices={};hand='Hand_'+side;matrices[hand]=rig.data.bones[hand].matrix_local.copy()
    curls={'Index':(58,84,42),'Middle':(62,86,43),'Ring':(64,85,42),'Little':(66,83,40)}
    for name,angles in curls.items():
        rotation=0;head=rig.data.bones[name+'1_'+side].head_local.copy()
        for index,angle in enumerate(angles,1):
            key=f'{name}{index}_{side}';bone=rig.data.bones[key];rotation+=math.radians(angle)*amount
            q=Quaternion((1,0,0),rotation)@bone.matrix_local.to_quaternion();matrices[key]=Matrix.LocRotScale(head,q,Vector((1,1,1)));head+=q@Vector((0,bone.length,0))
    thumb_head=rig.data.bones['Thumb1_'+side].head_local.copy()
    for index,target in [(1,Vector((sign*-.028,-.043,.038))),(2,Vector((sign*-.047,-.066,.065))),(3,Vector((sign*-.023,-.060,.053)))]:
        key=f'Thumb{index}_{side}';bone=rig.data.bones[key];rest_direction=(bone.tail_local-bone.head_local).normalized()
        # Separate metacarpal opposition from MCP and IP flexion. A single
        # 81-degree root turn folded the connected palm/thenar bridge.
        wanted=(target-thumb_head).normalized();direction=rest_direction.lerp(wanted,amount*(.5 if index==1 else 1)).normalized()
        q=rest_direction.rotation_difference(direction)@bone.matrix_local.to_quaternion();matrices[key]=Matrix.LocRotScale(thumb_head,q,Vector((1,1,1)));thumb_head+=direction*bone.length
    return matrices

def apply(rig,matrices):
    for bone in rig.pose.bones:
        kwargs={'parent_matrix':matrices[bone.parent.name],'parent_matrix_local':bone.parent.bone.matrix_local} if bone.parent else {}
        local=bone.bone.convert_local_to_pose(matrices[bone.name],bone.bone.matrix_local,invert=True,**kwargs)
        bone.rotation_mode='QUATERNION';bone.location,bone.rotation_quaternion,bone.scale=local.decompose()

def animate(rig,side):
    action=bpy.data.actions.new('OpenClose');rig.animation_data_create();rig.animation_data.action=action;previous={}
    for sample in range(193):
        frame=sample/4;t=smooth(frame/18) if frame<18 else 1 if frame<=24 else 1-smooth((frame-24)/18) if frame<42 else 0
        apply(rig,pose_matrices(rig,side,t))
        for pb in rig.pose.bones:
            if pb.name in previous:pb.rotation_quaternion.make_compatible(previous[pb.name])
            previous[pb.name]=pb.rotation_quaternion.copy()
            for key in ('location','rotation_quaternion','scale'):pb.keyframe_insert(data_path=key,frame=frame,group=pb.name)
    for layer in action.layers:
        for strip in layer.strips:
            for slot in action.slots:
                bag=strip.channelbag(slot)
                if bag:
                    for curve in bag.fcurves:
                        for key in curve.keyframe_points:key.interpolation='LINEAR'
    bpy.context.scene.frame_set(0);bpy.context.view_layer.update();return action

def render(rig,objects,side):
    scene=bpy.context.scene;scene.render.engine='BLENDER_EEVEE';scene.eevee.taa_render_samples=48;scene.render.resolution_x=760;scene.render.resolution_y=860;scene.render.resolution_percentage=100;scene.render.image_settings.file_format='PNG';scene.render.film_transparent=False
    world=bpy.data.worlds.new('GloveReviewWorld');world.use_nodes=True;world.node_tree.nodes['Background'].inputs[0].default_value=(.09,.13,.11,1);world.node_tree.nodes['Background'].inputs[1].default_value=.5;scene.world=world
    for name,loc,power,size in [('Key',(-.16,-.24,.28),1.8,.22),('Fill',(.22,-.05,.18),.8,.16),('Rim',(.04,.20,.20),1.2,.20)]:
        data=bpy.data.lights.new(name,'AREA');data.energy=power;data.shape='DISK';data.size=size;obj=bpy.data.objects.new(name,data);scene.collection.objects.link(obj);obj.location=loc;obj.rotation_euler=(Vector((0,0,.075))-obj.location).to_track_quat('-Z','Y').to_euler()
    cam=bpy.data.objects.new('GloveReviewCamera',bpy.data.cameras.new('GloveReviewCamera'));scene.collection.objects.link(cam);scene.camera=cam;cam.data.type='ORTHO';cam.data.ortho_scale=.245
    for obj in objects:obj.hide_render=not obj.name.endswith('LOD0')
    for frame,name in [(0,'open'),(9,'half'),(18,'grip')]:
        scene.frame_set(frame);bpy.context.view_layer.update()
        for view,loc in [('palm',(0,-.38,.09)),('back',(0,.38,.09)),('threequarter',(.24,-.32,.23))]:
            cam.location=loc;cam.rotation_euler=(Vector((0,0,.070))-cam.location).to_track_quat('-Z','Y').to_euler();scene.render.filepath=str(RUN/f'qa/{side}-{name}-{view}.png');bpy.ops.render.render(write_still=True)

def export(rig,objects,side):
    scene=bpy.context.scene;fps=scene.render.fps
    keys=[k for a in bpy.data.actions for layer in a.layers for strip in layer.strips for slot in a.slots for bag in [strip.channelbag(slot)] if bag for curve in bag.fcurves for k in curve.keyframe_points]
    try:
        for key in keys:key.co.x*=4;key.handle_left.x*=4;key.handle_right.x*=4
        scene.render.fps=fps*4
        for obj in objects:
            bpy.ops.object.select_all(action='DESELECT');rig.select_set(True);obj.select_set(True);bpy.context.view_layer.objects.active=rig
            bpy.ops.export_scene.gltf(filepath=str(RUN/f'candidate/glove-{side.lower()}-lod{obj.name[-1]}.glb'),export_format='GLB',use_selection=True,export_animations=True,export_force_sampling=True,export_optimize_animation_size=False,export_skins=True,export_morph=False,export_materials='EXPORT',export_apply=True,export_yup=True)
    finally:
        for key in keys:key.co.x/=4;key.handle_left.x/=4;key.handle_right.x/=4
        scene.render.fps=fps

def main():
    for name in ['raw','candidate','qa','prompts']:(RUN/name).mkdir(parents=True,exist_ok=True)
    data=cage();(RUN/'raw/original-connected-cage.json').write_text(json.dumps(data,indent=2)+'\n')
    records=[]
    for side in ['R','L']:
        bpy.ops.wm.read_factory_settings(use_empty=True);scene=bpy.context.scene;scene.render.fps=24;scene.frame_start=0;scene.frame_end=48
        rig=make_rig(data,side);mat=material();objects=[make_mesh(data,rig,mat,side,lod) for lod in [0,1]];animate(rig,side)
        bpy.ops.wm.save_as_mainfile(filepath=str(RUN/f'candidate/original-glove-{side.lower()}.blend'));export(rig,objects,side)
        records.extend({'side':side,'object':o.name,'vertices':len(o.data.vertices),'triangles':sum(len(p.vertices)-2 for p in o.data.polygons),'bones':len(rig.data.bones)} for o in objects)
        if '--no-render' not in sys.argv:render(rig,objects,side)
    report={'authorship':'Original authored connected cage, fifteen finger joints per side, locally keyed OpenClose; no stock assets','surface_source':str(LEATHER.relative_to(ROOT)).replace('\\','/'),'surface_sha256':hashlib.sha256(LEATHER.read_bytes()).hexdigest(),'source_fps':24,'frames':[0,48],'authoring_step_frames':.25,'records':records,'files':{p.name:hashlib.sha256(p.read_bytes()).hexdigest() for p in (RUN/'candidate').iterdir() if p.suffix in ['.blend','.glb']},'runtime_publish_allowed':False}
    (RUN/'qa/authoring.json').write_text(json.dumps(report,indent=2)+'\n');print('GLOVE_BUILD',json.dumps(report))
if __name__=='__main__':main()
