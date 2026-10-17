import copy
import struct
import unittest
import numpy as np
from assembly_bake import bake, read_accessor


def fixture():
    binary=bytearray();views=[];accessors=[]
    def acc(rows,kind,ctype=5126):
        arr=np.asarray(rows,dtype={5126:'<f4',5123:'<u2'}[ctype]);offset=len(binary)
        binary.extend(arr.tobytes());views.append({'buffer':0,'byteOffset':offset,'byteLength':arr.nbytes})
        while len(binary)%4:binary.append(0)
        accessors.append({'bufferView':len(views)-1,'componentType':ctype,'count':len(rows),'type':kind})
        return len(accessors)-1
    meshes=[]
    for x in (0,3):
        attrs={'POSITION':acc([[x,0,0],[x+1,0,0],[x,1,0]],'VEC3'),
               'NORMAL':acc([[0,0,1]]*3,'VEC3'),'TEXCOORD_0':acc([[0,0],[1,0],[0,1]],'VEC2'),
               'JOINTS_0':acc([[0,0,0,0]]*3,'VEC4',5123),'WEIGHTS_0':acc([[1,0,0,0]]*3,'VEC4')}
        meshes.append({'primitives':[{'attributes':attrs,'indices':acc([0,1,2],'SCALAR',5123),'material':0}]})
    time=acc([0,1],'SCALAR');pos=acc([[0,0,0],[0,1,0]],'VEC3')
    bounds=lambda x:{'rtsConservativeBounds':{'sphere_center_y_up_m':[x,0,0],'sphere_radius_m':2}}
    doc={'asset':{'version':'2.0'},'buffers':[{'byteLength':len(binary)}],'bufferViews':views,'accessors':accessors,
         'meshes':meshes,'nodes':[{'name':'rig','children':[1,2,3]},{'name':'joint'},{'name':'arm','mesh':0,'skin':0,'extras':bounds(0)},
             {'name':'body','mesh':1,'skin':0,'extras':bounds(3)}],
         'skins':[{'joints':[1]}],'materials':[{'name':'original','pbrMetallicRoughness':{'roughnessFactor':.8}}],
         'animations':[{'name':'Walk','samplers':[{'input':time,'output':pos}], 'channels':[{'sampler':0,'target':{'node':1,'path':'translation'}}]}],
         'scenes':[{'nodes':[0]}],'scene':0}
    return doc,bytes(binary)


class BakeTests(unittest.TestCase):
    def test_merges_same_material_preserving_triangles_skin_and_animation_values(self):
        doc,binary=fixture();out,data,report=bake(doc,binary)
        self.assertEqual(len(out['meshes']),1);self.assertEqual(len(out['meshes'][0]['primitives']),1)
        p=out['meshes'][0]['primitives'][0]
        self.assertEqual(read_accessor(out,data,p['indices']).reshape(-1).tolist(),list(range(6)))
        self.assertEqual(read_accessor(out,data,p['attributes']['POSITION']).tolist(),[[0,0,0],[1,0,0],[0,1,0],[3,0,0],[4,0,0],[3,1,0]])
        self.assertEqual(out['skins'],doc['skins']);self.assertEqual(out['materials'],doc['materials'])
        for key in ('input','output'):
            np.testing.assert_array_equal(read_accessor(doc,binary,doc['animations'][0]['samplers'][0][key]),read_accessor(out,data,out['animations'][0]['samplers'][0][key]))
        self.assertEqual(report['primitives_before'],2);self.assertEqual(report['primitives_after'],1)
        self.assertNotIn('mesh',out['nodes'][3]);self.assertEqual(doc['nodes'][3]['mesh'],1)
        sphere=out['nodes'][2]['extras']['rtsConservativeBounds'];self.assertGreaterEqual(sphere['sphere_radius_m'],3.5)

    def test_different_material_is_not_collapsed(self):
        doc,binary=fixture();doc['materials'].append({'name':'team'});doc['meshes'][1]['primitives'][0]['material']=1
        out,_,_=bake(doc,binary);self.assertEqual([p['material'] for p in out['meshes'][0]['primitives']],[0,1])

    def test_keeps_equipment_nodes_and_bound_provenance(self):
        doc,binary=fixture();doc['nodes'].append(dict(name='sword',mesh=0,skin=0))
        doc['nodes'][0]['children'].append(4)
        for i in (2,3):doc['nodes'][i]['extras']['rtsConservativeBounds'].update(sample_hz=30,sampling_margin_m=.15)
        out,data,report=bake(doc,binary,preserve_names={'sword'},anchor_name='body')
        self.assertEqual(out['nodes'][3]['name'],'body')
        self.assertIn('mesh',out['nodes'][4]);self.assertEqual(out['nodes'][4]['skin'],0)
        p=out['meshes'][out['nodes'][4]['mesh']]['primitives'][0]
        np.testing.assert_array_equal(read_accessor(out,data,p['attributes']['POSITION']),read_accessor(doc,binary,doc['meshes'][0]['primitives'][0]['attributes']['POSITION']))
        bounds=out['nodes'][3]['extras']['rtsConservativeBounds']
        self.assertEqual(bounds['sample_hz'],30);self.assertEqual(bounds['sampling_margin_m'],.15)
        self.assertEqual(len(bounds['union_sources']),2)
        self.assertEqual(report['primitives_after'],2)

    def test_rejects_animated_mesh_transform_different_parent_transform_or_morph(self):
        for kind in ('animated','transform','parent','morph'):
            doc,binary=fixture()
            if kind=='animated':doc['animations'][0]['channels'][0]['target']['node']=2
            if kind=='transform':doc['nodes'][3]['translation']=[1,0,0]
            if kind=='parent':doc['nodes'][0]['children'].remove(3);doc['nodes'][1]['children']=[3]
            if kind=='morph':doc['meshes'][0]['primitives'][0]['targets']=[{}]
            with self.assertRaises(ValueError,msg=kind):bake(doc,binary)

    def test_rejects_invalid_index_without_mutating_source(self):
        doc,binary=fixture();idx=doc['meshes'][0]['primitives'][0]['indices'];view=doc['bufferViews'][doc['accessors'][idx]['bufferView']]
        data=bytearray(binary);struct.pack_into('<H',data,view['byteOffset'],99);snapshot=copy.deepcopy(doc)
        with self.assertRaises(ValueError):bake(doc,bytes(data))
        self.assertEqual(doc,snapshot)


if __name__=='__main__':unittest.main()
