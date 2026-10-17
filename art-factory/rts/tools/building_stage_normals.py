"""Restore published original normal streams after Blender quantization."""
import collections
import json
import re
import struct
import numpy as np

def restore_triangle_normals(triangles, normals, tangents, published):
    output = np.asarray(normals,dtype=np.float32).copy()
    tangent_output = np.asarray(tangents,dtype=np.float32).copy() if tangents is not None else None
    maximum = 0; assignments = {}
    for key,indices in triangles:
        if key not in published: raise ValueError('Triangle has no published original match')
        choices = published[key]; original_corners = choices[0]
        if any(not np.array_equal(choice,original_corners) for choice in choices[1:]):
            raise ValueError('Ambiguous published normals for complete directed triangle')
        for corner,index in enumerate(indices):
            original = original_corners[corner]
            if index in assignments and not np.array_equal(assignments[index],original):
                raise ValueError('Candidate merged vertex has conflicting source triangle-corner normals')
            delta = float(np.linalg.norm(normals[index]-original))
            if delta > .01: raise ValueError('Normal differs by more than encoding tolerance: ' + str(delta))
            maximum = max(maximum,delta); assignments[index] = original; output[index] = original
    if len(assignments) != len(output): raise ValueError('Unmatched unused candidate normal vertices')
    for index,original in assignments.items():
        if tangent_output is not None:
            normal = original / np.linalg.norm(original)
            tangent = tangent_output[index,:3]
            tangent = tangent - normal * np.dot(tangent,normal)
            if np.linalg.norm(tangent)<1e-8: raise ValueError('Degenerate restored tangent')
            tangent_output[index,:3] = tangent / np.linalg.norm(tangent)
    return output,tangent_output,{'vertices_restored':len(assignments),'matched_triangles':len(triangles),'ambiguous_triangles':0,'unmatched_triangles':0,'conflicting_corner_assignments':0,'max_pre_restore_vector_delta':maximum,'original_normal_values_exact_float32':True,'tangents_orthogonalized_to_original_normals':tangents is not None}

def read_glb(path):
    raw = path.read_bytes(); n = struct.unpack_from('<I',raw,12)[0]
    return json.loads(raw[20:20+n]),raw[28+n:]
def write_glb(path,doc,binary):
    data=json.dumps(doc,separators=(',',':'),ensure_ascii=False).encode();data+=b' '*(-len(data)%4)
    path.write_bytes(struct.pack('<4sII',b'glTF',2,28+len(data)+len(binary))+struct.pack('<I4s',len(data),b'JSON')+data+struct.pack('<I4s',len(binary),b'BIN\0')+binary)
def accessor(doc,binary,index):
    item=doc['accessors'][index];view=doc['bufferViews'][item['bufferView']]
    if item['componentType']!=5126 or 'sparse' in item: raise ValueError('Expected direct FLOAT stream')
    width={'VEC2':2,'VEC3':3,'VEC4':4}[item['type']]
    offset=view.get('byteOffset',0)+item.get('byteOffset',0);stride=view.get('byteStride',width*4)
    return np.ndarray((item['count'],width),dtype='<f4',buffer=binary,offset=offset,strides=(stride,4))
def indices(doc,binary,index):
    item=doc['accessors'][index];view=doc['bufferViews'][item['bufferView']]
    dtype={5121:'u1',5123:'<u2',5125:'<u4'}[item['componentType']]
    return np.frombuffer(binary,dtype=dtype,count=item['count'],offset=view.get('byteOffset',0)+item.get('byteOffset',0))
def primitives(doc,binary):
    for node in doc['nodes']:
        if 'mesh' not in node: continue
        if any(key in node for key in ['matrix','translation','rotation','scale']): raise ValueError('Expected authored identity-pivot mesh')
        for primitive in doc['meshes'][node['mesh']]['primitives']:
            material = re.sub(r'\.\d{3}$','',doc['materials'][primitive['material']]['name'])
            attrs=primitive['attributes']; positions=accessor(doc,binary,attrs['POSITION']);uvs=accessor(doc,binary,attrs['TEXCOORD_0'])
            corners=[tuple(round(float(v),4) for v in (*position,*uv)) for position,uv in zip(positions,uvs)]
            triangles=[]
            for face in indices(doc,binary,primitive['indices']).reshape((-1,3)):
                face=list(map(int,face));values=[corners[index] for index in face]
                rotations=[tuple(values[i:]+values[:i]) for i in range(3)];rotation=min(range(3),key=lambda i:rotations[i])
                triangles.append(((material,rotations[rotation]),tuple(face[rotation:]+face[:rotation])))
            yield primitive,triangles,accessor(doc,binary,attrs['NORMAL']),accessor(doc,binary,attrs['TANGENT']) if 'TANGENT' in attrs else None
def restore_glb(candidate,published):
    original_doc,original_binary=read_glb(published);source=collections.defaultdict(list)
    for _,triangles,normals,_ in primitives(original_doc,original_binary):
        for key,corners in triangles: source[key].append(normals[list(corners)].copy())
    doc,binary=read_glb(candidate);data=bytearray(binary);rows=[]
    for primitive,triangles,normals,tangents in primitives(doc,data):
        values,tangent_values,row=restore_triangle_normals(triangles,normals,tangents,source)
        normals[:]=values
        if tangents is not None: tangents[:]=tangent_values
        rows.append(row)
    write_glb(candidate,doc,bytes(data))
    return {'method':'Source-locked published FLOAT32 NORMAL values matched by complete directed triangle material/world position/UV key@1e-4 and cyclic corner identity; duplicate triangles with inconsistent normals and conflicting shared vertices rejected; maximum pre-restore vector delta .01; tangent orthogonalization only', 'primitive_reports':rows,'vertices_restored':sum(r['vertices_restored'] for r in rows),'matched_triangles':sum(r['matched_triangles'] for r in rows),'ambiguous_triangles':0,'unmatched_triangles':0,'conflicting_corner_assignments':0,'max_pre_restore_vector_delta':max(r['max_pre_restore_vector_delta'] for r in rows),'positions_uv_materials_indices_unchanged':True}
