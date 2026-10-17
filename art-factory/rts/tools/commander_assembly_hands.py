"""Sculpted closed armor gloves in the established canonical grip frame.

Four separately shaped curled digits, a crossing thumb, leather palm and cuff,
and contoured articulated plates replace the old solid mitten silhouette.
"""
import math,json
from mathutils import Vector
import procedural_gauntlet_build as g

def finger_patch(name,start,end,z,fw,radius,material,detail):
    part=g.Part(name,material);rings=[];centers=[];steps=5 if detail==0 else 3
    for k in range(steps+1):
        u=k/steps;theta=math.radians(start+(end-start)*u);rad=Vector((math.cos(theta),math.sin(theta),0));c=rad*radius+Vector((0,0,z))
        width=fw*(.82+.18*math.sin(math.pi*u));centers.append(c)
        rings.append(part.ring(c,rad,Vector((0,0,1)),.0027,width,8 if detail==0 else 6,p=3.0,weights={'Hand':1}))
    part.loft(rings,centers,repeat=.12);return part

def sculpted_parts(r,wrist,wrist_radius,cfg,detail,glove,steel):
    # Keep the established curved palm and thumb, replacing the barrel-shaped
    # finger/core block with four individual organic digit sweeps.
    original=g.fist_parts(r,wrist,wrist_radius,cfg,detail,glove,glove)
    parts=[p for p in original if p.name in ('thumb','back')]
    fw=cfg['finger_width']*.88;ft=cfg['finger_thickness']*.85
    zshift=max(-.6*fw,min(.6*fw,wrist.z*.35))
    for finger,(offset,size) in enumerate(((1.5,1.0),(.5,1.04),(-.5,.98),(-1.5,.85))):
        part=g.Part('finger_'+str(finger),glove);rings=[];centers=[];steps=22 if detail==0 else 12;profile=10 if detail==0 else 7
        for k in range(steps+1):
            u=k/steps;theta=math.radians(-25+285*u);rad=Vector((math.cos(theta),math.sin(theta),0))
            tip=.65+.35*g.smooth((1-u)/.13);swell=1+.14*sum(math.exp(-((u-j)/.06)**2) for j in (.15,.46,.77))
            c=rad*(r+cfg['gap']+ft*.49)+Vector((0,0,zshift+offset*fw-.003*math.sin(math.pi*u)*(3-finger)/3))
            centers.append(c);rings.append(part.ring(c,rad,Vector((0,0,1)),ft*.5*size*tip*swell,fw*.46*size*tip,profile,p=2.35,weights={'Hand':1}))
        part.loft(rings,centers,repeat=.12);parts.append(part)
        for joint,(start,end) in enumerate(((-19,43),(65,116),(143,194))):
            parts.append(finger_patch(f'finger_{finger}_plate_{joint}',start,end,zshift+offset*fw,fw*.44*size,r+cfg['gap']+ft*1.02,steel,detail))
    # One formed dorsal plate follows the glove's palm-to-wrist contour. It is
    # narrower at the wrist, bowed across the knuckles, with rounded end rims.
    back=g.Part('dorsal_plate',steel);knuckle=Vector((r+cfg['gap']+ft*.52,-.006,zshift));span=wrist-knuckle
    direction=span.normalized();width_axis=(Vector((0,0,1))-direction*direction.z).normalized();normal=direction.cross(width_axis).normalized()
    if normal.x<0:normal=-normal
    rings=[];centers=[]
    for u in (0,.08,.32,.6,.78,.84):
        c=knuckle.lerp(wrist,u)+normal*(ft*.65+.004+.003*math.sin(math.pi*u));width=(fw*1.92)*(1-u)+wrist_radius*.78*u
        if u in (0,.84):width*=.9
        centers.append(c);fore=g.smooth((u-.45)/.55)*.75
        rings.append(back.ring(c,normal,width_axis,.0035,width,10 if detail==0 else 6,p=2.7,weights={'Hand':1-fore,'Forearm':fore}))
    back.loft(rings,centers,repeat=.15);parts.append(back)
    return parts

def build(name,rig,side,center,axis,radius,wrist,distal,wrist_radius,detail,ref,mats):
    cfg=dict(g.GAUNTLET_DEFAULTS);cfg['finger_width']*=.94;cfg['finger_thickness']*=.91;cfg['repeat']=.12
    outward=Vector((1,0,0)) if side=='R' else Vector((0,-1,0))
    m,local,thumb=g.hand_frame(center,axis,wrist,radius,cfg,side,outward)
    parts=[p.transformed(m,mirror_x=side=='L') for p in sculpted_parts(radius,local,wrist_radius,cfg,detail,'CommanderDetail_leather','CommanderDetail_steel')]
    cuff=g.cuff_part(wrist,distal,wrist_radius,'CommanderDetail_leather',detail,1.04,.044,.15)
    parts.append(cuff)
    for p in parts:
        p.weights=[{('Hand_' if k=='Hand' else 'Forearm_')+side:v for k,v in w.items()} for w in p.weights];g.to_bind(p,ref)
    obj=g.parts_to_object(name,parts,rig,mats)
    obj['authorship']='Original contoured four-finger closed armor glove; physical curved digit topology and existing generated PBR surfaces'
    obj['original_gauntlet_parts']=json.dumps([p.name for p in parts])
    return obj,{'side':side,'triangles':g.tri_count(obj),'thumb_axis_ref':list(thumb),'wrist':list(wrist),'grip':list(center),'parts':[p.name for p in parts]}
