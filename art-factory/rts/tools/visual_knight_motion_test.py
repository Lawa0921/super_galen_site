"""Check actual evaluated horse geometry through every coupled NLA clip."""
import argparse,json,sys
from pathlib import Path
import bpy
import numpy as np


def select(clip,frame):
    for obj in bpy.context.scene.objects:
        if obj.animation_data:
            obj.animation_data.action=None
            for track in obj.animation_data.nla_tracks:track.mute=track.name!=clip
    bpy.context.scene.frame_set(frame)


def positions(obj):
    evaluated=obj.evaluated_get(bpy.context.evaluated_depsgraph_get())
    mesh=evaluated.to_mesh();points=np.array([list(evaluated.matrix_world@v.co) for v in mesh.vertices])
    evaluated.to_mesh_clear();return points


def main():
    p=argparse.ArgumentParser();p.add_argument('--source',type=Path,required=True);p.add_argument('--report',type=Path,required=True)
    a=p.parse_args(sys.argv[sys.argv.index('--')+1:]);bpy.ops.wm.open_mainfile(filepath=str(a.source.resolve()))
    horse=next(o for o in bpy.data.objects if o.name.startswith('NeuralWarhorse_'))
    rig=next(m.object for m in horse.modifiers if m.type=='ARMATURE')
    select('Idle',1);reference=positions(horse)
    edges=np.array([list(e.vertices) for e in horse.data.edges]);lengths=np.linalg.norm(reference[edges[:,0]]-reference[edges[:,1]],axis=1)
    useful=lengths>.005;rows=[];failures=[]
    for track in rig.animation_data.nla_tracks:
        start=min(int(s.frame_start) for s in track.strips);end=max(int(s.frame_end) for s in track.strips)
        maximum=0;worst=None;minz=1e9
        for frame in range(start,end+1):
            select(track.name,frame);points=positions(horse)
            if len(points)!=len(reference) or not np.isfinite(points).all():raise AssertionError('Invalid evaluated horse surface')
            current=np.linalg.norm(points[edges[:,0]]-points[edges[:,1]],axis=1)
            ratios=np.divide(current,lengths,out=np.ones_like(lengths),where=useful)
            index=int(ratios.argmax())
            if ratios[index]>maximum:
                maximum=float(ratios[index]);worst={'frame':frame,'edge':index,'vertices':edges[index].tolist(),'reference_length_m':float(lengths[index]),'posed_length_m':float(current[index])}
            minz=min(minz,float(points[:,2].min()))
        rows.append({'clip':track.name,'frames_checked':end-start+1,'maximum_edge_stretch':maximum,'worst_edge':worst,'minimum_surface_z':minz})
        if maximum>3:failures.append(track.name+': surface stretches more than 3x on edges longer than 5 mm')
    if len(rows)<5:failures.append('Missing expected Idle/Walk/Attack/Hurt/Death clips')
    report={'source':str(a.source),'horse':horse.name,'poses':rows,'failures':failures,'artistic_quality_proven':False}
    a.report.parent.mkdir(parents=True,exist_ok=True);a.report.write_bytes((json.dumps(report,indent=2)+'\n').encode())
    print(json.dumps(report))
    if failures:raise AssertionError('; '.join(failures))


if __name__=='__main__':main()
