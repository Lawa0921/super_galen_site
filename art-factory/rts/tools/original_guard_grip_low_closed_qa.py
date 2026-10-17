"""Supplement frozen low-glove QA with strict self tests and closed-shell union."""
from pathlib import Path
import hashlib,json,sys
import bpy,numpy as np
from mathutils.bvhtree import BVHTree
sys.path.insert(0,str(Path(__file__).resolve().parent))
from original_guard_shell_winding_math import winding_numbers,closed_consistent_shell,classify_shell_samples
from original_guard_grip_low_local_diagnose import face_components,edge_incidence
from original_guard_tabard_blender import strict_self
from original_guard_quadri_repair_math import segment_triangle_intersection
ROOT=Path(__file__).resolve().parents[3];RUN=ROOT/'art-factory/rts/runs/original-guard-grip-low/2026-10-05'
def sha(path):return hashlib.sha256(path.read_bytes()).hexdigest()
def geometry(obj):
    obj.data.calc_loop_triangles()
    return np.asarray([obj.matrix_world@v.co for v in obj.data.vertices],float),np.asarray([p.vertices[:] for p in obj.data.loop_triangles],int)
def main():
    blend=RUN/'candidate/original-guard-grip-low.blend';report=json.loads((RUN/'qa/build.json').read_text())
    if sha(blend)!=report['sha256']['blend']:raise ValueError('Frozen candidate mismatch')
    bpy.ops.wm.open_mainfile(filepath=str(blend));glove=bpy.data.objects['OriginalGripLowCandidate'];sword=bpy.data.objects['KingdomSteelSword_LOD0']
    v,f=geometry(glove);sv,sf=geometry(sword)
    self_pairs=strict_self(v,f);print('LOW_SELF',len(self_pairs),flush=True)
    crossing_records=[]
    for first,second in self_pairs:
        triangles=v[f[[first,second]]];hits=[]
        for a,b in [(triangles[0],triangles[1]),(triangles[1],triangles[0])]:
            for edge in range(3):
                hit=segment_triangle_intersection(a[edge],a[(edge+1)%3],b)
                if hit is not None and hit['kind']=='interior_crossing':hits.append(hit)
        crossing_records.append({'triangles':[first,second],'vertices_world_m':triangles.tolist(),
          'areas_m2':(.5*np.linalg.norm(np.cross(triangles[:,1]-triangles[:,0],triangles[:,2]-triangles[:,0]),axis=1)).tolist(),
          'edge_triangle_hits':hits})
    components=[];inside_union=set();boundary_union=set()
    for number,ids in enumerate(face_components(sf)):
        faces=sf[ids];incidence=edge_incidence(faces)
        item={'component':number,'triangles':len(ids),**incidence,'closed_consistent_shell':closed_consistent_shell(faces)}
        if not item['closed_consistent_shell']:
            item['classification']='not_a_closed_consistent_volume';components.append(item);continue
        winding=winding_numbers(v,sv,faces);tree=BVHTree.FromPolygons(sv.tolist(),faces.tolist(),all_triangles=True)
        # Explicitly separate points on a shell surface from solid-angle inside.
        distances=np.asarray([tree.find_nearest(point)[3] for point in v])
        inside_mask,boundary_mask=classify_shell_samples(winding,distances)
        boundary=np.flatnonzero(boundary_mask).tolist()
        inside=np.flatnonzero(inside_mask).tolist()
        outside_boundary=np.delete(winding,boundary)
        integer_residual=float(np.max(np.abs(outside_boundary-np.rint(outside_boundary)))) if len(outside_boundary) else 0.
        item.update({'classification':'closed_shell','inside_vertices':inside,'boundary_vertices':boundary,'maximum_winding_integer_residual':integer_residual})
        inside_union.update(inside);boundary_union.update(boundary);components.append(item)
        print('CLOSED_SHELL',number,len(inside),len(boundary),integer_residual,flush=True)
    result={'status':'supplement_measured_pending_independent_review','runtime_publish_allowed':False,
      'candidate_blend_sha256':sha(blend),'candidate_glb_sha256':sha(RUN/'candidate/original-guard-grip-low.glb'),
      'geometry_changed':False,'glove_vertices':len(v),'glove_triangles':len(f),'strict_nonincident_self_pairs':self_pairs,
      'self_crossing_records':crossing_records,
      'containment_method':'Oriented triangle solid angles per individually closed consistent sword component; union of interiors, not parity of the joined mesh. Explicit 0.1-micrometer near-surface classification.',
      'sword_components':components,'glove_vertices_inside_closed_shell_union':sorted(inside_union),'glove_vertices_on_closed_shell_boundaries':sorted(boundary_union),
      'previous_counterexample_3262_inside':3262 in inside_union,
      'limits':['Open/inconsistently oriented sword components do not define a closed volume; separate surface crossing evidence still applies.','Strict self detector excludes face pairs sharing vertices and does not prove absence of coplanar overlap.','This supplement does not resolve the 31 near-source normal-opposition measurements or approve glove shape, UVs or runtime.']}
    (RUN/'qa/closed-shell-and-self.json').write_bytes((json.dumps(result,indent=2)+'\n').encode())
    print('LOW_SUPPLEMENT_DONE',len(self_pairs),len(inside_union),len(boundary_union),flush=True)
if __name__=='__main__':main()
