"""Acceptance checks for the complete commander hand/equipment assembly."""
import bpy,json,sys,math
import numpy as np
from pathlib import Path
ROOT=Path(__file__).resolve().parents[3]
RUN=ROOT/'art-factory/rts/runs/commander-assembly/2026-10-14-v1'
SOURCE=ROOT/'art-factory/rts/runs/commander-grip/2026-10-14-v1/raw/commander-grip.blend'
def posed(obj):
    ev=obj.evaluated_get(bpy.context.evaluated_depsgraph_get());mesh=ev.to_mesh();points=np.array([list(ev.matrix_world@v.co) for v in mesh.vertices]);ev.to_mesh_clear();return points
def grip(lod,side):
    weapon=bpy.data.objects[f'Commander{"Longsword" if side=="R" else "DawnShield"}_LOD{lod}'];positions=posed(weapon)
    ids={i for p in weapon.data.polygons if 'leather' in weapon.data.materials[p.material_index].name.lower() for i in p.vertices}
    points=positions[list(ids)];center=(points.min(axis=0)+points.max(axis=0))/2
    # A principal-axis estimate also supports the formed oval sword grip.
    _,_,axes=np.linalg.svd(points-points.mean(axis=0));axis=axes[0]
    hand=bpy.data.objects.get(f'CommanderClosedGrip_{side}_LOD{lod}')
    assert hand is not None,f'Missing closed {side} hand LOD{lod}'
    d=posed(hand)-points.mean(axis=0);along=d@axis;radial=d-np.outer(along,axis);dist=np.linalg.norm(radial,axis=1)
    shaft=points-points.mean(axis=0);shaft_r=np.linalg.norm(shaft-np.outer(shaft@axis,axis),axis=1)
    radius=float(np.percentile(shaft_r,80));near=(np.abs(along)<.045)&(dist>radius*.8)&(dist<radius+.026)
    assert near.any(),f'{side}: no fingers near grip'
    gap=float(dist[near].min()-radius);assert -.006<=gap<=.008,f'{side}: grip gap {gap:.4f}m'
    trial=np.array([1.,0,0]) if abs(axis[0])<.9 else np.array([0.,1,0]);u=np.cross(axis,trial);u/=np.linalg.norm(u);v=np.cross(axis,u)
    angles=np.arctan2(radial[near]@v,radial[near]@u);sectors=len(set(np.floor((angles+math.pi)/math.tau*16).astype(int)%16));assert sectors>=12,f'{side}: only {sectors}/16 wrap sectors'
    return {'gap_m':gap,'wrap_sectors':sectors}
def main():
    target=(Path(sys.argv[sys.argv.index('--')+1]) if '--' in sys.argv else RUN/'raw/commander-assembly.blend').resolve()
    bpy.ops.wm.open_mainfile(filepath=str(target));rig=next(o for o in bpy.data.objects if o.type=='ARMATURE');failures=[];rows=[];floor={}
    assert len(rig.data.bones)==20 and len(bpy.data.actions)==8
    for lod in (0,1):
        for side in ('L','R'):
            o=bpy.data.objects.get(f'CommanderClosedGrip_{side}_LOD{lod}')
            if o is None:failures.append(f'LOD{lod}: missing closed {side} hand');continue
            for mat in o.data.materials:
                images=[n for n in mat.node_tree.nodes if n.type=='TEX_IMAGE'] if mat.use_nodes else []
                if len(images)<2:failures.append(f'LOD{lod} {side}: {mat.name} lacks generated color/normal detail')
    for a in bpy.data.actions:
        rig.animation_data.action=a;rig.animation_data.action_slot=a.slots[0]
        for f in np.linspace(*a.frame_range,31):
            bpy.context.scene.frame_set(int(f),subframe=float(f%1))
            for lod in (0,1):
                for part in ('Longsword','DawnShield'):
                    key=f'{a.name}/LOD{lod}/{part}';floor[key]=min(floor.get(key,math.inf),float(posed(bpy.data.objects[f'Commander{part}_LOD{lod}'])[:,2].min()))
                for side in ('L','R'):
                    try:rows.append({'clip':a.name,'frame':float(f),'lod':lod,'side':side,**grip(lod,side)})
                    except AssertionError as e:
                        msg=f'LOD{lod}: {e}'
                        if msg not in failures:failures.append(msg)
    failures.extend(f'{k} penetrates ground by {-v:.4f}m' for k,v in floor.items() if v<-.002)
    report={'status':'failed' if failures else 'passed','source':str(target.relative_to(ROOT)),'source_sha256':__import__('hashlib').sha256(target.read_bytes()).hexdigest(),'failures':failures,'contact_samples':len(rows),'minimum_equipment_floor':min(floor.values()),'floor':floor,'contact':rows}
    (RUN/'qa').mkdir(parents=True,exist_ok=True);(RUN/'qa'/('baseline-red.json' if target==SOURCE else 'assembly-check.json')).write_bytes((json.dumps(report,indent=2)+'\n').encode());print(json.dumps({k:v for k,v in report.items() if k not in ('contact','floor')}));assert not failures,'Assembly acceptance failed'
if __name__=='__main__':main()
