"""Extract actual original hand skin and the authored crossbow contact surface."""
import bpy,json,hashlib
from pathlib import Path
from mathutils import Vector,Matrix
ROOT=Path(__file__).resolve().parents[3];RUN=ROOT/'art-factory/rts/runs/original-glove-weapon-fit/2026-10-07-v1'
HAND=ROOT/'art-factory/rts/runs/original-glove-joints/2026-10-07-v2/candidate/joint-rig.blend'
WEAPON=ROOT/'art-factory/rts/runs/original-crossbow-weapon/2026-10-06-v1/candidate/original-crossbow-grip.blend'
assert hashlib.sha256(HAND.read_bytes()).hexdigest()=='5871ce5ed506c7e29ae1aa06e7a3d6edf855f11af595ee691d47799f1c30c2e1'
assert hashlib.sha256(WEAPON.read_bytes()).hexdigest()=='0d1889f4a98583fe773dab449b85740874900af3547a111836b5c6fb9453541b'
for name in ['raw','candidate','qa','prompts']:(RUN/name).mkdir(parents=True,exist_ok=True)
bpy.ops.wm.open_mainfile(filepath=str(HAND));rig=bpy.data.objects['OriginalHandRig_L'];obj=bpy.data.objects['OriginalJointGlove_L_LOD0'];rig.data.pose_position='REST';bpy.context.view_layer.update();obj.data.calc_loop_triangles()
assert all(abs(rig.matrix_world[r][c]-float(r==c))<1e-7 for r in range(4) for c in range(4))
hand={'source_sha256':hashlib.sha256(HAND.read_bytes()).hexdigest(),'points':[list(obj.matrix_world@v.co) for v in obj.data.vertices],'faces':[list(f.vertices) for f in obj.data.loop_triangles],'weights':[{obj.vertex_groups[g.group].name:g.weight for g in v.groups} for v in obj.data.vertices],'bones':{b.name:{'head':list(b.head_local),'tail':list(b.tail_local),'axis':list(b.get('original_flexion_axis',[]))} for b in rig.data.bones}}
(RUN/'raw/hand.json').write_text(json.dumps(hand,indent=2)+'\n')
bpy.ops.wm.open_mainfile(filepath=str(WEAPON));obj=bpy.data.objects['CrossbowWeapon_LOD0'];rig=obj.find_armature();rig.data.pose_position='REST';bpy.context.view_layer.update();obj.data.calc_loop_triangles();parts=json.loads(obj['original_weapon_parts'])
points=[obj.matrix_world@v.co for v in obj.data.vertices];part=parts['support_grip'];grip=points[part['vertex_start']:part['vertex_end']];center=sum(grip,Vector())/len(grip);length=max(p.y for p in grip)-min(p.y for p in grip);radii=[((p.x-center.x)**2+(p.z-center.z)**2)**.5 for p in grip]
assert len(grip)==16 and max(radii)-min(radii)<1e-6 and abs(length-.16)<1e-6
# Preserve all authored weapon geometry. This rigid basis maps the source
# support's +Y axis to the original hand's transverse +X direction.
rotation=Matrix(((0,1,0),(-1,0,0),(0,0,1)))
weapon={'source_sha256':hashlib.sha256(WEAPON.read_bytes()).hexdigest(),'object':obj.name,'points_centered_in_hand_basis':[list(rotation@(p-center)) for p in points],'faces':[list(t.vertices) for t in obj.data.loop_triangles],'face_parts':[next(name for name,p in parts.items() if p['polygon_start']<=t.polygon_index<p['polygon_end']) for t in obj.data.loop_triangles],'parts':parts,'support_center_source':list(center),'support_axis_source':[0,1,0],'support_length_m':length,'support_vertex_radii_m':radii,'rotation_rows':[list(row) for row in rotation],'scope':'Original rest weapon geometry only. Original character carry and motion are not approved by this extraction.'}
(RUN/'raw/weapon.json').write_text(json.dumps(weapon,indent=2)+'\n');print(json.dumps({'hand_vertices':len(hand['points']),'weapon_vertices':len(points),'support_length_m':length,'support_radius_minmax':[min(radii),max(radii)],'center':list(center)}))
