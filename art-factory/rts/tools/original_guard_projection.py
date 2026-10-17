"""Deterministic four-view projection math for the original retopo guard.

This module does not generate art, unwrap geometry, or publish runtime assets.
All colors come from supplied original reference pixels or an explicit semantic
fallback. Visibility uses rasterized triangles, never sparse vertex splats.
"""
import numpy as np


def _points(values, columns):
    array = np.asarray(values, dtype=np.float64)
    if array.ndim != 2 or array.shape[1] != columns or not np.isfinite(array).all():
        raise ValueError(f"Expected finite Nx{columns} data")
    return array


def _camera(camera_from):
    camera = np.asarray(camera_from, dtype=np.float64)
    if camera.shape != (3,) or not np.isfinite(camera).all() or abs(camera[2]) > 1e-8:
        raise ValueError("Expected a horizontal canonical camera direction")
    length = np.linalg.norm(camera)
    if length < 1e-8:
        raise ValueError("Camera direction must have positive length")
    return camera / length


def _linear(srgb):
    return np.where(srgb <= .04045, srgb / 12.92, ((srgb + .055) / 1.055) ** 2.4)


def _srgb(linear):
    return np.where(linear <= .0031308, linear * 12.92, 1.055 * np.power(linear, 1 / 2.4) - .055)


def camera_coordinates(points, camera_from):
    """Return (image-right, height, depth-toward-camera) in meters.

    Canonical geometry faces +Y, with +Z up. Image registration to source pixels
    is intentionally separate: independently generated poses need local warps.
    """
    points, camera = _points(points, 3), _camera(camera_from)
    right = np.cross(-camera, [0, 0, 1])
    return np.column_stack((points @ right, points[:, 2], points @ camera))


def rasterize_depth(vertices, faces, bounds, resolution):
    """Nearest triangle depth; output rows run bottom-to-top, columns left-right.

    Inputs are camera_coordinates, triangle indices, [[left,bottom],[right,top]]
    and (width,height). Pixel centers sample each cell; uncovered cells are -inf.
    """
    vertices = _points(vertices, 3)
    faces = np.asarray(faces)
    bounds = _points(bounds, 2)
    if faces.size == 0:
        faces = np.empty((0, 3), dtype=np.int64)
    if faces.ndim != 2 or faces.shape[1] != 3 or not np.issubdtype(faces.dtype, np.integer):
        raise ValueError("Expected integer triangle indices")
    if faces.size and (faces.min() < 0 or faces.max() >= len(vertices)):
        raise ValueError("Triangle index outside vertices")
    if bounds.shape != (2, 2) or np.any(bounds[1] <= bounds[0]):
        raise ValueError("Expected positive camera bounds")
    if len(resolution) != 2 or any(not isinstance(n, (int, np.integer)) or n < 1 for n in resolution):
        raise ValueError("Expected positive integer width and height")
    width, height = resolution
    pixels = (vertices[:, :2] - bounds[0]) / (bounds[1] - bounds[0]) * [width, height] - .5
    result = np.full((height, width), -np.inf, dtype=np.float64)
    for ids in faces:
        p = pixels[ids]
        low = np.maximum(np.ceil(p.min(axis=0)).astype(int), [0, 0])
        high = np.minimum(np.floor(p.max(axis=0)).astype(int), [width - 1, height - 1])
        if np.any(high < low):
            continue
        a, b, c = p
        denominator = (b[1] - c[1]) * (a[0] - c[0]) + (c[0] - b[0]) * (a[1] - c[1])
        if abs(denominator) < 1e-12:
            continue
        x, y = np.meshgrid(np.arange(low[0], high[0] + 1), np.arange(low[1], high[1] + 1))
        u = ((b[1] - c[1]) * (x - c[0]) + (c[0] - b[0]) * (y - c[1])) / denominator
        v = ((c[1] - a[1]) * (x - c[0]) + (a[0] - c[0]) * (y - c[1])) / denominator
        w = 1 - u - v
        inside = (u >= -1e-9) & (v >= -1e-9) & (w >= -1e-9)
        z = u * vertices[ids[0], 2] + v * vertices[ids[1], 2] + w * vertices[ids[2], 2]
        tile = result[low[1]:high[1] + 1, low[0]:high[0] + 1]
        np.maximum(tile, np.where(inside, z, -np.inf), out=tile)
    return result


