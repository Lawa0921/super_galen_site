"""Close-range readable closed hands for roster-expansion units (a real fist around the haft).

Canonical grip frame of procedural_gauntlet_build.hand_frame: origin = grip centre, +Z = haft axis
(thumb side), the back of the hand faces +X and the wrist lies toward -Y. The fist is built from
anatomical masses rather than rings:

* palm   - a solid slab extruded across the hand width whose cross-section runs from the knuckle row
           to the wrist and whose inner face hugs the haft over the palm quadrant (no hollow);
           width tapers from the four-finger knuckle row to the wrist; rounded edges at both ends.
* finger - four touching fingers (index/middle/ring/little, staggered lengths), each three
           phalanges with a raised knuckle on the back of the fist, joint swells, crease waists and
           a rounded tip; they root inside the palm and wrap ~250 degrees so the tips press back
           into the heel of the palm: the grip is closed all the way round.
* thumb  - rises from the palm's index edge and lies across the index/middle middle phalanges.
* cuff   - capped, elliptical and sized from the body's wrist so the sleeve opening is covered.

All shells are closed (outward normals recomputed) and weighted Hand, blending to Forearm at the
wrist, so the hand-contact QA (gap, wrap sectors, cuff crossings) applies unchanged.
"""
import json
import math

import bmesh
from mathutils import Matrix, Vector

import procedural_gauntlet_build as g

# name, axial offset (finger widths from the fist centre, + = index/thumb side), wrap end (deg), width scale
FINGERS = (('index', 1.5, 258, 1.0), ('middle', .5, 268, 1.03), ('ring', -.5, 262, .99), ('little', -1.47, 250, .94))
JOINTS_DEG = (6, 98, 182)        # knuckle (MCP), PIP, DIP positions along the wrap


def smooth(x):
    return g.smooth(x)


def _outward_normals(points):
    n = len(points)
    area = sum(points[i][0] * points[(i + 1) % n][1] - points[(i + 1) % n][0] * points[i][1] for i in range(n))
    sign = 1 if area > 0 else -1          # CCW -> outward normal is (dy, -dx)
    normals = []
    for i in range(n):
        a, b, c = points[i - 1], points[i], points[(i + 1) % n]
        e1 = Vector((b[0] - a[0], b[1] - a[1])).normalized()
        e2 = Vector((c[0] - b[0], c[1] - b[1])).normalized()
        n1 = Vector((e1.y, -e1.x)) * sign
        n2 = Vector((e2.y, -e2.x)) * sign
        normals.append((n1 + n2).normalized())
    return normals


