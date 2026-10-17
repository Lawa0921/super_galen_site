"""Freeze original-source failed glove clay evidence; never approve/publish."""
import hashlib,json,gzip,struct,shutil
from pathlib import Path
ROOT=Path(__file__).resolve().parents[3]
RUN=ROOT/'art-factory/rts/runs/guard-hand-glove/2026-10-09-v1'
def read(p):return json.loads(p.read_text(encoding='utf8'))
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def write(p,v):p.write_text(json.dumps(v,indent=2,ensure_ascii=False)+'\n',encoding='utf8')
def main():
    frozen=read(RUN/'qa/frozen-inputs.json');changes=[e['path'] for e in frozen if sha(ROOT/e['path'])!=e['sha256']]
    if changes:raise ValueError('Frozen old assets/tools changed: '+str(changes))
    g=read(RUN/'qa/geometry.json');q=read(RUN/'qa/reimport-interface.json');v=read(RUN/'qa/gltf-validator.json')
    blend=RUN/'candidate/guard-right-hand-soft-glove-clay.blend';glb=RUN/'candidate/guard-right-hand-soft-glove-clay-lod0.glb'
    if g['candidate_blend_sha256']!=sha(blend) or g['candidate_glb_sha256']!=sha(glb) or v['candidate_sha256']!=sha(glb):raise ValueError('Candidate binding mismatch')
    old=read(RUN/'qa/rejected-first-clay/renders.json')['renders'];new=read(RUN/'qa/renders.json')['renders'];same={}
    for name,e in new.items():
        if sha(ROOT/e['path'])!=e['sha256']:raise ValueError('Render binding mismatch')
        same[name]={key:old[name][key]==e[key] for key in ('camera_location','camera_rotation','ortho_scale','exposure','handle_visible')}
        if not all(same[name].values()):raise ValueError('First/second camera drift')
    write(RUN/'qa/camera-comparison.json',same)
    data=glb.read_bytes();length,kind=struct.unpack_from('<II',data,12);jsondata=json.loads(data[20:20+length])
    pack={'bytes':len(data),'gzip_bytes':len(gzip.compress(data,mtime=0)),'materials':len(jsondata.get('materials',[])),
        'meshes':len(jsondata.get('meshes',[])),'primitives':sum(len(m['primitives']) for m in jsondata.get('meshes',[])),
        'candidate_sha256':sha(glb),'runtime_publish_allowed':False}
    backup=RUN/'candidate/guard-right-hand-soft-glove-clay.blend1'
    if backup.exists():
        first=RUN/'qa/rejected-first-clay/candidate/guard-right-hand-soft-glove-clay.blend'
        if sha(backup)!=sha(first):raise ValueError('Unexpected .blend1 backup')
        shutil.move(str(backup),str(RUN/'qa/rejected-first-clay/candidate/automatic-first-backup.blend'))
    mesh=read(RUN/'raw/actual-candidate-mesh.json');facepairs=[]
    for kind,pairs in g['self_contacts'].items():
        for a,b in pairs:
            facepairs.append({'class':kind,'actual_triangle_ids':[a,b],
                'vertex_ids':[mesh['triangles'][a],mesh['triangles'][b]],
                'triangle_positions_m':[[mesh['vertices_m'][i] for i in mesh['triangles'][a]],[mesh['vertices_m'][i] for i in mesh['triangles'][b]]]})
    write(RUN/'qa/final-face-pair-witnesses.json',{'candidate_sha256':sha(glb),'pairs':facepairs})
    contract=read(RUN/'contract.json');contract.update(status='rejected_soft_glove_clay',runtime_publish_allowed=False,commercial_approved=False)
    contract['actual_method']='Original authored anatomy landmarks/strokes -> fine voxel fused full sculpt -> native QuadriFlow body base -> explicit updated cutter normals/selection with MANIFOLD negative imprints and untouched-extrema guard -> new angular actual-sleeve collar. Body base is automated retopology, not manually laid out edge-by-edge.'
    contract['final_evidence']='qa/delivery.json';write(RUN/'contract.json',contract)
    snapshot=RUN/'qa/frozen-second-clay';snapshot.mkdir(exist_ok=False)
    copies={'build.py':ROOT/'art-factory/rts/tools/guard_hand_glove_build.py','geometry.py':ROOT/'art-factory/rts/tools/guard_hand_glove_geometry.py',
        'original-sculpt-controls.json':RUN/'raw/original-sculpt-controls.json','actual-wrist-interface.json':RUN/'raw/actual-wrist-interface.json',
        'actual-candidate-mesh.json':RUN/'raw/actual-candidate-mesh.json','contract.json':RUN/'contract.json','geometry.json':RUN/'qa/geometry.json',
        'reimport-interface.json':RUN/'qa/reimport-interface.json','final-face-pair-witnesses.json':RUN/'qa/final-face-pair-witnesses.json',
        'guard-right-hand-soft-glove-clay.blend':blend,'guard-right-hand-soft-glove-clay-lod0.glb':glb}
    for name,p in copies.items():shutil.copy2(p,snapshot/name)
    for name,e in new.items():shutil.copy2(ROOT/e['path'],snapshot/(name+'.png'))
    write(snapshot/'frozen-manifest.json',[{'path':p.name,'sha256':sha(p),'bytes':p.stat().st_size} for p in sorted(snapshot.iterdir()) if p.is_file()])
    report={'status':'rejected_soft_glove_clay','runtime_publish_allowed':False,'commercial_approved':False,'shape_independent_pass':False,
        'author_visual_verdict':'REVISE: wrist/collar backfaces black band, rough swollen MCP/web region, flattened/cut-looking tips, overly regular cylindrical inner-palm grooves. Shorter thenar-origin thumb and palm volume improved but do not satisfy full clay anatomy.',
        'two_clay_attempts_complete':True,'third_shape_attempt_performed':False,
        'relaxed_constraints_authority':contract['relaxed_constraints'],'source_chain':contract['source'],
        'input_frozen_file_count':len(frozen),'frozen_changed_paths':changes,'canonical_Wc_m':g['canonical_Wc_m'],'canonical_Cc_m':g['canonical_Cc_m'],'pivot_m':g['pivot_m'],'scale':g['scale'],
        'candidate_blend_sha256':sha(blend),'candidate_glb_sha256':sha(glb),'topology':g['topology'],'boundary_loop_lengths':g['boundary_loop_lengths'],
        'self_counts':{k:len(pairs) for k,pairs in g['self_contacts'].items()},'handle_clearance':g['whole_triangle_handle_clearance'],'contact_diagnostics':g['contact_diagnostics'],
        'contact_diagnostic_limit':'Area-weighted samples inside 2mm clearance are near-contact only, not physical pressure or a shape pass; .3-.8mm/25% remain diagnostic, not approval gates.',
        'actual_interface':q,'validator_issues':v['issues'],'packaging':pack,
        'estimated_full_character_after_replace_triangles':g['estimated_full_character_after_replace'],'whole_character_target_8k_to_20k_pass_claim':False,
        'tests':{'geometry_helper_TDD':'RED ->6/6 GREEN; real-slice/copanar boundary, individual 3-bone anatomy, nonuniform angular seam, untouched Boolean-extrema regression',
            'actual_asset_regression':'2/2 RED deliberately preserved: exterior/self and reimport/true-cuff gates fail','native_optimized':'same result recorded separately'},
        'precise_engineering_failures':[
            'Earlier negative-imprint route dropped full wrist/palm: 299.64cm3 full sculpt became 11.14cm3 disjoint finger fragments; retopology cancellations are preserved. New ordering plus explicit cutter updates/MANIFOLD/selection and untouched-extrema guards preserve full 276.96cm3 skin.',
            'Current new-retopology base is closed and edge-valid, but post-imprint skin has one nonmanifold edge. Final 2 strict and10 incident pairs remain.',
            'Source ordered_boundary_loops helper returns an undirected loop. Current collar caller assumed directed face-boundary order; final 43 winding edges and black strip expose this contract error. A future fix must derive face-directed boundary winding, not offset vertices.',
            'Actual export/reimport has3773 triangles versus source3774; directed counter fails, one missing source triangle is not treated as harmless. QA-welded imported boundary is non-simple;30 edges versus source28.',
            'True source sleeve ring coordinates map within2.9085e-8m, but overall static glove/cuff has63 strict intersections. Coordinate agreement alone does not establish a legal hand/cuff interface.'
        ],
        'pending':['Natural complete fullhand clay and independent shape pass','Correct directed collar and manual regional palm/web retopology','Zero self/valid exterior/export correspondence/zero real-cuff intersections','Fixed Hand_R plus Forearm_R/Hand_R wrist binding','Full v35 RTS/portrait/five-animation fitting after clay pass only','Armor/UV/PBR/LOD/runtime and full-character optimization'],
        'rig_contract':contract['rig_contract'],'snapshots':['qa/rejected-first-clay','qa/frozen-retopology-failure','qa/frozen-second-clay']}
    write(RUN/'qa/delivery.json',report)
    text='''本包仍拒絕，完整自然軟手套 clay 未取得 pass；不宣稱商用、不發布。新 run／guard_hand_glove* 為唯一寫入，停止沿用舊 cage，所有先前凍結包與主樹未改。兩輪完整 clay 後停止局部補／推點，失敗來源與候選保留。

新契約依 root 採納 consultant 製程救援，撤除616face、4884tri、固定掌內grid、舊vertex/face IDs、exact40-edge腕圈及PAD25%硬gate。硬保留Wc/Cc、真22mm半徑195mm柄、角色scale/pivot、固定Hand_R握姿、原創來源与真v35袖口／腕甲接口。新原創骨性landmarks與volume strokes塑完整掌弓／thenar／hypothenar／四指三節與短對掌拇指；細voxel融合、Blender QuadriFlow body起稿，再製作真腕接口collar。Body拓樸不是逐邊手工retopo；可編輯原始strokes、full sculpt、final skin保存在blend，GLB只含final skin，施工guides未匯出。

實看六同相機／曝光的第二輪圖：拇指根與thenar體積有改善，但腕帶反面黑區、掌指根粗凹、偏平／切面的指端及規則圓柱掌槽仍不合格。主六圖在qa/renders/glove-second-review-sheet.png；第一輪全部在qa/rejected-first-clay，第二輪fixed snapshot在qa/frozen-second-clay。

3774 source tri，單連通、source腕口28 edges、scale1／pivotWc。有效外表面FAIL：1非流形邊、43 winding edges；self為strict2／nonincident0／incident10，精確triangle IDs／座標在qa/final-face-pair-witnesses.json。真柄無穿入，最小間隙0.836943mm；各指／thenar／hypo有277–873mm²內2mm接近區，掌部1321mm²。這是near-contact抽樣，不是接觸壓力證明，不可據此宣稱握持完成。

真接口來自v35 GuardArms_LOD0 triangle-plane截面（Wc往前臂25mm，Forearm_R實骨骼軸），保存source triangle/edge IDs與插值。ring直接對應誤差2.9085e-8m，但static glove對真GuardWristCuff_R_LOD0有63 strict crossings，整體接口FAIL。整合計畫需沿該真截面移除既有closed cap，再正確手工接合／分配Forearm_R/Hand_R過渡；本包未改袖或cuff，未綁權重，未裝回角色。collar工程根因是使用undirected boundary loop卻當成face-directed edge order，不應再靠點位微推掩反面。

完整sculpt先為單一edge-manifold、299.64cm³；舊negative imprint路徑錯失掌腕後只剩11.14cm³指碎片，造成QF取消。三stage診斷、broken輸入blend／JSON與兩失敗log在qa/frozen-retopology-failure。新製程先對完整sculpt重拓樸，更新cut normals／明確selection／MANIFOLD solver，並用切具外極值不得消失回歸守護，保住276.96cm³掌體；cut後仍有非流形細部，尚未修成合法手套。這些製程修正不等於造型pass。

helper TDD6/6 GREEN（實際袖plane slice／coplanar拒絕／三節獨立比例／非等距角接合／Boolean切具外幾何保存）；actual artifact2/2 RED保留。Blender實際GLB reimport source3774→import3773，directed counter FAIL，QA weld後boundary非simple、30edges，未將少一面當作無害。bounds/material保持但沒有全幾何通過。glTF validator0errors／0warnings／0infos只證明格式，不能覆蓋上述內容失敗。

估計整角色替換後24518tri，仍超過general LOD0 8k–20k目標，不宣稱整角預算／性能pass。固定Hand_R、不需要獨立finger bones／open-curl；完整clay獨立通過前不做整角RTS／肖像／五動畫裝回；甲片、UV/PBR、LOD與runtime全部pending。SHA／所有修改路徑、byte/gzip/drawcall與來源chain在qa/delivery.json和qa/final-freeze.json。
'''
    (RUN/'qa/task-report.md').write_text(text,encoding='utf8')
    print(json.dumps({'status':report['status'],'blend_sha256':sha(blend),'glb_sha256':sha(glb),'report_sha256':sha(RUN/'qa/task-report.md'),'frozen_previous_inputs_unchanged':not changes,'packaging':pack},indent=2))
if __name__=='__main__':main()
