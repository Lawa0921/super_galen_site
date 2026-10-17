"""Reopen source and BOTH exported GLBs; sample actual evaluated mesh vertices."""
import bpy,sys,os,json,math
from mathutils import Vector
from mathutils.kdtree import KDTree
from mathutils.bvhtree import BVHTree
root=os.path.abspath(sys.argv[sys.argv.index('--')+1])
candidate=os.path.join(root,'candidate')
report={'runtime_publish_allowed':False,'lods':{},'sample_step_frames':.125,'original_bone_count':20,'method':'actual GLB evaluated vertices at eighth-frame intervals; all original bone skin matrices, weapon vertex parity and glove-to-weapon rigid-distance witnesses'}
def action(rig,a):
    rig.animation_data_create();rig.animation_data.action=a
    rig.animation_data.action_slot=a.slots[0]
    if rig.animation_data.nla_tracks:
        for track in rig.animation_data.nla_tracks:track.mute=True
def frame(f):
    bpy.context.scene.frame_set(int(f),subframe=f%1);bpy.context.view_layer.update()
def verts(o):
    e=o.evaluated_get(bpy.context.evaluated_depsgraph_get());m=e.to_mesh()
    result=[e.matrix_world@v.co for v in m.vertices];e.to_mesh_clear();return result
bpy.ops.wm.open_mainfile(filepath=os.path.join(candidate,'original-crossbow-grip.blend'))
rig=bpy.data.objects['crossbowRig20'];weapon=bpy.data.objects['CrossbowWeapon_LOD0']
assert {a.name for a in bpy.data.actions}=={'Idle','Walk','Attack','Hurt','Death'}
source={};ranges={};source_skin={}
source_rest=[weapon.matrix_world@v.co for v in weapon.data.vertices]
for a in bpy.data.actions:
    action(rig,a);start,end=a.frame_range;ranges[a.name]=(int(start),int(end));source[a.name]={};source_skin[a.name]={}
    for step in range(round((end-start)*8)+1):
        f=start+step/8;frame(f);source[a.name][f]=verts(weapon)
        source_skin[a.name][f]={p.name:rig.matrix_world@p.matrix@p.bone.matrix_local.inverted() for p in rig.pose.bones}
