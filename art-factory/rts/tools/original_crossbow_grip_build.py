import bpy, json, math, os, sys
from mathutils import Vector, Quaternion, Matrix
sys.path.insert(0,os.path.dirname(os.path.abspath(__file__)))

SOURCE_ACTIONS={'Idle':(0,40),'Walk':(0,40),'Attack':(0,40),'Hurt':(0,28),'Death':(0,50)}
TRIGGER_CENTER=Vector((0.36838,0.06000,0.84114))
STOCK_SUPPORT=Vector((0.36838,0.20000,0.83864))
RIGHT_READY=Vector((0.08,0.10,1.10))
WALK_BOB=0.008
FRONT=(0.0,1.0,0.0)

def v3(v): return [round(float(x),6) for x in v]
def set_action(rig,action):
    rig.animation_data_create()
    rig.animation_data.action=action
    slots=getattr(action,'slots',[])
    if slots:
        try: rig.animation_data.action_slot=slots[0]
        except Exception: pass

def make_empty(name,rig):
    obj=bpy.data.objects.new(name,None)
    obj.empty_display_type='SPHERE';obj.empty_display_size=0.035
    bpy.context.collection.objects.link(obj);obj.parent=rig
    return obj

def update():
    bpy.context.view_layer.update()
    bpy.context.evaluated_depsgraph_get().update()

def key_target(obj,frame,loc,rot):
    obj.location=loc
    obj.rotation_mode='QUATERNION'
    obj.rotation_quaternion=rot
    obj.keyframe_insert(data_path='location',frame=frame,group='crossbow grip IK')
    obj.keyframe_insert(data_path='rotation_quaternion',frame=frame,group='crossbow grip IK')

def rigid_fit_weapon(weapon_objects,rig,right_channel):
    delta=right_channel-TRIGGER_CENTER
    for obj in weapon_objects:
        for vert in obj.data.vertices:vert.co+=delta
        obj.data.update()
    return delta,right_channel.copy(),STOCK_SUPPORT+delta

def sample_clips(rig,actions,right_target,left_target,right_ik,left_ik,pole_r,pole_l,grip_rest,stock_rest,report):
    baked={}
    for name,(frame_start,frame_end) in SOURCE_ACTIONS.items():
        source=actions[name]
        set_action(rig,source)
        # always preserve original source actions in the blend as provenance, but bake into fresh Actions
        source.name='Source_'+name
        right_ik.mute=True
        left_ik.mute=(name=='Death')
        samples=[]
        for frame in range(frame_start,frame_end+1):
            bpy.context.scene.frame_set(frame);update()
            hand=rig.pose.bones['Hand_R']
            original_q=(rig.matrix_world.to_quaternion() @ hand.matrix.to_quaternion()).normalized()
            right_loc=RIGHT_READY.copy()
            if name=='Walk':
                phase=2.0*math.pi*frame/max(1,frame_end)
                right_loc.z += WALK_BOB*math.sin(phase)
            elif name=='Idle':
                phase=2.0*math.pi*frame/max(1,frame_end)
                right_loc.x += 0.004*math.sin(phase)
                right_loc.z += 0.003*math.sin(phase+0.6)
            elif name=='Attack':
                # short, restrained recoil while keeping the sight line and forward axis
                pulse=0.0
                for center,amount in ((8,0.032),(16,0.045),(22,0.014)):
                    pulse=max(pulse,amount*max(0.0,1.0-abs(frame-center)/4.0))
                right_loc.y -= pulse
                right_loc.z += pulse*0.24
            elif name=='Hurt':
                right_loc.y -= 0.025*math.sin(math.pi*frame/max(1,frame_end))
            # preserve the original right wrist orientation so the stock continues to point down +Y
            right_ik.mute=False
            key_target(right_target,frame,right_loc,original_q)
            update()
            if name=='Death':
                left_ik.mute=True
                samples.append({'frame':frame,'right':v3(rig.matrix_world @ hand.tail),'left_ik':False})
                continue
            right_pose=rig.pose.bones['Hand_R']
            right_rest=rig.data.bones['Hand_R'].matrix_local
            support_arm=right_pose.matrix @ right_rest.inverted() @ stock_rest
            support_world=rig.matrix_world @ support_arm
            q_left=(rig.matrix_world.to_quaternion() @ right_pose.matrix.to_quaternion()).normalized()
            key_target(left_target,frame,support_world,q_left)
            left_ik.mute=False
            update()
            hand_l=rig.pose.bones['Hand_L']
            gap=(rig.matrix_world @ hand_l.tail-support_world).length
            samples.append({'frame':frame,'right_head':v3(rig.matrix_world @ rig.pose.bones['Hand_R'].head),
                            'right_tip':v3(rig.matrix_world @ rig.pose.bones['Hand_R'].tail),
                            'left_head':v3(rig.matrix_world @ hand_l.head),
                            'left_target':v3(support_world),'left_tip':v3(rig.matrix_world @ hand_l.tail),
                            'left_gap_m':round(gap,6),'left_ik':True})
        # Bake all armature poses to a standalone Action. The targets are baked into bone keys.
        bpy.ops.object.mode_set(mode='OBJECT') if bpy.context.object and bpy.context.object.mode!='OBJECT' else None
        for obj in bpy.context.selected_objects: obj.select_set(False)
        rig.select_set(True);bpy.context.view_layer.objects.active=rig
        bpy.ops.object.mode_set(mode='POSE')
        before=set(bpy.data.actions)
        result=bpy.ops.nla.bake(frame_start=frame_start,frame_end=frame_end,step=1,
            only_selected=False,visual_keying=True,clear_constraints=False,clear_parents=False,
            use_current_action=False,bake_types={'POSE'})
        if 'FINISHED' not in result: raise RuntimeError('pose bake failed for '+name+': '+str(result))
        after=set(bpy.data.actions);created=list(after-before)
        if not created: raise RuntimeError('pose bake produced no action for '+name)
        baked_action=max(created,key=lambda a:len(getattr(a,'layers',[])))
        baked_action.name=name
        baked[name]=baked_action
        bpy.ops.object.mode_set(mode='OBJECT')
        report['clip_samples'][name]=samples
        report['baked_actions'][name]={'frames':frame_end-frame_start+1,'action':baked_action.name,
            'curve_count':sum(len(bag.fcurves) for layer in getattr(baked_action,'layers',[]) for strip in layer.strips for slot in baked_action.slots for bag in [strip.channelbag(slot)] if bag)}
    # remove only our IK constraints; source hierarchy and armature remain unchanged
    for pb in rig.pose.bones:
        for constraint in list(pb.constraints):
            if constraint.name.startswith('OriginalCrossbowGrip_'): pb.constraints.remove(constraint)
    for helper in [right_target,left_target,pole_r,pole_l]:
        bpy.data.objects.remove(helper,do_unlink=True)
    return baked


