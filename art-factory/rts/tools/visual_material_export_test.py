"""Normal-mapped source props carry their tangent basis into the runtime."""
import argparse,json,struct
from pathlib import Path
p=argparse.ArgumentParser();p.add_argument('file',type=Path);a=p.parse_args();raw=a.file.read_bytes();n=struct.unpack_from('<I',raw,12)[0];doc=json.loads(raw[20:20+n]);checked=0
for mesh in doc['meshes']:
 for primitive in mesh['primitives']:
  material=doc['materials'][primitive['material']]
  if 'normalTexture' not in material:continue
  checked+=1
  for attr in ('TEXCOORD_0','NORMAL','TANGENT'):assert attr in primitive['attributes'],(material['name'],attr)
  for slot in ('baseColorTexture','metallicRoughnessTexture'):assert slot in material['pbrMetallicRoughness'],(material['name'],slot)
assert checked>0
print(json.dumps({'file':str(a.file),'normal_mapped_primitives':checked,'passed':True}))
