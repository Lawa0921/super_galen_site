import bpy,sys,json
from pathlib import Path
from mathutils import Matrix,Vector
sys.path.insert(0,str(Path(__file__).parent))
from original_crossbow_fullbody_build import SOURCE,RUN,ANCHOR_PATH
from original_crossbow_attack_probe import activate
bpy.ops.wm.open_mainfile(filepath=str(SOURCE));rig=bpy.data.objects['crossbowRig20'];activate(rig,'Idle',0)
meta=json.loads(ANCHOR_PATH.read_text());anchor=Matrix(meta['source_bones']['Hand_L']['matrix'])
neutral={b.name:b.matrix.copy() for b in rig.pose.bones}
weapon=neutral['Hand_R']@rig.data.bones['Hand_R'].matrix_local.inverted()
H=weapon.inverted()@neutral['HandPalm_L']@anchor.inverted()
def values(m):return [list(row) for row in m]
r={'H':values(H),'anchor':values(anchor),'weapon':values(weapon),'neutral':{n:values(m) for n,m in neutral.items()},'hand_bones':list(meta['source_bones'])}
(RUN/'qa/layout-input.json').write_text(json.dumps(r,indent=2)+'\n',newline='\n')
print('INPUT',json.dumps({k:r[k] for k in ('H','anchor','weapon','hand_bones')}))
