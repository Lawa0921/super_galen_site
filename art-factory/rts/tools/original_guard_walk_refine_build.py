"""Create isolated full-body before/after exports from one frozen source."""
import argparse,hashlib,json,sys
from pathlib import Path
import bpy
sys.path.insert(0,str(Path(__file__).resolve().parent))
from original_guard_walk_refine import refine_walk,protected_signature
from original_guard_walk_refine_glb import transplant_walk

def sha(path):return hashlib.sha256(path.read_bytes()).hexdigest()
def export_lod(run,arm,lod,force_sampling=True):
    out=run/'candidate';out.mkdir(parents=True,exist_ok=True)
    bpy.ops.object.select_all(action='DESELECT')
    chosen=[arm]+[o for o in bpy.data.objects if o.type=='MESH' and o.name.endswith('LOD'+str(lod))]
    for obj in chosen:
        obj.hide_set(False);obj.hide_viewport=False;obj.hide_render=False;obj.select_set(True)
    bpy.context.view_layer.objects.active=arm
    target=out/f'original-guard-assembly-lod{lod}.glb'
    bpy.ops.export_scene.gltf(filepath=str(target),export_format='GLB',use_selection=True,
        export_animations=True,export_animation_mode='ACTIONS',export_force_sampling=force_sampling,
        export_optimize_animation_size=force_sampling,export_image_format='JPEG',export_jpeg_quality=92,
        export_skins=True,export_yup=True,export_def_bones=True,export_extras=True)
    return {'lod':lod,'path':str(target),'sha256':sha(target),'bytes':target.stat().st_size,'objects':[o.name for o in chosen]}
def main():
    parser=argparse.ArgumentParser();parser.add_argument('--source',required=True);parser.add_argument('--run',required=True)
    args=parser.parse_args(sys.argv[sys.argv.index('--')+1:]);source=Path(args.source).resolve();run=Path(args.run).resolve()
    (run/'candidate').mkdir(parents=True,exist_ok=True);(run/'qa').mkdir(exist_ok=True)
    source_sha=sha(source);bpy.ops.wm.open_mainfile(filepath=str(source))
    arm=bpy.data.objects['GuardRig20']
    # Boots may be separate rigid parts. Use the complete LOD0 selection so
    # actual sole vertices, rather than an empty former body Foot group, drive IK.
    sole_objects=[o for o in bpy.data.objects if o.type=='MESH' and o.name.endswith('LOD0')]
    before=[export_lod(run/'before',arm,lod) for lod in [0,1]]
    protected=protected_signature();refine=refine_walk(arm,sole_objects,fps=30,sample_hz=120)
    assert protected_signature()==protected
    knee=None
    if 'KneeSupport_L' in arm.pose.bones or 'KneeSupport_R' in arm.pose.bones:
        from original_guard_assembly_build import bake_knee_support_clip
        knee=bake_knee_support_clip(arm,bpy.context.scene,'Walk',sample_hz=120)
    blend=run/'candidate/original-guard-walk-refine.blend';bpy.ops.wm.save_as_mainfile(filepath=str(blend))
    after=[];donors=[];transplants=[]
    for lod in [0,1]:
        standard=export_lod(run/'after',arm,lod,True)
        donor=export_lod(run/'dense-donor',arm,lod,False)
        transplant=transplant_walk(standard['path'],donor['path'])
        standard['sha256']=sha(Path(standard['path']));standard['bytes']=Path(standard['path']).stat().st_size
        after.append(standard);donors.append(donor);transplants.append(transplant)
    assert sha(source)==source_sha,'Source changed during standalone build'
    report={'status':'candidate_exported','runtime_publish_allowed':False,'visual_approval':False,
        'source':{'path':str(source),'sha256':source_sha},'protected_curves_sha256_before_knee_callback':protected,
        'standard_export_force_sampling':True,'dense_walk_export_force_sampling':False,
        'bounds_note':'Standalone diagnostic inherits bounds. Assembly must regenerate full-clip bounds after helper integration.',
        'before':before,'after':after,'denseDonors':donors,'walkTransplants':transplants,'refine':refine,'kneeSupport':knee,
        'blend':{'path':str(blend),'sha256':sha(blend)}}
    (run/'qa/build.json').write_text(json.dumps(report,indent=2)+'\n')
    print(json.dumps({'status':report['status'],'before':before,'after':after,'refine':refine},indent=2))
if __name__=='__main__':main()
