"""Batch source repair: anatomical wrists, shaped closed hands and held equipment."""
import bpy,bmesh,json,sys,math,hashlib
import numpy as np
from pathlib import Path
from mathutils import Vector,Matrix
sys.path.insert(0,str(Path(__file__).parent))
import procedural_gauntlet_build as g
from commander_assembly_hands import sculpted_parts
from commander_assembly_build import surface as old_surface
from all_models_pack import package
ROOT=Path(__file__).resolve().parents[3]
RUN=ROOT/'art-factory/rts/runs/all-models/2026-10-14-v1'

def save(path,obj):path.write_bytes((json.dumps(obj,indent=2)+'\n').encode())
def source(unit):
    registry=json.loads((ROOT/'art-factory/rts/manifests/unit-registry.json').read_bytes())
    return ROOT/next(r['source'] for r in registry['assets'] if r['id']==unit)
def reset_hand_locations(rig):
    for a in bpy.data.actions:
        g.set_action(rig,a.name)
        for s in 'LR':
            b=rig.pose.bones['Hand_'+s]
            for f in range(int(a.frame_range[0]),int(a.frame_range[1])+1):
                b.location=(0,0,0);b.keyframe_insert('location',frame=f)
    g.set_action(rig,'Idle');bpy.context.scene.frame_set(0)

def explicit_locations(rig):
    for a in bpy.data.actions:
        for s in 'LR':rig.pose.bones['Hand_'+s].location=(0,0,0)
        g.set_action(rig,a.name)
        for f in range(int(a.frame_range[0]),int(a.frame_range[1])+1):
            bpy.context.scene.frame_set(f)
            for s in 'LR':rig.pose.bones['Hand_'+s].keyframe_insert('location',frame=f)
    g.set_action(rig,'Idle');bpy.context.scene.frame_set(0)

