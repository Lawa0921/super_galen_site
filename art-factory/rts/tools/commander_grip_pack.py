"""Discard unreferenced packaging data while checking every live payload."""
import copy,hashlib,json
from pathlib import Path
from assembly_bake import _compact,read_accessor,read_glb,write_glb

def semantic(doc,binary):
    def acc(i):
        a=doc['accessors'][i];meta={k:v for k,v in a.items() if k not in ('bufferView','byteOffset')}
        return [meta,hashlib.sha256(read_accessor(doc,binary,i).tobytes()).hexdigest()]
    result={k:copy.deepcopy(v) for k,v in doc.items() if k not in ('buffers','bufferViews','accessors','meshes','animations','skins')}
    result['meshes']=copy.deepcopy(doc['meshes'])
    for m in result['meshes']:
        for p in m['primitives']:
            assert 'targets' not in p and 'extensions' not in p
            p['attributes']={k:acc(v) for k,v in p['attributes'].items()};p['indices']=acc(p['indices'])
    result['skins']=copy.deepcopy(doc['skins'])
    for s in result['skins']:s['inverseBindMatrices']=acc(s['inverseBindMatrices'])
    result['animations']=[]
    for a in doc['animations']:
        row={k:copy.deepcopy(v) for k,v in a.items() if k not in ('channels','samplers')};row['channels']=[]
        for c in a['channels']:
            sampler=copy.deepcopy(a['samplers'][c['sampler']]);sampler['input']=acc(sampler['input']);sampler['output']=acc(sampler['output'])
            row['channels'].append({**c,'sampler':sampler})
        result['animations'].append(row)
    assert all('bufferView' not in im for im in doc.get('images',[])),'External textures expected'
    return hashlib.sha256(json.dumps(result,sort_keys=True).encode()).hexdigest()

def compact(doc,binary):
    before=semantic(doc,binary)
    for a in doc['animations']:
        used=sorted({c['sampler'] for c in a['channels']});mapping={old:new for new,old in enumerate(used)}
        a['samplers']=[a['samplers'][i] for i in used]
        for c in a['channels']:c['sampler']=mapping[c['sampler']]
    output=_compact(doc,binary)
    assert semantic(doc,output)==before,'Lossless packing changed live model data'
    return output,{'logical_payload_sha256':before,'before_binary_bytes':len(binary),'after_binary_bytes':len(output)}

def main():
    run=Path(__file__).resolve().parents[3]/'art-factory/rts/runs/commander-grip/2026-10-14-v1';report=[]
    build=json.loads((run/'qa/build.json').read_bytes())
    for lod in (0,1):
        p=run/f'candidate/commander-lod{lod}.glb';doc,data=read_glb(p);data,row=compact(doc,data);write_glb(p,doc,data)
        row.update(lod=lod,sha256=hashlib.sha256(p.read_bytes()).hexdigest(),bytes=p.stat().st_size);report.append(row)
        build['candidates'][lod].update(sha256=row['sha256'],bytes=row['bytes'],lossless_pack=row)
    (run/'qa/build.json').write_bytes((json.dumps(build,indent=2)+'\n').encode());(run/'qa/lossless-pack.json').write_bytes((json.dumps(report,indent=2)+'\n').encode());print(json.dumps(report))
if __name__=='__main__':main()
