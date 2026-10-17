"""Surface-area derivatives for bounded original cuff pose corrections."""
import numpy as np

def area_jacobian(points,triangles,groups,count):
    p=points[triangles];cross=np.cross(p[:,1]-p[:,0],p[:,2]-p[:,0]);length=np.linalg.norm(cross,axis=1)
    normal=cross/np.maximum(length[:,None],1e-20)
    gradient=np.stack([np.cross(p[:,1]-p[:,2],normal),np.cross(p[:,2]-p[:,0],normal),np.cross(p[:,0]-p[:,1],normal)],axis=1)*.5
    membership=groups[triangles];jac=np.stack([(gradient*(membership==g)[:,:,None]).sum(axis=1) for g in range(count)],axis=1)
    return length*.5,jac

def correct(points,triangles,groups,reference,prior=None):
    delta=np.zeros((3,3)) if prior is None else prior.copy();history=[]
    valid=groups>=0
    for iteration in range(32):
        p=points.copy();p[valid]+=delta[groups[valid]]
        area,jac=area_jacobian(p,triangles,groups,3);ratio=area/reference
        target=np.clip(ratio,.36,3.45);active=np.abs(ratio-target)>1e-5
        history.append((float(ratio.min()),float(ratio.max())))
        if not active.any():break
        J=(jac/reference[:,None,None]).reshape(-1,9)[active];error=(target-ratio)[active]
        # Favor the existing original surface. The 15 mm bound below is a
        # rejection boundary, not permission to hide large corrections.
        reg=2.;J=np.vstack((J,np.eye(9)*reg));error=np.r_[error,-delta.ravel()*reg]
        step=np.linalg.lstsq(J,error,rcond=None)[0].reshape(3,3)
        length=np.linalg.norm(step,axis=1);step*=np.minimum(1.,.0015/np.maximum(length,1e-12))[:,None]
        delta+=step;length=np.linalg.norm(delta,axis=1);delta*=np.minimum(1.,.015/np.maximum(length,1e-12))[:,None]
    return delta,history
