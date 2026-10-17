"""Locked two-finger open-patch inspection; never publishes or closes geometry."""
import bpy,collections,hashlib,json,math,sys
import numpy as np
from pathlib import Path
from mathutils import Vector
from mathutils.bvhtree import BVHTree
sys.path.insert(0,str(Path(__file__).parent))
from guard_hand_surface_chart import ROOT,SOURCE,EXPECTED,RUN as MEASUREMENT,ray_layers
from original_guard_tabard_blender import strict_self
from grip_gap_math import triangle_clearance,mesh_clearance,audit_intervals
from grip_gap_chart import classify_layers,adaptive_cells,assess_coverage

RUN=ROOT/'art-factory/rts/runs/guard-right-hand-cage/2026-10-08-v4-pair'
INPUTS=[
    {'branch':'finger-band-02','run':'2026-10-08-v2','object':'GuardFingerBand02_OpenPatch',
     'candidate_sha256':'5b158783c037851fcb342b07e0d19cc078597dd65a54e0cc44f1444fad93f74e',
     'provenance_sha256':'ed4b9c7820a9115d4cd565b88a36f73a9f163dc16d746c1566820a9d44bdb178',
     'control_policy_sha256':'13580d7fcdb6e7a93d8c4fd141e5c15e09b63c4ac2c14d6987cb55c43ed8523b',
     'selection_sha256':'fbe8e9fcd616f253051958378c8b0fb2053ca5c370d80ebccf46a93791b057fc'},
    {'branch':'finger-band-03','run':'2026-10-08-v3-adjacent','object':'GuardFingerBand03_OpenPatch',
     'candidate_sha256':'793cda35f9b37740792cdd990dc735a73b65cb2eb2c41c89271dd99bc67f7d55',
     'provenance_sha256':'c5923ab541835df74a1cbc2b755d09018f1c62d25076c16070de62157dc279c1',
     'control_policy_sha256':'1e00f658305bd56750c3cff5bb33785618d3331c6e165ec5ecb1b29b56bd237a',
     'selection_sha256':'b1b1dff2616dd9ee0ae993d10eec55794e5c6f34ecb2824e02f08146d0ab64b3'}]
POLICY={'source_sha256':EXPECTED,'inputs':INPUTS,'runtime_publish_allowed':False,
    'frame_sha256':'39fb9d0ce7fa318194212d3ea10290038e6f6cc0fd53e73df6b21d23a48ea578',
    'scope':'Static retained open patches only, not closed fingers or the full anatomical gap',
    'angles_degrees':[67.5,75,82.5,90,97.5],'axis_world_z_m':[.154,.157,.160,.163,.166,.169],
    'maximum_radial_air_intrusion_m':.0005,'endpoint_refinement_tolerance_m':.00025,
    'maximum_refinement_depth':2,'minimum_normal_dot':.05,'minimum_interval_thickness_m':.00025,
    'authored_interior_buffer_degrees':1.,'authored_interior_axial_buffer_m':.00025,
    'contact_tolerance_m':1e-9,'unresolved_cells':'Remain open and unverified; never included in accepted area',
    'clearance_comparison':'Full frozen source-face sets and retained patches have different domains. Their minima are reported separately; subtraction is not an anatomical gap-loss metric.'}
if '--extended-domain' in sys.argv:
    RUN=RUN.with_name('2026-10-08-v5-pair-interiors')
    POLICY={**POLICY,'axis_world_z_m':[.154,.157,.160,.163,.166,.169,.172,.175,.178]}


def write(relative,data):
    path=RUN/relative;path.parent.mkdir(parents=True,exist_ok=True)
    path.write_text(json.dumps(data,indent=2)+'\n',encoding='utf-8')


def components(neighbors):
    unseen=set(neighbors);count=0
    while unseen:
        count+=1;todo=[unseen.pop()]
        while todo:
            for neighbor in neighbors[todo.pop()]:
                if neighbor in unseen:unseen.remove(neighbor);todo.append(neighbor)
    return count


