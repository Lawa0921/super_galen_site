"""Bounded source-only surface repair; never writes runtime or source candidate."""
import bpy,bmesh,sys,json,hashlib,math,shutil,struct
from pathlib import Path
from mathutils import Vector
sys.dont_write_bytecode=True
sys.path.insert(0,str(Path(__file__).resolve().parent))
from original_guard_walk_refine import action_fcurves
from original_guard_assembly_build import setup_camera,attach_mesh_to_rig
from original_guard_walk_refine_build import export_lod
from original_guard_walk_refine_glb import transplant_walk
ROOT=Path(__file__).resolve().parents[3]
RUN=ROOT/'art-factory/rts/runs/original-guard-assembly/continuation-20261006-2/surface'
SOURCE=ROOT/'art-factory/rts/runs/original-guard-assembly/revision-20261006/candidate/original-guard-assembly.blend'
for d in ('candidate','qa','qa/before','qa/after'):(RUN/d).mkdir(parents=True,exist_ok=True)
sha=lambda p:hashlib.sha256(Path(p).read_bytes()).hexdigest()
def signature():
 out={}
 for a in bpy.data.actions:
  rows=[]
  for f in action_fcurves(a):
   rows.append([f.data_path,f.array_index,f.extrapolation,[[*k.co,*k.handle_left,*k.handle_right,k.interpolation,k.handle_left_type,k.handle_right_type,k.easing] for k in f.keyframe_points]])
  out[a.name]=hashlib.sha256(json.dumps(rows,sort_keys=True).encode()).hexdigest()
 return out
def tri(o):return sum(len(p.vertices)-2 for p in o.data.polygons)
def topology(o):
 bm=bmesh.new();bm.from_mesh(o.data);r={'triangles':tri(o),'vertices':len(bm.verts),'boundary_edges':sum(e.is_boundary for e in bm.edges),'nonmanifold_edges':sum(not e.is_manifold for e in bm.edges)};bm.free();return r
def budget(o,target):
 count=tri(o)
 if count<=target:return
 bpy.context.view_layer.objects.active=o
 m=o.modifiers.new('ControlledComponentBudget','DECIMATE');m.ratio=target/count;m.use_collapse_triangulate=True
 bpy.ops.object.modifier_move_up(modifier=m.name)
 bpy.ops.object.modifier_apply(modifier=m.name)
def loft(name,levels,bone,segments=32):
 verts=[];faces=[]
 # Closed hollow shell: outer and inner rings, with bridged top/bottom rims.
 for inset in (0,.006):
  for z,rx,ry in levels:
   for j in range(segments):
    t=2*math.pi*j/segments
    x=(rx-inset)*math.sin(t);y=(ry-inset)*math.cos(t)
    # Broad plate facets follow the established breast/back silhouette.
    verts.append((x,y,z))
 n=len(levels)*segments
 for layer in range(2):
  for k in range(len(levels)-1):
   for j in range(segments):
    a=layer*n+k*segments+j;b=layer*n+k*segments+(j+1)%segments
    q=(a,b,b+segments,a+segments);faces.append(q if not layer else q[::-1])
 for k in (0,len(levels)-1):
  for j in range(segments):
   a=k*segments+j;b=k*segments+(j+1)%segments;faces.append((a,a+n,b+n,b))
 mesh=bpy.data.meshes.new(name+'Mesh');mesh.from_pydata(verts,[],faces);mesh.update()
 o=bpy.data.objects.new(name,mesh);scene.collection.objects.link(o)
 o.data.materials.append(bpy.data.materials['GuardSteel_Surface'])
 uv=mesh.uv_layers.new(name='UVMap')
 for p in mesh.polygons:
  p.use_smooth=True
  for li in p.loop_indices:
   v=mesh.vertices[mesh.loops[li].vertex_index].co;uv.data[li].uv=(v.x*2+.5,v.z*2)
 o.vertex_groups.new(name=bone).add(list(range(len(verts))),1,'REPLACE')
 attach_mesh_to_rig(o,rig)
 bm=bmesh.new();bm.from_mesh(mesh);bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));bm.to_mesh(mesh);bm.free()
 return o
