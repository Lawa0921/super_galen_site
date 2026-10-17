"""Candidate-only lossless texture packaging with decoded-pixel and BIN parity."""
import argparse,hashlib,io,json,posixpath
from copy import deepcopy
from pathlib import Path
from PIL import Image
from detail_materials import read_glb,write_glb
from unit_shared_textures import externalize_images,verify_externalization

def digest(data):return hashlib.sha256(data).hexdigest()

def pixel_signature(data):
    with Image.open(io.BytesIO(data)) as im:return (im.size,digest(im.convert('RGBA').tobytes()))

def optimize_image(data):
    with Image.open(io.BytesIO(data)) as im:
        mime=Image.MIME[im.format]
        if im.format!='PNG' or im.info.get('icc_profile'):return data,mime
        choices=[(data,mime)]
        for fmt,options in [('PNG',{'optimize':True}),('WEBP',{'lossless':True,'method':6,'exact':True})]:
            out=io.BytesIO();im.save(out,format=fmt,**options);encoded=out.getvalue()
            if pixel_signature(encoded)!=pixel_signature(data):raise ValueError('Lossless encoder changed decoded RGBA')
            choices.append((encoded,'image/webp' if fmt=='WEBP' else mime))
        return min(choices,key=lambda item:len(item[0]))

def pack_document(document,binary,resolve,cache):
    doc,data,embedded=externalize_images(document,binary)
    verify_externalization(document,binary,doc,data,embedded)
    exact=deepcopy(doc);files={};rows=[];webp_images=set()
    for index,image in enumerate(doc.get('images',[])):
        original=embedded[image['uri']] if image['uri'] in embedded else resolve(image['uri'])
        sha=digest(original)
        if sha not in cache:cache[sha]=optimize_image(original)
        encoded,mime=cache[sha];signature=pixel_signature(original)
        if pixel_signature(encoded)!=signature:raise ValueError('Packed texture RGBA mismatch')
        suffix={'image/jpeg':'jpg','image/png':'png','image/webp':'webp'}[mime]
        uri='../materials/unit-shared/'+digest(encoded)+'.'+suffix
        files[uri]=encoded;image['uri']=uri;image['mimeType']=mime
        if mime=='image/webp':webp_images.add(index)
        rows.append({'image':index,'source_uri':exact['images'][index]['uri'],'source_sha256':sha,'sha256':digest(encoded),'bytes_before':len(original),'bytes_after':len(encoded),'dimensions':signature[0],'rgba_sha256':signature[1],'rgba_unchanged':True})
    for texture in doc.get('textures',[]):
        if texture.get('source') in webp_images:
            texture.setdefault('extensions',{})['EXT_texture_webp']={'source':texture.pop('source')}
    if webp_images:
        for key in ('extensionsUsed','extensionsRequired'):
            doc[key]=list(dict.fromkeys([*doc.get(key,[]),'EXT_texture_webp']))
    # Only image encodings/URIs and their required texture dispatch may differ.
    check=deepcopy(doc)
    for key in ('images','textures','extensionsUsed','extensionsRequired'):
        if key in exact:check[key]=exact[key]
        else:check.pop(key,None)
    if check!=exact:raise ValueError('Packing changed geometry, material parameters or animation')
    return doc,data,files,rows

def main():
    p=argparse.ArgumentParser();p.add_argument('--source',type=Path,required=True);p.add_argument('--run',type=Path,required=True);a=p.parse_args()
    root=Path(__file__).resolve().parents[3];source=a.source.resolve();run=a.run.resolve();manifest=json.loads((source/'review-manifest.json').read_text(encoding='utf-8'));cache={};models=[];materials={}
    if source==run:raise ValueError('Packing must not overwrite the source run')
    for folder in ('candidate','candidate-materials/unit-shared','qa'):(run/folder).mkdir(parents=True,exist_ok=True)
    for asset,entry in manifest['assets'].items():
        for key in ('url','lod1'):
            if key not in entry:continue
            url=entry[key];name=url.rsplit('/',1)[-1];path=source/'candidate'/name;doc,binary=read_glb(path)
            def resolve(uri):
                resolved=posixpath.normpath(posixpath.join(posixpath.dirname(url),uri))
                if not resolved.startswith('/assets/games/rts/'):raise ValueError('Texture escapes registered RTS assets')
                return (root/'public'/resolved.lstrip('/')).read_bytes()
            packed,data,images,report=pack_document(doc,binary,resolve,cache)
            depth=len(posixpath.relpath('/assets/games/rts/materials',posixpath.dirname(url)).split('/'))-1
            for image in packed.get('images',[]):image['uri']='../'*depth+image['uri'][3:]
            for uri,encoded in images.items():
                filename=uri.rsplit('/',1)[-1];target=run/'candidate-materials/unit-shared'/filename;target.write_bytes(encoded)
                material_url='/assets/games/rts/materials/unit-shared/'+filename
                materials[material_url]={'url':material_url,'file':str(target.relative_to(run)).replace('\\','/'),'sha256':digest(encoded),'bytes':len(encoded)}
            target=run/'candidate'/name;write_glb(target,packed,data)
            models.append({'id':asset,'lod':int(key=='lod1'),'url':url,'file':str(target.relative_to(run)).replace('\\','/'),'source_sha256':digest(path.read_bytes()),'sha256':digest(target.read_bytes()),'bytes_before':path.stat().st_size,'bytes':target.stat().st_size,'images':report})
    (run/'review-manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
    report={'models':models,'materials':list(materials.values()),'model_bytes':sum(m['bytes'] for m in models),'material_bytes':sum(m['bytes'] for m in materials.values()),'all_decoded_rgba_unchanged':True,'runtime_publish_allowed':False,'user_art_approval':False}
    (run/'qa/lossless-packing.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps({k:v for k,v in report.items() if k not in ('models','materials')}))
if __name__=='__main__':main()
