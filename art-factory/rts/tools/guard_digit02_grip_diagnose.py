"""Measure an explicitly provisional historical placement against current grip.

No search, socket offset, shrink-to-fit, deformation or runtime publication.
"""
import bpy,hashlib,json,math,sys
import numpy as np
from pathlib import Path
from mathutils import Matrix,Vector
from mathutils.bvhtree import BVHTree
sys.path.insert(0,str(Path(__file__).parent))
from guard_hand_surface_chart import ROOT,RUN as MEASUREMENT
from guard_hand_pair_qa import exact_clearance
from original_guard_grip_fit_math import rigid_fit,transform_points
from grip_gap_math import excess_contact_gap

RUN=ROOT/'art-factory/rts/runs/guard-right-hand-cage/2026-10-08-v8-grip-diagnosis'
GUARD=ROOT/'art-factory/rts/runs/detail-refinement/2026-10-07-v1/raw/guard.blend'
DIGIT=RUN.parent/'2026-10-08-v7-digit02-oriented/candidate/guard-right-digit02-shape.blend'
GUARD_SHA='f18bd5b18ec7d32ed24771a6f50e2835613bf41ca04d65b143cb7401994a77cf'
DIGIT_SHA='f50cf4e7cc98873378122e493e90e2408dc30759518251c0c329bec3c61db883'
POLICY={'source_guard_sha256':GUARD_SHA,'source_digit_sha256':DIGIT_SHA,
    'placement_status':'Historical whole-source placement reproduced only as a diagnostic; not an approved v7-to-current-guard transform',
    'scale':.9,'spin_degrees':90,'translation_policy':'Map immutable source grip origin to measured current handle center; no additional socket offset',
    'contact_zone':'All immutable R_F02_INNER_ACCEPTED faces; no posthoc favorable sample selection',
    'historical_contact_gap_range_m':[.0003,.0008],
    'runtime_publish_allowed':False,'shape_deformation_allowed':False}


def write(name,data):
    path=RUN/name;path.parent.mkdir(parents=True,exist_ok=True);path.write_text(json.dumps(data,indent=2)+'\n',encoding='utf-8')


