"""Deterministic parametric weapon / shield geometry for the model polish pass (2026-10-16).

Everything is authored in a local weapon frame (metres): +Y runs along the weapon from the grip toward the working end,
+X is the blade-width / shield-width direction and +Z the blade-thickness / shield-outward direction. A Frame then maps
local points into the published mesh space so the new piece keeps the old grip location, axis and hand-bone binding.
Each Part is a grid surface with smooth normals inside the part; hard edges come from separate parts.
UVs are metric (one tile per `TILE` metres) so the repeat-wrapped material maps keep a constant texel density.
"""
from dataclasses import dataclass, field
import numpy as np

TILE = 0.25


@dataclass
class Part:
    material: str
    position: np.ndarray
    normal: np.ndarray
    uv: np.ndarray
    indices: np.ndarray

    def transformed(self, matrix):
        p = self.position @ matrix[:3, :3].T + matrix[:3, 3]
        n = self.normal @ np.linalg.inv(matrix[:3, :3])
        n /= np.linalg.norm(n, axis=1, keepdims=True) + 1e-12
        return Part(self.material, p.astype(np.float32), n.astype(np.float32), self.uv, self.indices)


def _normalize(v):
    return v / (np.linalg.norm(v, axis=-1, keepdims=True) + 1e-12)


def grid(material, points, closed_u=False, closed_v=False, uv=None, flip=False):
    """points: (rows, cols, 3). rows run along v, cols along u. Returns a Part with smooth normals."""
    points = np.asarray(points, np.float64)
    rows, cols, _ = points.shape
    if closed_u:
        points = np.concatenate([points, points[:, :1]], axis=1); cols += 1
    if closed_v:
        points = np.concatenate([points, points[:1]], axis=0); rows += 1
    # Face normals accumulated on vertices (seam columns share their twin's normal afterwards).
    a = points[:-1, :-1]; b = points[:-1, 1:]; c = points[1:, 1:]; d = points[1:, :-1]
    fn = np.cross(b - a, d - a) + np.cross(c - b, a - b) + np.cross(d - c, b - c) + np.cross(a - d, c - d)
    if flip:
        fn = -fn
    acc = np.zeros_like(points)
    acc[:-1, :-1] += fn; acc[:-1, 1:] += fn; acc[1:, 1:] += fn; acc[1:, :-1] += fn
    if closed_u:
        s = acc[:, 0] + acc[:, -1]; acc[:, 0] = s; acc[:, -1] = s
    if closed_v:
        s = acc[0] + acc[-1]; acc[0] = s; acc[-1] = s
    normal = _normalize(acc)
    if uv is None:
        du = np.linalg.norm(np.diff(points, axis=1), axis=2); dv = np.linalg.norm(np.diff(points, axis=0), axis=2)
        u = np.concatenate([np.zeros((rows, 1)), np.cumsum(du, axis=1)], axis=1)
        v = np.concatenate([np.zeros((1, cols)), np.cumsum(dv, axis=0)], axis=0)
        uv = np.stack([u, v], axis=2) / TILE
    idx = np.arange(rows * cols).reshape(rows, cols)
    q = np.stack([idx[:-1, :-1], idx[:-1, 1:], idx[1:, 1:], idx[1:, :-1]], axis=-1).reshape(-1, 4)
    tris = np.concatenate([q[:, [0, 1, 2]], q[:, [0, 2, 3]]], axis=0) if not flip else np.concatenate([q[:, [0, 2, 1]], q[:, [0, 3, 2]]], axis=0)
    # Drop degenerate triangles (poles of lathes) so validators see no zero-area faces.
    flat = points.reshape(-1, 3)
    area = np.linalg.norm(np.cross(flat[tris[:, 1]] - flat[tris[:, 0]], flat[tris[:, 2]] - flat[tris[:, 0]]), axis=1)
    tris = tris[area > 1e-12]
    return Part(material, flat.astype(np.float32), normal.reshape(-1, 3).astype(np.float32),
                np.asarray(uv, np.float64).reshape(-1, 2).astype(np.float32), tris.reshape(-1).astype(np.uint32))


def lathe(material, profile, segments, center=(0, 0, 0), axis_scale=(1, 1), phase=0.0):
    """Surface of revolution around +Y. profile: [(y, radius)] from bottom to top. axis_scale squashes X/Z (ovals)."""
    prof = np.asarray(profile, np.float64)
    ang = phase + np.linspace(0, 2 * np.pi, segments, endpoint=False)
    pts = np.zeros((len(prof), segments, 3))
    pts[..., 0] = prof[:, 1:2] * np.cos(ang)[None] * axis_scale[0]
    pts[..., 1] = prof[:, 0:1]
    pts[..., 2] = -prof[:, 1:2] * np.sin(ang)[None] * axis_scale[1]
    pts += np.asarray(center)
    circumference = 2 * np.pi * max(1e-4, float(prof[:, 1].max()))
    u = np.linspace(0, circumference / TILE, segments + 1)
    seg = np.linalg.norm(np.diff(pts[:, 0], axis=0), axis=1)
    v = np.concatenate([[0], np.cumsum(seg)]) / TILE
    uv = np.stack(np.meshgrid(u, v), axis=2)
    return grid(material, pts, closed_u=True, uv=uv)


