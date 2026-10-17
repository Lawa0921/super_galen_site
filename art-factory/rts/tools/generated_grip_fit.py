"""Sculpt/fit the generated LEFT power-grip source, never sweep new fingers."""
import argparse
import hashlib
import json
import math
import sys
from pathlib import Path
import bpy
import bmesh
from mathutils import Vector,Matrix
from mathutils.bvhtree import BVHTree

sys.path.insert(0,str(Path(__file__).parent))
import procedural_gauntlet_build as g
from visual_hand_rework import mesh_fingerprint,render

ROOT=Path(__file__).resolve().parents[3]
SOURCE=ROOT/'art-factory/rts/runs/all-models/2026-10-14-v1/raw/guard-assembly.blend'
MASTER=ROOT/'art-factory/rts/runs/visual-revision/2026-10-15-hand-generated/candidate/guard-neural-v2.blend'
ANCHORS=ROOT/'art-factory/rts/runs/visual-revision/2026-10-15-hand-v2/qa/hand-build.json'
# Source landmark frame from the generated front, back and side turntable.
GRIP=Vector((.06,-.035,.07))
WRIST=Vector((.0,.24,-.28))
AXIS=Vector((0,.14,.99)).normalized()


def canonical_wrist_pivots(rig,wrists,action_names=None,idle_name='Idle'):
    changes=[]
    sides=tuple(wrists)
    g.set_action(rig,idle_name);bpy.context.scene.frame_set(0)
    neutral={side:rig.pose.bones['Forearm_'+side].matrix.to_quaternion().inverted()@rig.pose.bones['Hand_'+side].matrix.to_quaternion() for side in sides}
    for action in ([bpy.data.actions[name] for name in action_names] if action_names else bpy.data.actions):
        g.set_action(rig,action.name)
        frames=range(int(action.frame_range[0]),int(action.frame_range[1])+1)
        poses={}
        for frame in frames:
            bpy.context.scene.frame_set(frame)
            poses[frame]={side:rig.pose.bones['Hand_'+side].matrix.copy() for side in sides}
        for frame in frames:
            bpy.context.scene.frame_set(frame)
            for side in sides:
                fore=rig.pose.bones['Forearm_'+side];hand=rig.pose.bones['Hand_'+side]
                matrix=poses[frame][side]
                desired=fore.matrix.to_quaternion().inverted()@matrix.to_quaternion()
                if neutral[side].dot(desired)<0:desired.negate()
                angle=neutral[side].rotation_difference(desired).angle
                limited=neutral[side].slerp(desired,min(1,math.radians(30)/max(angle,1e-8)))
                matrix=(fore.matrix.to_quaternion()@limited).to_matrix().to_4x4()
                target=(fore.matrix@fore.bone.matrix_local.inverted())@wrists[side]
                matrix.translation=target-matrix.to_3x3()@(hand.bone.matrix_local.inverted()@wrists[side])
                hand.matrix=matrix
                for prop in ('location','rotation_quaternion'):hand.keyframe_insert(prop,frame=frame)
        changes.append({'clip':action.name,'frames':len(frames),'channels':[f'Hand_{s}.{c}' for s in sides for c in ('location','rotation')],'wrist_limit_degrees':30})
    g.set_action(rig,idle_name);bpy.context.scene.frame_set(0)
    return changes


def sculpt_source(obj):
    """Constrain posterior hallucinations while keeping generated fingers."""
    count=0
    for v in obj.data.vertices:
        x,y,z=v.co
        region=(1-g.smooth((abs(y-.065)-.13)/.12))*(1-g.smooth((abs(z-.015)-.20)/.13))
        weight=g.smooth((-.015-x)/.07)*region
        if weight:
            target=-.110-.018*math.exp(-((y-.04)/.14)**2-((z-.02)/.24)**2)
            v.co.x=x*(1-weight)+target*weight;count+=1
    # Remove the generated flared cuff behind the anatomical wrist. This is
    # a trim of the source, not a replacement cylinder or primitive sleeve.
    outward=(WRIST-GRIP).normalized();plane=WRIST+outward*.055
    bm=bmesh.new();bm.from_mesh(obj.data)
    bmesh.ops.remove_doubles(bm,verts=list(bm.verts),dist=1e-6)
    bmesh.ops.bisect_plane(bm,geom=[*bm.verts,*bm.edges,*bm.faces],plane_co=plane,plane_no=outward,
                          dist=1e-6,clear_outer=True,clear_inner=False)
    rim=[e for e in bm.edges if e.is_boundary and all(abs((v.co-plane).dot(outward))<.0001 for v in e.verts)]
    bmesh.ops.holes_fill(bm,edges=rim,sides=0)
    bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces))
    bm.to_mesh(obj.data);bm.free();obj.data.update()
    return {'posterior_vertices_refined':count,'cuff_cut_point':list(plane),'source_handedness':'L'}


