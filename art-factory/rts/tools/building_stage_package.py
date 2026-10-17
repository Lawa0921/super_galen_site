"""Package approved stage geometry against existing hash-identical textures.

No runtime writes. JSON image URIs are the only changed GLB content; all binary
chunks and other JSON fields must be byte/semantic equal to the reviewed input.
"""
import hashlib
import json
import struct
from pathlib import Path

ROOT=Path(__file__).resolve().parents[3]
RUN=ROOT/'art-factory/rts/runs/building-stages/2026-10-08-v1'


def sha(data):return hashlib.sha256(data).hexdigest()


def parse(data):
    if len(data)<20 or data[:4]!=b'glTF' or struct.unpack_from('<II',data,4)!=(2,len(data)) or struct.unpack_from('<I',data,16)[0]!=0x4e4f534a:
        raise ValueError('Expected complete GLB2 with leading JSON chunk')
    size=struct.unpack_from('<I',data,12)[0]
    if size%4 or 20+size>len(data):raise ValueError('Invalid JSON chunk extent')
    return json.loads(data[20:20+size]),data[20+size:]


def rewrite_image_uris(data,mapping):
    document,tail=parse(data)
    for image in document.get('images',[]):
        uri=image.get('uri')
        if uri is None:continue
        if uri not in mapping:raise ValueError('Missing reviewed image URI: '+uri)
        image['uri']=mapping[uri]
    encoded=json.dumps(document,separators=(',',':'),ensure_ascii=False).encode('utf-8')
    encoded+=b' '*((-len(encoded))%4)
    return struct.pack('<4sII',b'glTF',2,20+len(encoded)+len(tail))+struct.pack('<II',len(encoded),0x4e4f534a)+encoded+tail


def equivalent_texture_uri(source_uri,data,existing):
    matches=[uri for uri,value in existing.items() if Path(uri).name==Path(source_uri).name and value==data]
    if len(matches)!=1:raise ValueError('Expected one byte-identical existing texture for '+source_uri)
    return matches[0]


def main():
    delivery=json.loads((RUN/'qa/delivery.json').read_text(encoding='utf-8'))
    review=json.loads((RUN/'qa/independent-asset-review.json').read_text(encoding='utf-8'))
    if review['decision']!='approved_candidate_for_root_runtime_integration_only':
        raise ValueError('Candidate review does not approve integration')
    textures={Path(r['path']).name:r for r in delivery['shared_original_textures']}
    out=RUN/'candidate-runtime';out.mkdir(parents=True,exist_ok=True)
    records=[]
    for asset in delivery['assets']:
        source=ROOT/asset['candidate'];data=source.read_bytes()
        if not sha(data)==asset['sha256']==review['reviewed_files'][source.relative_to(RUN).as_posix()]:
            raise ValueError('Candidate hash does not match delivery and review')
        old=ROOT/f'public/assets/games/rts/models/{asset["id"]}.glb'
        current,_=parse(old.read_bytes())
        existing={image['uri']:(old.parent/image['uri']).read_bytes() for image in current.get('images',[]) if 'uri' in image}
        original,tail=parse(data);mapping={};resource_records=[]
        for image in original.get('images',[]):
            uri=image['uri'];candidate_texture=source.parent/uri
            resource=candidate_texture.read_bytes();expected=textures[candidate_texture.name]['sha256']
            if not sha(resource)==expected==review['reviewed_files'][candidate_texture.relative_to(RUN).as_posix()]:
                raise ValueError('Texture hash does not match delivery and review')
            replacement=equivalent_texture_uri(uri,resource,existing)
            mapping[uri]=replacement
            resource_records.append({'candidate_uri':uri,'runtime_uri':replacement,'sha256':expected})
        packaged=rewrite_image_uris(data,mapping);document,packed_tail=parse(packaged)
        reverse={v:k for k,v in mapping.items()}
        for image in document['images']:image['uri']=reverse[image['uri']]
        if document!=original or packed_tail!=tail:
            raise ValueError('Packaging changed non-URI JSON or binary chunks')
        target=out/source.name
        if target.exists() and target.read_bytes()!=packaged:raise ValueError('Refuse overwriting different package')
        target.write_bytes(packaged)
        records.append({'id':asset['id'],'reviewed_candidate_sha256':asset['sha256'],'source':asset['source'],'source_sha256':asset['source_sha256'],
                        'candidate':target.relative_to(ROOT).as_posix(),'sha256':sha(packaged),'bytes':len(packaged),
                        'previous_runtime_sha256':sha(old.read_bytes()),'binary_chunks_identical':True,'non_image_json_identical':True,'textures':resource_records})
    report={'status':'uri_only_package_pending_runtime_review','runtime_publish_allowed':False,'review_sha256':sha((RUN/'qa/independent-asset-review.json').read_bytes()),
            'recipe_sha256':sha(Path(__file__).read_bytes()),'assets':records,'new_texture_files_required':0}
    (RUN/'qa/runtime-packaging.json').write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8',newline='\n')
    print('PACKAGED3_STAGE_GLBS','existing21textures reused by exact bytes','runtime unchanged')


if __name__=='__main__':main()
