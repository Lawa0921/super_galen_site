"""Create atlas coordinates and frozen projection visibility, without reshaping."""
from pathlib import Path
import hashlib,json,sys,math
import bpy,numpy as np
from mathutils import Vector
from mathutils.bvhtree import BVHTree
ROOT=Path(__file__).resolve().parents[3]
RUN=ROOT/'art-factory/rts/runs/original-guard-portrait-material/2026-10-05'


def sha(path):return hashlib.sha256(path.read_bytes()).hexdigest()


def main():
    contract=json.loads((ROOT/'art-factory/rts/contracts/original-guard-portrait-material.json').read_text())
    source=ROOT/contract['source_blend']
    if sha(source)!=contract['source_blend_sha256']:raise ValueError('Frozen source differs')
    for name in ['candidate','qa']: (RUN/name).mkdir(parents=True,exist_ok=True)
    bpy.ops.wm.open_mainfile(filepath=str(source));obj=bpy.data.objects['OriginalGuardPortraitBust'];bpy.context.scene.frame_set(0)
    bpy.ops.object.select_all(action='DESELECT');obj.select_set(True);bpy.context.view_layer.objects.active=obj
    vertices=np.asarray([v.co[:] for v in obj.data.vertices]);faces=np.asarray([p.vertices[:] for p in obj.data.polygons])
    before=hashlib.sha256(vertices.tobytes()+faces.tobytes()).hexdigest()
    bpy.ops.object.mode_set(mode='EDIT');bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.uv.smart_project(angle_limit=math.radians(66),island_margin=.012)
    bpy.ops.object.mode_set(mode='OBJECT');obj.data.calc_loop_triangles()
    uv=np.asarray([[obj.data.uv_layers.active.data[i].uv[:] for i in tri.loops] for tri in obj.data.loop_triangles])
    normals=np.asarray([v.normal[:] for v in obj.data.vertices])
    bvh=BVHTree.FromPolygons(vertices.tolist(),faces.tolist(),all_triangles=True)
    directions=np.asarray([[0,1,0],[0,-1,0],[-1,0,0],[1,0,0]],float)
    visibility=np.zeros((len(vertices),4))
    for i,(point,normal) in enumerate(zip(vertices,normals)):
        origin=Vector(point+normal*2e-5)
        for j,direction in enumerate(directions):
            if np.dot(normal,direction)>0:
                hit=bvh.ray_cast(origin,Vector(direction),2)
                visibility[i,j]=float(hit[0] is None)
    np.savez_compressed(RUN/'candidate/projection-mesh.npz',vertices=vertices,faces=faces,uv=uv,normals=normals,visibility=visibility,directions=directions)
    after=hashlib.sha256(np.asarray([v.co[:] for v in obj.data.vertices]).tobytes()+np.asarray([p.vertices[:] for p in obj.data.polygons]).tobytes()).hexdigest()
    if before!=after:raise ValueError('UV preparation changed geometry')
    bpy.context.preferences.filepaths.save_version=0
    bpy.ops.wm.save_as_mainfile(filepath=str(RUN/'candidate/atlas-prepared.blend'))
    report={'status':'atlas_prepared','runtime_publish_allowed':False,'source_blend_sha256':sha(source),'geometry_sha256_before':before,'geometry_sha256_after':after,'vertices':len(vertices),'triangles':len(faces),'projection_order':['front','back','left-facing','right-facing'],'visibility':'Per-vertex outward source-mesh ray, barycentric interpolation; not a per-texel high-source visibility proof'}
    (RUN/'qa/preparation.json').write_bytes((json.dumps(report,indent=2)+'\n').encode())
    print('MATERIAL_PREPARED',len(vertices),len(faces),flush=True)


if __name__=='__main__':main()