def skin_weapon_to_hand(weapon_objects,rig):
    for obj in weapon_objects:
        # The project source weapon already has an armature modifier.
        # A second modifier applies the wrist transform twice and floats the bow.
        for modifier in list(obj.modifiers):
            if modifier.type=='ARMATURE':obj.modifiers.remove(modifier)
        obj.parent=rig
        obj.matrix_parent_inverse=Matrix.Identity(4)
        obj.location=(0,0,0)
        group=obj.vertex_groups.get('Hand_R') or obj.vertex_groups.new(name='Hand_R')
        group.add(list(range(len(obj.data.vertices))),1.0,'REPLACE')
        modifier=obj.modifiers.new('OriginalCrossbowWeaponSkin','ARMATURE')
        modifier.object=rig
        modifier.use_vertex_groups=True

def sample_clips_with_real_grip(rig,actions,right_target,left_target,right_ik,left_ik,
                                pole_r,pole_l,right_fit,left_fit,stock_rest,report):
    baked={}
    captured={}
    for name,(frame_start,frame_end) in SOURCE_ACTIONS.items():
        source=actions[name]
        set_action(rig,source)
        source.name='Source_'+name
        right_ik.mute=True;left_ik.mute=True
        samples=[]
        captured[name]={}
        for frame in range(frame_start,frame_end+1):
            bpy.context.scene.frame_set(frame);update()
            right_channel=RIGHT_READY.copy()
            if name=='Walk':
                phase=2.0*math.pi*frame/max(1,frame_end)
                right_channel.z += WALK_BOB*math.sin(phase)
            elif name=='Idle':
                phase=2.0*math.pi*frame/max(1,frame_end)
                right_channel.x += 0.004*math.sin(phase)
                right_channel.z += 0.003*math.sin(phase+0.6)
            elif name=='Attack':
                pulse=0.0
                for center,amount in ((8,0.032),(16,0.045),(22,0.014)):
                    pulse=max(pulse,amount*max(0.0,1.0-abs(frame-center)/4.0))
                right_channel.y -= pulse
                right_channel.z += pulse*0.24
            elif name=='Hurt':
                right_channel.y -= 0.025*math.sin(math.pi*frame/max(1,frame_end))
            # Grip mesh fitting rotation is not a bone pose rotation.
            # Carry the reachable ready pose in torso space for every clip, including Death.
            chest=rig.pose.bones['SpineUpper'].matrix@rig.data.bones['SpineUpper'].matrix_local.inverted()
            # A stationary world pole crosses the arm axis as Death tips the torso,
            # producing an IK branch flip and a 10 cm half-frame grip excursion.
            key_target(pole_r,frame,chest@Vector((0.46,0.10,1.20)),chest.to_quaternion())
            key_target(pole_l,frame,chest@Vector((-0.46,0.10,1.20)),chest.to_quaternion())
            right_channel=chest@right_channel
            carry_q=Quaternion((0,0,1),math.radians(38))
            right_q=(chest.to_quaternion()@carry_q@rig.data.bones['Hand_R'].matrix_local.to_quaternion()).normalized()
            right_tail=right_channel+(right_q@right_fit['tail_from_channel'])
            right_ik.mute=False
            key_target(right_target,frame,right_tail,right_q)
            update()
            right_pose=rig.pose.bones['Hand_R']
            right_rest=rig.data.bones['Hand_R'].matrix_local
            support_arm=right_pose.matrix@right_rest.inverted()@stock_rest
            support_world=rig.matrix_world@support_arm
            right_rest_q=right_rest.to_quaternion()
            current_right_q=right_pose.matrix.to_quaternion()
            weapon_delta_q=(current_right_q@right_rest_q.inverted()).normalized()
            left_q=(weapon_delta_q@rig.data.bones['Hand_L'].matrix_local.to_quaternion()).normalized()
            left_tail=support_world+(left_q@left_fit['tail_from_channel'])
            left_ik.mute=False
            key_target(left_target,frame,left_tail,left_q)
            update()
            left_pose=rig.pose.bones['Hand_L']
            right_contact=rig.matrix_world@(right_pose.matrix@right_fit['channel_local'])
            left_contact=rig.matrix_world@(left_pose.matrix@left_fit['channel_local'])
            right_anchor_world=rig.matrix_world@right_channel
            left_anchor_world=rig.matrix_world@support_arm
            captured[name][frame]={pb.name:pb.matrix.copy() for pb in rig.pose.bones}
            samples.append({'frame':frame,'right_channel_target':v3(right_anchor_world),
                'right_hand_tail':v3(rig.matrix_world@right_pose.tail),'right_channel_contact':v3(right_contact),
                'left_channel_target':v3(left_anchor_world),'left_hand_tail':v3(rig.matrix_world@left_pose.tail),
                'left_channel_contact':v3(left_contact),
                'right_channel_contact_error_m':round((right_contact-right_anchor_world).length,6),
                'left_channel_contact_error_m':round((left_contact-left_anchor_world).length,6),
                'left_ik':True})
        report['clip_samples'][name]=samples
    for pb in rig.pose.bones:
        for constraint in list(pb.constraints):
            if constraint.name.startswith('OriginalCrossbowGrip_'):pb.constraints.remove(constraint)
    for helper in [right_target,left_target,pole_r,pole_l]:bpy.data.objects.remove(helper,do_unlink=True)
    # Use the matrices measured immediately after solving, not a second IK pass.
    # convert_local_to_pose restores local channels against the unchanged bind.
    for name,frames in captured.items():
        action=bpy.data.actions.new(name)
        slot=action.slots.new(id_type='OBJECT',name=rig.name)
        set_action(rig,action);rig.animation_data.action_slot=slot
        previous={}
        for frame,matrices in frames.items():
            for pb in rig.pose.bones:
                kwargs={}
                if pb.parent:
                    kwargs={'parent_matrix':matrices[pb.parent.name],
                            'parent_matrix_local':pb.parent.bone.matrix_local}
                local=pb.bone.convert_local_to_pose(matrices[pb.name],pb.bone.matrix_local,invert=True,**kwargs)
                loc,rot,scale=local.decompose()
                if pb.name in previous:rot.make_compatible(previous[pb.name])
                previous[pb.name]=rot.copy()
                pb.rotation_mode='QUATERNION';pb.location=loc;pb.rotation_quaternion=rot;pb.scale=scale
                for path in ('location','rotation_quaternion','scale'):
                    pb.keyframe_insert(data_path=path,frame=frame,group=pb.name)
        for layer in action.layers:
            for strip in layer.strips:
                bag=strip.channelbag(slot)
                if bag:
                    for curve in bag.fcurves:
                        for key in curve.keyframe_points:key.interpolation='LINEAR'
        baked[name]=action
        report['baked_actions'][name]={'frames':len(frames),'action':action.name,
            'method':'captured_visual_matrices_all_original_bones','slot':slot.identifier}
    return baked

