import bpy,sys,json
from pathlib import Path
sys.path.insert(0,str(Path(__file__).parent))
from all_models_units import source
import procedural_gauntlet_build as g
unit=sys.argv[sys.argv.index('--')+1];bpy.ops.wm.open_mainfile(filepath=str(source(unit)));rig=next(o for o in bpy.data.objects if o.type=='ARMATURE')
for clip in ['Idle','Death']:
 g.set_action(rig,clip);a=bpy.data.actions[clip]
 for f in [a.frame_range[0],a.frame_range[1]]:
  bpy.context.scene.frame_set(int(f));print('POSE',clip,f,json.dumps({n:{'head':list(rig.pose.bones[n].head),'tail':list(rig.pose.bones[n].tail),'matrix':[list(r)for r in rig.pose.bones[n].matrix]}for n in ['Head','UpperArm_R','UpperArm_L','Hand_R','Hand_L']}))
