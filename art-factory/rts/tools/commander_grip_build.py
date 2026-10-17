"""Author a closed right gauntlet and fit the current sword to its thumb side.

The latest shield, body outside the right-hand trim, bind rig and seven clips
are retained; only Death Hand_R rotation changes. New geometry derives from the original gauntlet authoring
kernel; no downloaded mesh or texture is introduced. Candidate-only output.
"""
import bpy,bmesh,copy,hashlib,json,math,struct,sys
import numpy as np
from pathlib import Path
from mathutils import Vector,Matrix
sys.path.insert(0,str(Path(__file__).parent))
import procedural_gauntlet_build as gauntlet
from procedural_gauntlet_publish import read_glb,write_glb
from commander_grip_pack import compact
from commander_grip_check import ROOT,RUN,SOURCE,contact

def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def save(p,d):p.write_bytes((json.dumps(d,indent=2)+'\n').encode())
def protected():
    rows=[]
    for o in bpy.data.objects:
        if o.type=='MESH' and 'Shield' in o.name:
            rows.append([o.name,[list(v.co) for v in o.data.vertices],[[*p.vertices,p.material_index] for p in o.data.polygons],[[list(v.uv) for v in l.data] for l in o.data.uv_layers],[[[g.group,g.weight] for g in v.groups] for v in o.data.vertices]])
        if o.type=='ARMATURE':rows.append([o.name,[[b.name,[list(r) for r in b.matrix_local]] for b in o.data.bones]])
    for a in bpy.data.actions:
        rows.append([a.name,[[c.data_path,c.array_index,[[*p.co,*p.handle_left,*p.handle_right,p.interpolation] for p in c.keyframe_points]] for layer in a.layers for strip in layer.strips for slot in a.slots for bag in [strip.channelbag(slot)] if bag for c in bag.fcurves]])
    return hashlib.sha256(json.dumps(rows).encode()).hexdigest()

def trim(body):
    groups={body.vertex_groups[n].index for n in ('Hand_R','Forearm_R')}
    weights=[sum(g.weight for g in v.groups if g.group in groups) for v in body.data.vertices]
    bm=bmesh.new();bm.from_mesh(body.data);bm.verts.ensure_lookup_table()
    old_boundary={e for e in bm.edges if e.is_boundary}
    doomed=[f for f in bm.faces if (c:=f.calc_center_median()).z<1.10 and c.x>.33 and c.y>.04 and sum(weights[v.index] for v in f.verts)/len(f.verts)>.5]
    assert 80<len(doomed)<700,len(doomed)
    bmesh.ops.delete(bm,geom=doomed,context='FACES');bmesh.ops.delete(bm,geom=[v for v in bm.verts if not v.link_faces],context='VERTS')
    boundary=[v.co.copy() for v in {v for e in bm.edges if e.is_boundary and e not in old_boundary for v in e.verts}]
    assert len(boundary)>5
    center=sum(boundary,Vector())/len(boundary)
    radius=max((v-center).length for v in boundary)
    bm.to_mesh(body.data);bm.free();body.data.update()
    return dict(removed_faces=len(doomed),wrist_center=list(center),boundary_count=len(boundary),boundary_radius=radius)

def fit_death(rig,axis):
    """Lay the blade outwards as the body falls, with its plane facing the ground.

    Author only Death/Hand_R rotation. All other curves remain byte-equivalent.
    """
    action=bpy.data.actions['Death'];gauntlet.set_action(rig,'Death');hand=rig.pose.bones['Hand_R']
    start,end=map(int,action.frame_range);poses={}
    for frame in range(start,end+1):
        bpy.context.scene.frame_set(frame);poses[frame]=hand.matrix.copy()
    bind_basis=Matrix((Vector((1,0,0)),axis.cross(Vector((1,0,0))),axis)).transposed()
    blade=Vector((1,0,.13)).normalized();cross=Vector((0,1,0));world_basis=Matrix((cross,blade.cross(cross),blade)).transposed()
    desired=(world_basis@bind_basis.inverted()@hand.bone.matrix_local.to_3x3()).to_quaternion()
    for frame,m in poses.items():
        bpy.context.scene.frame_set(frame);t=(frame-start)/(end-start);blend=gauntlet.smooth((t-.12)/.42)
        q=m.to_quaternion().slerp(desired,blend);new=q.to_matrix().to_4x4();new.translation=m.translation
        hand.matrix=new;hand.keyframe_insert(data_path='rotation_quaternion',frame=frame,group='Hand_R')
    for layer in action.layers:
        for strip in layer.strips:
            for slot in action.slots:
                bag=strip.channelbag(slot)
                if bag:
                    for c in bag.fcurves:
                        if c.data_path=='pose.bones["Hand_R"].rotation_quaternion':
                            for p in c.keyframe_points:p.interpolation='LINEAR'
    gauntlet.set_action(rig,'Idle');bpy.context.scene.frame_set(0)