def main():
    assert hashlib.sha256(GUARD.read_bytes()).hexdigest()==GUARD_SHA
    assert hashlib.sha256(DIGIT.read_bytes()).hexdigest()==DIGIT_SHA
    write('qa/policy.json',POLICY)
    bpy.ops.wm.open_mainfile(filepath=str(GUARD));sword=bpy.data.objects['KingdomSteelSword_LOD0'];sword.data.calc_loop_triangles()
    handle_polys=[p for p in sword.data.polygons if sword.data.materials[p.material_index].name=='WornLeather']
    handle_ids=sorted({i for p in handle_polys for i in p.vertices});poly_ids={p.index for p in handle_polys}
    sword_points=np.asarray([sword.matrix_world@v.co for v in sword.data.vertices],float)
    center=sword_points[handle_ids].mean(axis=0)
    handle_faces=np.asarray([t.vertices[:] for t in sword.data.loop_triangles if t.polygon_index in poly_ids],int)
    handle_triangles=sword_points[handle_faces]
    normals=[];centroids=[]
    for p in handle_polys:
        centroid=np.asarray(sword.matrix_world@p.center,float);normal=np.asarray(sword.matrix_world.to_3x3()@p.normal,float);normal/=np.linalg.norm(normal)
        if normal@(centroid-center)<0:normal=-normal
        normals.append(normal);centroids.append(centroid)
    with bpy.data.libraries.load(str(DIGIT),link=False) as (available,loaded):loaded.objects=['GuardRightDigit02_ShapeMaster']
    digit=loaded.objects[0];bpy.context.collection.objects.link(digit);digit.data.calc_loop_triangles()
    frame_path=MEASUREMENT/'raw/control-chart.json'
    assert hashlib.sha256(frame_path.read_bytes()).hexdigest()=='39fb9d0ce7fa318194212d3ea10290038e6f6cc0fd53e73df6b21d23a48ea578'
    frame=json.loads(frame_path.read_text(encoding='utf-8'));scale=POLICY['scale']
    rotation,translation=rigid_fit(frame['origin'],frame['axis'],center,scale,math.radians(POLICY['spin_degrees']))
    local=np.asarray([digit.matrix_world@v.co for v in digit.data.vertices],float)
    points=transform_points(local,rotation,translation,scale);faces=np.asarray([t.vertices[:] for t in digit.data.loop_triangles],int)
    world=np.eye(4);world[:3,:3]=rotation*scale;world[:3,3]=translation;digit.matrix_world=Matrix(world.tolist())
    zones=json.loads(digit['authoring_zones_json']);attribute=digit.data.attributes['authoring_zone']
    contact_faces=np.asarray([t.vertices[:] for t in digit.data.loop_triangles if attribute.data[t.polygon_index].value==zones['R_F02_INNER_ACCEPTED']],int)
    bvh=BVHTree.FromPolygons([Vector(v) for v in sword_points],handle_faces.tolist(),all_triangles=True)
    samples=[]
    for i,tri in enumerate(contact_faces):
        for bary in ((1,0,0),(0,1,0),(0,0,1),(.5,.5,0),(0,.5,.5),(.5,0,.5),(1/3,1/3,1/3)):
            point=np.asarray(bary)@points[tri];nearest=bvh.find_nearest(Vector(point))
            samples.append({'contact_triangle':i,'barycentric':bary,'position':point.tolist(),'gap_m':nearest[3],'handle_triangle':nearest[2],'handle_witness':list(nearest[0])})
    gap=exact_clearance(points[faces],handle_triangles);core_gap=exact_clearance(points[contact_faces],handle_triangles)
    halfspace=np.max(np.einsum('vpi,pi->vp',points[:,None,:]-np.asarray(centroids)[None,:,:],np.asarray(normals)),axis=1)
    radii=np.linalg.norm((sword_points[handle_ids]-center)[:,:2],axis=1)
    report={'status':'contact_not_established','runtime_publish_allowed':False,'policy':POLICY,
        'transform':{'rotation':rotation.tolist(),'translation':translation.tolist(),'scale':scale,'world_matrix':world.tolist()},
        'handle':{'center_m':center.tolist(),'vertices':len(handle_ids),'polygons':len(handle_polys),'triangles':len(handle_faces),
            'vertex_radius_min_m':float(radii.min()),'vertex_radius_max_m':float(radii.max()),
            'facet_normals':[n.tolist() for n in normals]},
        'digit_triangles':len(faces),'contact_triangles':len(contact_faces),'whole_digit_handle_min_gap_m':gap,
        'immutable_core_handle_min_gap_m':core_gap,'contact_samples':len(samples),
        'contact_gap_min_m':min(s['gap_m'] for s in samples),'contact_gap_max_m':max(s['gap_m'] for s in samples),
        'samples_within_historical_contact_range':sum(.0003<=s['gap_m']<=.0008 for s in samples),
        'digit_vertices_strictly_inside_convex_handle':int(np.sum(halfspace < -1e-9)),
        'minimum_maximum_convex_halfspace_m':float(halfspace.min()),
        'source_core_was_deformed':False,
        'limitations':['Only the explicitly provisional historical scale/spin was measured; no current socket fit approval',
            'Positive exact triangle clearance rules out contact/intersection for this static pair, but does not establish grip',
            'Whole hand, palm, neighboring surfaces, full sword/arm contact and motion remain unverified']}
    if excess_contact_gap(core_gap['distance'],[s['gap_m'] for s in samples],POLICY['historical_contact_gap_range_m'][1]):
        report['status']='historical_placement_has_excess_contact_gap'
    write('raw/contact-samples.json',samples);write('qa/diagnosis.json',report)
    print('DIGIT_GRIP_DIAGNOSIS',json.dumps({k:report[k] for k in ('status','contact_gap_min_m','contact_gap_max_m','samples_within_historical_contact_range','digit_vertices_strictly_inside_convex_handle')}),flush=True)


if __name__=='__main__':main()
