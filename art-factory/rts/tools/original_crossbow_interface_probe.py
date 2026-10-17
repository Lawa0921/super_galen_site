"""Locate real grip/cuff intersections in one reachable authored ready pose.

This is a read-only source probe. A render scene may add diagnostic materials
and markers, but the source is never saved and nothing is published.
"""
import ast
import bpy
import json
import math
import numpy as np
from pathlib import Path
import sys
from mathutils import Matrix,Vector,Quaternion
from mathutils.bvhtree import BVHTree
from mathutils.geometry import intersect_ray_tri

ROOT=Path(__file__).resolve().parents[3];sys.path.insert(0,str(Path(__file__).parent))
from original_crossbow_carry_solve import arm_matrices,apply_matrices,protract_shoulders
RUN=ROOT/'art-factory/rts/runs/original-crossbow-carry/2026-10-06-v1'
SOURCE=ROOT/'art-factory/rts/runs/original-crossbow-weapon/2026-10-06-v1/geometry-candidate/original-crossbow-grip.blend'
QA=RUN/'qa';QA.mkdir(parents=True,exist_ok=True)


def evaluated(obj):
    e=obj.evaluated_get(bpy.context.evaluated_depsgraph_get());m=e.to_mesh();m.calc_loop_triangles()
    points=[e.matrix_world@v.co for v in m.vertices]
    tris=[tuple(t.vertices) for t in m.loop_triangles];polygons=[t.polygon_index for t in m.loop_triangles]
    e.to_mesh_clear();return points,tris,polygons


def crossing_points(a,b):
    result=[]
    for triangle,other in [(a,b),(b,a)]:
        for p,q in zip(triangle,triangle[1:]+triangle[:1]):
            d=q-p
            if d.length<1e-9:continue
            hit=intersect_ray_tri(*other,d,p,True)
            if hit is None:continue
            t=(hit-p).dot(d)/d.length_squared
            if 1e-6<t<1-1e-6 and not any((v-hit).length<1e-7 for v in result):result.append(hit)
    return result


def winding(point,points,triangles):
    vertices=np.asarray([list(p) for p in points],dtype=np.float64)
    tri=vertices[np.asarray(triangles)]-np.asarray(point,dtype=np.float64)
    a,b,c=tri[:,0],tri[:,1],tri[:,2]
    la=np.linalg.norm(a,axis=1);lb=np.linalg.norm(b,axis=1);lc=np.linalg.norm(c,axis=1)
    numerator=np.einsum('ij,ij->i',a,np.cross(b,c))
    denominator=la*lb*lc+np.einsum('ij,ij->i',a,b)*lc+np.einsum('ij,ij->i',b,c)*la+np.einsum('ij,ij->i',c,a)*lb
    return float(np.sum(2*np.arctan2(numerator,denominator))/(4*np.pi))


def ready(rig):
    action=bpy.data.actions['Idle'];rig.animation_data.action=action;rig.animation_data.action_slot=action.slots[0]
    bpy.context.scene.frame_set(0);bpy.context.view_layer.update()
    original={pb.name:pb.matrix.copy() for pb in rig.pose.bones}
    report=json.loads((ROOT/'art-factory/rts/runs/original-crossbow-waist/2026-10-06-v1/candidate/grip-candidate-report.json').read_text())
    channel=Vector(report['fitted_grips']['R']['channel_local_bone'])
    relative=original['Hand_R'].inverted()@original['Hand_L']
    q=Quaternion((0,0,1),math.radians(22))@original['Hand_R'].to_quaternion()
    right=Matrix.LocRotScale(Vector((.04,.20,1.23))-q@channel,q,Vector((1,1,1)))
    base=protract_shoulders(rig,original,20);matrices=base.copy()
    for side,target,sign in [('R',right,1),('L',right@relative,-1)]:
        matrices.update(arm_matrices(rig,base,side,target,Vector((sign*.60,.08,1.22))))
    apply_matrices(rig,matrices);bpy.context.view_layer.update()
    # The render operator evaluates the active action again. Freeze this
    # diagnostic pose so measured geometry and rendered geometry are identical.
    basis={pb.name:pb.matrix_basis.copy() for pb in rig.pose.bones}
    rig.animation_data_clear()
    for name,matrix in basis.items():rig.pose.bones[name].matrix_basis=matrix
    bpy.context.view_layer.update()
    return matrices,report


