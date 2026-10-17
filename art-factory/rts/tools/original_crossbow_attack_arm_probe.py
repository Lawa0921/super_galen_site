"""Read-only anatomical elbow-plane / forearm-twist contact diagnosis."""
import bpy,json,math,sys
from pathlib import Path
from mathutils import Vector,Matrix,Quaternion
from mathutils.bvhtree import BVHTree
from mathutils.geometry import intersect_ray_tri
sys.path.insert(0,str(Path(__file__).parent))
from original_crossbow_attack_probe import RUN,SOURCE,activate
from original_crossbow_attack_build import controls,selected_function
from original_crossbow_carry_solve import arm_matrices,apply_matrices
from original_crossbow_attack_layout import shoulder_base

def main():
    bpy.ops.wm.open_mainfile(filepath=str(SOURCE));rig=bpy.data.objects['crossbowRig20'];activate(rig,'Idle',0)
    neutral={p.name:p.matrix.copy() for p in rig.pose.bones};control=controls(rig,neutral)[8];base=shoulder_base(rig,neutral,.145)
    initial=base.copy()
    for side,sign in [('R',1),('L',-1)]:initial.update(arm_matrices(rig,base,side,control['Hand_'+side],Vector((sign*.48,.20,1.18))))
    rig.animation_data_clear();apply_matrices(rig,initial);bpy.context.view_layer.update()
    scope={'bpy':bpy,'intersect_ray_tri':intersect_ray_tri};evaluated=selected_function('original_crossbow_weapon_contact.py','evaluated',scope);crosses=selected_function('original_crossbow_weapon_contact.py','crosses',scope)
    weapon=bpy.data.objects['CrossbowWeapon_LOD0'];wp,wt,polys=evaluated(weapon);wb=BVHTree.FromPolygons(wp,wt,all_triangles=True)
    body=bpy.data.objects['crossbowOriginalBody_LOD0'];rows=[]
    for side in ['R','L']:
        shoulder=base['UpperArm_'+side].translation;wrist=control['Hand_'+side].translation;axis=(wrist-shoulder).normalized()
        u=axis.cross(Vector((0,0,1))).normalized();v=axis.cross(u).normalized()
        for angle in range(0,360,30):
            radians=math.radians(angle);pole=shoulder+u*math.cos(radians)+v*math.sin(radians)
            solved=arm_matrices(rig,base,side,control['Hand_'+side],pole)
            fore=solved['Forearm_'+side];direction=(wrist-fore.translation).normalized()
            for twist in range(-180,180,60):
                matrices={**initial,**solved};matrices['Forearm_'+side]=Matrix.LocRotScale(fore.translation,Quaternion(direction,math.radians(twist))@fore.to_quaternion(),Vector((1,1,1)))
                apply_matrices(rig,matrices);bpy.context.view_layer.update();bp,bt,_=evaluated(body);bb=BVHTree.FromPolygons(bp,bt,all_triangles=True);hits=0
                for i,j in wb.overlap(bb):
                    weights={}
                    for index in bt[j]:
                        for g in body.data.vertices[index].groups:
                            group=body.vertex_groups[g.group].name;weights[group]=weights.get(group,0)+g.weight
                    if not max(weights,key=weights.get).endswith('_'+side):continue
                    if crosses([wp[k] for k in wt[i]],[bp[k] for k in bt[j]]):hits+=1
                elbow=fore.translation
                rows.append({'side':side,'angle':angle,'twist':twist,'crossings':hits,'elbow':list(elbow),'wrist':list(wrist),'pole':list(pole)})
    best={s:sorted([r for r in rows if r['side']==s],key=lambda r:(r['crossings'],abs(r['twist']),r['elbow'][2]))[:8] for s in ['R','L']}
    (RUN/'qa/arm-contact-probe.json').write_text(json.dumps({'best':best,'rows':rows},indent=2)+'\n');print('ARM_PROBE',json.dumps(best))
if __name__=='__main__':main()
