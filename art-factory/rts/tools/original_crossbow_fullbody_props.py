"""Original game-only equipment geometry and its pose controls.

The linkage is a stylized animation prop, not a fabrication model. All sections,
UVs and joints are authored here; materials come from the project's own assets.
"""
import math
import bpy
from mathutils import Vector, Matrix, Quaternion
from original_crossbow_weapon_build import Author
from original_crossbow_fullbody_math import joint_position

CX = .4756327
LATCH = Vector((CX, .080, 1.143))
FREE = Vector((CX, .438, 1.119))
RAIL = Vector((CX, .30, 1.15))
PIVOT = Vector((CX-.055, -.02, 1.11))
QUIVER = Vector((-.31, .025, .89))
QUIVER_BOLT = Vector((-.31, .025, 1.015))
DOWN = Quaternion((1, 0, 0), -math.pi/2)
PROP_NAMES = ('OriginalSpanningUpper', 'OriginalSpanningLink', 'OriginalSpanningGrip',
              'OriginalWaistQuiver', 'OriginalQuiverSpareA', 'OriginalQuiverSpareB')


def linkage(draw, deploy):
    target = FREE.lerp(LATCH, draw)+Vector((-.055, 0, .002))
    knee = Vector(joint_position(PIVOT, target, .28, .25, PIVOT+Vector((0, 0, 1))))
    grip = PIVOT+(knee-PIVOT)*.90
    fold = Quaternion((0, 1, 0), -(1-deploy)*math.pi/2)
    return tuple(PIVOT+fold@(p-PIVOT) for p in (PIVOT, knee, target, grip))


def segment_matrix(start, end):
    return Matrix.LocRotScale(start, (end-start).to_track_quat('Y', 'Z'), Vector((1, 1, 1)))


def pose_controls(rig, weapon, draw, deploy):
    a, k, t, h = linkage(draw, deploy)
    # The parallel swivel grip remains aligned with the support grip.
    return {'LeverUpper': weapon@segment_matrix(a, k),
            'LeverLink': weapon@segment_matrix(k, t),
            'LeverHandle': weapon@Matrix.Translation(h)}


def weighted(author, name, rig, materials, bone):
    obj = author.make(name, rig, materials)
    obj.vertex_groups.clear()
    obj.vertex_groups.new(name=bone).add(list(range(len(obj.data.vertices))), 1, 'REPLACE')
    return obj


