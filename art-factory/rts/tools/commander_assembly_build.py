"""Complete commander hands, equipped surfaces and Death shield placement."""
import bpy,bmesh,json,sys,hashlib,math
from pathlib import Path
from mathutils import Vector,Matrix
sys.path.insert(0,str(Path(__file__).parent))
import procedural_gauntlet_build as g
from commander_assembly_qa import ROOT,RUN,SOURCE
from commander_assembly_hands import build as hand
from commander_assembly_pack import package
from commander_equipment_build import sword as detailed_sword,RIGHT
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def save(p,d):p.write_bytes((json.dumps(d,indent=2)+'\n').encode())

def surface(kind):
    name='CommanderDetail_'+kind;m=bpy.data.materials.new(name);m.use_nodes=True;n=m.node_tree.nodes;l=m.node_tree.links;p=n.get('Principled BSDF')
    p.inputs['Metallic'].default_value=.45 if kind=='steel' else .55 if kind=='brass' else 0;p.inputs['Roughness'].default_value=.65
    for suffix,space in (('color.jpg','sRGB'),('normal.png','Non-Color'),('mr.png','Non-Color')):
        im=bpy.data.images.load(str(ROOT/'public/assets/games/rts/materials/detail-v1'/f'{kind}-{suffix}'),check_existing=True);im.colorspace_settings.name=space;im.pack();tex=n.new('ShaderNodeTexImage');tex.image=im
        if suffix.startswith('color'):l.new(tex.outputs['Color'],p.inputs['Base Color'])
        elif suffix.startswith('normal'):
            normal=n.new('ShaderNodeNormalMap');normal.inputs['Strength'].default_value=.10 if kind in ('steel','brass') else .16;l.new(tex.outputs['Color'],normal.inputs['Color']);l.new(normal.outputs['Normal'],p.inputs['Normal'])
        else:
            separate=n.new('ShaderNodeSeparateColor');l.new(tex.outputs['Color'],separate.inputs['Color']);l.new(separate.outputs['Green'],p.inputs['Roughness'])
    return m

def trim_left(body):
    groups={body.vertex_groups[n].index for n in ('Hand_L','Forearm_L')};weights=[sum(g.weight for g in v.groups if g.group in groups) for v in body.data.vertices]
    bm=bmesh.new();bm.from_mesh(body.data);bm.verts.ensure_lookup_table();old={e for e in bm.edges if e.is_boundary}
    doomed=[f for f in bm.faces if (c:=f.calc_center_median()).z<1.10 and c.x<-.30 and c.y>.025 and sum(weights[v.index] for v in f.verts)/len(f.verts)>.5]
    assert 80<len(doomed)<800
    bmesh.ops.delete(bm,geom=doomed,context='FACES');bmesh.ops.delete(bm,geom=[v for v in bm.verts if not v.link_faces],context='VERTS')
    boundary=[v.co.copy() for v in {v for e in bm.edges if e.is_boundary and e not in old for v in e.verts}];center=sum(boundary,Vector())/len(boundary);radius=max((v-center).length for v in boundary)
    bm.to_mesh(body.data);bm.free();return {'removed_faces':len(doomed),'wrist':list(center),'radius':radius}

def fit_shield(obj,center,mats):
    parts=json.loads(obj['original_weapon_parts']);origin=Vector((-.40373286,.216,1.083562));rot=Vector((0,0,1)).rotation_difference(Vector((1,0,0)))
    for name,p in parts.items():
        if name!='rear_leather_grip' and not name.startswith('grip_mount_'):continue
        for i in range(p['vertex_start'],p['vertex_end']):
            old=obj.data.vertices[i].co.copy();v=center+rot@(old-origin)
            if name.startswith('grip_mount_'):
                t=max(0,min(1,(old.y-.216)/.04));v.y=v.y*(1-t)+old.y*t
            obj.data.vertices[i].co=v
    mapping={'WorkedAshWood':'oak','ForgedToolSteel':'steel','OldBrassFittings':'brass','WornLeatherGrip':'leather'}
    for i,m in enumerate(obj.data.materials):
        if m.name in mapping:obj.data.materials[i]=mats['CommanderDetail_'+mapping[m.name]]
    obj.data.update()

