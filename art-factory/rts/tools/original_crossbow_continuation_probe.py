import bpy,bmesh,sys,json,os
from mathutils import Vector
p=sys.argv[sys.argv.index('--')+1];out=os.path.abspath(sys.argv[sys.argv.index('--')+2])
bpy.ops.wm.open_mainfile(filepath=p)
rig=bpy.data.objects['crossbowRig20']
records={}
for o in bpy.data.objects:
    if o.type!='MESH' or 'Body' not in o.name:continue
    bm=bmesh.new();bm.from_mesh(o.data)
    edges=[e for e in bm.edges if e.is_boundary and all(.9<v.co.z<1.4 and abs(v.co.x)>.19 for v in e.verts)]
    records[o.name]={'arm_boundary_edges':len(edges),'verts':len(bm.verts)}
    bm.free()
print('LOCAL_TOPOLOGY',json.dumps(records))
if '--render' in sys.argv:
    rig.data.pose_position='REST'
    for o in bpy.data.objects:
        if o.type=='MESH':o.hide_render='Body_LOD0' not in o.name
    scene=bpy.context.scene;scene.render.engine='BLENDER_EEVEE';scene.eevee.taa_render_samples=16
    scene.render.resolution_x=800;scene.render.resolution_y=800;scene.render.resolution_percentage=100
    cam=scene.camera;target=Vector((0,0,1.25));cam.data.type='ORTHO';cam.data.ortho_scale=1.1
    cam.location=target+Vector((0,4,1));cam.rotation_euler=(target-cam.location).to_track_quat('-Z','Y').to_euler()
    scene.render.filepath=out;bpy.ops.render.render(write_still=True)
