"""Build and prove lossless guard material batches, preserving equipment roots."""
import hashlib
import json
from pathlib import Path
import numpy as np
from assembly_bake import bake, read_glb, write_glb, read_accessor

ROOT=Path(__file__).resolve().parents[3]
RUN=ROOT/'art-factory/rts/runs/assembly-refinement/2026-10-08-v2'


def triangles(doc,binary):
    groups={}
    for node in doc['nodes']:
        if 'mesh' not in node:continue
        for p in doc['meshes'][node['mesh']]['primitives']:
            ids=read_accessor(doc,binary,p['indices']).reshape(-1)
            # Hash every complete triangle (all attributes, unchanged winding).
            rows=[read_accessor(doc,binary,p['attributes'][name])[ids] for name in sorted(p['attributes'])]
            for i in range(0,len(ids),3):
                digest=hashlib.sha256(b''.join(row[i:i+3].tobytes() for row in rows)).hexdigest()
                groups.setdefault(p.get('material'),[]).append(digest)
    return {key:sorted(value) for key,value in groups.items()}


def verify(a,ab,b,bb):
    assert triangles(a,ab)==triangles(b,bb), 'Indexed triangle attributes changed'
    assert a['materials']==b['materials'] and a['textures']==b['textures']
    assert a['scenes']==b['scenes'] and a.get('extras')==b.get('extras')
    for old,new in zip(a['skins'],b['skins']):
        assert {k:v for k,v in old.items() if k!='inverseBindMatrices'}=={k:v for k,v in new.items() if k!='inverseBindMatrices'}
        np.testing.assert_array_equal(read_accessor(a,ab,old['inverseBindMatrices']),read_accessor(b,bb,new['inverseBindMatrices']))
    for old,new in zip(a['animations'],b['animations']):
        assert old['channels']==new['channels'] and old['name']==new['name']
        for x,y in zip(old['samplers'],new['samplers']):
            assert x.get('interpolation')==y.get('interpolation')
            for key in ('input','output'):np.testing.assert_array_equal(read_accessor(a,ab,x[key]),read_accessor(b,bb,y[key]))
    for old,new in zip(a['images'],b['images']):
        if 'uri' in old:assert old==new
        else:
            def content(doc,data,img):
                v=doc['bufferViews'][img['bufferView']];return data[v.get('byteOffset',0):v.get('byteOffset',0)+v['byteLength']]
            assert content(a,ab,old)==content(b,bb,new)


def main():
    report=[]
    for lod in (0,1):
        name='guard'+('-lod1' if lod else '')
        src=ROOT/f'public/assets/games/rts/models/{name}.glb'
        snapshot=RUN/f'raw/before/{name}.glb';snapshot.parent.mkdir(parents=True,exist_ok=True)
        if not snapshot.exists():snapshot.write_bytes(src.read_bytes())
        a,ab=read_glb(snapshot)
        b,bb,info=bake(a,ab,preserve_names={f'KingdomSteelSword_LOD{lod}',f'KingdomSunShield_LOD{lod}'},anchor_name=f'GuardBody_LOD{lod}')
        verify(a,ab,b,bb)
        dst=RUN/f'candidate/{name}.glb';write_glb(dst,b,bb)
        report.append(dict(id=name,**info,source=str(snapshot.relative_to(ROOT)),source_sha256=hashlib.sha256(snapshot.read_bytes()).hexdigest(),
            candidate_sha256=hashlib.sha256(dst.read_bytes()).hexdigest(),bytes_before=snapshot.stat().st_size,bytes_after=dst.stat().st_size,
            indexed_triangle_attribute_parity=True,animation_skin_image_parity=True))
    (RUN/'qa/guard-bake.json').write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8')
    print(json.dumps([{k:v for k,v in row.items() if k!='part_map'} for row in report],indent=2))


if __name__=='__main__':main()
