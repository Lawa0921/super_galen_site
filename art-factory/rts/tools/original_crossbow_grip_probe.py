import bpy, json, os, sys
from mathutils import Vector

def rounded(v,n=5): return [round(float(x),n) for x in v]
def bounds(points):
    if not points:return None
    return {'min':rounded([min(p[i] for p in points) for i in range(3)]),
            'max':rounded([max(p[i] for p in points) for i in range(3)]),
            'center':rounded([(min(p[i] for p in points)+max(p[i] for p in points))*0.5 for i in range(3)])}

def bone_world(rig,name):
    pb=rig.pose.bones.get(name)
    if not pb:return None
    return {'head':rounded(rig.matrix_world @ pb.head),'tail':rounded(rig.matrix_world @ pb.tail),
            'length':round((pb.tail-pb.head).length,5)}

blend_path=sys.argv[sys.argv.index('--')+1]
out_path=sys.argv[sys.argv.index('--')+2]
bpy.ops.wm.open_mainfile(filepath=blend_path)
rig=bpy.data.objects['crossbowRig20']
weapon=bpy.data.objects['CrossbowWeapon_LOD0']
# report raw weapon material regions in its armature-space vertex data
mesh=weapon.data
raw_parts={}
for idx,mat in enumerate(mesh.materials):
    vids={vi for poly in mesh.polygons if poly.material_index==idx for vi in poly.vertices}
    raw_parts[mat.name]=bounds([mesh.vertices[vi].co for vi in vids])
result={'source':os.path.abspath(blend_path),'raw_weapon_parts':raw_parts,'raw_weapon_bounds':bounds([v.co for v in mesh.vertices]),
        'weapon_parent':weapon.parent.name if weapon.parent else None,'weapon_groups':{g.name:sum(1 for v in mesh.vertices if any(gm.group==g.index and gm.weight>0.5 for gm in v.groups)) for g in weapon.vertex_groups},
        'clips':{}}
for action in bpy.data.actions:
    name=action.name.split('.')[0]
    if name not in {'Idle','Walk','Attack','Hurt','Death'} or name in result['clips']: continue
    rig.animation_data_create()
    rig.animation_data.action=action
    if hasattr(action,'slots') and action.slots:
        try: rig.animation_data.action_slot=action.slots[0]
        except Exception: pass
    frames={'Idle':[0,20,40],'Walk':[0,10,20,30,40],'Attack':[0,8,16,28,40],'Hurt':[0,7,14,21,28],'Death':[0,10,20,36,50]}[name]
    samples=[]
    for frame in frames:
        bpy.context.scene.frame_set(frame)
        bpy.context.view_layer.update()
        dg=bpy.context.evaluated_depsgraph_get()
        ev=weapon.evaluated_get(dg)
        me=ev.to_mesh()
        part_points={m.name:[] for m in mesh.materials if m}
        for poly in me.polygons:
            material=mesh.materials[poly.material_index].name if poly.material_index<len(mesh.materials) else 'unknown'
            for vi in poly.vertices:
                part_points.setdefault(material,[]).append(ev.matrix_world @ me.vertices[vi].co)
        parts={k:bounds(v) for k,v in part_points.items()}
        ev.to_mesh_clear()
        samples.append({'frame':frame,'arm':{n:bone_world(rig,n) for n in ['Shoulder_R','UpperArm_R','Forearm_R','Hand_R','Shoulder_L','UpperArm_L','Forearm_L','Hand_L']},
                        'weapon_world':bounds([weapon.evaluated_get(dg).matrix_world @ weapon.evaluated_get(dg).to_mesh().vertices[i].co for i in range(0,0)]),
                        'weapon_parts_world':parts})
    result['clips'][name]={'frames':frames,'samples':samples}
with open(out_path,'w',encoding='utf-8') as f: json.dump(result,f,indent=2)
print('Wrote crossbow source pose probe:',out_path)
