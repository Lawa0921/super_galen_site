"""Partition static indexed GLB primitives without re-exporting source attributes."""
import copy
import struct

INDEX_FORMATS={5121:'B',5123:'H',5125:'I'}

def read_indices(document,binary,primitive):
    accessor=document['accessors'][primitive['indices']]
    view=document['bufferViews'][accessor['bufferView']]
    fmt=INDEX_FORMATS.get(accessor['componentType'])
    count=accessor['count']
    if not fmt or accessor['type']!='SCALAR' or accessor.get('sparse') or accessor.get('normalized') or view.get('buffer',0)!=0 or view.get('byteStride'):
        raise ValueError('Unsupported source index accessor')
    if type(count) is not int or count<=0 or count%3:
        raise ValueError('Source must contain complete indexed triangles')
    local=accessor.get('byteOffset',0);start=view.get('byteOffset',0)+local
    size=struct.calcsize('<'+fmt)*count
    if local<0 or start<0 or local+size>view['byteLength'] or start+size>min(len(binary),document['buffers'][0]['byteLength']):
        raise ValueError('Source index range exceeds its buffer')
    values=struct.unpack_from('<'+str(count)+fmt,binary,start)
    position_count=document['accessors'][primitive['attributes']['POSITION']]['count']
    if any(i>=position_count for i in values):
        raise ValueError('Source index exceeds position count')
    return accessor,values

def partition_static_glb(document, binary, triangle_map):
    if document.get('animations') or document.get('skins') or document.get('extensionsRequired'):
        raise ValueError('Only static unextended GLB sources are supported')
    if len(document.get('buffers',[]))!=1 or document['buffers'][0].get('uri'):
        raise ValueError('Expected one embedded buffer')
    if len(document.get('scenes',[]))!=1 or document.get('scene',0)!=0:
        raise ValueError('Expected one source scene')
    nodes=document['nodes'];meshes=document['meshes']
    if sorted(document['scenes'][0]['nodes'])!=list(range(len(nodes))):
        raise ValueError('Expected flat source roots')
    if any('mesh' not in n or n.get('children') or 'skin' in n or n.get('weights') for n in nodes):
        raise ValueError('Unsupported source hierarchy')
    if sorted(n['mesh'] for n in nodes)!=list(range(len(meshes))):
        raise ValueError('Every source mesh must have one owner')
    if any('rtsConstructionStage' in n.get('extras',{}) for n in nodes) or 'rtsConstruction' in document['scenes'][0].get('extras',{}):
        raise ValueError('Source already has construction metadata')
    mapped={}
    for row in triangle_map:
        key=tuple(row.get(name) for name in ('mesh','primitive','triangle'))
        if any(type(i) is not int or i<0 for i in key) or key in mapped:
            raise ValueError('Invalid or duplicate triangle ordinal')
        if type(row.get('stage')) is not int or row['stage'] not in range(4):
            raise ValueError('Unknown construction stage')
        if any(not isinstance(row.get(name),str) or not row[name].strip() for name in ('source_object','part_id','source_part_id')):
            raise ValueError('Missing source identity')
        mapped[key]=row
    if {r['stage'] for r in triangle_map}!={0,1,2,3}:
        raise ValueError('Each cumulative stage must have geometry')
    out=copy.deepcopy(document);out['nodes']=[];out['meshes']=[]
    result=bytearray(binary);consumed=set()
    for node in nodes:
        mi=node['mesh'];mesh=meshes[mi]
        if mesh.get('weights'):
            raise ValueError('Morph sources are unsupported')
        for pi,primitive in enumerate(mesh['primitives']):
            if primitive.get('mode',4)!=4 or primitive.get('targets') or primitive.get('extensions'):
                raise ValueError('Only ordinary indexed triangles are supported')
            accessor,indices=read_indices(document,binary,primitive)
            rows=[]
            for triangle in range(len(indices)//3):
                key=(mi,pi,triangle);row=mapped.get(key)
                if row is None or row.get('indices')!=list(indices[triangle*3:triangle*3+3]) or row.get('material')!=primitive.get('material'):
                    raise ValueError('Missing map or source triangle/material mismatch')
                consumed.add(key);rows.append(row)
            for stage in range(4):
                selected=[row for row in rows if row['stage']==stage]
                if not selected:continue
                subset=[i for row in selected for i in row['indices']]
                result.extend(b'\0'*(-len(result)%4));offset=len(result)
                payload=struct.pack('<'+str(len(subset))+INDEX_FORMATS[accessor['componentType']],*subset)
                result.extend(payload)
                vi=len(out['bufferViews']);out['bufferViews'].append({'buffer':0,'byteOffset':offset,'byteLength':len(payload),'target':34963})
                ai=len(out['accessors']);out['accessors'].append({'bufferView':vi,'componentType':accessor['componentType'],'count':len(subset),'type':'SCALAR','min':[min(subset)],'max':[max(subset)]})
                part=copy.deepcopy(primitive);part['indices']=ai
                new_mesh={k:copy.deepcopy(v) for k,v in mesh.items() if k not in ('primitives','name')}
                new_mesh.update({'name':f'{mesh.get("name",mi)} stage {stage}','primitives':[part]})
                new_node=copy.deepcopy(node);new_node['mesh']=len(out['meshes']);new_node['name']=f'{node.get("name",mi)} stage {stage}'
                extras=new_node.setdefault('extras',{});extras['rtsConstructionStage']=stage
                for key,source in [('rtsPartIds','part_id'),('rtsSourcePartIds','source_part_id'),('rtsSourceObjects','source_object')]:
                    extras[key]=sorted({r[source] for r in selected})
                out['meshes'].append(new_mesh);out['nodes'].append(new_node)
    if consumed!=set(mapped):
        raise ValueError('Triangle map references nonexistent source geometry')
    out['scenes'][0]['nodes']=list(range(len(out['nodes'])))
    out['scenes'][0].setdefault('extras',{})['rtsConstruction']={
        'version':1,'thresholds':[0,.18,.55,.82],
        'stages':[{'id':i,'name':name} for i,name in enumerate(['foundation','bearing-structure','roof-or-upper-closure','openings-fittings'])]}
    out['buffers'][0]['byteLength']=len(result)
    return out,bytes(result)
