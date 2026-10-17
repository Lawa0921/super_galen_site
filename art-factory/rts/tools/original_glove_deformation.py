"""Evaluate actual original glove surfaces through finger motion, not only keys."""
import bpy,json,math,sys,hashlib,ast
from pathlib import Path
from mathutils import Vector
from mathutils.bvhtree import BVHTree
from mathutils.geometry import intersect_ray_tri
sys.path.insert(0,str(Path(__file__).parent))
from original_glove_verify import RUN

def crossings(a,b):
    for tri,other in [(a,b),(b,a)]:
        for p,q in zip(tri,tri[1:]+tri[:1]):
            delta=q-p
            if delta.length<1e-9:continue
            hit=intersect_ray_tri(*other,delta,p,True)
            if hit is not None and 1e-5<(hit-p).dot(delta)/delta.length_squared<1-1e-5:return True
    return False

def evaluated(obj):
    e=obj.evaluated_get(bpy.context.evaluated_depsgraph_get());mesh=e.to_mesh();mesh.calc_loop_triangles();points=[e.matrix_world@v.co for v in mesh.vertices];tris=[tuple(t.vertices) for t in mesh.loop_triangles];e.to_mesh_clear();return points,tris

def main():
    step=6 if '--coarse' in sys.argv else .5;rows=[];hashes={}
    for side in ['R','L']:
        source=RUN/f'candidate/original-glove-{side.lower()}.blend';hashes[source.name]=hashlib.sha256(source.read_bytes()).hexdigest();bpy.ops.wm.open_mainfile(filepath=str(source));rig=bpy.data.objects['OriginalHandRig_'+side];rig.animation_data.action=bpy.data.actions['OpenClose'];rig.animation_data.action_slot=rig.animation_data.action.slots[0]
        objects=[bpy.data.objects[f'OriginalArticulatedGlove_{side}_LOD{i}'] for i in [0,1]];fixed={o.name:[v.index for v in o.data.vertices if v.co.z<-.005] for o in objects};start={}
        for sample in range(round(48/step)+1):
            frame=sample*step;bpy.context.scene.frame_set(int(frame),subframe=frame%1);bpy.context.view_layer.update()
            stretch=max(abs((b.tail-b.head).length/b.bone.length-1) for b in rig.pose.bones)
            for obj in objects:
                points,tris=evaluated(obj);bvh=BVHTree.FromPolygons(points,tris,all_triangles=True);bad=[];groups={}
                for a,b in bvh.overlap(bvh):
                    if a>=b or len(set(tris[a])&set(tris[b]))>=2:continue
                    if crossings([points[i] for i in tris[a]],[points[i] for i in tris[b]]):
                        bad.append((a,b));names=[]
                        for tri in [tris[a],tris[b]]:
                            weights={}
                            for i in tri:
                                for g in obj.data.vertices[i].groups:
                                    name=obj.vertex_groups[g.group].name;weights[name]=weights.get(name,0)+g.weight
                            names.append(max(weights,key=weights.get))
                        key='/'.join(sorted(names));groups[key]=groups.get(key,0)+1
                if frame==0:start[obj.name]=points
                wrist=max((points[i]-start[obj.name][i]).length for i in fixed[obj.name])
                zero=sum((points[b]-points[a]).cross(points[c]-points[a]).length<1e-12 for a,b,c in tris)
                volume=sum(points[a].dot(points[b].cross(points[c]))/6 for a,b,c in tris)
                loop_error=max((p-start[obj.name][i]).length for i,p in enumerate(points)) if frame==48 else 0
                rows.append({'side':side,'lod':int(obj.name[-1]),'frame':frame,'intersections':len(bad),'regions':groups,'wrist_drift_m':wrist,'zero_area_triangles':zero,'signed_volume_m3':volume,'max_bone_length_relative_error':stretch,'loop_endpoint_error_m':loop_error})
    bad=[r for r in rows if r['intersections'] or r['wrist_drift_m']>1e-6 or r['zero_area_triangles'] or r['signed_volume_m3']<=0 or r['max_bone_length_relative_error']>1e-5 or r['loop_endpoint_error_m']>1e-6]
    report={'source_sha256':hashes,'step_frames':step,'rows':rows,'pass':not bad,'scope':'Actual evaluated closed glove triangle surfaces; noncoplanar crossings excluding shared edges. Wrist below -5mm must remain fixed. Does not validate weapon/body fitting or visual anatomy.','runtime_publish_allowed':False}
    (RUN/f'qa/deformation-{ "coarse" if step==6 else "dense" }.json').write_text(json.dumps(report,indent=2)+'\n');print('GLOVE_DEFORMATION',json.dumps({'pass':not bad,'samples':len(rows),'bad':bad[:12],'bad_samples':len(bad)}));assert report['pass']
if __name__=='__main__':main()
