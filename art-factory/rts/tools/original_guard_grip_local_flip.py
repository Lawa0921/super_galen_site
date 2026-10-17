"""One evidence-driven same-ROI correction using only oriented edge flips."""
from collections import defaultdict
from pathlib import Path
import json
import sys
import bpy
import numpy as np
sys.path.insert(0, str(Path(__file__).resolve().parent))
from original_guard_grip_local_inspect import RUN, LOW_RUN, sha
from original_guard_grip_local_math import oriented_flip
from original_guard_tabard_blender import strict_self


def edge_map(faces):
    out=defaultdict(list)
    for i,face in enumerate(faces):
        for j in range(3):out[tuple(sorted((int(face[j]),int(face[(j+1)%3]))))].append(i)
    return out


def areas(vertices,faces):
    tri=vertices[faces]
    return np.linalg.norm(np.cross(tri[:,1]-tri[:,0],tri[:,2]-tri[:,0]),axis=1)*.5


def main():
    roi=json.loads((RUN/'qa/roi-before.json').read_text(encoding='utf8'))
    source=LOW_RUN/'candidate/original-guard-grip-low.blend'
    assert sha(source)==roi['source_low_blend_sha256']
    bpy.ops.wm.open_mainfile(filepath=str(source))
    glove=bpy.data.objects['OriginalGripLowCandidate']
    glove.data.calc_loop_triangles()
    vertices=np.asarray([tuple(glove.matrix_world@v.co) for v in glove.data.vertices],float)
    faces=np.asarray([tuple(t.vertices) for t in glove.data.loop_triangles],int)
    allowed=set(roi['union_region_faces'])
    perimeter={tuple(e) for g in roi['groups'].values() for e in g['perimeter_edges']}
    initial_pairs=strict_self(vertices,faces)
    current_pairs=initial_pairs
    changes=[]
    for iteration in range(24):
        if not current_pairs:break
        fmap=edge_map(faces)
        offenders={i for pair in current_pairs for i in pair}
        proposals=[]
        for edge,incidence in fmap.items():
            if len(incidence)!=2 or edge in perimeter:continue
            a,b=incidence
            if a not in allowed or b not in allowed or (a not in offenders and b not in offenders):continue
            flipped=oriented_flip(tuple(faces[a]),tuple(faces[b]))
            if flipped is None:continue
            newedge=tuple(sorted(set(flipped[0])&set(flipped[1])))
            if newedge in fmap:continue
            proposal=np.asarray(flipped,dtype=int)
            newareas=areas(vertices,proposal)
            oldareas=areas(vertices,faces[[a,b]])
            if min(newareas)<=1e-14 or (sum(newareas<1e-10)>sum(oldareas<1e-10)):continue
            previous=faces[[a,b]].copy()
            faces[a],faces[b]=proposal
            candidate=strict_self(vertices,faces)
            faces[a],faces[b]=previous
            if len(candidate)<len(current_pairs):
                proposals.append((len(candidate),-float(min(newareas)),edge,a,b,proposal,candidate))
        if not proposals:break
        proposals.sort(key=lambda item:(item[0],item[1],item[2]))
        score,_,edge,a,b,proposal,candidate=proposals[0]
        old=faces[[a,b]].tolist()
        faces[a],faces[b]=proposal
        changes.append({'iteration':iteration,'flipped_edge':edge,'faces':[a,b],
                        'before':old,'after':proposal.tolist(),'strict_pairs_after':score})
        current_pairs=candidate
        print('FLIP',iteration,'pairs',score,'edge',edge,flush=True)
    assert perimeter.issubset(set(edge_map(faces))), 'ROI perimeter changed'
    result={'status':'candidate_if_zero_self_else_failed','source_low_blend_sha256':sha(source),
            'strict_pairs_before':initial_pairs,'strict_pairs_after':current_pairs,
            'changes':changes,'original_triangles':len(faces),'vertices_changed':0,
            'perimeter_edges_unchanged':True,
            'microfaces_before':int((areas(vertices,np.asarray([tuple(t.vertices) for t in glove.data.loop_triangles],int))<1e-10).sum()),
            'microfaces_after':int((areas(vertices,faces)<1e-10).sum())}
    (RUN/'qa/flip-search.json').write_text(json.dumps(result,indent=2)+'\n',encoding='utf8')
    print('FLIP_RESULT',json.dumps({k:v for k,v in result.items() if k not in ('strict_pairs_before','strict_pairs_after','changes')}|{'changes':len(changes),'strict_pairs_after':len(current_pairs)}),flush=True)
    if current_pairs:
        return
    # Apply the proven face list to an editable copy while retaining exact point records.
    oldmesh=glove.data
    old_uv=oldmesh.uv_layers.active
    uv_by_face=[]
    for poly in oldmesh.polygons:
        uv_by_face.append({oldmesh.loops[li].vertex_index:tuple(old_uv.data[li].uv) for li in poly.loop_indices})
    vertex_uv={vertex:uv for mapping in uv_by_face for vertex,uv in mapping.items()}
    old_weights=[[(g.group,g.weight) for g in v.groups] for v in oldmesh.vertices]
    group_names=[group.name for group in glove.vertex_groups]
    old_materials=list(oldmesh.materials)
    replacement=bpy.data.meshes.new('OriginalGripLocalRepairMesh')
    replacement.from_pydata([tuple(v.co) for v in oldmesh.vertices],[],faces.tolist())
    replacement.update()
    for mat in old_materials:replacement.materials.append(mat)
    uv=replacement.uv_layers.new(name=old_uv.name)
    for i,poly in enumerate(replacement.polygons):
        face_uv=uv_by_face[i]
        for li in poly.loop_indices:
            index=replacement.loops[li].vertex_index
            uv.data[li].uv=face_uv.get(index,vertex_uv[index])
    glove.data=replacement
    for group_name in group_names:
        glove.vertex_groups.new(name=group_name)
    for i,groups in enumerate(old_weights):
        for group,weight in groups:
            glove.vertex_groups[group].add([i],weight,'REPLACE')
    candidate=RUN/'candidate'
    candidate.mkdir(parents=True,exist_ok=True)
    blend=candidate/'original-guard-grip-local-flip.blend'
    glb=candidate/'original-guard-grip-local-flip.glb'
    bpy.context.preferences.filepaths.save_version=0
    bpy.ops.wm.save_as_mainfile(filepath=str(blend))
    bpy.ops.export_scene.gltf(filepath=str(glb),export_format='GLB',use_selection=False,export_animations=False)
    result['candidate_blend_sha256']=sha(blend)
    result['candidate_glb_sha256']=sha(glb)
    (RUN/'qa/flip-search.json').write_text(json.dumps(result,indent=2)+'\n',encoding='utf8')
    print('FLIP_CANDIDATE',sha(blend),sha(glb),flush=True)


if __name__=='__main__':main()