def arm_sleeve_material():
    mat=bpy.data.materials.get('Crossbow Original Gambeson')
    if mat:return mat
    mat=bpy.data.materials.new('Crossbow Original Gambeson')
    mat.diffuse_color=(0.12,0.15,0.17,1.0)
    mat.use_nodes=True
    nodes=mat.node_tree.nodes;links=mat.node_tree.links
    bsdf=nodes.get('Principled BSDF')
    if bsdf:
        bsdf.inputs['Roughness'].default_value=0.88
        if 'Sheen Weight' in bsdf.inputs:bsdf.inputs['Sheen Weight'].default_value=0.22
        image=bpy.data.images.new('OriginalCrossbowGambesonWeave',width=128,height=128,alpha=True)
        pixels=[]
        for y in range(128):
            for x in range(128):
                warp=0.04*math.sin(2.0*math.pi*y/16.0)
                thread=0.035*math.sin(2.0*math.pi*x/6.0+warp)+0.028*math.sin(2.0*math.pi*y/6.0)
                mottling=0.012*math.sin(2.0*math.pi*(x+y)/29.0)
                f=max(0.88,min(1.12,1.0+thread+mottling))
                pixels.extend((0.12*f,0.15*f,0.17*f,1.0))
        image.pixels.foreach_set(pixels);image.pack()
        tex=nodes.new('ShaderNodeTexImage');tex.name='Original crossbow cloth weave';tex.image=image
        tex.extension='REPEAT';links.new(tex.outputs['Color'],bsdf.inputs['Base Color'])
    return mat

