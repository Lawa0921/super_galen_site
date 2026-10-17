"""Read-only actual Blender reimport and actual v35 wrist/cuff diagnostics."""
import sys,json,math
from pathlib import Path
sys.dont_write_bytecode=True
sys.path.insert(0,str(Path(__file__).parent))
import bpy,numpy as np
from mathutils import Vector
from guard_hand_glove_build import ROOT,RUN,WC,CC,R,T,Z,sha,read,write
from guard_hand_anatomy_compare import compare_triangles
from guard_hand_foundation_math import topology,ordered_boundary_loops,exact_clearance
MAIN=Path('C:/Users/bag57/projects/super_galen_site/.claude/worktrees/rts')
sys.path.insert(0,str(MAIN/'art-factory/rts/tools'))
from original_guard_arm_hinge import strict_triangle_crossings

def records(obj):
    mesh=obj.data;mesh.calc_loop_triangles();v=[tuple(obj.matrix_world@x.co) for x in mesh.vertices];tri=[list(t.vertices) for t in mesh.loop_triangles];output=[]
    for t in mesh.loop_triangles:
        points=[(*v[index],0,0,*(obj.matrix_world.to_3x3()@mesh.corner_normals[loop].vector)) for index,loop in zip(t.vertices,t.loops)]
        keys=[tuple(round(x,5) for x in p[:5]) for p in points];shifts=[tuple(keys[k:]+keys[:k]) for k in range(3)];k=min(range(3),key=lambda k:shifts[k]);output.append(((shifts[k],mesh.materials[t.material_index].name),tuple(points[k:]+points[:k])))
    return v,tri,output
def main():
    blend=RUN/'candidate/guard-right-hand-soft-glove-clay.blend';glb=RUN/'candidate/guard-right-hand-soft-glove-clay-lod0.glb'
    before={p.name:sha(p) for p in (blend,glb)};geometry=read(RUN/'qa/geometry.json')
    if geometry['candidate_blend_sha256']!=before[blend.name] or geometry['candidate_glb_sha256']!=before[glb.name]:raise ValueError('Geometry/candidate hash mismatch')
    bpy.ops.wm.open_mainfile(filepath=str(blend));obj=bpy.data.objects['GuardRightSoftGlove_ClayLOD0'];sourcev,sourcef,sourcerecord=records(obj)
    sourcebounds=np.array(sourcev);sourcepivot=list(obj.location);sourcescale=list(obj.scale);sourcecolor=list(obj.data.materials[0].node_tree.nodes.get('Principled BSDF').inputs['Base Color'].default_value)
    bpy.ops.wm.read_factory_settings(use_empty=True);bpy.ops.import_scene.gltf(filepath=str(glb));objects=[o for o in bpy.data.objects if o.type=='MESH']
    if len(objects)!=1:raise ValueError('Candidate contains raw sculpt/guide meshes')
    obj=objects[0];v,f,record=records(obj);comparison=compare_triangles(sourcerecord,record);color=list(obj.data.materials[0].node_tree.nodes.get('Principled BSDF').inputs['Base Color'].default_value)
    boundsdelta=max(abs(np.array(v).min(axis=0)-sourcebounds.min(axis=0)).max(),abs(np.array(v).max(axis=0)-sourcebounds.max(axis=0)).max())
    # Exact positions can be split at normal seams by glTF; weld only for QA.
    lookup={};welded=[];indices=[]
    for p in v:
        key=tuple(round(x,7) for x in p)
        if key not in lookup:lookup[key]=len(welded);welded.append(p)
        indices.append(lookup[key])
    faces=[[indices[i] for i in tri] for tri in f];boundary_error=None
    try:loops=ordered_boundary_loops(faces)
    except ValueError as error:loops=[];boundary_error=str(error)
    clear=exact_clearance(v,f,CC,Z,.022)
    interface=read(RUN/'qa/v35-interface.json');cuff=interface['actual_right_cuff'];cv=np.array(cuff['vertices_m']);cf=np.array(cuff['triangles'])
    cuffpairs=[list(map(int,p)) for p in strict_triangle_crossings(np.array(v)[np.array(f)],cv[cf])]
    seam=read(RUN/'raw/actual-wrist-interface.json');measured=np.array(seam['contour_m']);actual=np.array(geometry['wrist_interface_positions_m'])
    sourcecounter=sorted(tuple(round(x,7) for x in p) for p in measured);actualcounter=sorted(tuple(round(x,7) for x in p) for p in actual)
    zipper=read(RUN/'qa/collar-transport.json');mapped_source=measured[zipper['outer_order']]
    interface_max_delta=float(np.max(np.linalg.norm(mapped_source-actual,axis=1)))
    failures=[]
    if not comparison['pass']:failures.append('Actual directed source/reimport triangle mismatch')
    if boundsdelta>1e-7 or max(abs(a-b) for a,b in zip(sourcecolor,color))>1e-7:failures.append('Bounds/material mismatch')
    if len(loops)!=1:failures.append('Actual imported sole wrist boundary')
    if boundary_error:failures.append('Actual imported welded boundary junction: '+boundary_error)
    if clear['violating_triangles']:failures.append('Imported actual handle penetration')
    report={'status':'reimport_pass' if not failures else 'qa_failed','candidate_blend_sha256':before[blend.name],'candidate_glb_sha256':before[glb.name],
        'actual_Blender_reimport':True,'actual_comparison':comparison,'UV_status':'No UV/texture art in clay package; zero UV columns are correspondence placeholders only, not authored UV claims',
        'mesh_count':len(objects),'bounds_delta_m':float(boundsdelta),'source_pivot_m':sourcepivot,'imported_pivot_m':list(obj.location),'source_scale':sourcescale,'imported_scale':list(obj.scale),
        'material_max_delta':max(abs(a-b) for a,b in zip(sourcecolor,color)),'welded_topology_QA_only_precision7':topology(welded,faces),'wrist_boundary_lengths':list(map(len,loops)),
        'welded_boundary_error_preserved':boundary_error,
        'exact_source_sleeve_ring_counter_equal_precision7':sourcecounter==actualcounter,'source_plane_is_actual_sleeve_triangle_slice':True,
        'source_ring_correspondence':'Direct saved outer_order source indices; no nearest assignment','source_ring_max_position_delta_m':interface_max_delta,
        'source_ring_correspondence_within_1e_7m':interface_max_delta<=1e-7,
        'actual_v35_cuff_strict_triangle_crossings':cuffpairs,'cuff_status':'Crossings are interface-plan failures; no source cuff edits performed' if cuffpairs else 'No actual static clay/cuff triangle crossings',
        'actual_imported_handle_clearance':clear,'geometry_failures_preserved':geometry['failures'],'shape_approval_claim':False,'failures':failures,'runtime_publish_allowed':False}
    write(RUN/'qa/reimport-interface.json',report)
    after={p.name:sha(p) for p in (blend,glb)}
    if before!=after:raise ValueError('QA changed source candidate')
    print(json.dumps({'reimport_pass':not failures,'comparison':comparison,'cuff_strict_crossings':len(cuffpairs),'exact_measured_interface':sourcecounter==actualcounter,'boundaries':list(map(len,loops)),'failures':failures},indent=2))
    if failures:raise ValueError('Actual reimport QA failed; evidence retained')
if __name__=='__main__':main()
