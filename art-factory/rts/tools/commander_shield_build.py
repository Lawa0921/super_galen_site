"""Refine the published commander's shield; retain body, sword and all eight clips.

Original shaped mesh authoring, derived from the reusable v3 equipment parts.
Only candidate files are written. Published GLB geometry outside the shield is
preserved byte-for-byte by replacing only that mesh's primitive references.
"""
import bpy, hashlib, json, math, struct, sys, copy
from pathlib import Path
from mathutils import Vector
sys.path.insert(0,str(Path(__file__).parent))
from original_crossbow_weapon_build import Author
from commander_equipment_build import add_mesh, finish
from commander_shield_check import ROOT,RUN,SOURCE,protected,geometry
from procedural_gauntlet_publish import read_glb,write_glb

def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()

def shield(lod,rig):
    a=Author();high=lod==0
    cx,cz=-.40373286,1.075062
    outline=[(-.203,.276),(-.171,.314),(0,.320),(.171,.314),(.203,.276),(.194,-.015),(.148,-.163),(.078,-.263),(0,-.320),(-.078,-.263),(-.148,-.163),(-.194,-.015)]
    def bow(x,z):return .258+.035*(1-(x/.215)**2)+.003*(1-(z/.33)**2)
    def point(x,y,z):return (cx+x,y,cz+z)
    rings=[1,.91,.63,.30];n=len(outline);vertices=[]
    for back in (False,True):
        for scale in rings:
            for x,z in outline:
                x*=scale;z*=scale;vertices.append(point(x,bow(x,z)-(.028 if back else 0),z))
        vertices.append(point(0,bow(0,0)-(.028 if back else 0),0))
    side=len(rings)*n+1;faces=[]
    for back in (False,True):
        offset=side if back else 0
        for ring in range(len(rings)-1):
            for i in range(n):
                face=(offset+ring*n+i,offset+ring*n+(i+1)%n,offset+(ring+1)*n+(i+1)%n,offset+(ring+1)*n+i)
                faces.append(tuple(reversed(face)) if back else face)
        for i in range(n):
            face=(offset+(len(rings)-1)*n+i,offset+(len(rings)-1)*n+(i+1)%n,offset+side-1)
            faces.append(tuple(reversed(face)) if back else face)
    for i in range(n):faces.append((i,(i+1)%n,side+(i+1)%n,side+i))
    add_mesh(a,'bowed_shield',vertices,faces,1,.64)
    # The closed back and edge represent the laminated timber core.
    front_faces=(len(rings)-1)*n+n
    for i in range(front_faces,len(a.materials)):a.materials[i]=0
    rim=[point(x,bow(x,z),z) for x,z in outline]
    a.loft('formed_steel_rim',rim,[.009]*n,[.011]*n,(0,1,0),8 if high else 4,2,closed=True,exponent=.72)
    inlay=[point(x*.90,bow(x*.90,z*.90)+.003,z*.90) for x,z in outline]
    a.tube('brass_inlay',inlay,.0028,6 if high else 4,3,hint=(0,1,0),closed=True)
    # Shallow hammered boss and sculpted dawn rays share the chest insignia.
    bz=.045;base=Vector(point(0,bow(0,bz)+.002,bz))
    sections=[(0,.046),(.005,.052),(.012,.046),(.022,.026),(.025,.006)]
    a.loft('dawn_boss',[base+Vector((0,y,0)) for y,r in sections],[r for y,r in sections],[r for y,r in sections],(1,0,0),16 if high else 8,3,exponent=1)
    for i in range(8):
        angle=i*math.tau/8;rad=Vector((math.sin(angle),0,math.cos(angle)));sidevec=Vector((math.cos(angle),0,-math.sin(angle)))
        start=base+rad*.037;end=base+rad*(.12 if i%2==0 else .092)
        verts=[tuple(start-sidevec*.012),tuple(start+sidevec*.012),tuple(end),tuple(start+rad*.023+Vector((0,.009,0)))]
        add_mesh(a,'dawn_ray_'+str(i),verts,[(0,2,1),(0,1,3),(1,2,3),(2,0,3)],3,.2)
    # A fitted rear brace stays inside the existing shield envelope; hand
    # anatomy is explicitly outside this shield-only revision.
    for z in (-.115,.145):
        a.loft('rear_brace_'+str(z),[point(x,bow(x,z)-.033,z) for x in (-.16,-.08,.08,.16)],[.012]*4,[.007]*4,(0,0,1),6 if high else 4,0)
    a.loft('rear_leather_grip',[point(0,.216,z) for z in (-.105,-.083,.099,.122)],[.009,.012,.012,.009],[.010]*4,(1,0,0),8 if high else 6,4)
    for z in (-.107,.124):a.tube('grip_mount_'+str(z),[point(0,.216,z),point(0,bow(0,z)-.025,z)],.009,8 if high else 4,2)
    if high:
        for i,(x,z) in enumerate(outline):
            x*=.93;z*=.93;p=Vector(point(x,bow(x,z)+.007,z))
            a.loft('rim_rivet_'+str(i),[p,p+Vector((0,.003,0))],[.004,.0027],[.004,.0027],(1,0,0),6,3,exponent=1)
    mats=[bpy.data.materials[name] for name in ('WorkedAshWood','TeamCloth_Shield','ForgedToolSteel','OldBrassFittings','WornLeatherGrip')]
    obj=finish(a,f'CommanderDawnShield_LOD{lod}',rig,'Hand_L',mats)
    obj['authorship']='Original contoured commander shield; existing approved materials and source rig. v3 reusable shield construction revised to current envelope.'
    return obj