def trim(body,rig,side,proximal=.035):
    # Cut triangles at the measured anatomical cuff plane, retaining the
    # generated body's UVs and interpolated skin weights at the new rim.
    unit='guard' if body.name.startswith('Guard') else 'priest' if body.name.startswith('priest') else 'worker' if body.name.startswith('worker') else 'neutral-raider'
    lod=int(body.name[-1])
    planes={
      'priest': {'R':[(.388,.1044,1.035),(.388,.1044,1.035)]},
      'worker': {'R':[(.36780956,0,.92105579),(.36780956,0,.92105579)]},
      'neutral-raider': {'R':[(.393500,.027882,.971827),(.394223,.023208,.972453)]},
      'guard': {'L':[(-.434176,-.046531,.911712),(-.433313,-.049433,.911592)],'R':[(.409796,.089432,.902662),(.392991,.089176,.898482)]}}
    normals={'worker':{'R':(.3749,0,-.9271)},'priest':{'R':(.3749,0,-.9271)},'neutral-raider':{'R':(.3842,0,-.9233)},'guard':{'L':(-.9602,.2053,-.1895),'R':(.2343,-.6376,-.7338)}}
    wrist_center=Vector(planes[unit][side][lod]);axis=Vector(normals[unit][side]).normalized();roi=.16 if unit=='priest' else .09
    center=wrist_center-axis*proximal
    bm=bmesh.new();bm.from_mesh(body.data);bm.verts.ensure_lookup_table();before=len(bm.faces)
    def local(v):
        d=v.co-center;t=d.dot(axis);return t,(d-axis*t).length
    region={v for v in bm.verts if -.10<local(v)[0]<.35 and local(v)[1]<roi}
    faces=[f for f in bm.faces if any(v in region for v in f.verts)]
    edges=list({e for f in faces for e in f.edges});vertices=list({v for f in faces for v in f.verts})
    result=bmesh.ops.bisect_plane(bm,geom=[*vertices,*edges,*faces],dist=1e-6,plane_co=center,plane_no=axis,clear_outer=True,clear_inner=False)
    rim=[v for v in bm.verts if abs((v.co-center).dot(axis))<1e-5 and (v.co-center).length<roi+.02]
    assert len(rim)>=8,(body.name,side,'bad cuff rim',len(rim))
    radius=max((v.co-center).length for v in rim)
    residual=[v for v in bm.verts if (d:=v.co-center).dot(axis)>.001 and (d-axis*d.dot(axis)).length<roi and d.dot(axis)<.20 and v.link_faces]
    assert not residual,(body.name,side,'residual old palm',len(residual))
    bridge_faces=0
    if unit=='priest':
        # Preserve the actual irregular generated robe edge. Close its cut
        # with a tapered sleeve, retaining the adjacent cloth's material/UV,
        # rather than leaving a broad opening behind a narrow leather wrist.
        boundary=[e for e in bm.edges if e.is_boundary and all(abs((v.co-center).dot(axis))<1e-5 for v in e.verts)]
        uv=bm.loops.layers.uv.active;deform=bm.verts.layers.deform.verify();group=body.vertex_groups['Forearm_'+side].index
        inner={};uvs={}
        for edge in boundary:
            for loop in edge.link_loops:
                for sample in (loop,loop.link_loop_next):
                    if uv:uvs[sample.vert]=sample[uv].uv.copy()
            for v in edge.verts:
                if v not in inner:
                    radial=v.co-center;radial-=axis*radial.dot(axis)
                    n=bm.verts.new(wrist_center+axis*.008+radial.normalized()*.040)
                    n[deform][group]=1;inner[v]=n
        tip=bm.verts.new(wrist_center+axis*.010);tip[deform][group]=1
        for edge in boundary:
            a,b=edge.verts;material=edge.link_faces[0].material_index
            face=bm.faces.new((a,b,inner[b],inner[a]));face.material_index=material
            cap=bm.faces.new((inner[a],inner[b],tip));cap.material_index=material
            for f in (face,cap):
                if uv:
                    for loop in f.loops:
                        original=a if loop.vert in (a,inner[a],tip) else b
                        loop[uv].uv=uvs.get(original,Vector((0,0)))
                        if loop.vert in (inner[a],inner[b],tip):loop[uv].uv.y+=.035
                bridge_faces+=1
        bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces))
    bmesh.ops.delete(bm,geom=[v for v in bm.verts if not v.link_faces],context='VERTS');bm.to_mesh(body.data);bm.free()
    for v in body.data.vertices:
        d=v.co-center;t=d.dot(axis)
        if -.025<t<.0001 and (d-axis*t).length<roi:
            for group in body.vertex_groups:group.remove([v.index])
            body.vertex_groups['Forearm_'+side].add([v.index],1,'REPLACE')
    return {'wrist':list(wrist_center),'cut_center':list(center),'radius':radius,'removed_faces':before-len(body.data.polygons),'plane_normal':list(axis),'roi':roi,'residual_palm_vertices':len(residual),'rim_vertices':len(rim),'sleeve_bridge_faces':bridge_faces}

def hand(name,rig,side,center,axis,radius,wrist,wr,lod,ref,mats,steel=False):
    cfg=dict(g.GAUNTLET_DEFAULTS);cfg.update(finger_width=.0215,finger_thickness=.0185,repeat=.12)
    outward=Vector((1 if side=='R' else -1,.15,0));frame,local,thumb=g.hand_frame(center,axis,wrist,radius,cfg,side,outward)
    parts=sculpted_parts(radius,local,wr,cfg,1,'AssemblyDetail_leather','AssemblyDetail_steel' if steel else 'AssemblyDetail_leather')
    if steel:parts=[p for p in parts if '_plate_' not in p.name or p.name.endswith('_0')]
    if not steel:parts=[p for p in parts if '_plate_' not in p.name and p.name!='dorsal_plate']
    parts=[p.transformed(frame,mirror_x=side=='L') for p in parts]
    fb=rig.pose.bones['Forearm_'+side];distal=(fb.tail-fb.head).normalized()
    parts.append(g.cuff_part(wrist,distal,wr,'AssemblyDetail_leather',1,1.035,.045,.15))
    for p in parts:
        p.weights=[{('Hand_' if k=='Hand' else 'Forearm_')+side:v for k,v in w.items()} for w in p.weights];g.to_bind(p,ref)
    obj=g.parts_to_object(name,parts,rig,mats);obj['original_gauntlet_parts']=json.dumps([p.name for p in parts]);obj['assembly_refinement']='Four curved fingers, crossing thumb and forearm-weighted cuff'
    # A seven-sided rounded finger has 51-degree adjacent faces; the inherited
    # 50-degree hard-edge rule turned every segment into a flat prism.
    obj.data.set_sharp_from_angle(angle=math.radians(85))
    return obj,{'name':name,'side':side,'lod':lod,'grip':list(center),'axis':list(axis),'radius':radius,'wrist':list(wrist),'wrist_radius':wr,'triangles':g.tri_count(obj),'parts':[p.name for p in parts]}

