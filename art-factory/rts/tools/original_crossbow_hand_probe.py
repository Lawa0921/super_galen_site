"""Inspect the actual complete articulated crossbowman, including failed poses."""
import bpy,json,hashlib,sys
from pathlib import Path
from mathutils import Vector
from mathutils.bvhtree import BVHTree
sys.path.insert(0,str(Path(__file__).parent))
from original_crossbow_attack_probe import activate
from original_glove_deformation import evaluated,crossings
ROOT=Path(__file__).resolve().parents[3];RUN=ROOT/'art-factory/rts/runs/original-crossbow-articulated-hand/2026-10-07-v1'
source=Path(sys.argv[sys.argv.index('--source')+1]) if '--source' in sys.argv else RUN/'candidate/articulated-crossbow.blend'
prefix=sys.argv[sys.argv.index('--prefix')+1] if '--prefix' in sys.argv else ''
assert not prefix or prefix.replace('-','').isalnum()
bpy.ops.wm.open_mainfile(filepath=str(source));rig=bpy.data.objects['crossbowRig20'];hand=bpy.data.objects['OriginalCrossbowArticulatedHand_L'];rows=[]
def intersection(p,f,q,g):
    a=BVHTree.FromPolygons(p,f,all_triangles=True);b=BVHTree.FromPolygons(q,g,all_triangles=True)
    return [(i,j) for i,j in a.overlap(b) if crossings([p[k] for k in f[i]],[q[k] for k in g[j]])]
for clip in ['Idle','Walk','Attack','Hurt','Death']:
    action=activate(rig,clip,0);end=round(action.frame_range[1])
    frames=[n/8 for n in range(end*8+1)] if '--dense' in sys.argv else ([0,8,12,20,22,24,25,28,31,34,36,40] if clip=='Attack' else [0,end/2,end])
    for frame in frames:
        activate(rig,clip,frame);hp,hf=evaluated(hand);tree=BVHTree.FromPolygons(hp,hf,all_triangles=True)
        own=[(a,b) for a,b in tree.overlap(tree) if a<b and len(set(hf[a])&set(hf[b]))<2 and crossings([hp[i] for i in hf[a]],[hp[i] for i in hf[b]])]
        bone_error=max(abs((b.tail-b.head).length/b.bone.length-1) for b in rig.pose.bones)
        for lod in [0,1]:
            body=bpy.data.objects[f'crossbowOriginalBody_LOD{lod}'];weapon=bpy.data.objects[f'CrossbowWeapon_LOD{lod}'];bp,bf=evaluated(body);wp,wf=evaluated(weapon)
            body_hit=intersection(bp,bf,wp,wf);hand_hit=intersection(hp,hf,wp,wf);wrist_hit=intersection(hp,hf,bp,bf)
            parts=json.loads(weapon['original_weapon_parts']);weapon.data.calc_loop_triangles();face_parts=[next(n for n,p in parts.items() if p['polygon_start']<=t.polygon_index<p['polygon_end']) for t in weapon.data.loop_triangles]
            regions={}
            for face,_ in body_hit:
                weights={}
                for i in bf[face]:
                    for g in body.data.vertices[i].groups:
                        n=body.vertex_groups[g.group].name;weights[n]=weights.get(n,0)+g.weight
                n=max(weights,key=weights.get);regions[n]=regions.get(n,0)+1
            rows.append({'clip':clip,'frame':frame,'lod':lod,'hand_self':len(own),'hand_weapon':len(hand_hit),'body_weapon':len(body_hit),'hand_body':len(wrist_hit),'hand_weapon_parts':sorted({face_parts[j] for _,j in hand_hit}),'body_regions':regions,'bone_length_error':bone_error,'first_hand_self_pairs':own[:10]})
report={'candidate_sha256':hashlib.sha256(source.read_bytes()).hexdigest(),'samples':rows,'pass':all(r['hand_self']==r['hand_weapon']==r['body_weapon']==0 and r['bone_length_error']<1e-5 for r in rows),'scope':'Actual complete weapon vs original body and new left hand; hand self-crossings exclude shared edges. Hand/body intersection is diagnostic because intended cuff overlap needs its own seam gate. Right hand not changed by this assembly; its preservation is checked separately. Mechanical reload remains incomplete.','runtime_publish_allowed':False}
(RUN/('qa/'+prefix+('contact-dense.json' if '--dense' in sys.argv else 'contact-coarse.json'))).write_text(json.dumps(report,indent=2)+'\n')
print('ASSEMBLY_CONTACT',json.dumps({'pass':report['pass'],'samples':len(rows),'rows':rows if '--dense' not in sys.argv else [r for r in rows if r['hand_self'] or r['hand_weapon'] or r['body_weapon']][:10]}),flush=True)
if '--no-render' not in sys.argv:
    scene=bpy.context.scene;scene.render.engine='BLENDER_EEVEE';scene.eevee.taa_render_samples=48;scene.render.resolution_x=900;scene.render.resolution_y=1000;scene.render.resolution_percentage=100;scene.render.image_settings.file_format='PNG';scene.render.film_transparent=False
    for obj in scene.objects:
        if obj.type=='MESH':obj.hide_render=obj.name not in ['crossbowOriginalBody_LOD0','CrossbowWeapon_LOD0','OriginalCrossbowClosedGrip_R',hand.name]
    camera=scene.camera;camera.data.type='ORTHO';camera.data.ortho_scale=2.0
    for clip,frame,view in [('Idle',0,'front'),('Idle',0,'threequarter'),('Idle',0,'close'),('Attack',8,'threequarter'),('Attack',25,'threequarter'),('Attack',31,'threequarter')]:
        activate(rig,clip,frame)
        aim=Vector((0,.10,.94)) if view!='close' else rig.pose.bones['Hand_L'].head+Vector((0,0,.05))
        offset=Vector((0,4,1)) if view=='front' else Vector((2.8,3.5,1.6))
        camera.data.ortho_scale=.52 if view=='close' else 2.0;camera.location=aim+offset;camera.rotation_euler=(aim-camera.location).to_track_quat('-Z','Y').to_euler()
        scene.render.filepath=str(RUN/f'qa/{prefix}{clip.lower()}-{frame}-{view}.png');bpy.ops.render.render(write_still=True)
print('ASSEMBLY_PROBE_COMPLETE',flush=True)
