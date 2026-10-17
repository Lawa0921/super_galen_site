"""Actual exported original forearm rim vs actual closed glove, all five actions."""
import bpy,sys,os,json,math
from mathutils import Vector
from mathutils.bvhtree import BVHTree
from mathutils.kdtree import KDTree
root=os.path.abspath(sys.argv[sys.argv.index('--')+1]);results={}
build_report=json.load(open(os.path.join(root,'candidate','grip-candidate-report.json')))
planes={}
bpy.ops.wm.open_mainfile(filepath=os.path.join(root,'candidate','original-crossbow-grip.blend'))
source_rig=bpy.data.objects['crossbowRig20'];source_action=bpy.data.actions['Idle'];source_rig.animation_data.action=source_action;source_rig.animation_data.action_slot=source_action.slots[0]
bpy.context.scene.frame_set(0);bpy.context.view_layer.update()
for s in ('L','R'):
    h=source_rig.pose.bones['Hand_'+s];f=source_rig.pose.bones['Forearm_'+s]
    n=(f.bone.head_local-f.bone.tail_local).normalized();cut=h.bone.head_local+n*.010
    skin=h.matrix@h.bone.matrix_local.inverted();inverse=skin.inverted()
    old=skin@(h.bone.head_local+n*.015);axis=(f.head-f.tail).normalized();target=h.head+axis*.015
    q=(skin.to_3x3()@n).normalized().rotation_difference(axis)
    planes[s]=(inverse@(target+q@(skin@cut-old)),(inverse.to_3x3()@(q@(skin.to_3x3()@n))).normalized())
def verts(o):
    e=o.evaluated_get(bpy.context.evaluated_depsgraph_get());m=e.to_mesh();p=[e.matrix_world@v.co for v in m.vertices];e.to_mesh_clear();return p
for lod in (0,1):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=os.path.join(root,'candidate',f'original-crossbow-grip-lod{lod}.glb'))
    rig=next(o for o in bpy.data.objects if o.type=='ARMATURE')
    body=next(o for o in bpy.data.objects if o.type=='MESH' and 'Body' in o.name)
    hands={s:next(o for o in bpy.data.objects if o.type=='MESH' and 'ClosedGrip_'+s in o.name) for s in ('L','R')}
    rig.data.pose_position='REST';bpy.context.view_layer.update();rest=verts(body);rim={}
    for side in ('L','R'):
        # Importer's bone tails are display heuristics; reconstruct original rest
        # cut plane from known, preserved source joints in Blender Z-up space.
        sign=1 if side=='R' else -1
        cut,n=planes[side]
        pts=build_report['wrist_reference_alignment'][side]['terminal_rest_points'][f'crossbowOriginalBody_LOD{lod}']
        tree=KDTree(len(pts))
        for i,p in enumerate(pts):tree.insert(Vector(p),i)
        tree.balance()
        rim[side]=[i for i,p in enumerate(rest) if tree.find(p)[2]<.00015]
        assert len(rim[side])>=8,(lod,side,len(rim[side]))
    rig.data.pose_position='POSE';clips={}
    for action in bpy.data.actions:
        rig.animation_data.action=action;rig.animation_data.action_slot=action.slots[0]
        for t in rig.animation_data.nla_tracks:t.mute=True
        start,end=action.frame_range;record={s:{'rim_vertices':len(rim[s]),'max_outside_m':0,'max_surface_distance_m':0} for s in hands}
        for step in range(21):
            f=start+(end-start)*step/20;bpy.context.scene.frame_set(int(f),subframe=f%1);bpy.context.view_layer.update();points=verts(body)
            for s,o in hands.items():
                hp=verts(o);bv=BVHTree.FromPolygons(hp,[list(p.vertices) for p in o.data.polygons])
                for i in rim[s]:
                    near,normal,index,dist=bv.find_nearest(points[i])
                    record[s]['max_surface_distance_m']=max(record[s]['max_surface_distance_m'],dist)
                    outside=(points[i]-near).dot(normal)
                    if outside>record[s]['max_outside_m']:
                        record[s]['max_outside_m']=outside
                        record[s]['worst_rest_vertex']=list(rest[i])
                        record[s]['worst_weights']={body.vertex_groups[g.group].name:g.weight for g in body.data.vertices[i].groups}
        clips[action.name]=record
    results[lod]=clips
report={'lods':results,'samples_per_clip':21,'runtime_publish_allowed':False,'method':'evaluated exported original forearm terminal vertices to actual glove BVH; signed outward distance detects cuff penetration'}
report['pass']=all(r['max_outside_m']<.001 and r['max_surface_distance_m']<.008 for clips in results.values() for c in clips.values() for r in c.values())
json.dump(report,open(os.path.join(root,'qa','wrist-verification.json'),'w'),indent=2);print(json.dumps(report));assert report['pass']
