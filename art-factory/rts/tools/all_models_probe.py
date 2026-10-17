import bpy,json,sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).parent))
import procedural_gauntlet_build as g
from all_models_units import RUN
def main(unit):
 bpy.ops.wm.open_mainfile(filepath=str(RUN/f'raw/{unit}-assembly.blend'));rig=next(o for o in bpy.data.objects if o.type=='ARMATURE');rows=[];print('MODES',[(b.name,b.rotation_mode)for b in rig.pose.bones])
 for o in bpy.data.objects:
  if o.type=='MESH' and o.name.endswith('LOD0') :print('OBJECT',o.name,list(o.location),list(o.rotation_euler),list(o.scale),[g.name for g in o.vertex_groups],{k:o[k] for k in o.keys() if k!='rtsConservativeBounds'})
 for a in bpy.data.actions:
  g.set_action(rig,a.name);low=100;owner='';frame=0
  for i in range(31):
   f=a.frame_range[0]+(a.frame_range[1]-a.frame_range[0])*i/30;bpy.context.scene.frame_set(int(f),subframe=f%1)
   for o in bpy.data.objects:
    if o.type!='MESH' or not o.name.endswith('LOD0'):continue
    ev=o.evaluated_get(bpy.context.evaluated_depsgraph_get());m=ev.to_mesh();v=min((ev.matrix_world@v.co).z for v in m.vertices);ev.to_mesh_clear()
    if v<low:low=v;owner=o.name;frame=f
  rows.append({'clip':a.name,'floor':low,'owner':owner,'frame':frame})
 print('FLOORS',json.dumps(rows));(RUN/f'qa/{unit}-source-floor.json').write_text(json.dumps(rows,indent=2))
if __name__=='__main__':main(sys.argv[sys.argv.index('--')+1])
