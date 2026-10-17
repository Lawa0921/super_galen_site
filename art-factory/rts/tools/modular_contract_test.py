import copy
import hashlib
import tempfile
import unittest
from pathlib import Path
import modular_contract as kit

I=[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1]
class AssemblyContractTests(unittest.TestCase):
    def setUp(self):
        self.parts={'window':{'collection':'KIT_window','interface':'window:36x70','bounds':[[-.2,-.1,0],[.2,.1,.7]],'mount':I}}
        self.recipe={'version':1,'id':'castle','footprint':[6,6],'sockets':[{'id':'window-slot','interface':'window:36x70','host':'wall','matrix':[1,0,0,2,0,1,0,3,0,0,1,4,0,0,0,1]}], 'instances':[{'id':'wall','part':'wall','matrix':I},{'id':'window','part':'window','socket':'window-slot'}]}
        self.parts['wall']={'collection':'KIT_wall','interface':'structure','bounds':[[-3,-3,0],[3,3,4]],'mount':I}
        self.parts['wall']['sockets']={'window-slot':{'interface':'window:36x70','matrix':list(self.recipe['sockets'][0]['matrix']),'toleranceMeters':.00002}}
    def test_socket_placement_resolves_shared_part_without_mutating_inputs(self):
        prior=copy.deepcopy(self.recipe); result=kit.resolve_recipe(self.recipe,self.parts)
        self.assertEqual(result[1]['matrix'][3:12:4],[2,3,4]);self.assertEqual(self.recipe,prior)
        other=copy.deepcopy(self.recipe);other['id']='other';other['instances'][0]['matrix'][3]=7
        self.assertEqual(kit.resolve_recipe(other,self.parts)[1]['part'],'window')
        self.assertEqual(result[1]['matrix'][3],2)
    def test_missing_part_unknown_version_and_duplicate_instance_fail(self):
        for bad in ['part','version','duplicate']:
            r=copy.deepcopy(self.recipe)
            if bad=='part':r['instances'][1]['part']='missing'
            elif bad=='version':r['version']=2
            else:r['instances'][1]['id']='wall'
            with self.assertRaises(ValueError,msg=bad):kit.resolve_recipe(r,self.parts)
    def test_incompatible_socket_missing_host_and_scaled_transform_fail(self):
        for bad in ['interface','host','scale','nan','mirror']:
            r=copy.deepcopy(self.recipe)
            if bad=='interface':r['sockets'][0]['interface']='window:50x80'
            elif bad=='host':r['sockets'][0]['host']='absent'
            else:r['sockets'][0]['matrix'][0]={'scale':2,'nan':float('nan'),'mirror':-1}[bad]
            with self.assertRaises(ValueError,msg=bad):kit.resolve_recipe(r,self.parts)
    def test_sources_are_locked_and_paths_cannot_escape(self):
        with tempfile.TemporaryDirectory() as temp:
            root=Path(temp);(root/'source.blend').write_bytes(b'original')
            entry={'path':'source.blend','sha256':hashlib.sha256(b'original').hexdigest()}
            kit.verify_sources(root,[entry]);(root/'source.blend').write_bytes(b'changed')
            with self.assertRaises(ValueError):kit.verify_sources(root,[entry])
            with self.assertRaises(ValueError):kit.safe_path(root,'../outside')
            with self.assertRaises(ValueError):kit.safe_path(root,str(root/'source.blend'))
    def test_socket_disallows_ambiguous_matrix_and_invalid_footprint(self):
        r=copy.deepcopy(self.recipe);r['instances'][1]['matrix']=I
        with self.assertRaises(ValueError):kit.resolve_recipe(r,self.parts)
    def test_host_motion_moves_attached_window_and_cycles_are_rejected(self):
        r=copy.deepcopy(self.recipe);r['instances'][0]['matrix'][3]=5
        self.assertEqual(kit.resolve_recipe(r,self.parts)[1]['matrix'][3],7)
        r['sockets'][0]['host']='window'
        with self.assertRaises(ValueError):kit.resolve_recipe(r,self.parts)
    def test_local_uv_has_consistent_density_on_front_side_and_top(self):
        self.assertEqual(kit.projected_uv([2,4,6],[0,-1,0]),[1,3])
        self.assertEqual(kit.projected_uv([2,4,6],[1,0,0]),[2,3])
        self.assertEqual(kit.projected_uv([2,4,6],[0,0,1]),[1,2])
    def test_matching_interface_at_wrong_opening_position_is_rejected(self):
        r=copy.deepcopy(self.recipe);r['sockets'][0]['matrix'][3]=9
        with self.assertRaisesRegex(ValueError,'registered host opening'):kit.resolve_recipe(r,self.parts)
    def test_missing_registered_socket_and_wrong_facing_are_rejected(self):
        for bad in ['missing','facing']:
            parts=copy.deepcopy(self.parts);r=copy.deepcopy(self.recipe)
            if bad=='missing':parts['wall']['sockets']={}
            else:r['sockets'][0]['matrix']=[-1,0,0,2,0,-1,0,3,0,0,1,4,0,0,0,1]
            with self.assertRaises(ValueError):kit.resolve_recipe(r,parts)
        r=copy.deepcopy(self.recipe);r['footprint']=[0,6]
        with self.assertRaises(ValueError):kit.resolve_recipe(r,self.parts)

if __name__=='__main__':unittest.main()
