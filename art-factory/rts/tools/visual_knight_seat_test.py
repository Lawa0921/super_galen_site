"""Measure actual boot heading, ankle support and seated body deformation."""
import argparse,json,sys
from pathlib import Path
import bpy,numpy as np
from mathutils import Vector
sys.path.insert(0,str(Path(__file__).parent))
from visual_knight_motion_test import positions

def select_clip(clip):
    for obj in bpy.data.objects:
        if obj.animation_data:
            obj.animation_data.action=None
            for track in obj.animation_data.nla_tracks:track.mute=track.name!=clip

def sole_sets(body):
    sets={}
    for side in 'LR':
        ids=[v.index for v in body.data.vertices if v.co.z<.13 and (v.co.x<0 if side=='L' else v.co.x>0)]
        y=np.array([body.data.vertices[i].co.y for i in ids])
        sets[side]={'all':ids,'toe':[i for i,v in zip(ids,y) if v>np.quantile(y,.8)],'heel':[i for i,v in zip(ids,y) if v<np.quantile(y,.2)]}
    return sets

def main():
    p=argparse.ArgumentParser();p.add_argument('--source',type=Path,required=True);p.add_argument('--report',type=Path,required=True)
    a=p.parse_args(sys.argv[sys.argv.index('--')+1:]);bpy.ops.wm.open_mainfile(filepath=str(a.source.resolve()))
    rig=bpy.data.objects['MountedKnightRig'];body=next(o for o in bpy.data.objects if o.name.startswith('MountedKnightBody_'));sets=sole_sets(body)
    select_clip('Idle');bpy.context.scene.frame_set(1);idle=rig.pose.bones['Root'].matrix.copy();world=rig.matrix_world.copy();inverse=world.inverted()
    horse=bpy.data.objects['WarhorseRig'];idle_saddle=horse.matrix_world@horse.pose.bones['HorseBody'].matrix
    targets={s:inverse@Vector((-.42 if s=='L' else .42,.10,.99)) for s in 'LR'}
    bind=np.array([list(world@v.co) for v in body.data.vertices]);edges=np.array([list(e.vertices) for e in body.data.edges]);lengths=np.linalg.norm(bind[edges[:,0]]-bind[edges[:,1]],axis=1)
    rows=[];failures=[]
    for track in rig.animation_data.nla_tracks:
        clip=track.name;select_clip(clip);action=track.strips[0].action;maximum_error=0;minimum_heading=1;maximum_stretch=0;worst=None
        for frame in range(int(action.frame_range[0]),int(action.frame_range[1])+1):
            bpy.context.scene.frame_set(frame);points=positions(body)
            delta=rig.pose.bones['Root'].matrix@idle.inverted() if clip=='Death' else inverse@(horse.matrix_world@horse.pose.bones['HorseBody'].matrix)@idle_saddle.inverted()@world
            worlddelta=world@delta@inverse
            for side in 'LR':
                error=(world.to_3x3()@(rig.pose.bones['Foot_'+side].head-delta@targets[side])).length
                maximum_error=max(maximum_error,error)
                axis=Vector(points[sets[side]['toe']].mean(axis=0)-points[sets[side]['heel']].mean(axis=0));axis=worlddelta.to_3x3().inverted()@axis
                heading=axis.y/max(1e-8,(axis.x*axis.x+axis.y*axis.y)**.5);minimum_heading=min(minimum_heading,heading)
            current=np.linalg.norm(points[edges[:,0]]-points[edges[:,1]],axis=1);ratios=np.divide(current,lengths,out=np.ones_like(lengths),where=lengths>.005);i=int(ratios.argmax())
            if ratios[i]>maximum_stretch:maximum_stretch=float(ratios[i]);worst={'frame':frame,'edge':i,'vertices':edges[i].tolist()}
        rows.append({'clip':clip,'max_ankle_target_error_m':maximum_error,'minimum_forward_heading_cosine':minimum_heading,'maximum_body_edge_stretch':maximum_stretch,'worst_edge':worst})
        if maximum_error>.01:failures.append(clip+': boots leave their seated support targets')
        if minimum_heading<.90:failures.append(clip+': toes point too far away from the horse head')
        if maximum_stretch>3:failures.append(clip+': rider surface stretches more than 3x')
    report={'source':str(a.source),'clips':rows,'failures':failures,'artistic_quality_proven':False};a.report.parent.mkdir(parents=True,exist_ok=True);a.report.write_text(json.dumps(report,indent=2)+'\n');print(json.dumps(report))
    if failures:raise AssertionError('; '.join(failures))

if __name__=='__main__':main()