def palm_part(material, ri, fw, ft, wrist, wrist_radius, zc, detail, hook=False):
    th = ft * 1.30
    x_in, x_out = ri, ri + th
    y_top = .0055
    y_w = min(-.045, wrist.y * .92)
    # Inner face hugs the haft from the knuckle row round under it (to -104 deg); the heel of the
    # palm continues under the haft so the curled fingertips press into it (a closed fist, no C gap).
    arc = [math.radians(a) for a in ((10, -8, -26, -44, -62, -78, -92, -104) if detail == 0 else (10, -26, -62, -92, -104))]
    if hook:
        arc = [math.radians(a) for a in ((10, -6, -22) if detail == 0 else (10, -22))]
    yh = -(ri + ft * 1.0)
    pts = [(x_out - .004, y_top), (x_out - .012, y_top + .0012)]
    pts += [(ri * math.cos(t), ri * math.sin(t)) for t in arc]
    if hook:      # draw hand: the string lies in the finger crease, the palm stays clear of it
        pts += [(x_in + .001, -ri * .8 - .002), (x_in + .002, -ri + (y_w + ri) * .5), (x_in + .004, y_w),
                ((x_in + x_out) * .5, y_w - .003), (x_out - .002, y_w), (x_out + .0025, y_w * .55), (x_out + .002, -.012),
                (x_out + .0005, y_top - .004)]
    else:
        pts += [(-.0125, -(ri + ft * .52)), (-.0075, yh + .0012), (.004, yh - .0008), (x_in - .003, yh - .0005),
            (x_in + .002, yh + (y_w - yh) * .5), (x_in + .004, y_w),
            ((x_in + x_out) * .5, y_w - .003), (x_out - .002, y_w), (x_out + .0025, y_w * .55), (x_out + .002, -.012),
            (x_out + .0005, y_top - .004)]
    normals = _outward_normals(pts)
    half = 2.0 * fw
    if detail == 0:
        zs = ((-1, .0085), (-1 + .0022 / half, .0042), (-1 + .0060 / half, .0013), (-1 + .013 / half, 0), (-.3, 0), (.3, 0),
              (1 - .013 / half, 0), (1 - .0060 / half, .0013), (1 - .0022 / half, .0042), (1, .0085))
    else:
        zs = ((-1, .004), (-1 + .008 / half, 0), (1 - .008 / half, 0), (1, .004))
    wz = max(-1.2 * fw, min(1.2 * fw, wrist.z)) - zc
    part = g.Part('palm', material)
    rings, centers = [], []
    for zf, inset in zs:
        ring = []
        for (x, y), nrm in zip(pts, normals):
            along = max(0.0, min(1.0, -y / max(1e-4, -y_w)))           # 0 at knuckles .. 1 at wrist
            taper = 1 - .36 * smooth((along - .62) / .38)
            z = zc + zf * half * taper + wz * .8 * smooth(along)
            px, py = x - nrm.x * inset, y - nrm.y * inset
            if x > x_out - .003:                                         # domed back of the hand
                px += .0032 * (1 - zf * zf) * math.sin(math.pi * min(1.0, along * 1.1))
            elif y < -ri * .9 and x < x_in:                              # fleshy heel under the haft
                py -= .0018 * (1 - zf * zf)
            ring.append(len(part.verts))
            part.verts.append(Vector((px, py, z)))
            part.weights.append({'Hand': 1.0})          # rigid palm: the wrist bend happens in the cuff
        rings.append(ring)
        centers.append(Vector((0, 0, zc + zf * half)))
    n = len(pts)
    for k in range(len(rings) - 1):
        a, b = rings[k], rings[k + 1]
        for j in range(n):
            j2 = (j + 1) % n
            part.faces.append((a[j], a[j2], b[j2], b[j]))
            part.uvs.append(tuple((part.verts[i].x / .12 + part.verts[i].z / .12, part.verts[i].y / .12) for i in (a[j], a[j2], b[j2], b[j])))
    for ring in (rings[0], rings[-1]):
        part.faces.append(tuple(ring))
        part.uvs.append(tuple((part.verts[i].x / .12, part.verts[i].y / .12) for i in ring))
    return part


def finger_part(name, material, ri, fw, ft, z, end_deg, ws, detail):
    part = g.Part(name, material)
    t0, t1 = math.radians(-6), math.radians(end_deg)
    steps = 20 if detail == 0 else 10
    around = 8 if detail == 0 else 6
    half_t, half_w = ft * .5 * (.96 + .04 * ws), fw * .525 * ws
    rings, centers = [], []
    for k in range(steps + 1):
        u = k / steps
        theta = t0 + (t1 - t0) * u
        deg = math.degrees(theta)
        radial = Vector((math.cos(theta), math.sin(theta), 0))
        knuckle = .26 * math.exp(-((deg - JOINTS_DEG[0]) / 11) ** 2)          # raised back-of-fist knuckle
        joints = sum(.09 * math.exp(-((deg - j) / 9) ** 2) for j in JOINTS_DEG[1:] if j < end_deg - 15)
        segs = [(-6, JOINTS_DEG[1]), (JOINTS_DEG[1], JOINTS_DEG[2]), (JOINTS_DEG[2], end_deg)]
        waist = 1 - sum(.045 * math.sin(math.pi * (deg - a) / (b - a)) for a, b in segs if a <= deg <= b)
        tip_u = (deg - (end_deg - 16)) / 16
        tip = 1.0 if tip_u <= 0 else math.sqrt(max(.0, 1 - tip_u ** 2)) * .72 + .28
        thick = half_t * (1 + knuckle + joints) * waist * tip
        wide = half_w * (1 + .2 * knuckle + .3 * joints) * (waist * .25 + .75) * (.6 + .4 * tip)
        c = radial * (ri + thick) + Vector((0, 0, z))
        centers.append(c)
        rings.append(part.ring(c, radial, Vector((0, 0, 1)), thick, wide, around, p=4.2, phase=math.pi / around, weights={'Hand': 1}))   # squared phalanx section: fingers meet flat, no ring look
    part.loft(rings, centers, repeat=.12)
    return part


