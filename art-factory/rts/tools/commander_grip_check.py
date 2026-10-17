"""Actual surface contact and wrapping checks, in Blender evaluated poses."""
import bpy,json,math,sys
import numpy as np
from pathlib import Path
from mathutils import Vector
ROOT=Path(__file__).resolve().parents[3]
RUN=ROOT/'art-factory/rts/runs/commander-grip/2026-10-14-v1'
SOURCE=ROOT/'art-factory/rts/runs/commander-shield/2026-10-14-v1/raw/commander-shield.blend'
def posed(obj):
    evaluated=obj.evaluated_get(bpy.context.evaluated_depsgraph_get());mesh=evaluated.to_mesh()
    points=[evaluated.matrix_world@v.co for v in mesh.vertices];evaluated.to_mesh_clear();return points
def contact(lod):
    sword=bpy.data.objects[f'CommanderLongsword_LOD{lod}'];coords=posed(sword)
    ids={i for p in sword.data.polygons if sword.data.materials[p.material_index].name=='WornLeatherGrip' for i in p.vertices}
    grip=np.array([coords[i] for i in ids]);center=grip.mean(axis=0);_,_,axes=np.linalg.svd(grip-center);axis=axes[0]
    steel={i for p in sword.data.polygons if sword.data.materials[p.material_index].name=='ForgedToolSteel' for i in p.vertices}
    blade=np.mean([coords[i] for i in steel],axis=0)-center
    if axis@blade<0:axis=-axis
    delta=grip-center;radius=float(np.max(np.linalg.norm(delta-np.outer(delta@axis,axis),axis=1)))
    hand=bpy.data.objects.get(f'CommanderClosedGrip_R_LOD{lod}')
    if hand:points=np.array(posed(hand))
    else:
        body=bpy.data.objects[f'commanderOriginalBody_LOD{lod}'];gi=body.vertex_groups['Hand_R'].index;allpoints=posed(body)
        points=np.array([allpoints[v.index] for v in body.data.vertices if any(g.group==gi and g.weight>.5 for g in v.groups)])
    d=points-center;axial=d@axis;radial=d-np.outer(axial,axis);dist=np.linalg.norm(radial,axis=1)
    # Ignore cap-centre vertices inside the shaft; measure the radial hand shell.
    valid=(np.abs(axial)<.038)&(dist>radius*.75);assert valid.any(),'No hand surface beside grip'
    gap=float(dist[valid].min()-radius)
    assert gap<=.008,f'Grip floats outside the hand: minimum surface gap {gap:.4f}m'
    assert gap>=-.004,f'Grip embeds too deeply into the outer glove shell: {gap:.4f}m'
    basis=np.cross(axis,[1.,0,0]);basis/=np.linalg.norm(basis);other=np.cross(axis,basis)
    near=valid&(dist<radius+.038)&(dist>radius*.75)
    angles=np.arctan2(radial[near]@other,radial[near]@basis)
    bins=len(set(np.floor((angles+math.pi)/(2*math.pi)*16).astype(int)%16))
    assert bins>=13,f'Fingers do not enclose grip: {bins}/16 radial sectors'
    return dict(surface_gap_m=gap,wrapped_sectors=bins,grip_radius_m=radius,blade_axis=axis.tolist())
def main():
    target=Path(sys.argv[sys.argv.index('--')+1]) if '--' in sys.argv else RUN/'raw/commander-grip.blend'
    bpy.ops.wm.open_mainfile(filepath=str(target));rig=next(o for o in bpy.data.objects if o.type=='ARMATURE')
    rig.animation_data.action=bpy.data.actions['Idle'];rig.animation_data.action_slot=bpy.data.actions['Idle'].slots[0];bpy.context.scene.frame_set(0)
    first=contact(0);assert first['blade_axis'][1]>.7 and first['blade_axis'][2]>0,'Blade must leave thumb side forward, not reverse-grip downward'
    rows=[]
    for action in bpy.data.actions:
        rig.animation_data.action=action;rig.animation_data.action_slot=action.slots[0]
        for frame in np.linspace(*action.frame_range,31):
            bpy.context.scene.frame_set(int(frame),subframe=float(frame%1))
            for lod in (0,1):rows.append(dict(clip=action.name,frame=float(frame),lod=lod,**contact(lod)))
    assert len(rows)==8*31*2
    report=dict(status='passed',samples=len(rows),max_surface_gap_m=max(r['surface_gap_m'] for r in rows),minimum_wrapped_sectors=min(r['wrapped_sectors'] for r in rows),rows=rows)
    (RUN/'qa/grip-contact.json').write_bytes((json.dumps(report,indent=2)+'\n').encode());print(json.dumps({k:v for k,v in report.items() if k!='rows'}))
if __name__=='__main__':main()
