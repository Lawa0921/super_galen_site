"""Repair original textured arm surfaces; do not cover sliced source with tubes."""
import bpy,bmesh,math
from mathutils import Vector
from mathutils.bvhtree import BVHTree

def smooth(x):
    x=max(0.,min(1.,x));return x*x*(3-2*x)

def repair_original_arms(rig,bodies):
    result={'method':'original_textured_surface_reweight_and_wrist_bisect','bodies':{}}
    for obj in bodies:
        mesh=obj.data;stats={}
        for side,label in ((1,'R'),(-1,'L')):
            hand=rig.data.bones['Hand_'+label]
            fore=rig.data.bones['Forearm_'+label]
            inward=(fore.head_local-fore.tail_local).normalized()
            cut=hand.head_local+inward*.010
            grip=bpy.data.objects['OriginalCrossbowClosedGrip_'+label]
            glove=BVHTree.FromPolygons([v.co for v in grip.data.vertices],[list(p.vertices) for p in grip.data.polygons])
            bm=bmesh.new();bm.from_mesh(mesh)
            # Source UV splits are welded geometrically while per-loop UVs remain intact.
            region=[v for v in bm.verts if side*v.co.x>.20 and .78<v.co.z<1.46]
            bmesh.ops.remove_doubles(bm,verts=region,dist=.00001)
            region=[v for v in bm.verts if side*v.co.x>.29 and v.co.z<1.14]
            vs=set(region)
            geom=region+[e for e in bm.edges if all(v in vs for v in e.verts)]+[f for f in bm.faces if all(v in vs for v in f.verts)]
            bmesh.ops.bisect_plane(bm,geom=geom,dist=.000001,plane_co=cut,plane_no=-inward,clear_outer=True)
            boundary=[e for e in bm.edges if e.is_boundary and all(abs((v.co-cut).dot(inward))<.00003 for v in e.verts)]
            if boundary:bmesh.ops.holes_fill(bm,edges=boundary,sides=0)
            loose=[v for v in bm.verts if not v.link_faces]
            if loose:bmesh.ops.delete(bm,geom=loose,context='VERTS')
            bm.normal_update();bm.to_mesh(mesh);bm.free();mesh.update()
            names=['SpineUpper','Shoulder_'+label,'UpperArm_'+label,'Forearm_'+label,'Hand_'+label]
            groups=[obj.vertex_groups[n] for n in names]
            count=0;rim=0
            for v in mesh.vertices:
                x=side*v.co.x;z=v.co.z
                arm_inner=.19+max(0,1.35-z)*.4
                axial=(v.co-cut).dot(inward)
                radial_distance=((v.co-cut)-inward*axial).length
                distal=x>.28 and -.00003<=axial<.10 and radial_distance<.145
                if not distal and (x<arm_inner or z<.9 or z>1.48):continue
                # Continuous shoulder insertion keeps original surface connectivity.
                region_weight=1.0 if distal else smooth((x-arm_inner)/.045)*smooth((1.48-z)/.06)
                sh=smooth((1.39-z)/.13)
                elbow=smooth((1.19-z)/.13)
                wrist=smooth((.100-(v.co-cut).dot(inward))/.075)
                ws=[1-sh,sh*(1-elbow),sh*elbow*(1-wrist),sh*elbow*wrist]
                old={g.group:g.weight for g in v.groups}
                for gi in [g.group for g in v.groups]:obj.vertex_groups[gi].remove([v.index])
                new={i:w*(1-region_weight) for i,w in old.items()}
                # Shoulder -> UpperArm -> Forearm -> Hand transitions are spatially smooth.
                for group,w in zip(groups[1:],ws):new[group.index]=new.get(group.index,0)+region_weight*w
                strongest=sorted(new.items(),key=lambda p:p[1],reverse=True)[:4]
                total=sum(w for i,w in strongest)
                for i,w in strongest:
                    if w>1e-7:obj.vertex_groups[i].add([v.index],w/total,'REPLACE')
                axial=(v.co-cut).dot(inward)
                if distal and axial<.085:
                    c=cut+inward*axial;radial=v.co-c
                    blend=1-smooth(axial/.085)
                    # Fit the actual original glove cross-section, including its
                    # non-circular cuff; a fixed circular cap left a visible stub.
                    if radial.length>1e-7:
                        direction=radial.normalized()
                        hit=glove.ray_cast(cut,direction,.14)[3]
                        if hit and hit>.005:
                            limit=max(.004,hit-.0025)
                            v.co=c+direction*(radial.length*(1-blend)+limit*blend)
                    if abs(axial)<.00003:
                        for gi in [g.group for g in v.groups]:obj.vertex_groups[gi].remove([v.index])
                        groups[-1].add([v.index],1,'REPLACE');rim+=1
                count+=1
            mesh.update();stats[label]={'reweighted_vertices':count,'wrist_cut_vertices':rim,'wrist_fit':'actual glove BVH radial envelope, 2.5 mm inset for exported decimation tolerance'}
        result['bodies'][obj.name]=stats
    return result

