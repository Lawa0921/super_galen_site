import bpy, json, os, sys
from collections import defaultdict
blend=sys.argv[sys.argv.index('--')+1]
out=sys.argv[sys.argv.index('--')+2]
bpy.ops.wm.open_mainfile(filepath=blend)
obj=bpy.data.objects['crossbowOriginalBody_LOD0']
mesh=obj.data
uv=mesh.uv_layers.active.data
groups={g.name:g.index for g in obj.vertex_groups}
report={'materials':[],'arm_uv':{}}
for mat in mesh.materials:
    item={'name':mat.name,'images':[]}
    if mat.node_tree:
        for node in mat.node_tree.nodes:
            if node.type=='TEX_IMAGE' and node.image:
                item['images'].append({'name':node.image.name,'path':node.image.filepath})
    report['materials'].append(item)
for side in ('R','L'):
    for bone in (f'UpperArm_{side}',f'Forearm_{side}'):
        if bone not in groups: continue
        gidx=groups[bone];by_mat=defaultdict(list);counts=defaultdict(int)
        for poly in mesh.polygons:
            weights=[]
            for vi in poly.vertices:
                v=mesh.vertices[vi]
                weights.append(sum(g.weight for g in v.groups if g.group==gidx))
            if sum(weights)/len(weights)<0.45: continue
            coords=[uv[li].uv[:] for li in poly.loop_indices]
            by_mat[poly.material_index].extend(coords);counts[poly.material_index]+=1
        report['arm_uv'][bone]={}
        for mat_id,points in by_mat.items():
            report['arm_uv'][bone][str(mat_id)]={'min':[min(p[i] for p in points) for i in range(2)],
              'max':[max(p[i] for p in points) for i in range(2)],
              'center':[sum(p[i] for p in points)/len(points) for i in range(2)],
              'faces':counts[mat_id]}
with open(out,'w',encoding='utf-8') as f:json.dump(report,f,indent=2)
print(json.dumps(report,indent=2))
