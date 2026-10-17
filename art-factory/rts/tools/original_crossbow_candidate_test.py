"""Focused candidate contract checks; run with the candidate directory argument."""
import json,pathlib,struct,sys,unittest
ROOT=pathlib.Path(sys.argv.pop(1))
REPORT=json.loads((ROOT/'grip-candidate-report.json').read_text())
def gltf(lod):
    data=(ROOT/f'original-crossbow-grip-lod{lod}.glb').read_bytes()
    size=struct.unpack_from('<I',data,12)[0]
    return json.loads(data[20:20+size])
class CandidateContract(unittest.TestCase):
    def test_actual_forearm_terminal_vertices_stay_inside_gloves(self):
        measured=json.loads((ROOT.parent/'qa'/'wrist-verification.json').read_text())
        for lod,clips in measured['lods'].items():
            self.assertEqual(len(clips),5)
            for name,clip in clips.items():
                for side,r in clip.items():
                    self.assertGreaterEqual(r['rim_vertices'],8)
                    self.assertLess(r['max_outside_m'],.001,(lod,name,side,r))
                    self.assertLess(r['max_surface_distance_m'],.008,(lod,name,side,r))
    def test_no_synthetic_dark_sleeve_covers_original_cut_surfaces(self):
        for lod in (0,1):
            doc=gltf(lod)
            self.assertFalse(any('OriginalCrossbowSleeve' in n.get('name','') for n in doc['nodes']))
            self.assertTrue(any('TeamCloth' in m.get('name','') for m in doc['materials']))
    def test_every_original_bone_matches_source_without_relaxed_gate(self):
        measured=json.loads((ROOT.parent/'qa'/'actual-export-verification.json').read_text())
        for lod,result in measured['lods'].items():
            for name,clip in result['clips'].items():
                self.assertLess(clip['all_original_bones_skin_matrix_max_abs_error'],.0001,(lod,name,clip))
    def test_actual_exported_glove_vertices_keep_contact_at_half_frames(self):
        measured=json.loads((ROOT.parent/'qa'/'actual-export-verification.json').read_text())
        for lod,result in measured['lods'].items():
            self.assertEqual(set(result['clips']),{'Idle','Walk','Attack','Hurt','Death'})
            for name,clip in result['clips'].items():
                self.assertGreater(clip['samples'],50)
                for side,error in clip['actual_glove_weapon_distance_drift_max_m'].items():
                    self.assertLess(error,.005,(lod,name,side,error))
    def test_exported_weapon_vertices_match_reopened_source(self):
        measured=json.loads((ROOT.parent/'qa'/'actual-export-verification.json').read_text())
        for lod,result in measured['lods'].items():
            self.assertLess(result['rest_weapon_vertex_max_m'],.00001,lod)
            for name,clip in result['clips'].items():
                self.assertLess(clip['source_vs_glb_weapon_vertex_max_m'],.0001,(lod,name,clip))
    def test_reopened_blend_baked_attachment(self):
        measured=json.loads((ROOT.parent/'qa'/'measured-verification.json').read_text())
        self.assertEqual(set(measured['clips']),{'Idle','Walk','Attack','Hurt','Death'})
        for name,clip in measured['clips'].items():
            self.assertLess(clip['baked_left_channel_attachment_max_m'],0.005,(name,clip))
    def test_all_five_actions_keep_two_hand_contact(self):
        self.assertEqual(set(REPORT['clip_samples']),{'Idle','Walk','Attack','Hurt','Death'})
        for name,samples in REPORT['clip_samples'].items():
            self.assertGreater(len(samples),20)
            for sample in samples:
                self.assertTrue(sample['left_ik'],(name,sample['frame']))
                self.assertLess(sample['right_channel_contact_error_m'],0.005,(name,sample))
                self.assertLess(sample['left_channel_contact_error_m'],0.005,(name,sample))
    def test_both_lods_meet_complete_mesh_budget_and_clip_contract(self):
        for lod in (0,1):
            doc=gltf(lod)
            count=sum(doc['accessors'][p['indices']]['count']//3 for m in doc['meshes'] for p in m['primitives'])
            self.assertTrue(count<20000 if lod==0 else 7000<=count<=10000,(lod,count))
            self.assertEqual({a['name'] for a in doc['animations']},{'Idle','Walk','Attack','Hurt','Death'})
if __name__=='__main__':unittest.main()