def source_components(ids,triangles):
    neighbors={i:set() for i in ids};edges={}
    for i in ids:
        face=triangles[i]
        for a,b in zip(face,np.roll(face,-1)):
            key=tuple(sorted((int(a),int(b))))
            for j in edges.get(key,[]):neighbors[i].add(j);neighbors[j].add(i)
            edges.setdefault(key,[]).append(i)
    return components(neighbors)


def exact_clearance(a,b):
    """Seed the conservative exact search with a close, valid triangle pair."""
    verts=[Vector(v) for tri in b for v in tri]
    bvh=BVHTree.FromPolygons(verts,[(i*3,i*3+1,i*3+2) for i in range(len(b))],all_triangles=True)
    witnesses=[(bvh.find_nearest(Vector(tri.mean(axis=0))),i) for i,tri in enumerate(a)]
    hit,i=min(witnesses,key=lambda row:row[0][3])
    return mesh_clearance(a,b,(i,hit[2]))


def main():
    assert hashlib.sha256(SOURCE.read_bytes()).hexdigest()==EXPECTED
    write('qa/policy.json',POLICY)
    bpy.ops.wm.open_mainfile(filepath=str(SOURCE));source=bpy.data.objects['OriginalGripChannelCandidate']
    source.data.calc_loop_triangles();source_vertices=[source.matrix_world@v.co for v in source.data.vertices]
    source_faces=np.asarray([t.vertices[:] for t in source.data.loop_triangles],int)
    source_bvh=BVHTree.FromPolygons(source_vertices,source_faces.tolist(),all_triangles=True)
    source_points=np.asarray(source_vertices,float)
    frame_path=MEASUREMENT/'raw/control-chart.json'
    assert hashlib.sha256(frame_path.read_bytes()).hexdigest()==POLICY['frame_sha256']
    frame=json.loads(frame_path.read_text(encoding='utf-8'))
    origin,axis,across,around=(Vector(frame[k]) for k in ('origin','axis','across','around'))
    owners={};patches=[];all_vertices=[];all_faces=[];all_info=[];named=[];unclassified=[];boundary_neighbors={};mesh_neighbors={};policies={}
    for spec in INPUTS:
        branch=spec['branch'];run=RUN.parent/spec['run'];candidate=run/'candidate'/f'{branch}-control-cage.blend'
        selection=run/'raw/source-face-ownership.json'
        assert hashlib.sha256(candidate.read_bytes()).hexdigest()==spec['candidate_sha256']
        assert hashlib.sha256(selection.read_bytes()).hexdigest()==spec['selection_sha256']
        owners[branch]={side:set(ids) for side,ids in json.loads(selection.read_text(encoding='utf-8'))['faces'].items()}
        provenance_path=run/'raw/owned-cage-provenance.json';control_policy_path=run/'qa/control-cage-policy.json'
        assert hashlib.sha256(provenance_path.read_bytes()).hexdigest()==spec['provenance_sha256']
        assert hashlib.sha256(control_policy_path.read_bytes()).hexdigest()==spec['control_policy_sha256']
        provenance_record=json.loads(provenance_path.read_text(encoding='utf-8'))
        assert provenance_record['selection_sha256']==spec['selection_sha256']
        provenance=provenance_record['cage']
        policies[branch]=json.loads(control_policy_path.read_text(encoding='utf-8'))
        with bpy.data.libraries.load(str(candidate),link=False) as (available,loaded):loaded.objects=[spec['object']]
        obj=loaded.objects[0];bpy.context.collection.objects.link(obj);obj.data.calc_loop_triangles()
        assert [list(p.vertices) for p in obj.data.polygons]==provenance['quads']
        assert all(p['branch']==branch for p in provenance['face_sources'])
        vertices=[obj.matrix_world@v.co for v in obj.data.vertices]
        expected_vertices=[origin+across*p[0]+around*p[1]+axis*p[2] for p in provenance['vertices']]
        assert len(vertices)==len(expected_vertices)
        assert max((a-b).length for a,b in zip(vertices,expected_vertices))<=1e-7
        assert len(provenance['face_sources'])==len(obj.data.polygons)
        faces=np.asarray([t.vertices[:] for t in obj.data.loop_triangles],int)
        info=[{**provenance['face_sources'][t.polygon_index],'branch':branch} for t in obj.data.loop_triangles]
        offset=len(all_vertices);all_vertices.extend(vertices);all_faces.extend((faces+offset).tolist());all_info.extend(info)
        patches.append({'branch':branch,'object':obj,'vertices':np.asarray(vertices,float),'faces':faces,'triangle_start':len(all_info)-len(info)})
        incidence=collections.Counter(tuple(sorted((int(a),int(b)))) for poly in obj.data.polygons for a,b in zip(poly.vertices[:],poly.vertices[1:]+poly.vertices[:1]))
        for i in range(len(vertices)):mesh_neighbors[offset+i]=set()
        for (a,b),count in incidence.items():
            mesh_neighbors[a+offset].add(b+offset);mesh_neighbors[b+offset].add(a+offset)
            if count!=1:continue
            boundary_neighbors.setdefault(a+offset,set()).add(b+offset);boundary_neighbors.setdefault(b+offset,set()).add(a+offset)
            groups_a={g.group for g in obj.data.vertices[a].groups if g.weight>.5};groups_b={g.group for g in obj.data.vertices[b].groups if g.weight>.5}
            labels=[obj.vertex_groups[g].name for g in sorted(groups_a&groups_b)]
            if len(labels)==1:named.append({'branch':branch,'boundary':labels[0],'vertices':[a+offset,b+offset]})
            else:unclassified.append({'branch':branch,'vertices':[a+offset,b+offset],'labels':labels})
    flat_owners=[(branch,side,ids) for branch,sides in owners.items() for side,ids in sides.items()]
    intersections=[{'first':[a,s],'second':[b,t],'count':len(i&j)} for k,(a,s,i) in enumerate(flat_owners) for b,t,j in flat_owners[k+1:]]
    ownership_components={branch:{side:source_components(ids,source_faces) for side,ids in sides.items()} for branch,sides in owners.items()}
    faces=np.asarray(all_faces,int);points=np.asarray(all_vertices,float);bvh=BVHTree.FromPolygons(all_vertices,all_faces,all_triangles=True)
    crossings=strict_self(points,faces);contacts=[]
    for a,b in sorted(set(tuple(sorted(pair)) for pair in bvh.overlap(bvh))):
        if a==b or set(faces[a])&set(faces[b]):continue
        result=triangle_clearance(points[faces[a]],points[faces[b]])
        if result['distance']<=POLICY['contact_tolerance_m']:contacts.append({'triangles':[a,b],**result})
    cage_clearance=exact_clearance(*(p['vertices'][p['faces']] for p in patches))
    source_ids=[sorted(set.union(*owners[p['branch']].values())) for p in patches]
    source_clearance=exact_clearance(*(source_points[source_faces[ids]] for ids in source_ids))
    source_clearance['source_face_witness']=[source_ids[k][i] for k,i in enumerate(source_clearance['triangle_pair'])]
    write('qa/geometry.json',{'inputs':INPUTS,'source_sha256':EXPECTED,'vertices':len(points),'triangles':len(faces),
        'mesh_components':components(mesh_neighbors),'boundary_loops':components(boundary_neighbors),
        'boundary_degree_errors':[i for i,n in boundary_neighbors.items() if len(n)!=2],
        'named_boundary_edges':named,'unclassified_boundary_edges':unclassified,'source_ownership_intersections':intersections,
        'source_ownership_components':ownership_components,'strict_crossings':crossings,'inclusive_nonincident_contacts':contacts,
        'retained_patch_min_clearance_m':cage_clearance,'full_owned_source_min_clearance_m':source_clearance,
        'clearance_comparison':POLICY['clearance_comparison'],'runtime_publish_allowed':False})
    print('PAIR_GEOMETRY',json.dumps({'cage_min_m':cage_clearance['distance'],'owned_source_min_m':source_clearance['distance'],'contacts':len(contacts)}),flush=True)
    records={}
    def trace(theta,z):
        key=(round(theta,12),round(z,12))
        if key in records:return records[key]
        direction=across*math.cos(math.radians(theta))+around*math.sin(math.radians(theta));point=origin+axis*((z-origin.z)/axis.z)
        source_hits=ray_layers(source_bvh,point,direction,frame['radial_bound']);cage_hits=ray_layers(bvh,point,direction,frame['radial_bound'])
        for h in source_hits:h['ownership']=[[branch,side] for branch,side,ids in flat_owners if h['face'] in ids]
        for h in cage_hits:h.update({k:all_info[h['face']][k] for k in ('branch','surface')})
        source_layers=classify_layers(source_hits,owners=owners);cage_layers=classify_layers(cage_hits)
        required=[]
        for branch,p in policies.items():
            zs=p['z_controls_m'];end=float(np.interp(z,zs,p['angular_end_controls_degrees']))
            buffer=POLICY['authored_interior_buffer_degrees']
            if zs[0]+POLICY['authored_interior_axial_buffer_m']<z<zs[-1]-POLICY['authored_interior_axial_buffer_m'] and p['angular_start_degrees']+buffer<theta<end-buffer:required.append(branch)
        complete=source_layers['complete'] and cage_layers['complete']
        audit=audit_intervals(source_layers['intervals'],cage_layers['intervals'],POLICY['maximum_radial_air_intrusion_m'],required_branches=required) if complete else {'passed':False,'failures':[{'reason':'unverified_layer_pairing'}],'max_air_intrusion':None}
        signature=[[i['branch'] for i in layer['intervals']] for layer in (source_layers,cage_layers)]
        endpoints=[list(point+direction*i[bound]) for layer in (source_layers,cage_layers) for i in layer['intervals'] for bound in ('lo','hi')]
        record={'angle_degrees':theta,'axis_world_z_m':z,'source_hits':source_hits,'cage_hits':cage_hits,
            'source':source_layers,'cage':cage_layers,'required_branches':required,'complete':complete,
            'passed':audit['passed'],'audit':audit,'signature':signature,'endpoints':endpoints}
        records[key]=record;return record
    chart=adaptive_cells(trace,POLICY['angles_degrees'],POLICY['axis_world_z_m'],max_depth=POLICY['maximum_refinement_depth'],tolerance=POLICY['endpoint_refinement_tolerance_m'])
    complete=[r for r in records.values() if r['complete']];violations=[r for r in records.values() if (r['complete'] or r['required_branches']) and not r['passed']]
    geometry_passed=not crossings and not contacts and not unclassified and components(mesh_neighbors)==4 and components(boundary_neighbors)==4 and all(len(n)==2 for n in boundary_neighbors.values()) and all(i['count']==0 for i in intersections) and all(n==1 for sides in ownership_components.values() for n in sides.values())
    coverage=assess_coverage(chart['accepted'],[spec['branch'] for spec in INPUTS])
    status='qa_failed' if not geometry_passed or violations else 'sampled_local_qa_passed_with_unresolved_boundaries' if coverage['passed'] else 'qa_incomplete_branch_coverage'
    summary={'status':status,'coverage':coverage,
        'geometry_passed':geometry_passed,'runtime_publish_allowed':False,'whole_hand_expansion_allowed':False,
        'source_sha256':EXPECTED,'inputs':INPUTS,'policy_sha256':hashlib.sha256((RUN/'qa/policy.json').read_bytes()).hexdigest(),
        'ray_samples':len(records),'complete_paired_samples':len(complete),'violating_samples':len(violations),
        'maximum_measured_radial_air_intrusion_m':max((r['audit']['max_air_intrusion'] for r in complete),default=None),
        'accepted_sampled_cells':len(chart['accepted']),'unresolved_cells':len(chart['unresolved']),
        'limitations':['Sampled static domain only; unresolved transition cells remain unverified',
            'Open control patches omit fingertips and intervening source surfaces; wider retained-patch clearance is not full anatomical gap preservation',
            'No whole-hand topology, anatomy, wrist, UV/material, rig, animation, runtime or commercial acceptance']}
    write('raw/radial-truth.json',{'policy':POLICY,'rays':list(records.values())});write('qa/adaptive-cells.json',chart)
    write('qa/violations.json',violations);write('qa/pair-summary.json',summary)
    print('PAIR_CHART',json.dumps(summary),flush=True)


if __name__=='__main__':main()