def orient_hand(rig,side,wrist,center,axis,world_axis,blend):
    b=rig.pose.bones['Hand_'+side];fore=rig.pose.bones['Forearm_'+side];skin=fore.matrix@fore.bone.matrix_local.inverted()
    a=axis.normalized();d=center-wrist;d=(d-a*d.dot(a)).normalized();basis=Matrix((a,d,a.cross(d))).transposed()
    A=world_axis.normalized();D=fore.tail-fore.head;D=(D-A*D.dot(A)).normalized()
    target=Matrix((A,D,A.cross(D))).transposed()@basis.transposed()@b.bone.matrix_local.to_3x3()
    neutral=b.matrix.to_quaternion();q=neutral.slerp(target.to_quaternion(),blend)
    matrix=q.to_matrix().to_4x4();matrix.translation=skin@wrist-matrix.to_3x3()@(b.bone.matrix_local.inverted()@wrist)
    b.matrix=matrix;bpy.context.view_layer.update()

def death(rig,unit,wrists,centers,axes):
    action=bpy.data.actions['Death'];g.set_action(rig,'Death');start,end=map(int,action.frame_range);original={}
    for f in range(start,end+1):
        bpy.context.scene.frame_set(f);original[f]={n:rig.pose.bones[n].matrix.copy() for n in ('Forearm_R','Hand_R','Hand_L')}
    for f in range(start,end+1):
        bpy.context.scene.frame_set(f);t=(f-start)/(end-start);blend=g.smooth((t-.06)/.44)
        fore=rig.pose.bones['Forearm_R'];m=original[f]['Forearm_R'];q=m.to_quaternion();direction=Vector((.95,-.05,.14) if unit in ('crossbow','priest','guard') else (.62,-.65,.10)).normalized()
        fore_blend=g.smooth((t-.02)/.32) if unit=='priest' else blend
        q=q.slerp((m.to_3x3()@Vector((0,1,0))).rotation_difference(direction)@q,fore_blend)
        pose=q.to_matrix().to_4x4();pose.translation=m.translation;fore.matrix=pose;fore.keyframe_insert('rotation_quaternion',frame=f);bpy.context.view_layer.update()
        target_axis=(0,-1,.025) if unit=='priest' else (-1,0,.025) if unit=='guard' else (1,0,.10)
        orient_hand(rig,'R',wrists['R'],centers['R'],axes['R'],Vector(target_axis),blend)
        for prop in ('rotation_quaternion','location'):rig.pose.bones['Hand_R'].keyframe_insert(prop,frame=f)
    return [('Forearm_R','rotation'),('Hand_R','rotation'),('Hand_R','translation')]

def guard_shield_death(rig,wrists):
    g.set_action(rig,'Death');action=bpy.data.actions['Death'];start,end=map(int,action.frame_range);original={}
    for f in range(start,end+1):
        bpy.context.scene.frame_set(f);original[f]=rig.pose.bones['Forearm_L'].matrix.copy()
    for f in range(start,end+1):
        bpy.context.scene.frame_set(f);blend=g.smooth(((f-start)/(end-start)-.06)/.44);fore=rig.pose.bones['Forearm_L'];m=original[f]
        q=m.to_quaternion();target=(m.to_3x3()@Vector((0,1,0))).rotation_difference(Vector((-.96,-.08,.14)).normalized())@q
        pose=q.slerp(target,blend).to_matrix().to_4x4();pose.translation=m.translation;fore.matrix=pose;fore.keyframe_insert('rotation_quaternion',frame=f);bpy.context.view_layer.update()
        b=rig.pose.bones['Hand_L'];target=(Matrix.Rotation(math.pi/2,3,'X')@b.bone.matrix_local.to_3x3()).to_quaternion();q=b.matrix.to_quaternion().slerp(target,blend)
        m=q.to_matrix().to_4x4();m.translation=(fore.matrix@fore.bone.matrix_local.inverted())@wrists['L']-m.to_3x3()@(b.bone.matrix_local.inverted()@wrists['L']);b.matrix=m
        for prop in ('rotation_quaternion','location'):b.keyframe_insert(prop,frame=f)
    return [('Forearm_L','rotation'),('Hand_L','rotation'),('Hand_L','translation')]

