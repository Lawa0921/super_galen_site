"""Reduce closed plate shells in rest space; retain source rig and equipment."""
import argparse,json,sys
from pathlib import Path
import bpy,bmesh
sys.path.insert(0,str(Path(__file__).parent))
import procedural_gauntlet_build as g
from all_models_units import guard_distance_budget
p=argparse.ArgumentParser();p.add_argument('--source',type=Path,required=True);p.add_argument('--run',type=Path,required=True)
a=p.parse_args(sys.argv[sys.argv.index('--')+1:]);run=a.run.resolve()
for folder in ('raw','candidate','qa'):(run/folder).mkdir(parents=True,exist_ok=True)
bpy.ops.wm.open_mainfile(filepath=str(a.source.resolve()));rig=next(o for o in bpy.data.objects if o.type=='ARMATURE');rows=[]
for obj in [o for o in bpy.data.objects if o.name.startswith('GuardRigidPlate_')]:
    before=g.tri_count(obj);lod=int(obj['source_lod']);modifier=obj.modifiers.new('Rest space plate reduction','DECIMATE')
    ratios={('Forearm','L'):.53,('Forearm','R'):.54,('UpperArm','L'):.54,('UpperArm','R'):.50} if lod==0 else {('Forearm','L'):.74,('Forearm','R'):.70,('UpperArm','L'):.90,('UpperArm','R'):.65}
    modifier.ratio=ratios[obj['part'],obj['side']]
    modifier.use_collapse_triangulate=False;obj.modifiers.move(len(obj.modifiers)-1,0);bpy.context.view_layer.objects.active=obj;bpy.ops.object.modifier_apply(modifier=modifier.name)
    bm=bmesh.new();bm.from_mesh(obj.data);bad=sum(not e.is_manifold for e in bm.edges);volume=bm.calc_volume(signed=True);bm.free();assert bad==0 and volume>0
    rows.append({'object':obj.name,'before_triangles':before,'after_triangles':g.tri_count(obj),'nonmanifold_edges':bad,'volume':volume})
objects=[o for o in bpy.data.objects if o.type=='MESH'];budget=guard_distance_budget(objects,target=9990)
body=bpy.data.objects['GuardBody_LOD1'];reduced_weights=[]
for vertex in body.data.vertices:
    weights=sorted([(w.group,w.weight) for w in vertex.groups if w.weight>1e-6],key=lambda row:-row[1])
    if len(weights)<=4:continue
    kept=weights[:4];total=sum(w for _,w in kept)
    for group in body.vertex_groups:group.remove([vertex.index])
    for index,weight in kept:body.vertex_groups[index].add([vertex.index],weight/total,'REPLACE')
    reduced_weights.append({'vertex':vertex.index,'discarded_weight':sum(w for _,w in weights[4:])})
g.set_action(rig,'Idle');bpy.context.scene.frame_set(0);bpy.context.preferences.filepaths.save_version=0
bpy.ops.wm.save_as_mainfile(filepath=str(run/'raw/guard-assembly.blend'))
for lod in (0,1):g.export_lod(run/'candidate'/('guard.glb' if lod==0 else 'guard-lod1.glb'),rig,[o for o in objects if o.name.endswith(f'_LOD{lod}')])
(run/'qa/budget-build.json').write_text(json.dumps({'source':str(a.source),'plates':rows,'body_budget':budget,'four_weight_repair':reduced_weights,'runtime_publish_allowed':False},indent=2)+'\n')
