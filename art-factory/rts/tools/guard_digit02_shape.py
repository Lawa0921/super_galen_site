"""Original complete digit shape authoring around an immutable accepted core.

This is an editable shape candidate, not a production hand or a source snap.
All new side, tip and root faces are explicitly authored, not source-owned faces.
"""
import bpy,bmesh,hashlib,json,math,sys
import numpy as np
from pathlib import Path
from mathutils import Vector
from mathutils.bvhtree import BVHTree
sys.path.insert(0,str(Path(__file__).parent))
from guard_hand_pair_qa import ROOT,INPUTS,MEASUREMENT,SOURCE,EXPECTED,exact_clearance
from original_guard_tabard_blender import strict_self
from grip_gap_math import triangle_clearance

RUN=ROOT/'art-factory/rts/runs/guard-right-hand-cage/2026-10-08-v6-digit02-shape'
SPEC={'status':'authored_shape_candidate_not_runtime','part':'R_F02','triangle_budget':650,
    'source_sha256':EXPECTED,'core':INPUTS[0],'adjacent_context':INPUTS[1],
    'coordinate_system':'Original source grip-axis frame in metres; actual-character socket fitting remains pending',
    'anatomical_assignment':'Working ring-finger assignment from four-finger order and thumb location in whole-source view; independent anatomy review pending',
    'orientation':'Decreasing polar angle extends toward the fingertip (+X); increasing angle extends toward the palm (-X). +axis is toward thumb/index; confirm in whole-hand assembly.',
    'authored_side_bulge_m':.0025,
    'tip_rings':[{'angle_degrees':48,'radial_scale':.82,'axial_scale':.76},{'angle_degrees':30,'radial_scale':.35,'axial_scale':.30}],
    'tip_end_angle_degrees':24,
    'root_rings':[{'angle_degrees':125,'radial_scale':1.10,'axial_scale':1.10},{'angle_degrees':160,'radial_scale':1.18,'axial_scale':1.18}],
    'palm_interface':'R_F02_PALM_IFACE','runtime_publish_allowed':False,
    'pending':['Independent anatomy and silhouette review','Actual 12-sided 22 mm grip fit/contact','Full neighboring finger surfaces and palm attachment','Material, rig and all full-character gates']}
CORRECTED='--corrected-orientation' in sys.argv
if CORRECTED:
    RUN=RUN.with_name('2026-10-08-v7-digit02-oriented')
    SPEC={**SPEC,'orientation':'Source section confirms decreasing theta from 67.5 degrees continues to the root; increasing theta ends at the fingertip near 105-108 degrees. Never bridge the empty 110-140 degree palm-side sector.',
        'tip_rings':[{'angle_degrees':101,'radial_scale':.90,'axial_scale':.85},{'angle_degrees':106,'radial_scale':.65,'axial_scale':.65}],
        'tip_end_angle_degrees':106,'tip_closure':'Broad planar quad-strip cap with rounded surrounding rings; no collapsed apex',
        'root_rings':[{'angle_degrees':45,'target_outer_m':.04242,'axial_scale':1.02},
            {'angle_degrees':15,'target_outer_m':.04376,'axial_scale':1.08},
            {'angle_degrees':-15,'target_outer_m':.04892,'axial_scale':1.12},
            {'angle_degrees':-30,'target_outer_m':.05345,'axial_scale':1.15}],
        'root_shape_reference':'Interpolated source mid-row radial profile, authored cross-section proportions; not a whole-surface source projection',
        'rejected_predecessor_sha256':'ebc252bea233032719b4e03ee6509ea75bd262e1775ef8a808ffdcc633776ee7'}


def write(name,data):
    path=RUN/name;path.parent.mkdir(parents=True,exist_ok=True);path.write_text(json.dumps(data,indent=2)+'\n',encoding='utf-8')


