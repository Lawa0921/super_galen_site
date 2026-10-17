"""Strict candidate/export topology and sword geometry check."""
from pathlib import Path
import json
import sys
from collections import defaultdict
import bpy
import numpy as np
from mathutils.bvhtree import BVHTree
sys.path.insert(0, str(Path(__file__).resolve().parent))
from original_guard_grip_local_inspect import RUN, LOW_RUN, sha
from original_guard_grip_low_qa import topology, uv_coverage
from original_guard_grip_low_local_diagnose import face_components, edge_incidence
from original_guard_grip_fit_blender import inside
from original_guard_grip_fit_math import triangles_cross
from original_guard_tabard_blender import strict_self
from original_guard_shell_winding_math import winding_numbers, closed_consistent_shell, classify_shell_samples
from original_guard_quadri_repair_math import segment_triangle_intersection


def geometry(obj):
    obj.data.calc_loop_triangles()
    v = np.asarray([tuple(obj.matrix_world @ x.co) for x in obj.data.vertices], dtype=np.float64)
    f = np.asarray([tuple(t.vertices) for t in obj.data.loop_triangles], dtype=np.int32)
    return v, f


def indexed_topology(faces):
    edges=defaultdict(list)
    for face in faces:
        for j in range(3):
            a,b=int(face[j]),int(face[(j+1)%3])
            edges[tuple(sorted((a,b)))].append((a,b))
    return {'connected_components':len(face_components(faces)),
            'boundary_edges':sum(len(x)==1 for x in edges.values()),
            'overfull_edges':sum(len(x)>2 for x in edges.values()),
            'inconsistent_winding_edges':sum(len(x)==2 and x[0]==x[1] for x in edges.values())}


def assess(glove, sword, closed_shells=True, export_weld=False):
    v, f = geometry(glove)
    sv, sf = geometry(sword)
    if export_weld:
        unique, inverse = np.unique(v, axis=0, return_inverse=True)
        welded_faces = inverse[f]
        self_pairs = strict_self(unique, welded_faces)
    else:
        unique, welded_faces = v, f
        self_pairs = strict_self(v, f)
    glove_tree = BVHTree.FromPolygons(v.tolist(), f.tolist(), all_triangles=True)
    sword_tree = BVHTree.FromPolygons(sv.tolist(), sf.tolist(), all_triangles=True)
    overlaps = glove_tree.overlap(sword_tree)
    sword_crossings = [(int(a),int(b)) for a,b in overlaps if triangles_cross(v[f[a]], sv[sf[b]])]
    sword_inside = [int(i) for i,p in enumerate(sv) if inside(glove_tree,p)]
    tri = v[f]
    areas = np.linalg.norm(np.cross(tri[:,1]-tri[:,0], tri[:,2]-tri[:,0]),axis=1)*.5
    result = {'vertices':len(v),'triangles':len(f),'topology':topology(glove.data),
              'uv_coverage':uv_coverage(glove.data),
              'strict_nonincident_self_pairs':self_pairs,
              'geometric_welded_vertices':len(unique),
              'export_duplicate_vertex_note':'GLB material/UV seams duplicate indexed vertices; strict self uses exact-coordinate welding before shared-vertex exclusion' if export_weld else None,
              'geometric_welded_topology':indexed_topology(welded_faces) if export_weld else None,
              'strict_self_exclusions':'Pairs sharing any vertex and coplanar overlap excluded',
              'sword_triangle_crossings':sword_crossings,'sword_vertices_inside_glove':sword_inside,
              'microface_area_threshold_m2':1e-10,
              'microfaces_below_threshold':int((areas<1e-10).sum()),
              'minimum_face_area_m2':float(areas.min())}
    if closed_shells:
        shells=[];inside_union=set();boundary_union=set()
        for number,ids in enumerate(face_components(sf)):
            faces=sf[ids]
            shell={'component':number,'triangles':len(ids),**edge_incidence(faces),
                   'closed_consistent_shell':closed_consistent_shell(faces)}
            if shell['closed_consistent_shell']:
                winding=winding_numbers(v,sv,faces)
                tree=BVHTree.FromPolygons(sv.tolist(),faces.tolist(),all_triangles=True)
                distances=np.asarray([tree.find_nearest(p)[3] for p in v])
                inside_mask,boundary_mask=classify_shell_samples(winding,distances)
                shell['inside_vertices']=np.flatnonzero(inside_mask).tolist()
                shell['boundary_vertices']=np.flatnonzero(boundary_mask).tolist()
                inside_union.update(shell['inside_vertices'])
                boundary_union.update(shell['boundary_vertices'])
            else:
                shell['classification']='open_or_inconsistent_no_volume_claim'
            shells.append(shell)
        result['sword_shells']=shells
        result['glove_vertices_inside_closed_shell_union']=sorted(inside_union)
        result['glove_vertices_on_closed_shell_boundaries']=sorted(boundary_union)
    if self_pairs:
        records=[]
        for a,b in self_pairs:
            pair=[]
            for index in (a,b):
                t=v[f[index]]
                pair.append({'triangle':index,'world_vertices_m':t.tolist(),
                             'area_m2':float(np.linalg.norm(np.cross(t[1]-t[0],t[2]-t[0]))*.5)})
            hits=[]
            for x,y in ((v[f[a]],v[f[b]]),(v[f[b]],v[f[a]])):
                for edge in range(3):
                    hit=segment_triangle_intersection(x[edge],x[(edge+1)%3],y)
                    if hit and hit['kind']=='interior_crossing':hits.append(hit)
            records.append({'faces':pair,'hits':hits})
        result['strict_self_records']=records
    return result


def main():
    build=json.loads((RUN/'qa/flip-search.json').read_text(encoding='utf8'))
    blend=RUN/'candidate/original-guard-grip-local-flip.blend'
    glb=RUN/'candidate/original-guard-grip-local-flip.glb'
    assert sha(blend)==build['candidate_blend_sha256']
    assert sha(glb)==build['candidate_glb_sha256']
    bpy.ops.wm.open_mainfile(filepath=str(blend))
    blend_result=assess(bpy.data.objects['OriginalGripLowCandidate'],bpy.data.objects['KingdomSteelSword_LOD0'])
    print('BLEND_STRICT_SELF',len(blend_result['strict_nonincident_self_pairs']),flush=True)
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=str(glb))
    names=list(bpy.data.objects.keys())
    glove=next(o for o in bpy.data.objects if o.type=='MESH' and 'OriginalGripLocalRepairMesh' in o.data.name)
    sword=next(o for o in bpy.data.objects if o.type=='MESH' and 'SwordDiamondBladeMesh' in o.data.name)
    glb_result=assess(glove,sword,closed_shells=False,export_weld=True)
    report={'runtime_publish_allowed':False,'candidate_blend_sha256':sha(blend),'candidate_glb_sha256':sha(glb),
            'glb_object_names':names,'blend':blend_result,'glb':glb_result}
    (RUN/'qa/strict-geometry.json').write_text(json.dumps(report,indent=2)+'\n',encoding='utf8')
    print('LOCAL_STRICT_QA',json.dumps({fmt:{'triangles':r['triangles'],'self':len(r['strict_nonincident_self_pairs']),
          'sword_cross':len(r['sword_triangle_crossings']),'sword_inside':len(r['sword_vertices_inside_glove']),
          'microfaces':r['microfaces_below_threshold'],'topology':r['topology']} for fmt,r in [('blend',blend_result),('glb',glb_result)]}),flush=True)


if __name__=='__main__':main()
