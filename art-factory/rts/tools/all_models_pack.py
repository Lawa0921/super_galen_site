"""Replace reviewed meshes/channels without rewriting unrelated runtime payloads."""
import copy,hashlib,struct
from procedural_gauntlet_publish import read_glb,write_glb
from commander_grip_pack import compact

def package(base,exported,target,names,bounds,changes=None,material_aliases=None):
    doc,binary=read_glb(base);new,extra=read_glb(exported);raw=bytearray(binary)
    accessors={};views={};materials={};textures={};changes=changes or {};material_aliases=material_aliases or {}
    def accessor(index,joint_map=None):
        if index in accessors:return accessors[index]
        a=copy.deepcopy(new['accessors'][index]);vi=a['bufferView']
        if vi not in views:
            v=copy.deepcopy(new['bufferViews'][vi]);start=v.get('byteOffset',0);data=bytearray(extra[start:start+v['byteLength']])
            if joint_map is not None:
                fmt={5121:'B',5123:'H'}[a['componentType']];size=struct.calcsize(fmt);stride=v.get('byteStride',size*4)
                for row in range(a['count']):
                    for col in range(4):
                        offset=a.get('byteOffset',0)+row*stride+col*size;i=struct.unpack_from('<'+fmt,data,offset)[0];struct.pack_into('<'+fmt,data,offset,joint_map[i])
            raw.extend(b'\0'*((-len(raw))%4));v.update(buffer=0,byteOffset=len(raw));raw.extend(data);views[vi]=len(doc['bufferViews']);doc['bufferViews'].append(v)
        a['bufferView']=views[vi];accessors[index]=len(doc['accessors']);doc['accessors'].append(a);return accessors[index]
    def texture(name):
        if name in textures:return textures[name]
        image=len(doc.setdefault('images',[]));doc['images'].append({'name':name,'uri':'../materials/detail-v1/'+name})
        sampler={'magFilter':9729,'minFilter':9987,'wrapS':10497,'wrapT':10497};samplers=doc.setdefault('samplers',[])
        if sampler not in samplers:samplers.append(sampler)
        textures[name]=len(doc.setdefault('textures',[]));doc['textures'].append({'source':image,'sampler':samplers.index(sampler)});return textures[name]
    def material(index):
        name=new['materials'][index]['name'];name=material_aliases.get(name,name)
        if name in materials:return materials[name]
        if name.startswith('AssemblyDetail_'):
            kind=name.split('_',1)[1];m={'name':name,'pbrMetallicRoughness':{'metallicFactor':.45 if kind=='steel' else .55 if kind=='brass' else 0,'roughnessFactor':1,'baseColorTexture':{'index':texture(kind+'-color.jpg')},'metallicRoughnessTexture':{'index':texture(kind+'-mr.png')}},'normalTexture':{'index':texture(kind+'-normal.png'),'scale':.10 if kind in ('steel','brass') else .16}}
            m['doubleSided']=True
            materials[name]=len(doc['materials']);doc['materials'].append(m)
        else:
            matches=[i for i,m in enumerate(doc['materials']) if m['name']==name]
            assert len(matches)==1,('Unmapped source material',name);materials[name]=matches[0]
        return materials[name]
    for name in names:
        source=next(n for n in new['nodes'] if n.get('name')==name);node=next((n for n in doc['nodes'] if n.get('name')==name),None)
        newj=[new['nodes'][i]['name'] for i in new['skins'][source['skin']]['joints']]
        skin=next(i for i,s in enumerate(doc['skins']) if set(doc['nodes'][j]['name'] for j in s['joints'])==set(newj))
        oldj=[doc['nodes'][i]['name'] for i in doc['skins'][skin]['joints']];mapping=[oldj.index(n) for n in newj]
        mesh=copy.deepcopy(new['meshes'][source['mesh']])
        for p in mesh['primitives']:
            mi=material(p['material'])
            if 'normalTexture' not in doc['materials'][mi]:p['attributes'].pop('TANGENT',None)
            p['attributes']={k:accessor(v,mapping if k.startswith('JOINTS') else None) for k,v in p['attributes'].items()};p['indices']=accessor(p['indices']);p['material']=mi
        if node is None:
            anchor=next(n for n in doc['nodes'] if n.get('skin')==skin and 'mesh' in n)
            node={'name':name,'mesh':len(doc['meshes']),'skin':skin};doc['meshes'].append(mesh)
            parent=next(n for n in doc['nodes'] if doc['nodes'].index(anchor) in n.get('children',[]));parent['children'].append(len(doc['nodes']));doc['nodes'].append(node)
        else:doc['meshes'][node['mesh']]=mesh
        node.setdefault('extras',{})['rtsConservativeBounds']=bounds[name]
        if 'extras' in source:
            for k,v in source['extras'].items():
                if k in ('original_gauntlet_parts','assembly_refinement'):node['extras'][k]=v
    for clip,channels in changes.items():
        olda=next(a for a in doc['animations'] if a['name']==clip);newa=next(a for a in new['animations'] if a['name']==clip)
        for bone,path in channels:
            oldc=next(c for c in olda['channels'] if doc['nodes'][c['target']['node']]['name']==bone and c['target']['path']==path)
            newc=next(c for c in newa['channels'] if new['nodes'][c['target']['node']]['name']==bone and c['target']['path']==path)
            s=copy.deepcopy(newa['samplers'][newc['sampler']]);s['input']=accessor(s['input']);s['output']=accessor(s['output']);oldc['sampler']=len(olda['samplers']);olda['samplers'].append(s)
    packed,record=compact(doc,bytes(raw));write_glb(target,doc,packed)
    return {'path':str(target),'sha256':hashlib.sha256(target.read_bytes()).hexdigest(),'bytes':target.stat().st_size,'packing':record,'triangles':sum(doc['accessors'][p['indices']]['count']//3 for m in doc['meshes'] for p in m['primitives'])}
