"""Run actual refined-surface QA and preserve the original bind/curves exactly."""
import bpy,json,hashlib,sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).parent))
import original_glove_verify as common
ROOT=Path(__file__).resolve().parents[3]
RUN=ROOT/'art-factory/rts/runs/original-glove-tailoring/2026-10-06-v1'
BASE=ROOT/'art-factory/rts/runs/original-articulated-glove/2026-10-06-v1'
common.RUN=RUN

def rig_record(path,side):
    bpy.ops.wm.open_mainfile(filepath=str(path));rig=bpy.data.objects['OriginalHandRig_'+side];action=bpy.data.actions['OpenClose']
    bones={b.name:{'parent':b.parent.name if b.parent else None,'matrix':[v for row in b.matrix_local for v in row]} for b in rig.data.bones}
    curves={}
    for layer in action.layers:
        for strip in layer.strips:
            for slot in action.slots:
                bag=strip.channelbag(slot)
                if bag:
                    for curve in bag.fcurves:curves[(curve.data_path,curve.array_index)]=[(tuple(k.co),k.interpolation) for k in curve.keyframe_points]
    return bones,curves

def preserve():
    rows=[]
    for side in ['R','L']:
        a=BASE/f'candidate/original-glove-{side.lower()}.blend';b=RUN/f'candidate/original-glove-{side.lower()}.blend'
        baseline=rig_record(a,side);actual=rig_record(b,side)
        rows.append({'side':side,'baseline_sha256':hashlib.sha256(a.read_bytes()).hexdigest(),'candidate_sha256':hashlib.sha256(b.read_bytes()).hexdigest(),'bind_equal':baseline[0]==actual[0],'curves_equal':baseline[1]==actual[1],'bones':len(actual[0]),'curves':len(actual[1])})
    report={'rows':rows,'pass':all(r['bind_equal'] and r['curves_equal'] and r['bones']==16 for r in rows),'runtime_publish_allowed':False}
    (RUN/'qa/rig-preservation.json').write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8',newline='\n');print('RIG_PRESERVATION',json.dumps(report));assert report['pass']

def links():
    from original_glove_tailoring_geometry_test import vertex_link_errors
    rows=[]
    for side in ['R','L']:
        bpy.ops.wm.open_mainfile(filepath=str(RUN/f'candidate/original-glove-{side.lower()}.blend'))
        for obj in [o for o in bpy.data.objects if o.type=='MESH']:
            data={'vertices':obj.data.vertices,'faces':[tuple(p.vertices) for p in obj.data.polygons]};bad=vertex_link_errors(data);rows.append({'mesh':obj.name,'vertex_link_errors':bad})
    report={'rows':rows,'pass':all(not r['vertex_link_errors'] for r in rows)};(RUN/'qa/vertex-links.json').write_text(json.dumps(report,indent=2)+'\n');assert report['pass'];print('VERTEX_LINKS',len(rows),'PASS')

if __name__=='__main__':
    if '--export' in sys.argv:
        import original_glove_export_verify as export
        export.main()
    elif '--deform' in sys.argv:
        import original_glove_deformation as deform
        deform.main()
    else:common.main();links();preserve()
