"""Original full-character candidate: tailored glove, shot, spanning and loading.

The retained body is not remeshed. Original glove boundary is extended as a
leather gauntlet over the sleeve, so cloth and leather do not share a short,
collapsing strip. All motion is authored here, without library animation.
"""
import bpy,bmesh,json,math,hashlib,sys
from pathlib import Path
from collections import Counter,defaultdict
from mathutils import Matrix,Vector,Quaternion
sys.path.insert(0,str(Path(__file__).parent))
from original_crossbow_attack_probe import activate
from original_crossbow_carry_solve import arm_matrices,protract_shoulders
from original_crossbow_carry_build import put_keys
from original_crossbow_complete_motion import mechanism,smooth,finger_opening

ROOT=Path(__file__).resolve().parents[3]
RUN=ROOT/'art-factory/rts/runs/original-crossbow-complete/2026-10-07-v1'
SOURCE=ROOT/'art-factory/rts/runs/original-crossbow-cuff-motion/2026-10-07-v1/candidate/cuff-bands.blend'
LEATHER=ROOT/'art-factory/rts/runs/original-guard-surface-materials/2026-10-05/candidate/leather-512.png'
BOLT=ROOT/'art-factory/rts/runs/projectiles/2026-10-05-v1/candidate/bolt.blend'
CX=.4756327;LATCH=Vector((CX,.080,1.143));FREE=Vector((CX,.438,1.119))
RAIL=Vector((CX,.30,1.15))

def sha(path):return hashlib.sha256(path.read_bytes()).hexdigest()
def blend(a,b,t):return Matrix.LocRotScale(a.translation.lerp(b.translation,t),a.to_quaternion().slerp(b.to_quaternion(),t),a.to_scale().lerp(b.to_scale(),t))
def sample(keys,f):
    lo=max(k for k in keys if k<=f);hi=min(k for k in keys if k>=f)
    return blend(keys[lo],keys[hi],smooth((f-lo)/(hi-lo))) if hi!=lo else keys[lo].copy()
def posed(obj):
    e=obj.evaluated_get(bpy.context.evaluated_depsgraph_get());m=e.to_mesh()
    points=[e.matrix_world@v.co for v in m.vertices];e.to_mesh_clear();return points
def skin(rig,name):return rig.pose.bones[name].matrix@rig.data.bones[name].matrix_local.inverted()
def ordered_boundary(mesh):
    counts=Counter(e for p in mesh.polygons for e in p.edge_keys);adj=defaultdict(list)
    for (i,j),n in counts.items():
        if n==1:adj[i].append(j);adj[j].append(i)
    assert adj and all(len(v)==2 for v in adj.values())
    order=[min(adj)]
    while len(order)<len(adj):order.append(next(v for v in adj[order[-1]] if v not in order))
    assert order[0] in adj[order[-1]]
    return order

