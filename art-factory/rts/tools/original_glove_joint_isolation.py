"""Isolate original digit flexion to distinguish joint folds from finger contact."""
import bpy,json,hashlib,sys
from pathlib import Path
from mathutils import Matrix,Quaternion,Vector
from mathutils.bvhtree import BVHTree
sys.path.insert(0,str(Path(__file__).parent))
from original_glove_deformation import evaluated,crossings
import original_glove_joint_rig as authored
ROOT=Path(__file__).resolve().parents[3];RUN=ROOT/'art-factory/rts/runs/original-glove-joints/2026-10-07-v1';source=RUN/'candidate/joint-rig.blend'
bpy.ops.wm.open_mainfile(filepath=str(source));rig=bpy.data.objects['OriginalHandRig_L'];rig.animation_data_clear();obj=bpy.data.objects['OriginalJointGlove_L_LOD0'];rows=[]
single='--single-joint' in sys.argv;dense='--dense' in sys.argv
cases=[(digit,joint,amount) for digit in ['Index','Middle','Ring','Little','Thumb'] for joint in ([2,3] if single else [0]) for amount in ([i/32 for i in range(33)] if dense else [.5,1.])]
angles={'Index':[58,84,42],'Middle':[62,86,43],'Ring':[64,85,42],'Little':[66,83,40],'Thumb':[32,55,40]}
for digit,joint,amount in cases:
        if joint:
            bone=rig.data.bones[f'{digit}{joint}_L'];center=bone.head_local;rotation=Quaternion(Vector(bone['original_flexion_axis']),__import__('math').radians(angles[digit][joint-1])*amount)
            transform=Matrix.Translation(center)@rotation.to_matrix().to_4x4()@Matrix.Translation(-center)
            matrices={b.name:(transform@b.matrix_local if b.name in [f'{digit}{i}_L' for i in range(joint,4)] else b.matrix_local.copy()) for b in rig.data.bones}
        else:
            matrices=authored.pose_matrices(rig,'L',amount)
            for name in matrices:
                if not name.startswith(digit):matrices[name]=rig.data.bones[name].matrix_local.copy()
        authored.motion.apply(rig,matrices);bpy.context.view_layer.update();points,faces=evaluated(obj);tree=BVHTree.FromPolygons(points,faces,all_triangles=True);bad=[];regions={}
        for a,b in tree.overlap(tree):
            if a>=b or len(set(faces[a])&set(faces[b]))>=2:continue
            if crossings([points[i] for i in faces[a]],[points[i] for i in faces[b]]):
                bad.append([a,b]);names=[]
                for face in [faces[a],faces[b]]:
                    weights={}
                    for i in face:
                        for g in obj.data.vertices[i].groups:
                            name=obj.vertex_groups[g.group].name;weights[name]=weights.get(name,0)+g.weight
                    names.append(max(weights,key=weights.get))
                key='/'.join(sorted(names));regions[key]=regions.get(key,0)+1
        rows.append({'digit':digit,'joint':joint or 'whole_digit','amount':amount,'crossings':len(bad),'regions':regions,'first_triangle_pairs':bad[:20]})
report={'status':'qa_failed','source_sha256':hashlib.sha256(source.read_bytes()).hexdigest(),'poses':rows,'pass':all(r['crossings']==0 for r in rows),'scope':'Single digit diagnostic on actual evaluated Blender surface. Not complete motion approval.','runtime_publish_allowed':False}
name='joint-isolation' if single else 'digit-isolation'
(RUN/('qa/'+name+('-dense' if dense else '')+'.json')).write_text(json.dumps(report,indent=2)+'\n');print(json.dumps({'source_sha256':report['source_sha256'],'pass':report['pass'],'poses':len(rows),'failed':sum(r['crossings']>0 for r in rows)}));assert report['pass']