def main():
    args=sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else []
    source=Path(args[args.index('--source')+1]).resolve() if '--source' in args else SOURCE
    output=QA/('repaired-interface' if source!=SOURCE else '')
    output.mkdir(parents=True,exist_ok=True)
    bpy.ops.wm.open_mainfile(filepath=str(source));rig=bpy.data.objects['crossbowRig20'];matrices,old=ready(rig)
    hands={s:evaluated(bpy.data.objects['OriginalCrossbowClosedGrip_'+s]) for s in ('R','L')}
    glove_bvh={s:BVHTree.FromPolygons(hands[s][0],hands[s][1],all_triangles=True) for s in hands}
    rows=[];markers=[]
    for lod in (0,1):
        body=bpy.data.objects[f'crossbowOriginalBody_LOD{lod}'];weapon=bpy.data.objects[f'CrossbowWeapon_LOD{lod}']
        parts=json.loads(weapon['original_weapon_parts']);wp,wt,polys=evaluated(weapon);bp,bt,bpolys=evaluated(body)
        wb=BVHTree.FromPolygons(wp,wt,all_triangles=True);bb=BVHTree.FromPolygons(bp,bt,all_triangles=True)
        for i,j in wb.overlap(bb):
            points=crossing_points([wp[k] for k in wt[i]],[bp[k] for k in bt[j]])
            if not points:continue
            name=next(k for k,v in parts.items() if v['polygon_start']<=polys[i]<v['polygon_end'])
            centre=sum(points,Vector())/len(points);side=min(hands,key=lambda s:glove_bvh[s].find_nearest(centre)[3])
            if len(points)>1:points+= [(points[0]+points[1])/2]
            samples=[]
            for p in points:
                inside=winding(p,hands[side][0],hands[side][1]);near,normal,_,dist=glove_bvh[side].find_nearest(p)
                weapon_inverse=(rig.pose.bones['Hand_R'].matrix@rig.data.bones['Hand_R'].matrix_local.inverted()).inverted()
                samples.append({'world':list(p),'weapon_bind':list(weapon_inverse@p),'winding':inside,'glove_distance_m':dist,'nearest_glove_signed_m':(p-near).dot(normal)})
            body_weights=[{body.vertex_groups[g.group].name:g.weight for g in body.data.vertices[k].groups} for k in bt[j]]
            rows.append({'lod':lod,'part':name,'side':side,'body_triangle':list(bt[j]),'body_polygon':bpolys[j],
                         'body_rest_points':[list(body.data.vertices[k].co) for k in bt[j]],'body_weights':body_weights,
                         'weapon_triangle':list(wt[i]),'weapon_rest_points':[list(weapon.data.vertices[k].co) for k in wt[i]],'samples':samples})
            if lod==0:markers.extend(p.copy() for p in points)
    result={'source':str(source),'pose':{'shoulder_degrees':20,'weapon_yaw_delta_degrees':22,'right_channel_world':[.04,.2,1.23]},
            'joints':{s:{'hand_head_rest':list(rig.data.bones['Hand_'+s].head_local),'hand_head_world':list(rig.pose.bones['Hand_'+s].head),
                         'forearm_head_world':list(rig.pose.bones['Forearm_'+s].head),
                         'terminal_rest_points':old['wrist_reference_alignment'][s]['terminal_rest_points']} for s in ('L','R')},
            'rows':rows,'summary':{'pairs':len(rows),'outside_glove_samples':sum(abs(p['winding'])<.5 for r in rows for p in r['samples'])},'runtime_publish_allowed':False}
    (output/'interface-probe.json').write_text(json.dumps(result,indent=2)+'\n');print('INTERFACE_PROBE',json.dumps(result['summary']))
    if '--no-render' in sys.argv:return
    scene=bpy.context.scene;scene.render.engine='BLENDER_EEVEE';scene.eevee.taa_render_samples=32
    scene.render.resolution_x=1200;scene.render.resolution_y=1000;scene.render.resolution_percentage=100
    scene.render.image_settings.file_format='PNG';scene.render.film_transparent=False
    camera=scene.camera;camera.data.type='ORTHO';camera.data.ortho_scale=.72
    mark_mat=bpy.data.materials.new('QAIntersectionRed');mark_mat.diffuse_color=(1,.005,.003,1);mark_mat.use_nodes=True
    shader=mark_mat.node_tree.nodes.get('Principled BSDF');shader.inputs['Base Color'].default_value=(1,.005,.003,1)
    shader.inputs['Emission Color'].default_value=(1,.005,.003,1);shader.inputs['Emission Strength'].default_value=.35
    # Markers are diagnostic only, never saved into the source .blend.
    for k,p in enumerate(markers[::3]):
        bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=1,radius=.0028,location=p)
        obj=bpy.context.object;obj.name='QAIntersection'+str(k);obj.data.materials.append(mark_mat)
    for obj in bpy.data.objects:
        if obj.type=='MESH':obj.hide_render=obj.name not in ['crossbowOriginalBody_LOD0','CrossbowWeapon_LOD0','OriginalCrossbowClosedGrip_L','OriginalCrossbowClosedGrip_R'] and not obj.name.startswith('QAIntersection')
    target=Vector((-.04,.24,1.22))
    for name,direction in [('front',(0,4,1)),('back',(0,-4,1)),('side',(4,0,1)),('quarter',(3,4,2))]:
        camera.location=target+Vector(direction);camera.rotation_euler=(target-camera.location).to_track_quat('-Z','Y').to_euler()
        scene.render.filepath=str(output/f'interface-{name}.png');bpy.ops.render.render(write_still=True)
        error=max(abs(rig.pose.bones[n].matrix[i][j]-m[i][j]) for n,m in matrices.items() for i in range(4) for j in range(4))
        if error>1e-5:raise AssertionError(f'Diagnostic render reset measured pose: {error}')
    for obj in bpy.data.objects:
        if obj.type=='MESH':obj.hide_render=obj.name not in ['crossbowOriginalBody_LOD0','CrossbowWeapon_LOD0'] and not obj.name.startswith('QAIntersection')
    camera.location=target+Vector((3,4,2));camera.rotation_euler=(target-camera.location).to_track_quat('-Z','Y').to_euler()
    scene.render.filepath=str(output/'interface-without-gloves.png');bpy.ops.render.render(write_still=True)


if __name__=='__main__':main()
