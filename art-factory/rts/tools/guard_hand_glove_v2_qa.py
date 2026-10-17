"""Actual GLB roundtrip, sleeve/cuff witness, contact and rejection propagation."""
import sys,json
from pathlib import Path
sys.dont_write_bytecode=True;sys.path.insert(0,str(Path(__file__).parent))
import bpy,numpy as np
from guard_hand_glove_v2_build import ROOT,RUN,MAIN,WC,CC,Z,sha,read,write,meshdata
from guard_hand_anatomy_compare import compare_triangles
from guard_hand_glove_v2_geometry import directed_boundary_loops
from guard_hand_foundation_math import topology,exact_clearance
sys.path.insert(0,str(MAIN/'art-factory/rts/tools'))
from original_guard_arm_hinge import strict_triangle_crossings
from guard_armor_self_qa import inspect
def records(obj):
    mesh=obj.data;mesh.calc_loop_triangles();v=[tuple(obj.matrix_world@x.co) for x in mesh.vertices];tri=[list(t.vertices) for t in mesh.loop_triangles];output=[]
    for t in mesh.loop_triangles:
        points=[(*v[index],0,0,*(obj.matrix_world.to_3x3()@mesh.corner_normals[loop].vector)) for index,loop in zip(t.vertices,t.loops)]
        keys=[tuple(round(x,6) for x in p[:5]) for p in points];shifts=[tuple(keys[k:]+keys[:k]) for k in range(3)];k=min(range(3),key=lambda k:shifts[k]);output.append(((shifts[k],mesh.materials[t.material_index].name),tuple(points[k:]+points[:k])))
    return v,tri,output
def main():
    blend=RUN/'candidate/guard-right-hand-soft-glove-clay.blend';glb=RUN/'candidate/guard-right-hand-soft-glove-clay-lod0.glb';before=[sha(blend),sha(glb)];geometry=read(RUN/'qa/geometry.json')
    assert before==[geometry['candidate_blend_sha256'],geometry['candidate_glb_sha256']]
    bpy.ops.wm.open_mainfile(filepath=str(blend));obj=bpy.data.objects['GuardRightSoftGlove_ClayLOD0'];sv,sf,sr=records(obj);sb=np.array(sv);sourcepivot=list(obj.location);sourcescale=list(obj.scale)
    bpy.ops.wm.read_factory_settings(use_empty=True);bpy.ops.import_scene.gltf(filepath=str(glb));objects=[o for o in bpy.data.objects if o.type=='MESH'];assert len(objects)==1
    obj=objects[0];v,f,record=records(obj);comparison=compare_triangles(sr,record);lookup={};welded=[];indices=[]
    for p in v:
        key=tuple(round(x,7) for x in p)
        if key not in lookup:lookup[key]=len(welded);welded.append(p)
        indices.append(lookup[key])
    faces=[[indices[i] for i in tri] for tri in f];loops=directed_boundary_loops(faces);topo=topology(welded,faces);selfqa=inspect(np.array(welded),np.array(faces));gap=exact_clearance(v,f,CC,Z,.022)
    interface=read(RUN/'qa/v35-interface.json');cuff=interface['actual_right_cuff'];cv=np.array(cuff['vertices_m']);cf=np.array(cuff['triangles']);pairs=[list(map(int,p)) for p in strict_triangle_crossings(np.array(v)[np.array(f)],cv[cf])]
    transport=read(RUN/'qa/collar-transport.json');measured=np.array(read(RUN/'raw/actual-wrist-interface.json')['contour_m'])[transport['outer_order']];actual=np.array(geometry['wrist_interface_positions_m']);ringdelta=float(np.max(np.linalg.norm(measured-actual,axis=1)))
    boundsdelta=float(max(abs(np.array(v).min(axis=0)-sb.min(axis=0)).max(),abs(np.array(v).max(axis=0)-sb.max(axis=0)).max()))
    failures=[]
    if not comparison['pass']:failures.append('Actual directed triangle/material correspondence')
    if any(topo[k] for k in ('nonmanifold_edges','winding_edges','degenerate_triangles')):failures.append('Imported exterior topology')
    if any(selfqa.values()):failures.append('Imported triangle self contact')
    if gap['violating_triangles']:failures.append('Imported true handle penetration')
    if len(loops)!=1 or len(loops[0])!=len(measured):failures.append('Imported unique true wrist boundary')
    if boundsdelta>1e-7 or ringdelta>1e-7:failures.append('Actual scale/pivot/source ring correspondence')
    if pairs:failures.append('Actual static true v35 cuff intersection')
    report={'status':'critical_qa_failed' if failures else 'mechanical_pass_shape_pending','actual_Blender_reimport':True,'candidate_blend_sha256':before[0],'candidate_glb_sha256':before[1],'source_triangle_count':len(sf),'imported_triangle_count':len(f),'actual_comparison':comparison,'welded_topology_QA_only_precision7':topo,'self_contacts':selfqa,'boundary_loop_lengths':list(map(len,loops)),'actual_imported_handle_clearance':gap,'actual_v35_cuff_strict_triangle_crossings':pairs,'source_ring_max_position_delta_m':ringdelta,'source_ring_matching':'Explicit same-count ordered source IDs, not nearest fitting','bounds_delta_m':boundsdelta,'source_pivot_m':sourcepivot,'imported_pivot_m':list(obj.location),'source_scale':sourcescale,'imported_scale':list(obj.scale),'UV_status':'Clay has no authored UV or textures; zero record UV only correspondence placeholder','failures':failures,'runtime_publish_allowed':False,'shape_approved':False}
    # Exact failing pair witnesses remain actionable even when the interface
    # is under armor; overlap is not silently waived as an artistic choice.
    report['cuff_pair_witnesses']=[{'hand_triangle_id':a,'cuff_triangle_id':b,'hand_world_m':np.array(v)[np.array(f[a])].tolist(),'cuff_world_m':cv[cf[b]].tolist()} for a,b in pairs]
    write(RUN/'qa/reimport-interface.json',report);assert before==[sha(blend),sha(glb)]
    print(json.dumps({'triangle_count':[len(sf),len(f)],'correspondence':comparison,'import_topology':topo,'self_counts':{k:len(x) for k,x in selfqa.items()},'actual_cuff_crossings':len(pairs),'ring_max_delta_m':ringdelta,'min_handle_gap_mm':gap['min_clearance_m']*1000,'failures':failures},indent=2),flush=True)
    if failures:raise ValueError('Actual interface QA failed; evidence retained')
if __name__=='__main__':main()