def add_equipment(rig,quiver_raise=0.):
    a, k, t, h = linkage(1, 1)
    definitions = {'LeverUpper': (a, k, 'Hand_R'), 'LeverLink': (k, t, 'Hand_R'),
                   'LeverHandle': (h, h+Vector((0, .06, 0)), 'Hand_R'),
                   'QuiverRoot': (QUIVER, QUIVER+Vector((0, .08, 0)), 'Pelvis')}
    bpy.ops.object.select_all(action='DESELECT')
    rig.select_set(True); bpy.context.view_layer.objects.active=rig
    bpy.ops.object.mode_set(mode='EDIT')
    palm=rig.data.edit_bones['HandPalm_L']
    driver=rig.data.edit_bones.new('LeftInteraction');driver.head=palm.head;driver.tail=palm.tail;driver.matrix=palm.matrix.copy()
    driver.parent=rig.data.edit_bones['Root'];palm.parent=driver
    rig.data.edit_bones['LoadedBolt'].parent=driver
    for name, (start, end, parent) in definitions.items():
        bone=rig.data.edit_bones.new(name); bone.head=start; bone.tail=end
        bone.parent=driver if name=='LeverHandle' else rig.data.edit_bones[parent]
        # Make the rest transform exactly match the animation control frame.
        bone.align_roll(segment_matrix(start, end).to_3x3()@Vector((0, 0, 1)))
    bpy.ops.object.mode_set(mode='OBJECT')
    materials=[bpy.data.materials[n] for n in ('CarvedKingdomOak','ForgedKingdomSteel','OriginalWornLeatherGloves')]
    upper=Author()
    upper.loft('tapered_lever',[a,a.lerp(k,.2),k,k+(k-a)*.12],[.011,.014,.010,.008],[.009,.008,.007,.006],(1,0,0),8,1)
    upper.tube('pivot_pin',[a+Vector((-.009,0,0)),a+Vector((.026,0,0))],.014,10,1,hint=(0,0,1))
    upper.tube('joint_pin',[k+Vector((-.013,0,0)),k+Vector((.013,0,0))],.011,10,1,hint=(0,0,1))
    weighted(upper,PROP_NAMES[0],rig,materials,'LeverUpper')
    link=Author()
    link.loft('curved_draw_link',[k,k.lerp(t,.25)+Vector((-.008,0,.006)),t],[.007,.008,.006],[.006,.007,.005],(1,0,0),6,1)
    link.tube('string_hook',[t+Vector((0,0,.016)),t+Vector((.055,0,.016)),t+Vector((.055,-.007,0))],.005,6,1,hint=(0,1,0))
    weighted(link,PROP_NAMES[1],rig,materials,'LeverLink')
    grip=Author()
    grip.loft('leather_swivel',[h+Vector((0,y,0)) for y in (-.076,-.062,.062,.076)],
              [.017,.0135,.0135,.017],[.017,.0135,.0135,.017],(1,0,0),10,2,exponent=1)
    weighted(grip,PROP_NAMES[2],rig,materials,'LeverHandle')
    # A continuous hollow leather case: exterior, folded mouth, lining and base.
    case=Author(); sides=16
    rows=[(.655,.038,.023),(.70,.047,.030),(.90,.058,.036),(1.035,.066,.040),
          (1.041,.064,.038),(1.033,.060,.034),(.705,.041,.024)]
    for z,rx,ry in rows:
        for j in range(sides):
            angle=math.tau*j/sides
            case.vertices.append((QUIVER.x+rx*math.cos(angle),QUIVER.y+ry*math.sin(angle),z+.1))
    for row in range(len(rows)-1):
        for j in range(sides):
            case.faces.append((row*sides+j,row*sides+(j+1)%sides,(row+1)*sides+(j+1)%sides,(row+1)*sides+j))
            case.uvs.append(((j/sides,row/6),((j+1)/sides,row/6),((j+1)/sides,(row+1)/6),(j/sides,(row+1)/6)))
            case.materials.append(2)
    for row in (0,len(rows)-1):
        case.faces.append(tuple(row*sides+j for j in reversed(range(sides))))
        case.uvs.append(tuple((.5+.45*math.cos(math.tau*j/sides),.5+.45*math.sin(math.tau*j/sides)) for j in reversed(range(sides))))
        case.materials.append(2)
    for y in (-.028,.078):
        case.loft('suspension_'+str(y),[(-.224,y,1.087),(-.26,y,1.10),(-.33,y,1.115)],
                  [.015,.016,.015],[.004,.004,.005],(0,1,0),6,2)
    case.tube('side_welt',[(-.347,.025,.759),(-.359,.025,.82),(-.37,.025,1.0),(-.378,.025,1.135)],.003,6,2,hint=(0,1,0))
    weighted(case,PROP_NAMES[3],rig,materials,'QuiverRoot')
    source=bpy.data.objects['OriginalLoadedBolt']
    for name, offset in [(PROP_NAMES[4],Vector((-.022,0,-.018))),(PROP_NAMES[5],Vector((.023,.010,.002)))]:
        obj=source.copy(); obj.data=source.data.copy(); obj.name=name
        bpy.context.scene.collection.objects.link(obj)
        for v in obj.data.vertices:v.co=QUIVER_BOLT+Vector((0,0,quiver_raise))+offset+DOWN@(v.co-RAIL)
        obj.vertex_groups.clear();obj.vertex_groups.new(name='QuiverRoot').add(list(range(len(obj.data.vertices))),1,'REPLACE')
    return {'authorship':'Original authored mesh, UV, rigid rig and motion; original generated project materials',
            'new_objects':list(PROP_NAMES),'new_bones':list(definitions)+['LeftInteraction'],'quiver_hollow':True}
