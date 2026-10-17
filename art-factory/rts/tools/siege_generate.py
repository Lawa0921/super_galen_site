"""Original articulated kingdom ballista. Blender 5.2: --background --python siege_generate.py."""
import bpy
import hashlib
import json
import math
import sys
from pathlib import Path
from mathutils import Vector

sys.dont_write_bytecode=True
sys.path.insert(0,str(Path(__file__).resolve().parent))
import buildings_generate as g

ROOT=Path(__file__).resolve().parents[1]
RUN=ROOT/'runs'/'kingdom-siege'/'2026-10-04-original'
M={}
PARTS={}
DYNAMIC={}
CLIPS=('Idle','Walk','Attack','Hurt','Death')


def material(name,color,roughness,metallic,stem=None,team_tint=False):
    g.material(name,color,roughness,metallic)
    mat=g.M[name];M[name]=mat
    if not stem:return mat
    nodes=mat.node_tree.nodes;links=mat.node_tree.links
    bsdf=nodes.get('Principled BSDF')
    uv=nodes.new('ShaderNodeUVMap');uv.uv_map='Architectural UV'
    image=bpy.data.images.load(str(RUN/'candidate'/'textures'/f'{stem}-basecolor.jpg'),check_existing=True)
    image.pack()
    tex=nodes.new('ShaderNodeTexImage');tex.image=image
    links.new(uv.outputs['UV'],tex.inputs['Vector'])
    if team_tint:
        rgb=nodes.new('ShaderNodeRGB');rgb.outputs['Color'].default_value=(*color,1)
        tint=nodes.new('ShaderNodeMix');tint.data_type='RGBA';tint.blend_type='MULTIPLY'
        tint.inputs['Factor'].default_value=1
        a=next(s for s in tint.inputs if s.identifier=='A_Color')
        b=next(s for s in tint.inputs if s.identifier=='B_Color')
        out=next(s for s in tint.outputs if s.identifier=='Result_Color')
        links.new(tex.outputs['Color'],a);links.new(rgb.outputs['Color'],b)
        links.new(out,bsdf.inputs['Base Color'])
    else:links.new(tex.outputs['Color'],bsdf.inputs['Base Color'])
    normal=bpy.data.images.load(str(RUN/'candidate'/'textures'/f'{stem}-normal.png'),check_existing=True)
    normal.colorspace_settings.name='Non-Color';normal.pack()
    ntex=nodes.new('ShaderNodeTexImage');ntex.image=normal
    links.new(uv.outputs['UV'],ntex.inputs['Vector'])
    nm=nodes.new('ShaderNodeNormalMap');nm.inputs['Strength'].default_value=.32 if name=='TeamCloth' else .48
    links.new(ntex.outputs['Color'],nm.inputs['Color'])
    links.new(nm.outputs['Normal'],bsdf.inputs['Normal'])
    return mat


def setup():
    bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
    for mat in list(bpy.data.materials):bpy.data.materials.remove(mat)
    bpy.context.preferences.filepaths.save_version=0
    g.M.clear();M.clear();PARTS.clear();DYNAMIC.clear()
    material('HewnOak',(.36,.23,.12),.82,0,'hewn-oak')
    material('ForgedIron',(.22,.22,.23),.59,.72,'forged-iron')
    material('WeatheredBrass',(.54,.39,.17),.46,.70)
    material('TeamCloth',(.09,.20,.48),.89,0,'navy-cloth',True)
    material('WaxedBowstring',(.69,.60,.38),.90,0)
    material('IvoryInsignia',(.77,.70,.53),.80,0)
    root=bpy.data.objects.new('SiegeRoot',None);bpy.context.collection.objects.link(root)
    root['unit_id']='siege-engine';root['collision_radius_m']=.78
    root['collision_source']='catalog-metadata-only';root['forward_glb']='-Z'
    body=bpy.data.objects.new('ChassisRecoilPivot',None);bpy.context.collection.objects.link(body)
    body.parent=root;DYNAMIC['body']=body
    return root,body


def attach(ob,parent,group):
    ob.parent=parent
    PARTS.setdefault(group,[]).append(ob)
    return ob


def new_pivot(name,parent,loc):
    ob=bpy.data.objects.new(name,None);bpy.context.collection.objects.link(ob)
    ob.parent=parent;ob.location=loc
    return ob


