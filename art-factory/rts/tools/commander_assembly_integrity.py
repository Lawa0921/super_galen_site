"""Compare actual GLB animation/skin payloads and validate assembly budgets."""
import hashlib,json,math,struct
from pathlib import Path
from procedural_gauntlet_publish import read_glb

ROOT=Path(__file__).resolve().parents[3]
RUN=ROOT/'art-factory/rts/runs/commander-assembly/2026-10-14-v1'
SIZES={'SCALAR':1,'VEC2':2,'VEC3':3,'VEC4':4,'MAT4':16}
FORMATS={5120:'b',5121:'B',5122:'h',5123:'H',5125:'I',5126:'f'}

def values(doc,raw,index):
    a=doc['accessors'][index];v=doc['bufferViews'][a['bufferView']]
    fmt='<'+FORMATS[a['componentType']]*SIZES[a['type']];size=struct.calcsize(fmt)
    start=v.get('byteOffset',0)+a.get('byteOffset',0);stride=v.get('byteStride',size)
    return [struct.unpack_from(fmt,raw,start+i*stride) for i in range(a['count'])]

def payload(doc,raw,index):
    a=doc['accessors'][index]
    return ({k:v for k,v in a.items() if k not in ('bufferView','byteOffset','name')},values(doc,raw,index))

def clips(doc,raw):
    result={}
    for a in doc['animations']:
        channels={}
        for c in a['channels']:
            target=c['target'];sampler=a['samplers'][c['sampler']]
            key=(doc['nodes'][target['node']]['name'],target['path'])
            assert key not in channels
            channels[key]=(target,sampler.get('interpolation','LINEAR'),payload(doc,raw,sampler['input']),payload(doc,raw,sampler['output']))
        result[a['name']]=channels
    return result

def main():
    rows=[]
    for lod in (0,1):
        old,oldraw=read_glb(RUN/f'raw/before/commander-lod{lod}.glb')
        path=RUN/f'candidate/commander-lod{lod}.glb';new,raw=read_glb(path)
        assert len(old['skins'])==len(new['skins'])==1
        os,ns=old['skins'][0],new['skins'][0]
        assert len(ns['joints'])==20 and os['joints']==ns['joints']
        assert [old['nodes'][i] for i in os['joints']]==[new['nodes'][i] for i in ns['joints']]
        assert payload(old,oldraw,os['inverseBindMatrices'])==payload(new,raw,ns['inverseBindMatrices'])
        before,after=clips(old,oldraw),clips(new,raw)
        assert before.keys()==after.keys() and len(after)==8
        for name in before:
            assert before[name].keys()==after[name].keys()
            if name!='Death':assert before[name]==after[name],name
        changed={key for key in before['Death'] if before['Death'][key]!=after['Death'][key]}
        assert changed=={('Hand_L','rotation'),('Hand_L','translation'),('Hand_R','rotation'),('Hand_R','translation'),('Forearm_L','rotation')},changed
        triangles=draws=weighted=0;weight_error=0
        for mesh in new['meshes']:
            for p in mesh['primitives']:
                draws+=1;triangles+=new['accessors'][p['indices']]['count']//3
                attrs=p['attributes'];weights=values(new,raw,attrs['WEIGHTS_0']);joints=values(new,raw,attrs['JOINTS_0'])
                assert len(weights)==len(joints);weighted+=len(weights)
                for row in weights:
                    assert all(math.isfinite(x) and x>=0 for x in row)
                    error=abs(sum(row)-1);assert error<1e-6;weight_error=max(weight_error,error)
                assert all(0<=x<20 for row in joints for x in row)
                for attribute in ('POSITION','NORMAL','TANGENT'):
                    if attribute in attrs:assert all(math.isfinite(x) for row in values(new,raw,attrs[attribute]) for x in row)
                if 'normalTexture' in new['materials'][p['material']]:assert 'TANGENT' in attrs
        assert triangles<=35000
        rows.append({'lod':lod,'sha256':hashlib.sha256(path.read_bytes()).hexdigest(),'bytes':path.stat().st_size,'triangles':triangles,'draws':draws,'weighted_vertices':weighted,'max_weight_sum_error':weight_error,'bones':20,'clips':8,'unchanged_non_death_clips':7,'death_changed_channels':sorted(changed)})
    assert rows[1]['triangles']<rows[0]['triangles']
    result={'status':'passed','triangle_cap':35000,'budget_source':'docs/superpowers/specs/2026-10-04-browser-rts-design.md:124','assets':rows}
    (RUN/'qa/glb-integrity.json').write_bytes((json.dumps(result,indent=2)+'\n').encode());print(json.dumps(result))

if __name__=='__main__':main()