def package(base_path,exported,target,lod,bounds):
    doc,binary=read_glb(base_path);new,added=read_glb(exported);raw=bytearray(binary)
    reference=next(n for n in doc['nodes'] if n.get('name')==f'CommanderLongsword_LOD{lod}')
    exported_reference=next(n for n in new['nodes'] if n.get('name')==f'CommanderLongsword_LOD{lod}')
    old_joints=[doc['nodes'][i]['name'] for i in doc['skins'][reference['skin']]['joints']]
    new_joints=[new['nodes'][i]['name'] for i in new['skins'][exported_reference['skin']]['joints']]
    accessor_map={};view_map={}
    def accessor(index,joints=False):
        if index in accessor_map:return accessor_map[index]
        src=copy.deepcopy(new['accessors'][index]);vi=src['bufferView']
        if vi not in view_map:
            view=copy.deepcopy(new['bufferViews'][vi]);start=view.get('byteOffset',0);data=bytearray(added[start:start+view['byteLength']])
            if joints:
                fmt={5121:'B',5123:'H'}[src['componentType']];size=struct.calcsize(fmt);stride=view.get('byteStride',size*4)
                for row in range(src['count']):
                    for col in range(4):
                        off=src.get('byteOffset',0)+row*stride+col*size;value=struct.unpack_from('<'+fmt,data,off)[0]
                        struct.pack_into('<'+fmt,data,off,old_joints.index(new_joints[value]))
            raw.extend(b'\0'*((-len(raw))%4));view.update(buffer=0,byteOffset=len(raw));raw.extend(data)
            view_map[vi]=len(doc['bufferViews']);doc['bufferViews'].append(view)
        src['bufferView']=view_map[vi];accessor_map[index]=len(doc['accessors']);doc['accessors'].append(src);return accessor_map[index]
    for name in (f'commanderOriginalBody_LOD{lod}',f'CommanderLongsword_LOD{lod}',f'CommanderClosedGrip_R_LOD{lod}'):
        source_node=next(n for n in new['nodes'] if n.get('name')==name);mesh=copy.deepcopy(new['meshes'][source_node['mesh']]);mesh['name']=name+'Mesh'
        for prim in mesh['primitives']:
            prim['attributes']={k:accessor(v,k.startswith('JOINTS')) for k,v in prim['attributes'].items()};prim['indices']=accessor(prim['indices'])
            mat=new['materials'][prim['material']]['name'];prim['material']=next(i for i,m in enumerate(doc['materials']) if m['name']==mat)
        node=next((n for n in doc['nodes'] if n.get('name')==name),None)
        if node is None:
            node={'name':name,'mesh':len(doc['meshes']),'skin':reference['skin']};doc['meshes'].append(mesh)
            parent=next(n for n in doc['nodes'] if doc['nodes'].index(reference) in n.get('children',[]));parent['children'].append(len(doc['nodes']));doc['nodes'].append(node)
        else:doc['meshes'][node['mesh']]=mesh
        if name in bounds:node.setdefault('extras',{})['rtsConservativeBounds']=bounds[name]
    # Only Death's Hand_R rotation is replaced; reuse every other clip/channel.
    animation=next(a for a in doc['animations'] if a['name']=='Death');new_animation=next(a for a in new['animations'] if a['name']=='Death')
    new_channel=next(c for c in new_animation['channels'] if new['nodes'][c['target']['node']]['name']=='Hand_R' and c['target']['path']=='rotation')
    old_channel=next(c for c in animation['channels'] if doc['nodes'][c['target']['node']]['name']=='Hand_R' and c['target']['path']=='rotation')
    sampler=copy.deepcopy(new_animation['samplers'][new_channel['sampler']]);sampler['input']=accessor(sampler['input']);sampler['output']=accessor(sampler['output'])
    old_channel['sampler']=len(animation['samplers']);animation['samplers'].append(sampler)
    doc['buffers'][0]['byteLength']=len(raw)
    old,oldbin=read_glb(base_path)
    for key in ('skins','materials','images','textures','samplers'):assert doc.get(key)==old.get(key),key
    assert [a for a in doc['animations'] if a['name']!='Death']==[a for a in old['animations'] if a['name']!='Death']
    old_death=next(a for a in old['animations'] if a['name']=='Death')
    assert len(animation['channels'])==len(old_death['channels'])
    assert sum(a!=b for a,b in zip(animation['channels'],old_death['channels']))==1
    shield=next(n for n in old['nodes'] if n.get('name')==f'CommanderDawnShield_LOD{lod}')
    assert doc['meshes'][shield['mesh']]==old['meshes'][shield['mesh']]
    assert bytes(raw[:len(oldbin)])==oldbin
    packed,packing=compact(doc,bytes(raw));write_glb(target,doc,packed)
    return dict(path=target.relative_to(ROOT).as_posix(),sha256=sha(target),bytes=target.stat().st_size,lossless_pack=packing,protected_glb='shield, seven clips, other Death channels, skin and materials preserved; lossless removal of unused buffers')