def death_equipment(rig,wrists,centers,axis_r):
    # These channels were implicitly zero in the seven existing source clips.
    # Key their neutral value explicitly so Blender action switching cannot
    # retain Death's surface-pivot compensation. Their runtime GLB clips stay
    # byte-identical to the published baseline.
    for a in bpy.data.actions:
        if a.name=='Death':continue
        g.set_action(rig,a.name)
        for side in ('L','R'):
            bone=rig.pose.bones['Hand_'+side];bone.location=(0,0,0)
            for f in a.frame_range:bone.keyframe_insert(data_path='location',frame=f,group=bone.name)
    action=bpy.data.actions['Death'];g.set_action(rig,'Death');start,end=map(int,action.frame_range);forearms={}
    for f in range(start,end+1):
        bpy.context.scene.frame_set(f);forearms[f]={s:rig.pose.bones['Forearm_'+s].matrix.copy() for s in ('L','R')}
    shield_rotation=Matrix(((0,-1,0),(0,0,1),(-1,0,0)))
    # Fit sword roll from the anatomical wrist-to-grip direction, so the palm
    # continues the forearm instead of turning through it during the fall.
    local_a=axis_r.normalized();local_b=centers['R']-wrists['R'];local_b=(local_b-local_a*local_b.dot(local_a)).normalized()
    local_basis=Matrix((local_a,local_b,local_a.cross(local_b))).transposed()
    for f in range(start,end+1):
        bpy.context.scene.frame_set(f);t=(f-start)/(end-start);blend=g.smooth((t-.08)/.43)
        fore=rig.pose.bones['Forearm_L'];original=forearms[f]['L'];direction=Vector((-.55,-.8,.15)).normalized()
        q=original.to_quaternion();turn=(original.to_3x3()@Vector((0,1,0))).rotation_difference(direction)
        q=q.slerp(turn@q,blend);matrix=q.to_matrix().to_4x4();matrix.translation=original.translation;fore.matrix=matrix;fore.keyframe_insert(data_path='rotation_quaternion',frame=f,group='Forearm_L');bpy.context.view_layer.update()
        for side in ('L','R'):
            fore=rig.pose.bones['Forearm_'+side];bone=rig.pose.bones['Hand_'+side]
            fore_skin=fore.matrix@fore.bone.matrix_local.inverted();neutral=(fore_skin@bone.bone.matrix_local).to_quaternion()
            if side=='L':rotation=shield_rotation
            else:
                a=Vector((1,0,.13)).normalized();b=fore.tail-fore.head;b=(b-a*b.dot(a)).normalized();rotation=Matrix((a,b,a.cross(b))).transposed()@local_basis.transposed()
            target=(rotation@bone.bone.matrix_local.to_3x3()).to_quaternion();q=neutral.slerp(target,blend)
            matrix=q.to_matrix().to_4x4();wrist=fore_skin@wrists[side]
            matrix.translation=wrist-matrix.to_3x3()@(bone.bone.matrix_local.inverted()@wrists[side]);bone.matrix=matrix
            bone.keyframe_insert(data_path='rotation_quaternion',frame=f,group='Hand_'+side);bone.keyframe_insert(data_path='location',frame=f,group='Hand_'+side)
    for layer in action.layers:
        for strip in layer.strips:
            for slot in action.slots:
                bag=strip.channelbag(slot)
                if bag:
                    for c in bag.fcurves:
                        if any('"'+n+'"' in c.data_path for n in ('Hand_L','Hand_R','Forearm_L')):
                            for p in c.keyframe_points:p.interpolation='LINEAR'
    g.set_action(rig,'Idle');bpy.context.scene.frame_set(0)