def guard_sword_floor(rig,wrists,objects):
    points=[v.co.copy() for o in objects if o.name.startswith('KingdomSteelSword') for v in o.data.vertices];changes={}
    for clip in ('Attack','Hurt'):
        g.set_action(rig,clip);action=bpy.data.actions[clip];samples={}
        for f in range(int(action.frame_range[0]),int(action.frame_range[1])+1):
            bpy.context.scene.frame_set(f);bone=rig.pose.bones['Hand_R'];fore=rig.pose.bones['Forearm_R']
            samples[f]=(bone.matrix.copy(),(fore.matrix@fore.bone.matrix_local.inverted())@wrists['R'])
        local=bone.bone.matrix_local.inverted()@wrists['R'];inv=bone.bone.matrix_local.inverted();chosen=None
        # A single correction for the entire authored arc keeps neighboring
        # keys on the same continuous path. Per-key minimum rotations flip
        # branches and let the sword dip below ground during SLERP.
        for angle in range(0,151):
            for sign in (1,-1):
                rotation=Matrix.Rotation(math.radians(angle*sign),3,'X');poses={}
                for f,(original,wrist) in samples.items():
                    m=(rotation@original.to_3x3()).to_4x4();m.translation=wrist-m.to_3x3()@local
                    skin=m@inv
                    if min((skin@p).z for p in points)<.07:break
                    poses[f]=m
                if len(poses)==len(samples):chosen=poses;break
            if chosen is not None:break
        assert chosen is not None,('No continuous sword clearance solution',clip)
        for f,best in chosen.items():
            bpy.context.scene.frame_set(f);bone=rig.pose.bones['Hand_R'];bone.matrix=best
            for prop in ('rotation_quaternion','location'):bone.keyframe_insert(prop,frame=f)
        changes[clip]=[('Hand_R','rotation'),('Hand_R','translation')]
    return changes

def crossbow_fall(rig,wrists,centers,axes):
    # During the fall the support hand releases the stock. Keep the firing
    # hand attached, letting the crossbow settle beside the body face-up.
    g.set_action(rig,'Idle');bpy.context.scene.frame_set(0)
    rest=(Matrix.Rotation(math.radians(-25),3,'Z')@rig.pose.bones['Hand_R'].matrix.to_3x3()).to_quaternion()
    channels=death(rig,'crossbow',wrists,centers,axes)
    g.set_action(rig,'Death');action=bpy.data.actions['Death'];start,end=map(int,action.frame_range)
    for f in range(start,end+1):
        bpy.context.scene.frame_set(f);blend=g.smooth(((f-start)/(end-start)-.06)/.44);b=rig.pose.bones['Hand_R'];fore=rig.pose.bones['Forearm_R']
        q=b.matrix.to_quaternion().slerp(rest,blend);m=q.to_matrix().to_4x4();m.translation=(fore.matrix@fore.bone.matrix_local.inverted())@wrists['R']-m.to_3x3()@(b.bone.matrix_local.inverted()@wrists['R']);b.matrix=m
        for prop in ('rotation_quaternion','location'):b.keyframe_insert(prop,frame=f)
    save(RUN/'qa/crossbow-death-ik.json',{'support_hand':'releases stock while falling','firing_hand':'held with anatomical wrist pivot','release_blend':[.06,.5]})
    return channels

def priest_staff_pose(rig,wrists,centers,axes):
    changes={}
    for clip in g.CLIPS:
        if clip=='Death':continue
        g.set_action(rig,clip);a=bpy.data.actions[clip]
        for f in range(int(a.frame_range[0]),int(a.frame_range[1])+1):
            bpy.context.scene.frame_set(f);phase=(f-a.frame_range[0])/max(1,a.frame_range[1]-a.frame_range[0]);tilt=.15*math.sin(math.pi*phase) if clip in ('Cast','Attack') else 0
            orient_hand(rig,'R',wrists['R'],centers['R'],axes['R'],Vector((.06+tilt,.04,1)),1)
            for prop in ('rotation_quaternion','location'):rig.pose.bones['Hand_R'].keyframe_insert(prop,frame=f)
        changes[clip]=[('Hand_R','rotation'),('Hand_R','translation')]
    return changes