def tailoring(rig):
    hand=bpy.data.objects['OriginalCrossbowArticulatedHand_L'];points=posed(hand);boundary=ordered_boundary(hand.data)
    wrist=rig.pose.bones['HandPalm_L'].matrix.translation.copy()
    fore=rig.pose.bones['Forearm_L'].matrix.translation.copy();axis=(fore-wrist).normalized()
    body=bpy.data.objects['crossbowOriginalBody_LOD0'];bp=posed(body)
    old=body.data.attributes['ArticulatedCuffFace'];marked={i for p,v in zip(body.data.polygons,old.data) if v.value>0 for i in p.vertices}
    touched=[bp[i] for i in marked if body.data.attributes['ArticulatedCuff'].data[i].value==0]
    assert len(touched)>15
    # The leather extends beyond the real sleeve cut and overlaps by 25 mm.
    end_center=sum(touched,Vector())/len(touched)+axis*.025
    radial=max(((p-end_center)-axis*(p-end_center).dot(axis)).length for p in touched)+.004
    starts=[points[i] for i in boundary];start_center=sum(starts,Vector())/len(starts)
    outward=(start_center-wrist).normalized() if (start_center-wrist).length>.005 else -axis
    # Use the original ring's plane, not a guessed world cylinder.
    normal=sum(((a-start_center).cross(b-start_center) for a,b in zip(starts,starts[1:]+starts[:1])),Vector()).normalized()
    if normal.dot(-axis)<0:normal=-normal
    turn=normal.rotation_difference(-axis)
    weights=[];bm=bmesh.new();bm.from_mesh(hand.data);bm.verts.ensure_lookup_table();deform=bm.verts.layers.deform.verify()
    palm=hand.vertex_groups['HandPalm_L'].index
    fg=hand.vertex_groups.get('Forearm_L') or hand.vertex_groups.new(name='Forearm_L')
    mark=bm.verts.layers.int.new('TailoredGauntlet');last=[bm.verts[i] for i in boundary]
    # Extend from actual glove topology with gradual rotation and a bell mouth.
    for t in [.18,.38,.62,.82,1.]:
        ring=[];q=Quaternion().slerp(turn,smooth(t));center=start_center.lerp(end_center,t)
        pw=1-smooth(t);deform_matrix=skin(rig,'HandPalm_L')*pw+skin(rig,'Forearm_L')*(1-pw)
        for p in starts:
            r=p-start_center;length=r.length*(1-t)+radial*t
            point=center+(q@r.normalized())*length
            v=bm.verts.new(deform_matrix.inverted()@point);v[deform][palm]=pw;v[deform][fg.index]=1-pw;v[mark]=1;ring.append(v)
        for i in range(len(ring)):
            j=(i+1)%len(ring);bm.faces.new((last[i],last[j],ring[j],ring[i]))
        last=ring
    # A folded lip gives the glove real thickness at its open sleeve end.
    inner=[];sf=skin(rig,'Forearm_L')
    for v in last:
        p=sf@v.co;r=p-end_center;inner_p=end_center+r*.91-axis*.004
        n=bm.verts.new(sf.inverted()@inner_p);n[deform][fg.index]=1.;n[mark]=2;inner.append(n)
    for i in range(len(last)):
        j=(i+1)%len(last);bm.faces.new((last[i],last[j],inner[j],inner[i]))
    bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));bm.to_mesh(hand.data);bm.free()
    for p in hand.data.polygons:p.use_smooth=True
    # Retire failed cloth strips in both LODs, leaving a hidden cloth cap.
    for lod in [0,1]:
        obj=bpy.data.objects[f'crossbowOriginalBody_LOD{lod}'];bm=bmesh.new();bm.from_mesh(obj.data)
        label=bm.faces.layers.int['ArticulatedCuffFace'];doomed=[f for f in bm.faces if f[label]>0]
        bmesh.ops.delete(bm,geom=doomed,context='FACES')
        boundary_edges=[e for e in bm.edges if e.is_boundary]
        assert boundary_edges,'Missing real sleeve opening'
        bmesh.ops.holes_fill(bm,edges=boundary_edges,sides=0)
        bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));bm.to_mesh(obj.data);bm.free()
    # Both hands receive the existing original generated leather, with UVs.
    mat=bpy.data.materials.new('OriginalWornLeatherGloves');mat.use_nodes=True
    bsdf=mat.node_tree.nodes.get('Principled BSDF');bsdf.inputs['Roughness'].default_value=.76
    image=bpy.data.images.load(str(LEATHER),check_existing=True);image.pack()
    tex=mat.node_tree.nodes.new('ShaderNodeTexImage');tex.image=image;mat.node_tree.links.new(tex.outputs['Color'],bsdf.inputs['Base Color'])
    for obj in [hand,bpy.data.objects['OriginalCrossbowClosedGrip_R']]:
        obj.data.materials.clear();obj.data.materials.append(mat)
        for p in obj.data.polygons:p.material_index=0
        bpy.ops.object.select_all(action='DESELECT');obj.select_set(True);bpy.context.view_layer.objects.active=obj
        bpy.ops.object.mode_set(mode='EDIT');bpy.ops.mesh.select_all(action='SELECT')
        bpy.ops.uv.smart_project(angle_limit=math.radians(72),island_margin=.025,area_weight=.8,correct_aspect=True)
        bpy.ops.object.mode_set(mode='OBJECT')
    return {'hand_ring_vertices':len(boundary),'overlap_m':.025,'gauntlet_radius_m':radial,'start':list(start_center),'end':list(end_center),'leather_sha256':sha(LEATHER)}

