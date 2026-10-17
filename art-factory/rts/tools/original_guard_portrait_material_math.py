"""Original-source projection only: registration, alpha-safe sampling and gates."""
import numpy as np


def project_pixels(points,spec,head_mask):
    points=np.asarray(points,float);mask=np.asarray(head_mask,bool)
    horizontal=points@np.asarray(spec['right'],float)
    output=np.empty((len(points),2),float)
    for name,select in [('head',mask),('torso',~mask)]:
        fit=spec[name];u,z=fit['anchor'];x,y=fit['pixel'];sx,sz=fit['scale']
        output[select,0]=x+(horizontal[select]-u)*sx
        output[select,1]=y+(z-points[select,2])*sz
        if 'z_landmarks' in fit:
            landmarks=np.asarray(fit['z_landmarks'],float)
            output[select,1]=np.interp(points[select,2],landmarks[:,0],landmarks[:,1])
    return output


def sample_rgba(image,pixels):
    image=np.asarray(image,float);pixels=np.asarray(pixels,float)
    h,w=image.shape[:2];x,y=pixels.T
    valid=(x>=0)&(x<=w-1)&(y>=0)&(y<=h-1)
    x=np.clip(x,0,w-1);y=np.clip(y,0,h-1)
    x0=np.floor(x).astype(int);y0=np.floor(y).astype(int)
    x1=np.minimum(x0+1,w-1);y1=np.minimum(y0+1,h-1)
    fx=x-x0;fy=y-y0
    result=np.zeros((len(pixels),4),float)
    for xx,yy,weight in [(x0,y0,(1-fx)*(1-fy)),(x1,y0,fx*(1-fy)),(x0,y1,(1-fx)*fy),(x1,y1,fx*fy)]:
        value=image[yy,xx].copy();value[:,:3]*=value[:,3,None]
        result+=value*weight[:,None]
    alpha=result[:,3]*valid
    colors=np.divide(result[:,:3],result[:,3,None],out=np.zeros_like(result[:,:3]),where=result[:,3,None]>0)
    return colors,alpha


def view_weights(normals,directions,visibility,alpha):
    facing=np.maximum(np.asarray(normals,float)@np.asarray(directions,float).T,0)**8
    weights=facing*np.asarray(visibility)*np.where(np.asarray(alpha)>=8/255,np.asarray(alpha),0)
    return np.divide(weights,weights.sum(axis=1,keepdims=True),out=np.zeros_like(weights),where=weights.sum(axis=1,keepdims=True)>0)
