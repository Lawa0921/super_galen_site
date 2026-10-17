"""Derive the low-detail shield glove from its proven closed source surface."""
import argparse,json,sys
from pathlib import Path
import bpy
sys.path.insert(0,str(Path(__file__).parent))
import procedural_gauntlet_build as g
from visual_hand_rework import mesh_fingerprint
from visual_hand_rework_test import inspect_glove

def main():
    p=argparse.ArgumentParser();p.add_argument('--source',type=Path,required=True);p.add_argument('--run',type=Path,required=True)
    a=p.parse_args(sys.argv[sys.argv.index('--')+1:]);run=a.run.resolve()
    for part in ('raw','candidate','qa'):(run/part).mkdir(parents=True,exist_ok=True)
    bpy.ops.wm.open_mainfile(filepath=str(a.source.resolve()));rig=next(o for o in bpy.data.objects if o.type=='ARMATURE')
    low=bpy.data.objects['CommanderClosedGrip_L_LOD1'];high=bpy.data.objects['CommanderClosedGrip_L_LOD0']
    objects=[o for o in bpy.data.objects if o.type=='MESH'];unchanged={o.name:mesh_fingerprint(o) for o in objects if o!=low}
    before=inspect_glove(low);assert inspect_glove(high)['non_manifold_leather_edges']==0
    low.data=high.data.copy();low.modifiers.clear()
    # Both LODs use the same anatomical wrist. Preserve the generated hand,
    # its baked UVs and the physical handle tunnel while simplifying it.
    bpy.ops.object.select_all(action='DESELECT');low.select_set(True);bpy.context.view_layer.objects.active=low
    mod=low.modifiers.new('Closed source LOD reduction','DECIMATE');mod.ratio=1000/g.tri_count(high)
    bpy.ops.object.modifier_apply(modifier=mod.name)
    low.vertex_groups.clear();low.vertex_groups.new(name='Hand_L').add(list(range(len(low.data.vertices))),1,'REPLACE')
    mod=low.modifiers.new('Skin','ARMATURE');mod.object=rig
    after=inspect_glove(low);assert len(after['leather_components'])==1 and after['non_manifold_leather_edges']==0 and after['unweighted_vertices']==0,after
    for o in objects:
        if o!=low:assert mesh_fingerprint(o)==unchanged[o.name],('Unrelated source mesh changed',o.name)
    g.set_action(rig,'Idle');bpy.context.scene.frame_set(0);bpy.context.preferences.filepaths.save_version=0
    bpy.ops.wm.save_as_mainfile(filepath=str(run/'raw/commander-assembly.blend'))
    for lod in (0,1):g.export_lod(run/'candidate'/('commander.glb' if lod==0 else 'commander-lod1.glb'),rig,[o for o in objects if o.name.endswith(f'_LOD{lod}')])
    (run/'qa/commander-grip-lod-build.json').write_text(json.dumps({'source':str(a.source),'source_hand':high.name,'before':before,'after':after,'unchanged_mesh_fingerprints':unchanged,'runtime_publish_allowed':False},indent=2)+'\n')

if __name__=='__main__':main()