def main():
    write('raw/authoring-spec.json',SPEC)
    spec=INPUTS[0];upstream=RUN.parent/spec['run'];candidate=upstream/'candidate'/f'{spec["branch"]}-control-cage.blend'
    assert hashlib.sha256(candidate.read_bytes()).hexdigest()==spec['candidate_sha256']
    provenance_path=upstream/'raw/owned-cage-provenance.json'
    assert hashlib.sha256(provenance_path.read_bytes()).hexdigest()==spec['provenance_sha256']
    provenance=json.loads(provenance_path.read_text(encoding='utf-8'))['cage']
    frame_path=MEASUREMENT/'raw/control-chart.json'
    assert hashlib.sha256(frame_path.read_bytes()).hexdigest()=='39fb9d0ce7fa318194212d3ea10290038e6f6cc0fd53e73df6b21d23a48ea578'
    frame=json.loads(frame_path.read_text(encoding='utf-8'));origin,axis,across,around=(Vector(frame[k]) for k in ('origin','axis','across','around'))
    bpy.ops.wm.open_mainfile(filepath=str(candidate));core=bpy.data.objects[spec['object']]
    if CORRECTED:
        from guard_hand_surface_chart import ray_layers
        source=bpy.data.objects['OriginalGripChannelCandidate'];source.data.calc_loop_triangles()
        source_bvh=BVHTree.FromPolygons([source.matrix_world@v.co for v in source.data.vertices],[list(t.vertices) for t in source.data.loop_triangles],all_triangles=True)
        point=origin+axis*((.145-origin.z)/axis.z);witnesses=[]
        for angle in (-30,0,30,60,90,100,110,120,140):
            theta=math.radians(angle);direction=across*math.cos(theta)+around*math.sin(theta)
            hits=ray_layers(source_bvh,point,direction,frame['radial_bound'])
            witnesses.append({'angle_degrees':angle,'ray_hits':hits})
        write('raw/orientation-witnesses.json',{'coordinate_system':'Source world metres, grip-axis radial frame','axis_point':list(point),'source_sha256':EXPECTED,'immutable_container_sha256':spec['candidate_sha256'],'rays':witnesses})
    vertices=[core.matrix_world@v.co for v in core.data.vertices];accepted=[v.copy() for v in vertices]
    faces=[list(p.vertices) for p in core.data.polygons];zones=['R_F02_'+p['surface'].upper()+'_ACCEPTED' for p in provenance['face_sources']]
    indices={tuple(key):i for i,key in enumerate(provenance['grid_keys'])}
    def add(point):vertices.append(Vector(point));return len(vertices)-1
    def face(ids,zone):faces.append(ids);zones.append(zone)
    def connect(first,second,zone,segments=None):
        for j in range(len(first)) if segments is None else segments:
            k=(j+1)%len(first);face([first[j],second[j],second[k],first[k]],zone)
    rings=[]
    for column in range(6):
        high=(vertices[indices[column,9,0]]+vertices[indices[column,9,1]])/2+axis*SPEC['authored_side_bulge_m']
        low=(vertices[indices[column,0,0]]+vertices[indices[column,0,1]])/2-axis*SPEC['authored_side_bulge_m']
        ring=[indices[column,z,1] for z in range(10)]+[add(high)]+[indices[column,z,0] for z in range(9,-1,-1)]+[add(low)]
        rings.append(ring)
    for first,second in zip(rings,rings[1:]):
        connect(first,second,'R_F02_RADIAL_SIDE',[9,10]);connect(first,second,'R_F02_ULNAR_SIDE',[20,21])
    def section(base,control,root=False):
        radial=[];axial=[]
        for i in base:
            delta=vertices[i]-origin;t=delta.dot(axis);axial.append(t);radial.append((delta-axis*t).length)
        center_t=(min(axial)+max(axial))/2;center_r=(min(radial)+max(radial))/2
        theta=math.radians(control['angle_degrees']);direction=across*math.cos(theta)+around*math.sin(theta)
        result=[]
        for radius,t in zip(radial,axial):
            scale=(control['target_outer_m']-min(radial))/(max(radial)-min(radial)) if 'target_outer_m' in control else control['radial_scale']
            r=min(radial)+(radius-min(radial))*scale if root else center_r+(radius-center_r)*scale
            height=center_t+(t-center_t)*control['axial_scale']
            result.append(add(origin+axis*height+direction*r))
        return result,center_r,center_t
    tip_base=rings[-1] if CORRECTED else rings[0];previous=tip_base
    for control in SPEC['tip_rings']:
        ring,center_r,center_t=section(tip_base,control)
        connect(previous,ring,'R_F02_TIP_ZONE') if CORRECTED else connect(ring,previous,'R_F02_TIP_ZONE')
        previous=ring
    if CORRECTED:
        for j in range(9):face([previous[j],previous[20-j],previous[19-j],previous[j+1]],'R_F02_TIP_END')
        face([previous[9],previous[11],previous[10]],'R_F02_TIP_END')
        face([previous[20],previous[0],previous[21]],'R_F02_TIP_END')
    else:
        theta=math.radians(SPEC['tip_end_angle_degrees']);tip=add(origin+axis*center_t+(across*math.cos(theta)+around*math.sin(theta))*center_r)
        for j in range(len(previous)):face([tip,previous[j],previous[(j+1)%len(previous)]],'R_F02_TIP_END')
    root_base=rings[0] if CORRECTED else rings[-1];previous=root_base
    for control in SPEC['root_rings']:
        ring,_,_=section(root_base,control,root=True)
        connect(ring,previous,'R_F02_ROOT_AND_KNUCKLE') if CORRECTED else connect(previous,ring,'R_F02_ROOT_AND_KNUCKLE')
        previous=ring
    palm=previous
    mesh=bpy.data.meshes.new('Original digit02 authored topology');mesh.from_pydata(vertices,[],faces);mesh.update();mesh.calc_loop_triangles()
    obj=bpy.data.objects.new('GuardRightDigit02_ShapeMaster',mesh);bpy.context.collection.objects.link(obj)
    obj['runtime_publish_allowed']=False;obj['source_core_sha256']=spec['candidate_sha256'];obj['shape_review_pending']=True
    zone_ids={name:i for i,name in enumerate(sorted(set(zones)))}
    attribute=mesh.attributes.new('authoring_zone','INT','FACE')
    for datum,zone in zip(attribute.data,zones):datum.value=zone_ids[zone]
    obj['authoring_zones_json']=json.dumps(zone_ids)
    for zone in zone_ids:
        ids=sorted({i for ids,label in zip(faces,zones) if label==zone for i in ids});obj.vertex_groups.new(name=zone).add(ids,1,'REPLACE')
    obj.vertex_groups.new(name=SPEC['palm_interface']).add(palm,1,'REPLACE')
    obj.vertex_groups.new(name='R_F02_ACCEPTED_CORE').add(list(range(len(accepted))),1,'REPLACE')
    for other in bpy.data.objects:other.hide_render=other!=obj
    core.hide_set(True)
    bm=bmesh.new();bm.from_mesh(mesh);boundary=[e for e in bm.edges if e.is_boundary]
    boundary_ids={v.index for e in boundary for v in e.verts};neighbors={v.index:{n.index for e in v.link_edges for n in e.verts if n!=v} for v in bm.verts}
    from guard_hand_pair_qa import components
    triangles=np.asarray([t.vertices[:] for t in mesh.loop_triangles],int);points=np.asarray(vertices,float)
    crossings=strict_self(points,triangles);bvh=BVHTree.FromPolygons(vertices,triangles.tolist(),all_triangles=True);contacts=[]
    for a,b in sorted(set(tuple(sorted(pair)) for pair in bvh.overlap(bvh))):
        if a==b or set(triangles[a])&set(triangles[b]):continue
        result=triangle_clearance(points[triangles[a]],points[triangles[b]])
        if result['distance']<=1e-9:contacts.append({'triangles':[a,b],**result})
    report={'status':'shape_candidate_pending_review','runtime_publish_allowed':False,'vertices':len(vertices),'triangles':len(triangles),
        'mesh_components':components(neighbors),'boundary_edges':len(boundary),'boundary_vertex_ids':sorted(boundary_ids),
        'only_named_palm_boundary':boundary_ids==set(palm) and len(boundary)==len(palm),
        'boundary_degree_errors':[v.index for v in bm.verts if v.index in boundary_ids and sum(e.is_boundary for e in v.link_edges)!=2],
        'nonmanifold_interior_edges':sum(not e.is_manifold and not e.is_boundary for e in bm.edges),
        'inconsistent_winding_edges':sum(e.is_manifold and not e.is_contiguous for e in bm.edges),
        'zero_area_triangles':sum(t.area<1e-12 for t in mesh.loop_triangles),
        'strict_crossings':crossings,'inclusive_nonincident_contacts':contacts,
        'accepted_core_vertices':len(accepted),'accepted_core_max_movement_m':max((vertices[i]-v).length for i,v in enumerate(accepted)),
        'zone_face_counts':dict(__import__('collections').Counter(zones)),'pending':SPEC['pending']}
    bm.free()
    report['topology_passed']=report['mesh_components']==1 and report['only_named_palm_boundary'] and not any(report[k] for k in ('boundary_degree_errors','nonmanifold_interior_edges','inconsistent_winding_edges','zero_area_triangles','strict_crossings','inclusive_nonincident_contacts')) and len(triangles)<=SPEC['triangle_budget']
    if not report['topology_passed']:report['status']='qa_failed'
    write('raw/face-provenance.json',{'faces':faces,'zones':zones,'accepted_core_vertices':list(range(len(accepted))),'palm_interface':palm,'core':spec})
    (RUN/'candidate').mkdir(exist_ok=True);path=RUN/'candidate/guard-right-digit02-shape.blend';bpy.ops.wm.save_as_mainfile(filepath=str(path))
    report['candidate_sha256']=hashlib.sha256(path.read_bytes()).hexdigest();write('qa/shape.json',report)
    print('DIGIT_SHAPE',json.dumps(report),flush=True)


if __name__=='__main__':main()