def main():
    for p in ('raw/before','candidate','qa'):(RUN/p).mkdir(parents=True,exist_ok=True)
    registry=json.loads((ROOT/'art-factory/rts/manifests/unit-registry.json').read_bytes());rec=next(r for r in registry['assets'] if r['id']=='commander')
    lockpath=RUN/'source-lock.json';existing=json.loads(lockpath.read_bytes()) if lockpath.exists() else None
    assert sha(SOURCE)==(existing['source_sha256'] if existing else rec['source_sha256'])
    lock={'source':SOURCE.relative_to(ROOT).as_posix(),'source_sha256':sha(SOURCE),'runtime':[],'materials':[]}
    for lod in (0,1):
        p=ROOT/f'public/assets/games/rts/models/commander{"-lod1" if lod else ""}.glb';backup=RUN/f'raw/before/commander-lod{lod}.glb'
        if not backup.exists():backup.write_bytes(p.read_bytes())
        assert sha(backup)==(existing['runtime'][lod]['sha256'] if existing else sha(p));lock['runtime'].append({'path':p.relative_to(ROOT).as_posix(),'sha256':sha(backup)})
    material_registry=json.loads((ROOT/'art-factory/rts/manifests/detail-material-registry.json').read_bytes())
    for asset in material_registry['assets']:
        if asset['id'].split('-')[0] in ('steel','leather','brass','oak','cloth'):
            p=ROOT/'public'/asset['url'].lstrip('/');assert sha(p)==asset['sha256'] and asset['status']=='published';lock['materials'].append({'path':p.relative_to(ROOT).as_posix(),'sha256':sha(p)})
    save(lockpath,lock);bpy.ops.wm.open_mainfile(filepath=str(SOURCE));rig=next(o for o in bpy.data.objects if o.type=='ARMATURE');g.set_action(rig,'Idle');bpy.context.scene.frame_set(0);ref=g.skin_matrices(rig)
    mats={m.name:m for m in [surface(k) for k in ('steel','brass','oak','leather')]};mats['TeamCloth_Shield']=bpy.data.materials['TeamCloth_Shield'];made=[];records=[]
    previous=json.loads((ROOT/'art-factory/rts/runs/commander-grip/2026-10-14-v1/qa/build.json').read_bytes())
    for lod in (0,1):
        body=bpy.data.objects[f'commanderOriginalBody_LOD{lod}'];left=trim_left(body);made.append(body)
        old=bpy.data.objects[f'CommanderClosedGrip_R_LOD{lod}'];bpy.data.objects.remove(old,do_unlink=True)
        right=previous['hands'][lod];wrist_r=Vector(right['cut']['wrist_center']);center_r=Vector(right['grip_center_bind']);axis_r=Vector(right['blade_axis_bind'])
        wrist_l=Vector(left['wrist']);center_l=wrist_l+Vector((-.009,.065,-.086));axis_l=Vector((1,0,0))
        sword=bpy.data.objects[f'CommanderLongsword_LOD{lod}'];bpy.data.objects.remove(sword,do_unlink=True)
        sword=detailed_sword(lod,rig,[mats['CommanderDetail_'+k] for k in ('steel','brass','oak','leather')]+[mats['TeamCloth_Shield']])
        rotation=Vector((0,0,1)).rotation_difference(axis_r)
        for v in sword.data.vertices:v.co=center_r+rotation@(v.co-RIGHT)
        made.append(sword);shield=bpy.data.objects[f'CommanderDawnShield_LOD{lod}'];fit_shield(shield,center_l,mats);made.append(shield)
        for side,wrist,center,axis,radius,wr in (('R',wrist_r,center_r,axis_r,.020,.057),('L',wrist_l,center_l,axis_l,.012,min(.057,left['radius']))):
            distal=Vector(((.15 if side=='R' else -.15),.20,-1)).normalized()
            obj,record=hand(f'CommanderClosedGrip_{side}_LOD{lod}',rig,side,ref['Hand_'+side]@center,(ref['Hand_'+side].to_3x3()@axis).normalized(),radius,ref['Forearm_'+side]@wrist,(ref['Forearm_'+side].to_3x3()@distal).normalized(),wr,lod,ref,mats);made.append(obj);record.update(lod=lod,grip_center_bind=list(center),cut=left if side=='L' else right['cut']);records.append(record)
    death_equipment(rig,{'L':wrist_l,'R':wrist_r},{'L':center_l,'R':center_r},axis_r);g.CLIPS=tuple(a.name for a in bpy.data.actions);bounds=g.conservative_bounds(made,rig)
    for o in made:o['rtsConservativeBounds']=bounds[o.name];o.hide_render=o.name.endswith('LOD1')
    bpy.ops.wm.save_as_mainfile(filepath=str(RUN/'raw/commander-assembly.blend'));outputs=[]
    # Keep the editable source's part ranges intact; triangulate only the
    # in-memory export copy so normal-mapped weapon caps receive real tangents.
    for o in made:
        if o.name.startswith(('CommanderLongsword','CommanderDawnShield')):
            bm=bmesh.new();bm.from_mesh(o.data)
            bmesh.ops.triangulate(bm,faces=list(bm.faces));bm.to_mesh(o.data);bm.free()
    for lod in (0,1):
        bpy.ops.object.select_all(action='DESELECT')
        for o in (rig,*[o for o in made if o.name.endswith(f'LOD{lod}')]):o.hide_set(False);o.select_set(True)
        bpy.context.view_layer.objects.active=rig;exported=RUN/f'raw/edited-lod{lod}.glb'
        bpy.ops.export_scene.gltf(filepath=str(exported),export_format='GLB',use_selection=True,export_animations=True,export_animation_mode='ACTIONS',export_nla_strips=False,export_force_sampling=True,export_optimize_animation_size=False,export_skins=True,export_extras=True,export_yup=True,export_tangents=True)
        result=package(RUN/f'raw/before/commander-lod{lod}.glb',exported,RUN/f'candidate/commander-lod{lod}.glb',lod,bounds);result['path']=Path(result['path']).relative_to(ROOT).as_posix();outputs.append(result)
    save(RUN/'qa/build.json',{'status':'candidate','runtime_publish_allowed':False,'hands':records,'bounds':bounds,'candidates':outputs});print(json.dumps({'hands':[(r['side'],r['lod'],r['triangles']) for r in records],'candidates':outputs}))
if __name__=='__main__':main()