def sleeve_center(side,t):
    points=[Vector((side*0.16346,0.0,1.377)),Vector((side*0.27243,0.0,1.278)),
            Vector((side*0.34054,0.0,1.125)),Vector((side*0.40864,0.0,0.954))]
    lengths=[(points[i+1]-points[i]).length for i in range(3)]
    total=sum(lengths);distance=max(0.0,min(1.0,t))*total
    for i,length in enumerate(lengths):
        if distance<=length or i==2:
            q=distance/length
            center=points[i].lerp(points[i+1],q)
            if t>0.85:center+=(points[-2]-points[-1]).normalized()*(0.015*((t-0.85)/0.15))
            return center,points[i],points[i+1]
        distance-=length
    return points[-1],points[-2],points[-1]

def sleeve_radius(t):
    def smooth(x):
        x=max(0.0,min(1.0,x));return x*x*(3.0-2.0*x)
    shoulder_cap=0.037*(1.0-smooth(t/0.38))
    elbow=0.008*math.exp(-((t-0.62)/0.09)**2)
    taper=0.024*smooth((t-0.76)/0.24)
    return 0.052+shoulder_cap+elbow-taper

def build_original_sleeve(rig,side,label,rows=36,cols=24):
    from original_crossbow_grip_math import arm_section_frame,arm_skin_weights
    verts=[];uvs=[];faces=[]
    for i in range(rows+1):
        t=i/rows
        center,seg_a,seg_b=sleeve_center(side,t)
        axis,u,v=arm_section_frame(tuple(seg_a),tuple(seg_b))
        axis=Vector(axis);u=Vector(u);v=Vector(v)
        radius=sleeve_radius(t)
        for j in range(cols):
            angle=2.0*math.pi*j/cols
            p=center+u*(radius*0.86*math.cos(angle))+v*(radius*math.sin(angle))
            verts.append(tuple(p));uvs.append((j/cols,t*3.0))
    for i in range(rows):
        for j in range(cols):
            a=i*cols+j;b=i*cols+(j+1)%cols
            faces.append((a,(i+1)*cols+j,(i+1)*cols+(j+1)%cols,b))
    faces.append(tuple(reversed(range(cols))))
    # Open cuff terminates inside the existing closed glove; no visible disk.
    mesh=bpy.data.meshes.new('OriginalCrossbowSleeve_'+label+'_Mesh')
    mesh.from_pydata(verts,[],faces);mesh.update()
    for poly in mesh.polygons[:-2]:poly.use_smooth=True
    uv=mesh.uv_layers.new(name='GambesonUV')
    for poly in mesh.polygons:
        for loop_index in poly.loop_indices:
            vi=mesh.loops[loop_index].vertex_index
            uv.data[loop_index].uv=uvs[vi]
    obj=bpy.data.objects.new('OriginalCrossbowSleeve_'+label,mesh)
    bpy.context.collection.objects.link(obj);obj.parent=rig;obj.matrix_parent_inverse=Matrix.Identity(4)
    obj.location=(0,0,0)
    obj.data.materials.append(arm_sleeve_material())
    names=[f'Shoulder_{label}',f'UpperArm_{label}',f'Forearm_{label}',f'Hand_{label}']
    groups=[obj.vertex_groups.new(name=n) for n in names]
    for i in range(rows+1):
        ws=arm_skin_weights(i/rows)
        for j in range(cols):
            idx=i*cols+j
            for group,w in zip(groups,ws):
                if w>0.0001:group.add([idx],w,'REPLACE')
    mod=obj.modifiers.new('OriginalCrossbowSleeveSkin','ARMATURE');mod.object=rig
    mod.use_vertex_groups=True
    return obj,len(faces)

def segment_distance(point,a,b):
    ab=b-a;denom=ab.length_squared
    if denom<1e-12:return (point-a).length
    t=max(0.0,min(1.0,(point-a).dot(ab)/denom))
    return (point-(a+ab*t)).length