def guard_motion(rig,wrists,centers,axes):
    """Keep elbow/wrist chains connected and carry both weapons ahead of armor."""
    changes={}
    for clip in g.CLIPS:
        g.set_action(rig,clip);a=bpy.data.actions[clip];captured={}
        for f in range(int(a.frame_range[0]),int(a.frame_range[1])+1):
            bpy.context.scene.frame_set(f)
            captured[f]={s:rig.pose.bones['UpperArm_'+s].head.copy() for s in 'LR'}
        for f,heads in captured.items():
            bpy.context.scene.frame_set(f);t=(f-a.frame_range[0])/max(1,a.frame_range[1]-a.frame_range[0]);fall=g.smooth((t-.04)/.52) if clip=='Death' else 0
            wind=math.sin(math.pi*min(1,t/.36)) if clip=='Attack' and t<.36 else 0
            strike=math.sin(math.pi*(t-.30)/.4) if clip=='Attack' and .30<t<.70 else 0
            chest=rig.pose.bones['SpineUpper'];body_rotation=(chest.matrix@chest.bone.matrix_local.inverted()).to_3x3()
            for s in 'LR':
                side=1 if s=='R' else -1
                upper_local=Vector((side*(.17+.13*wind if s=='R' else .2),.05+.15*wind if s=='R' else .04,-.98+.10*wind if s=='R' else -.97)).normalized()
                fore_local=Vector((side*.12,.94-.32*wind,-.25+1.0*wind if s=='R' else .12)).normalized()
                upper_rest=Vector((side*.85,-.25,-.45 if s=='R' else -.20)).normalized()
                fore_rest=Vector((side*.91,-.20,-.13 if s=='R' else -.05)).normalized()
                upper_direction=(body_rotation@upper_local).lerp(upper_rest,fall).normalized()
                fore_direction=(body_rotation@fore_local).lerp(fore_rest,fall).normalized()
                for name,direction,head in [('UpperArm_'+s,upper_direction,heads[s]),('Forearm_'+s,fore_direction,None)]:
                    b=rig.pose.bones[name];rest=b.bone.matrix_local.to_3x3();rest_direction=rest@Vector((0,1,0));rotation=rest_direction.rotation_difference(direction).to_matrix()@rest
                    m=rotation.to_4x4();m.translation=head if head is not None else rig.pose.bones['UpperArm_'+s].tail;b.matrix=m;bpy.context.view_layer.update()
                    for prop in ('rotation_quaternion','location'):b.keyframe_insert(prop,frame=f)
                if s=='R':
                    axis=body_rotation@Vector((-.10,-.32-.60*strike,.94-1.84*wind-.60*strike)).normalized()
                    axis=axis.lerp(Vector((-1,0,.025)).normalized(),fall).normalized()
                else:axis=(body_rotation@Vector((1,0,0))).lerp(Vector((1,0,0)),fall).normalized()
                orient_hand(rig,s,wrists[s],centers[s],axes[s],axis,1)
                if s=='L' and fall:
                    b=rig.pose.bones['Hand_L'];fore=rig.pose.bones['Forearm_L'];target=(Matrix.Rotation(math.radians(15),3,'X')@b.bone.matrix_local.to_3x3()).to_quaternion();q=b.matrix.to_quaternion().slerp(target,fall)
                    m=q.to_matrix().to_4x4();m.translation=(fore.matrix@fore.bone.matrix_local.inverted())@wrists[s]-m.to_3x3()@(b.bone.matrix_local.inverted()@wrists[s]);b.matrix=m
                for prop in ('rotation_quaternion','location'):rig.pose.bones['Hand_'+s].keyframe_insert(prop,frame=f)
            if clip=='Death':
                b=rig.pose.bones['Root'];m=b.matrix.copy();m.translation.z+=.006;b.matrix=m;b.keyframe_insert('location',frame=f)
        changes[clip]=[(part+'_'+s,path)for s in 'LR'for part in ('UpperArm','Forearm','Hand')for path in ('rotation','translation')]
        if clip=='Death':changes[clip].append(('Root','translation'))
    return changes

