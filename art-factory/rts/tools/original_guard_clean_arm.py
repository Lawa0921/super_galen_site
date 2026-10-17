"""Original shaped control surfaces and bend deformation for a right guard arm."""
import math
import numpy as np

LEGACY_AXIS_START = np.array([.29, .02, 1.42], dtype=float)
LEGACY_AXIS_END = np.array([.42, .025, 1.025], dtype=float)
AXIS_START = np.array([.2537, 0., 1.3741], dtype=float)
PIVOT = np.array([.3513, 0., 1.1009], dtype=float)
AXIS_END = np.array([.4294, 0., .8472], dtype=float)
UPPER_LENGTH = float(np.linalg.norm(PIVOT - AXIS_START))
FOREARM_LENGTH = float(np.linalg.norm(AXIS_END - PIVOT))
AXIS_LENGTH = UPPER_LENGTH + FOREARM_LENGTH
ELBOW_T = UPPER_LENGTH / AXIS_LENGTH
AXIS = (AXIS_END - AXIS_START) / np.linalg.norm(AXIS_END - AXIS_START)
UPPER_AXIS = (PIVOT - AXIS_START) / UPPER_LENGTH
FOREARM_AXIS = (AXIS_END - PIVOT) / FOREARM_LENGTH
FRONT = np.array([0., 1., 0.])
def projected_front(axis):
    front = FRONT - np.dot(FRONT, axis) * axis
    return front / np.linalg.norm(front)
UPPER_LATERAL = np.cross(UPPER_AXIS, projected_front(UPPER_AXIS))
UPPER_LATERAL /= np.linalg.norm(UPPER_LATERAL)
FOREARM_LATERAL = np.cross(FOREARM_AXIS, projected_front(FOREARM_AXIS))
FOREARM_LATERAL /= np.linalg.norm(FOREARM_LATERAL)
HINGE = UPPER_LATERAL + FOREARM_LATERAL
HINGE /= np.linalg.norm(HINGE)
ROLL_PIVOT = PIVOT + .43 * (AXIS_END - PIVOT)


def smoothstep(x):
    x = np.clip(x, 0., 1.)
    return x*x*(3.-2.*x)


def lateral_at(t):
    q=smoothstep((float(t)-(ELBOW_T-.10))/.20)
    lateral=(1.-q)*UPPER_LATERAL+q*FOREARM_LATERAL
    return lateral/np.linalg.norm(lateral)


def center(t):
    """Piecewise centerline passes exactly through GuardRig20 joints."""
    t=float(t)
    if t <= ELBOW_T:
        q=t/ELBOW_T
        point=AXIS_START+q*(PIVOT-AXIS_START)
    else:
        q=(t-ELBOW_T)/(1.-ELBOW_T)
        point=PIVOT+q*(AXIS_END-PIVOT)
    return point+lateral_at(t)*(.004*math.sin(math.pi*q))


def radius(t, component):
    if component == "FlexibleSleeve":
        elbow_bulge = math.exp(-((t-.51)/.15)**2)
        taper = smoothstep((t-.70)/.13)
        return .038 + .010*elbow_bulge - .004*taper
    if component == "ShoulderSpaulder":
        q = np.clip((t+.23)/.46, 0., 1.)
        return .025 + .053*math.sin(math.pi*q)**.7
    if component == "UpperArmArmor":
        q = np.clip((t-.16)/.31, 0., 1.)
        return .060 - .006*q + .004*math.sin(math.pi*q)
    if component == "ForearmArmor":
        q = np.clip((t-.54)/.40, 0., 1.)
        return .059 - .026*smoothstep(q) + .003*math.sin(math.pi*q)
    if component == "ElbowArmor":
        return .061
    if component == "WristCuff":
        return .035
    return .039


def surface(name, u, v):
    if name == "ShoulderSpaulder":
        theta = -.12 + v*5.28
        t = -.23 + u*.46
        lift = .016*math.sin(math.pi*u)**2 * (.45+.55*math.sin(math.pi*v)**2)
        lift += .004*math.sin(2*math.pi*u)**2
    elif name == "UpperArmArmor":
        theta = .15 + v*5.70
        t = .16 + u*(.325-.018*max(0.,math.sin(theta)))
        lift = .008*math.sin(math.pi*u)**2*(.50+.50*max(0.,math.sin(theta)))
    elif name == "ForearmArmor":
        theta = .12 + v*5.78
        t0 = .535 + .014*max(0.,math.sin(theta))
        t = t0 + u*(.955-t0)
        lift = .009*math.sin(math.pi*u)**2*(.42+.58*max(0.,math.sin(theta-.3)))
    elif name == "ElbowArmor":
        # Articulated oval couter on the elbow's extensor side, with tapered
        # ends that lap over the upper-arm and forearm lames.
        s, q = 2*u-1, 2*v-1
        width = .064*math.sqrt(.04+.96*(1-s*s))*q
        crown = -.050 - .015*(1-s*s)*(1-q*q)
        return (center(ELBOW_T) + AXIS*(.082*s) + HINGE*width + FRONT*crown)
    elif name == "WristCuff":
        theta = .12 + v*5.78
        t = .94 + u*.08  # lap 11 mm onto the hand bind plane
        lift = .002
    elif name == "FlexibleSleeve":
        theta = .012 + v*(2*math.pi-.024)
        t = -.06 + u*1.03
        lift = .002*math.sin(6*math.pi*u)**2*(.45+.55*max(0.,math.sin(theta)))
    else:
        raise ValueError(name)
    r = radius(t, name) + lift
    lateral = r*(1.+.045*math.cos(2*theta))
    depth = r*.84
    return center(t) + lateral*math.cos(theta)*lateral_at(t) + depth*math.sin(theta)*projected_front(UPPER_AXIS if t <= ELBOW_T else FOREARM_AXIS)


