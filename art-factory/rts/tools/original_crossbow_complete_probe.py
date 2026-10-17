"""Read original character bind, textures and mechanism before whole-character work."""
import bpy, json, hashlib
from pathlib import Path
ROOT=Path(__file__).resolve().parents[3]
RUN=ROOT/'art-factory/rts/runs/original-crossbow-complete/2026-10-07-v1'
SOURCE=ROOT/'art-factory/rts/runs/original-crossbow-cuff-motion/2026-10-07-v1/candidate/cuff-bands.blend'
for folder in ['raw','candidate','qa','prompts']:(RUN/folder).mkdir(parents=True,exist_ok=True)
assert hashlib.sha256(SOURCE.read_bytes()).hexdigest()=='22d240db03bca444d83d0cc7e8244e4686f68063eefa651febd420377ff2adf4'
bpy.ops.wm.open_mainfile(filepath=str(SOURCE));rig=bpy.data.objects['crossbowRig20']
rig.animation_data.action=bpy.data.actions['Idle'];rig.animation_data.action_slot=bpy.data.actions['Idle'].slots[0]
bpy.context.scene.frame_set(0);bpy.context.view_layer.update()
def matrix(m):return [list(r) for r in m]
objects=[]
for o in bpy.data.objects:
    if o.type!='MESH':continue
    mats=[]
    for m in o.data.materials:
        mats.append({'name':m.name,'images':[{'name':n.image.name,'path':n.image.filepath,'size':list(n.image.size)} for n in m.node_tree.nodes if n.type=='TEX_IMAGE' and n.image] if m.use_nodes else []})
    objects.append({'name':o.name,'vertices':len(o.data.vertices),'triangles':sum(len(p.vertices)-2 for p in o.data.polygons),'materials':mats,'uvs':[u.name for u in o.data.uv_layers],'attributes':[a.name for a in o.data.attributes],'groups':[g.name for g in o.vertex_groups],'parts':json.loads(o.get('original_weapon_parts','{}'))})
result={'source':str(SOURCE.relative_to(ROOT)),'sha256':hashlib.sha256(SOURCE.read_bytes()).hexdigest(),'objects':objects,'fps':bpy.context.scene.render.fps,'actions':{a.name:list(a.frame_range) for a in bpy.data.actions},'bones':{b.name:{'bind':matrix(b.matrix_local),'pose':matrix(rig.pose.bones[b.name].matrix),'length':b.length,'parent':b.parent.name if b.parent else None} for b in rig.data.bones}}
(RUN/'raw/source-probe.json').write_text(json.dumps(result,indent=2)+'\n')
print('SOURCE_PROBE',json.dumps({'objects':[{k:v for k,v in o.items() if k not in ['groups','parts','attributes']} for o in objects],'actions':result['actions']}))
