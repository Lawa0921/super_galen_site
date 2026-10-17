import json,math,struct,tempfile,unittest
from pathlib import Path
try:
    from original_guard_walk_refine_glb import transplant_walk
except ImportError:
    transplant_walk=None

def fixture(dense=False,bad_skin=False,nan=False):
    names=['Root','Thigh_L','Shin_L','Foot_L','Thigh_R','Shin_R','Foot_R']
    ordered=list(reversed(names)) if dense else names
    index={n:i for i,n in enumerate(ordered)}
    nodes=[{'name':n} for n in ordered]
    nodes[index['Root']]['children']=[index[n] for n in names[1:]]
    chunks=[];views=[];accessors=[];offset=0
    def add(values,width,kind):
        nonlocal offset
        b=struct.pack('<'+'f'*len(values),*values)
        vi=len(views);views.append({'buffer':0,'byteOffset':offset,'byteLength':len(b)});chunks.append(b);offset+=len(b)
        ai=len(accessors);accessors.append({'bufferView':vi,'componentType':5126,'count':len(values)//width,'type':kind});return ai
    times=[0,.5,1] if dense else [0,1];t=add(times,1,'SCALAR')
    vals=[0,0,0,1]*len(times)
    if nan:vals[0]=math.nan
    q=add(vals,4,'VEC4');attack=add([0,0,.6,.8]*len(times),4,'VEC4')
    identity=[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1]*6
    if bad_skin:identity[12]=.1
    ibm=add(identity,16,'MAT4')
    walk={'name':'Walk','samplers':[{'input':t,'output':q,'interpolation':'LINEAR'}],
        'channels':[{'sampler':0,'target':{'node':index[n],'path':'rotation'}} for n in names[1:]]}
    other={'name':'Attack','samplers':[{'input':t,'output':attack,'interpolation':'LINEAR'}],
        'channels':[{'sampler':0,'target':{'node':index['Foot_R'],'path':'rotation'}}]}
    doc={'asset':{'version':'2.0'},'scene':0,'scenes':[{'nodes':[index['Root']]}],'nodes':nodes,
        'skins':[{'joints':[index[n] for n in names[1:]],'skeleton':index['Root'],'inverseBindMatrices':ibm}],
        'animations':[walk,other]+([dict(other,name='DonorOnly')] if dense else []),
        'accessors':accessors,'bufferViews':views,'buffers':[{'byteLength':offset}]}
    j=json.dumps(doc,separators=(',',':')).encode();j+=b' '*((-len(j))%4);b=b''.join(chunks)
    return struct.pack('<4sII',b'glTF',2,28+len(j)+len(b))+struct.pack('<II',len(j),0x4e4f534a)+j+struct.pack('<II',len(b),0x004e4942)+b
def doc(blob):
    n=struct.unpack_from('<I',blob,12)[0];return json.loads(blob[20:20+n]),blob[28+n:]
class TransplantTests(unittest.TestCase):
    def test_only_walk_is_copied_with_reordered_target_nodes_and_original_binary_prefix(self):
        self.assertTrue(callable(transplant_walk),'Walk transplant not implemented')
        with tempfile.TemporaryDirectory() as t:
            base=Path(t)/'base.glb';donor=Path(t)/'donor.glb';out=Path(t)/'out.glb'
            base.write_bytes(fixture());donor.write_bytes(fixture(True))
            report=transplant_walk(base,donor,out,minimum_leg_keys=3)
            before,bb=doc(base.read_bytes());after,ab=doc(out.read_bytes())
            self.assertEqual(report['status'],'pass')
            self.assertEqual([a['name'] for a in after['animations']],['Walk','Attack'])
            self.assertEqual(before['animations'][1],after['animations'][1])
            self.assertTrue(ab.startswith(bb))
            walk=after['animations'][0];sampler=walk['samplers'][0]
            self.assertEqual(after['accessors'][sampler['input']]['count'],3)
            self.assertEqual({after['nodes'][c['target']['node']]['name'] for c in walk['channels']},set(['Thigh_L','Shin_L','Foot_L','Thigh_R','Shin_R','Foot_R']))
    def test_incompatible_inverse_bind_skin_is_rejected_before_output(self):
        self.assertTrue(callable(transplant_walk),'Walk transplant not implemented')
        with tempfile.TemporaryDirectory() as t:
            base=Path(t)/'base.glb';donor=Path(t)/'donor.glb';out=Path(t)/'out.glb'
            base.write_bytes(fixture());donor.write_bytes(fixture(True,bad_skin=True))
            with self.assertRaisesRegex(ValueError,'skin'):transplant_walk(base,donor,out,minimum_leg_keys=3)
            self.assertFalse(out.exists())
    def test_nan_donor_track_is_rejected(self):
        self.assertTrue(callable(transplant_walk),'Walk transplant not implemented')
        with tempfile.TemporaryDirectory() as t:
            base=Path(t)/'base.glb';donor=Path(t)/'donor.glb';out=Path(t)/'out.glb'
            base.write_bytes(fixture());donor.write_bytes(fixture(True,nan=True))
            with self.assertRaisesRegex(ValueError,'finite'):transplant_walk(base,donor,out,minimum_leg_keys=3)
            self.assertFalse(out.exists())
if __name__=='__main__':unittest.main()
