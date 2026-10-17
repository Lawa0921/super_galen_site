"""Adapt generated grip anatomy to each unit's real weapon and wrist anchors."""
import argparse,json,sys
from pathlib import Path
import bpy,bmesh
from mathutils import Vector
sys.path.insert(0,str(Path(__file__).parent))
import procedural_gauntlet_build as g
import generated_grip_fit as grip
from visual_hand_rework import mesh_fingerprint
ROOT=Path(__file__).resolve().parents[3]

def remove_wrist_fragments(body,wrists):
    bm=bmesh.new();bm.from_mesh(body.data);remaining=set(bm.verts);removed=0
    while remaining:
        stack=[remaining.pop()];component=[]
        while stack:
            v=stack.pop();component.append(v);neighbours={e.other_vert(v) for e in v.link_edges}&remaining;remaining-=neighbours;stack.extend(neighbours)
        if len(component)<20 and any(all((v.co-w).length<.20 for v in component) for w in wrists.values()):
            removed+=len(component);bmesh.ops.delete(bm,geom=component,context='VERTS')
    bm.to_mesh(body.data);bm.free();return removed

def main():
    p=argparse.ArgumentParser();p.add_argument('--source',type=Path,required=True);p.add_argument('--unit',choices=['worker','priest','neutral-raider','commander','crossbow'],required=True);p.add_argument('--run',type=Path,required=True)
    p.add_argument('--anatomical-grip',action='store_true',help='Keep the generated finger proportions; align the held prop to the wrist instead of shearing the hand')
    a=p.parse_args(sys.argv[sys.argv.index('--')+1:]);run=a.run.resolve();unit=a.unit
    for folder in ('raw','candidate','qa'):(run/folder).mkdir(parents=True,exist_ok=True)
    bpy.ops.wm.open_mainfile(filepath=str(a.source.resolve()));rig=next(o for o in bpy.data.objects if o.type=='ARMATURE');g.set_action(rig,'Idle');bpy.context.scene.frame_set(0)
    records_path=ROOT/f'art-factory/rts/runs/all-models/2026-10-14-v1/qa/{unit}-build.json' if unit!='commander' else ROOT/'art-factory/rts/runs/commander-assembly/2026-10-14-v1/qa/build.json'
    records=json.loads(records_path.read_bytes())['hands'];sides='RL' if unit in ('commander','crossbow') else 'R'
    canonical={r['side']:Vector(r['cut'].get('wrist',r['cut'].get('wrist_center'))) for r in records if r['lod']==0}
    if a.anatomical_grip:assert unit in ('neutral-raider','priest','commander'),'Anatomical anchor correction requires independently held tools'
    before_ref=g.skin_matrices(rig);changes=grip.canonical_wrist_pivots(rig,canonical) if unit!='crossbow' and not a.anatomical_grip else [];ref=g.skin_matrices(rig)
    with bpy.data.libraries.load(str(grip.MASTER),link=False) as (available,loaded):loaded.meshes=available.meshes
    master=bpy.data.objects.new('GeneratedGripMaster',loaded.meshes[0]);bpy.context.collection.objects.link(master);sculpt=grip.sculpt_source(master)
    bodies=[o for o in bpy.data.objects if o.type=='MESH' and 'OriginalBody' in o.name]
    fragments={o.name:remove_wrist_fragments(o,canonical) for o in bodies}
    bodyprints={o.name:mesh_fingerprint(o) for o in bodies}
    result=[]
    for lod,side in [(lod,side) for lod in (0,1) for side in sides]:
        old=next(o for o in bpy.data.objects if o.type=='MESH' and any(s in o.name for s in ('Gauntlet','AssemblyHand','CommanderClosedGrip')) and o.name.endswith(f'_{side}_LOD{lod}'))
        weapon_name={'worker':'WorkerCraftAxe','priest':'PriestDawnStaff','neutral-raider':'RaiderShortAxe','commander':'CommanderLongsword' if side=='R' else 'CommanderDawnShield','crossbow':'ProceduralCrossbow'}[unit]
        weapon=bpy.data.objects[weapon_name+f'_LOD{lod}']
        names={m.name for m in weapon.data.materials if 'leather' in m.name.lower()}
        center,axis,radius,_,_=g.weapon_region(weapon,names)
        # Existing grip geometry remains in hand bind coordinates. Its new
        # pose follows the corrected wrist; no source weapon shape is replaced.
        center=ref['Hand_'+side]@center;axis=(ref['Hand_'+side].to_3x3()@axis).normalized()
        name=old.name;bpy.data.objects.remove(old,do_unlink=True)
        row={'name':name,'side':side,'lod':lod,'grip':list(center),'axis':list(axis),'radius':radius,
             'wrist':list(ref['Forearm_'+side]@canonical[side]),'wrist_radius':.045,'preserve_weapon_anchor':not a.anatomical_grip,'cuff_radius':.045,'cuff_overlap_m':.04}
        if unit=='crossbow':
            # Current edited two-hand rig, not the old JSON's reference pose.
            # R holds the wooden pistol grip; L holds the leather stock wrap.
            local_center=Vector((.475500,-.019750,.971400) if side=='R' else (-.406185,.048270,.976475))
            local_axis=Vector((0,.228191,.973616) if side=='R' else (.600576,.764843,-.233074))
            row.update(grip=list(ref['Hand_'+side]@local_center),axis=list((ref['Hand_'+side].to_3x3()@local_axis).normalized()),weapon_skin_bone='Hand_R',
                       grip_materials=['AssemblyDetail_oak'] if side=='R' else ['AssemblyDetail_leather'])
        obj=bpy.data.objects.new(name,master.data.copy());bpy.context.collection.objects.link(obj)
        result.append(grip.fit(obj,rig,row,ref,None,weapon))
    bpy.data.objects.remove(master,do_unlink=True)
    for name,digest in bodyprints.items():assert mesh_fingerprint(bpy.data.objects[name])==digest
    g.set_action(rig,'Idle');bpy.context.scene.frame_set(0);bpy.context.preferences.filepaths.save_version=0
    bpy.ops.wm.save_as_mainfile(filepath=str(run/f'raw/{unit}-assembly.blend'))
    for lod in (0,1):g.export_lod(run/'candidate'/(f'{unit}.glb' if lod==0 else f'{unit}-lod1.glb'),rig,[o for o in bpy.data.objects if o.type=='MESH' and o.name.endswith(f'_LOD{lod}')])
    report={'unit':unit,'source':str(a.source),'master':str(grip.MASTER.relative_to(ROOT)),'hands':result,'sculpt':sculpt,'wrist_animation_changes':changes,'removed_isolated_wrist_vertices':fragments,'body_fingerprints_after_local_cleanup':bodyprints,'runtime_publish_allowed':False,'artistic_quality_proven':False}
    (run/f'qa/{unit}-hand-build.json').write_bytes((json.dumps(report,indent=2)+'\n').encode())

if __name__=='__main__':main()
