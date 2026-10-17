"""glTF TRS interpolation and Three.js-compatible rigid-skin math for QA."""

from __future__ import annotations

import numpy as np

from knight_optimization_qa import accessor


def normalized(v: np.ndarray) -> np.ndarray:
    magnitude = np.linalg.norm(v, axis=-1, keepdims=True)
    return v / np.maximum(magnitude, 1e-30)


def quaternion_matrix(quaternion: np.ndarray) -> np.ndarray:
    x, y, z, w = normalized(np.asarray(quaternion, dtype=np.float64))
    return np.array([
        [1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w)],
        [2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w)],
        [2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y)],
    ])


def trs_matrix(translation, rotation, scale) -> np.ndarray:
    result = np.eye(4, dtype=np.float64)
    result[:3, :3] = quaternion_matrix(rotation) @ np.diag(scale)
    result[:3, 3] = translation
    return result


def node_matrix(node: dict, overrides: dict | None = None) -> np.ndarray:
    if "matrix" in node:
        if overrides:
            raise AssertionError("Animated matrix node is unsupported")
        return np.array(node["matrix"], dtype=np.float64).reshape(4, 4, order="F")
    overrides = overrides or {}
    return trs_matrix(overrides.get("translation", node.get("translation", [0, 0, 0])),
                      overrides.get("rotation", node.get("rotation", [0, 0, 0, 1])),
                      overrides.get("scale", node.get("scale", [1, 1, 1])))


def parents(gltf: dict) -> dict[int, int]:
    result = {}
    for index, node in enumerate(gltf["nodes"]):
        for child in node.get("children", []):
            if child in result:
                raise AssertionError("Node has multiple parents")
            result[child] = index
    return result


def world_matrices(gltf: dict, overrides: dict | None = None) -> list[np.ndarray]:
    parent = parents(gltf)
    overrides = overrides or {}
    cache = {}

    def world(index: int) -> np.ndarray:
        if index not in cache:
            local = node_matrix(gltf["nodes"][index], overrides.get(index))
            cache[index] = world(parent[index]) @ local if index in parent else local
        return cache[index]

    return [world(index) for index in range(len(gltf["nodes"]))]


def slerp(a: np.ndarray, b: np.ndarray, fraction: float) -> np.ndarray:
    a = normalized(a.astype(np.float64))
    b = normalized(b.astype(np.float64))
    dot = float(np.dot(a, b))
    if dot < 0:
        b = -b
        dot = -dot
    if dot > .9995:
        return normalized(a * (1 - fraction) + b * fraction)
    theta = np.arccos(np.clip(dot, -1, 1))
    return (np.sin((1 - fraction) * theta) * a + np.sin(fraction * theta) * b) / np.sin(theta)


def sample_channel(times: np.ndarray, values: np.ndarray, path: str, time: float) -> np.ndarray:
    sample_times = times.reshape(-1)
    if time <= sample_times[0]:
        return values[0]
    if time >= sample_times[-1]:
        return values[-1]
    high = int(np.searchsorted(sample_times, time, side="right"))
    low = high - 1
    fraction = float((time - sample_times[low]) / (sample_times[high] - sample_times[low]))
    if path == "rotation":
        return slerp(values[low], values[high], fraction)
    return values[low] * (1 - fraction) + values[high] * fraction


def animation_sample(gltf: dict, binary: bytes, animation: dict, time: float) -> dict:
    overrides = {}
    for channel in animation["channels"]:
        sampler = animation["samplers"][channel["sampler"]]
        if sampler.get("interpolation", "LINEAR") != "LINEAR":
            raise AssertionError("Only source LINEAR interpolation has been audited")
        times = accessor(gltf, binary, sampler["input"])
        values = accessor(gltf, binary, sampler["output"])
        node = channel["target"]["node"]
        path = channel["target"]["path"]
        overrides.setdefault(node, {})[path] = sample_channel(times, values, path, time)
    return overrides


def animation_times(gltf: dict, binary: bytes, animation: dict) -> list[float]:
    keys = {float(time) for sampler in animation["samplers"]
            for time in accessor(gltf, binary, sampler["input"]).reshape(-1)}
    ordered = sorted(keys)
    mids = {(a + b) / 2 for a, b in zip(ordered, ordered[1:])}
    return sorted(keys | mids)


def transform_positions(matrix: np.ndarray, positions: np.ndarray) -> np.ndarray:
    return positions @ matrix[:3, :3].T + matrix[:3, 3]


def rigid_world_normals(matrix: np.ndarray, normals: np.ndarray) -> np.ndarray:
    # Rigid Mesh.normalMatrix in Three: transpose(inverse(modelView)).
    return normalized(normals @ np.linalg.inv(matrix[:3, :3]))


def three_skin_normals(current: np.ndarray, bind_inverse: np.ndarray,
                       bind_normals: np.ndarray) -> np.ndarray:
    # Three skinnormal_vertex: skinMatrix * vec4(objectNormal, 0), then
    # defaultnormal_vertex applies the (separate) mesh normalMatrix.
    skin_matrix = current @ bind_inverse
    return normalized(bind_normals @ skin_matrix[:3, :3].T)


def instance_matrix() -> np.ndarray:
    angle = 1.123
    c, s = np.cos(angle), np.sin(angle)
    return np.array([[c, 0, s, 2.7], [0, 1, 0, .13], [-s, 0, c, -3.4], [0, 0, 0, 1]], dtype=np.float64)
