"""Original source-fit arm rig experiment; source comparison and real LBS pose QA.

All flat colors, wire overlays and cut caps are diagnostic displays, not game art.
"""
import hashlib
import json
import math
from pathlib import Path
import sys

import bpy
import bmesh
import numpy as np
from mathutils import Vector, Matrix, Quaternion

ROOT=Path(__file__).resolve().parents[3]
RUN=ROOT/'art-factory/rts/runs/original-guard-arm-cage/2026-10-05'
sys.path.insert(0,str(Path(__file__).parent))
from source_fit_cage import skin_weights


def save_json(path,data):
    path.parent.mkdir(parents=True,exist_ok=True)
    path.write_bytes((json.dumps(data,indent=2)+'\n').encode())


def material(name,color,metal=0):
    mat=bpy.data.materials.new(name);mat.diffuse_color=(*color,1);mat.use_nodes=True
    bsdf=mat.node_tree.nodes.get('Principled BSDF')
    bsdf.inputs['Base Color'].default_value=(*color,1)
    bsdf.inputs['Metallic'].default_value=metal
    bsdf.inputs['Roughness'].default_value=.48
    return mat


def build_rig(data,mode):
    verts=data['vertices']; faces=data['faces']; ts=np.asarray(data['ts']); n=data['ring_size']
    mesh=bpy.data.meshes.new(mode+'Mesh');mesh.from_pydata(verts,[],faces);mesh.update()
    obj=bpy.data.objects.new(mode,mesh);bpy.context.collection.objects.link(obj)
    obj.data.materials.append(material('QA neutral ceramic '+mode,(.30,.38,.46)))
    for p in mesh.polygons:p.use_smooth=True
    arm=bpy.data.armatures.new(mode+'Rig');rig=bpy.data.objects.new(mode+'Rig',arm);bpy.context.collection.objects.link(rig)
    bpy.context.view_layer.objects.active=rig;rig.select_set(True)
    bpy.ops.object.mode_set(mode='EDIT')
    centers=np.asarray(data['centers']); elbow_t=data['elbow_t']; ix=int(np.argmin(abs(ts-elbow_t))); pivot=Vector(centers[ix]); axis=Vector(data['axis'])
    names=['UpperArm','Forearm'] if mode=='TwoBoneBaseline' else ['UpperArm','ElbowSupport','Forearm','ForearmRoll','WristRoll']
    for name in names:
        bone=arm.edit_bones.new(name);bone.head=pivot;bone.tail=pivot+axis*.14
        bone.align_roll(Vector((0,1,0)))
    bpy.ops.object.mode_set(mode='OBJECT');rig.select_set(False)
    stations=np.r_[np.repeat(ts,n),ts[0],ts[-1]]
    if mode=='TwoBoneBaseline':
        weights=skin_weights(stations,elbow_t,.12)
    else:
        # Three elbow transforms bound any pairwise angular change to 45 degrees.
        upper_hinge=skin_weights(stations,elbow_t-.065,.065)[:,1]
        hinge_lower=skin_weights(stations,elbow_t+.065,.065)[:,1]
        roll=skin_weights(stations,.80,.12)[:,1]
        wrist=skin_weights(stations,.93,.07)[:,1]
        weights=np.column_stack((1-upper_hinge,upper_hinge*(1-hinge_lower),upper_hinge*hinge_lower*(1-roll),upper_hinge*hinge_lower*roll*(1-wrist),upper_hinge*hinge_lower*roll*wrist))
    assert np.max(abs(weights.sum(1)-1))<1e-8
    for i,name in enumerate(names):
        group=obj.vertex_groups.new(name=name)
        for vertex,w in enumerate(weights[:,i]):
            if w>1e-8:group.add([vertex],float(w),'REPLACE')
    modifier=obj.modifiers.new('Actual linear skinning','ARMATURE');modifier.object=rig;modifier.use_deform_preserve_volume=False
    obj.parent=rig
    return obj,rig,weights,pivot,axis


