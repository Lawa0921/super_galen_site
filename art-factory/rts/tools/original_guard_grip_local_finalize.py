"""Package the finite local repair and its provisional QA failures."""
from pathlib import Path
import hashlib
import html
import json

ROOT=Path(__file__).resolve().parents[3]
RUN=ROOT/'art-factory/rts/runs/original-guard-grip-local/2026-10-05'
CONTRACT=ROOT/'art-factory/rts/contracts/original-guard-grip-local.json'


def load(path):return json.loads(path.read_text(encoding='utf8'))
def sha(path):return hashlib.sha256(path.read_bytes()).hexdigest()
def write(path,data):path.write_bytes((json.dumps(data,ensure_ascii=False,indent=2)+'\n').encode('utf8'))


def main():
    roi=load(RUN/'qa/roi-before.json')
    flip=load(RUN/'qa/flip-search.json')
    geo=load(RUN/'qa/strict-geometry.json')
    fit=load(RUN/'qa/fit-and-provenance.json')
    residual=load(RUN/'qa/export-residuals.json')
    visual=load(RUN/'qa/visual-delta.json')
    renders=load(RUN/'qa/renders.json')
    blend=RUN/'candidate/original-guard-grip-local-flip.blend'
    glb=RUN/'candidate/original-guard-grip-local-flip.glb'
    assert sha(blend)==flip['candidate_blend_sha256']==fit['candidate_blend_sha256']==geo['candidate_blend_sha256']
    assert sha(glb)==flip['candidate_glb_sha256']==geo['candidate_glb_sha256']==residual['candidate_glb_sha256']
    b=geo['blend'];g=geo['glb']
    checks={
        'four_robust_roi_self_crossings_eliminated':len(b['strict_nonincident_self_pairs'])==0,
        'candidate_blend_strict_self_zero':len(b['strict_nonincident_self_pairs'])==0,
        'candidate_export_glb_strict_self_zero':len(g['strict_nonincident_self_pairs'])==0,
        'topology_closed_consistent':b['topology']['boundary_edges']==b['topology']['nonmanifold_edges']==b['topology']['winding_edges']==b['topology']['zero_area_faces']==0 and all(v==0 for k,v in g['geometric_welded_topology'].items() if k!='connected_components'),
        'sword_surface_and_vertex_nonpenetration':not b['sword_triangle_crossings'] and not b['sword_vertices_inside_glove'] and not g['sword_triangle_crossings'] and not g['sword_vertices_inside_glove'],
        'closed_sword_shell_union_clear':not b['glove_vertices_inside_closed_shell_union'] and not b['glove_vertices_on_closed_shell_boundaries'],
        'channel_and_all_original_points_exact':fit['all_original_vertices_bitexact'] and fit['fixed_roi_vertices_bitexact'],
        'sword_and_glove_transform_unchanged':fit['sword_mesh_and_transform_unchanged'] and fit['glove_transform_unchanged'],
        'contact_no_worse':all(a>=z for a,z in zip(fit['contact_counts'],fit['baseline_contact_counts'])),
        'sampled_high_to_low_p95_no_worse':fit['high_to_low_p95_m']<=fit['baseline_high_to_low_p95_m'],
        'sampled_low_to_high_p95_no_worse':fit['low_to_high_p95_m']<=fit['baseline_low_to_high_p95_m'],
        'triangle_ceiling':b['triangles']<=12500,
        'four_close_views_no_new_threshold_dark_pixels':all(x['new_dark_pixels_baseline_gt_100_candidate_lt_40']==0 for x in visual['views'].values()),
    }
    report={'status':'qa_failed_pending_independent_exception_review','runtime_publish_allowed':False,
            'attempt_limit_reached':True,'candidate_blend_sha256':sha(blend),'candidate_glb_sha256':sha(glb),
            'checks':checks,'all_checks_pass':all(checks.values()),
            'strict_detector_limits':'Excludes pairs sharing exact-coordinate-welded vertices and coplanar overlaps; does not prove absence of every geometric defect.',
            'export_residual_intersections':residual['records'],
            'sampled_p95_change_high_to_low_mm':(fit['high_to_low_p95_m']-fit['baseline_high_to_low_p95_m'])*1000,
            'sampled_p95_change_low_to_high_mm':(fit['low_to_high_p95_m']-fit['baseline_low_to_high_p95_m'])*1000,
            'microface_area_threshold_m2':1e-10,
            'blend_microfaces_below_threshold':b['microfaces_below_threshold'],
            'glb_microfaces_below_threshold':g['microfaces_below_threshold'],
            'blend_float64_exact_zero_area_faces':b['topology']['zero_area_faces'],
            'blend_bmesh_float_zero_area_faces':b['topology']['bmesh_float_zero_area_faces'],
            'unresolved_source_shape':['rounded fingertips','thumb web','closed wrist opening'],
            'nonclaims':['No Hausdorff bound from sampled p95.','No volume claim for one sword component with four open edges.','Neither this glove nor sword source is approved for runtime.']}
    write(RUN/'qa/acceptance.json',report)
    contract={'asset_id':'original-guard-grip-local','category':'original_3d_character_equipment_lowpoly_candidate',
              'status':'qa_failed_pending_independent_exception_review','runtime_publish_allowed':False,
              'source_truth':'docs/superpowers/specs/2026-10-04-browser-rts-design.md',
              'source_fit_blend_sha256':roi['source_fit_blend_sha256'],
              'source_high_mesh_fingerprint':roi['source_high_mesh_fingerprint'],
              'source_low_blend_sha256':roi['source_low_blend_sha256'],
              'source_low_glb_sha256':residual['source_glb_sha256'],
              'candidate_blend':'art-factory/rts/runs/original-guard-grip-local/2026-10-05/candidate/original-guard-grip-local-flip.blend',
              'candidate_glb':'art-factory/rts/runs/original-guard-grip-local/2026-10-05/candidate/original-guard-grip-local-flip.glb',
              'candidate_blend_sha256':sha(blend),'candidate_glb_sha256':sha(glb),
              'method':'Seven oriented edge flips inside six frozen one-ring ROIs, preserving every original vertex, patch perimeter, UV/material on untouched triangles and all transforms. First projected-centre attempt rejected.',
              'roi_proof':'art-factory/rts/runs/original-guard-grip-local/2026-10-05/qa/roi-before.json',
              'local_diff':'art-factory/rts/runs/original-guard-grip-local/2026-10-05/qa/flip-search.json',
              'qa':'art-factory/rts/runs/original-guard-grip-local/2026-10-05/qa/acceptance.json',
              'review':'art-factory/rts/runs/original-guard-grip-local/2026-10-05/review.html',
              'triangles_before':roi['low_triangles'],'triangles_after':b['triangles'],
              'protected_input_vertices':roi['protected_input_vertex_count'],
              'channel_wall_vertex_subset':roi['channel_wall_vertex_count'],
              'contacts':fit['contact_counts'],
              'sampled_high_to_low_p95_m':fit['high_to_low_p95_m'],
              'sampled_low_to_high_p95_m':fit['low_to_high_p95_m'],
              'source_shape_constraints_unapproved':report['unresolved_source_shape'],
              'qa_failure_reasons':[k for k,v in checks.items() if not v]}
    write(CONTRACT,contract)
    titles={'full-sword-proportion':'全劍比例','four-finger-palm':'四指掌面','back-and-wrist':'手背與腕口','guard-and-finger-contact':'護手與指腹','axis-from-pommel':'柄首軸視','axis-from-guard':'護手軸視'}
    full=[]
    for name,title in titles.items():
        high=f'../../original-guard-grip-fit/2026-10-05/qa/renders/{name}.png'
        low=f'../../original-guard-grip-low/2026-10-05/qa/renders/{name}.png'
        current=f'qa/renders/{name}.png'
        full.append(f'<section><h2>{title}</h2><div class="triptych"><figure><a href="{high}"><img src="{high}" alt="原高模 {title}"></a><figcaption>來源高模</figcaption></figure><figure><a href="{low}"><img src="{low}" alt="原低模 {title}"></a><figcaption>原低模</figcaption></figure><figure><a href="{current}"><img src="{current}" alt="局部修補 {title}"></a><figcaption>局部修補</figcaption></figure></div></section>')
    close=[]
    for name in ('roi-main','roi-202','roi-1205','roi-3248'):
        close.append(f'<section><h2>{name}</h2><div class="pair"><figure><a href="qa/renders/baseline-{name}.png"><img src="qa/renders/baseline-{name}.png" alt="{name} 原候選"></a><figcaption>原候選</figcaption></figure><figure><a href="qa/renders/{name}.png"><img src="qa/renders/{name}.png" alt="{name} 局部修補"></a><figcaption>局部修補</figcaption></figure></div></section>')
    rows=[]
    for r in residual['records']:
        rows.append(f'<tr><td>{html.escape(str(r["glb_triangle_indices"]))}</td><td>{r["measured_intersection_interval_length_m"]*1000:.9f}</td><td>{r["nearest_roi_distance_m"]*1000:.3f}</td><td>{html.escape(r["nearest_roi"])}</td></tr>')
    body=f'''<!doctype html><html lang="zh-Hant"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>原創手套局部修補檢視</title><link rel="stylesheet" href="review.css"></head><body>
<header><p class="eyebrow">RTS · 2026-10-05 · factory only</p><h1>原創手套局部修補</h1><p class="status">QA failed · 待獨立裁定數值例外 · 禁止 runtime 發布</p></header>
<main><section class="summary"><p>七處局部換對角線消除了原 Blend 的 18 組嚴格自交；11,846 三角面及全部 5,897 個原始頂點位置維持不變。四區接觸仍為 6 / 6 / 6 / 5；劍面穿越與頂點包含均為 0，14 個封閉劍殼聯集的手套點包含與邊界均為 0。其餘一個開口劍件不作體積宣稱。</p><p>仍有兩個原 GLB 即存在的匯出精度微量交會，且 high→low 取樣 p95 增加 0.001499 mm。兩項未達逐字驗收；p95 不是 Hausdorff 上界，也不能單憑此微幅變化推論可見缺陷。原高模指端、虎口及腕口造型仍待核准。</p><p><a href="qa/acceptance.json">完整檢核</a> · <a href="qa/roi-before.json">凍結 ROI</a> · <a href="qa/flip-search.json">七次換邊紀錄</a> · <a href="candidate/original-guard-grip-local-flip.blend" download>可編輯 Blend</a> · <a href="candidate/original-guard-grip-local-flip.glb" download>GLB</a></p></section>
<section><h2>GLB 殘留交會</h2><p>原件與新件的下列兩對 GLB 三角形座標逐位相同；交線按兩個三角形與對方平面交段的重疊長度量測。完整座標與交點見 <a href="qa/export-residuals.json">export-residuals.json</a>。</p><div class="table-scroll"><table><thead><tr><th>GLB 面索引</th><th>交線長度 mm</th><th>最近 ROI 距離 mm</th><th>最近 ROI</th></tr></thead><tbody>{''.join(rows)}</tbody></table></div></section>
<section><h2>相同六鏡頭</h2><p>三欄依次是原高模、原低模與局部修補；下方有相同掌面鏡頭的線框。點圖可看原尺寸。</p></section>{''.join(full)}
<section><h2>四區近照</h2><p>相同鏡頭與燈光的前後對照。四張近照沒有新增「原圖亮度 &gt;100、新圖亮度 &lt;40」的像素；這是有限的圖像檢查，不能證明所有角度無裂縫。</p></section>{''.join(close)}
<section><h2>掌面線框</h2><figure class="wire"><a href="qa/renders/four-finger-palm-wire.png"><img src="qa/renders/four-finger-palm-wire.png" alt="局部修補掌面線框"></a></figure></section>
<section><h2>面積與限制</h2><p>面積小於 10⁻¹⁰ m² 的面：Blend 277、GLB 278。float64 精確零面積為 0；Blender BMesh float 面積下溢計為 1。嚴格自交偵測排除共頂點及共平面重疊，GLB 先把完全同座標的 UV seam 重複頂點合併再判定。候選只供審核，不得用於烘焙、綁定、動畫或正式資產。</p></section></main></body></html>'''
    (RUN/'review.html').write_bytes((body+'\n').encode('utf8'))
    (RUN/'review.css').write_bytes('''*{box-sizing:border-box}body{margin:0;background:#101822;color:#e7edf3;font:16px/1.6 system-ui,"Noto Sans TC",sans-serif}header,main{max-width:1440px;margin:auto;padding:28px}header{border-bottom:1px solid #42576b}.eyebrow{color:#88b7ce;letter-spacing:.12em;text-transform:uppercase}.status{display:inline-block;background:#5c331f;color:#ffe0b2;padding:8px 12px;border-radius:4px}section{margin:30px 0;padding:18px 0;border-bottom:1px solid #334455}h1,h2{line-height:1.2}h2{color:#b9dbe8}a{color:#8cdef4}a:focus-visible{outline:3px solid #f4c46e}figure{margin:0;background:#202c39;padding:8px}figcaption{padding:7px;color:#b8c9d6}img{display:block;width:100%;height:auto;max-height:720px;object-fit:contain}.triptych,.pair{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}.pair{grid-template-columns:repeat(2,minmax(0,1fr))}.wire{max-width:760px}.table-scroll{overflow-x:auto}table{border-collapse:collapse;min-width:540px;width:100%}th,td{text-align:left;border-bottom:1px solid #415263;padding:10px}@media(max-width:800px){.triptych,.pair{grid-template-columns:1fr}header,main{padding:18px}}\n'''.encode('utf8'))
    files=[p for p in RUN.rglob('*') if p.is_file() and p.name!='provenance.json']+[CONTRACT]
    provenance={'status':'qa_failed','runtime_publish_allowed':False,
                'sha256':{str(p.relative_to(ROOT)).replace('\\','/'):sha(p) for p in sorted(files)}}
    write(RUN/'qa/provenance.json',provenance)
    print('LOCAL_FINALIZE',json.dumps({'checks_failed':[k for k,v in checks.items() if not v],
          'triangles':b['triangles'],'rendered_views':len(renders['renders']),'provenance_files':len(files)}),flush=True)


if __name__=='__main__':main()