def replace_shield(base_path,exported,target,lod):
    doc,binary=read_glb(base_path);new,added=read_glb(exported)
    node=next(n for n in doc['nodes'] if n.get('name')==f'CommanderDawnShield_LOD{lod}')
    other=next(n for n in new['nodes'] if n.get('name')==f'CommanderDawnShield_LOD{lod}')
    old_joints=[doc['nodes'][i]['name'] for i in doc['skins'][node['skin']]['joints']]
    new_joints=[new['nodes'][i]['name'] for i in new['skins'][other['skin']]['joints']]
    raw=bytearray(binary);accessor_map={};view_map={}
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
        src['bufferView']=view_map[vi];accessor_map[index]=len(doc['accessors']);doc['accessors'].append(src)
        return accessor_map[index]
    mesh=copy.deepcopy(new['meshes'][other['mesh']]);mesh['name']=f'CommanderDawnShield_Refined_LOD{lod}'
    for prim in mesh['primitives']:
        prim['attributes']={key:accessor(value,key.startswith('JOINTS')) for key,value in prim['attributes'].items()}
        prim['indices']=accessor(prim['indices'])
        name=new['materials'][prim['material']]['name'];prim['material']=next(i for i,m in enumerate(doc['materials']) if m['name']==name)
    doc['meshes'][node['mesh']]=mesh;doc['buffers'][0]['byteLength']=len(raw)
    write_glb(target,doc,bytes(raw))
    # No node, skin, material, animation or non-shield mesh is re-exported.
    original,original_binary=read_glb(base_path)
    assert bytes(raw[:len(original_binary)])==original_binary
    for key in ('nodes','skins','materials','animations','images','textures','samplers'):
        assert doc.get(key)==original.get(key),key
    for i,m in enumerate(original['meshes']):
        if i!=node['mesh']:assert doc['meshes'][i]==m
    return dict(source_sha256=sha(base_path),sha256=sha(target),bytes=target.stat().st_size,protected_glb_data='byte-identical',shield_primitives=len(mesh['primitives']))

def main():
    for name in ('raw/before','candidate','qa'):(RUN/name).mkdir(parents=True,exist_ok=True)
    assert sha(SOURCE)=='bfe946122e6e40dc23f76cb409ba9fa9b4c6549ce5d74668c1de0db0cb0f2566'
    records=[]
    for lod in (0,1):
        path=ROOT/f'public/assets/games/rts/models/commander{"-lod1" if lod else ""}.glb';snapshot=RUN/f'raw/before/commander-lod{lod}.glb'
        if snapshot.exists():assert sha(snapshot)==sha(path),'Runtime changed since snapshot'
        else:snapshot.write_bytes(path.read_bytes())
        records.append(dict(lod=lod,path=str(path.relative_to(ROOT)),sha256=sha(path)))
    (RUN/'source-lock.json').write_text(json.dumps(dict(source=str(SOURCE.relative_to(ROOT)),source_sha256=sha(SOURCE),runtime=records,scope='shield geometry only; no runtime publication'),indent=2)+'\n')
    bpy.ops.wm.open_mainfile(filepath=str(SOURCE));before=protected();rig=next(o for o in bpy.data.objects if o.type=='ARMATURE')
    rig.animation_data.action=bpy.data.actions['Idle'];rig.animation_data.action_slot=bpy.data.actions['Idle'].slots[0];bpy.context.scene.frame_set(0)
    made=[]
    for lod in (0,1):
        bpy.data.objects.remove(bpy.data.objects[f'CommanderDawnShield_LOD{lod}'],do_unlink=True)
        made.append(shield(lod,rig))
    assert protected()==before
    report={'geometry':{o.name:geometry(o) for o in made},'candidates':[],'runtime_publish_allowed':False}
    for lod,o in enumerate(made):o.hide_render=bool(lod)
    bpy.ops.wm.save_as_mainfile(filepath=str(RUN/'raw/commander-shield.blend'))
    for lod,o in enumerate(made):
        bpy.ops.object.select_all(action='DESELECT')
        for obj in (rig,o):obj.hide_set(False);obj.select_set(True)
        bpy.context.view_layer.objects.active=rig;path=RUN/f'raw/shield-lod{lod}.glb'
        bpy.ops.export_scene.gltf(filepath=str(path),export_format='GLB',use_selection=True,export_animations=False,export_skins=True,export_yup=True,export_extras=True,export_tangents=True)
        report['candidates'].append(replace_shield(RUN/f'raw/before/commander-lod{lod}.glb',path,RUN/f'candidate/commander-lod{lod}.glb',lod))
    (RUN/'qa/build.json').write_text(json.dumps(report,indent=2)+'\n');print('SHIELD_BUILD',json.dumps(report))

if __name__=='__main__':main()