def bake_source_leather(obj,high,material):
    """Rebake high-resolution source UVs after reduction, avoiding atlas smear."""
    bpy.ops.object.select_all(action='DESELECT');obj.select_set(True);bpy.context.view_layer.objects.active=obj
    bpy.ops.object.mode_set(mode='EDIT');bpy.ops.mesh.select_all(action='SELECT');bpy.ops.uv.smart_project(island_margin=.015);bpy.ops.object.mode_set(mode='OBJECT')
    target=material.copy();target.name='GeneratedGripLeather_'+obj.name
    obj.data.materials.clear();obj.data.materials.append(target)
    for p in obj.data.polygons:p.material_index=0
    tex=bpy.data.images.new(obj.name+'_source_leather',width=1024,height=1024,alpha=False)
    node=target.node_tree.nodes.new('ShaderNodeTexImage');node.image=tex;target.node_tree.nodes.active=node
    scene=bpy.context.scene;scene.render.engine='CYCLES';scene.cycles.samples=1
    scene.render.bake.use_selected_to_active=True;scene.render.bake.cage_extrusion=.003;scene.render.bake.max_ray_distance=.008
    scene.render.bake.use_pass_direct=False;scene.render.bake.use_pass_indirect=False;scene.render.bake.use_pass_color=True;scene.render.bake.margin=8
    high.select_set(True);bpy.ops.object.bake(type='DIFFUSE')
    shader=next(n for n in target.node_tree.nodes if n.type=='BSDF_PRINCIPLED')
    target.node_tree.links.new(node.outputs['Color'],shader.inputs['Base Color']);shader.inputs['Roughness'].default_value=.88;shader.inputs['Metallic'].default_value=0
    tex.pack();scene.render.bake.use_selected_to_active=False;scene.render.engine='BLENDER_EEVEE'
    bpy.data.objects.remove(high,do_unlink=True)


