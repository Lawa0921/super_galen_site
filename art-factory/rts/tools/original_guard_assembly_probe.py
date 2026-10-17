import bpy, sys
from pathlib import Path
args=sys.argv[sys.argv.index('--')+1:]
path=Path(args[0])
with bpy.data.libraries.load(str(path),link=False) as (src,dst):
    dst.objects=['OriginalGuardFrontTabard']
obj=dst.objects[0]
print('TABARD_BOUNDS', [tuple(min(v.co[i] for v in obj.data.vertices) for i in range(3)), tuple(max(v.co[i] for v in obj.data.vertices) for i in range(3))])
print('TABARD_GROUPS', [(g.name, sum(1 for v in obj.data.vertices for a in v.groups if a.group==g.index and a.weight>0)) for g in obj.vertex_groups])
print('TABARD_FACES',len(obj.data.polygons),'VERTICES',len(obj.data.vertices))
bpy.ops.wm.open_mainfile(filepath=args[1])
rig=bpy.data.objects['GuardRig20']
print('BONES',[(b.name,tuple(b.head_local),tuple(b.tail_local),b.parent.name if b.parent else None) for b in rig.data.bones])