def thumb_part(material, ri, fw, ft, x_in, y_w, z_index, detail, hook=False, scale=1.0):
    part = g.Part('thumb', material)
    tt, tw = ft * .56 * scale, fw * .56 * scale
    rt = ri + ft * .98 + tt * .92                          # rests on the fingers' outer surface
    # The thumb roots in the heel of the palm under the haft (index end) and lies flat across the
    # index/middle fingers' middle phalanges, hugging the fist instead of looping over it.
    pts = []
    n = 14 if detail == 0 else 8
    if hook:      # draw hand: thumb relaxed back along the palm toward the jaw, clear of the string
        for k in range(n + 1):
            u = k / n
            pts.append(Vector((x_in + .006 - .010 * u, -ri - .004 - .040 * u, z_index + (.45 - .55 * u) * fw)))
    for k in range(0 if hook else n + 1):
        u = k / n
        t = math.radians(-92 - 84 * u)
        rad = (ri + ft * .45) + (rt - (ri + ft * .45)) * smooth(u / .38)
        pts.append(Vector((rad * math.cos(t), rad * math.sin(t), z_index + (.50 - 1.15 * smooth(u)) * fw)))   # index edge -> over the middle finger
    rings, centers = [], []
    total = len(pts)
    for i, c in enumerate(pts):
        u = i / (total - 1)
        tangent = (pts[min(total - 1, i + 1)] - pts[max(0, i - 1)]).normalized()
        radial = Vector((c.x, c.y, 0)).normalized()
        width = tangent.cross(radial).normalized()
        thick_axis = width.cross(tangent).normalized()
        if thick_axis.dot(radial) < 0:
            thick_axis = -thick_axis
        base = 1.30 - .30 * smooth(u / .4)                     # fleshy thenar root
        joint = .10 * math.exp(-((u - .62) / .07) ** 2)
        tip = 1.0 if u < .86 else math.sqrt(max(.0, 1 - ((u - .86) / .14) ** 2)) * .7 + .3
        centers.append(c)
        rings.append(part.ring(c, thick_axis, width, tt * base * (1 + joint) * tip, tw * base * (1 + joint * .5) * (.6 + .4 * tip),
                               8 if detail == 0 else 6, p=2.6, weights={'Hand': 1}))
    part.loft(rings, centers, repeat=.12)
    return part


def cuff_part(material, wrist, forearm_dir, x_axis, wrist_radius, detail, flare=True):
    """Wrist into the sleeve: a slim wrist (6 x 4.5 cm) leaving the palm; gloves end in a short flared
    gauntlet rim sized from the body's wrist so the sleeve opening stays covered."""
    part = g.Part('cuff', material)
    f = forearm_dir.normalized()
    U = (x_axis - f * x_axis.dot(f)).normalized()
    V = f.cross(U).normalized()
    n = 14 if detail == 0 else 8
    rings, centers = [], []
    rim = wrist_radius * .86 if flare else wrist_radius * .62
    # Conical gauntlet: rim hidden at the sleeve opening, tapering smoothly onto the palm.
    samples = ((-.066, rim * .90, rim * .98, 1.0), (-.050, rim * .86, rim * .94, 1.0), (-.034, rim * .66, rim * .78, 1.0),
               (-.018, .0205, .0300, .9), (-.006, .0170, .0275, .6), (.004, .0150, .0270, .3), (.016, .0130, .0270, 0.0))
    if not flare:  # bare forearm: thickens toward the elbow, flattening into the wrist
        samples = ((-.070, .0250, .0315, 1.0), (-.050, .0238, .0308, 1.0), (-.032, .0222, .0300, .95),
                   (-.016, .0200, .0292, .85), (-.004, .0178, .0284, .55), (.006, .0160, .0280, .25), (.016, .0140, .0278, 0.0))
    for s, a, b, fore in samples:
        c = wrist + f * s
        centers.append(c)
        rings.append(part.ring(c, U, V, a, b, n, p=2.3, weights={'Forearm': fore, 'Hand': 1 - fore}))
    part.loft(rings, centers, cap_start=True, cap_end=True, repeat=.12)
    return part