def pose(rig,pivot,axis,bend_degrees,twist_degrees):
    # +Y is forward. Bend axis sends the source's downward forearm toward +Y.
    bend_axis=axis.cross(Vector((0,1,0))).normalized()
    for pb in rig.pose.bones:
        if pb.name=='UpperArm':bend=0;twist=0
        elif pb.name=='ElbowSupport':bend=.5*bend_degrees;twist=0
        else:
            bend=bend_degrees
            twist=twist_degrees*({'Forearm':0,'ForearmRoll':.5,'WristRoll':1}.get(pb.name,0))
            if len(rig.pose.bones)==2:twist=twist_degrees
        rotation=Quaternion(bend_axis,math.radians(bend)).to_matrix().to_4x4() @ Quaternion(axis,math.radians(twist)).to_matrix().to_4x4()
        transform=Matrix.Translation(pivot) @ rotation @ Matrix.Translation(-pivot)
        pb.matrix=transform @ pb.bone.matrix_local
    bpy.context.view_layer.update()


def evaluated(obj):
    result=obj.evaluated_get(bpy.context.evaluated_depsgraph_get()); mesh=result.to_mesh()
    v=np.asarray([result.matrix_world@x.co for x in mesh.vertices],float)
    result.to_mesh_clear();return v


def ring_metrics(rest,posed,n,rows):
    areas=[]; ratios=[]; axial=[]
    for row in range(rows):
        a=rest[row*n:(row+1)*n];b=posed[row*n:(row+1)*n]
        def area(p):return np.linalg.norm(np.sum(np.cross(p-p.mean(0),np.roll(p,-1,axis=0)-p.mean(0)),axis=0))/2
        areas.append(float(area(b)/area(a)))
        aa=np.linalg.svd(a-a.mean(0),compute_uv=False);bb=np.linalg.svd(b-b.mean(0),compute_uv=False)
        ratios.append((bb[:2]/aa[:2]).tolist())
        if row<rows-1:
            nxt=posed[(row+1)*n:(row+2)*n]
            center_axis=nxt.mean(0)-b.mean(0)
            axial.append(float(np.min((nxt-b)@center_axis)/(np.dot(center_axis,center_axis)+1e-14)))
    return {'ring_area_ratios':areas,'ring_principal_radius_ratios':ratios,'minimum_area_ratio':min(areas),'minimum_principal_radius_ratio':float(np.min(ratios)),'maximum_principal_radius_ratio':float(np.max(ratios)),
            'minimum_longitudinal_strip_ratio':min(axial),'nonpositive_strip_rows':sum(x<=0 for x in axial),
            'non_claim':'Strip inversion proxy is not a complete triangle self-intersection test.'}


def camera(target,offset,scale):
    d=bpy.data.cameras.new('QA camera');d.type='ORTHO';d.ortho_scale=scale
    o=bpy.data.objects.new('QA camera',d);bpy.context.collection.objects.link(o)
    o.location=Vector(target)+Vector(offset);o.rotation_euler=(Vector(target)-o.location).to_track_quat('-Z','Y').to_euler();bpy.context.scene.camera=o


def render(obj,path,target,offset=(1.4,2.4,.65),scale=.50,wire=False):
    if wire:
        copy=obj.copy();copy.data=obj.data.copy();bpy.context.collection.objects.link(copy)
        copy.data.materials.clear();copy.data.materials.append(material('QA topology wires',(.015,.025,.032)))
        mod=copy.modifiers.new('Topology overlay','WIREFRAME');mod.thickness=.0007;mod.use_replace=True
    camera(target,offset,scale)
    bpy.context.scene.render.filepath=str(path);bpy.ops.render.render(write_still=True)
    if wire:bpy.data.objects.remove(copy,do_unlink=True)


