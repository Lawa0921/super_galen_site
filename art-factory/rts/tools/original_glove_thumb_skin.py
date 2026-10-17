"""Original hand semantic ownership and local-axis thumb skinning."""
import numpy as np
def repair(old,point,bones,thumb_shaft,port_owners,width=.005):
    result=dict(old)
    if thumb_shaft:
        mass=sum(w for n,w in old.items() if n.startswith('Thumb'))
        if mass:
            transitions=[]
            for number in [2,3]:
                prior=bones[f'Thumb{number-1}_L'];bone=bones[f'Thumb{number}_L']
                left=np.array(prior['tail'])-prior['head'];right=np.array(bone['tail'])-bone['head']
                axis=left/np.linalg.norm(left)+right/np.linalg.norm(right);axis/=np.linalg.norm(axis)
                band=width[number-2] if isinstance(width,(list,tuple,np.ndarray)) else width
                t=float(np.clip((np.dot(np.array(point)-bone['head'],axis)+band)/(2*band),0,1));transitions.append(t*t*(3-2*t))
            a,b=transitions;result={n:w for n,w in old.items() if not n.startswith('Thumb')}
            result.update({'Thumb1_L':mass*(1-a),'Thumb2_L':mass*a*(1-b),'Thumb3_L':mass*a*b})
    else:
        result={n:w for n,w in result.items() if n not in ['Thumb2_L','Thumb3_L']}
    if port_owners and 'Thumb' not in port_owners:
        result={n:w for n,w in result.items() if n not in ['Thumb2_L','Thumb3_L']}
    if result==old:return dict(old)
    result={n:w for n,w in result.items() if w>1e-9}
    if not result:result={'Thumb1_L' if thumb_shaft else 'Hand_L':1.}
    result=dict(sorted(result.items(),key=lambda p:p[1],reverse=True)[:4]);total=sum(result.values())
    return {n:w/total for n,w in result.items()}