def build_hand(name, rig, side, center, axis, radius, wrist, wrist_radius, ref, mats, material, detail=0, flare=True, split=0.0, hook=False, thumb_scale=1.0):
    """`split` opens a gap (m) between the middle and ring fingers, e.g. for an arrow held between them."""
    cfg = dict(g.GAUNTLET_DEFAULTS)
    cfg.update(finger_width=.0212, finger_thickness=.0188, repeat=.12)
    fw, ft = cfg['finger_width'], cfg['finger_thickness']
    outward = Vector((1 if side == 'R' else -1, .15, 0))
    frame, local, thumb = g.hand_frame(center, axis, wrist, radius, cfg, side, outward)
    ri = radius + .0012
    zc = max(-.6 * fw, min(.6 * fw, local.z * .35))
    palm = palm_part(material, ri, fw, ft, local, wrist_radius, zc, detail, hook)
    parts = [palm]
    for fname, offset, end_deg, ws in FINGERS:
        if hook:  # hooked on the string: fingers curl ~180 deg, the little finger folds into the palm
            end_deg = {'index': 176, 'middle': 184, 'ring': 178, 'little': 236}[fname]
        parts.append(finger_part('finger_' + fname, material, ri, fw, ft, zc + offset * fw + math.copysign(split * .5, offset), end_deg, ws, detail))
    parts.append(thumb_part(material, ri, fw, ft, ri, min(-.045, local.y * .92), zc + 1.5 * fw + split * .5, detail, hook, thumb_scale))
    parts = [p.transformed(frame, mirror_x=side == 'L') for p in parts]
    fb = rig.pose.bones['Forearm_' + side]
    proximal = -(fb.tail - fb.head).normalized()
    x_world = frame.to_3x3() @ Vector((1, 0, 0))
    parts.append(cuff_part(material, wrist, -proximal, x_world, wrist_radius, detail, flare))
    for p in parts:
        p.weights = [{('Hand_' if k == 'Hand' else 'Forearm_') + side: v for k, v in w.items()} for w in p.weights]
        g.to_bind(p, ref)
    obj = g.parts_to_object(name, parts, rig, mats)
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(obj.data)
    bm.free()
    obj['original_gauntlet_parts'] = json.dumps([p.name for p in parts])
    obj['assembly_refinement'] = ('Anatomical closed fist: solid palm hugging the haft, four touching three-phalanx fingers '
                                  'with back-of-fist knuckles wrapping into the palm heel, crossing thumb, capped cuff (roster_hands.py)')
    obj.data.set_sharp_from_angle(angle=math.radians(85))
    record = {'name': name, 'side': side, 'lod': detail, 'grip_type': 'hook' if hook else 'closed', 'grip': list(center), 'axis': list(axis), 'radius': radius, 'wrist': list(wrist),
              'wrist_radius': wrist_radius, 'triangles': g.tri_count(obj), 'parts': [p.name for p in parts]}
    return obj, record


