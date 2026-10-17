"""Compare exported precision residual intersections with frozen GLB baseline."""
from pathlib import Path
import json
import sys
import bpy
import numpy as np
from mathutils import Vector
from mathutils.bvhtree import BVHTree
sys.path.insert(0,str(Path(__file__).resolve().parent))
from original_guard_grip_local_inspect import RUN,LOW_RUN,sha
from original_guard_grip_local_qa import geometry
from original_guard_tabard_blender import strict_self
from original_guard_quadri_repair_math import segment_triangle_intersection


def line_overlap_length(first,second):
    n0=np.cross(first[1]-first[0],first[2]-first[0])
    n1=np.cross(second[1]-second[0],second[2]-second[0])
    n0/=np.linalg.norm(n0);n1/=np.linalg.norm(n1)
    direction=np.cross(n0,n1)
    angle_sine=float(np.linalg.norm(direction))
    if angle_sine<1e-12:return None,angle_sine
    direction/=angle_sine
    def interval(tri,plane_point,plane_normal):
        signed=(tri-plane_point)@plane_normal
        points=[]
        for j in range(3):
            a,b=tri[j],tri[(j+1)%3]
            da,db=signed[j],signed[(j+1)%3]
            if abs(da)<1e-14:points.append(a)
            if da*db<0:
                points.append(a+(b-a)*da/(da-db))
        if len(points)<2:return None
        scalars=[float(p@direction) for p in points]
        return min(scalars),max(scalars)
    a=interval(first,second[0],n1)
    b=interval(second,first[0],n0)
    if a is None or b is None:return None,angle_sine
    return max(0.,min(a[1],b[1])-max(a[0],b[0])),angle_sine


def load_glb(path):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=str(path))
    obj=next(o for o in bpy.data.objects if o.type=='MESH' and ('OriginalGripSource' in o.data.name or 'OriginalGripLocalRepairMesh' in o.data.name))
    v,f=geometry(obj)
    unique,index=np.unique(v,axis=0,return_inverse=True)
    return v,f,strict_self(unique,index[f])


def main():
    roi=json.loads((RUN/'qa/roi-before.json').read_text(encoding='utf8'))
    baseline=LOW_RUN/'candidate/original-guard-grip-low.glb'
    current=RUN/'candidate/original-guard-grip-local-flip.glb'
    bv,bf,bpairs=load_glb(baseline)
    cv,cf,cpairs=load_glb(current)
    print('RESIDUAL_PAIR_COUNTS',len(bpairs),len(cpairs),flush=True)
    bpy.ops.wm.open_mainfile(filepath=str(LOW_RUN/'candidate/original-guard-grip-low.blend'))
    low=bpy.data.objects['OriginalGripLowCandidate']
    lv,lf=geometry(low)
    roi_trees={name:BVHTree.FromPolygons(lv.tolist(),[tuple(lf[i]) for i in group['region_faces']],all_triangles=True)
               for name,group in roi['groups'].items()}
    wanted=[[7560,9682],[8520,11246]]
    records=[]
    for pair in wanted:
        assert pair in bpairs and pair in cpairs
        old=bv[bf[pair]];new=cv[cf[pair]]
        hits=[]
        for tri_a,tri_b in ((new[0],new[1]),(new[1],new[0])):
            for edge in range(3):
                hit=segment_triangle_intersection(tri_a[edge],tri_a[(edge+1)%3],tri_b)
                if hit and hit['kind']=='interior_crossing':hits.append(hit)
        centre=np.mean([x['point'] for x in hits],axis=0) if hits else new.reshape(-1,3).mean(axis=0)
        distances={name:float(tree.find_nearest(Vector(centre))[3]) for name,tree in roi_trees.items()}
        length,sine=line_overlap_length(new[0],new[1])
        old_length,_=line_overlap_length(old[0],old[1])
        records.append({'glb_triangle_indices':pair,
                        'baseline_triangle_vertices_world_m':old.tolist(),
                        'candidate_triangle_vertices_world_m':new.tolist(),
                        'triangle_coordinates_bitexact_baseline_to_candidate':bool(np.array_equal(old,new)),
                        'interior_edge_triangle_hits':hits,
                        'measured_intersection_interval_length_m':length,
                        'baseline_intersection_interval_length_m':old_length,
                        'plane_normal_cross_sine':sine,
                        'nearest_roi_distance_m':min(distances.values()),
                        'nearest_roi':min(distances,key=distances.get),
                        'all_roi_distances_m':distances})
    report={'source_glb_sha256':sha(baseline),'candidate_glb_sha256':sha(current),
            'baseline_all_strict_pairs':bpairs,'candidate_all_strict_pairs':cpairs,
            'baseline_residual_pairs':wanted,'candidate_residual_pairs':wanted,
            'intersection_measurement':'Plane-plane line direction; each triangle edge clipped to opposite plane; overlap of projected intervals. Scale is float32 GLB coordinates.',
            'roi_distance_measurement':'Nearest triangle surface in each frozen one-ring ROI; metres from mean of strict edge/triangle interior hit points.',
            'records':records}
    (RUN/'qa/export-residuals.json').write_text(json.dumps(report,indent=2)+'\n',encoding='utf8')
    print('RESIDUALS',json.dumps([{'pair':r['glb_triangle_indices'],'same':r['triangle_coordinates_bitexact_baseline_to_candidate'],
          'line_m':r['measured_intersection_interval_length_m'],'nearest_roi_m':r['nearest_roi_distance_m'],
          'nearest_roi':r['nearest_roi']} for r in records]),flush=True)


if __name__=='__main__':main()
