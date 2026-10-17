"""Bake compatible, original skinned assembly parts into material batches.

Only sibling meshes with one skin and identical local transforms are accepted.
No decimation, reweighting, resampling, texture editing or runtime writes.
"""
import copy
import json
import struct
from collections import OrderedDict
import numpy as np

DTYPES={5120:'i1',5121:'u1',5122:'<i2',5123:'<u2',5125:'<u4',5126:'<f4'}
WIDTHS={'SCALAR':1,'VEC2':2,'VEC3':3,'VEC4':4,'MAT4':16}


def read_glb(path):
    raw=path.read_bytes()
    if raw[:4]!=b'glTF' or struct.unpack_from('<I',raw,4)[0]!=2:raise ValueError('Expected GLB 2')
    size=struct.unpack_from('<I',raw,12)[0]
    doc=json.loads(raw[20:20+size]);offset=28+size
    if raw[24+size:28+size]!=b'BIN\0':raise ValueError('Expected BIN chunk')
    return doc,raw[offset:]


def write_glb(path,doc,binary):
    data=json.dumps(doc,separators=(',',':'),ensure_ascii=False).encode('utf8')
    data+=b' '*((-len(data))%4);binary+=b'\0'*((-len(binary))%4)
    path.parent.mkdir(parents=True,exist_ok=True)
    path.write_bytes(struct.pack('<4sII',b'glTF',2,28+len(data)+len(binary))+struct.pack('<I4s',len(data),b'JSON')+data+struct.pack('<I4s',len(binary),b'BIN\0')+binary)


def read_accessor(doc,binary,index):
    a=doc['accessors'][index]
    if 'sparse' in a or a['type'] not in WIDTHS:raise ValueError('Unsupported accessor layout')
    v=doc['bufferViews'][a['bufferView']]
    if v.get('buffer',0)!=0:raise ValueError('Multiple buffers unsupported')
    dtype=np.dtype(DTYPES[a['componentType']]);width=WIDTHS[a['type']];row=width*dtype.itemsize
    stride=v.get('byteStride',row);offset=v.get('byteOffset',0)+a.get('byteOffset',0)
    end=offset+(a['count']-1)*stride+row
    if stride<row or end>v.get('byteOffset',0)+v['byteLength'] or end>len(binary):raise ValueError('Accessor outside buffer view')
    return np.ndarray((a['count'],width),dtype=dtype,buffer=binary,offset=offset,strides=(stride,dtype.itemsize)).copy()


def _compact(doc,binary):
    used=set()
    for mesh in doc['meshes']:
        for p in mesh['primitives']:
            used.update(p['attributes'].values());used.add(p['indices'])
    for skin in doc.get('skins',[]):
        if 'inverseBindMatrices' in skin:used.add(skin['inverseBindMatrices'])
    for animation in doc.get('animations',[]):
        for sampler in animation['samplers']:used.update((sampler['input'],sampler['output']))
    accessors=sorted(used);mapping={old:new for new,old in enumerate(accessors)}
    for mesh in doc['meshes']:
        for p in mesh['primitives']:
            p['attributes']={key:mapping[value] for key,value in p['attributes'].items()};p['indices']=mapping[p['indices']]
    for skin in doc.get('skins',[]):
        if 'inverseBindMatrices' in skin:skin['inverseBindMatrices']=mapping[skin['inverseBindMatrices']]
    for animation in doc.get('animations',[]):
        for sampler in animation['samplers']:
            for key in ('input','output'):sampler[key]=mapping[sampler[key]]
    doc['accessors']=[doc['accessors'][i] for i in accessors]
    views={a['bufferView'] for a in doc['accessors']}
    views.update(im['bufferView'] for im in doc.get('images',[]) if 'bufferView' in im)
    output=bytearray();new_views=[];viewmap={}
    for old in sorted(views):
        v=copy.deepcopy(doc['bufferViews'][old]);start=v.get('byteOffset',0)
        while len(output)%4:output.append(0)
        v['byteOffset']=len(output);output.extend(binary[start:start+v['byteLength']]);viewmap[old]=len(new_views);new_views.append(v)
    for a in doc['accessors']:a['bufferView']=viewmap[a['bufferView']]
    for im in doc.get('images',[]):
        if 'bufferView' in im:im['bufferView']=viewmap[im['bufferView']]
    doc['bufferViews']=new_views;doc['buffers']=[{'byteLength':len(output)}]
    return bytes(output)


