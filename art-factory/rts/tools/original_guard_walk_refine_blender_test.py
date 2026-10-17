"""Run with Blender --background --python this_file; uses frozen project source."""
import bpy,hashlib,json,sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parent))
try:
    from original_guard_walk_refine import refine_walk
except ImportError:
    refine_walk=None
root=Path(__file__).resolve().parents[3]
run=root/'art-factory/rts/runs/original-guard-walk-refine/2026-10-05'
source=json.loads((run/'source/source.json').read_text())
bpy.ops.wm.open_mainfile(filepath=source['snapshot'])
arm=bpy.data.objects['GuardRig20'];body=bpy.data.objects['GuardBody_LOD0']
assert callable(refine_walk),'Walk-only 3D IK adapter is not implemented'
names={f'{part}_{side}' for part in ['Thigh','Shin','Foot'] for side in ['L','R']}
def unchanged_curves():
    rows={}
    for action in bpy.data.actions:
        for layer in action.layers:
            for strip in layer.strips:
                for bag in strip.channelbags:
                    for fc in bag.fcurves:
                        allowed=action.name=='Walk' and any(fc.data_path==f'pose.bones["{name}"].{prop}' for name in names for prop in ['location','rotation_quaternion'])
                        if not allowed:
                            rows[(action.name,bag.slot_handle,fc.data_path,fc.array_index)]=[
                                (tuple(k.co),tuple(k.handle_left),tuple(k.handle_right),k.interpolation,k.handle_left_type,k.handle_right_type) for k in fc.keyframe_points]
    return rows
before=unchanged_curves()
result=refine_walk(arm,[body],fps=30,sample_hz=120)
assert unchanged_curves()==before,'A protected clip or non-leg Walk curve changed'
assert result['max_ankle_target_error_m']<2e-5,result
assert result['max_link_length_error_m']<2e-5,result
assert result['min_reach_margin_m']>0,result
assert result['max_local_translation_change_m']<2e-5,result
assert result['frame_count']==81,result
print('PASS: Walk-only matrices retain all protected curves, true bone lengths, reachable anchors and 81 subframe keys')
print(json.dumps(result,indent=2))
