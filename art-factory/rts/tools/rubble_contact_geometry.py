"""Closest distance between closed 3D edge segments, including degeneracies."""
from math import sqrt

def segment_distance(p0,p1,q0,q1):
 u=[b-a for a,b in zip(p0,p1)];v=[b-a for a,b in zip(q0,q1)];w=[a-b for a,b in zip(p0,q0)]
 dot=lambda a,b:sum(x*y for x,y in zip(a,b))
 clamp=lambda x:max(0.,min(1.,x))
 a,b,c,d,e=dot(u,u),dot(u,v),dot(v,v),dot(u,w),dot(v,w)
 if a<1e-20:s=0.;t=clamp(e/c)if c>1e-20 else 0.
 elif c<1e-20:t=0.;s=clamp(-d/a)
 else:
  denom=a*c-b*b;s=clamp((b*e-c*d)/denom)if denom>1e-20 else 0.;t=(b*s+e)/c
  if t<0:t=0.;s=clamp(-d/a)
  elif t>1:t=1.;s=clamp((b-d)/a)
 return sqrt(sum((w[i]+s*u[i]-t*v[i])**2 for i in range(3)))
