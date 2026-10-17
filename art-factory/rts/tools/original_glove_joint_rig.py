"""Adapt project-original rest bones and author local-axis finger motion."""
import bpy,json,hashlib,math,sys
from pathlib import Path
from mathutils import Vector,Matrix,Quaternion
sys.path.insert(0,str(Path(__file__).parent))
import original_glove_build as motion
from original_glove_joint_math import blend_half_width
ROOT=Path(__file__).resolve().parents[3];RUN=ROOT/'art-factory/rts/runs/original-glove-joints/2026-10-07-v1'
SCALE=.105
CURLS={'Index':(58,84,42),'Middle':(62,86,43),'Ring':(64,85,42),'Little':(66,83,40),'Thumb':(32,55,40)}

def smooth(x):
    t=max(0.,min(1.,x));return t*t*(3-2*t)

def pose_matrices(rig,side,amount):
    matrices={'Hand_L':rig.data.bones['Hand_L'].matrix_local.copy()}
    for name,angles in CURLS.items():
        head=rig.data.bones[name+'1_L'].head_local.copy();rotation=Quaternion()
        for i,angle in enumerate(angles,1):
            key=f'{name}{i}_L';bone=rig.data.bones[key];axis=Vector(bone['original_flexion_axis'])
            rotation=rotation@Quaternion(axis,math.radians(angle)*amount)
            q=rotation@bone.matrix_local.to_quaternion();matrices[key]=Matrix.LocRotScale(head,q,Vector((1,1,1)));head+=q@Vector((0,bone.length,0))
    return matrices

