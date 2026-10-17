"""Solid-angle winding of each closed shell; overlapping shells form a union."""
import numpy as np

def classify_shell_samples(winding,distances,tolerance=1e-7):
    winding=np.asarray(winding,float);distances=np.asarray(distances,float)
    if winding.shape!=distances.shape or not np.isfinite(winding).all() or not np.isfinite(distances).all() or np.any(distances<0) or tolerance<0:
        raise ValueError('Matching finite winding and nonnegative distances required')
    boundary=distances<=tolerance
    return (np.abs(winding)>.5)&~boundary,boundary


def closed_consistent_shell(faces):
    faces=np.asarray(faces,int)
    if faces.ndim!=2 or faces.shape[1]!=3 or len(faces)==0:return False
    if any(len(set(face))!=3 for face in faces):return False
    edges={}
    for face in faces:
        for a,b in zip(face,np.roll(face,-1)):
            key=(min(int(a),int(b)),max(int(a),int(b)))
            count,direction=edges.get(key,(0,0));edges[key]=(count+1,direction+(1 if a<b else -1))
    return all(count==2 and direction==0 for count,direction in edges.values())

def winding_numbers(points,vertices,faces):
    points=np.asarray(points,float);vertices=np.asarray(vertices,float);faces=np.asarray(faces,int)
    if points.ndim!=2 or points.shape[1]!=3 or vertices.ndim!=2 or vertices.shape[1]!=3 or not np.isfinite(points).all() or not np.isfinite(vertices).all():raise ValueError('Finite Nx3 coordinates required')
    if not closed_consistent_shell(faces) or faces.min()<0 or faces.max()>=len(vertices):raise ValueError('Closed consistently oriented shell required')
    triangles=vertices[faces]
    if np.any(np.linalg.norm(np.cross(triangles[:,1]-triangles[:,0],triangles[:,2]-triangles[:,0]),axis=1)==0):raise ValueError('Zero-area shell triangle')
    result=[]
    for start in range(0,len(points),128):
        offsets=triangles[None,:,:,:]-points[start:start+128,None,None,:]
        a,b,c=offsets[:,:,0],offsets[:,:,1],offsets[:,:,2]
        la,lb,lc=(np.linalg.norm(v,axis=2) for v in [a,b,c])
        numerator=np.einsum('ijk,ijk->ij',a,np.cross(b,c))
        denominator=la*lb*lc+np.einsum('ijk,ijk->ij',a,b)*lc+np.einsum('ijk,ijk->ij',b,c)*la+np.einsum('ijk,ijk->ij',c,a)*lb
        result.extend(np.sum(2*np.arctan2(numerator,denominator),axis=1)/(4*np.pi))
    return np.asarray(result)