def add_body(body,lod):
    def box(name,loc,size,mat='HewnOak',bevel=.008):
        return attach(g.box(name,loc,size,mat,bevel if lod==0 else 0),body,'body')
    def beam(name,a,b,w,mat='HewnOak'):
        return attach(g.beam(name,a,b,w,mat),body,'body')
    def cyl(name,loc,r,depth,mat='ForgedIron',segments=16,rotation=None):
        return attach(g.cyl(name,loc,r,depth,mat,segments if lod==0 else max(8,segments//2),rotation),body,'body')
    for sign in (-1,1):
        x=sign*.43
        box('Chambered long oak load beam',(x,0,.54),(.145,2.27,.20))
        box('Outside rail iron strap',(x+sign*.077,.05,.55),(.025,1.78,.11),'ForgedIron',0)
        beam('Long oak diagonal chassis brace',(x,-.80,.55),(sign*.23,.27,.87),.075)
        for y in (-.86,.71):
            box('Axle iron hanger',(x,y,.41),(.18,.23,.19),'ForgedIron',.008)
        if lod==0:
            for y in (-.93,-.18,.62):
                cyl('Hand peened corner rivet',(x+sign*.094,y,.59),.023,.025,'WeatheredBrass',10,(0,math.pi/2,0))
    for y in (-.86,.10,.78):box('Mortised cross stretcher',(0,y,.51),(.97,.13,.19))
    for y in (-.67,-.39,-.11,.17,.45,.73):
        box('Separate deck plank',(0,y,.65),(.71,.22,.061))
    for y in (-.64,.68):
        cyl('Full-width turned axle',(0,y,.31),.064,1.47,'HewnOak',16,(0,math.pi/2,0))
        for x in (-.56,.56):
            cyl('Forged axle collar',(x,y,.31),.091,.08,'ForgedIron',16,(0,math.pi/2,0))
    # The elevated central bolt channel is open and visibly carved.
    box('Raised trough under bolt',(0,.15,.88),(.245,1.92,.13))
    for sign in (-1,1):
        box('Carved U-channel cheek',(sign*.115,.14,.965),(.046,1.96,.13))
        box('Iron wear strip on launch rail',(sign*.14,.25,1.005),(.018,1.70,.035),'ForgedIron',0)
    box('Fore-lock iron muzzle bracket',(0,1.04,.94),(.43,.075,.19),'ForgedIron',.01)
    box('Rear trigger carriage',(0,-.73,.89),(.38,.27,.16),'ForgedIron',.01)
    box('Brass trigger catch',(0,-.60,1.015),(.12,.10,.07),'WeatheredBrass',.008)
    box('Rear drawbar socket',(0,-1.02,.57),(.36,.18,.19),'HewnOak')
    cyl('Brass sun roundel',(0,1.135,.54),.105,.022,'WeatheredBrass',20,(math.pi/2,0,0))
    for i in range(8 if lod==0 else 4):
        a=i*math.tau/(8 if lod==0 else 4)
        beam('Incised neutral sun-ray insignia',(.13*math.cos(a),1.15,.54+.13*math.sin(a)),
             (.19*math.cos(a),1.15,.54+.19*math.sin(a)),.018,'IvoryInsignia')
    if lod==0:
        for sign in (-1,1):
            box('Spare quarrel timber rack',(sign*.32,-.23,.75),(.058,.78,.07))
            for dy in (-.38,-.10,.18):
                cyl('Spare heavy bolt shaft',(sign*.32,dy,.82),.017,.35,'HewnOak',8,(math.pi/2,0,0))
    return box


def make_wheel(root,x,y,lod,label):
    pivot=new_pivot(f'WheelPivot_{label}',root,(x,y,.309))
    DYNAMIC[label]=pivot
    group=f'wheel_{label}'
    def part(ob):return attach(ob,pivot,group)
    segments=28 if lod==0 else 14
    spokes=10 if lod==0 else 6
    part(g.cyl('Turned hardwood hub core',(0,0,0),.102,.14,'HewnOak',segments,(0,math.pi/2,0)))
    part(g.ring('Bent oak rim with continuous felloes',(0,0,0),.251,.052,'HewnOak',segments,(0,math.pi/2,0)))
    part(g.ring('Riveted iron rolling tyre',(0,0,0),.291,.017,'ForgedIron',segments,(0,math.pi/2,0)))
    for j in range(spokes):
        a=math.tau*j/spokes
        inner=(0,.068*math.cos(a),.068*math.sin(a))
        outer=(0,.238*math.cos(a),.238*math.sin(a))
        part(g.beam('Tapered oak radial spoke',inner,outer,.047 if lod==0 else .052,'HewnOak'))
    for side in (-1,1):
        part(g.cyl('Iron retaining washer',(side*.079,0,0),.079,.027,'ForgedIron',segments,(0,math.pi/2,0)))
        part(g.cyl('Brass pin at axle',(side*.099,0,0),.031,.031,'WeatheredBrass',12,(0,math.pi/2,0)))
    if lod==0:
        for j in range(8):
            a=math.tau*j/8
            part(g.cyl('Peened tyre stud',(.078,.289*math.cos(a),.289*math.sin(a)),
                       .014,.019,'ForgedIron',8,(0,math.pi/2,0)))
    return pivot


def make_bow(body,lod):
    pivot=new_pivot('BowFlexPivot',body,(0,.60,1.12));DYNAMIC['bow']=pivot
    group='bow'
    for sign in (-1,1):
        verts=[];faces=[]
        path=[(.12,0,0),(.28,.11,.018),(.52,.24,.012),(.72,.28,-.018),(.82,.27,-.018)]
        if lod: path=[path[i] for i in (0,2,4)]
        for idx,(px,py,pz) in enumerate(path):
            half_w=(.067,.061,.046,.032,.022)[(0,2,4)[idx] if lod else idx]
            half_h=(.072,.063,.048,.033,.022)[(0,2,4)[idx] if lod else idx]
            x=sign*px
            verts.extend([(x-half_w,py,pz-half_h),(x+half_w,py,pz-half_h),
                          (x+half_w,py,pz+half_h),(x-half_w,py,pz+half_h)])
            if idx:
                k=(idx-1)*4;l=idx*4
                for a,b in ((0,1),(1,2),(2,3),(3,0)):
                    faces.append((k+a,k+b,l+b,l+a))
        faces.extend([(0,3,2,1),tuple(range(len(verts)-4,len(verts)))])
        attach(g.mesh('Curved laminated bow limb',verts,faces,'HewnOak'),pivot,group)
        for xx,yy in ((.15,.04),(.72,.275)):
            attach(g.cyl('Sleeved spring-wood bow socket',(sign*xx,yy,0),.071 if xx<.5 else .036,
                         .078,'ForgedIron',16 if lod==0 else 8,(0,math.pi/2,0)),pivot,group)
        attach(g.cyl('Brass bow tip eye',(sign*.82,.27,-.018),.034,.050,'WeatheredBrass',12,(0,math.pi/2,0)),pivot,group)
    attach(g.box('Bow root pressure block',(0,0,0),(.38,.25,.16),'ForgedIron',.01),pivot,group)
    return pivot


def make_winch(body,lod):
    pivot=new_pivot('WindlassDrumPivot',body,(0,-.56,.81));DYNAMIC['winch']=pivot
    group='winch'
    attach(g.cyl('Turned cord drum',(0,0,0),.095,.80,'HewnOak',20 if lod==0 else 10,(0,math.pi/2,0)),pivot,group)
    for x in (-.37,.37):
        attach(g.cyl('Iron ratchet flange',(x,0,0),.125,.047,'ForgedIron',20 if lod==0 else 10,(0,math.pi/2,0)),pivot,group)
    for j in range(9 if lod==0 else 4):
        x=-.28+j*(.56/(8 if lod==0 else 3))
        attach(g.ring('Waxed winding cord wrap',(x,0,0),.101,.010,'WaxedBowstring',14 if lod==0 else 8,(0,math.pi/2,0)),pivot,group)
    attach(g.beam('Hand crank iron stem',(.40,0,0),(.40,-.17,-.02),.043,'ForgedIron'),pivot,group)
    attach(g.cyl('Graspable oak winch handle',(.40,-.18,-.02),.047,.18,'HewnOak',12,(math.pi/2,0,0)),pivot,group)
    return pivot


def make_bolt(body,lod):
    pivot=new_pivot('LoadedQuarrelPivot',body,(0,-.35,1.105));DYNAMIC['bolt']=pivot
    group='bolt'
    attach(g.cyl('Hewn heavy quarrel shaft',(0,.20,0),.031,.83,'HewnOak',12 if lod==0 else 8,(math.pi/2,0,0)),pivot,group)
    tip_verts=[(-.050,.57,-.050),(.050,.57,-.050),(.050,.57,.050),(-.050,.57,.050),(0,.78,0)]
    tip_faces=[(0,3,2,1),(0,1,4),(1,2,4),(2,3,4),(3,0,4)]
    attach(g.mesh('Sharpened forged quarrel point',tip_verts,tip_faces,'ForgedIron'),pivot,group)
    for sign in (-1,1):
        vertices=[(sign*.028,-.17,0),(sign*.11,-.24,.026),(sign*.105,-.07,.017)]
        attach(g.mesh('Waxed linen quarrel fletching',vertices,[(0,1,2)],'TeamCloth'),pivot,group)
    return pivot


def make_string(body,side):
    bpy.ops.mesh.primitive_cylinder_add(vertices=8,radius=.012,depth=1)
    ob=bpy.context.object;ob.name=f'WaxedBowstring_{side}'
    ob.data.materials.append(M['WaxedBowstring']);ob.parent=body
    DYNAMIC[f'string_{side}']=ob
    return ob


def make_banner(body,side,lod):
    vertices=[(-.11,0,0),(.12,0,.015),(.14,-.025,-.20),(.08,-.006,-.40),
              (0,.020,-.34),(-.11,0,-.42)]
    faces=[(0,1,2,3,4,5)]
    ob=g.mesh(f'TeamCloth_pennant_{side}',vertices,faces,'TeamCloth')
    ob.location=(side*.47,-.82,1.88);ob.parent=body
    M['TeamCloth'].use_backface_culling=False
    DYNAMIC[f'banner_{side}']=ob
    mast=g.cyl('Rear banner oak mast',(side*.47,-.82,1.29),.026,1.16,'HewnOak',10 if lod==0 else 8)
    attach(mast,body,'body')
    cap=g.cyl('Brass mast finial',(side*.47,-.82,1.87),.037,.058,'WeatheredBrass',12)
    attach(cap,body,'body')
    return ob


def string_pose(ob,side,notch_y):
    tip=Vector((side*.82,.87,1.102));notch=Vector((0,notch_y,1.105))
    delta=tip-notch
    ob.location=(tip+notch)*.5
    ob.rotation_euler=delta.to_track_quat('Z','Y').to_euler()
    ob.scale=(1,1,delta.length)


def action_for(ob,clip,keyframes):
    rest=(ob.location.copy(),ob.rotation_euler.copy(),ob.scale.copy())
    ob.animation_data_create()
    action=bpy.data.actions.new(f'{ob.name}_{clip}')
    action.use_fake_user=True
    ob.animation_data.action=action
    for frame,values in keyframes:
        if 'location' in values:ob.location=values['location']
        if 'rotation' in values:ob.rotation_euler=values['rotation']
        if 'scale' in values:ob.scale=values['scale']
        if 'notch' in values:string_pose(ob,values['side'],values['notch'])
        for channel in ('location','rotation_euler','scale'):
            ob.keyframe_insert(data_path=channel,frame=frame,group=clip)
    track=ob.animation_data.nla_tracks.new();track.name=clip
    strip=track.strips.new(clip,1,action);strip.name=clip
    ob.animation_data.action=None
    ob.location,ob.rotation_euler,ob.scale=rest


def animate():
    body=DYNAMIC['body'];bow=DYNAMIC['bow'];bolt=DYNAMIC['bolt'];winch=DYNAMIC['winch']
    action_for(body,'Idle',[(1,{'location':(0,0,0)}),(20,{'location':(0,0,0)})])
    action_for(winch,'Idle',[(1,{'rotation':(0,0,0)}),(10,{'rotation':(.045,0,0)}),(20,{'rotation':(0,0,0)})])
    for side in (-1,1):
        banner=DYNAMIC[f'banner_{side}']
        loc=tuple(banner.location)
        action_for(banner,'Idle',[(1,{'rotation':(0,0,0),'location':loc}),
                                  (10,{'rotation':(.06*side,.09*side,.035),'location':loc}),
                                  (20,{'rotation':(0,0,0),'location':loc})])
    for key in ('FL','FR','RL','RR'):
        wheel=DYNAMIC[key]
        action_for(wheel,'Walk',[(1,{'rotation':(0,0,0)}),(5,{'rotation':(math.pi/2,0,0)}),
                                 (9,{'rotation':(math.pi,0,0)}),(13,{'rotation':(3*math.pi/2,0,0)}),
                                 (17,{'rotation':(math.tau,0,0)})])
    action_for(body,'Walk',[(1,{'location':(0,0,0)}),(5,{'location':(0,0,.012)}),
                            (9,{'location':(0,0,0)}),(13,{'location':(0,0,.012)}),
                            (17,{'location':(0,0,0)})])
    for side in (-1,1):
        ob=DYNAMIC[f'string_{side}']
        frames=[(1,-.25),(7,-.25),(9,.88),(12,.88),(24,-.25)]
        action_for(ob,'Attack',[(f,{'notch':n,'side':side}) for f,n in frames])
    action_for(bolt,'Attack',[(1,{'location':(0,-.35,1.105),'scale':(1,1,1)}),
                              (7,{'location':(0,-.35,1.105),'scale':(1,1,1)}),
                              (9,{'location':(0,.37,1.105),'scale':(1,1,1)}),
                              (12,{'location':(0,1.15,1.105),'scale':(1,1,1)}),
                              (13,{'location':(0,1.15,1.105),'scale':(.001,.001,.001)}),
                              (23,{'location':(0,-.35,1.105),'scale':(.001,.001,.001)}),
                              (24,{'location':(0,-.35,1.105),'scale':(1,1,1)})])
    action_for(body,'Attack',[(1,{'location':(0,0,0)}),(8,{'location':(0,0,0)}),
                              (10,{'location':(0,-.065,0)}),(18,{'location':(0,.012,0)}),
                              (24,{'location':(0,0,0)})])
    action_for(winch,'Attack',[(1,{'rotation':(0,0,0)}),(10,{'rotation':(-.20,0,0)}),
                               (24,{'rotation':(-.48,0,0)})])
    action_for(body,'Hurt',[(1,{'rotation':(0,0,0)}),(4,{'rotation':(.045,.08,-.035)}),
                            (8,{'rotation':(-.027,-.04,.019)}),(15,{'rotation':(0,0,0)})])
    for side in (-1,1):
        ob=DYNAMIC[f'banner_{side}']
        action_for(ob,'Hurt',[(1,{'rotation':(0,0,0)}),
                              (4,{'rotation':(.19*side,0,.15*side)}),
                              (14,{'rotation':(0,0,0)})])
    action_for(body,'Death',[(1,{'rotation':(0,0,0),'location':(0,0,0)}),
                             (10,{'rotation':(.04,.10,-.06),'location':(0,0,-.025)}),
                             (24,{'rotation':(.24,.22,-.17),'location':(0,-.04,-.12)})])
    action_for(bow,'Death',[(1,{'rotation':(0,0,0)}),(12,{'rotation':(.12,0,0)}),
                            (24,{'rotation':(.62,.07,0)})])
    for side,label in ((-1,'FL'),(1,'FR'),(-1,'RL'),(1,'RR')):
        wheel=DYNAMIC[label]
        action_for(wheel,'Death',[(1,{'rotation':(0,0,0)}),
                                  (24,{'rotation':(.28,side*.36,side*.19)})])
    for side in (-1,1):
        ob=DYNAMIC[f'banner_{side}']
        action_for(ob,'Death',[(1,{'rotation':(0,0,0)}),(24,{'rotation':(.31*side,0,.52*side)})])


def join_parts(parts,name):
    if len(parts)==1:
        parts[0].name=name;return parts[0]
    bpy.ops.object.select_all(action='DESELECT')
    for ob in parts:ob.select_set(True)
    active=parts[0];bpy.context.view_layer.objects.active=active
    bpy.ops.object.join();active.name=name
    return active


def compact_export():
    for group,parts in PARTS.items():
        if group=='body':
            grouped={}
            for ob in parts:grouped.setdefault(ob.active_material.name,[]).append(ob)
            for mat,items in grouped.items():join_parts(items,f'Body_{mat}')
        else:join_parts(parts,group)


def preview(lod):
    scene=bpy.context.scene
    scene.frame_set(0)
    scene.render.engine='BLENDER_EEVEE'
    scene.render.resolution_x=640;scene.render.resolution_y=640
    scene.render.resolution_percentage=100;scene.render.film_transparent=True
    scene.world.color=(.22,.24,.26)
    bpy.ops.object.camera_add(location=(3.8,5.7,3.6))
    cam=bpy.context.object;cam.name='QA front quarter camera'
    cam.rotation_euler=(Vector((0,0,.91))-cam.location).to_track_quat('-Z','Y').to_euler()
    cam.data.type='ORTHO';cam.data.ortho_scale=3.12
    scene.camera=cam
    for loc,power,size in [((3,2,5),750,3.4),((-3,-2,4),520,3.0)]:
        bpy.ops.object.light_add(type='AREA',location=loc)
        bpy.context.object.data.energy=power;bpy.context.object.data.size=size
    dest=RUN/'qa'/'renders';dest.mkdir(parents=True,exist_ok=True)
    scene.render.filepath=str(dest/f'siege-lod{lod}.png')
    bpy.ops.render.render(write_still=True)


def build(lod):
    root,body=setup()
    add_body(body,lod)
    for y,label_row in ((.68,'F'),(-.64,'R')):
        for x,label_col in ((-.64,'L'),(.64,'R')):
            make_wheel(root,x,y,lod,label_row+label_col)
    make_bow(body,lod);make_winch(body,lod);make_bolt(body,lod)
    for side in (-1,1):make_string(body,side);make_banner(body,side,lod)
    for side in (-1,1):string_pose(DYNAMIC[f'string_{side}'],side,-.25)
    bpy.context.view_layer.update()
    meshes=[ob for ob in bpy.context.scene.objects if ob.type=='MESH']
    for ob in meshes:
        uv=ob.data.uv_layers.active or ob.data.uv_layers.new(name='Architectural UV')
        uv.name='Architectural UV'
        for other in list(ob.data.uv_layers):
            if other!=uv:ob.data.uv_layers.remove(other)
    g.uv_all(meshes)
    preview(lod)
    animate()
    bpy.context.scene.frame_set(0)
    bpy.ops.file.pack_all()
    source=RUN/'raw'/f'siege-lod{lod}.blend';source.parent.mkdir(parents=True,exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=str(source))
    source_parts=len(meshes)
    compact_export()
    bpy.context.view_layer.update()
    meshes=[ob for ob in bpy.context.scene.objects if ob.type=='MESH']
    triangles=sum(sum(len(poly.vertices)-2 for poly in ob.data.polygons) for ob in meshes)
    bounds=[ob.matrix_world@Vector(c) for ob in meshes for c in ob.bound_box]
    low=[round(min(v[i] for v in bounds),4) for i in range(3)]
    high=[round(max(v[i] for v in bounds),4) for i in range(3)]
    bpy.ops.object.select_all(action='DESELECT')
    for ob in bpy.context.scene.objects:
        if ob.type in {'MESH','EMPTY'}:ob.select_set(True)
    bpy.context.view_layer.objects.active=root
    out=RUN/'candidate'/f'siege-lod{lod}.glb';out.parent.mkdir(parents=True,exist_ok=True)
    bpy.ops.export_scene.gltf(filepath=str(out),export_format='GLB',use_selection=True,
                              export_yup=True,export_apply=True,export_normals=True,
                              export_texcoords=True,export_materials='EXPORT',export_extras=True,
                              export_animations=True,export_animation_mode='NLA_TRACKS',
                              export_nla_strips=True,export_anim_slide_to_zero=True)
    return {'lod':lod,'triangles_blender':triangles,'source_parts':source_parts,
            'glb_mesh_objects':len(meshes),'materials_used':sorted({m.name for ob in meshes for m in ob.data.materials}),
            'bounds_min_blender_xyz_m':low,'bounds_max_blender_xyz_m':high,
            'source':str(source.relative_to(ROOT)),'glb':str(out.relative_to(ROOT)),
            'source_sha256':hashlib.sha256(source.read_bytes()).hexdigest(),
            'glb_sha256':hashlib.sha256(out.read_bytes()).hexdigest(),
            'glb_bytes':out.stat().st_size,'status':'candidate','runtime_publish_allowed':False}


if __name__=='__main__':
    reports=[]
    for lod in (0,1):
        print('BUILD SIEGE LOD',lod,flush=True)
        reports.append(build(lod))
    dest=RUN/'qa'/'mechanical.json';dest.parent.mkdir(parents=True,exist_ok=True)
    dest.write_bytes(json.dumps(reports,indent=2).encode('utf-8'))
    print(json.dumps(reports,indent=2),flush=True)