for lod in (0,1):
    # Retain the source scene camera, lighting, and world for a comparable render.
    for o in list(bpy.data.objects):
        if o.type not in {'CAMERA','LIGHT'}:bpy.data.objects.remove(o,do_unlink=True)
    for a in list(bpy.data.actions):bpy.data.actions.remove(a)
    bpy.ops.import_scene.gltf(filepath=os.path.join(candidate,f'original-crossbow-grip-lod{lod}.glb'))
    rig=next(o for o in bpy.data.objects if o.type=='ARMATURE')
    assert set(rig.pose.bones.keys())==set(next(iter(next(iter(source_skin.values())).values())).keys()),'Every original bone must be present'
    weapon=next(o for o in bpy.data.objects if o.type=='MESH' and 'CrossbowWeapon_' in o.name)
    hands={side:next(o for o in bpy.data.objects if o.type=='MESH' and 'ClosedGrip_'+side in o.name) for side in ('L','R')}
    acts={name:next(a for a in bpy.data.actions if a.name==name or a.name.endswith('|'+name)) for name in ranges}
    rig.data.pose_position='REST';bpy.context.view_layer.update()
    rest=verts(weapon);tree=KDTree(len(source_rest))
    for i,p in enumerate(source_rest):tree.insert(p,i)
    tree.balance();mapping=[tree.find(p)[1] for p in rest]
    rest_error=max(tree.find(p)[2] for p in rest)
    rig.data.pose_position='POSE';bpy.context.view_layer.update()
    palm_ids={}
    for side,o in hands.items():
        group=o.vertex_groups.get('Hand_'+side)
        assert group is not None
        ids=[v.index for v in o.data.vertices if any(g.group==group.index and g.weight>.999 for g in v.groups)]
        palm_ids[side]=ids[::max(1,len(ids)//24)]
        assert len(palm_ids[side])>=8
    wids=list(range(0,len(rest),max(1,len(rest)//12)))
    record={'rest_weapon_vertex_max_m':rest_error,'clips':{}}
    for name,a in acts.items():
        action(rig,a);baseline=None;max_parity=0;max_skin_error=0;drift={'L':0,'R':0};max_min_gap={'L':0,'R':0};count=0
        for f,expected in source[name].items():
            frame(f);wp=verts(weapon)
            for pb in rig.pose.bones:
                if pb.name not in source_skin[name][f]:continue
                actual=rig.matrix_world@pb.matrix@pb.bone.matrix_local.inverted()
                expected_skin=source_skin[name][f][pb.name]
                max_skin_error=max(max_skin_error,max(abs(actual[i][j]-expected_skin[i][j]) for i in range(4) for j in range(4)))
            max_parity=max(max_parity,max((p-expected[mapping[i]]).length for i,p in enumerate(wp)))
            hp={s:verts(o) for s,o in hands.items()}
            distances={s:[(hp[s][i]-wp[j]).length for i in palm_ids[s] for j in wids] for s in hands}
            if baseline is None:baseline=distances
            for s in hands:drift[s]=max(drift[s],max(abs(x-y) for x,y in zip(distances[s],baseline[s])))
            bv=BVHTree.FromPolygons(wp,[tuple(p.vertices) for p in weapon.data.polygons],all_triangles=False)
            for s in hands:
                gap=min(bv.find_nearest(hp[s][i])[3] for i in palm_ids[s])
                max_min_gap[s]=max(max_min_gap[s],gap)
            count+=1
        record['clips'][name]={'samples':count,'source_vs_glb_weapon_vertex_max_m':max_parity,'all_original_bones_skin_matrix_max_abs_error':max_skin_error,
            'actual_glove_weapon_distance_drift_max_m':drift,'max_nearest_sampled_palm_to_weapon_surface_m':max_min_gap}
    report['lods'][str(lod)]=record
    if lod==0:
        scene=bpy.context.scene;scene.render.engine='BLENDER_EEVEE';scene.eevee.taa_render_samples=16;scene.render.resolution_x=640;scene.render.resolution_y=640;scene.render.resolution_percentage=100
        scene.render.image_settings.file_format='PNG';scene.render.film_transparent=True
        cam=scene.camera
        if cam is None:
            cam=bpy.data.objects.new('CrossbowExportCamera',bpy.data.cameras.new('CrossbowExportCamera'));scene.collection.objects.link(cam);scene.camera=cam
        cam.data.type='ORTHO'
        for name,f in [('Idle',20),('Walk',10),('Attack',16),('Hurt',14),('Death',35)]:
            action(rig,acts[name]);frame(f)
            points=[p for o in bpy.data.objects if o.type=='MESH' for p in verts(o)]
            lo=Vector(tuple(min(p[i] for p in points) for i in range(3)));hi=Vector(tuple(max(p[i] for p in points) for i in range(3)))
            target=(hi+lo)/2;cam.data.ortho_scale=(hi-lo).length*1.08
            cam.location=target+Vector((3.2,4.2,2));cam.rotation_euler=(target-cam.location).to_track_quat('-Z','Y').to_euler()
            scene.render.filepath=os.path.join(root,'qa','glb-'+name.lower()+'.png');bpy.ops.render.render(write_still=True)
            for view,direction in [('front',(3.2,4.2,1.8)),('side',(-3.2,4.2,1.8))]:
                target=(rig.matrix_world@rig.pose.bones['Hand_L'].head+rig.matrix_world@rig.pose.bones['Hand_R'].head)/2
                cam.location=target+Vector(direction);cam.rotation_euler=(target-cam.location).to_track_quat('-Z','Y').to_euler();cam.data.ortho_scale=.75
                scene.render.filepath=os.path.join(root,'qa',f'glb-{name.lower()}-contact-{view}.png');bpy.ops.render.render(write_still=True)
report['pass']=all(c['source_vs_glb_weapon_vertex_max_m']<.0001 and c['all_original_bones_skin_matrix_max_abs_error']<.0001 and max(c['actual_glove_weapon_distance_drift_max_m'].values())<.005 for l in report['lods'].values() for c in l['clips'].values())
json.dump(report,open(os.path.join(root,'qa','actual-export-verification.json'),'w'),indent=2)
print('ACTUAL_EXPORT_VERIFICATION',json.dumps(report));assert report['pass']
