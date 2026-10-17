"""Local original-body cuff fitting in world rest space; no generated replacement hand."""
from mathutils import Vector
from mathutils.bvhtree import BVHTree


def fit_wrist_surface(bm, matrix_world, plane_point, normal, grip, transition_m=0.080):
    """Remove only the flared wrist excess using the actual glove cross-section.

    An 80mm smooth transition preserves the proximal forearm. The glove is not
    changed. At the shared cuff, the skin lies 1mm inside the closed glove.
    All distances are world metres, even for non-uniform object transforms.
    """
    inverse=matrix_world.inverted()
    points=[grip.matrix_world@v.co for v in grip.data.vertices]
    surface=BVHTree.FromPolygons(points,[tuple(p.vertices) for p in grip.data.polygons])
    changed=missed=sampled=0
    maximum_move=0.0
    for vert in bm.verts:
        world=matrix_world@vert.co
        delta=world-plane_point; axial=delta.dot(normal)
        radial=delta-normal*axial; radius=radial.length
        if not -1e-5<=axial<=transition_m or not 1e-5<radius<0.145: continue
        direction=radial/radius
        # Remain inside the glove's 15mm overlap, not beyond its cap.
        origin=plane_point+normal*min(max(axial,0.0),0.010)
        _,_,_,distance=surface.ray_cast(origin,direction,0.145)
        sampled+=1
        if distance is None or distance<0.010:
            missed+=1
            continue
        target_radius=max(0.010,distance-0.001)
        if radius<=target_radius: continue
        t=min(1.0,max(0.0,(axial-0.015)/(transition_m-0.015)))
        blend=t*t*(3.0-2.0*t)
        new_radius=target_radius+(radius-target_radius)*blend
        fitted=plane_point+normal*axial+direction*new_radius
        maximum_move=max(maximum_move,(fitted-world).length)
        vert.co=inverse@fitted;changed+=1
    return {'method':'actual closed-glove BVH radial envelope with 1mm inset and smooth proximal transition',
            'changed_vertices':changed,'sampled_vertices':sampled,'missed_rays':missed,
            'transition_m':transition_m,'maximum_displacement_m':maximum_move}