def fit(obj,rig,row,ref,material,weapon):
    source_material=obj.data.materials[0].copy()
    source_material.name='GeneratedGripLeather'
    side,lod=row['side'],row['lod'];wrist=Vector(row['wrist']);oldgrip=Vector(row['grip'])
    weapon_bone=row.get('weapon_skin_bone','Hand_'+side)
    axis=Vector(row['axis']).normalized()
    if side=='R':
        blade=sum((ref['Hand_R']@v.co for v in weapon.data.vertices),Vector())/len(weapon.data.vertices)
        if axis.dot(blade-oldgrip)<0:axis=-axis
    elif axis.dot(Vector((-1,0,.3)))<0:axis=-axis
    toward=wrist-oldgrip;toward=(toward-axis*toward.dot(axis)).normalized()
    source_toward=WRIST-GRIP;source_toward=(source_toward-AXIS*source_toward.dot(AXIS)).normalized()
    source_basis=Matrix((AXIS,source_toward,AXIS.cross(source_toward))).transposed()
    target_basis=Matrix((axis,toward,axis.cross(toward))).transposed()
    scale=Matrix.Diagonal(Vector((.16,.24,-.18 if side=='R' else .18)))
    if row.get('preserve_weapon_anchor'):
        s=source_basis.transposed()@(WRIST-GRIP);d=target_basis.transposed()@(wrist-oldgrip)
        assert abs(s.y)>.1 and d.y>.025,'Invalid anatomical wrist/handle separation'
        scale[1][1]=d.y/s.y;scale[0][1]=(d.x-scale[0][0]*s.x)/s.y
    transform=target_basis@scale@source_basis.transposed()
    center=oldgrip if row.get('preserve_weapon_anchor') else wrist-transform@(WRIST-GRIP)
    fore=rig.pose.bones['Forearm_'+side];distal=(fore.tail-fore.head).normalized()
    source_outward=(WRIST-GRIP).normalized()
    for v in obj.data.vertices:v.co=center+transform@(v.co-GRIP)
    if side=='R':
        bm=bmesh.new();bm.from_mesh(obj.data);bmesh.ops.reverse_faces(bm,faces=list(bm.faces));bm.to_mesh(obj.data);bm.free()
    # Align the existing held object with the anatomical grip. Its authored
    # shape and animation remain intact; only its rigid hand-space anchor moves.
    delta=center-oldgrip
    if delta.length>1e-9:
        for v in weapon.data.vertices:v.co=ref[weapon_bone].inverted()@(ref[weapon_bone]@v.co+delta)
    # Open only the real held handle's volume. Keep the generated finger pads,
    # palm and thenar outer surfaces rather than generating rings around it.
    cutter=weapon.copy();cutter.data=weapon.data.copy();bpy.context.collection.objects.link(cutter)
    cutter.modifiers.clear();cutter.vertex_groups.clear();cutter.matrix_world=Matrix.Identity(4)
    bm=bmesh.new();bm.from_mesh(cutter.data)
    grip_materials=row.get('grip_materials')
    remove=[f for f in bm.faces if (cutter.data.materials[f.material_index].name not in grip_materials if grip_materials else 'leather' not in cutter.data.materials[f.material_index].name.lower())]
    bmesh.ops.delete(bm,geom=remove,context='FACES')
    bmesh.ops.remove_doubles(bm,verts=list(bm.verts),dist=1e-6)
    # Some material-only grip selections omit the wooden/metal end caps.
    # Close those real end rims before Boolean; an open cutter creates loose
    # cap triangles and leaves the glove itself open.
    bmesh.ops.holes_fill(bm,edges=[e for e in bm.edges if e.is_boundary],sides=0)
    assert all(e.is_manifold for e in bm.edges if e.link_faces),'Actual grip cutter is not a closed volume'
    bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));bm.to_mesh(cutter.data);bm.free()
    for v in cutter.data.vertices:
        p=ref[weapon_bone]@v.co;d=p-center
        v.co=center+axis*d.dot(axis)+(d-axis*d.dot(axis))*.97
    cut_surface=BVHTree.FromPolygons([v.co.copy() for v in cutter.data.vertices],[tuple(p.vertices) for p in cutter.data.polygons])
    bpy.ops.object.select_all(action='DESELECT');obj.select_set(True);bpy.context.view_layer.objects.active=obj
    mod=obj.modifiers.new('Actual handle clearance','BOOLEAN');mod.operation='DIFFERENCE';mod.solver='EXACT';mod.object=cutter
    bpy.ops.object.modifier_apply(modifier=mod.name)
    bpy.data.objects.remove(cutter,do_unlink=True)
    bm=bmesh.new();bm.from_mesh(obj.data)
    internal_caps=[f for f in bm.faces if f.calc_area()<.00001 and all(len(e.link_faces)>2 for e in f.edges)]
    bmesh.ops.delete(bm,geom=internal_caps,context='FACES_ONLY')
    bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));bm.to_mesh(obj.data);bm.free()
    # The source has an inner cuff lip. The anatomical trim can disconnect
    # that buried lining; remove only proven proximal lining islands, never
    # finger or palm islands. Bounds are checked in the generated source frame.
    inverse_fit=transform.inverted()
    bm=bmesh.new();bm.from_mesh(obj.data);remaining=set(bm.verts);components=[]
    while remaining:
        stack=[remaining.pop()];component=[]
        while stack:
            vertex=stack.pop();component.append(vertex)
            neighbours={e.other_vert(vertex) for e in vertex.link_edges}&remaining
            remaining-=neighbours;stack.extend(neighbours)
        components.append(component)
    components.sort(key=len,reverse=True);removed_lining=0
    for component in components[1:]:
        if not any(v.link_faces for v in component):
            bmesh.ops.delete(bm,geom=component,context='VERTS');continue
        points=[GRIP+inverse_fit@(v.co-center) for v in component]
        if len(component)<len(components[0])*.001 and max((v.co-component[0].co).length for v in component)<.004:
            removed_lining+=len(component)
            bmesh.ops.delete(bm,geom=component,context='VERTS');continue
        # Exact Boolean can leave a tiny duplicate fragment of the cutter's
        # own cap. Only discard it when every point lies on the real cutting
        # surface; this cannot remove an authored finger or palm surface.
        if len(component)<len(components[0])*.001 and all(cut_surface.find_nearest(v.co)[3]<.00005 for v in component):
            removed_lining+=len(component);bmesh.ops.delete(bm,geom=component,context='VERTS');continue
        assert len(component)<len(components[0])*.12 and all((p-WRIST).length<.35 and (p-WRIST).dot(source_outward)>-.10 for p in points), ('Unexpected detached generated finger/palm',side,lod,len(component),len(components[0]),max((p-WRIST).length for p in points),min((p-WRIST).dot(source_outward) for p in points),[min(p[i] for p in points) for i in range(3)],[max(p[i] for p in points) for i in range(3)])
        removed_lining+=len(component);bmesh.ops.delete(bm,geom=component,context='VERTS')
    bm.to_mesh(obj.data);bm.free()
    # Shape the source cuff only after the handle Boolean: bending the
    # cap first can make it intersect the palm and invalidate a solid cut.
    for v in obj.data.vertices:
        source_point=GRIP+inverse_fit@(v.co-center)
        cuff_distance=(source_point-WRIST).dot(source_outward)
        blend=g.smooth((cuff_distance+.13)/.16)
        if blend:
            d=v.co-wrist;radial=d-distal*d.dot(distal)
            radial*=min(1,row.get('cuff_radius',.035)/max(radial.length,1e-8))
            tucked=wrist+distal*(-row.get('cuff_overlap_m',.012)+(.055-cuff_distance)*.18)+radial
            v.co=v.co.lerp(tucked,blend)
    obj.data.materials.clear();obj.data.materials.append(source_material)
    for p in obj.data.polygons:p.material_index=0;p.use_smooth=True
    high=obj.copy();high.data=obj.data.copy();high.modifiers.clear();bpy.context.collection.objects.link(high)
    current=g.tri_count(obj);mod=obj.modifiers.new('Game topology','DECIMATE');mod.ratio=min(1,(1800 if lod==0 else 1000)/current)
    bpy.ops.object.modifier_apply(modifier=mod.name)
    # Retain the generated source UV and baked leather creases. Replacing
    # them with triplanar tiling erased the thumb/finger seam definition.
    bake_source_leather(obj,high,source_material)
    for p in obj.data.polygons:
        p.material_index=0;p.use_smooth=True
    # Boolean cutters may carry deform layers from the equipped weapon. Drop
    # them before skinning so no Hand_R.001 group or doubled weight survives.
    obj.vertex_groups.clear()
    group=obj.vertex_groups.new(name='Hand_'+side)
    inverse=ref['Hand_'+side].inverted()
    for v in obj.data.vertices:
        # A closed power grip is rigid. Its short generated leather cuff
        # overlaps the existing bracer; do not inverse-blend a posed surface
        # across two differently oriented bones and pre-stretch bind geometry.
        v.co=inverse@v.co
    group.add(list(range(len(obj.data.vertices))),1,'REPLACE')
    mod=obj.modifiers.new('Skin','ARMATURE');mod.object=rig
    obj['source']=str(MASTER.relative_to(ROOT));obj['source_handedness']='L';obj['mirrored_from_source']=side=='R'
    return {k:row[k] for k in ('name','side','lod','radius','wrist','wrist_radius')}|{
        'grip':list(center),'axis':list(axis),'triangles':g.tri_count(obj),'weapon_anchor_delta':list(delta),'trimmed_inner_cuff_lining_vertices':removed_lining,'removed_duplicate_boolean_caps':len(internal_caps),
        'source_transform':[list(r) for r in transform],'source_grip':list(GRIP),'source_wrist':list(WRIST),'source_texture_preserved':True,
        'method':'Sculpted generated left-hand source; mirror for right; actual-handle clearance; rigid closed grip and short cuff'}