def trim_source_arm_faces(body,label):
    import bmesh
    names=[f'UpperArm_{label}',f'Forearm_{label}',f'Hand_{label}']
    ids={n:body.vertex_groups[n].index for n in names if n in body.vertex_groups}
    if len(ids)<2:return 0
    side=1 if label=='R' else -1
    mesh=body.data;remove=set()
    for poly in mesh.polygons:
        center=sum((mesh.vertices[i].co for i in poly.vertices),Vector())/len(poly.vertices)
        if center.z<0.75 or center.z>1.41 or side*center.x<0.205:continue
        arm_weight=0.0
        for vi in poly.vertices:
            vertex=mesh.vertices[vi]
            weight_sum=sum(g.weight for g in vertex.groups if g.group in ids.values())
            arm_weight+=weight_sum/len(poly.vertices)
        # Source arm islands have mixed torso/shoulder weights: weight-only
        # clipping left shredded triangles through the replacement local sleeve.
        local_lower_arm=side*center.x>0.245 and center.z<1.315
        if arm_weight>=0.40 or local_lower_arm:remove.add(poly.index)
    if not remove:return 0
    bm=bmesh.new();bm.from_mesh(mesh);bm.faces.ensure_lookup_table()
    doomed=[bm.faces[i] for i in remove if i<len(bm.faces)]
    bmesh.ops.delete(bm,geom=doomed,context='FACES')
    loose=[v for v in bm.verts if not v.link_faces]
    if loose:bmesh.ops.delete(bm,geom=loose,context='VERTS')
    bm.normal_update();bm.to_mesh(mesh);bm.free();mesh.update()
    return len(remove)

def install_crossbow_sleeves(rig,bodies):
    from original_crossbow_continuation_geometry import repair_original_arms
    return repair_original_arms(rig,bodies)
    stats={'trimmed_arm_faces':{},'sleeves':{}}
    # Remove only faces dominated by the original arm-chain weights; keep hands and shoulder identity.
    for body in bodies:
        for label in ('R','L'):
            stats['trimmed_arm_faces'][f'{body.name}:{label}']=trim_source_arm_faces(body,label)
    for label,side in [('R',1),('L',-1)]:
        obj,tris=build_original_sleeve(rig,side,label)
        stats['sleeves'][obj.name]={'vertices':len(obj.data.vertices),'triangles':sum(len(p.vertices)-2 for p in obj.data.polygons),
                                    'groups':[g.name for g in obj.vertex_groups]}
    return stats


GRIP_SOURCE_BLEND=r'C:\Users\bag57\projects\super_galen_site\.claude\worktrees\rts\art-factory\rts\runs\human-units-grip-refine\2026-10-05\worker\candidate\worker-grip-refine.blend'
SRC_CHANNEL=Vector((0.3959763646,-0.0120236883,0.8695588112))
SRC_CHANNEL_AXIS=Vector((-0.2392636091,-0.8519784212,-0.4657099247))
SRC_CAP=Vector((0.3653905094,0.0,0.9415608644))
SRC_CAP_NORMAL=Vector((-0.3482813835,0.0,0.9373900890))
CAP_TO_WRIST_M=0.015

def append_closed_grip_pair():
    with bpy.data.libraries.load(GRIP_SOURCE_BLEND,link=False) as (source,data):
        data.objects=['WorkerOriginalGrip_LOD0']
    base=next(o for o in data.objects if o is not None)
    base.name='OriginalCrossbowClosedGrip_R';base.data=base.data.copy()
    if base.name not in bpy.context.scene.objects:bpy.context.collection.objects.link(base)
    base.parent=None;base.matrix_world=Matrix.Identity(4)
    for modifier in list(base.modifiers):base.modifiers.remove(modifier)
    for group in list(base.vertex_groups):base.vertex_groups.remove(group)
    left=base.copy();left.data=base.data.copy();left.name='OriginalCrossbowClosedGrip_L'
    bpy.context.collection.objects.link(left)
    return {'R':base,'L':left}

