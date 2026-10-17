"""Focused Blender acceptance gate: integrated closed hands and five original clips."""
import bpy, json, sys
from pathlib import Path
p=Path(sys.argv[sys.argv.index('--')+1]); bpy.ops.wm.open_mainfile(filepath=str(p.resolve()))
rig=bpy.data.objects['GuardRig20']
assert {a.name for a in bpy.data.actions} >= {'Idle','Walk','Attack','Hurt','Death'}
for side in ('R','L'):
    for lod in (0,1):
        name=f'GuardHandGrip_{side}_LOD{lod}'
        obj=bpy.data.objects.get(name)
        assert obj is not None, f'Missing integrated closed grip: {name}'
        assert any(m.type=='ARMATURE' and m.object==rig for m in obj.modifiers), name
        group=obj.vertex_groups[f'Hand_{side}']
        assert all(abs(group.weight(v.index)-1)<1e-5 for v in obj.data.vertices)
        import bmesh
        bm=bmesh.new(); bm.from_mesh(obj.data)
        assert all(e.is_manifold for e in bm.edges), name+' open grip'
        bm.free()
for lod in (0,1):
    obj=bpy.data.objects[f'GuardPaddedLegLayer_LOD{lod}']
    for v in obj.data.vertices:
        if .36<v.co.z<.46 and abs(v.co.y)<=.12:
            side='L' if v.co.x<0 else 'R'
            expected=(v.co.z-.36)/.10
            g=obj.vertex_groups[f'Thigh_{side}']
            actual=sum(x.weight for x in v.groups if x.group==g.index)
            assert abs(actual-expected)<1e-4, f'Reversed knee liner blend: {obj.name} vertex {v.index}'
from mathutils import Vector
rig.animation_data.action=bpy.data.actions['Idle'];bpy.context.scene.frame_set(0)
for side in ('L','R'):
    obj=bpy.data.objects[f'GuardLegArmor_knee_cap_{side}_LOD0'];ev=obj.evaluated_get(bpy.context.evaluated_depsgraph_get());mesh=ev.to_mesh()
    center=sum((v.co for v in mesh.vertices),Vector())/len(mesh.vertices)
    assert center.y>rig.pose.bones['Shin_'+side].head.y+.02, 'Kneecap flipped away from front: '+side
    ev.to_mesh_clear()
print('PASS: five clips + four closed rigid grips + continuous knee weights + forward kneecaps')