def align_wrist_cuffs_in_reference_pose(rig,bodies,hands):
    """Rotate only original cuff surfaces into the actual evaluated forearm axis.

    Hand and Forearm pose rotations differ at the ready pose. Fitting the cap
    to their coincident REST axes creates a backwards fold after skinning.
    Preserve closed fingers; align the original cuff and adjoining forearm
    geometry using the evaluated ready pose, then return edits to bind space.
    """
    records={}
    for side in ('L','R'):
        hand=rig.pose.bones['Hand_'+side];fore=rig.pose.bones['Forearm_'+side]
        rest_in=(fore.bone.head_local-fore.bone.tail_local).normalized()
        skin=hand.matrix@hand.bone.matrix_local.inverted();inverse=skin.inverted()
        old_center=skin@(hand.bone.head_local+rest_in*.015)
        axis=(fore.head-fore.tail).normalized()
        target=hand.head+axis*.015
        old_axis=(skin.to_3x3()@rest_in).normalized()
        rotation=old_axis.rotation_difference(axis)
        grip=next(o for o in hands if o.name.endswith('_'+side))
        for v,w in zip(grip.data.vertices,grip['original_cuff_blend']):
            if w<=0:continue
            p=skin@v.co;aligned=target+rotation@(p-old_center)
            v.co=inverse@p.lerp(aligned,float(w))
        bm=bmesh.new();bm.from_mesh(grip.data);bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));bm.to_mesh(grip.data);bm.free();grip.data.update()
        # Freeze the actual runtime cuff surface before fitting the body. Both
        # LODs reuse this original closed grip, avoiding a later mismatched cap.
        tris=sum(len(p.vertices)-2 for p in grip.data.polygons)
        if tris>1500:
            mod=grip.modifiers.new('OriginalGripSurfaceBudget','DECIMATE');mod.ratio=1500/tris
            grip.modifiers.move(len(grip.modifiers)-1,0)
            bpy.context.view_layer.objects.active=grip;grip.select_set(True)
            bpy.ops.object.modifier_apply(modifier=mod.name)
        glove=BVHTree.FromPolygons([v.co for v in grip.data.vertices],[list(p.vertices) for p in grip.data.polygons])
        changed=0;terminal_points={}
        cut=hand.bone.head_local+rest_in*.010
        final_cut=inverse@(target+rotation@(skin@cut-old_center))
        final_normal=(inverse.to_3x3()@(rotation@(skin.to_3x3()@rest_in))).normalized()
        for body in bodies:
            terminal_points[body.name]=[]
            for v in body.data.vertices:
                delta=v.co-cut;axial=delta.dot(rest_in);radial=delta-rest_in*axial
                if not -.001<axial<.10 or radial.length>.145 or abs(v.co.x)<.28:continue
                w=1-smooth(max(0,axial)/.10)
                p=skin@v.co;aligned=target+rotation@(p-old_center)
                v.co=inverse@p.lerp(aligned,w)
                # Refit to the FINAL cuff, not its pre-warp source surface.
                delta=v.co-final_cut;d=delta.dot(final_normal);rad=delta-final_normal*d
                if axial<.085 and rad.length>1e-7:
                    direction=rad.normalized();hit=glove.ray_cast(final_cut,direction,.15)[3]
                    if hit and hit>.004:
                        blend=1-smooth(max(0,axial)/.085)
                        r=rad.length*(1-blend)+max(.002,hit-.0025)*blend
                        v.co=final_cut+final_normal*d+direction*r
                if abs(axial)<.00003:
                    # The original glove cuff is not convex. A radial inset can
                    # cross a neighboring concave facet; use its actual oriented
                    # surface to keep each terminal vertex underneath the cuff.
                    for _ in range(8):
                        near,normal,_,distance=glove.find_nearest(v.co)
                        if (v.co-near).dot(normal)<=-.0005:break
                        v.co=near-normal*.0008
                    terminal_points[body.name].append(list(v.co))
                changed+=1
            body.data.update()
        records[side]={'original_cuff_axis_correction_degrees':math.degrees(rotation.angle),'original_body_vertices_adjusted':changed,'reference_pose':'Idle frame 0','closed_finger_vertices_preserved':True,'terminal_rest_points':terminal_points}
    return records