def add_mechanism(rig):
    bpy.ops.object.select_all(action='DESELECT');rig.select_set(True);bpy.context.view_layer.objects.active=rig
    bpy.ops.object.mode_set(mode='EDIT')
    for n,p in [('BowString',LATCH),('LoadedBolt',RAIL)]:
        b=rig.data.edit_bones.new(n);b.head=p;b.tail=p+Vector((0,.06,0));b.parent=rig.data.edit_bones['Hand_R']
    bpy.ops.object.mode_set(mode='OBJECT')
    for lod in [0,1]:
        obj=bpy.data.objects[f'CrossbowWeapon_LOD{lod}'];parts=json.loads(obj['original_weapon_parts'])
        vg=obj.vertex_groups.new(name='BowString')
        for n in ['string_-1','string_1']:
            part=parts[n];ids=list(range(part['vertex_start'],part['vertex_end']))
            # The second half of each swept strand is its shared latch end.
            middle=len(ids)//2;obj.vertex_groups['Hand_R'].remove(ids[middle:]);vg.add(ids[middle:],1.,'REPLACE')
    with bpy.data.libraries.load(str(BOLT),link=False) as (src,dst):dst.objects=list(src.objects)
    parts=[]
    for obj in dst.objects:
        if obj.type=='MESH':bpy.context.scene.collection.objects.link(obj);parts.append(obj)
        else:bpy.data.objects.remove(obj,do_unlink=True)
    assert len(parts)==4
    for obj in parts:
        world=obj.matrix_world.copy();obj.parent=None;obj.matrix_world=Matrix.Identity(4)
        for v in obj.data.vertices:
            point=(world@v.co)*(.46/.65);point.x*=.55;point.z*=.55;v.co=RAIL+point
        obj.data.update()
    bpy.ops.object.select_all(action='DESELECT')
    for obj in parts:obj.select_set(True)
    bpy.context.view_layer.objects.active=parts[0];bpy.ops.object.join();bolt=bpy.context.object;bolt.name='OriginalLoadedBolt'
    bolt.vertex_groups.clear();bolt.vertex_groups.new(name='LoadedBolt').add(list(range(len(bolt.data.vertices))),1.,'REPLACE')
    bolt.parent=rig;bolt.matrix_parent_inverse=Matrix.Identity(4);mod=bolt.modifiers.new('OriginalLoadedBoltSkin','ARMATURE');mod.object=rig
    return {'bolt_sha256':sha(BOLT),'bolt_triangles':sum(len(p.vertices)-2 for p in bolt.data.polygons)}

