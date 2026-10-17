import bpy, json, os, sys
from mathutils import Vector

def bounds(obj):
    if obj.type != 'MESH':
        return None
    pts=[obj.matrix_world @ Vector(corner) for corner in obj.bound_box]
    return {'min':[round(min(v[i] for v in pts),6) for i in range(3)],
            'max':[round(max(v[i] for v in pts),6) for i in range(3)]}

def inspect(label):
    result={'label':label,'objects':[],'armatures':[],'actions':[]}
    for obj in bpy.data.objects:
        result['objects'].append({'name':obj.name,'type':obj.type,'parent':obj.parent.name if obj.parent else None,
             'vertices':len(obj.data.vertices) if obj.type=='MESH' else None,
             'polygons':len(obj.data.polygons) if obj.type=='MESH' else None,
             'dimensions':[round(x,6) for x in obj.dimensions],'bounds':bounds(obj),
             'groups':[g.name for g in obj.vertex_groups] if obj.type=='MESH' else [],
             'materials':[m.name for m in obj.data.materials if m] if obj.type=='MESH' else []})
        if obj.type=='ARMATURE':
            result['armatures'].append({'name':obj.name,'bones':[{'name':b.name,'head':[round(x,6) for x in b.head_local],
             'tail':[round(x,6) for x in b.tail_local],'parent':b.parent.name if b.parent else None} for b in obj.data.bones]})
    for action in bpy.data.actions:
        curves=list(getattr(action,'fcurves',[]))
        if not curves:
            for layer in getattr(action,'layers',[]):
                for strip in getattr(layer,'strips',[]):
                    for slot in getattr(action,'slots',[]):
                        try:
                            bag=strip.channelbag(slot)
                            curves.extend(list(bag.fcurves) if bag else [])
                        except Exception: pass
        frames=[key.co.x for fc in curves for key in fc.keyframe_points]
        result['actions'].append({'name':action.name,'frame_start':round(min(frames),4) if frames else None,
             'frame_end':round(max(frames),4) if frames else None,'curves':len(curves),
             'paths':sorted(set(fc.data_path for fc in curves)),'layers':len(getattr(action,'layers',[]))})
    return result

blend_path=sys.argv[sys.argv.index('--')+1]
bpy.ops.wm.open_mainfile(filepath=blend_path)
all_results=[inspect('blend')]
gltf_path=sys.argv[sys.argv.index('--')+2]
if gltf_path:
    bpy.ops.import_scene.gltf(filepath=gltf_path)
    all_results.append(inspect('gltf'))
print('CROSSBOW_INSPECT_JSON='+json.dumps(all_results,separators=(',',':')))
