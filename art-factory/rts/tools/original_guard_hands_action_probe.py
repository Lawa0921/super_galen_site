import bpy,json
from pathlib import Path
R=Path(__file__).resolve().parents[3]
p=R/'art-factory/rts/runs/original-guard-hands/2026-10-05/candidate/original-guard-hands-base.blend'
bpy.ops.wm.open_mainfile(filepath=str(p))
rows={'actions':[],'objects':{}}
for name in ('KingdomSteelSword_LOD0','KingdomSunShield_LOD0'):
 o=bpy.data.objects.get(name)
 rows['objects'][name]={'parent':o.parent.name if o.parent else None,'parent_type':o.parent_type,'parent_bone':o.parent_bone,
   'matrix':[[round(float(x),6) for x in r] for r in o.matrix_world],
   'animation':bool(o.animation_data and o.animation_data.action),
   'constraints':[c.type for c in o.constraints]}
arm=bpy.data.objects.get('GuardRig20')
for a in bpy.data.actions:
 rows['actions'].append({'name':a.name,'frame_range':[float(a.frame_range[0]),float(a.frame_range[1])],
   'legacy_curve_count':len(getattr(a,'fcurves',[])),'layers':len(getattr(a,'layers',[]))})
out=R/'art-factory/rts/runs/original-guard-hands/2026-10-05/qa/action-probe.json'
out.write_text(json.dumps(rows,indent=2)+'\n',encoding='utf-8',newline='\n')
print(json.dumps(rows),flush=True)
