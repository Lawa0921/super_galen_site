import bpy,sys,json,math
from mathutils import Vector
from mathutils.bvhtree import BVHTree
bpy.ops.wm.open_mainfile(filepath=sys.argv[sys.argv.index('--')+1])
rig=bpy.data.objects['crossbowRig20']
for label in ('L','R'):
    bone=rig.data.bones['Forearm_'+label];n=(bone.head_local-bone.tail_local).normalized();p=bone.tail_local+n*.010
    grip=bpy.data.objects['OriginalCrossbowClosedGrip_'+label]
    bv=BVHTree.FromPolygons([v.co for v in grip.data.vertices],[list(f.vertices) for f in grip.data.polygons])
    u=Vector((0,1,0));v=n.cross(u)
    vals=[]
    for offset in [-.020,0,.005,.015]:
        vals.append([offset,[bv.ray_cast(p+n*offset,u*math.cos(a)+v*math.sin(a),.12)[3] for a in [i*math.pi/4 for i in range(8)]]])
    print('WRIST',label,list(p),vals)
