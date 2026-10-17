"""Reimport all four actual GLBs and compare original skin and surface motion."""
import bpy,json,hashlib,sys
from pathlib import Path
from mathutils.kdtree import KDTree
sys.path.insert(0,str(Path(__file__).parent))
from original_glove_verify import RUN
from original_glove_deformation import evaluated

def frame(rig,f):
    a=next(a for a in bpy.data.actions if a.name=='OpenClose' or a.name.endswith('|OpenClose'));rig.animation_data.action=a;rig.animation_data.action_slot=a.slots[0]
    for track in rig.animation_data.nla_tracks:track.mute=True
    bpy.context.scene.frame_set(int(f),subframe=f%1);bpy.context.view_layer.update()
def skin(rig):return {b.name:rig.matrix_world@b.matrix@b.bone.matrix_local.inverted() for b in rig.pose.bones}
def main():
    rows=[];hashes={}
    for side in ['r','l']:
        source=RUN/f'candidate/original-glove-{side}.blend';hashes[source.name]=hashlib.sha256(source.read_bytes()).hexdigest();bpy.ops.wm.open_mainfile(filepath=str(source));rig=bpy.data.objects['OriginalHandRig_'+side.upper()]
        objects={lod:bpy.data.objects[f'OriginalArticulatedGlove_{side.upper()}_LOD{lod}'] for lod in [0,1]};rest={lod:[o.matrix_world@v.co for v in o.data.vertices] for lod,o in objects.items()};samples={}
        for i in range(385):
            f=i/8;frame(rig,f);samples[f]={'skin':skin(rig),'points':{lod:evaluated(o)[0] for lod,o in objects.items()}}
        for lod in [0,1]:
            glb=RUN/f'candidate/glove-{side}-lod{lod}.glb';hashes[glb.name]=hashlib.sha256(glb.read_bytes()).hexdigest();bpy.ops.wm.read_factory_settings(use_empty=True);bpy.ops.import_scene.gltf(filepath=str(glb));rig=next(o for o in bpy.data.objects if o.type=='ARMATURE')
            # Blender also creates an unskinned Icosphere bone-display helper.
            # Compare the actual named, skinned exported surface, not that mesh.
            meshes=[o for o in bpy.data.objects if o.type=='MESH' and o.name==f'OriginalArticulatedGlove_{side.upper()}_LOD{lod}' and o.find_armature() is rig]
            assert len(meshes)==1,[(o.name,o.type) for o in bpy.data.objects]
            obj=meshes[0]
            rig.data.pose_position='REST';bpy.context.view_layer.update();points=evaluated(obj)[0];tree=KDTree(len(rest[lod]))
            for i,p in enumerate(rest[lod]):tree.insert(p,i)
            tree.balance();mapping=[tree.find(p)[1] for p in points];rest_error=max(tree.find(p)[2] for p in points);rig.data.pose_position='POSE';max_skin=0;max_surface=0
            for f,expected in samples.items():
                frame(rig,f);actual=skin(rig);assert actual.keys()==expected['skin'].keys();points=evaluated(obj)[0]
                max_skin=max(max_skin,max(abs(m[a][b]-expected['skin'][name][a][b]) for name,m in actual.items() for a in range(4) for b in range(4)))
                max_surface=max(max_surface,max((p-expected['points'][lod][mapping[i]]).length for i,p in enumerate(points)))
            rows.append({'side':side,'lod':lod,'samples':len(samples),'bones':len(rig.data.bones),'rest_error_m':rest_error,'matrix_error':max_skin,'surface_error_m':max_surface,'pass':rest_error<1e-6 and max_skin<1e-4 and max_surface<1e-5})
    report={'files':hashes,'rows':rows,'sample_step_frames':.125,'pass':all(r['pass'] for r in rows),'runtime_publish_allowed':False};(RUN/'qa/actual-export.json').write_text(json.dumps(report,indent=2)+'\n');print('GLOVE_EXPORT',json.dumps(report));assert report['pass']
if __name__=='__main__':main()