def fit_closed_grip(obj,label,rig,channel_axis,forearm_axis):
    channel_axis=channel_axis.normalized()
    forearm_axis=forearm_axis.normalized()
    q0=SRC_CHANNEL_AXIS.rotation_difference(channel_axis)
    n=q0@SRC_CAP_NORMAL
    nproj=n-channel_axis*n.dot(channel_axis)
    fproj=forearm_axis-channel_axis*forearm_axis.dot(channel_axis)
    if nproj.length>1e-8 and fproj.length>1e-8:
        nproj.normalize();fproj.normalize()
        angle=math.atan2(channel_axis.dot(nproj.cross(fproj)),max(-1.0,min(1.0,nproj.dot(fproj))))
        rotation=Quaternion(channel_axis,angle)@q0
    else:rotation=q0
    bone_name='Hand_'+label
    pose=rig.pose.bones[bone_name]
    rest=rig.data.bones[bone_name].matrix_local.copy()
    pose_inverse=pose.matrix.inverted()
    head_world=rig.matrix_world@pose.head
    forearm_world=(rig.matrix_world.to_3x3()@forearm_axis).normalized()
    fitted_cap=head_world+forearm_world*CAP_TO_WRIST_M
    fitted_normal=(rotation@SRC_CAP_NORMAL).normalized()
    channel_world=fitted_cap-rotation@(SRC_CAP-SRC_CHANNEL)
    transformed=[];distances=[];cuff_weights=[]
    cuff_rotation=fitted_normal.rotation_difference(forearm_world)
    for vertex in obj.data.vertices:
        source_axial=(vertex.co-SRC_CAP).dot(SRC_CAP_NORMAL)
        cuff_weights.append(max(0.,1.-abs(source_axial)/.028))
        offset=rotation@(vertex.co-SRC_CAP)
        axial=offset.dot(fitted_normal)
        cuff_blend=max(0.0,1.0-abs(axial)/0.035)
        world=fitted_cap+offset.lerp(cuff_rotation@offset,cuff_blend)
        transformed.append(rest@pose_inverse@world)
        distances.append((world-fitted_cap).dot(forearm_world))
    for vertex,co in zip(obj.data.vertices,transformed):vertex.co=co
    obj.data.update()
    obj['original_cuff_blend']=cuff_weights
    obj.parent=rig;obj.matrix_parent_inverse=Matrix.Identity(4);obj.location=(0,0,0)
    hand_group=obj.vertex_groups.new(name=bone_name)
    forearm_group=obj.vertex_groups.new(name='Forearm_'+label)
    cap_ring_vertices=0
    def smoothstep(x):
        x=max(0.0,min(1.0,x));return x*x*(3.0-2.0*x)
    for index,distance in enumerate(distances):
        if abs(distance)<=0.001:cap_ring_vertices+=1
        # This is a closed rigid grip. The original cuff warp rotates the cap
        # almost 90 degrees on R; projecting against the pre-warp cap normal
        # incorrectly assigned half of that cap to Forearm, tearing the wrist.
        # The original body supplies the smooth Forearm -> Hand transition.
        hand_weight=1.0
        forearm_weight=1.0-hand_weight
        if hand_weight>0.0001:hand_group.add([index],hand_weight,'REPLACE')
        if forearm_weight>0.0001:forearm_group.add([index],forearm_weight,'REPLACE')
    modifier=obj.modifiers.new('OriginalCrossbowClosedGripSkin','ARMATURE');modifier.object=rig
    modifier.use_vertex_groups=True
    channel_local=pose.matrix.inverted()@channel_world
    tail_local=rest.inverted()@rig.data.bones[bone_name].tail_local
    tail_from_channel=tail_local-channel_local
    head_world=rig.matrix_world@pose.head
    forearm_residual=(fitted_normal-forearm_axis).length
    return {'channel_local':channel_local.copy(),'tail_from_channel':tail_from_channel.copy(),
            'channel_world':channel_world.copy(),'fitted_cap_world':fitted_cap.copy(),'hand_head_world':head_world.copy(),
            'cap_ring_vertices':cap_ring_vertices,'forearm_blend_length_m':0.0,
            'cap_head_residual_m':round((fitted_cap-head_world).length,6),
            'cap_normal_angle_deg':round(math.degrees(math.acos(max(-1.0,min(1.0,fitted_normal.dot(forearm_axis))))),4),
            'cap_normal_residual':round(forearm_residual,6),'rotation':rotation.copy()}

def render_qa(rig,bodies,weapons,sleeves,hands,actions,out_dir):
    scene=bpy.context.scene
    scene.render.engine='BLENDER_EEVEE'
    scene.render.resolution_x=480;scene.render.resolution_y=560;scene.render.resolution_percentage=100
    scene.render.image_settings.file_format='PNG'
    scene.render.film_transparent=True
    scene.render.filepath=os.path.join(out_dir,'qa','_frame.png')
    scene.render.use_file_extension=True
    world=scene.world
    if world: world.color=(0.025,0.035,0.055)
    cam=bpy.data.objects.get('CrossbowGrip_QA_Camera')
    if not cam:
        data=bpy.data.cameras.new('CrossbowGrip_QA_Camera');cam=bpy.data.objects.new('CrossbowGrip_QA_Camera',data);scene.collection.objects.link(cam)
    cam.data.type='ORTHO';cam.data.ortho_scale=2.0;scene.camera=cam
    target=Vector((0.0,0.0,1.10))
    dirs={'front':Vector((0,4.2,1.05)),'side':Vector((4.2,0,1.05))}
    frames=[0,16,40]
    written=[]
    oldvis={obj.name:obj.hide_render for obj in bodies+weapons+sleeves+hands}
    for obj in bodies+weapons+sleeves+hands: obj.hide_render=False
    # use LOD0 for artwork review
    for obj in bodies:
        obj.hide_render=(obj.name!='crossbowOriginalBody_LOD0')
    for obj in weapons:
        obj.hide_render=(obj.name!='CrossbowWeapon_LOD0')
    for view,direction in dirs.items():
        cam.location=target+direction;cam.rotation_euler=(target-cam.location).to_track_quat('-Z','Y').to_euler()
        for frame in frames:
            set_action(rig,actions['Attack']);scene.frame_set(frame);update()
            path=os.path.join(out_dir,'qa',f'attack-{view}-{frame:02d}.png')
            scene.render.filepath=path;bpy.ops.render.render(write_still=True);written.append(path)
    for name,frame in [('Idle',20),('Walk',10),('Hurt',14),('Death',35)]:
        direction=Vector((3.2,4.2,1.3))
        cam.location=target+direction;cam.rotation_euler=(target-cam.location).to_track_quat('-Z','Y').to_euler()
        set_action(rig,actions[name]);scene.frame_set(frame);update()
        path=os.path.join(out_dir,'qa',f'{name.lower()}-threequarter.png')
        scene.render.filepath=path;bpy.ops.render.render(write_still=True);written.append(path)
    for obj in bodies+weapons+sleeves+hands: obj.hide_render=oldvis[obj.name]
    return written

