"""Independently reimport the exported v3 GLB in Blender and record material QA."""

import json
import sys
from pathlib import Path

import bpy


def main():
    glb, output = [Path(value).resolve() for value in sys.argv[sys.argv.index("--") + 1 :]]
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    bpy.ops.import_scene.gltf(filepath=str(glb))
    meshes = [item for item in bpy.context.scene.objects if item.type == "MESH"]
    if len(meshes) != 1:
        raise RuntimeError(f"Expected one mesh, found {len(meshes)}")
    mesh = meshes[0].data
    textures = []
    for material in mesh.materials:
        if material and material.use_nodes:
            for node in material.node_tree.nodes:
                if node.type == "TEX_IMAGE" and node.image is not None:
                    textures.append({"size": list(node.image.size), "color_space": node.image.colorspace_settings.name})
    result = {
        "glb": str(glb), "mesh_count": 1, "vertices": len(mesh.vertices),
        "triangles": sum(len(face.vertices) - 2 for face in mesh.polygons),
        "smooth_faces": sum(face.use_smooth for face in mesh.polygons),
        "uv_layers": [layer.name for layer in mesh.uv_layers], "textures": textures,
    }
    output.write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8")
    print("PILOT_GLB_V3_REIMPORT=" + json.dumps(result))


if __name__ == "__main__":
    main()
