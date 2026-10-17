"""Retopologize registered rock masses, transferring their original UV/materials."""
import argparse,json,sys
from pathlib import Path
import bpy,bmesh
from mathutils import Vector
from mathutils.bvhtree import BVHTree
sys.path.insert(0,str(Path(__file__).parent))
from visual_rock_retopology_test import fingerprint,metrics
from detail_materials import externalize_building

def aspect(face):
    a,b,c=(v.co for v in face.verts);area=(b-a).cross(c-a).length*.5
    return max((b-a).length_squared,(c-b).length_squared,(a-c).length_squared)/(2*area) if area else 1e9

def main():
    p=argparse.ArgumentParser();p.add_argument('--asset',choices=['rock','gold-mine'],required=True);p.add_argument('--source',type=Path,required=True);p.add_argument('--run',type=Path,required=True);a=p.parse_args(sys.argv[sys.argv.index('--')+1:]);run=a.run.resolve()
    for folder in ('raw','candidate','qa'):(run/folder).mkdir(parents=True,exist_ok=True)
    bpy.ops.wm.open_mainfile(filepath=str(a.source.resolve()));obj=bpy.data.objects['Joined original structural strata'];before=metrics(obj);other={o.name:fingerprint(o) for o in bpy.data.objects if o.type=='MESH' and o!=obj}
    obj.data.calc_loop_triangles();points=[v.co.copy() for v in obj.data.vertices];triangles=[tuple(t.vertices) for t in obj.data.loop_triangles];charts=[[obj.data.uv_layers.active.data[i].uv.copy() for i in t.loops] for t in obj.data.loop_triangles];material_ids=[obj.data.polygons[t.polygon_index].material_index for t in obj.data.loop_triangles];materials=list(obj.data.materials);tree=BVHTree.FromPolygons(points,triangles,all_triangles=True)
    bpy.ops.object.select_all(action='DESELECT');obj.select_set(True);bpy.context.view_layer.objects.active=obj
    obj.data.remesh_voxel_size=.05 if a.asset=='rock' else .07;obj.data.remesh_voxel_adaptivity=0;obj.data.use_remesh_preserve_volume=True;obj.data.use_remesh_preserve_attributes=False;bpy.ops.object.voxel_remesh()
    smooth=obj.modifiers.new('Retain source volume while removing thin strata','LAPLACIANSMOOTH');smooth.lambda_factor=.08;smooth.lambda_border=.02;smooth.iterations=2;smooth.use_volume_preserve=True;smooth.use_normalized=True;bpy.ops.object.modifier_apply(modifier=smooth.name)
    target=1950 if a.asset=='rock' else 7244;obj.data.calc_loop_triangles();dec=obj.modifiers.new('Retopology triangle budget','DECIMATE');dec.ratio=target/len(obj.data.loop_triangles);dec.use_collapse_triangulate=True;bpy.ops.object.modifier_apply(modifier=dec.name)
    bm=bmesh.new();bm.from_mesh(obj.data);bmesh.ops.triangulate(bm,faces=list(bm.faces),quad_method='BEAUTY',ngon_method='BEAUTY');bmesh.ops.beautify_fill(bm,faces=list(bm.faces),edges=list(bm.edges),method='AREA');rounds=[]
    for iteration in range(4):
        bad=[f for f in bm.faces if aspect(f)>15];rounds.append({'round':iteration,'triangles':len(bm.faces),'bad':len(bad)})
        if not bad:break
        edges=set(max(f.edges,key=lambda e:e.calc_length()) for f in bad);bmesh.ops.subdivide_edges(bm,edges=list(edges),cuts=1,use_grid_fill=False,smooth=0);bmesh.ops.triangulate(bm,faces=list(bm.faces),quad_method='BEAUTY',ngon_method='BEAUTY');bmesh.ops.beautify_fill(bm,faces=list(bm.faces),edges=list(bm.edges),method='AREA')
    assert not any(aspect(f)>15 for f in bm.faces);bm.to_mesh(obj.data);bm.free();obj.data.update()
    obj.data.materials.clear()
    for mat in materials:obj.data.materials.append(mat)
    while obj.data.uv_layers:obj.data.uv_layers.remove(obj.data.uv_layers[0])
    uv=obj.data.uv_layers.new(name='Architectural UV')
    for face in obj.data.polygons:
        center=sum((obj.data.vertices[i].co for i in face.vertices),Vector())/len(face.vertices);face.material_index=material_ids[tree.find_nearest(center)[2]];face.use_smooth=False
        for li in face.loop_indices:
            nearest,_,index,_=tree.find_nearest(obj.data.vertices[obj.data.loops[li].vertex_index].co);pa,pb,pc=(points[i] for i in triangles[index]);v0=pb-pa;v1=pc-pa;v2=nearest-pa;d00=v0.dot(v0);d01=v0.dot(v1);d11=v1.dot(v1);d20=v2.dot(v0);d21=v2.dot(v1);den=d00*d11-d01*d01;assert abs(den)>1e-16
            w1=(d11*d20-d01*d21)/den;w2=(d00*d21-d01*d20)/den;weights=[max(0,min(1,w)) for w in (1-w1-w2,w1,w2)];total=sum(weights);uv.data[li].uv=sum((coord*w/total for coord,w in zip(charts[index],weights)),Vector((0,0)))
    # The source caps and strata have incompatible charts. Nearest-point UVs
    # collapse triangles spanning those charts, producing pale stretched bands.
    # Reuse the original generated surface at a measured half-repeat per metre.
    for face in obj.data.polygons:
        dominant=max(range(3),key=lambda axis:abs(face.normal[axis]));axes=[axis for axis in range(3) if axis!=dominant]
        for li in face.loop_indices:
            point=obj.data.vertices[obj.data.loops[li].vertex_index].co
            uv.data[li].uv=(point[axes[0]]*.5,point[axes[1]]*.5)
    assert other=={o.name:fingerprint(o) for o in bpy.data.objects if o.type=='MESH' and o!=obj}
    after=metrics(obj);total=sum(metrics(o)['tris'] for o in bpy.data.objects if o.type=='MESH');assert total<=(2000 if a.asset=='rock' else 8000);assert after['nonmanifold']==0 and after['volume']>0
    bpy.context.preferences.filepaths.save_version=0;bpy.ops.file.pack_all();bpy.ops.wm.save_as_mainfile(filepath=str(run/f'raw/{a.asset}.blend'))
    bpy.ops.object.select_all(action='DESELECT');objects=[o for o in bpy.data.objects if o.type=='MESH']
    for mesh in objects:mesh.select_set(True)
    bpy.context.view_layer.objects.active=objects[0];output=run/f'candidate/{a.asset}.glb';bpy.ops.export_scene.gltf(filepath=str(output),export_format='GLB',use_selection=True,export_yup=True,export_apply=True,export_normals=True,export_texcoords=True,export_materials='EXPORT',export_animations=False,export_tangents=True)
    if a.asset=='rock':externalize_building(output)
    (run/f'qa/{a.asset}-build.json').write_text(json.dumps({'source':str(a.source),'before':before,'after':after,'triangles':total,'cleanup':rounds,'untouched_meshes':other,'runtime_publish_allowed':False,'artistic_quality_proven':False},indent=2)+'\n')
if __name__=='__main__':main()
