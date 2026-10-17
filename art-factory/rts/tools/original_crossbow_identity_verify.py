import bpy,sys,os,json,hashlib
from mathutils.kdtree import KDTree
root=os.path.abspath(sys.argv[sys.argv.index('--')+1])
source=os.path.abspath('art-factory/rts/runs/human-units/2026-10-05-v1/crossbow/candidate/crossbow-production-v1.blend')
def rig_record():
    r=bpy.data.objects['crossbowRig20']
    return {b.name:{'parent':b.parent.name if b.parent else None,'bind':[float(x) for row in b.matrix_local for x in row]} for b in r.data.bones}
def body_images():
    values={}
    for m in bpy.data.objects['crossbowOriginalBody_LOD0'].data.materials:
        if m.node_tree:
            values[m.name]=sorted(hashlib.sha256(n.image.packed_file.data).hexdigest() for n in m.node_tree.nodes if n.type=='TEX_IMAGE' and n.image and n.image.packed_file)
    return values
bpy.ops.wm.open_mainfile(filepath=source);original=rig_record();images=body_images();trees={}
for lod in (0,1):
    obj=bpy.data.objects[f'crossbowOriginalBody_LOD{lod}'];tree=KDTree(len(obj.data.vertices))
    for v in obj.data.vertices:tree.insert(v.co,v.index)
    tree.balance();trees[lod]=tree
bpy.ops.wm.open_mainfile(filepath=os.path.join(root,'candidate','original-crossbow-grip.blend'))
current=rig_record();errors={}
for lod,tree in trees.items():
    obj=bpy.data.objects[f'crossbowOriginalBody_LOD{lod}']
    points=[v.co for v in obj.data.vertices if abs(v.co.x)<.18 or v.co.z>1.49 or v.co.z<.78]
    errors[lod]={'outside_local_arm_region_vertices':len(points),'max_distance_from_original_m':max(tree.find(p)[2] for p in points)}
report={'original_bones':len(original),'hierarchy_and_bind_exact':current==original,'original_body_packed_textures_exact':images==body_images(),'outside_local_arm_region':errors,'source_sha256':hashlib.sha256(open(source,'rb').read()).hexdigest(),'actions':sorted(a.name for a in bpy.data.actions),'runtime_publish_allowed':False}
report['pass']=len(original)==20 and current==original and images==body_images() and all(e['max_distance_from_original_m']<1e-6 for e in errors.values())
json.dump(report,open(os.path.join(root,'qa','identity-verification.json'),'w'),indent=2);print(json.dumps(report));assert report['pass']
