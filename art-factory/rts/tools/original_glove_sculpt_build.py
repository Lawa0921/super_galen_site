"""Original, bounded sculpt edits on the generated high-poly hand surface."""
import bpy,bmesh,json,hashlib,sys
import numpy as np
from pathlib import Path
from mathutils import Vector
ROOT=Path(__file__).resolve().parents[3]
RUN=ROOT/'art-factory/rts/runs/original-glove-sculpt/2026-10-06-v1'
SOURCE=ROOT/'art-factory/rts/runs/original-glove-shape/2026-10-06-v1/candidate/candidate.glb'
EXPECTED='8c4962dd9f9789252c959f2e113a0459862cb8771cc85639a20608b9330895f9'
def smooth(a,b,x):
    t=np.clip((x-a)/(b-a),0,1);return t*t*(3-2*t)
def window(a,b,c,d,x):return smooth(a,b,x)*(1-smooth(c,d,x))
def coordinates(mesh):
    a=np.empty(len(mesh.vertices)*3);mesh.vertices.foreach_get('co',a);return a.reshape(-1,3)
def main():
    assert hashlib.sha256(SOURCE.read_bytes()).hexdigest()==EXPECTED
    for d in ['candidate','qa','raw']:(RUN/d).mkdir(parents=True,exist_ok=True)
    bpy.ops.wm.read_factory_settings(use_empty=True);bpy.ops.import_scene.gltf(filepath=str(SOURCE))
    meshes=[o for o in bpy.context.scene.objects if o.type=='MESH'];assert len(meshes)==1
    obj=meshes[0];bpy.context.view_layer.objects.active=obj;obj.select_set(True)
    bpy.ops.object.transform_apply(location=True,rotation=True,scale=True)
    original=coordinates(obj.data)
    # Derive the wrist's longitudinal axis from multiple clean cross-section
    # centers, not the largest PCA component of a short, wide sleeve segment.
    section_rows=[]
    for z in [-.70,-.65,-.60]:
        row=original[np.abs(original[:,2]-z)<.008];assert len(row)>30
        center=(row.min(axis=0)+row.max(axis=0))/2;center[2]=z;section_rows.append(center)
    centers=np.asarray(section_rows);slope=np.polyfit(centers[:,2],centers[:,:2],1)
    origin=np.array([np.polyval(slope[:,0],-.62),np.polyval(slope[:,1],-.62),-.62])
    axis=np.array([slope[0,0],slope[0,1],1.]);axis/=np.linalg.norm(axis)
    u=np.array([1.,0,0]);u-=axis*np.dot(u,axis);u/=np.linalg.norm(u);v=np.cross(axis,u)
    clean=original[(original[:,2]>-.70)&(original[:,2]<-.58)]-origin
    radius=np.quantile(np.abs(np.column_stack([clean@u,clean@v])),.98,axis=0)
    # Source sections below -.74 contain a fake inner cap. The wrist axis cut
    # at approximately z=-.705 lies above that cap and yields one boundary.
    cut=-.085
    bm=bmesh.new();bm.from_mesh(obj.data)
    original_tiny=sum(f.calc_area()<1e-12 for f in bm.faces)
    bmesh.ops.remove_doubles(bm,verts=list(bm.verts),dist=1e-5)
    bmesh.ops.dissolve_degenerate(bm,edges=list(bm.edges),dist=1e-5)
    result=bmesh.ops.bisect_plane(bm,geom=list(bm.verts)+list(bm.edges)+list(bm.faces),dist=1e-7,plane_co=origin+axis*cut,plane_no=axis,clear_inner=True,clear_outer=False)
    bmesh.ops.remove_doubles(bm,verts=list(bm.verts),dist=1e-5)
    bmesh.ops.dissolve_degenerate(bm,edges=list(bm.edges),dist=1e-5)
    bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));bm.to_mesh(obj.data);bm.free();obj.data.update()
    before=coordinates(obj.data);points=before.copy();x,y,z=before.T
    normals=np.empty(len(obj.data.vertices)*3);obj.data.vertices.foreach_get('normal',normals);normals=normals.reshape(-1,3)
    # Reconstruct the whole connected patch including steep walls. This field
    # is solved from these exact immutable pre-sculpt points, not the prior
    # failed height projection. Its exterior and boundary collar positions stay fixed.
    fairing_path=RUN/'raw/dorsal-fairing.npz'
    fairing=np.load(fairing_path)
    assert np.array_equal(fairing['before'],before),'fairing source mismatch'
    points=fairing['after'].copy();dorsal=fairing['free'].astype(float)
    assert np.array_equal(points[dorsal==0],before[dorsal==0])
    # Preserve the thenar pad and distal thumb. Narrow only the CMC neck using
    # the original distal thumb's axis, with a smooth local radial falloff.
    thumb_sample=before[(x>.45)&(z>.01)&(z<.40)&(y<-.02)]
    assert len(thumb_sample)>100
    mean=thumb_sample.mean(axis=0);_,_,basis=np.linalg.svd(thumb_sample-mean,full_matrices=False)
    thumb_axis=basis[0]
    if thumb_axis[2]<0:thumb_axis=-thumb_axis
    assert thumb_axis[2]>.2
    neck=mean+thumb_axis*((-.015-mean[2])/thumb_axis[2])
    delta=points-neck;axial=delta@thumb_axis;radial=delta-axial[:,None]*thumb_axis
    cmc=window(.20,.31,.54,.61,x)*window(-.27,-.13,.15,.26,z)*window(-.49,-.40,.08,.20,y)
    cmc*=np.exp(-(axial/.115)**2)
    points-=radial*(.18*cmc)[:,None]
    # Replace only the lower sleeve wall with a measured elliptic transition.
    # The cut end is a deliberate open integration ring. Its scale is still
    # source-relative; actual character fit is a separate gate.
    delta=points-origin;axial=delta@axis;a=delta@u;b=delta@v
    rho=np.sqrt((a/radius[0])**2+(b/radius[1])**2)
    cuff=1-smooth(-.07,-.015,axial)
    roll=1+.025*np.exp(-((axial-(cut+.015))/.014)**2)
    scale=np.where(rho>1e-6,roll/np.maximum(rho,1e-6),1.)
    radial=a[:,None]*u+b[:,None]*v
    points+=radial*((scale-1)*cuff)[:,None]
    delta=points-before;changed=np.linalg.norm(delta,axis=1)
    protected=(dorsal==0)&(cmc==0)&(cuff==0)
    assert np.max(changed[protected],initial=0)==0
    obj.data.vertices.foreach_set('co',points.ravel());obj.data.update()
    # The glTF exporter's n-gon tessellation produced a collinear triangle
    # although the source polygons and Blender BEAUTY tessellation were clean.
    # Commit that verified tessellation before saving/exporting the source.
    bm=bmesh.new();bm.from_mesh(obj.data)
    bmesh.ops.triangulate(bm,faces=list(bm.faces),quad_method='BEAUTY',ngon_method='BEAUTY')
    assert all(f.calc_area()>=1e-12 for f in bm.faces)
    bm.to_mesh(obj.data);bm.free();obj.data.update()
    for face in obj.data.polygons:face.use_smooth=True
    obj.name='OriginalSculptedGlove_L'
    mat=bpy.data.materials.new('InspectionClay');mat.use_nodes=True
    shader=mat.node_tree.nodes.get('Principled BSDF');shader.inputs['Base Color'].default_value=(.32,.36,.38,1);shader.inputs['Roughness'].default_value=.65
    obj.data.materials.clear();obj.data.materials.append(mat)
    np.savez_compressed(RUN/'raw/sculpt-masks.npz',before=before,after=points,normals=normals,dorsal=dorsal,cmc=cmc,cuff=cuff,protected=protected)
    bpy.ops.wm.save_as_mainfile(filepath=str(RUN/'candidate/sculpt.blend'))
    bpy.ops.export_scene.gltf(filepath=str(RUN/'candidate/sculpt.glb'),export_format='GLB',use_selection=True,export_animations=False,export_skins=False,export_materials='EXPORT',export_yup=True)
    report={'source_sha256':EXPECTED,'original_near_zero_faces':original_tiny,'sculpt_masks':{name:{'vertices':int(np.count_nonzero(mask)),'max_displacement':float(np.max(changed[mask>0],initial=0))} for name,mask in [('dorsal',dorsal),('cmc',cmc),('cuff',cuff)]},'protected_vertices':int(protected.sum()),'protected_max_displacement':float(np.max(changed[protected],initial=0)),'dorsal_method':'connected_xyz_biharmonic','dorsal_fairing_input_sha256':hashlib.sha256(fairing_path.read_bytes()).hexdigest(),'thumb_axis':thumb_axis.tolist(),'thumb_neck':neck.tolist(),'wrist':{'origin':origin.tolist(),'axis':axis.tolist(),'ellipse_radius':radius.tolist(),'cut_axis_distance':cut,'section_centers':centers.tolist()},'files':{p.name:hashlib.sha256(p.read_bytes()).hexdigest() for p in (RUN/'candidate').iterdir() if p.suffix in ['.blend','.glb']},'runtime_publish_allowed':False}
    (RUN/'qa/authoring.json').write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8');print(json.dumps(report))
if __name__=='__main__':main()
