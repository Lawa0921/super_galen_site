"""Small deterministic helpers for original source-projected cloth geometry."""
import numpy as np

def closed_cloth(front,rows,cols,thickness):
    front=np.asarray(front,dtype=float)
    if rows<2 or cols<2 or thickness<=0 or not np.isfinite(thickness):
        raise ValueError('A cloth grid needs two rows/columns and positive finite thickness')
    if front.shape!=(rows*cols,3) or not np.isfinite(front).all():
        raise ValueError('Grid shape or finite coordinate mismatch')
    count=len(front)
    back=front.copy();back[:,1]-=thickness
    faces=[]
    for row in range(rows-1):
        for col in range(cols-1):
            a=row*cols+col
            face=(a,a+1,a+cols+1,a+cols)
            for tri in [(face[0],face[1],face[2]),(face[0],face[2],face[3])]:
                faces.extend((tri,tuple(v+count for v in reversed(tri))))
    rim=(list(range(cols))+[r*cols+cols-1 for r in range(1,rows)]+
         list(range((rows-1)*cols+cols-2,(rows-1)*cols-1,-1))+
         [r*cols for r in range(rows-2,0,-1)])
    for i,a in enumerate(rim):
        b=rim[(i+1)%len(rim)]
        faces.extend(((b,a,a+count),(b,a+count,b+count)))
    return np.vstack((front,back)),faces

def cloth_weights(t):
    t=np.asarray(t,dtype=float)
    if np.any(~np.isfinite(t)) or np.any(t<0) or np.any(t>1):
        raise ValueError('Cloth attachment parameter must be finite in [0,1]')
    def ease(x):
        x=np.clip(x,0,1)
        return x*x*(3-2*x)
    lower=ease((t-.58)/.42)
    upper=ease((t-.08)/.50)
    return np.column_stack((1-upper,upper-lower,lower))
