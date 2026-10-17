"""Original-data preservation and complete surface intersection sampling for the new action."""
import ast,bpy,hashlib,json,math,sys
from pathlib import Path
from mathutils import Vector
from mathutils.bvhtree import BVHTree
from mathutils.geometry import intersect_ray_tri
sys.path.insert(0,str(Path(__file__).parent))
from original_crossbow_attack_probe import RUN,SOURCE,EXPECTED,activate
from original_crossbow_attack_build import EDITED,selected_function

def digest(value):return hashlib.sha256(json.dumps(value,sort_keys=True).encode()).hexdigest()
def curves(action):
    return {f'{c.data_path}:{c.array_index}':[(list(k.co),k.interpolation) for k in c.keyframe_points] for layer in action.layers for strip in layer.strips for slot in action.slots for bag in [strip.channelbag(slot)] if bag for c in bag.fcurves}
def snapshot():
    meshes={o.name:digest({'vertices':[list(v.co) for v in o.data.vertices],'faces':[list(p.vertices) for p in o.data.polygons],'uv':[[list(v.uv) for v in layer.data] for layer in o.data.uv_layers],'weights':[[{o.vertex_groups[g.group].name:g.weight} for g in v.groups] for v in o.data.vertices],'materials':[m.name for m in o.data.materials],'polygons':[(p.material_index,p.use_smooth) for p in o.data.polygons],'matrix':[list(r) for r in o.matrix_world]}) for o in bpy.data.objects if o.type=='MESH'}
    bones={b.name:{'matrix':[list(r) for r in b.matrix_local],'parent':b.parent.name if b.parent else None,'deform':b.use_deform} for b in bpy.data.objects['crossbowRig20'].data.bones}
    used={m.name for o in bpy.data.objects if o.type=='MESH' for m in o.data.materials if m}
    materials={m.name:{'mask_sha256':digest(m.get('teamTintMask')),'images':{n.image.name:hashlib.sha256(n.image.packed_file.data).hexdigest() for n in m.node_tree.nodes if n.type=='TEX_IMAGE' and n.image and n.image.packed_file}} for m in bpy.data.materials if m.use_nodes and m.name in used}
    return {'meshes':meshes,'bones':bones,'materials':materials,'unused_materials':sorted(m.name for m in bpy.data.materials if m.name not in used),'actions':{a.name:curves(a) for a in bpy.data.actions}}
def main():
    candidate=RUN/'candidate/original-crossbow-grip.blend';before_sha=hashlib.sha256(candidate.read_bytes()).hexdigest()
    assert hashlib.sha256(SOURCE.read_bytes()).hexdigest()==EXPECTED
    bpy.ops.wm.open_mainfile(filepath=str(SOURCE));before=snapshot();bpy.ops.wm.open_mainfile(filepath=str(candidate));after=snapshot()
    differences={key:{name:{'before':before[key].get(name),'after':after[key].get(name)} for name in before[key].keys()|after[key].keys() if before[key].get(name)!=after[key].get(name)} for key in ['meshes','bones','materials']}
    (RUN/'qa/preservation-differences.json').write_text(json.dumps(differences,indent=2)+'\n')
    (RUN/'qa/unused-materials.json').write_text(json.dumps({'before':before['unused_materials'],'after':after['unused_materials'],'scope':'Unreferenced material datablocks only; saving Blender removes orphan bake helpers. All mesh-referenced material slots, packed images and team-mask hashes must remain exact.'},indent=2)+'\n')
    for key in ['meshes','bones','materials']:assert before[key]==after[key],key
    assert before['actions'].keys()==after['actions'].keys()
    for action in before['actions']:
        if action!='Attack':assert before['actions'][action]==after['actions'][action],action
        else:
            for name,values in before['actions'][action].items():
                if not any(f'"{bone}"' in name for bone in EDITED):assert values==after['actions'][action][name],name
    scope={'bpy':bpy,'intersect_ray_tri':intersect_ray_tri};evaluated=selected_function('original_crossbow_weapon_contact.py','evaluated',scope);crosses=selected_function('original_crossbow_weapon_contact.py','crosses',scope)
    rig=bpy.data.objects['crossbowRig20'];rows=[];step=2 if '--coarse' in sys.argv else .0625
    for i in range(round(40/step)+1):
        frame=i*step;activate(rig,'Attack',frame);hands={s:evaluated(bpy.data.objects['OriginalCrossbowClosedGrip_'+s]) for s in ['R','L']}
        for lod in [0,1]:
            weapon=bpy.data.objects[f'CrossbowWeapon_LOD{lod}'];wp,wt,polys=evaluated(weapon);wb=BVHTree.FromPolygons(wp,wt,all_triangles=True);parts=json.loads(weapon['original_weapon_parts']);body=bpy.data.objects[f'crossbowOriginalBody_LOD{lod}'];objects={'body':evaluated(body),**hands};hits={};regions={}
            for name,(points,tris,_) in objects.items():
                other=BVHTree.FromPolygons(points,tris,all_triangles=True);by_part={}
                for a,b in wb.overlap(other):
                    if crosses([wp[k] for k in wt[a]],[points[k] for k in tris[b]]):
                        part=next(p for p,v in parts.items() if v['polygon_start']<=polys[a]<v['polygon_end']);by_part[part]=by_part.get(part,0)+1
                        if name=='body':
                            weights={}
                            for index in tris[b]:
                                for g in body.data.vertices[index].groups:
                                    group=body.vertex_groups[g.group].name;weights[group]=weights.get(group,0)+g.weight
                            region=max(weights,key=weights.get);regions[region]=regions.get(region,0)+1
                hits[name]=by_part
            rows.append({'lod':lod,'frame':frame,'crossings':hits,'body_regions':regions,'minimum_weapon_z_m':min(p.z for p in wp)})
    bad=[r for r in rows if any(r['crossings'][n] for n in r['crossings'])]
    report={'source_sha256':EXPECTED,'candidate_sha256':before_sha,'preserved':['all mesh geometry/topology/UV/smooth flags/material assignments/skin/transform','all mesh-referenced packed source material images and team masks','20 bind bones and hierarchy','all non-Attack actions','Attack curves outside explicit 11 upper-body bones'],'step_frames':step,'rows':rows,'intersection_scope':'Actual evaluated noncoplanar triangle crossings for the entire weapon versus body and both gloves. Does not prove whole-body self-intersection or physical string/bolt operation.','pass':not bad,'runtime_publish_allowed':False}
    (RUN/f'qa/contact-{ "coarse" if step==2 else "dense" }.json').write_text(json.dumps(report,indent=2)+'\n');print('ATTACK_VERIFY',json.dumps({'pass':report['pass'],'samples':len(rows),'bad_count':len(bad),'held_failures':[r for r in bad if r['frame']<=20 or r['frame']>=36]}))
    assert hashlib.sha256(candidate.read_bytes()).hexdigest()==before_sha
    assert report['pass'],'Actual weapon surface crossings remain'
if __name__=='__main__':main()