def animate(rig):
    # Capture before inserting any keys: later reads must not sample partially rewritten curves.
    original={}
    for clip in ['Idle','Walk','Attack','Hurt','Death']:
        end=round(activate(rig,clip).frame_range[1]);original[clip]={}
        for k in range(end*4+1):
            f=k/4;activate(rig,clip,f);original[clip][f]={b.name:b.matrix.copy() for b in rig.pose.bones}
    neutral=original['Idle'][0.];meta=json.loads((ROOT/'art-factory/rts/runs/original-crossbow-articulated-hand/2026-10-07-v1/qa/attachment-preflight.json').read_text())
    anchor=Matrix(meta['source_bones']['Hand_L']['matrix'])
    idle_weapon=neutral['Hand_R']@rig.data.bones['Hand_R'].matrix_local.inverted()
    H=idle_weapon.inverted()@neutral['HandPalm_L']@anchor.inverted()
    palm_contact=Vector((.01,.01176710678749817,.11397716200789676))
    closed={n:neutral['HandPalm_L'].inverted()@neutral[n] for n in meta['source_bones'] if n!='Hand_L'}
    open_pose=original['Attack'][28.];opened={n:open_pose['HandPalm_L'].inverted()@open_pose[n] for n in closed}
    base=original['Attack'][20.];hr=rig.data.bones['Hand_R'].matrix_local
    reload_right=base['Hand_R'].copy();reload_right.translation+=Vector((.035,-.005,.04))
    rotation=Quaternion((0,0,1),math.radians(38))@Quaternion((1,0,0),math.radians(-38))
    reload_right=Matrix.LocRotScale(reload_right.translation,rotation@reload_right.to_quaternion(),Vector((1,1,1)))
    right_keys={20.:base['Hand_R'],24.:reload_right,34.:reload_right,38.:neutral['Hand_R'],40.:neutral['Hand_R']}
    # Separate the support release, string draw and bolt insertion spatially.
    hrot=H.to_quaternion();over=Quaternion((0,1,0),math.pi)@hrot
    def contact_transform(point,q):
        m=q.to_matrix().to_4x4();m.translation=point-m.to_3x3()@palm_contact;return m
    support=H.copy();leave=H.copy();leave.translation+=Vector((-.075,0,.035))
    reload_weapon=reload_right@hr.inverted()
    belt_palm=Matrix.LocRotScale(Vector((-.18,.12,1.00)),(reload_weapon@H@anchor).to_quaternion(),Vector((1,1,1)))
    belt_hand=reload_weapon.inverted()@belt_palm@anchor.inverted()
    left_keys={20.:support,22.:leave,24.:contact_transform(FREE+Vector((0,0,.004)),over),
        29.:contact_transform(LATCH+Vector((0,0,.004)),over),30.:contact_transform(LATCH+Vector((-.05,0,.035)),over),
        32.:belt_hand,
        36.:contact_transform(RAIL+Vector((0,0,.015)),over),38.:support,40.:support}
    captures={};reach=[];unreachable=[]
    for clip,poses in original.items():
        captures[clip]={}
        for f,source in poses.items():
            m={n:v.copy() for n,v in source.items()};state=mechanism(f) if clip=='Attack' else mechanism(0)
            if clip=='Attack' and f>20:
                right=sample(right_keys,f);weapon=right@hr.inverted();hand_map=weapon@sample(left_keys,f);palm=hand_map@anchor
                shoulder_amount=smooth((f-20)/4)*(1-smooth((f-34)/6))
                shoulder=protract_shoulders(rig,m,12*shoulder_amount)
                for n in ['Shoulder_L','UpperArm_L','Forearm_L']:m[n]=shoulder[n]
                # Arm geometry keeps original lengths and solved elbow planes.
                for side,target,pole in [('R',right,Vector((.43,.03,1.17))),('L',palm,Vector((-.42,.18,1.20)))]:
                    try:m.update(arm_matrices(rig,m,side,target,pole))
                    except ValueError as err:
                        alternatives=[]
                        for angle in [-20,-10,0,10,20,30]:
                            trial=protract_shoulders(rig,m,angle)
                            alternatives.append({'clavicle_degrees':angle,'distance':(target.translation-trial['UpperArm_'+side].translation).length})
                        unreachable.append({'frame':f,'side':side,'target':list(target.translation),'shoulder':list(m['UpperArm_'+side].translation),'alternatives':alternatives,'error':str(err)});continue
                    reach.append({'frame':f,'side':side,'distance':(target.translation-m['UpperArm_'+side].translation).length})
                m['HandPalm_L']=palm
                m['Hand_L']=m['Forearm_L']@neutral['Forearm_L'].inverted()@neutral['Hand_L']
                opening=finger_opening(f)
                for n in closed:m[n]=palm@blend(closed[n],opened[n],opening)
            weapon=m['Hand_R']@hr.inverted()
            string=weapon@rig.data.bones['BowString'].matrix_local
            string.translation=weapon@(FREE.lerp(LATCH,state['draw']));m['BowString']=string
            bolt=weapon@rig.data.bones['LoadedBolt'].matrix_local
            if clip=='Attack' and 32<=f<36:
                # Held bolt travels from the hand to the actual rail.
                held=m['HandPalm_L']@anchor.inverted()@palm_contact
                bolt.translation=held
            if not state['bolt_visible']:
                bolt=Matrix.LocRotScale(bolt.translation,bolt.to_quaternion(),Vector((.0001,.0001,.0001)))
            m['LoadedBolt']=bolt;captures[clip][f]=m
    (RUN/'qa/motion-preflight.json').write_text(json.dumps({'unreachable':unreachable,'reach':reach,'runtime_publish_allowed':False},indent=2)+'\n')
    assert not unreachable,unreachable[:8]
    for clip,frames in captures.items():
        activate(rig,clip);put_keys(rig,bpy.data.actions[clip],frames,set(rig.pose.bones.keys()) if clip=='Attack' else {'BowString','LoadedBolt'})
    return {'release_frame':12,'duration_frames':40,'fps':24,'original_motion':True,'mechanism_bones':['BowString','LoadedBolt'],'authoring_step_frames':.25}

def main():
    assert sha(SOURCE)=='22d240db03bca444d83d0cc7e8244e4686f68063eefa651febd420377ff2adf4'
    bpy.context.preferences.filepaths.save_version=0;bpy.ops.wm.open_mainfile(filepath=str(SOURCE));rig=bpy.data.objects['crossbowRig20'];activate(rig,'Idle',0)
    report={'source_sha256':sha(SOURCE),'tailoring':tailoring(rig),'mechanism':add_mechanism(rig)}
    report['motion']=animate(rig);activate(rig,'Idle',0)
    output=RUN/'candidate/complete-crossbow.blend';bpy.ops.wm.save_as_mainfile(filepath=str(output))
    report.update(candidate_sha256=sha(output),status='candidate',runtime_publish_allowed=False)
    (RUN/'qa/authoring.json').write_text(json.dumps(report,indent=2)+'\n');print('COMPLETE_CHARACTER',json.dumps(report))

if __name__=='__main__':main()
