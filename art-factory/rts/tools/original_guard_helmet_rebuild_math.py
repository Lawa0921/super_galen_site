"""Original control surfaces, measured in meters, +Z up and +Y forward."""
import math
import numpy as np


def _resolution(segments):
    if not isinstance(segments,int) or segments<16 or segments%2:
        raise ValueError('An even resolution of at least 16 segments is required')


def crown_point(theta,t):
    rear=np.clip((-math.cos(theta)+.25)/1.25,0,1)
    rear=rear*rear*(3-2*rear)
    hem=1.711-.096*rear
    phi=t*math.pi/2
    radius=math.cos(phi)**.82
    x=.110*math.sin(theta)*radius
    depth=.141 if math.cos(theta)>=0 else .134
    y=-.026+depth*math.cos(theta)*radius
    z=hem+(1.859-hem)*math.sin(phi)
    return [x,y,z]


def crown_cage(segments=48, rows=None):
    _resolution(segments)
    rows=[0,.018,.065,.20,.40,.60,.77,.90,.967] if rows is None else list(rows)
    if len(rows)<3 or rows[0]!=0 or rows[-1]>=1 or not np.isfinite(rows).all() or not (np.diff(rows)>0).all():
        raise ValueError('Crown rows must increase from zero to below the pole')
    vertices=[crown_point(i*2*math.pi/segments,t) for t in rows for i in range(segments)]
    faces=[]
    for row in range(len(rows)-1):
        for i in range(segments):
            a=row*segments+i;b=row*segments+(i+1)%segments
            faces.append([a,b,b+segments,a+segments])
    apex=len(vertices);vertices.append([0,-.026,1.861])
    for i in range(segments):faces.append([(len(rows)-1)*segments+i,(len(rows)-1)*segments+(i+1)%segments,apex])
    return np.asarray(vertices,float),faces


def visor_point(theta,t):
    width=.108+.004*t
    depth=.144-.008*t
    x=width*math.sin(theta)
    y=-.024+depth*math.cos(theta)+.0035*max(math.cos(theta),0)**10
    upper=1.699+.003*abs(math.sin(theta))
    lower=1.569+.046*abs(math.sin(theta))**1.25
    return [x,y,upper*(1-t)+lower*t]


def visor_cage(segments=48, rows=None):
    _resolution(segments)
    rows=[0,.012,.055,.28,.55,.79,.945,.988,1] if rows is None else list(rows)
    if len(rows)<2 or rows[0]!=0 or rows[-1]!=1 or not np.isfinite(rows).all() or not (np.diff(rows)>0).all():
        raise ValueError('Visor rows must increase from zero to one')
    vertices=[visor_point(-1.65+3.3*i/segments,t) for t in rows for i in range(segments+1)]
    faces=[];width=segments+1
    for row in range(len(rows)-1):
        for i in range(segments):
            a=row*width+i;faces.append([a,a+1,a+1+width,a+width])
    return np.asarray(vertices,float),faces


def cylindrical_surface_uvs(vertices, faces, repeat=.10, center_y=-.026,
                            radii=(.110,.141)):
    """Continuous angular UVs with one rear seam and physical vertical scale.

    Per-face unwrapping changes only the rear seam. Its integer repeat count
    makes both sides sample the same source texels. Pole loops use their face's
    neighboring angles, avoiding a texture stretch across the whole crown.
    """
    if not np.isfinite(repeat) or repeat <= 0 or min(radii) <= 0:
        raise ValueError('Positive finite texture repeat and radii are required')
    points = np.asarray(vertices, dtype=float)
    radial = np.column_stack((points[:,0]/radii[0],
                              (points[:,1]-center_y)/radii[1]))
    angles = np.arctan2(radial[:,0], radial[:,1])
    distance = np.linalg.norm(radial, axis=1)
    a,b = radii
    circumference = math.pi*(3*(a+b)-math.sqrt((3*a+b)*(a+3*b)))
    repeats = max(1, round(circumference/repeat))
    result = []
    for face in faces:
        ids = np.asarray(face, dtype=int)
        theta = angles[ids].copy()
        regular = distance[ids] > 1e-9
        if regular.any():
            if np.ptp(theta[regular]) > math.pi:
                theta[theta > 0] -= 2*math.pi
            theta[~regular] = theta[regular].mean()
        uv = np.column_stack(((theta+math.pi)/(2*math.pi)*repeats,
                              points[ids,2]/repeat))
        result.append(uv)
    return result


def resample_texture_box(pixels, factor=4):
    """Area-sample the existing generated source; preserve its mean and alpha."""
    values = np.asarray(pixels, dtype=float)
    if (values.ndim != 3 or not isinstance(factor,int) or factor < 1 or
            values.shape[0] % factor or values.shape[1] % factor):
        raise ValueError('Texture dimensions must be divisible by sampling factor')
    height,width,channels = values.shape
    return values.reshape(height//factor,factor,width//factor,factor,channels).mean(axis=(1,3))
