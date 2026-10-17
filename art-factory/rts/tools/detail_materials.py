"""Original surface derivatives and lossless GLB image de-duplication.

No runtime writes. Surface height is an artistic luminance approximation, not
measured displacement. Original generated RGB is preserved except resizing,
explicit stone trim crop and opposite-edge crossfade.
"""
from pathlib import Path
import copy
import hashlib
import json
import struct
import numpy as np

ROOT = Path(__file__).resolve().parents[3]
RUN = ROOT / 'art-factory/rts/runs/detail-refinement/2026-10-07-v1'
TEXTURES = RUN / 'candidate/materials'
BASE = '../materials/detail-v1/'
SOURCES = {
    'ashlar': ('kingdom-buildings/2026-10-04-v2/raw/textures/ivory-ashlar-source.png', 1024, .91, 0),
    'cutstone': ('kingdom-buildings/2026-10-04-v2/raw/textures/ivory-ashlar-source.png', 256, .87, 0),
    'slate': ('kingdom-buildings/2026-10-04-v2/raw/textures/navy-slate-source.png', 512, .73, 0),
    'oak': ('kingdom-siege/2026-10-04-original/candidate/textures/hewn-oak-basecolor.jpg', 512, .79, 0),
    'granite': ('kingdom-props/2026-10-04-original/raw/textures/gray-rock-source.png', 1024, .9, 0),
    'steel': ('original-guard-surface-materials/2026-10-05/candidate/steel-512.png', 256, .43, .82),
    'brass': ('original-guard-surface-materials/2026-10-05/candidate/brass-512.png', 256, .47, .73),
    'leather': ('original-guard-surface-materials/2026-10-05/candidate/leather-512.png', 256, .82, 0),
    'cloth': ('original-guard-surface-materials/2026-10-05/candidate/cloth-512.png', 256, .96, 0),
}
MATERIALS = {
    'IvoryLimestone': 'ashlar', 'LightCutStone': 'cutstone', 'NavySlate': 'slate', 'SlateHighlight': 'slate',
    'DarkTimber': 'oak', 'TimberEdge': 'oak', 'MineTimber': 'oak', 'GrayRock': 'granite',
    'WeatheredBrass': 'brass', 'Ironwork': 'steel', 'TeamCloth': 'cloth',
    'ForgedSteel': 'steel', 'WarmBrass': 'brass', 'WornLeather': 'leather', 'TeamCloth_Shield': 'cloth',
    'WorkedAshWood': 'oak', 'ForgedToolSteel': 'steel', 'DarkIron': 'steel', 'WornLeatherGrip': 'leather',
}


