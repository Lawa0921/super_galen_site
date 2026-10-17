"""Refresh source-node local conservative envelopes after final mesh/motion edits."""
import bpy,numpy as np

def refresh_bounds(rig,meshes,sample_hz=120,margin_m=.03):
    scene=bpy.context.scene;bounds={o.name:[np.full(3,np.inf),np.full(3,-np.inf)] for o in meshes};samples=0
    def sample():
        nonlocal samples
        bpy.context.view_layer.update();dep=bpy.context.evaluated_depsgraph_get()
        for obj in meshes:
            ev=obj.evaluated_get(dep);mesh=ev.to_mesh();coords=np.empty(len(mesh.vertices)*3,dtype=np.float32);mesh.vertices.foreach_get('co',coords);coords=coords.reshape(-1,3)
            if not np.isfinite(coords).all():raise ValueError('Non-finite geometry '+obj.name)
            box=bounds[obj.name];box[0]=np.minimum(box[0],coords.min(axis=0));box[1]=np.maximum(box[1],coords.max(axis=0));ev.to_mesh_clear()
        samples+=1
    rig.data.pose_position='REST';sample();rig.data.pose_position='POSE'
    for clip in ['Idle','Walk','Attack','Hurt','Death']:
        rig.animation_data.action=bpy.data.actions[clip];end=float(rig.animation_data.action.frame_range[1]);steps=round(end*sample_hz/30)
        for i in range(steps+1):
            frame=i*30/sample_hz;scene.frame_set(int(frame),subframe=frame%1);sample()
    result=[]
    for obj in meshes:
        lo,hi=bounds[obj.name];center=(lo+hi)/2;radius=float(np.linalg.norm(hi-lo)/2+margin_m)
        metadata={'sphere_center_y_up_m':[float(center[0]),float(center[2]),float(-center[1])],'sphere_radius_m':radius,'sampling_margin_m':margin_m,'sample_hz':sample_hz}
        obj['rtsConservativeBounds']=metadata;result.append({'name':obj.name,**metadata})
    rig.animation_data.action=bpy.data.actions['Idle'];scene.frame_set(0);bpy.context.view_layer.update()
    return {'source_samples':samples,'includes_bind_pose':True,'continuous_envelope_proved':False,'objects':result}