def equipment_uv(obj):
    uv=obj.data.uv_layers.active or obj.data.uv_layers.new(name='UVMap');fixed=0
    for p in obj.data.polygons:
        if p.area<1e-12:continue
        values=[uv.data[i].uv.copy()for i in p.loop_indices]
        area=sum(abs((values[j]-values[0]).cross(values[j+1]-values[0]))for j in range(1,len(values)-1))
        material=obj.data.materials[p.material_index].name
        if area>1e-8 and material not in ('AssemblyDetail_steel','AssemblyDetail_brass'):continue
        normal=p.normal;drop=max(range(3),key=lambda i:abs(normal[i]));coords=[i for i in range(3)if i!=drop]
        for i in p.loop_indices:
            v=obj.data.vertices[obj.data.loops[i].vertex_index].co;uv.data[i].uv=(v[coords[0]]/.22,v[coords[1]]/.22)
        fixed+=1
    return fixed

def raider_attack_clearance(rig):
    g.set_action(rig,'Attack');a=bpy.data.actions['Attack'];samples={}
    for f in range(int(a.frame_range[0]),int(a.frame_range[1])+1):
        bpy.context.scene.frame_set(f);samples[f]=rig.pose.bones['UpperArm_R'].matrix.copy()
    for f,original in samples.items():
        bpy.context.scene.frame_set(f);t=(f-a.frame_range[0])/max(1,a.frame_range[1]-a.frame_range[0]);swing=math.sin(math.pi*min(1,t/.40)) if t<.4 else 0
        b=rig.pose.bones['UpperArm_R'];m=(Matrix.Rotation(math.radians(-38)*swing,3,'Z')@original.to_3x3()).to_4x4();m.translation=original.translation;b.matrix=m;b.keyframe_insert('rotation_quaternion',frame=f)
    return [('UpperArm_R','rotation')]

def guard_distance_budget(made,target=9900):
    """Keep the existing 10k far infantry cap without touching grip surfaces."""
    objects=[o for o in made if o.name.endswith('LOD1')]
    total=sum(g.tri_count(o)for o in objects)
    assert target<=10000
    if total<=target:return None
    body=next(o for o in objects if o.name=='GuardBody_LOD1')
    before=g.tri_count(body);protected=[];eligible=[]
    for vertex in body.data.vertices:
        preserve=any(w.weight>.01 and body.vertex_groups[w.group].name.startswith(('Hand_','Forearm_','UpperArm_','Foot_')) for w in vertex.groups)
        (protected if preserve else eligible).append(vertex.index)
    fixed={tuple(round(float(x),6)for x in body.data.vertices[i].co)for i in protected}
    group=body.vertex_groups.new(name='DistanceBodyReduction');group.add(eligible,1.0,'REPLACE')
    modifier=body.modifiers.new('DistanceBodyBudget','DECIMATE');modifier.ratio=(before-(total-target))/before
    modifier.vertex_group=group.name;modifier.vertex_group_factor=1.0;modifier.use_collapse_triangulate=True
    body.modifiers.move(len(body.modifiers)-1,0);bpy.context.view_layer.objects.active=body
    bpy.ops.object.modifier_apply(modifier=modifier.name);body.vertex_groups.remove(body.vertex_groups['DistanceBodyReduction'])
    remaining={tuple(round(float(x),6)for x in vertex.co)for vertex in body.data.vertices}
    assert fixed<=remaining,'Distance reduction changed protected wrist/arm/foot vertices'
    final=sum(g.tri_count(o)for o in objects);assert final<=10000
    return {'before_total':total,'after_total':final,'body_before':before,'body_after':g.tri_count(body),'protected_vertices':len(protected),'protected_positions_unchanged':True}