def export_lod(rig,bodies,weapons,sleeves,hands,filepath,body_name,weapon_name,samples_per_frame=4):
    for obj in bpy.context.selected_objects: obj.select_set(False)
    rig.select_set(True)
    for obj in bodies+weapons+sleeves+hands:
        obj.hide_render=(obj.name not in {body_name,weapon_name} and obj not in sleeves and obj not in hands)
        if obj.name in {body_name,weapon_name} or obj in sleeves or obj in hands: obj.select_set(True)
    bpy.context.view_layer.objects.active=rig
    temporary=[]
    low=body_name.endswith('LOD1')
    for obj in bodies+sleeves+hands:
        if not obj.select_get():continue
        target=(6400 if low else 15500) if obj in bodies else ((500 if low else 1000) if obj in sleeves else 1500)
        tris=sum(len(p.vertices)-2 for p in obj.data.polygons)
        if tris>target:
            mod=obj.modifiers.new('CrossbowExportLOD','DECIMATE');mod.ratio=target/tris;temporary.append((obj,mod))
    # The editable source remains at its original frame rate. Temporarily scale
    # key times and FPS together, so integer exporter sampling evaluates actual
    # source subframes with identical seconds. Disable lossy key reduction.
    assert isinstance(samples_per_frame,int) and samples_per_frame>=1
    scene=bpy.context.scene;old_fps=scene.render.fps
    curves=[fc for a in bpy.data.actions for layer in a.layers for strip in layer.strips for slot in a.slots for bag in [strip.channelbag(slot)] if bag for fc in bag.fcurves]
    for fc in curves:
        for key in fc.keyframe_points:
            key.co.x*=samples_per_frame;key.handle_left.x*=samples_per_frame;key.handle_right.x*=samples_per_frame
        fc.update()
    scene.render.fps=old_fps*samples_per_frame
    bpy.ops.export_scene.gltf(filepath=filepath,export_format='GLB',use_selection=True,
        export_animations=True,export_nla_strips=False,export_force_sampling=True,
        export_optimize_animation_size=False,
        export_frame_step=1,export_skins=True,export_morph=False,export_materials='EXPORT',
        export_apply=True,export_yup=True)
    for fc in curves:
        for key in fc.keyframe_points:
            key.co.x/=samples_per_frame;key.handle_left.x/=samples_per_frame;key.handle_right.x/=samples_per_frame
        fc.update()
    scene.render.fps=old_fps
    for obj,mod in temporary:obj.modifiers.remove(mod)
    return os.path.getsize(filepath)

source_path=os.path.abspath(sys.argv[sys.argv.index('--')+1])
out_dir=os.path.abspath(sys.argv[sys.argv.index('--')+2])
os.makedirs(os.path.join(out_dir,'candidate'),exist_ok=True)
os.makedirs(os.path.join(out_dir,'qa'),exist_ok=True)
bpy.ops.wm.open_mainfile(filepath=source_path)
rig=bpy.data.objects['crossbowRig20']
body_names=['crossbowOriginalBody_LOD0','crossbowOriginalBody_LOD1']
weapon_names=['CrossbowWeapon_LOD0','CrossbowWeapon_LOD1']
bodies=[bpy.data.objects[n] for n in body_names]
weapons=[bpy.data.objects[n] for n in weapon_names]
actions={name:next(a for a in bpy.data.actions if a.name==name) for name in SOURCE_ACTIONS}
hands=append_closed_grip_pair()
def forearm_inward(label):
    bone=rig.data.bones['Forearm_'+label]
    return (bone.head_local-bone.tail_local).normalized()