def main():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    data=json.loads((RUN/'candidate/source-fit-arm.json').read_text())
    scene=bpy.context.scene;scene.render.engine='BLENDER_EEVEE';scene.render.resolution_x=780;scene.render.resolution_y=780;scene.render.resolution_percentage=100
    scene.render.image_settings.file_format='PNG';scene.world=bpy.data.worlds.new('QA world');scene.world.color=(.055,.06,.075)
    scene.view_settings.look='AgX - Medium High Contrast'
    for loc,energy,size in [((2,3,3),500,2),((-2,1,2),300,2),((0,-2,2),400,1.5)]:
        d=bpy.data.lights.new('QA area','AREA');d.energy=energy;d.shape='DISK';d.size=size
        o=bpy.data.objects.new('QA area',d);bpy.context.collection.objects.link(o);o.location=loc;o.rotation_euler=(Vector((.35,0,1.2))-o.location).to_track_quat('-Z','Y').to_euler()
    out=RUN/'qa/renders';out.mkdir(parents=True,exist_ok=True)
    setups=[build_rig(data,mode) for mode in ('TwoBoneBaseline','SupportedElbow')]
    for obj,rig,_,_,_ in setups:obj.hide_render=True
    # Exact source crop has no smooth/remesh modifier and is explicitly a comparison only.
    bpy.ops.wm.ply_import(filepath=str(RUN/'candidate/source-arm-region.ply'))
    source=bpy.context.object;source.name='REFERENCE_original_source_region';source.data.materials.append(material('QA source',(.30,.38,.46)))
    for p in source.data.polygons:p.use_smooth=True
    target=Vector((.34,-.005,1.16))
    render(source,out/'source-neutral.png',target,wire=False);source.hide_render=True;source.hide_set(True)
    report={'status':'pose_evidence_pending_review','runtime_publish_allowed':False,'scope':'Right arm local method proof only; no hands, shoulder or full character approval','source_fit_arm_sha256':hashlib.sha256((RUN/'candidate/source-fit-arm.json').read_bytes()).hexdigest(),'rigs':{},'renders':{}}
    for obj,rig,weights,pivot,axis in setups:
        obj.hide_render=False
        rest=np.asarray(data['vertices']);record={}
        for name,bend,twist in [('neutral',0,0),('bend90',90,0),('twist45',0,45),('bend90-twist45',90,45)]:
            pose(rig,pivot,axis,bend,twist)
            p=evaluated(obj)
            record[name]=ring_metrics(rest,p,data['ring_size'],len(data['ts']))
            save_json(RUN/'qa/poses'/f'{obj.name}-{name}.json',{'positions':p.tolist(),'metrics':record[name]})
            render(obj,out/f'{obj.name}-{name}.png',target,scale=.56,wire=True)
        pose(rig,pivot,axis,0,0)
        record['linear_skinning']=True;record['bones']=list(rig.pose.bones.keys())
        # No claim of segmented armor: explicitly disclose blended surface percentages.
        record['vertices_below_95_percent_single_bone_weight']=int(np.sum(weights.max(1)<.95))
        report['rigs'][obj.name]=record
        obj.hide_render=True
    setups[1][0].hide_render=False
    bpy.ops.object.select_all(action='DESELECT')
    setups[1][0].select_set(True);setups[1][1].select_set(True)
    # Save/export the candidate in neutral with an authored diagnostic bend/twist clip.
    obj,rig,weights,pivot,axis=setups[1]
    for frame,bend,twist in [(0,0,0),(30,90,0),(60,0,45),(90,90,45),(120,0,0)]:
        pose(rig,pivot,axis,bend,twist)
        for pb in rig.pose.bones:
            pb.rotation_mode='QUATERNION'
            pb.keyframe_insert(data_path='location',frame=frame)
            pb.keyframe_insert(data_path='rotation_quaternion',frame=frame)
            pb.keyframe_insert(data_path='scale',frame=frame)
    rig.animation_data.action.name='QA_ElbowTwist_Original'
    scene.frame_start=0;scene.frame_end=120;scene.render.fps=30;scene.frame_set(0)
    bpy.ops.wm.save_as_mainfile(filepath=str(RUN/'candidate/source-fit-arm.blend'))
    bpy.ops.export_scene.gltf(filepath=str(RUN/'candidate/source-fit-arm.glb'),export_format='GLB',use_selection=True,export_yup=True,export_animations=True,export_force_sampling=True)
    report['artifacts']={p.name:hashlib.sha256(p.read_bytes()).hexdigest() for p in (RUN/'candidate/source-fit-arm.blend',RUN/'candidate/source-fit-arm.glb')}
    report['tools_sha256']={p.name:hashlib.sha256(p.read_bytes()).hexdigest() for p in (Path(__file__),Path(__file__).with_name('source_fit_cage.py'))}
    report['renders']={p.name:hashlib.sha256(p.read_bytes()).hexdigest() for p in sorted(out.glob('*.png'))}
    save_json(RUN/'qa/blender-pose-report.json',report)
    print(json.dumps({name:{pose:round(v['minimum_area_ratio'],5) for pose,v in record.items() if isinstance(v,dict)} for name,record in report['rigs'].items()}))


if __name__=='__main__':main()
