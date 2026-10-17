"""Package the edited assembly against the current published skin/animations."""
import copy,struct,hashlib
from procedural_gauntlet_publish import read_glb,write_glb
from commander_grip_pack import compact

def package(base,exported,target,lod,bounds):
    doc,binary=read_glb(base);new,extra=read_glb(exported);raw=bytearray(binary)
    ref=next(n for n in doc['nodes'] if n.get('name')==f'CommanderLongsword_LOD{lod}');other=next(n for n in new['nodes'] if n.get('name')==ref['name'])
    oldj=[doc['nodes'][i]['name'] for i in doc['skins'][ref['skin']]['joints']];newj=[new['nodes'][i]['name'] for i in new['skins'][other['skin']]['joints']]
    accessors={};views={};materials={};textures={}
    def accessor(index,joints=False):
        if index in accessors:return accessors[index]
        a=copy.deepcopy(new['accessors'][index]);vi=a['bufferView']
        if vi not in views:
            v=copy.deepcopy(new['bufferViews'][vi]);start=v.get('byteOffset',0);data=bytearray(extra[start:start+v['byteLength']])
            if joints:
                fmt={5121:'B',5123:'H'}[a['componentType']];size=struct.calcsize(fmt);stride=v.get('byteStride',size*4)
                for row in range(a['count']):
                    for col in range(4):
                        offset=a.get('byteOffset',0)+row*stride+col*size;i=struct.unpack_from('<'+fmt,data,offset)[0];struct.pack_into('<'+fmt,data,offset,oldj.index(newj[i]))
            raw.extend(b'\0'*((-len(raw))%4));v.update(buffer=0,byteOffset=len(raw));raw.extend(data);views[vi]=len(doc['bufferViews']);doc['bufferViews'].append(v)
        a['bufferView']=views[vi];accessors[index]=len(doc['accessors']);doc['accessors'].append(a);return accessors[index]
    def texture(name):
        if name in textures:return textures[name]
        image=len(doc.setdefault('images',[]));doc['images'].append({'name':name,'uri':'../materials/detail-v1/'+name})
        sampler={'magFilter':9729,'minFilter':9987,'wrapS':10497,'wrapT':10497}
        samplers=doc.setdefault('samplers',[])
        if sampler not in samplers:samplers.append(sampler)
        textures[name]=len(doc.setdefault('textures',[]));doc['textures'].append({'source':image,'sampler':samplers.index(sampler)});return textures[name]
    def material(index):
        name=new['materials'][index]['name']
        if name in materials:return materials[name]
        if name.startswith('CommanderDetail_'):
            kind=name.split('_',1)[1];pbr={'metallicFactor':.45 if kind=='steel' else .55 if kind=='brass' else 0,'roughnessFactor':1,'baseColorTexture':{'index':texture(kind+'-color.jpg')},'metallicRoughnessTexture':{'index':texture(kind+'-mr.png')}}
            m={'name':name,'pbrMetallicRoughness':pbr,'normalTexture':{'index':texture(kind+'-normal.png'),'scale':.10 if kind in ('steel','brass') else .16}}
            materials[name]=len(doc['materials']);doc['materials'].append(m)
        elif name=='TeamCloth_Shield':
            materials[name]=next(i for i,m in enumerate(doc['materials']) if m['name']==name)
            m=doc['materials'][materials[name]];m['normalTexture']={'index':texture('cloth-normal.png'),'scale':.08};m['pbrMetallicRoughness']['metallicRoughnessTexture']={'index':texture('cloth-mr.png')}
        else:materials[name]=next(i for i,m in enumerate(doc['materials']) if m['name']==name)
        return materials[name]
    names=[f'{part}_LOD{lod}' for part in ('commanderOriginalBody','CommanderLongsword','CommanderDawnShield','CommanderClosedGrip_R','CommanderClosedGrip_L')]
    for name in names:
        n=next(n for n in new['nodes'] if n.get('name')==name);mesh=copy.deepcopy(new['meshes'][n['mesh']]);mesh['name']=name+'Mesh'
        for p in mesh['primitives']:
            if name.startswith('commanderOriginalBody'):
                p['attributes'].pop('TANGENT',None)
            p['attributes']={k:accessor(v,k.startswith('JOINTS')) for k,v in p['attributes'].items()};p['indices']=accessor(p['indices']);p['material']=material(p['material'])
        node=next((n for n in doc['nodes'] if n.get('name')==name),None)
        if node is None:
            node={'name':name,'mesh':len(doc['meshes']),'skin':ref['skin']};doc['meshes'].append(mesh)
            parent=next(n for n in doc['nodes'] if doc['nodes'].index(ref) in n.get('children',[]));parent['children'].append(len(doc['nodes']));doc['nodes'].append(node)
        else:doc['meshes'][node['mesh']]=mesh
        node.setdefault('extras',{})['rtsConservativeBounds']=bounds[name]
    death=next(a for a in doc['animations'] if a['name']=='Death');changed=next(a for a in new['animations'] if a['name']=='Death')
    for bone,path in (('Hand_L','rotation'),('Hand_L','translation'),('Hand_R','rotation'),('Hand_R','translation'),('Forearm_L','rotation')):
        oldc=next(c for c in death['channels'] if doc['nodes'][c['target']['node']]['name']==bone and c['target']['path']==path)
        newc=next(c for c in changed['channels'] if new['nodes'][c['target']['node']]['name']==bone and c['target']['path']==path)
        s=copy.deepcopy(changed['samplers'][newc['sampler']]);s['input']=accessor(s['input']);s['output']=accessor(s['output']);oldc['sampler']=len(death['samplers']);death['samplers'].append(s)
    packed,record=compact(doc,bytes(raw));write_glb(target,doc,packed)
    return {'path':str(target),'sha256':hashlib.sha256(target.read_bytes()).hexdigest(),'bytes':target.stat().st_size,'packing':record,'triangles':sum(doc['accessors'][p['indices']]['count']//3 for m in doc['meshes'] for p in m['primitives'])}
