import bpy,json,sys,math
from pathlib import Path
from mathutils import Matrix,Vector
sys.path.insert(0,str(Path(__file__).parent))
import procedural_gauntlet_build as g
from all_models_units import RUN
from commander_assembly_collision import evaluated,exact_pairs
bpy.ops.wm.open_mainfile(filepath=str(RUN/'raw/guard-assembly.blend'));rig=next(o for o in bpy.data.objects if o.type=='ARMATURE');build=json.loads((RUN/'qa/guard-build.json').read_bytes());wrist=Vector(build['hands'][2]['cut']['wrist']);g.set_action(rig,'Death')
rows=[]
for angle in range(-180,181,5):
 bpy.context.scene.frame_set(48);b=rig.pose.bones['Hand_L'];fore=rig.pose.bones['Forearm_L'];m=(Matrix.Rotation(math.radians(angle),3,'X')@b.bone.matrix_local.to_3x3()).to_4x4();m.translation=(fore.matrix@fore.bone.matrix_local.inverted())@wrist-m.to_3x3()@(b.bone.matrix_local.inverted()@wrist);b.matrix=m;bpy.context.view_layer.update()
 checks=[]
 for lod in (0,1):
  bp,bf,bt=evaluated(bpy.data.objects[f'GuardBody_LOD{lod}']);wp,wf,wt=evaluated(bpy.data.objects[f'KingdomSunShield_LOD{lod}']);checks.append({'lod':lod,'floor':float(wp[:,2].min()),'hits':len(exact_pairs(bp[bf],wp[wf],bt.overlap(wt)))})
 rows.append({'angle':angle,'checks':checks})
print(json.dumps(rows));(RUN/'qa/guard-shield-angle-probe.json').write_bytes((json.dumps(rows,indent=2)+'\n').encode())