def main():
    data=json.loads((RUN/'raw/joint-surface.json').read_text());references=json.loads((ROOT/'art-factory/rts/runs/original-glove-retopo/2026-10-07-v1/raw/source-landmarks.json').read_text());origin=Vector(references['origin'])
    source=RUN/'candidate/joint-surface.blend';bpy.ops.wm.open_mainfile(filepath=str(source));obj=[o for o in bpy.context.scene.objects if o.type=='MESH'][0];obj.name='OriginalJointGlove_L_LOD0'
    source_points=[v.co.copy() for v in obj.data.vertices]
    for v in obj.data.vertices:v.co=(v.co-origin)*SCALE
    records=[{'name':'Hand','head':origin.copy(),'tail':Vector((-.10,.10,.07)),'parent':None}];chains={}
    roots={'Index':.13,'Middle':.17,'Ring':.13,'Little':.065}
    for name,digit in data['digits'].items():
        joint=[Vector(r['center']) for r in digit['rings'] if r['is_joint']];first=Vector(digit['rings'][0]['center'])
        mcp=first+(joint[0]-first)*((roots[name]-first.z)/(joint[0].z-first.z))
        chain=[mcp,*joint,Vector(digit['tip'])];chains[name]=chain
    thumb=[r for r in references['bones'] if r['name'].startswith('Thumb')]
    chains['Thumb']=[Vector(r['head'])/SCALE+origin for r in thumb]+[Vector(thumb[-1]['tail'])/SCALE+origin]
    for name,chain in chains.items():
        for i in range(3):records.append({'name':name+str(i+1),'head':chain[i],'tail':chain[i+1],'parent':'Hand' if i==0 else name+str(i)})
    scene=bpy.context.scene;scene.render.fps=24;scene.frame_start=0;scene.frame_end=48
    arm=bpy.data.armatures.new('OriginalSourceJointSkeleton');rig=bpy.data.objects.new('OriginalHandRig_L',arm);scene.collection.objects.link(rig)
    bpy.ops.object.select_all(action='DESELECT');rig.select_set(True);bpy.context.view_layer.objects.active=rig;bpy.ops.object.mode_set(mode='EDIT')
    for record in records:
        bone=arm.edit_bones.new(record['name']+'_L');bone.head=(record['head']-origin)*SCALE;bone.tail=(record['tail']-origin)*SCALE
        if record['parent']:bone.parent=arm.edit_bones[record['parent']+'_L']
    bpy.ops.object.mode_set(mode='OBJECT')
    for bone in arm.bones:
        if bone.name=='Hand_L':continue
        direction=(bone.tail_local-bone.head_local).normalized()
        target=Vector((-1,-.15,.15)) if bone.name.startswith('Thumb1') else Vector((-.85,.15,-.45)) if bone.name.startswith('Thumb') else Vector((0,-1,0))
        axis=direction.cross(target).normalized();bone['original_flexion_axis']=list(axis)
    for record in records:obj.vertex_groups.new(name=record['name']+'_L')
    bands={}
    for name,digit in data['digits'].items():
        chain=chains[name];bands[name]=[]
        for j,ring in enumerate([r for r in digit['rings'] if r['is_joint']],1):
            center=chain[j];axis=((chain[j]-chain[j-1]).normalized()+(chain[j+1]-chain[j]).normalized()).normalized()
            radius=max(((Vector(data['vertices'][i])-center)-axis*(Vector(data['vertices'][i])-center).dot(axis)).length for i in ring['indices'])
            bands[name].append((center,axis,blend_half_width(radius,CURLS[name][j])))
    def finger_skin(name,point):
        values=[smooth(((point-center).dot(axis)+width)/(2*width)) for center,axis,width in bands[name]];a,b=values
        return {name+'1':1-a,name+'2':a*(1-b),name+'3':a*b}
    for i,p in enumerate(source_points):
        tag=data['tags'][i];skin={}
        if tag in data['digits']:skin=finger_skin(tag,p)
        else:
            thumb_amount=smooth((.10-p.y)/.20)*smooth((p.x-.05)/.20)*smooth((p.z+.30)/.35)
            a=smooth((p.z-.005)/.08);b=smooth((p.z-.215)/.08)
            skin={'Hand':1-thumb_amount,'Thumb1':thumb_amount*(1-a),'Thumb2':thumb_amount*a*(1-b),'Thumb3':thumb_amount*a*b}
            scores={}
            for name,chain in chains.items():
                if name=='Thumb':continue
                root,pip=chain[:2];t=(p.z-root.z)/(pip.z-root.z);center=root+(pip-root)*t
                scores[name]=math.exp(-((p.x-center.x)/.085)**2-((p.y-center.y)/.15)**2)
            total=sum(scores.values())
            if total>1e-12 and p.y>-.03:
                amount=sum(scores[name]/total*smooth((p.z-roots[name])/(data['digits'][name]['cut_height']-roots[name]+.025)) for name in scores)
                amount*=1-thumb_amount
                skin['Hand']-=amount
                for name,score in scores.items():
                    for key,value in finger_skin(name,p).items():skin[key]=skin.get(key,0)+amount*score/total*value
        # Three.js consumes four influences; bind the authoring surface to the
        # same four normalized weights rather than letting export truncate it.
        skin=dict(sorted(((key,max(0,value)) for key,value in skin.items() if value>1e-7),key=lambda pair:pair[1],reverse=True)[:4]);total=sum(skin.values());assert total>0
        for name,value in skin.items():obj.vertex_groups[name+'_L'].add([i],value/total,'REPLACE')
    obj.parent=rig;modifier=obj.modifiers.new('OriginalJointDeformation','ARMATURE');modifier.object=rig
    motion.RUN=RUN;motion.pose_matrices=pose_matrices;motion.animate(rig,'L')
    bpy.ops.wm.save_as_mainfile(filepath=str(RUN/'candidate/joint-rig.blend'));motion.export(rig,[obj],'L')
    report={'status':'qa_failed','static_source_sha256':hashlib.sha256(source.read_bytes()).hexdigest(),'raw_sha256':hashlib.sha256((RUN/'raw/joint-surface.json').read_bytes()).hexdigest(),'bones':16,'motion':'Original 2-second OpenClose, 24fps source, quarter-frame keys. Per-bone flexion axis derived from each rest direction and authored palmward/opposition direction.','bind_notes':'Four-finger PIP/DIP centers use source-contour area centroids; MCP centers extrapolate proximal source centerlines. Thumb rest guides are provisional original authored landmarks. Requires deformation/art review.','origin':list(origin),'scale':SCALE,'bones_source_units':[{**r,'head':list(r['head']),'tail':list(r['tail'])} for r in records],'files':{p.name:hashlib.sha256(p.read_bytes()).hexdigest() for p in [RUN/'candidate/joint-rig.blend',RUN/'candidate/glove-l-lod0.glb']},'runtime_publish_allowed':False}
    report['weight_bands']={name:[{'center_source':list(center),'axis':list(axis),'half_width_source':width} for center,axis,width in values] for name,values in bands.items()}
    report['weight_method']='Local-axis smoothstep; half-width bounded by 1.5*r*tan(max_angle/2) with 15% margin for ideal planar two-bone orientation. Maximum four normalized influences. Whole-hand collision gates still required.'
    (RUN/'qa/rig-authoring.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps({'bones':16,'vertices':len(obj.data.vertices),'files':report['files']}))
    if '--no-render' not in sys.argv:motion.render(rig,[obj],'L')

if __name__=='__main__':main()
