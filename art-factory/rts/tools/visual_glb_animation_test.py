"""Material-only reexports must preserve every bone channel and skin binding."""
import argparse,json,struct
from pathlib import Path
import numpy as np

def read(path):
 raw=path.read_bytes();size=struct.unpack_from('<I',raw,12)[0];return json.loads(raw[20:20+size]),raw[28+size:]

def array(doc,binary,index):
 a=doc['accessors'][index];v=doc['bufferViews'][a['bufferView']];dtype={5126:'<f4',5125:'<u4',5123:'<u2',5121:'u1'}[a['componentType']];count={'SCALAR':1,'VEC2':2,'VEC3':3,'VEC4':4,'MAT4':16}[a['type']];size=np.dtype(dtype).itemsize
 return np.ndarray((a['count'],count),dtype=dtype,buffer=binary,offset=v.get('byteOffset',0)+a.get('byteOffset',0),strides=(v.get('byteStride',size*count),size)).copy()

def channels(doc,binary):
 result={}
 for animation in doc['animations']:
  for channel in animation['channels']:
   sampler=animation['samplers'][channel['sampler']];key=(animation['name'],doc['nodes'][channel['target']['node']]['name'],channel['target']['path'])
   result[key]=(sampler.get('interpolation','LINEAR'),array(doc,binary,sampler['input']),array(doc,binary,sampler['output']))
 return result

p=argparse.ArgumentParser();p.add_argument('before',type=Path);p.add_argument('after',type=Path);a=p.parse_args();old,ob=read(a.before);new,nb=read(a.after)
x,y=channels(old,ob),channels(new,nb);assert x.keys()==y.keys();maximum=0
for key in x:
 assert x[key][0]==y[key][0]
 for i in (1,2):
  assert x[key][i].shape==y[key][i].shape;error=float(np.abs(x[key][i]-y[key][i]).max());maximum=max(maximum,error);assert error<1e-6,(key,error)
oldskins={tuple(old['nodes'][j]['name'] for j in s['joints']):array(old,ob,s['inverseBindMatrices']) for s in old['skins']}
newskins={tuple(new['nodes'][j]['name'] for j in s['joints']):array(new,nb,s['inverseBindMatrices']) for s in new['skins']}
assert oldskins.keys()==newskins.keys()
for key in oldskins:assert np.array_equal(oldskins[key],newskins[key])
print(json.dumps({'bone_channels':len(x),'max_channel_error':maximum,'skin_bindings_unchanged':len(oldskins),'passed':True}))
