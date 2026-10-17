import bpy,json,sys,os,hashlib,struct,math
from mathutils import Vector
root=os.path.abspath(sys.argv[sys.argv.index('--')+1]);cand=os.path.join(root,'candidate')
bpy.ops.wm.open_mainfile(filepath=os.path.join(cand,'original-crossbow-grip.blend'))
rig=bpy.data.objects['crossbowRig20'];weapon=bpy.data.objects['CrossbowWeapon_LOD0']
report={'runtime_publish_allowed':False,'status':'candidate_pending_independent_review','clips':{},'lods':{},'hashes':{}}
assert {a.name for a in bpy.data.actions}=={'Idle','Walk','Attack','Hurt','Death'},'Editable blend must retain every action after reopening'
grip_report=json.load(open(os.path.join(cand,'grip-candidate-report.json')))
def set_action(a):
    rig.animation_data.action=a
    if a.slots:rig.animation_data.action_slot=a.slots[0]
def update(frame):
    bpy.context.scene.frame_set(int(frame),subframe=frame%1);bpy.context.view_layer.update()
def verts(o):
    e=o.evaluated_get(bpy.context.evaluated_depsgraph_get());m=e.to_mesh()
    result=[e.matrix_world@v.co for v in m.vertices];e.to_mesh_clear();return result
for a in bpy.data.actions:
    set_action(a);start,end=a.frame_range;maximum=0;count=0;worst=0;left_error=0
    for step in range(round((end-start)*2)+1):
        frame=start+step/2;update(frame)
        transform=rig.matrix_world@rig.pose.bones['Hand_R'].matrix@rig.data.bones['Hand_R'].matrix_local.inverted()
        error=max((actual-transform@v.co).length for actual,v in zip(verts(weapon),weapon.data.vertices))
        support=transform@Vector(grip_report['weapon_stock_support_rest'])
        contact=rig.matrix_world@rig.pose.bones['Hand_L'].matrix@Vector(grip_report['fitted_grips']['L']['channel_local_bone'])
        left_error=max(left_error,(support-contact).length)
        if error>maximum:maximum=error;worst=frame
        count+=1
    report['clips'][a.name]={'sample_count':count,'step_frames':0.5,'actual_weapon_vertex_vs_single_wrist_skin_max_m':maximum,'worst_frame':worst,'baked_left_channel_attachment_max_m':left_error}
    assert maximum<1e-5,(a.name,maximum)
    report['clips'][a.name]['baked_attachment_pass']=left_error<0.005
# Frame the entire evaluated model, including the fallen Death pose.
scene=bpy.context.scene;cam=scene.camera;scene.render.engine='BLENDER_EEVEE';scene.eevee.taa_render_samples=16;scene.render.resolution_x=640;scene.render.resolution_y=640
meshes=[o for o in bpy.data.objects if o.type=='MESH' and not o.name.endswith('LOD1')]
for o in bpy.data.objects:
    if o.type=='MESH':o.hide_render=o.name.endswith('LOD1')
for name,frame in [('Idle',20),('Walk',10),('Attack',16),('Hurt',14),('Death',35)]:
    set_action(bpy.data.actions[name]);update(frame)
    points=[v for o in meshes for v in verts(o)]
    lo=Vector(tuple(min(p[i] for p in points) for i in range(3)));hi=Vector(tuple(max(p[i] for p in points) for i in range(3)))
    target=(lo+hi)/2;cam.location=target+Vector((3.2,4.2,2));cam.rotation_euler=(target-cam.location).to_track_quat('-Z','Y').to_euler()
    cam.data.ortho_scale=(hi-lo).length*1.08
    scene.render.filepath=os.path.join(root,'qa',name.lower()+'-full.png');bpy.ops.render.render(write_still=True)
    for view,direction in [('front',(3.2,4.2,1.8)),('side',(-3.2,4.2,1.8))]:
        target=(rig.pose.bones['Hand_R'].head+rig.pose.bones['Hand_L'].head)/2
        cam.location=target+Vector(direction);cam.rotation_euler=(target-cam.location).to_track_quat('-Z','Y').to_euler();cam.data.ortho_scale=.75
        scene.render.filepath=os.path.join(root,'qa',f'source-{name.lower()}-contact-{view}.png');bpy.ops.render.render(write_still=True)
set_action(bpy.data.actions['Idle']);update(20)
target=(rig.pose.bones['Hand_R'].head+rig.pose.bones['Hand_L'].head)/2
cam.location=target+Vector((3.2,4.2,1.8));cam.rotation_euler=(target-cam.location).to_track_quat('-Z','Y').to_euler();cam.data.ortho_scale=.65
scene.render.filepath=os.path.join(root,'qa','idle-grip-close.png');bpy.ops.render.render(write_still=True)
def read_glb(path):
    raw=open(path,'rb').read();n=struct.unpack_from('<I',raw,12)[0];doc=json.loads(raw[20:20+n]);return doc,raw[28+n:]
def signature(doc,binary):
    def data(index):
        a=doc['accessors'][index];v=doc['bufferViews'][a['bufferView']];start=v.get('byteOffset',0)+a.get('byteOffset',0)
        components={'SCALAR':1,'VEC3':3,'VEC4':4}[a['type']]
        return binary[start:start+a['count']*components*4].hex()
    return {a['name']:sorted((doc['nodes'][c['target']['node']]['name'],c['target']['path'],data(a['samplers'][c['sampler']]['input']),data(a['samplers'][c['sampler']]['output'])) for c in a['channels']) for a in doc['animations']}
sigs=[]
for lod in (0,1):
    doc,binary=read_glb(os.path.join(cand,f'original-crossbow-grip-lod{lod}.glb'));sigs.append(signature(doc,binary))
    report['lods'][str(lod)]={'triangles':sum(doc['accessors'][p['indices']]['count']//3 for m in doc['meshes'] for p in m['primitives']),'clips':[a['name'] for a in doc['animations']]}
report['lod_animation_binary_tracks_identical']=sigs[0]==sigs[1];assert sigs[0]==sigs[1]
sources=[os.path.join(cand,n) for n in os.listdir(cand) if n.endswith(('.blend','.glb'))]
sources+=['art-factory/rts/runs/human-units/2026-10-05-v1/crossbow/candidate/crossbow-production-v1.blend','art-factory/rts/runs/human-units-grip-refine/2026-10-05/worker/candidate/worker-grip-refine.blend','art-factory/rts/tools/original_crossbow_grip_build.py','art-factory/rts/tools/original_crossbow_candidate_test.py','art-factory/rts/tools/original_crossbow_revision_verify.py']
for p in sources:
    report['hashes'][os.path.abspath(p)]={'sha256':hashlib.sha256(open(p,'rb').read()).hexdigest(),'bytes':os.path.getsize(p)}
report['baked_attachment_pass']=all(s['baked_attachment_pass'] for s in report['clips'].values())
report['visual_blockers']=['Final assembly and human visual review pending.']
if not report['baked_attachment_pass']:report['visual_blockers'].append('Baked left hand attachment exceeds 5 mm.')
path=os.path.join(root,'qa','measured-verification.json');json.dump(report,open(path,'w'),indent=2);print('MEASURED',json.dumps(report))