def build_open_hand(name, rig, side, wrist_radius, mats, material, detail=0):
    """Relaxed open hand in the bind pose (replaces a generated body's blob hand): a rounded palm
    slab from the wrist to the knuckle row, four slightly curled three-phalanx fingers (index on
    the thumb side, staggered lengths), an opposable thumb angled forward from the palm's side and a
    slim wrist into the sleeve. Palm faces the body midline at rest; everything weighted Hand
    (wrist blends to Forearm). Proportions follow the Hand bone (wrist -> fingertip)."""
    hb = rig.data.bones['Hand_' + side]
    head, tail = hb.head_local.copy(), hb.tail_local.copy()
    b = (tail - head).normalized()
    length = max((tail - head).length, .175)                    # adult hand, wrist -> middle fingertip
    inward = Vector((1 if side == 'L' else -1, 0, 0))
    n = (inward - b * inward.dot(b)).normalized()               # palm normal (toward the midline)
    t = Vector((0, 1, 0))
    t = (t - b * t.dot(b) - n * t.dot(n)).normalized()          # thumb side (forward)
    fw = length * .118
    ft = length * .100
    hand_w = {'Hand': 1.0}
    parts = []
    # Palm: rounded slab along b, slightly cupped (thicker heel, thinner toward the knuckles).
    palm = g.Part('palm', material)
    lp = length * .50
    steps = 6 if detail == 0 else 3
    rings, centers = [], []
    for k in range(steps + 1):
        u = k / steps
        c = head + b * (length * .02 + lp * u) + t * (fw * .15)
        half_w = fw * (1.55 + .45 * smooth(u / .6))
        half_t = ft * (.80 - .18 * u)
        if k in (0, steps):
            half_w *= .9
        centers.append(c)
        rings.append(palm.ring(c, n, t, half_t, half_w, 12 if detail == 0 else 8, p=2.8, weights=hand_w))
    palm.loft(rings, centers, repeat=.12)
    parts.append(palm)
    knuckle = head + b * (length * .02 + lp)
    # Fingers: index .. little, curling toward the palm (n) joint by joint.
    spec = (('index', 1.45, .44), ('middle', .48, .49), ('ring', -.48, .46), ('little', -1.40, .37))
    for fname, off, flen in spec:
        part = g.Part('finger_' + fname, material)
        pos = knuckle + t * (off * fw) - n * (ft * .12)
        direction = b.copy()
        seg_len = [flen * length * s for s in (.45, .30, .25)]
        curl = (math.radians(14), math.radians(20), math.radians(16))
        pts = [pos.copy()]
        for L, a in zip(seg_len, curl):
            axis_rot = direction.cross(n).normalized()
            direction = (Matrix.Rotation(a, 3, axis_rot) @ direction).normalized()   # curl toward the palm
            n_steps = 3 if detail == 0 else 2
            for k in range(1, n_steps + 1):
                pts.append(pts[-1] + direction * (L / n_steps))
        width = fw * (.47 if fname != 'little' else .42)
        thick = ft * (.40 if fname != 'little' else .36)
        rings, centers = [], []
        total = len(pts)
        for i, c in enumerate(pts):
            u = i / (total - 1)
            tangent = (pts[min(total - 1, i + 1)] - pts[max(0, i - 1)]).normalized()
            side_axis = t - tangent * t.dot(tangent)
            side_axis.normalize()
            th_axis = tangent.cross(side_axis).normalized()
            if th_axis.dot(n) < 0:
                th_axis = -th_axis
            joint = 1 + .08 * sum(math.exp(-((u - j) / .05) ** 2) for j in (.45, .75))
            tip = 1.0 if u < .85 else math.sqrt(max(.0, 1 - ((u - .85) / .15) ** 2)) * .7 + .3
            centers.append(c)
            rings.append(part.ring(c, th_axis, side_axis, thick * joint * tip, width * joint * (.6 + .4 * tip), 8 if detail == 0 else 6, p=2.6, weights=hand_w))
        part.loft(rings, centers, repeat=.12)
        parts.append(part)
    # Thumb: from the palm's thumb edge near the heel, angled forward and slightly across the palm.
    thumb = g.Part('thumb', material)
    base = head + b * (length * .14) + t * (fw * 1.35) + n * (ft * .15)
    d0 = (b * .55 + t * .60 + n * .30).normalized()
    pts = [base]
    direction = d0
    for L, a in ((length * .17, math.radians(10)), (length * .14, math.radians(18))):
        axis_rot = direction.cross(n).normalized()
        direction = (Matrix.Rotation(a, 3, axis_rot) @ direction).normalized()   # curl toward the palm
        for k in range(1, 4 if detail == 0 else 3):
            pts.append(pts[-1] + direction * (L / (3 if detail == 0 else 2)))
    rings, centers = [], []
    total = len(pts)
    for i, c in enumerate(pts):
        u = i / (total - 1)
        tangent = (pts[min(total - 1, i + 1)] - pts[max(0, i - 1)]).normalized()
        w_axis = (n.cross(tangent)).normalized()
        th_axis = tangent.cross(w_axis).normalized()
        root = 1.45 - .45 * smooth(u / .35)
        tip = 1.0 if u < .85 else math.sqrt(max(.0, 1 - ((u - .85) / .15) ** 2)) * .7 + .3
        centers.append(c)
        rings.append(thumb.ring(c, th_axis, w_axis, ft * .44 * root * tip, fw * .52 * root * (.6 + .4 * tip), 8 if detail == 0 else 6, p=2.5, weights=hand_w))
    thumb.loft(rings, centers, repeat=.12)
    parts.append(thumb)
    fb = rig.data.bones['Forearm_' + side]
    distal = (fb.tail_local - fb.head_local).normalized()
    parts.append(cuff_part(material, head, distal, n, wrist_radius, detail, flare=False))
    for p in parts:
        p.weights = [{('Hand_' if k == 'Hand' else 'Forearm_') + side: v for k, v in w.items()} for w in p.weights]
    obj = g.parts_to_object(name, parts, rig, mats)
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(obj.data)
    bm.free()
    obj['original_gauntlet_parts'] = json.dumps([p.name for p in parts])
    obj['assembly_refinement'] = 'Procedural open relaxed hand: palm slab, four curled three-phalanx fingers, opposable thumb, slim wrist (roster_hands.build_open_hand)'
    obj.data.set_sharp_from_angle(angle=math.radians(85))
    return obj, {'name': name, 'side': side, 'lod': detail, 'open': True, 'triangles': g.tri_count(obj)}