def sweep(material, sections, closed_section=True):
    """sections: (rows, k, 3) explicit cross-section rings."""
    return grid(material, sections, closed_u=closed_section)


def cap(material, ring, center, flip=False):
    """Fan cap for a closed ring (k,3) toward a centre point; flat normal."""
    ring = np.asarray(ring, np.float64); k = len(ring)
    pts = np.vstack([ring, [center]])
    n = _normalize(np.cross(ring[1] - ring[0], ring[2] - ring[0]))
    if np.dot(n, np.asarray(center) - ring.mean(0)) > 0:
        n = -n
    tris = np.array([[i, (i + 1) % k, k] for i in range(k)], np.uint32)
    if flip:
        tris = tris[:, [0, 2, 1]]; n = -n
    # Orient winding to the normal.
    a, b, c = pts[tris[0, 0]], pts[tris[0, 1]], pts[tris[0, 2]]
    if np.dot(np.cross(b - a, c - a), n) < 0:
        tris = tris[:, [0, 2, 1]]
    axis_u = _normalize(ring[0] - center); axis_v = np.cross(n, axis_u)
    uv = np.stack([(pts - center) @ axis_u, (pts - center) @ axis_v], axis=1) / TILE
    return Part(material, pts.astype(np.float32), np.repeat(n[None], len(pts), 0).astype(np.float32), uv.astype(np.float32), tris.reshape(-1))


def merge(parts):
    """Concatenate parts per material -> {material: Part}."""
    out = {}
    for p in parts:
        out.setdefault(p.material, []).append(p)
    merged = {}
    for m, ps in out.items():
        base = 0; pos = []; nor = []; uv = []; idx = []
        for p in ps:
            pos.append(p.position); nor.append(p.normal); uv.append(p.uv); idx.append(p.indices + base); base += len(p.position)
        merged[m] = Part(m, np.vstack(pos), np.vstack(nor), np.vstack(uv), np.concatenate(idx).astype(np.uint32))
    return merged


def triangles(parts):
    return sum(len(p.indices) // 3 for p in (parts.values() if isinstance(parts, dict) else parts))


@dataclass
class Frame:
    """Maps local weapon coordinates into mesh space: columns are local X, Y, Z axes, origin is the grip centre."""
    origin: np.ndarray
    x: np.ndarray
    y: np.ndarray
    z: np.ndarray = field(default=None)

    def matrix(self):
        y = _normalize(np.asarray(self.y, np.float64))
        x = np.asarray(self.x, np.float64); x = _normalize(x - y * np.dot(x, y))
        z = np.cross(x, y) if self.z is None else _normalize(np.asarray(self.z, np.float64))
        if self.z is not None:
            z = _normalize(z - y * np.dot(z, y) - x * np.dot(z, x))
            if np.dot(np.cross(x, y), z) < 0:  # keep a right-handed basis so winding stays outward
                x = -x
        m = np.eye(4); m[:3, 0] = x; m[:3, 1] = y; m[:3, 2] = z; m[:3, 3] = self.origin
        return m


def tangents(position, normal, uv, indices):
    """Per-vertex MikkTSpace-style tangents (Lengyel accumulation), w = handedness, for merging into tangent-bearing primitives."""
    P = np.asarray(position, np.float64); N = np.asarray(normal, np.float64); UV = np.asarray(uv, np.float64)
    T = np.asarray(indices).reshape(-1, 3)
    e1 = P[T[:, 1]] - P[T[:, 0]]; e2 = P[T[:, 2]] - P[T[:, 0]]
    d1 = UV[T[:, 1]] - UV[T[:, 0]]; d2 = UV[T[:, 2]] - UV[T[:, 0]]
    r = d1[:, 0] * d2[:, 1] - d2[:, 0] * d1[:, 1]
    r = np.where(np.abs(r) < 1e-12, 1e-12, r)
    sdir = (e1 * d2[:, 1:2] - e2 * d1[:, 1:2]) / r[:, None]
    tdir = (e2 * d1[:, 0:1] - e1 * d2[:, 0:1]) / r[:, None]
    tan = np.zeros_like(P); bit = np.zeros_like(P)
    for k in range(3):
        np.add.at(tan, T[:, k], sdir); np.add.at(bit, T[:, k], tdir)
    t = tan - N * np.einsum('ij,ij->i', N, tan)[:, None]
    bad = np.linalg.norm(t, axis=1) < 1e-9
    if bad.any():  # any perpendicular fallback
        alt = np.cross(N[bad], [0, 1, 0]); alt[np.linalg.norm(alt, axis=1) < 1e-6] = [1, 0, 0]; t[bad] = alt
    t /= np.linalg.norm(t, axis=1, keepdims=True)
    w = np.where(np.einsum('ij,ij->i', np.cross(N, t), bit) < 0, -1.0, 1.0)
    return np.concatenate([t, w[:, None]], axis=1).astype(np.float32)
