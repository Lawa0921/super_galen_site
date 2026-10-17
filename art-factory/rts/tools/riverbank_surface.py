"""Original low embankment surface with relief sampled from generated shingle."""
import math
import numpy as np

def smooth(t):
    t=max(0.,min(1.,t));return t*t*(3-2*t)

def surface(u,v,height):
    h=np.asarray(height)
    if h.ndim!=2 or min(h.shape)<2 or not np.isfinite(h).all() or not math.isfinite(u+v) or not 0<=u<=1 or not 0<=v<=1:
        raise ValueError('Surface requires bounded UV and a finite height field')
    # Repeated texture coordinates preserve both end contours exactly.
    x=u*(h.shape[1]-1);y=(v%1)*(h.shape[0]-1);ix=int(x);iy=int(y);fx=x-ix;fy=y-iy
    relief=(h[iy,ix]*(1-fx)+h[iy,min(ix+1,h.shape[1]-1)]*fx)*(1-fy)+(h[min(iy+1,h.shape[0]-1),ix]*(1-fx)+h[min(iy+1,h.shape[0]-1),min(ix+1,h.shape[1]-1)]*fx)*fy
    profile=smooth(u/.26)*(1-smooth((u-.62)/.38))
    crest=.32+.035*math.sin(v*math.tau)+.018*math.sin(v*math.tau*3+.6)
    z=max(0.,profile*(crest+(relief-.5)*.07))
    return (u-.5+.018*math.sin(math.pi*u)*math.sin(v*math.tau*2),4*v-2,z)