def segment_weights(t):
    support = .94 * math.exp(-((t-ELBOW_T)/.072)**2)
    upper_base = 1. - smoothstep((t-(ELBOW_T-.12))/.24)
    fore_base = 1. - upper_base
    upper = (1.-support)*upper_base
    fore = (1.-support)*fore_base
    total = upper + support + fore
    return [float(upper/total), float(support/total), float(fore/total)]


def cloth_weights(point):
    point=np.asarray(point,float)
    up=(PIVOT-AXIS_START)/UPPER_LENGTH
    along=float(np.dot(point-AXIS_START,up))
    if along <= UPPER_LENGTH:
        t=along/AXIS_LENGTH
    else:
        fore=(AXIS_END-PIVOT)/FOREARM_LENGTH
        t=ELBOW_T+float(np.dot(point-PIVOT,fore))/AXIS_LENGTH
    return segment_weights(float(t))


def build_part(name, rows, cols):
    periodic = name == "FlexibleSleeve"
    capped = periodic
    width = cols if periodic else cols+1
    vertices, uv = [], []
    for i in range(rows+1):
        for j in range(width):
            u, v = i/rows, j/cols
            vertices.append(surface(name, u, v).tolist())
            uv.append([v*1.75, u*2.5])
    faces = []
    for i in range(rows):
        for j in range(cols):
            jn = (j+1) % width
            a = i*width+j
            faces.append([a, a+width, (i+1)*width+jn, i*width+jn])
    if capped:
        faces.append(list(reversed(range(width))))
        faces.append([rows*width+j for j in range(width)])
    bones = {"ShoulderSpaulder":"UpperArm_R","UpperArmArmor":"UpperArm_R",
             "ElbowArmor":"ElbowSupport_R","ForearmArmor":"Forearm_R",
             "WristCuff":"Forearm_R","FlexibleSleeve":"blend"}
    bone = bones[name]
    return {"vertices":vertices, "faces":faces, "uv":uv, "bone":bone,
            "weights":[cloth_weights(p) for p in vertices] if bone=="blend" else None,
            "rows":rows, "cols":cols, "periodic":periodic, "capped":capped,
            "cage":"new authored shaped quad surface", "subdivision_levels":0}


def build_arm(high_detail=False):
    if high_detail:
        resolution={"ShoulderSpaulder":(26,32),"UpperArmArmor":(30,32),
                    "ElbowArmor":(30,36),"ForearmArmor":(38,34),
                    "WristCuff":(8,28),"FlexibleSleeve":(64,48)}
    else:
        resolution={"ShoulderSpaulder":(10,12),"UpperArmArmor":(12,12),
                    "ElbowArmor":(10,16),"ForearmArmor":(14,14),
                    "WristCuff":(4,12),"FlexibleSleeve":(20,16)}
    return {name:build_part(name,*resolution[name]) for name in resolution}


def rotation(axis, degrees):
    axis = np.asarray(axis, float)
    axis /= np.linalg.norm(axis)
    angle = math.radians(degrees)
    x,y,z = axis
    cross = np.array([[0,-z,y],[z,0,-x],[-y,x,0]])
    return np.eye(3)*math.cos(angle)+(1-math.cos(angle))*np.outer(axis,axis)+math.sin(angle)*cross


def pose_points(parts, bend, roll):
    if not math.isfinite(bend) or not math.isfinite(roll) or not 0 <= bend <= 120 or abs(roll) > 45:
        raise ValueError("Finite arm review pose outside 0..120 bend / ±45 roll")
    result = {}
    matrices = {"UpperArm_R":np.eye(3), "ElbowSupport_R":rotation(HINGE,.5*bend),
                "Forearm_R":rotation(HINGE,bend)}
    for name, part in parts.items():
        points = np.asarray(part["vertices"], float)
        deformed = []
        for bone in ("UpperArm_R","ElbowSupport_R","Forearm_R"):
            moved = (points-PIVOT) @ matrices[bone].T + PIVOT
            if bone=="Forearm_R" and roll:
                roll_pivot=(ROLL_PIVOT-PIVOT) @ matrices[bone].T+PIVOT
                bent_axis=matrices[bone] @ AXIS
                moved=(moved-roll_pivot) @ rotation(bent_axis,roll).T+roll_pivot
            deformed.append(moved)
        if part["bone"]=="blend":
            weights=np.asarray(part["weights"],float)
            result[name]=sum(weights[:,i,None]*deformed[i] for i in range(3))
        else:
            result[name]=deformed[("UpperArm_R","ElbowSupport_R","Forearm_R").index(part["bone"])]
    return result
