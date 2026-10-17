"""Author a complete original upper-body firing/handling cycle on the frozen drape source."""
import ast,bpy,hashlib,json,math,os,sys
from pathlib import Path
from mathutils import Matrix,Vector,Quaternion
sys.path.insert(0,str(Path(__file__).parent))
from original_crossbow_attack_probe import ROOT,RUN,SOURCE,EXPECTED,RIGHT,LEFT,activate
from original_crossbow_attack_layout import shoulder_base
from original_crossbow_carry_solve import arm_matrices,apply_matrices

ARMS={p+'_'+s for p in ['Shoulder','UpperArm','Forearm','Hand'] for s in ['R','L']}
EDITED=ARMS|{'SpineUpper','Neck','Head'}
def smooth(t):return t*t*(3-2*t)
def blend(a,b,t):
    al,aq,asc=a.decompose();bl,bq,bsc=b.decompose()
    return Matrix.LocRotScale(al.lerp(bl,t),aq.slerp(bq,t),asc.lerp(bsc,t))
def selected_function(file,name,scope):
    tree=ast.parse(Path(__file__).with_name(file).read_text(encoding='utf-8'));fn=next(n for n in tree.body if isinstance(n,ast.FunctionDef) and n.name==name)
    exec(compile(ast.Module(body=[fn],type_ignores=[]),file,'exec'),scope);return scope[name]

def controls(rig,neutral):
    relative=neutral['Hand_R'].inverted()@neutral['Hand_L'];bind=rig.data.bones['Hand_R'].matrix_local
    right=Matrix.Translation(Vector((-.02,.28,1.48))-RIGHT)@bind
    aimed=shoulder_base(rig,neutral,.145)
    lower=neutral['Hand_R'].copy();lower.translation+=Vector((-.015,.025,-.015))
    reload_left=lower@relative
    # Left fist leaves the support, travels to the upper string/lock area,
    # draws rearward, then restores the original support grip. The existing
    # bow's static string is not presented as a working animated mechanism.
    reach=reload_left.copy();reach.translation+=Vector((-.055,.045,.130))
    draw=reload_left.copy();draw.translation+=Vector((.095,-.035,.110))
    recoil=right.copy();recoil.translation+=Vector((0,-.016,.009))
    def pose(r,l,shoulders):return {'Hand_R':r,'Hand_L':l,'Shoulder_R':shoulders['Shoulder_R'],'Shoulder_L':shoulders['Shoulder_L']}
    handling={**neutral,'Shoulder_L':aimed['Shoulder_L']}
    return {0:pose(neutral['Hand_R'],neutral['Hand_L'],neutral),8:pose(right,right@relative,aimed),12:pose(right,right@relative,aimed),14:pose(recoil,recoil@relative,aimed),20:pose(lower,lower@relative,neutral),25:pose(lower,reach,handling),31:pose(lower,draw,handling),36:pose(lower,lower@relative,neutral),40:pose(neutral['Hand_R'],neutral['Hand_L'],neutral)}