def tasset(side,lod):
 sign=-1 if side=='L' else 1
 # Three short articulated side plates end above thigh armor and lifted knee.
 verts=[];faces=[]
 for row in range(3):
  z=.965-row*.070
  for dz,rx,ry in ((0,.221+row*.012,.142+row*.010),(-.085,.244+row*.012,.155+row*.010)):
   for j in range(9):
    theta=math.radians(37+j*13.25)
    verts.append((sign*rx*math.sin(theta),ry*math.cos(theta),z+dz))
  base=row*18
  for j in range(8):faces.append((base+j,base+j+1,base+j+10,base+j+9))
 mesh=bpy.data.meshes.new('ArticulatedTasset');mesh.from_pydata(verts,[],faces);mesh.update()
 o=bpy.data.objects.new('GuardTasset_'+side+'_LOD'+str(lod),mesh);scene.collection.objects.link(o)
 mesh.materials.append(bpy.data.materials['GuardSteel_Surface']);uv=mesh.uv_layers.new(name='UVMap')
 for p in mesh.polygons:
  p.use_smooth=True
  for li in p.loop_indices:
   co=mesh.vertices[mesh.loops[li].vertex_index].co;uv.data[li].uv=(co.x*3,co.z*3)
 # Entire short tasset follows pelvis. Lower edge is above thigh top and never reaches knee.
 o.vertex_groups.new(name='Pelvis').add(list(range(len(verts))),1,'REPLACE')
 bpy.context.view_layer.objects.active=o;m=o.modifiers.new('ClosedPlateEdges','SOLIDIFY');m.thickness=.006;m.offset=0;bpy.ops.object.modifier_apply(modifier=m.name)
 attach_mesh_to_rig(o,rig);return o
bpy.ops.wm.open_mainfile(filepath=str(SOURCE));rig=bpy.data.objects['GuardRig20'];scene=bpy.context.scene
report={'status':'candidate','runtime_publish_allowed':False,'visual_approval':False,'source':{'path':str(SOURCE),'sha256':sha(SOURCE)},'action_signatures_before':signature()}
report['before']={o.name:topology(o) for o in bpy.data.objects if o.type=='MESH' and o.name.endswith(('LOD0','LOD1'))}
for label in ('front','back','attack','walk'):shutil.copy2(SOURCE.parent.parent/'qa'/f'{label}.png',RUN/'qa/before'/f'{label}.png')
report['baseline_tests']={'lod0_under_20000':sum(v['triangles'] for k,v in report['before'].items() if k.endswith('LOD0'))<20000,'body_closed':report['before']['GuardBody_LOD0']['boundary_edges']==0}
assert not report['baseline_tests']['lod0_under_20000'] and not report['baseline_tests']['body_closed']
for lod in (0,1):
 bpy.data.objects.remove(bpy.data.objects[f'GuardBody_LOD{lod}'],do_unlink=True)
 loft(f'GuardBody_LOD{lod}',[(1.085,.184,.130),(1.14,.210,.146),(1.25,.238,.159),(1.36,.232,.149),(1.425,.200,.125),(1.490,.148,.106)],'SpineUpper',32 if lod==0 else 16)
 loft(f'GuardFauld_LOD{lod}',[(.910,.215,.142),(.99,.195,.134),(1.065,.178,.124),(1.115,.188,.132)],'SpineLower',32 if lod==0 else 16)
 for side in ('L','R'):tasset(side,lod)
 # Close the original leg liner's empty upper pelvis zone with a padded underlayer.
 o=loft(f'GuardHipLiner_LOD{lod}',[(.710,.225,.125),(.81,.226,.126),(.94,.203,.120)],'Pelvis',24 if lod==0 else 12)
 o.data.materials.clear();o.data.materials.append(bpy.data.materials['TeamCloth.001'])
