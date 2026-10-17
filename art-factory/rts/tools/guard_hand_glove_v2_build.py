"""Local authored cleanup of the frozen artistic glove foundation, no body remesh."""
import sys,json,math,hashlib
from pathlib import Path
sys.dont_write_bytecode=True
sys.path.insert(0,str(Path(__file__).parent))
import bpy,bmesh,numpy as np
from mathutils import Vector,Matrix
from guard_hand_glove_v2_geometry import directed_boundary_loops,equal_ring_bridge,patch_offset,proximal_cuff_release
from guard_hand_foundation_math import topology,exact_clearance,capped_signed_volume,edge_uses
ROOT=Path(__file__).resolve().parents[3]
RUN=ROOT/'art-factory/rts/runs/guard-hand-glove/2026-10-09-v2'
MAIN=Path('C:/Users/bag57/projects/super_galen_site/.claude/worktrees/rts')
WC=Vector((.4293556809425354,0,.8472006916999817));CC=Vector((.48789501190185547,-.008239989168941975,.8149818778038025))
R=Vector((WC.x-CC.x,WC.y-CC.y,0)).normalized();T=Vector((0,0,1)).cross(R);Z=Vector((0,0,1));BASIS=Matrix((R,T,Z)).transposed()
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def read(p):return json.loads(p.read_text(encoding='utf8'))
def write(p,x):p.write_text(json.dumps(x,indent=2,ensure_ascii=False)+'\n',encoding='utf8')
def meshdata(obj):
    obj.data.calc_loop_triangles();return [list(obj.matrix_world@p.co) for p in obj.data.vertices],[list(t.vertices) for t in obj.data.loop_triangles]
def local(p):return BASIS.transposed()@(Vector(p)-CC)
def world(p):return CC+BASIS@Vector(p)
def stage(obj,name):
    v,f=meshdata(obj);topo=topology(v,f)
    sys.path.insert(0,str(MAIN/'art-factory/rts/tools'));from guard_armor_self_qa import inspect
    selfqa=inspect(np.array(v),np.array(f));gap=exact_clearance(v,f,CC,Z,.022)
    adjacency={i:set() for i in range(len(v))}
    for face in f:
        for i in face:adjacency[i].update(face)
    pending=[0];seen=set()
    while pending:
        i=pending.pop()
        if i not in seen:seen.add(i);pending.extend(adjacency[i]-seen)
    report={'stage':name,'topology':topo,'self_contacts':selfqa,'self_tolerance_m':1e-7,'whole_triangle_handle_clearance':gap,'connected_vertices':len(seen),'vertex_count':len(v),'scale':list(obj.scale),'origin_m':list(obj.location),'failure_claims_not_suppressed':True}
    write(RUN/'qa/stages'/(name+'.json'),report)
    bpy.ops.wm.save_as_mainfile(filepath=str(RUN/'qa/stages'/(name+'.blend')))
    print(json.dumps({'stage':name,'topology':topo,'self_counts':{k:len(x) for k,x in selfqa.items()},'min_gap_mm':gap['min_clearance_m']*1000,'penetrating':gap['violating_triangles']},indent=2),flush=True)
    return report
def material(name,color):
    m=bpy.data.materials.new(name);m.diffuse_color=(*color,1);m.use_nodes=True;p=m.node_tree.nodes.get('Principled BSDF');p.inputs['Base Color'].default_value=(*color,1);p.inputs['Roughness'].default_value=.76;return m