right_fit=fit_closed_grip(hands['R'],'R',rig,Vector((0,0,1)),forearm_inward('R'))
left_fit=fit_closed_grip(hands['L'],'L',rig,Vector((0,1,0)),forearm_inward('L'))
delta,grip_rest,stock_rest=rigid_fit_weapon(weapons,rig,right_fit['channel_world'])
RIGHT_READY=Vector((0.04,0.075,1.23))
hands=[hands['R'],hands['L']]
skin_weapon_to_hand(weapons,rig)
sleeve_stats=install_crossbow_sleeves(rig,bodies)
sleeves=[]
right_target=make_empty('OriginalCrossbowGrip_Target_R',rig)
left_target=make_empty('OriginalCrossbowGrip_Target_L',rig)
pole_r=make_empty('OriginalCrossbowGrip_Pole_R',rig);pole_r.location=(0.46,0.10,1.20)
pole_l=make_empty('OriginalCrossbowGrip_Pole_L',rig);pole_l.location=(-0.46,0.10,1.20)
right_ik=rig.pose.bones['Hand_R'].constraints.new('IK');right_ik.name='OriginalCrossbowGrip_RightIK'
right_ik.target=right_target;right_ik.pole_target=pole_r;right_ik.chain_count=3;right_ik.use_stretch=False
right_ik.use_rotation=True;right_ik.orient_weight=1.0;right_ik.pole_angle=0.0
left_ik=rig.pose.bones['Hand_L'].constraints.new('IK');left_ik.name='OriginalCrossbowGrip_LeftIK'
left_ik.target=left_target;left_ik.pole_target=pole_l;left_ik.chain_count=3;left_ik.use_stretch=False
left_ik.use_rotation=True;left_ik.orient_weight=1.0;left_ik.pole_angle=0.0
for obj in [right_target,left_target,pole_r,pole_l]:
    if obj.animation_data and obj.animation_data.action:obj.animation_data_clear()
def fit_report(fit):
    return {'channel_world':v3(fit['channel_world']),'channel_local_bone':v3(fit['channel_local']),
        'tail_from_channel_local':v3(fit['tail_from_channel']),'cap_ring_vertices':fit['cap_ring_vertices'],
        'forearm_blend_length_m':fit['forearm_blend_length_m'],'cap_head_residual_m':fit['cap_head_residual_m'],
        'cap_normal_angle_deg':fit['cap_normal_angle_deg'],'cap_normal_residual':fit['cap_normal_residual'],
        'rotation_wxyz':[round(float(x),6) for x in fit['rotation']]}
report={'source_blend':os.path.abspath(source_path),'weapon_trigger_anchor_source':v3(TRIGGER_CENTER),
        'right_channel_anchor_rest':v3(grip_rest),'weapon_rigid_delta':v3(delta),'weapon_stock_support_rest':v3(stock_rest),
        'support_delta_from_trigger_m':round((stock_rest-grip_rest).length,6),'front_axis':list(FRONT),
        'grip_landmarks_source_world':{'channel':v3(SRC_CHANNEL),'channel_axis':v3(SRC_CHANNEL_AXIS),
            'wrist_cap':v3(SRC_CAP),'wrist_cap_normal':v3(SRC_CAP_NORMAL)},
        'fitted_grips':{'R':fit_report(right_fit),'L':fit_report(left_fit)},
        'sleeve_geometry':sleeve_stats,'ik_chain_bones':3,'armature':'crossbowRig20',
        'bones':len(rig.data.bones),'clips':list(SOURCE_ACTIONS),'clip_samples':{},'baked_actions':{}}
baked=sample_clips_with_real_grip(rig,actions,right_target,left_target,right_ik,left_ik,
                                  pole_r,pole_l,right_fit,left_fit,stock_rest,report)
for action in list(bpy.data.actions):
    if action not in baked.values():bpy.data.actions.remove(action)
for name,action in baked.items():
    action.name=name
    action.use_fake_user=True
set_action(rig,baked['Idle'])
bpy.context.scene.frame_set(0);update()
from original_crossbow_continuation_geometry import align_wrist_cuffs_in_reference_pose
report['wrist_reference_alignment']=align_wrist_cuffs_in_reference_pose(rig,bodies,hands)
blend_path=os.path.join(out_dir,'candidate','original-crossbow-grip.blend')
bpy.ops.wm.save_as_mainfile(filepath=blend_path)
report['runtime_publish_allowed']=False
report['status']='candidate'
with open(os.path.join(out_dir,'candidate','grip-candidate-report.json'),'w',encoding='utf-8') as f:json.dump(report,f,indent=2)
qa_paths=[] if '--skip-render' in sys.argv else render_qa(rig,bodies,weapons,sleeves,hands,baked,out_dir)
report['qa_renders']=[os.path.relpath(path,out_dir).replace('\\','/') for path in qa_paths]
export_info={}
for i,(body,weapon) in enumerate(zip(bodies,weapons)):
    glb=os.path.join(out_dir,'candidate',f'original-crossbow-grip-lod{i}.glb')
    size=export_lod(rig,bodies,weapons,sleeves,hands,glb,body.name,weapon.name)
    export_info[str(i)]={'path':os.path.relpath(glb,out_dir).replace('\\','/'),'bytes':size}
report['exports']=export_info
with open(os.path.join(out_dir,'candidate','grip-candidate-report.json'),'w',encoding='utf-8') as f:json.dump(report,f,indent=2)
print('CROSSBOW_GRIP_DONE '+json.dumps({'blend':blend_path,'exports':export_info,'qa':report['qa_renders'],'support_delta':report['support_delta_from_trigger_m']}))