def main(unit):
    bpy.ops.wm.open_mainfile(filepath=str(source(unit)));rig=next(o for o in bpy.data.objects if o.type=='ARMATURE')
    g.CLIPS=tuple(a.name for a in bpy.data.actions);g.set_action(rig,'Idle');bpy.context.scene.frame_set(0)
    oldref=g.skin_matrices(rig);changes={};made=[];records=[];wrists={};centers={};axes={}
    explicit_locations(rig)
    if unit=='guard':
        reset_hand_locations(rig)
        changes={c:[('Hand_'+s,'translation') for s in 'LR'] for c in g.CLIPS}
    ref=g.skin_matrices(rig);mats={}
    for kind in ('leather','steel','oak','brass'):
        m=old_surface(kind);m.name='AssemblyDetail_'+kind;mats[m.name]=m
    oldrows={}
    if unit in ('worker','guard','crossbow'):
        oldrun='2026-10-09-guard-a2' if unit=='guard' else '2026-10-09-crossbow-a2' if unit=='crossbow' else '2026-10-09-worker-v1'
        paths=list((ROOT/'art-factory/rts/runs/procedural-gauntlet').glob('*worker*/qa/build.json')) if unit=='worker' else [ROOT/f'art-factory/rts/runs/procedural-gauntlet/{oldrun}/qa/build.json']
        data=json.loads(paths[0].read_bytes());oldrows={r['side']:r for r in data['gauntlets'] if r['detail']==0}
    sides='LR' if unit in ('guard','crossbow') else 'R'
    for lod in (0,1):
        body=bpy.data.objects[('GuardBody' if unit=='guard' else unit+'OriginalBody')+f'_LOD{lod}'];made.append(body)
        for side in sides:
            oldname=(f'GuardGauntlet_{side}_LOD{lod}' if unit=='guard' else f'ProceduralGauntlet_{side}_LOD{lod}')
            if oldname in bpy.data.objects:bpy.data.objects.remove(bpy.data.objects[oldname],do_unlink=True)
            if unit in ('guard','priest','neutral-raider'):
                cut=trim(body,rig,side,.030 if unit=='guard' else .035 if unit=='priest' else .010);wrist_bind=Vector(cut['wrist']);wr=min(.052,max(.036,cut['radius']))
            else:
                r=oldrows[side];wrist_bind=oldref['Forearm_'+side].inverted()@Vector(r['wrist_ref']);wr=r['wrist_radius_m'];cut={'wrist':list(wrist_bind),'radius':wr,'removed_faces':0}
                if unit=='worker':cut=trim(body,rig,side,.008)
            wrist=ref['Forearm_'+side]@wrist_bind
            weapons={'worker':'WorkerCraftAxe','guard':'KingdomSteelSword' if side=='R' else 'KingdomSunShield','crossbow':'ProceduralCrossbow','priest':'PriestDawnStaff','neutral-raider':'RaiderShortAxe'}
            weapon=bpy.data.objects[weapons[unit]+f'_LOD{lod}']
            if unit in ('worker','crossbow'):
                r=oldrows[side];center=Vector(r['grip_center_ref']);axis=Vector(r['thumb_axis_ref']);radius=r['grip_radius_m']
            else:
                c,a,r,lo,hi=g.weapon_region(weapon,{'WornLeather','WornLeatherGrip'});center=oldref['Hand_'+side]@c;axis=(oldref['Hand_'+side].to_3x3()@a).normalized();radius=max(.012,min(.024,r))
                # Fit each weapon to a proper palm continuing the anatomical wrist.
                forward=(rig.pose.bones['Forearm_'+side].tail-rig.pose.bones['Forearm_'+side].head).normalized()
                delta=forward*.070+Vector((.018 if side=='R' else -.018,.045,0));perpendicular=delta-axis*delta.dot(axis)
                if unit in ('guard','priest','neutral-raider'):
                    delta=perpendicular.normalized()*.095+axis*max(-.015,min(.015,delta.dot(axis)))
                target=wrist+delta
                for v in weapon.data.vertices:v.co=ref['Hand_'+side].inverted()@(oldref['Hand_'+side]@v.co+target-center)
                center=target
            obj,record=hand(oldname if unit in ('worker','crossbow','guard') else f'AssemblyHand_{side}_LOD{lod}',rig,side,center,axis,radius,wrist,wr,lod,ref,mats,unit=='guard')
            record['cut']=cut;made.append(obj);records.append(record)
            if weapon not in made:made.append(weapon)
            wrists[side]=wrist_bind;centers[side]=ref['Hand_'+side].inverted()@center;axes[side]=(ref['Hand_'+side].to_3x3().inverted()@axis).normalized()
        # Reuse the generated, registered metal/wood/leather surface set.
        mapping={'WornLeatherGrip':'leather','WornLeather':'leather','WorkedAshWood':'oak','ForgedToolSteel':'steel','ForgedSteel':'steel','WarmBrass':'brass','OldBrassFittings':'brass','DarkIron':'steel'}
        for obj in made:
            if obj==body:continue
            for i,m in enumerate(obj.data.materials):
                if m.name in mapping:obj.data.materials[i]=mats['AssemblyDetail_'+mapping[m.name]]
    if unit=='priest':
        for o in made:
            if o.name.startswith('PriestDawnStaff'):
                a=axes['R'].copy()
                if a.z<0:a=-a
                for v in o.data.vertices:
                    t=(v.co-centers['R']).dot(a)
                    if t<0:v.co-=a*t*.065
        changes.update(priest_staff_pose(rig,wrists,centers,axes))
    if unit=='crossbow':
        report=g.offset_hands(rig,Vector((0,.08,.015)),fade_clips={'Death':.35});save(RUN/'qa/crossbow-forward-ik.json',report)
        changes={clip:[(bone+'_'+s,p) for s in 'LR' for bone in ('UpperArm','Forearm','Hand') for p in ('rotation','translation')] for clip in g.CLIPS}
        changes.setdefault('Death',[]).extend(crossbow_fall(rig,wrists,centers,axes))
    elif unit!='guard':changes.setdefault('Death',[]).extend(death(rig,unit,wrists,centers,axes))
    if unit=='guard':
        changes.update(guard_motion(rig,wrists,centers,axes))
    if unit=='neutral-raider':changes['Attack']=raider_attack_clearance(rig)
    uv_repairs={o.name:equipment_uv(o)for o in made if any(x in o.name for x in ('Sword','Shield','Axe','Staff'))}
    changes={clip:list(dict.fromkeys(channels)) for clip,channels in changes.items()}
    for a in bpy.data.actions:
        for layer in a.layers:
            for strip in layer.strips:
                for slot in a.slots:
                    bag=strip.channelbag(slot)
                    if bag:
                        for bone,path in changes.get(a.name,[]):
                            if path!='rotation':continue
                            curves=sorted([c for c in bag.fcurves if c.data_path==f'pose.bones["{bone}"].rotation_quaternion'],key=lambda c:c.array_index)
                            if len(curves)!=4:continue
                            previous=None
                            for i in range(min(len(c.keyframe_points) for c in curves)):
                                values=[c.keyframe_points[i].co.y for c in curves]
                                if previous is not None and sum(x*y for x,y in zip(previous,values))<0:
                                    for c in curves:c.keyframe_points[i].co.y*=-1
                                    values=[-x for x in values]
                                previous=values
                        for curve in bag.fcurves:
                            if any('\"'+bone+'\"' in curve.data_path for bone,path in changes.get(a.name,[])):
                                for key in curve.keyframe_points:key.interpolation='LINEAR'
    budget=guard_distance_budget(made)if unit=='guard'else None
    g.set_action(rig,'Idle');bpy.context.scene.frame_set(0);bounds=g.conservative_bounds(made,rig)
    for o in made:o['rtsConservativeBounds']=bounds[o.name];o.hide_render=o.name.endswith('LOD1')
    blend=RUN/f'raw/{unit}-assembly.blend';bpy.ops.wm.save_as_mainfile(filepath=str(blend))
    for o in made:
        bm=bmesh.new();bm.from_mesh(o.data);bmesh.ops.triangulate(bm,faces=list(bm.faces));bm.to_mesh(o.data);bm.free()
    outputs=[]
    for lod in (0,1):
        bpy.ops.object.select_all(action='DESELECT');objects=[o for o in made if o.name.endswith(f'LOD{lod}')]
        for o in [rig,*objects]:o.hide_set(False);o.select_set(True)
        bpy.context.view_layer.objects.active=rig;exported=RUN/f'raw/{unit}-edited-lod{lod}.glb'
        bpy.ops.export_scene.gltf(filepath=str(exported),export_format='GLB',use_selection=True,export_animations=True,export_animation_mode='ACTIONS',export_nla_strips=False,export_force_sampling=True,export_optimize_animation_size=False,export_skins=True,export_extras=True,export_yup=True,export_tangents=True)
        base=RUN/f'raw/before/{unit}{"-lod1" if lod else ""}.glb';target=RUN/f'candidate/{unit}{"-lod1" if lod else ""}.glb'
        outputs.append(package(base,exported,target,[o.name for o in objects],bounds,changes))
    save(RUN/f'qa/{unit}-build.json',{'unit':unit,'source':str(source(unit)),'hands':records,'outputs':outputs,'uv_repaired_faces':uv_repairs,'changed_channels':changes,'source_sha256':hashlib.sha256(blend.read_bytes()).hexdigest(),'distance_budget':budget})
    print(json.dumps({'unit':unit,'hands':len(records),'outputs':outputs}))
if __name__=='__main__':main(sys.argv[sys.argv.index('--')+1])
