"""Actual topology and articulation gates; closed-fist baseline must fail."""
import bpy,bmesh,json,hashlib,sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).parent))
from original_glove_geometry import topology
ROOT=Path(__file__).resolve().parents[3]
RUN=ROOT/'art-factory/rts/runs/original-articulated-glove/2026-10-06-v1'
SOURCE=ROOT/'art-factory/rts/runs/original-crossbow-attack/2026-10-06-v1/candidate/original-crossbow-grip.blend'

def main():
    baseline='--baseline' in sys.argv;sources=[SOURCE] if baseline else [RUN/f'candidate/original-glove-{s}.blend' for s in ['r','l']]
    (RUN/'qa').mkdir(parents=True,exist_ok=True);hashes={};rows=[]
    for source in sources:
        hashes[source.name]=hashlib.sha256(source.read_bytes()).hexdigest();bpy.ops.wm.open_mainfile(filepath=str(source))
        meshes=[o for o in bpy.data.objects if o.type=='MESH' and (o.name.startswith('OriginalCrossbowClosedGrip_') if baseline else o.name.startswith('OriginalArticulatedGlove_'))]
        for obj in meshes:
            record={'object':obj.name,**topology({'vertices':obj.data.vertices,'faces':[tuple(p.vertices) for p in obj.data.polygons]})}
            rig=obj.find_armature();record['finger_bones']=len([b for b in rig.data.bones if b.name.startswith(('Index','Middle','Ring','Little','Thumb'))]) if rig else 0
            record['pass']=record['genus']==0 and record['nonmanifold_edges']==0 and record['finger_bones']==15;rows.append(record)
    report={'source_sha256':hashes,'rows':rows,'pass':bool(rows) and all(r['pass'] for r in rows),'runtime_publish_allowed':False}
    (RUN/f'qa/{"baseline-topology" if baseline else "candidate-topology"}.json').write_text(json.dumps(report,indent=2)+'\n');print('GLOVE_TOPOLOGY',json.dumps(report));assert report['pass'],'Requires genus-zero five-digit mesh and original articulating finger joints'
if __name__=='__main__':main()