def render(obj):
    bpy.ops.mesh.primitive_cylinder_add(vertices=96,radius=.022,depth=.195,location=CC);guide=bpy.context.object;guide.name='QA ONLY actual 22mm radius 195mm handle';guide.data.materials.append(material('QA true handle',(.10,.13,.16)))
    scene=bpy.context.scene;scene.render.engine='BLENDER_EEVEE';scene.render.resolution_x=scene.render.resolution_y=1000;scene.render.resolution_percentage=100;scene.render.image_settings.file_format='PNG';scene.world=bpy.data.worlds.new('Soft glove QA world');scene.world.color=(.045,.045,.045);scene.view_settings.look='AgX - Medium High Contrast';scene.view_settings.exposure=-1
    target=CC+R*.012+Z*.002
    for delta,power in (((.5,.7,.7),25),((-.4,.4,.4),15),((.2,-.6,.6),20)):
        data=bpy.data.lights.new('Soft glove QA softbox','AREA');data.energy=power;data.size=.5;o=bpy.data.objects.new(data.name,data);bpy.context.collection.objects.link(o);o.location=target+Vector(delta);o.rotation_euler=(target-o.location).to_track_quat('-Z','Y').to_euler()
    views={'fullhand-palm':(target-R*.4-T*.6+Z*.14,target,False),'fullhand-back':(target+R*.4+T*.6+Z*.14,target,False),'fullhand-thumb-opposition':(target-R*.5-T*.5+Z*.20,target,True),'fullhand-finger-pads':(CC-R*.8+Z*.03,CC,False),'fullhand-handle-axis':(CC+Z*.8,CC,True),'fullhand-three-quarter':(target+R*.6-T*.4+Z*.20,target,True)}
    renders={}
    for name,(location,aim,show) in views.items():
        guide.hide_render=not show;data=bpy.data.cameras.new(name);data.type='ORTHO';data.ortho_scale=.19;data.clip_start=.001;camera=bpy.data.objects.new(name,data);bpy.context.collection.objects.link(camera);camera.location=location;camera.rotation_euler=(aim-camera.location).to_track_quat('-Z','Y').to_euler();scene.camera=camera
        path=RUN/'qa/renders'/(name+'.png');scene.render.filepath=str(path);bpy.ops.render.render(write_still=True)
        renders[name]={'path':path.relative_to(ROOT).as_posix(),'sha256':sha(path),'camera_location':list(camera.location),'camera_rotation':list(camera.rotation_euler),'ortho_scale':.19,'exposure':-1,'handle_visible':show,'visible_meshes':[obj.name]+([guide.name] if show else [])}
    write(RUN/'qa/renders.json',{'candidate_blend_sha256':sha(RUN/'candidate/guard-right-hand-soft-glove-clay.blend'),'renders':renders,'saved_before_QA_guides':True,'runtime_publish_allowed':False})
