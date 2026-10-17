import copy
import struct
import unittest
from building_stage_partition import partition_static_glb

def fixture():
    indices=[0,1,2, 2,3,0, 0,1,2, 1,3,2]
    data=struct.pack('<12H',*indices)+struct.pack('<12f',*range(12))+struct.pack('<12f',*([-0.125,0.25,0.875]*4))+struct.pack('<8f',*range(8))
    doc={'asset':{'version':'2.0'},'buffers':[{'byteLength':len(data)}],
         'bufferViews':[{'buffer':0,'byteOffset':0,'byteLength':24},{'buffer':0,'byteOffset':24,'byteLength':48},{'buffer':0,'byteOffset':72,'byteLength':48},{'buffer':0,'byteOffset':120,'byteLength':32}],
         'accessors':[{'bufferView':0,'componentType':5123,'count':12,'type':'SCALAR'},{'bufferView':1,'componentType':5126,'count':4,'type':'VEC3'},{'bufferView':2,'componentType':5126,'count':4,'type':'VEC3'},{'bufferView':3,'componentType':5126,'count':4,'type':'VEC2'}],
         'meshes':[{'name':'original','primitives':[{'attributes':{'POSITION':1,'NORMAL':2,'TEXCOORD_0':3},'indices':0,'material':0}]}],
         'nodes':[{'name':'original','mesh':0}], 'scenes':[{'nodes':[0],'extras':{'retained':'yes'}}],'scene':0,
         'materials':[{'name':'stone','doubleSided':True}], 'images':[{'uri':'../materials/stone.png'}]}
    rows=[{'mesh':0,'primitive':0,'triangle':i,'indices':indices[i*3:i*3+3],'material':0,'stage':i,'source_object':f'part{i}','part_id':f'p{i}','source_part_id':f's{i}'} for i in range(4)]
    return doc,data,rows

class PartitionTest(unittest.TestCase):
    def test_all_original_triangle_occurrences_and_attribute_bytes_survive(self):
        doc,data,rows=fixture(); original=copy.deepcopy(doc)
        out,binary=partition_static_glb(doc,data,rows)
        self.assertEqual(len(out['nodes']),4)
        self.assertEqual(binary[:len(data)],data)
        self.assertEqual(doc,original)
        self.assertEqual(out['accessors'][:4],doc['accessors'])
        self.assertEqual(out['materials'],doc['materials']);self.assertEqual(out['images'],doc['images'])
        self.assertEqual(out['scenes'][0]['extras']['retained'],'yes')
        actual=[]
        for node in out['nodes']:
            p=out['meshes'][node['mesh']]['primitives'][0]
            self.assertEqual(p['attributes'],doc['meshes'][0]['primitives'][0]['attributes'])
            a=out['accessors'][p['indices']];v=out['bufferViews'][a['bufferView']]
            actual.extend(struct.unpack_from('<'+str(a['count'])+'H',binary,v['byteOffset']))
            self.assertEqual(node['extras']['rtsConstructionStage'],len(actual)//3-1)
        self.assertEqual(actual,[x for row in rows for x in row['indices']])
    def test_duplicate_and_missing_triangle_mapping_fail(self):
        for mode in ('duplicate','missing'):
            d,b,r=fixture();r=r+[r[0]] if mode=='duplicate' else r[:-1]
            with self.assertRaises(ValueError):partition_static_glb(d,b,r)
    def test_winding_mismatch_and_unknown_stage_fail(self):
        for mode in ('winding','stage'):
            d,b,r=fixture()
            if mode=='winding':r[0]['indices'].reverse()
            else:r[0]['stage']=4
            with self.assertRaises(ValueError):partition_static_glb(d,b,r)
    def test_unmapped_primitive_and_animated_input_fail(self):
        for mode in ('primitive','animation'):
            d,b,r=fixture()
            if mode=='primitive':d['meshes'][0]['primitives'].append(copy.deepcopy(d['meshes'][0]['primitives'][0]))
            else:d['animations']=[{}]
            with self.assertRaises(ValueError):partition_static_glb(d,b,r)
    def test_unknown_identity_and_material_mismatch_fail(self):
        for mode in ('identity','material'):
            d,b,r=fixture()
            if mode=='identity':r[0]['source_part_id']=''
            else:r[0]['material']=1
            with self.assertRaises(ValueError):partition_static_glb(d,b,r)

if __name__=='__main__':unittest.main()
