"""Blender-side GLB roundtrip check for candidate skins and animation motion."""

import argparse
import json
import sys
from pathlib import Path

import bpy
from mathutils import Vector


def sample_bounds(objects):
    graph = bpy.context.evaluated_depsgraph_get()
    points = []
    for obj in objects:
        evaluated = obj.evaluated_get(graph)
        mesh = evaluated.to_mesh()
        try:
            points.extend(obj.matrix_world @ vertex.co for vertex in mesh.vertices)
        finally:
            evaluated.to_mesh_clear()
    return {'min':[round(min(point[i] for point in points),4) for i in range(3)],
            'max':[round(max(point[i] for point in points),4) for i in range(3)],
            'centroid':[round(sum(point[i] for point in points)/len(points),4) for i in range(3)]}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--project-root',type=Path,required=True)
    parser.add_argument('--unit',required=True)
    parser.add_argument('--version',default='2026-10-05-v1',choices=('2026-10-05-v1','2026-10-05-v2'))
    args = parser.parse_args(sys.argv[sys.argv.index('--')+1:])
    root = args.project_root.resolve()
    run = root/'art-factory/rts/runs/human-units'/args.version/args.unit
    report = {}
    for lod in ('lod0','lod1'):
        bpy.ops.wm.read_factory_settings(use_empty=True)
        glb = run/'candidate'/f'{args.unit}-production-{lod}.glb'
        bpy.ops.import_scene.gltf(filepath=str(glb))
        armatures = [obj for obj in bpy.data.objects if obj.type=='ARMATURE']
        meshes = [obj for obj in bpy.data.objects if obj.type=='MESH']
        if len(armatures)!=1 or not meshes:
            raise RuntimeError(f'{args.unit} {lod}: armatures={len(armatures)}, meshes={len(meshes)}')
        arm = armatures[0]
        actions = {action.name:action for action in bpy.data.actions}
        if set(actions)!=set(('Idle','Walk','Attack','Hurt','Death')):
            raise RuntimeError(f'{args.unit} {lod}: wrong imported actions {list(actions)}')
        clips = {}
        for name,frames in (('Idle',(0,20)),('Walk',(0,20)),('Attack',(0,16)),('Death',(0,50))):
            arm.animation_data.action = actions[name]
            samples = []
            for frame in frames:
                bpy.context.scene.frame_set(frame)
                samples.append(sample_bounds(meshes))
            displacement = max(abs(samples[0]['centroid'][i]-samples[1]['centroid'][i]) for i in range(3))
            clips[name] = {'sample_frames':list(frames),'centroid_max_delta_m':round(displacement,4),'bounds':samples}
        report[lod] = {'armature':arm.name,'bones':len(arm.data.bones),'mesh_count':len(meshes),'actions':list(actions),'clips':clips}
        if report[lod]['bones']!=20 or clips['Walk']['centroid_max_delta_m']<.005 or clips['Death']['centroid_max_delta_m']<.04:
            raise RuntimeError(f'{args.unit} {lod}: roundtrip motion/rig failed')
    (run/'qa'/'roundtrip.json').write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8',newline='\n')
    print('HUMAN_ROUNDTRIP='+json.dumps({'unit':args.unit,'results':{lod:{'bones':item['bones'],'clips':item['actions']} for lod,item in report.items()}}),flush=True)


if __name__=='__main__':
    main()