def main():
    baseline=read(RUN/'raw/clean-qf-base.json');base=RUN/'raw/clean-qf-base.blend';assert sha(base)==baseline['editable_base_sha256']
    bpy.ops.wm.open_mainfile(filepath=str(base));obj=bpy.data.objects['OriginalSoftGloveCleanQFBase'];obj.name='GuardRightSoftGlove_ClayLOD0'
    v0,f0=meshdata(obj);stage(obj,'00-clean-base')
    controls=read(RUN/'raw/original-sculpt-controls.json');digit=controls['digits'];source_local=[local(p) for p in v0]
    # Local smoothing uses only the named web/MCP/distal pad support. Body
    # centerlines, distal lengths, palm back and all support-exterior vertices
    # are unchanged. No global smoothing/remesh/boolean is performed.
    rois=[]
    for name,d in digit.items():
        points=[Vector(p) for p in d['landmarks_local_m']]
        rois.append({'name':name+' distal pad','center':list(points[-1]),'radii':(.009,.009,.010),'factor':.22})
        if name!='THUMB':rois.append({'name':name+' MCP web shoulder','center':list(points[0]),'radii':(.012,.011,.011),'factor':.10})
    rois.append({'name':'THUMB CMC saddle','center':(.025,-.019,.032),'radii':(.012,.012,.013),'factor':.10})
    neighbors={i:set() for i in range(len(v0))}
    for face in [list(p.vertices) for p in obj.data.polygons]:
        for a,b in zip(face,face[1:]+face[:1]):neighbors[a].add(b);neighbors[b].add(a)
    moved={};sculpt=[p.copy() for p in source_local]
    for i,p in enumerate(source_local):
        amount=0
        for roi in rois:
            q=sum(((p[k]-roi['center'][k])/roi['radii'][k])**2 for k in range(3))
            if q<1:amount=max(amount,roi['factor']*(1-q)**2)
        if amount:
            average=sum((source_local[j] for j in neighbors[i]),Vector())/len(neighbors[i]);sculpt[i]=p.lerp(average,amount);moved[i]={'support':'named original MCP/web/distal pad local control','delta_m':list(sculpt[i]-p)}
    # Wide shallow palm hollow: displace only the true inward-facing surface.
    obj.data.update();inward=[];to_local=obj.matrix_world.inverted()
    for i,(vertex,p) in enumerate(zip(obj.data.vertices,sculpt)):
        wn=obj.matrix_world.to_3x3()@vertex.normal;rad=world(p)-CC;rad.z=0
        face_in=wn.dot(rad.normalized())<-.10
        if face_in:
            shifted=Vector(patch_offset(p,(.021,.002,-.005),(.019,.023,.038),(.0012,0,0),True))
            if (shifted-p).length:moved[i]={'support':'shallow palmar hollow','delta_m':list(shifted-source_local[i])};p=shifted;inward.append(i)
        vertex.co=to_local@world(p)
    obj.data.update();stage(obj,'01-local-palm')
    write(RUN/'raw/local-sculpt-rois.json',{'rois':rois,'shallow_palm_maximum_m':.0012,'moved_vertex_ids':moved,'no_source_centerline_or_digit_length_change':True,'global_remesh_or_boolean':False})
    # Only shaft-facing palmar and pad vertices are clearance-controlled.
    # The support is angularly bounded to inward surfaces and an explicit
    # longitudinal hand ROI; outside and back-facing points stay bitwise.
    before=[Vector(obj.matrix_world@p.co) for p in obj.data.vertices];changed=[]
    for i,vertex in enumerate(obj.data.vertices):
        p=before[i];rad=p-CC;rad.z=0;radius=rad.length;n=obj.matrix_world.to_3x3()@vertex.normal;lp=local(p)
        enabled=n.dot(rad.normalized())<-.08 and -.052<lp.z<.049 and radius<.028
        if not enabled:continue
        # A softly varying pad support avoids the rejected full-cylinder cut.
        pad_target=.0229+.00035*(.5+.5*math.cos(lp.z*71))
        if radius<pad_target:
            desired=p+rad.normalized()*(pad_target-radius);vertex.co=to_local@desired;changed.append(i)
    obj.data.update();stage(obj,'02-contact-patches')
    after=[list(obj.matrix_world@p.co) for p in obj.data.vertices]
    write(RUN/'raw/contact-patch-control.json',{'changed_vertex_ids':changed,'actual_before_positions_m':[list(p) for p in before],'actual_after_positions_m':after,'support':'Only inward-facing palmar/digit pads inside .028m shaft radial region; no back or exterior projection','target_radial_support_m':'.0229-.02325; diagnostic clearance, not contact approval','boolean':False})
    interface=read(RUN/'qa/v35-interface.json');axis=Vector(interface['actual_right_cloth_terminal']['forearm_axis_world'])
    # Measured cuff distal end is h=+.01255137 and its nearest radial wall is
    # 46.5mm. Explicit index/thenar proximal outer-skin ROI is locally lowered
    # past that lip, never changing the authored digit bone guides or palm.
    # This is a bounded anatomical skin edit, not a new handle projection.
    cuff_changes=[]
    for i,vertex in enumerate(obj.data.vertices):
        p=obj.matrix_world@vertex.co;lp=local(p);delta=p-WC;h=delta.dot(axis);rad=(delta-axis*h).length
        released=Vector(proximal_cuff_release(lp,h,rad,axis.z));amount=lp.z-released.z
        if amount:
            shifted=p-Z*amount;vertex.co=to_local@shifted;cuff_changes.append({'vertex_id':i,'before_m':list(p),'after_m':list(shifted),'delta_z_m':-amount,'measured_cuff_h_m':h,'new_h_m':h+amount*(-axis.z)})
    obj.data.update();stage(obj,'02b-proximal-cuff-release')
    write(RUN/'raw/cuff-release-roi.json',{'actual_cuff_source_sha256':interface['source_sha256'],'source_cuff_distal_h_m':.01255136791689595,'source_minimum_wall_radius_m':.04649996757513648,'support_local_r_t_z_m':{'r':[.005,.035],'t':[-.046,.046],'z':[.020,.047]},'changed_vertices':cuff_changes,'authored_centerline_or_digit_length_changes':False,'handle_projection':False,'cuff_geometry_changes':False})
    cut_center=WC-axis*.008
    contour=read(RUN/'raw/actual-wrist-interface.json')['contour_m'];seam_center=WC-axis*.025
    bm=bmesh.new();bm.from_mesh(obj.data)
    bmesh.ops.bisect_plane(bm,geom=list(bm.verts)+list(bm.edges)+list(bm.faces),dist=1e-7,plane_co=obj.matrix_world.inverted()@cut_center,plane_no=obj.matrix_world.to_3x3().inverted()@axis,clear_inner=True,clear_outer=False)
    # Local wrist retopology only: collapse short boundary edges to the actual
    # 28 source samples, then place the same-count ring on its real cut plane.
    collapse_log=[]
    while True:
        bm.verts.index_update();bm.faces.index_update();bm.edges.index_update()
        faces=[list(v.index for v in f.verts) for f in bm.faces];loops=directed_boundary_loops(faces)
        if len(loops)!=1:raise ValueError('Wrist cut must yield one oriented boundary')
        loop=loops[0]
        if len(loop)<=len(contour):break
        choices=[e for e in bm.edges if e.is_boundary];edge=min(choices,key=lambda e:e.calc_length());collapse_log.append({'ends':[v.index for v in edge.verts],'length_m':edge.calc_length()});bmesh.ops.pointmerge(bm,verts=list(edge.verts),merge_co=sum((v.co for v in edge.verts),Vector())/2)
    if len(loop)!=len(contour):raise ValueError('Actual wrist has too few points; refuse unmatched zipper')
    bm.to_mesh(obj.data);bm.free();obj.data.update();v,tri=meshdata(obj);faces=[list(p.vertices) for p in obj.data.polygons];loop=directed_boundary_loops(faces)[0]
    # A cyclic one-to-one pairing preserves the inner directed boundary.
    # Choose orientation from measured polygon area, not index heuristics.
    x=(Vector(v[loop[0]])-cut_center);x-=axis*x.dot(axis);x.normalize();y=axis.cross(x)
    def angle(p,c):d=Vector(p)-c;return math.atan2(d.dot(y),d.dot(x))
    def area(points,center):return sum(((Vector(b)-center).cross(Vector(c)-center) for b,c in zip(points,points[1:]+points[:1])),Vector()).dot(axis)
    ordered=list(range(len(contour)))
    if area([v[i] for i in loop],cut_center)*area(contour,seam_center)<0:ordered.reverse()
    circular=lambda a,b:abs(math.atan2(math.sin(a-b),math.cos(a-b)))
    ordered=min((ordered[k:]+ordered[:k] for k in range(len(ordered))),key=lambda ids:sum(circular(angle(v[a],cut_center),angle(contour[b],seam_center))**2 for a,b in zip(loop,ids)))
    oldinner=[v[i][:] for i in loop]
    # Preserve the existing valid inner wrist contour. Both rings are simple,
    # same-count and cyclically paired; unequal source sampling is absorbed
    # by a middle ring, never by moving inner points to source polar phases.
    middle_center=WC-axis*.0165
    middle=[]
    for inner,j in zip(loop,ordered):
        a=Vector(v[inner])-cut_center;b=Vector(contour[j])-seam_center;middle.append(list(middle_center+a*.48+b*.52))
    midids=list(range(len(v),len(v)+len(middle)));v.extend(middle);outerids=list(range(len(v),len(v)+len(contour)));v.extend([contour[j] for j in ordered]);collarstart=len(faces)
    faces+=equal_ring_bridge(loop,midids)+equal_ring_bridge(midids,outerids)
    # Validate all two-use edges BEFORE normals recalc, not after concealing a
    # reversed boundary with shading. Ring edges are exact source positions.
    directed_boundary_loops(faces)
    mesh=bpy.data.meshes.new('Original glove local-clean skin and same-count directed wrist collar');mesh.from_pydata([Vector(p)-WC for p in v],[],faces);mesh.update();obj.data=mesh;obj.location=WC;obj.rotation_euler=(0,0,0);obj.scale=(1,1,1);bpy.context.view_layer.update()
    bm=bmesh.new();bm.from_mesh(mesh);bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));bm.to_mesh(mesh);bm.free();mesh.update()
    obj.data.materials.clear();obj.data.materials.append(material('Original soft glove clay pending details',(.48,.45,.42)))
    for p in mesh.polygons:p.use_smooth=True
    obj.vertex_groups.new(name='ACTUAL_V35_WRIST_INTERFACE').add(outerids,1,'REPLACE')
    obj['runtime_publish_allowed']=False;obj['commercial_approved']=False;obj['canonical_wrist']=list(WC);obj['canonical_grip_center']=list(CC);obj['fixed_grip_binding_plan']='Hand_R; Forearm_R/Hand_R transition; no finger bones/open-curl'
    obj['original_high_source_sha256']=controls['source_sha256'];obj['actual_v35_sleeve_cuff_source_sha256']=interface['source_sha256'];obj['clean_editable_qf_base_sha256']=baseline['editable_base_sha256'];obj['authoring_recipe']='raw/local-sculpt-rois.json + raw/contact-patch-control.json + raw/cuff-release-roi.json'
    write(RUN/'qa/collar-transport.json',{'outer_order':ordered,'inner_vertex_ids':loop,'middle_vertex_ids':midids,'outer_vertex_ids':outerids,'source_positions_exact':True,'collapse_log':collapse_log,'inner_prior_positions_m':oldinner,'inner_new_positions_m':[v[i] for i in loop],'one_to_one_quads':len(contour)*2,'all_two_uses_opposed_before_recalc':True,'collar_polygon_ids':list(range(collarstart,len(faces))),'cut_plane_center_m':list(cut_center),'intermediate_plane_center_m':list(middle_center)})
    report=stage(obj,'03-collar');v,tri=meshdata(obj);loops=directed_boundary_loops([list(p.vertices) for p in mesh.polygons]);failures=[]
    if any(report['topology'][k] for k in ('nonmanifold_edges','winding_edges','degenerate_triangles')):failures.append('Exterior topology')
    if any(report['self_contacts'].values()):failures.append('Self triangle contact')
    if report['whole_triangle_handle_clearance']['violating_triangles']:failures.append('True handle penetration')
    if len(loops)!=1 or set(loops[0])!=set(outerids):failures.append('Unique actual sleeve boundary')
    if report['connected_vertices']!=len(v):failures.append('Single shell')
    if capped_signed_volume(v,tri)<=0:failures.append('Exterior orientation')
    blend=RUN/'candidate/guard-right-hand-soft-glove-clay.blend';glb=RUN/'candidate/guard-right-hand-soft-glove-clay-lod0.glb';bpy.ops.object.select_all(action='DESELECT');obj.select_set(True);bpy.context.view_layer.objects.active=obj
    bpy.ops.wm.save_as_mainfile(filepath=str(blend));bpy.ops.export_scene.gltf(filepath=str(glb),export_format='GLB',use_selection=True,export_animations=False,export_extras=True,export_yup=True)
    report.update({'candidate_blend_sha256':sha(blend),'candidate_glb_sha256':sha(glb),'runtime_publish_allowed':False,'failures':failures,'wrist_interface_positions_m':[v[i] for i in outerids],'wrist_interface_vertex_ids':outerids,'pivot_m':list(WC),'canonical_Wc_m':list(WC),'canonical_Cc_m':list(CC),'old_v35_hand_triangles':2818,'estimated_full_character_after_replace':23562-2818+report['topology']['triangles'],'full_character_8k_to_20k_target_pass_claim':False})
    write(RUN/'qa/geometry.json',report);write(RUN/'raw/actual-candidate-mesh.json',{'vertices_m':v,'triangles':tri,'candidate_sha256':sha(glb)})
    if '--render' in sys.argv:render(obj)
    if failures:raise ValueError('Candidate critical QA failed; all stages preserved')
if __name__=='__main__':main()