def sha(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def original_registry(kind):
    snapshot=RUN/'raw/previous-registries'/f'{kind}-registry.json'
    path=snapshot if snapshot.exists() else ROOT/f'art-factory/rts/manifests/{kind}-registry.json'
    return json.loads(path.read_text(encoding='utf-8'))


def normal_map(height, strength=3.0):
    # PNG rows run down; OpenGL tangent V runs up.
    dx = (np.roll(height, -1, 1) - np.roll(height, 1, 1)) * strength
    dy = (np.roll(height, -1, 0) - np.roll(height, 1, 0)) * strength
    n = np.stack((-dx, dy, np.ones_like(dx)), axis=-1)
    n /= np.linalg.norm(n, axis=-1, keepdims=True)
    return np.rint((n + 1) * 127.5).astype(np.uint8)


def tile(image):
    from PIL import Image
    a = np.array(image.convert('RGB'), dtype=float)
    for axis in (0, 1):
        a = np.swapaxes(a, 0, axis)
        for i in range(20):
            weight = .5 * (1-i/20)**2
            first, last = a[i].copy(), a[-1-i].copy()
            a[i] = first*(1-weight) + last*weight
            a[-1-i] = last*(1-weight) + first*weight
        a = np.swapaxes(a, 0, axis)
    return Image.fromarray(np.rint(a).astype(np.uint8))


def prepare():
    from PIL import Image, ImageFilter
    TEXTURES.mkdir(parents=True, exist_ok=True); (RUN/'qa').mkdir(exist_ok=True)
    rows=[]
    for name, (source, size, rough, metal) in SOURCES.items():
        src=ROOT/'art-factory/rts/runs'/source
        im=Image.open(src).convert('RGB')
        if name=='cutstone':
            # The center of one unjointed generated stone; not a new painted surface.
            w,h=im.size; im=im.crop((int(w*.14), int(h*.145), int(w*.375), int(h*.23)))
        im=tile(im.resize((size,size),Image.Resampling.LANCZOS))
        im.save(TEXTURES/f'{name}-color.jpg',quality=86,subsampling=0,optimize=True)
        small=im.resize((256,256),Image.Resampling.LANCZOS).filter(ImageFilter.GaussianBlur(.5))
        height=np.array(small.convert('L'),dtype=float)/255
        Image.fromarray(normal_map(height)).save(TEXTURES/f'{name}-normal.png',optimize=True)
        mr=np.empty((256,256,3),dtype=np.uint8);mr[:,:,0]=255
        mr[:,:,1]=np.rint(np.clip(rough+(height.mean()-height)*.23,.18,1)*255)
        mr[:,:,2]=round(metal*255)
        Image.fromarray(mr).save(TEXTURES/f'{name}-mr.png',optimize=True)
        rows.append({'id':name,'source':str(src.relative_to(ROOT)),'source_sha256':sha(src),
                     'color_dimensions':[size,size], 'normal_convention':'OpenGL +Y',
                     'derivation':'periodic central luminance differences; roughness artistic, not measured',
                     'outputs':{p.name:{'sha256':sha(p),'bytes':p.stat().st_size} for p in TEXTURES.glob(name+'-*')}})
    (RUN/'qa/materials.json').write_text(json.dumps(rows,indent=2)+'\n',encoding='utf-8')
    print('Prepared',len(rows),'original surface sets')


def read_glb(path):
    b=Path(path).read_bytes();size=struct.unpack_from('<I',b,12)[0]
    return json.loads(b[20:20+size]),b[28+size:]


def write_glb(path, doc, binary):
    doc['buffers']=[{'byteLength':len(binary)}]
    j=json.dumps(doc,separators=(',',':'),ensure_ascii=True).encode();j+=b' '*((-len(j))%4)
    binary+=b'\0'*((-len(binary))%4)
    Path(path).write_bytes(struct.pack('<4sII',b'glTF',2,28+len(j)+len(binary))+struct.pack('<I4s',len(j),b'JSON')+j+struct.pack('<I4s',len(binary),b'BIN\0')+binary)


def repack_external_images(doc,binary,uris):
    doc=copy.deepcopy(doc)
    removed={doc['images'][i]['bufferView'] for i in uris if 'bufferView' in doc['images'][i]}
    used={a.get('bufferView') for a in doc.get('accessors',[])}
    for a in doc.get('accessors',[]):
        if 'sparse' in a:
            used.update((a['sparse']['indices']['bufferView'],a['sparse']['values']['bufferView']))
    if used & removed: raise ValueError('Image shares accessor data')
    out=bytearray();views=[];mapping={}
    for old,v in enumerate(doc.get('bufferViews',[])):
        if old in removed:continue
        out.extend(b'\0'*((-len(out))%4));start=v.get('byteOffset',0)
        mapping[old]=len(views);nv=dict(v,byteOffset=len(out));views.append(nv)
        out.extend(binary[start:start+v['byteLength']])
    for a in doc.get('accessors',[]):
        if 'bufferView' in a:a['bufferView']=mapping[a['bufferView']]
        if 'sparse' in a:
            for key in ('indices','values'):a['sparse'][key]['bufferView']=mapping[a['sparse'][key]['bufferView']]
    for i,img in enumerate(doc.get('images',[])):
        if i in uris:doc['images'][i]={'uri':uris[i]}
        elif 'bufferView' in img:img['bufferView']=mapping[img['bufferView']]
    doc['bufferViews']=views;doc['buffers']=[{'byteLength':len(out)}]
    return doc,bytes(out)


def externalize_building(path):
    doc,binary=read_glb(path);uris={}
    for i,img in enumerate(doc.get('images',[])):
        name=img.get('name','')
        # Blender exports the actual source basename; content mapping guards name drift.
        v=doc['bufferViews'][img['bufferView']];raw=binary[v.get('byteOffset',0):v.get('byteOffset',0)+v['byteLength']]
        matching=[p for p in TEXTURES.iterdir() if p.read_bytes()==raw]
        if not matching:raise ValueError('Unregistered embedded image: '+name)
        uris[i]=BASE+matching[0].name
    doc,binary=repack_external_images(doc,binary,uris);write_glb(path,doc,binary)


def patch_equipment(src,dst):
    doc,binary=read_glb(src);cache={}
    def texture(surface,kind):
        key=surface+'-'+kind
        if key in cache:return cache[key]
        suffix='jpg' if kind=='color' else 'png'
        image=len(doc.setdefault('images',[]));doc['images'].append({'uri':BASE+key+'.'+suffix})
        sampler=len(doc.setdefault('samplers',[]));doc['samplers'].append({'magFilter':9729,'minFilter':9987,'wrapS':10497,'wrapT':10497})
        index=len(doc.setdefault('textures',[]));doc['textures'].append({'source':image,'sampler':sampler});cache[key]=index
        return index
    modified=[]
    for mat in doc['materials']:
        name=mat.get('name');surface=MATERIALS.get(name)
        if not surface:continue
        pbr=mat.setdefault('pbrMetallicRoughness',{})
        # These exact names belong to equipment; body atlas and team masks stay untouched.
        if name not in ['TeamCloth_Shield']:
            pbr['baseColorTexture']={'index':texture(surface,'color')}
            pbr['baseColorFactor']=[1,1,1,1]
        pbr.update(metallicFactor=1,roughnessFactor=1,metallicRoughnessTexture={'index':texture(surface,'mr')})
        mat['normalTexture']={'index':texture(surface,'normal'),'scale':.45 if surface!='cloth' else .65}
        modified.append(name)
    write_glb(dst,doc,binary)
    return modified


if __name__=='__main__':prepare()
