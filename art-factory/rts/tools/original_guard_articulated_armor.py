"""Original shaped plate shells in explicit anatomical articulation frames.

Design preflight only. New plate helpers follow the measured elbow plane; they
do not change original limb bones, hand motion or weapon binding. Every output
vertex retains part/row/column/shell identity for assembly and LOD inspection.
"""
from collections import Counter
import math

import numpy as np

from elbow_hinge_frame import hinge_skin_matrices

THICKNESS = .0025


def unit(value):
    value = np.asarray(value, float)
    length = np.linalg.norm(value)
    if not np.isfinite(length) or length < 1e-8:
        raise ValueError('Finite nondegenerate frame required')
    return value / length


def frame(axis, front):
    axis = unit(axis)
    front = unit(front - np.dot(front, axis)*axis)
    return np.column_stack((np.cross(axis, front), axis, front))


def module_skin_matrices(rest, posed):
    upper, fore = hinge_skin_matrices(rest, posed)
    rest, posed = np.asarray(rest, float), np.asarray(posed, float)
    ra, pa = np.diff(rest, axis=0), np.diff(posed, axis=0)
    ra /= np.linalg.norm(ra, axis=1)[:, None]
    pa /= np.linalg.norm(pa, axis=1)[:, None]
    rotation = frame(pa[0]+pa[1], pa[1]-pa[0]) @ frame(ra[0]+ra[1], np.array([0., 1, 0])).T
    couter = np.eye(4)
    couter[:3, :3], couter[:3, 3] = rotation, posed[1]-rotation @ rest[1]
    return upper, fore, couter


def shell(points, normals, faces, identities, uv, brass, name):
    points, normals = np.asarray(points), np.asarray(normals)
    count = len(points)
    directed = Counter((a, b) for f in faces for a, b in zip(f, f[1:]+f[:1]))
    boundaries = [(a, b) for a, b in directed if not directed[(b, a)]]
    result_faces = faces + [[v+count for v in reversed(f)] for f in faces]
    result_faces += [[b, a, a+count, b+count] for a, b in boundaries]
    return {'name': name, 'points': np.concatenate((points, points-THICKNESS*normals)).tolist(),
            'faces': result_faces, 'outer_count': count,
            'surface_ids': [[name, *identity, side] for side in ('outer', 'inner') for identity in identities],
            'uv': uv+uv, 'materials': brass+brass+[1]*len(boundaries),
            'thickness_m': THICKNESS}


def plate(rest, name, lod):
    upper = name == 'UpperArmArmor'
    axis = unit(rest[1]-rest[0] if upper else rest[2]-rest[1])
    basis = frame(axis, np.array([0., 1, 0]))
    # Preserve the distal lap transition in both LODs. Removing .92 makes a
    # long chord across the taper which cuts through the separately rolled cuff.
    rows = [0., .018, .08, .33, .64, .92, .982, 1.] if lod == 0 else [0., .018, .5, .92, .982, 1.]
    cols = 20 if lod == 0 else 12

    def surface(u, v):
        theta = 2*math.pi*v
        inner = max(0., math.sin(theta))
        # Explicit deep flexor relief. At125deg all plate points must remain on
        # their own side of the bisector, including thickness and raised rims.
        relief = (.042+.098*inner**2) if upper else (.044+.098*inner**2)
        distance = (1-u)*.242+u*relief if upper else (1-u)*relief+u*.245
        radius = (.061-.001*u+.002*math.sin(math.pi*u)) if upper else (.062-.018*u*u*(3-2*u)+.002*math.sin(math.pi*u))
        # A narrow original extensor crest and physical rolled edge profile.
        crest_angle = math.atan2(math.sin(theta-1.5*math.pi), math.cos(theta-1.5*math.pi))
        radius += .003*math.exp(-(crest_angle/.30)**2)*math.sin(math.pi*u)**2
        radius += .0012*(math.exp(-((u-.018)/.025)**2)+math.exp(-((u-.982)/.025)**2))
        local = np.array([radius*math.cos(theta), -distance if upper else distance, .96*radius*math.sin(theta)])
        return rest[1]+basis @ local

    return grid_shell(name, surface, rows, cols)


