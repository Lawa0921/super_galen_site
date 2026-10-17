"""Actual source preservation, selected skirt UV occupancy and bake ray coverage."""
import bpy,hashlib,json,sys
from pathlib import Path
import numpy as np
sys.path.insert(0,str(Path(__file__).parent))
from original_crossbow_drape_uv import SOURCE,RUN
from original_crossbow_cuff_verify import snapshot

def material_signature(mat):
    return {'name':mat.name,'mask':mat.get('teamTintMask'),'images':{n.image.name:hashlib.sha256(n.image.packed_file.data).hexdigest() for n in mat.node_tree.nodes if n.type=='TEX_IMAGE' and n.image and n.image.packed_file}}

def raster_check(mesh,indices,coverage):
    size=coverage.shape[0];occupied=np.zeros((size,size),bool);overlap=misses=samples=0;min_area=1
    for index in indices:
        p=mesh.polygons[index];uv=np.asarray([list(mesh.uv_layers.active.data[i].uv) for i in p.loop_indices]);assert len(uv)==3
        assert np.isfinite(uv).all() and uv.min()>=0 and uv.max()<=1
        a,b,c=uv*size;den=(b[1]-c[1])*(a[0]-c[0])+(c[0]-b[0])*(a[1]-c[1]);min_area=min(min_area,abs(den)/size**2/2);assert abs(den)>1e-9
        lo=np.maximum(np.floor(np.min([a,b,c],axis=0)).astype(int),0);hi=np.minimum(np.ceil(np.max([a,b,c],axis=0)).astype(int),size-1)
        yy,xx=np.mgrid[lo[1]:hi[1]+1,lo[0]:hi[0]+1];x=xx+.5;y=yy+.5
        u=((b[1]-c[1])*(x-c[0])+(c[0]-b[0])*(y-c[1]))/den;v=((c[1]-a[1])*(x-c[0])+(a[0]-c[0])*(y-c[1]))/den
        inside=(u>1e-6)&(v>1e-6)&(u+v<1-1e-6)
        px=xx[inside];py=yy[inside];overlap+=int(occupied[py,px].sum());occupied[py,px]=True
    values=coverage[occupied];misses=int((values<.99).sum());samples=len(values)
    return {'sample_resolution':size,'strict_interior_texels':samples,'overlapping_interior_texels':overlap,'coverage_below_99_percent_texels':misses,'minimum_uv_triangle_area':min_area}

def main():
    bpy.ops.wm.open_mainfile(filepath=str(SOURCE));before,bones,actions=snapshot();old_uv={o.name:[tuple(d.uv) for d in o.data.uv_layers.active.data] for o in bpy.data.objects if o.type=='MESH'};old_materials={o.name:[material_signature(m) for m in o.data.materials] for o in bpy.data.objects if o.type=='MESH'}
    target=RUN/'candidate/original-crossbow-grip.blend';bpy.ops.wm.open_mainfile(filepath=str(target));after,new_bones,new_actions=snapshot();assert before.keys()==after.keys() and bones==new_bones and actions==new_actions
    record=json.loads((RUN/'candidate/drape-report.json').read_text());assert record['source_sha256']==hashlib.sha256(SOURCE.read_bytes()).hexdigest();rows=[]
    for name,old in before.items():
        new=after[name];assert all(old[k]==new[k] for k in ('vertices','topology','weights')),(name,'geometry/skin changed')
        if 'OriginalBody' not in name:assert old==new and old_materials[name]==[material_signature(m) for m in bpy.data.objects[name].data.materials]
    for r in record['records']:
        lod=r['lod'];body=bpy.data.objects[f'crossbowOriginalBody_LOD{lod}'];mesh=body.data;selected=set(r['faces']);loops={i for p in mesh.polygons if p.index in selected for i in p.loop_indices}
        assert material_signature(body.data.materials[0])==old_materials[body.name][0]
        assert all(tuple(d.uv)==old_uv[body.name][i] for i,d in enumerate(mesh.uv_layers.active.data) if i not in loops),'Unselected UV changed'
        assert all(p.material_index==(r['material_index'] if p.index in selected else 0) for p in mesh.polygons),'Unexpected material assignment'
        coverage=bpy.data.images.load(str(RUN/f'qa/skirt-coverage-lod{lod}-1024.png'));coverage.colorspace_settings.name='Non-Color';pixels=np.asarray(coverage.pixels[:]).reshape(1024,1024,4)[:,:,0]
        uv=raster_check(mesh,r['faces'],pixels);assert uv['overlapping_interior_texels']==0,uv
        rows.append({'lod':lod,'skirt_faces':len(selected),'unchanged_outside_uv_loops':len(mesh.loops)-len(loops),**uv})
    report={'source_sha256':hashlib.sha256(SOURCE.read_bytes()).hexdigest(),'candidate_sha256':hashlib.sha256(target.read_bytes()).hexdigest(),'geometry_topology_weights_exact':True,'twenty_bind_and_five_actions_exact':True,'non_body_objects_exact':True,'original_material_bytes_exact':True,'rows':rows,'pass':all(r['coverage_below_99_percent_texels']==0 for r in rows),'scope':'Skirt UV pixel-center overlap at 1024px and white-source ray coverage; does not prove continuous-space overlap or full visual quality.','runtime_publish_allowed':False}
    (RUN/'qa/drape-preservation.json').write_text(json.dumps(report,indent=2)+'\n');print('DRAPE_VERIFY',json.dumps(report));assert report['pass'],'Bake missed source surface'
if __name__=='__main__':main()