def sample_reference(rgba, coordinates):
    """Bilinear linear-RGB/unassociated-alpha samples; alpha<8 is no source.

    Coordinates use pixel centers (integer x/y) and image y-down, distinct from
    the bottom-up geometry depth raster. Never clamp an out-of-image coordinate
    into a valid foreground source; hidden RGB cannot bleed into the result.
    """
    rgba, coordinates = np.asarray(rgba), _points(coordinates, 2)
    if rgba.ndim != 3 or rgba.shape[2] != 4 or rgba.dtype != np.uint8 or min(rgba.shape[:2]) < 1:
        raise ValueError("Expected uint8 RGBA source pixels")
    height, width = rgba.shape[:2]
    valid = (coordinates[:, 0] >= 0) & (coordinates[:, 0] <= width - 1) & (coordinates[:, 1] >= 0) & (coordinates[:, 1] <= height - 1)
    x, y = np.clip(coordinates[:, 0], 0, width - 1), np.clip(coordinates[:, 1], 0, height - 1)
    x0, y0 = np.floor(x).astype(int), np.floor(y).astype(int)
    x1, y1 = np.minimum(x0 + 1, width - 1), np.minimum(y0 + 1, height - 1)
    fx, fy = x - x0, y - y0
    result = np.zeros((len(coordinates), 4), dtype=np.float64)
    for px, py, factor in ((x0, y0, (1 - fx) * (1 - fy)), (x1, y0, fx * (1 - fy)),
                           (x0, y1, (1 - fx) * fy), (x1, y1, fx * fy)):
        sample = rgba[py, px].astype(np.float64) / 255
        alpha = sample[:, 3] * factor * (rgba[py, px, 3] >= 8)
        result[:, :3] += _linear(sample[:, :3]) * alpha[:, None]
        result[:, 3] += alpha
    np.divide(result[:, :3], result[:, 3:4], out=result[:, :3], where=result[:, 3:4] > 0)
    result[~valid] = 0
    return result


def projection_weights(normals, camera_from, depth, nearest_depth, alpha, semantic_match, tolerance=.012):
    """Weight only visible, correctly facing texels from the same semantic part.

    nearest_depth must come from all occluding geometry, not just the part being
    painted. Unknown semantic masks must be False, leaving the explicit fallback.
    """
    normals, camera = _points(normals, 3), _camera(camera_from)
    depth, nearest, alpha = (np.asarray(values, dtype=np.float64) for values in (depth, nearest_depth, alpha))
    semantic = np.asarray(semantic_match)
    if any(values.shape != (len(normals),) for values in (depth, nearest, alpha, semantic)):
        raise ValueError("Projection samples must share one length")
    if not np.isfinite(depth).all() or not np.isfinite(alpha).all() or np.any((alpha < 0) | (alpha > 1)):
        raise ValueError("Expected finite depths and normalized alpha")
    if np.isnan(nearest).any() or np.isposinf(nearest).any() or semantic.dtype != np.bool_:
        raise ValueError("Expected depth buffer (-inf for empty) and explicit boolean semantic mask")
    if not np.isfinite(tolerance) or tolerance <= 0:
        raise ValueError("Expected positive visibility tolerance in meters")
    lengths = np.linalg.norm(normals, axis=1)
    facing = np.divide(normals @ camera, lengths, out=np.zeros(len(normals)), where=lengths > 1e-8)
    directional = np.clip((facing - .15) / .85, 0, 1) ** 2
    visible = np.isfinite(nearest) & (np.abs(nearest - depth) <= tolerance)
    return directional * alpha * visible * semantic


def blend_projected(linear_colors, weights, fallback_srgb):
    """Blend source RGB in linear light; output opaque uint8 sRGB.

    weights already include sampled alpha and visibility. Sum>1 normalizes the
    source contributions; sum<1 keeps the remaining original semantic fallback.
    Fallback is mandatory per texel and must come from approved original art.
    """
    colors, weights = np.asarray(linear_colors, dtype=np.float64), np.asarray(weights, dtype=np.float64)
    fallback = _points(fallback_srgb, 3)
    if colors.ndim != 3 or colors.shape[2] != 3 or weights.shape != colors.shape[:2] or colors.shape[1] != len(fallback):
        raise ValueError("Expected VxNx3 colors, VxN weights and Nx3 fallback")
    if not np.isfinite(colors).all() or not np.isfinite(weights).all() or np.any((colors < 0) | (colors > 1)) or np.any(weights < 0):
        raise ValueError("Expected normalized finite linear colors and nonnegative weights")
    if np.any((fallback < 0) | (fallback > 255)):
        raise ValueError("Fallback must contain original sRGB byte values")
    total = weights.sum(axis=0)
    normalized = weights / np.maximum(1, total)[None, :]
    mixed = (colors * normalized[:, :, None]).sum(axis=0) + _linear(fallback / 255) * np.maximum(0, 1 - total)[:, None]
    return np.rint(np.clip(_srgb(mixed), 0, 1) * 255).astype(np.uint8)