def bake(source,binary,preserve_names=(),anchor_name=None):
    doc=copy.deepcopy(source)
    if len(doc.get('buffers',[]))!=1:raise ValueError('Expected one GLB buffer')
    nodes=doc['nodes'];all_parts=[i for i,n in enumerate(nodes) if 'mesh' in n]
    parts=[i for i in all_parts if nodes[i].get('name') not in preserve_names]
    preserved=[i for i in all_parts if i not in parts]
    if anchor_name is not None:
        anchors=[i for i in parts if nodes[i].get('name')==anchor_name]
        if len(anchors)!=1:raise ValueError('Missing/ambiguous assembly anchor')
        parts=[anchors[0]]+[i for i in parts if i!=anchors[0]]
    if not parts:raise ValueError('No assembly meshes')
    parents={child:i for i,n in enumerate(nodes) for child in n.get('children',[])}
    anchor=nodes[parts[0]];skin=anchor.get('skin')
    if skin is None:raise ValueError('Expected a skinned assembly')
    transform=lambda n:{key:n[key] for key in ('matrix','translation','rotation','scale') if key in n}
    for i in parts:
        if nodes[i].get('skin')!=skin or parents.get(i)!=parents.get(parts[0]) or transform(nodes[i])!=transform(anchor):raise ValueError('Incompatible assembly transform or skeleton')
        if nodes[i].get('children'):raise ValueError('Mesh part owns descendants')
    if any(c['target'].get('node') in parts for a in doc.get('animations',[]) for c in a['channels']):raise ValueError('Mesh parts have authored animation channels')
    batches=OrderedDict();partmap=[];before=0;triangles=0
    for i in parts:
        mesh=doc['meshes'][nodes[i]['mesh']]
        for p in mesh['primitives']:
            before+=1
            if p.get('targets') or p.get('extensions') or p.get('mode',4)!=4:raise ValueError('Unsupported animated/compressed/non-triangle primitive')
            attrs=p['attributes']
            if not {'POSITION','NORMAL','JOINTS_0','WEIGHTS_0'}<=attrs.keys():raise ValueError('Missing assembly attributes')
            layout=tuple((key,doc['accessors'][idx]['type'],doc['accessors'][idx]['componentType'],doc['accessors'][idx].get('normalized',False)) for key,idx in sorted(attrs.items()))
            key=(p.get('material'),layout);group=batches.setdefault(key,{'attributes':{key:[] for key in attrs},'indices':[],'vertices':0,'template':p})
            values={key:read_accessor(doc,binary,idx) for key,idx in attrs.items()};count=len(values['POSITION'])
            if any(len(rows)!=count for rows in values.values()):raise ValueError('Mismatched vertex streams')
            indices=read_accessor(doc,binary,p['indices']).reshape(-1)
            if indices.dtype.kind!='u' or len(indices)%3 or np.any(indices>=count):raise ValueError('Invalid triangle indices')
            for name,rows in values.items():group['attributes'][name].append(rows)
            group['indices'].append(indices.astype(np.uint32)+group['vertices'])
            partmap.append({'node':i,'name':nodes[i].get('name'),'material':p.get('material'),'first_vertex':group['vertices'],'vertices':count})
            group['vertices']+=count;triangles+=len(indices)//3
    data=bytearray(binary)
    def append(rows,template,index=False):
        while len(data)%4:data.append(0)
        meta=copy.deepcopy(template);meta.pop('byteOffset',None);meta.pop('min',None);meta.pop('max',None)
        offset=len(data);data.extend(rows.tobytes());meta['bufferView']=len(doc['bufferViews']);meta['count']=len(rows)
        doc['bufferViews'].append({'buffer':0,'byteOffset':offset,'byteLength':rows.nbytes,'target':34963 if index else 34962})
        if meta['type']=='VEC3':meta['min']=rows.min(axis=0).tolist();meta['max']=rows.max(axis=0).tolist()
        doc['accessors'].append(meta);return len(doc['accessors'])-1
    primitives=[]
    for (material,layout),group in batches.items():
        attrs={}
        for name,rows in group['attributes'].items():attrs[name]=append(np.concatenate(rows),doc['accessors'][group['template']['attributes'][name]])
        indices=np.concatenate(group['indices']);component=5123 if group['vertices']<=65536 else 5125
        idx=append(indices.astype(DTYPES[component]),{'componentType':component,'type':'SCALAR'},True)
        p={'attributes':attrs,'indices':idx,'mode':4}
        if material is not None:p['material']=material
        primitives.append(p)
    spheres=[nodes[i].get('extras',{}).get('rtsConservativeBounds') for i in parts]
    if any(spheres):
        if not all(spheres):raise ValueError('Partial conservative bounds cannot be safely merged')
        centers=np.array([b['sphere_center_y_up_m'] for b in spheres]);radii=np.array([b['sphere_radius_m'] for b in spheres])
        center=((centers-radii[:,None]).min(axis=0)+(centers+radii[:,None]).max(axis=0))*.5
        radius=float(np.max(np.linalg.norm(centers-center,axis=1)+radii))
        if not np.isfinite(centers).all() or not np.isfinite(radii).all() or np.any(radii<=0):raise ValueError('Invalid conservative sphere')
        metadata={k:copy.deepcopy(v) for k,v in spheres[0].items() if all(s.get(k)==v for s in spheres)}
        metadata.update(sphere_center_y_up_m=center.tolist(),sphere_radius_m=radius,
                        union_sources=[{'node':nodes[i].get('name'),'bounds':copy.deepcopy(b)} for i,b in zip(parts,spheres)])
        anchor.setdefault('extras',{})['rtsConservativeBounds']=metadata
    kept_meshes=[]
    for i in preserved:
        kept_meshes.append(copy.deepcopy(doc['meshes'][nodes[i]['mesh']]))
        nodes[i]['mesh']=len(kept_meshes)
    anchor['mesh']=0
    anchor.setdefault('extras',{})['rtsAssemblySourceParts']=partmap
    for i in parts[1:]:nodes[i].pop('mesh');nodes[i].pop('skin')
    doc['meshes']=[{'name':'OriginalGuardMaterialBatches','primitives':primitives}]+kept_meshes
    packed=_compact(doc,bytes(data))
    equipment_draws=sum(len(m['primitives']) for m in kept_meshes)
    return doc,packed,{'parts_before':len(all_parts),'primitives_before':before+equipment_draws,'primitives_after':len(primitives)+equipment_draws,'core_triangles':triangles,'part_map':partmap,'preserved_nodes':[nodes[i].get('name') for i in preserved]}