def main():
    assert hashlib.sha256(SOURCE.read_bytes()).hexdigest()==EXPECTED
    output=RUN/'candidate';output.mkdir(parents=True,exist_ok=True)
    bpy.ops.wm.open_mainfile(filepath=str(SOURCE));rig=bpy.data.objects['crossbowRig20'];activate(rig,'Idle',0)
    neutral={p.name:p.matrix.copy() for p in rig.pose.bones};relative=neutral['Hand_R'].inverted()@neutral['Hand_L'];control=controls(rig,neutral);frames=sorted(control);action=bpy.data.actions['Attack'];captured={};reach=[];unreachable=[]
    # Measured collision-free elbow planes. Maintain the hand/weapon transform;
    # change the arm approach rather than displacing the fitted closed grasp.
    aim_elbows={'R':Vector((.015175994,.131357059,1.366591811)),'L':Vector((-.127259567,.285947800,1.460080862))}
    for sample in range(321):
        frame=sample/8
        activate(rig,'Attack',frame);original={p.name:p.matrix.copy() for p in rig.pose.bones}
        lo=max(f for f in frames if f<=frame);hi=min(f for f in frames if f>=frame);t=smooth((frame-lo)/(hi-lo)) if hi!=lo else 0
        desired={n:blend(control[lo][n],control[hi][n],t) for n in control[lo]}
        if frame<=20 or frame>=36:desired['Hand_L']=desired['Hand_R']@relative
        base=original.copy()
        for n in ['SpineUpper','Neck','Head']:base[n]=neutral[n].copy()
        for side in ['R','L']:
            name='Shoulder_'+side;base[name]=desired[name];delta=base[name]@neutral[name].inverted()
            for part in ['UpperArm','Forearm']:base[part+'_'+side]=delta@neutral[part+'_'+side]
        matrices=base.copy()
        for side,sign in [('R',1),('L',-1)]:
            target=desired['Hand_'+side]
            aiming=smooth(frame/8) if frame<8 else 1 if frame<=14 else 1-smooth((frame-14)/6) if frame<20 else 0
            pole=neutral['Forearm_'+side].translation.lerp(aim_elbows[side],aiming)
            try:matrices.update(arm_matrices(rig,base,side,target,pole))
            except ValueError as error:
                unreachable.append({'frame':frame,'side':side,'target':list(target.translation),'upper':list(base['UpperArm_'+side].translation),'error':str(error)});continue
            reach.append({'frame':frame,'side':side,'wrist_distance_m':(target.translation-base['UpperArm_'+side].translation).length,'upper_error_m':abs((matrices['Forearm_'+side].translation-matrices['UpperArm_'+side].translation).length-rig.data.bones['UpperArm_'+side].length),'fore_error_m':abs((target.translation-matrices['Forearm_'+side].translation).length-rig.data.bones['Forearm_'+side].length)})
        if frame in [0,40]:
            for name in EDITED:matrices[name]=neutral[name].copy()
        captured[frame]=matrices
    (RUN/'qa/reach-preflight.json').write_text(json.dumps({'unreachable':unreachable,'reach':reach},indent=2)+'\n')
    assert not unreachable,unreachable
    put=selected_function('original_crossbow_carry_build.py','put_keys',{'bpy':bpy});put(rig,action,captured,EDITED)
    activate(rig,'Idle',0);bpy.ops.wm.save_as_mainfile(filepath=str(output/'original-crossbow-grip.blend'))
    exporter=selected_function('original_crossbow_grip_build.py','export_lod',{'bpy':bpy,'os':os})
    bodies=[bpy.data.objects[f'crossbowOriginalBody_LOD{i}'] for i in (0,1)];weapons=[bpy.data.objects[f'CrossbowWeapon_LOD{i}'] for i in (0,1)];hands=[bpy.data.objects['OriginalCrossbowClosedGrip_'+s] for s in ['R','L']]
    if '--source-only' not in sys.argv:
        for lod in [0,1]:exporter(rig,bodies,weapons,[],hands,str(output/f'original-crossbow-grip-lod{lod}.glb'),bodies[lod].name,weapons[lod].name,samples_per_frame=8)
    report={'source_sha256':EXPECTED,'edited_action':'Attack','edited_bones':sorted(EDITED),'phase_frames':{'carry':0,'aim':8,'release':12,'recoil':14,'lower':20,'reload_reach':25,'reload_draw':31,'support':36,'recover':40},'fps':24,'authoring_step_frames':.125,'export_step_frames':.125,'reach':reach,'runtime_publish_allowed':False,'mechanical_reload_complete':False,'files':{p.name:hashlib.sha256(p.read_bytes()).hexdigest() for p in output.glob('*') if p.suffix in ['.blend','.glb']}}
    (RUN/'qa/authoring.json').write_text(json.dumps(report,indent=2)+'\n');print('ATTACK_BUILD',json.dumps({'files':report['files'],'max_reach':max(r['wrist_distance_m'] for r in reach)}))
if __name__=='__main__':main()