def main():
    for directory in ('raw/before','candidate','qa'):(RUN/directory).mkdir(parents=True,exist_ok=True)
    existing=json.loads((RUN/'source-lock.json').read_bytes()) if (RUN/'source-lock.json').exists() else None
    if existing:
        assert existing['source']==SOURCE.relative_to(ROOT).as_posix() and sha(SOURCE)==existing['sha256']
    else:
        registry=json.loads((ROOT/'art-factory/rts/manifests/unit-registry.json').read_text())
        rec=next(r for r in registry['assets'] if r['id']=='commander');assert sha(SOURCE)==rec['source_sha256']
    lock={'source':SOURCE.relative_to(ROOT).as_posix(),'sha256':sha(SOURCE),'runtime':[]}
    for lod in (0,1):
        p=ROOT/f'public/assets/games/rts/models/commander{"-lod1" if lod else ""}.glb';backup=RUN/f'raw/before/commander-lod{lod}.glb'
        if backup.exists():assert existing and sha(backup)==existing['runtime'][lod]['sha256']
        else:backup.write_bytes(p.read_bytes())
        lock['runtime'].append(dict(path=p.relative_to(ROOT).as_posix(),sha256=sha(backup)))
    save(RUN/'source-lock.json',lock)
    bpy.ops.wm.open_mainfile(filepath=str(SOURCE));rig=next(o for o in bpy.data.objects if o.type=='ARMATURE');gauntlet.set_action(rig,'Idle');bpy.context.scene.frame_set(0)
    before=protected();ref=gauntlet.skin_matrices(rig);rows=[];meshes=[];wrist=None
    for lod in (0,1):
        body=bpy.data.objects[f'commanderOriginalBody_LOD{lod}'];cut=trim(body)
        if wrist is None:wrist=Vector(cut['wrist_center']);wrist_radius=max(.035,min(.057,cut['boundary_radius']))
        distal=Vector((.15,.20,-1)).normalized();center=wrist+distal*.087+Vector((0,.026,0));axis=Vector((0,.94,.342)).normalized()
        sword=bpy.data.objects[f'CommanderLongsword_LOD{lod}'];ids={i for p in sword.data.polygons if sword.data.materials[p.material_index].name=='WornLeatherGrip' for i in p.vertices}
        pivot=Vector([(min(sword.data.vertices[i].co[a] for i in ids)+max(sword.data.vertices[i].co[a] for i in ids))/2 for a in range(3)])
        rotation=Vector((0,0,-1)).rotation_difference(axis)
        for v in sword.data.vertices:v.co=center+rotation@(v.co-pivot)
        sword.data.update()
        mats={n:bpy.data.materials[n] for n in ('WornLeatherGrip','ForgedToolSteel','OldBrassFittings')}
        obj,record=gauntlet.build_gauntlet(f'CommanderClosedGrip_R_LOD{lod}',rig,'R',ref['Hand_R']@center,(ref['Hand_R'].to_3x3()@axis).normalized(),.021,ref['Forearm_R']@wrist,(ref['Forearm_R'].to_3x3()@distal).normalized(),wrist_radius,Vector((1,0,0)),mats,'WornLeatherGrip','ForgedToolSteel','ForgedToolSteel',lod,ref,flare=1.06,cuff_len=.042,scale=.94)
        obj.hide_render=bool(lod);record.update(cut=cut,pivot_before=list(pivot),grip_center_bind=list(center),blade_axis_bind=list(axis));rows.append(record);meshes.extend([body,sword,obj])
    assert protected()==before,'Shield, rig or actions changed before intentional Death wrist revision'
    fit_death(rig,axis)
    gauntlet.CLIPS=tuple(a.name for a in bpy.data.actions);bounds=gauntlet.conservative_bounds(meshes,rig)
    for o in meshes:o['rtsConservativeBounds']=bounds[o.name]
    bpy.ops.wm.save_as_mainfile(filepath=str(RUN/'raw/commander-grip.blend'))
    candidates=[]
    for lod in (0,1):
        bpy.ops.object.select_all(action='DESELECT');objects=[o for o in meshes if o.name.endswith(f'LOD{lod}')]
        for o in (rig,*objects):o.hide_set(False);o.select_set(True)
        bpy.context.view_layer.objects.active=rig;exported=RUN/f'raw/modified-lod{lod}.glb'
        bpy.ops.export_scene.gltf(filepath=str(exported),export_format='GLB',use_selection=True,export_animations=True,export_animation_mode='ACTIONS',export_nla_strips=False,export_force_sampling=True,export_optimize_animation_size=False,export_skins=True,export_extras=True,export_yup=True)
        candidates.append(package(RUN/f'raw/before/commander-lod{lod}.glb',exported,RUN/f'candidate/commander-lod{lod}.glb',lod,bounds))
    save(RUN/'qa/build.json',dict(status='candidate',runtime_publish_allowed=False,hands=rows,protected_before=before,protected_after=protected(),bounds=bounds,candidates=candidates))
    print('GRIP_BUILD',json.dumps(dict(hands=rows,candidates=candidates)))
if __name__=='__main__':main()