for o in list(bpy.data.objects):
 if o.type!='MESH' or not o.name.endswith(('LOD0','LOD1')):continue
 lod=int(o.name[-1]);target=None
 if o.name.startswith('GuardBoot'):target=(400,200)[lod]
 elif o.name.startswith('GuardArms'):target=(2900,1100)[lod]
 elif o.name.startswith('HelmetAssembly'):target=(2500,2258)[lod]
 elif o.name.startswith('GuardLegArmor'):target=(300,120)[lod]
 elif o.name.startswith('GuardPaddedLeg'):target=(800,450)[lod]
 elif o.name.startswith('Tabard_'):target=None
 elif lod==1 and o.name.startswith('GuardHandGrip'):target=850
 elif lod==1 and o.name.startswith('KingdomSteelSword'):target=400
 elif lod==1 and o.name.startswith('KingdomSunShield'):target=700
 if target:budget(o,target)
report['after']={o.name:topology(o) for o in bpy.data.objects if o.type=='MESH' and o.name.endswith(('LOD0','LOD1'))}
report['totals']={str(l):sum(v['triangles'] for k,v in report['after'].items() if k.endswith('LOD'+str(l))) for l in (0,1)}
assert report['totals']['0']<20000,report['totals']
assert 7000<=report['totals']['1']<=10000,report['totals']
for name,row in report['after'].items():
 if name.startswith(('GuardBody','GuardFauld','GuardTasset','GuardHipLiner')):assert row['boundary_edges']==0,(name,row)
report['action_signatures_after']=signature();assert report['action_signatures_before']==report['action_signatures_after']
(RUN/'qa/build.json').write_text(json.dumps(report,indent=2))
rig.animation_data.action=bpy.data.actions['Idle'];scene.frame_set(0)
for o in bpy.data.objects:
 if o.type=='MESH':o.hide_render=not o.name.endswith('LOD0');o.hide_set(False)
blend=RUN/'candidate/original-guard-assembly.blend';bpy.ops.wm.save_as_mainfile(filepath=str(blend))
report['blend']={'path':str(blend),'sha256':sha(blend)}
report['exports']=[]
# Export-only retiming yields dense evaluated original motion without editing saved curves.
for action in bpy.data.actions:
 for fc in action_fcurves(action):
  for k in fc.keyframe_points:
   k.co.x*=8;k.handle_left.x*=8;k.handle_right.x*=8
scene.render.fps=240;scene.frame_end*=8
for lod in (0,1):
 standard=export_lod(RUN,rig,lod,True)
 standard['sha256']=sha(standard['path']);report['exports'].append(standard)
for action in bpy.data.actions:
 for fc in action_fcurves(action):
  for k in fc.keyframe_points:
   k.co.x/=8;k.handle_left.x/=8;k.handle_right.x/=8
scene.render.fps=30;scene.frame_end//=8
report['export_sampling_hz']=240
report['action_signatures_after_export']=signature();assert report['action_signatures_before']==report['action_signatures_after_export']
(RUN/'qa/build.json').write_text(json.dumps(report,indent=2))
for lod in (0,1):
 for o in bpy.data.objects:
  if o.type=='MESH':o.hide_render=not o.name.endswith('LOD'+str(lod))
 for clip,frame,view,label in [('Idle',0,'front','front'),('Idle',0,'back','back'),('Attack',16,'threequarter','attack'),('Walk',6,'front','walk'),('Hurt',7.5,'threequarter','hurt'),('Death',28.5,'threequarter','death')]:
  rig.animation_data.action=bpy.data.actions[clip];scene.frame_set(int(frame),subframe=frame%1);setup_camera(view,Vector((0,0,.92)),RUN)
  scene.render.resolution_x=480;scene.render.resolution_y=540
  scene.render.filepath=str(RUN/'qa/after'/f'lod{lod}-{label}.png');bpy.ops.render.render(write_still=True)
print('SURFACE_READY',json.dumps({'totals':report['totals'],'blend':report['blend'],'qa':str(RUN/'qa/build.json')}))
