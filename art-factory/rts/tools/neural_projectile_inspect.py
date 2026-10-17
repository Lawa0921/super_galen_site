"""Inspect the source siege quarrel hierarchy without modifying the source."""
import json
import sys
from pathlib import Path

import bpy


def main():
    source = Path(sys.argv[sys.argv.index("--") + 1]).resolve()
    bpy.ops.wm.open_mainfile(filepath=str(source))
    pivot = bpy.data.objects["LoadedQuarrelPivot"]
    children = [obj for obj in pivot.children_recursive if obj.type == "MESH"]
    inv = pivot.matrix_world.inverted()
    report = []
    for obj in children:
        points = [inv @ obj.matrix_world @ vertex.co for vertex in obj.data.vertices]
        report.append({
            "name": obj.name,
            "vertices": len(obj.data.vertices),
            "triangles": sum(len(poly.vertices) - 2 for poly in obj.data.polygons),
            "materials": [mat.name for mat in obj.data.materials],
            "uv_layers": [uv.name for uv in obj.data.uv_layers],
            "bounds": [[round(min(point[i] for point in points), 5), round(max(point[i] for point in points), 5)] for i in range(3)],
        })
    print("PROJECTILE_SOURCE=" + json.dumps(report))


if __name__ == "__main__":
    main()
