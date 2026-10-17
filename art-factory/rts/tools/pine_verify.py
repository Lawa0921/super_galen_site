"""Verify actual exported pine primitives, texture contract and clean GLB reimport."""
import bpy,hashlib,json,math,struct,sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).parent))
import props_verify_import as verify
ROOT=Path(__file__).resolve().parents[1];RUN=ROOT/'runs/highland-pine/2026-10-06-v1'

def main():
    source=json.loads((RUN/'qa/model.json').read_text());file=RUN/'candidate/pine.glb';raw=file.read_bytes();size=struct.unpack_from('<I',raw,12)[0];g=json.loads(raw[20:20+size])
    assert hashlib.sha256(raw).hexdigest()==source['glb_sha256']
    assert len(g['meshes'])==len(g['materials'])==2 and not g.get('skins') and not g.get('animations')
    triangles=0
    for mesh in g['meshes']:
        for primitive in mesh['primitives']:
            assert primitive.get('mode',4)==4 and {'POSITION','NORMAL','TEXCOORD_0'}<=primitive['attributes'].keys()
            material=g['materials'][primitive['material']]
            textures=[material['pbrMetallicRoughness']['baseColorTexture']]
            if 'normalTexture' in material:textures.append(material['normalTexture'])
            for texture in textures:
                channel=texture.get('texCoord',0)
                assert isinstance(channel,int) and channel>=0 and f'TEXCOORD_{channel}' in primitive['attributes'],(material['name'],channel)
            triangles+=g['accessors'][primitive['indices']]['count']//3
    assert triangles==source['triangles'] and triangles<=6000 and len(raw)<=1800000
    needles=next(m for m in g['materials'] if m['name']=='PineNeedles');bark=next(m for m in g['materials'] if m['name']=='PineBark')
    assert needles['alphaMode']=='MASK' and abs(needles['alphaCutoff']-.48)<1e-5 and needles['doubleSided']
    assert bark.get('alphaMode','OPAQUE')=='OPAQUE' and 'normalTexture' in bark
    verify.RUN=RUN;verify.ASSETS={'pine':(6.4,6.4)};roundtrip=verify.verify('pine')
    assert roundtrip['import_triangle_count']==triangles and roundtrip['import_mesh_count']==2
    for key,before in [('blender_import_bounds_min_xyz_m',source['bounds_min_blender']),('blender_import_bounds_max_xyz_m',source['bounds_max_blender'])]:assert max(abs(a-b) for a,b in zip(roundtrip[key],before))<.0001
    assert abs(roundtrip['blender_import_bounds_min_xyz_m'][2])<.00001
    for obj in bpy.data.objects:
        if obj.type!='MESH':continue
        assert all(math.isfinite(c) for v in obj.data.vertices for c in v.co)
        assert all(abs(v.normal.length-1)<1e-4 for v in obj.data.vertices)
        assert all(math.isfinite(c) for d in obj.data.uv_layers.active.data for c in d.uv)
        assert all(p.area>1e-10 for p in obj.data.polygons)
    report={'pass':True,'glb_sha256':source['glb_sha256'],'triangles':triangles,'material_count':2,'alpha_mode':'MASK','double_sided_needles':True,'ground_zero':True,'roundtrip':roundtrip,'runtime_publish_allowed':False}
    (RUN/'qa/structural.json').write_text(json.dumps(report,indent=2)+'\n');print('PINE_VERIFY',json.dumps(report))
if __name__=='__main__':main()
