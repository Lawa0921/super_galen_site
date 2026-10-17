"""Verify restored body topology and evaluated skin through all authored frames."""
import argparse,json,sys
from pathlib import Path
import bpy
import numpy as np
sys.path.insert(0,str(Path(__file__).parent))
import procedural_gauntlet_build as g
from visual_knight_motion_test import positions
from visual_rider_surface_test import audit


def main():
    p=argparse.ArgumentParser();p.add_argument('--source',type=Path,required=True);p.add_argument('--report',type=Path,required=True);p.add_argument('--prefix',required=True)
    a=p.parse_args(sys.argv[sys.argv.index('--')+1:]);bpy.ops.wm.open_mainfile(filepath=str(a.source.resolve()))
    rig=next(o for o in bpy.data.objects if o.type=='ARMATURE');objects=[o for o in bpy.data.objects if o.type=='MESH' and o.name.startswith(a.prefix)]
    assert len(objects)==2,'Expected both body LODs'
    g.set_action(rig,'Idle');bpy.context.scene.frame_set(0)
    data={};surfaces=[];failures=[]
    for obj in objects:
        # Idle can already compress an elbow crease. Use undeformed bind
        # geometry so unfolding it is not misreported as a material tear.
        points=np.array([list(obj.matrix_world@v.co) for v in obj.data.vertices]);edges=np.array([list(e.vertices) for e in obj.data.edges])
        lengths=np.linalg.norm(points[edges[:,0]]-points[edges[:,1]],axis=1)
        obj.data.calc_loop_triangles();triangles=np.array([list(t.vertices) for t in obj.data.loop_triangles])
        area=np.linalg.norm(np.cross(points[triangles[:,1]]-points[triangles[:,0]],points[triangles[:,2]]-points[triangles[:,0]]),axis=1)*.5
        edge_faces={};adjacent=[set() for _ in triangles]
        for i,t in enumerate(triangles):
            for j,k in ((t[0],t[1]),(t[1],t[2]),(t[2],t[0])):edge_faces.setdefault(tuple(sorted((j,k))),[]).append(i)
        for ids in edge_faces.values():
            for i in ids:adjacent[i].update(set(ids)-{i})
        data[obj.name]=(edges,lengths,triangles,area,adjacent)
        surface=audit(obj,rig);surfaces.append(surface)
        height=max(v.co.z for v in obj.data.vertices);foot_binding={}
        for side in 'LR':
            groups={obj.vertex_groups[n].index for n in ('Foot_'+side,'Shin_'+side)}
            vertices=[v for v in obj.data.vertices if v.co.z<height*.10 and (v.co.x<0 if side=='L' else v.co.x>0)]
            influenced=sum(sum(w.weight for w in v.groups if w.group in groups)>.5 for v in vertices)
            foot_binding[side]={'vertices':len(vertices),'controlled_by_foot_or_shin':influenced}
            if vertices and influenced/len(vertices)<.8:failures.append(obj.name+': '+side+' boot is not controlled by its lower-leg skeleton')
        surface['boot_binding']=foot_binding
        if surface['nonmanifold_edges_away_from_wrists']:failures.append(obj.name+': open torso/leg surface')
        if surface['invalid_weight_vertices']:failures.append(obj.name+': invalid skin weights')
        if max(sum(w.weight>1e-6 for w in v.groups) for v in obj.data.vertices)>4:failures.append(obj.name+': more than four joint influences')
    rows=[]
    for action in bpy.data.actions:
        g.set_action(rig,action.name);maximum=0;minimum=1;worst=None;compressed=None;minz=1e9;collapsed_patch=0;frames=range(int(action.frame_range[0]),int(action.frame_range[1])+1)
        for frame in frames:
            bpy.context.scene.frame_set(frame)
            for obj in objects:
                points=positions(obj);edges,lengths,triangles,area,adjacent=data[obj.name]
                assert np.isfinite(points).all(),'Non-finite evaluated vertices'
                current=np.linalg.norm(points[edges[:,0]]-points[edges[:,1]],axis=1)
                ratios=np.divide(current,lengths,out=np.ones_like(lengths),where=lengths>.005);i=int(ratios.argmax())
                if ratios[i]>maximum:
                    maximum=float(ratios[i]);worst={'object':obj.name,'frame':frame,'edge':i,'reference_length_m':float(lengths[i]),'posed_length_m':float(current[i])}
                j=int(ratios.argmin())
                if ratios[j]<minimum:
                    minimum=float(ratios[j]);compressed={'object':obj.name,'frame':frame,'edge':j,'reference_length_m':float(lengths[j]),'posed_length_m':float(current[j])}
                posed_area=np.linalg.norm(np.cross(points[triangles[:,1]]-points[triangles[:,0]],points[triangles[:,2]]-points[triangles[:,0]]),axis=1)*.5
                remaining=set(np.flatnonzero((area>1e-6)&(posed_area<area*.03)).tolist())
                while remaining:
                    stack=[remaining.pop()];patch=[]
                    while stack:
                        index=stack.pop();patch.append(index);neighbours=adjacent[index]&remaining;remaining-=neighbours;stack.extend(neighbours)
                    if len(patch)>=4:collapsed_patch=max(collapsed_patch,float(area[patch].sum()))
                minz=min(minz,float(points[:,2].min()))
        rows.append({'clip':action.name,'frames_checked':len(frames),'maximum_edge_stretch':maximum,'worst_edge':worst,'minimum_edge_ratio':minimum,'most_compressed_edge':compressed,'largest_collapsed_surface_patch_bind_area_m2':collapsed_patch,'minimum_body_z':minz})
        if maximum>3:failures.append(action.name+': body surface stretches more than 3x on edges longer than 5 mm')
        # A single compressed inner-elbow edge is a crease, not loss of the
        # entire joint. Reject connected patches whose actual triangle area
        # collapses, retaining edge compression as a visual-review locator.
        if collapsed_patch>.0005:failures.append(action.name+': connected body surface patch collapses below 3% of bind area')
        if minz<-.02:failures.append(action.name+': body penetrates ground by more than 2 cm')
    report={'source':str(a.source),'strain_reference':'undeformed bind geometry','surfaces':surfaces,'poses':rows,'failures':failures,'artistic_quality_proven':False}
    a.report.parent.mkdir(parents=True,exist_ok=True);a.report.write_bytes((json.dumps(report,indent=2)+'\n').encode());print(json.dumps(report))
    if failures:raise AssertionError('; '.join(failures))


if __name__=='__main__':main()