def grid_shell(name, surface, rows, cols, periodic=True):
    width = cols if periodic else cols+1

    points, normals, ids, uv = [], [], [], []
    for i, u in enumerate(rows):
        for j in range(width):
            v = j/cols
            points.append(surface(u, v))
            du = (surface(u+1e-5, v)-surface(u-1e-5, v))/(2e-5)
            dv = (surface(u, v+1e-5)-surface(u, v-1e-5))/(2e-5)
            normals.append(unit(np.cross(du, dv)))
            ids.append([i, j])
            uv.append([v*1.75, u*2.5])
    faces, brass = [], []
    for i in range(len(rows)-1):
        for j in range(cols):
            faces.append([i*width+j, (i+1)*width+j, (i+1)*width+(j+1)%width, i*width+(j+1)%width])
            brass.append(int(i in (0, len(rows)-2) or not periodic and j in (0, cols-1)))
    result = shell(points, normals, faces, ids, uv, brass, name)
    result['periodic_columns'], result['rows'] = cols if periodic else None, rows
    return result


def interface_shell(rest, name, lod):
    shoulder = name == 'ShoulderSpaulder'
    axis = unit(rest[1]-rest[0] if shoulder else rest[2]-rest[1])
    basis = frame(axis, np.array([0., 1, 0]))
    rows = [0., .02, .15, .35, .55, .65, .78, .9, .98, 1.] if shoulder else [0., .04, .25, .65, .96, 1.]
    if lod == 1:
        rows = [0., .04, .35, .65, .9, 1.] if shoulder else [0., .04, .5, .96, 1.]
    cols = (20 if lod == 0 else 12) if shoulder else (16 if lod == 0 else 12)

    def surface(u, v):
        if shoulder:
            # Retain the original rounded shoulder crown; author its distal
            # collar as a flare instead of the old closing spheroid tip.
            theta = -.12+v*5.28
            distance = -.128+u*.256
            original = .025+.053*max(0., math.sin(math.pi*u))**.7
            q = np.clip((u-.55)/.25, 0, 1)
            blend = q*q*(3-2*q)
            radius = original*(1-blend)+.081*blend
            radius += .003*math.sin(math.pi*u)**2*(.5+.5*math.sin(math.pi*v)**2)
            depth = .92*radius
            origin = rest[0]
        else:
            theta = 2*math.pi*v
            distance = .230+.048*u
            radius = .050+.003*u*u*(3-2*u)+.0008*math.sin(2*math.pi*u)**2
            depth = .98*radius
            origin = rest[1]
        return origin+basis @ np.array([radius*math.cos(theta), distance, depth*math.sin(theta)])

    return grid_shell(name, surface, rows, cols, periodic=not shoulder)


def couter(rest, lod):
    axes = np.diff(rest, axis=0)
    axes /= np.linalg.norm(axes, axis=1)[:, None]
    basis = frame(axes.sum(axis=0), np.array([0., 1, 0]))
    radii, cols = ([.25, .5, .75, .93, 1.], 24) if lod == 0 else ([.5, .93, 1.], 12)
    points, normals, ids, uv = [], [], [], []

    def add(rho, theta, identity):
        x, along = .065*rho*math.cos(theta), .072*rho*math.sin(theta)
        depth = -.075+.021*rho*rho
        points.append(rest[1]+basis @ np.array([x, along, depth]))
        normals.append(basis @ unit([.042*x/.065**2, .042*along/.072**2, -1.]))
        ids.append(identity)
        uv.append([.875+x/.13*1.75, 1.25+along/.144*2.5])

    add(0, 0, [0, 0])
    for i, radius in enumerate(radii):
        for j in range(cols):
            add(radius, 2*math.pi*j/cols, [i+1, j])
    faces = [[0, 1+(j+1)%cols, 1+j] for j in range(cols)]
    brass = [0]*cols
    for i in range(len(radii)-1):
        for j in range(cols):
            a, b = 1+i*cols+j, 1+i*cols+(j+1)%cols
            faces.append([a, b, b+cols, a+cols])
            brass.append(int(i == len(radii)-2))
    # Parameter orientation is checked geometrically, not inferred from names.
    for i, f in enumerate(faces):
        if np.dot(np.cross(points[f[1]]-points[f[0]], points[f[2]]-points[f[0]]), normals[f[0]]) < 0:
            faces[i] = list(reversed(f))
    return shell(points, normals, faces, ids, uv, brass, 'ElbowArmor')


def build_module(rest, lod, include_interfaces=False):
    if lod not in (0, 1):
        raise ValueError('Only explicit LOD0 and LOD1 loop schedules are authored')
    rest = np.asarray(rest, float)
    if rest.shape != (3, 3) or not np.isfinite(rest).all():
        raise ValueError('Three finite rest joints required')
    result = {name: plate(rest, name, lod) for name in ('UpperArmArmor', 'ForearmArmor')} | {'ElbowArmor': couter(rest, lod)}
    if include_interfaces:
        result.update({name: interface_shell(rest, name, lod) for name in ('ShoulderSpaulder', 'WristCuff')})
    return result