def main():
    p=argparse.ArgumentParser();p.add_argument('--run',type=Path,required=True)
    p.add_argument('--skip-render',action='store_true')
    a=p.parse_args(sys.argv[sys.argv.index('--')+1:]);run=a.run.resolve()
    for folder in ('raw','candidate','qa'):(run/folder).mkdir(parents=True,exist_ok=True)
    bpy.ops.wm.open_mainfile(filepath=str(SOURCE))
    rig=next(o for o in bpy.data.objects if o.type=='ARMATURE');g.set_action(rig,'Idle');bpy.context.scene.frame_set(0)
    oldref=g.skin_matrices(rig)
    oldrecords=json.loads((ROOT/'art-factory/rts/runs/all-models/2026-10-14-v1/qa/guard-build.json').read_bytes())['hands']
    canonical={r['side']:Vector(r['cut']['wrist']) for r in oldrecords if r['lod']==0}
    changes=canonical_wrist_pivots(rig,canonical);ref=g.skin_matrices(rig)
    # Align the lower-detail wrist rim with the same anatomical pivot used by
    # both LODs. The previous batch keyed one rig from the last (LOD1) row.
    body_adjustments=[]
    for row in oldrecords:
        if row['lod']!=1:continue
        side=row['side'];oldw=Vector(row['cut']['wrist']);delta=canonical[side]-oldw
        body=bpy.data.objects['GuardBody_LOD1'];count=0
        for v in body.data.vertices:
            influenced=any(body.vertex_groups[w.group].name=='Forearm_'+side and w.weight>.5 for w in v.groups)
            if influenced and (v.co-oldw).length<.12:
                v.co+=delta*(1-g.smooth(((v.co-oldw).length-.045)/.075));count+=1
        body_adjustments.append({'side':side,'vertices':count,'bind_delta':list(delta)})
    bodyprints={o.name:mesh_fingerprint(o) for o in bpy.data.objects if o.name.startswith('GuardBody')}
    with bpy.data.libraries.load(str(MASTER),link=False) as (available,loaded):loaded.meshes=available.meshes
    mesh=loaded.meshes[0];master=bpy.data.objects.new('GeneratedLeftGripMaster',mesh)
    bpy.context.collection.objects.link(master);sculpt=sculpt_source(master)
    rows=json.loads(ANCHORS.read_bytes())['hands'];result=[]
    for row in rows:
        side=row['side'];row=dict(row,wrist=list(ref['Forearm_'+side]@canonical[side]))
        old=bpy.data.objects[row['name']];bpy.data.objects.remove(old,do_unlink=True)
        obj=bpy.data.objects.new(row['name'],master.data.copy());bpy.context.collection.objects.link(obj)
        weapon=bpy.data.objects[('KingdomSteelSword' if row['side']=='R' else 'KingdomSunShield')+f"_LOD{row['lod']}"]
        for v in weapon.data.vertices:v.co=ref['Hand_'+side].inverted()@(oldref['Hand_'+side]@v.co)
        result.append(fit(obj,rig,row,ref,bpy.data.materials['AssemblyDetail_leather'],weapon))
    bpy.data.objects.remove(master,do_unlink=True)
    for name,digest in bodyprints.items():assert mesh_fingerprint(bpy.data.objects[name])==digest
    report={'status':'candidate_requires_visual_review','runtime_publish_allowed':False,'artistic_quality_proven':False,
            'source':str(SOURCE.relative_to(ROOT)),'generated_source':str(MASTER.relative_to(ROOT)),
            'generated_source_sha256':hashlib.sha256(MASTER.read_bytes()).hexdigest(),'sculpt':sculpt,'hands':result,
            'body_meshes_after_wrist_alignment':bodyprints,'lod1_wrist_alignment':body_adjustments,'wrist_animation_changes':changes}
    (run/'qa/hand-build.json').write_bytes((json.dumps(report,indent=2)+'\n').encode())
    bpy.context.preferences.filepaths.save_version=0
    bpy.ops.wm.save_as_mainfile(filepath=str(run/'raw/guard-visual-rework.blend'))
    for lod in (0,1):
        objects=[o for o in bpy.data.objects if o.type=='MESH' and o.name.endswith(f'_LOD{lod}')]
        g.export_lod(run/'candidate'/('guard.glb' if lod==0 else 'guard-lod1.glb'),rig,objects)
    if not a.skip_render:render(run,rig,[o for o in bpy.data.objects if o.type=='MESH' and o.name.endswith('_LOD0')],result)


if __name__=='__main__':main()
