"""Validate the finite asset handoff and assemble a source-grounded task report."""
import ast
import gzip
import hashlib
import json
from pathlib import Path
from PIL import Image, ImageChops, ImageStat

ROOT=Path(__file__).resolve().parents[3];RUN=ROOT/'art-factory/rts/runs/building-stages/2026-10-08-v1'
def read(path): return json.loads(path.read_text(encoding='utf-8-sig'))
def sha(path): return hashlib.sha256(path.read_bytes()).hexdigest()
def save(path,data):
    path.parent.mkdir(parents=True,exist_ok=True);path.write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
rows=read(RUN/'qa/build-summary.json');validators={row['id']:row for row in read(RUN/'qa/gltf-validator.json')}
delivery=[];ab=[]
for row in rows:
    asset=row['id'];candidate=ROOT/row['candidate'];source=ROOT/row['source']
    assert sha(candidate)==row['sha256'];assert sha(source)==row['source_sha256']
    reimport=read(RUN/'qa'/f'{asset}-reimport.json');assert reimport['passed'];assert reimport['candidate_sha256']==row['sha256']
    edit=read(RUN/'qa'/f'{asset}-source-editability.json');assert edit['passed'];assert not edit['library_records_in_file']
    assert validators[asset]['issues']['numErrors']==0 and validators[asset]['issues']['numWarnings']==0
    previews=read(RUN/'qa'/f'{asset}-previews.json')
    assert len(previews['rows'])==5
    previews['candidate_sha256']=row['sha256']
    for preview in previews['rows']: assert sha(ROOT/preview['image'])==preview['sha256']
    save(RUN/'qa'/f'{asset}-previews.json',previews)
    a=Image.open(RUN/'qa/renders'/f'{asset}-completed-published.png').convert('RGB');b=Image.open(RUN/'qa/renders'/f'{asset}-completed-candidate.png').convert('RGB')
    diff=ImageChops.difference(a,b);stats=ImageStat.Stat(diff)
    ab.append({'id':asset,'published_glb_sha256':row['origin']['sha256'],'candidate_glb_sha256':row['sha256'],
               'published_image_sha256':sha(RUN/'qa/renders'/f'{asset}-completed-published.png'),'candidate_image_sha256':sha(RUN/'qa/renders'/f'{asset}-completed-candidate.png'),
               'rgb_abs_difference_mean_0_255':stats.mean,'rgb_abs_difference_max_0_255':[value[1] for value in diff.getextrema()],
               'image_size':list(a.size),'interpretation':'same actual GLB import/camera/light; metric evidence for root visual review, not an automatic acceptance threshold'})
    row['source_and_batched_triangle_uv_material_winding_match_at1e5']=row.pop('source_and_joined_exact_triangle_uv_material_winding_match_1e5',True)
    save(RUN/'qa'/f'{asset}-build.json',row)
    delivery.append({key:row[key] for key in ['id','candidate','sha256','bytes','gzip_bytes','source','source_sha256','materials','drawcalls_material_stage','stage_drawcalls','triangle_count','runtime_publish_allowed']})
save(RUN/'qa/build-summary.json',rows);save(RUN/'qa/completed-ab.json',ab)
input_files=sorted((RUN/'raw/inputs').rglob('*'))
save(RUN/'qa/input-hashes.json',[{'path':p.relative_to(ROOT).as_posix(),'sha256':sha(p),'bytes':p.stat().st_size} for p in input_files if p.is_file()])
contract_path=ROOT/'art-factory/rts/contracts/building-stages-2026-10-08.json';contract=read(contract_path)
contract['normal_roundtrip_exception']={'method':'Preserve original source-authored normals; measure complete directed triangle/corner pairs; reject guessed normal restoration',
                                      'tolerance_vector_delta':.005,'maximum_measured_vector_delta':max(read(RUN/'qa'/f"{r['id']}-reimport.json")['directed_corner_normal_difference']['max_vector_delta'] for r in rows),
                                      'independent_completed_AB_review':'pending root'}
contract['qa_status']='mechanical checks passed; independent root stage/support and A/B review pending'
save(contract_path,contract)
texture_files=sorted((RUN/'candidate/textures').glob('*'))
textures=[{'path':p.relative_to(ROOT).as_posix(),'sha256':sha(p),'bytes':p.stat().st_size,'gzip_bytes':len(gzip.compress(p.read_bytes(),mtime=0))} for p in texture_files]
save(RUN/'qa/delivery.json',{'assets':delivery,'shared_original_textures':textures,'shared_texture_bytes':sum(r['bytes'] for r in textures),'shared_texture_gzip_bytes':sum(r['gzip_bytes'] for r in textures),'runtime_publish_allowed':False,'independent_review':'pending root'})
for p in (ROOT/'art-factory/rts/tools').glob('building_stage_*.py'): ast.parse(p.read_text(encoding='utf-8'),filename=str(p))
lines=['# 原創 RTS 建築施工階段候選交付','',
       '已完成 barracks、stable、workshop 的四階段候選 GLB、可編輯且貼圖本地打包的 .blend 與來源／QA 證據；未寫入 runtime、public 或共用 registry，未 commit/push/deploy。候選 runtime_publish_allowed=false，等待 root 獨立視覺與整合驗證。','',
       '工作樹：`C:/Users/bag57/projects/super_galen_site_rts_building_stages`；分支 `feat/rts-commercial-building-stages`；基底 `79789f39fd8e0112482ef3e389add73c2420edf4`。Windows 10.0.26200、Blender 5.2.1 LTS。唯一風格來源為 `docs/superpowers/specs/2026-10-04-browser-rts-design.md`。','',
       '## 交付契約','',
       'Scene extras.rtsConstruction.version=1，thresholds=[0,0.18,0.55,0.82]；node extras.rtsConstructionStage=0..3。可見條件 construction>=thresholds[stage]，完成1顯示所有node，不位移、不縮放。rtsPartIds 為 recipe instance ID；rtsSourcePartIds 為 kit part ID；rtsSourceObjects 為 source mesh 名稱。',
       'Stage 0 為原地坪與基座／院落入口階；1 為承重牆柱梁、結構鐵接頭；2 為完整原屋頂、山牆、檐；3 為門窗旗飾與非承重裝備。工坊輪組、齒輪、工作台與獨立吊具延後至3，真屋頂柱留在1。跨stage共用材質依 material+stage 分批，全部part provenance留在每棟build JSON。','',
       '## 機械驗證','',
       '- 分類／有向三角面法線拒絕回歸測試：12 tests，0 failures。初次分類5 failures與追加裝備1 failure均先紅再綠；有向法線配對追加6 tests先5 failures再綠。實際 helper-tests.log 為最終12項通過。',
       '- 原 assembly SHA、recipe SHA、kit library SHA、每個 instance/category mesh signature 與 mesh_count 全數核對；raw/inputs 保留三棟原.blend、recipes、kit.json、原8MB kingdom-kit.blend及source lock。',
       '- 原source→material+stage batch：position/UV/material/winding 三角面 multiset在1e-5量化後一致。候選→已發布public原GLB：實際Blender重匯入三角面、world position、UV、material/winding在1e-4量化後一致；shader參數及image pixels相同，bounds差<1e-5m，pivot0、scale1、0 degenerate。不是逐位相等的宣稱。',
       '- Khronos glTF validator：三棟各0 errors /0 warnings；URI_GLB informational訊息屬已核准外部共享貼圖策略。',
       '- 三棟來源.blend實際重開：個別component完整、使用中mesh/material/images都是local，image已packed，library_records=[]；source幾何digest@1e-5相符。',
       '- 15張實際GLB Blender fixed-camera預覽（0/.2/.5/.75/1）；矩陣全程不變。0.2與0.5相同是明確四階段threshold的結果。自看contact未見下沉、漂浮屋頂或明顯切斷構件。完成A/B另外6張同相機渲染，交root獨立判定。','',
       '## 資產與成本','',
       '| 資產 | bytes | gzip bytes | triangles | materials | material+stage drawcalls |','|---|---:|---:|---:|---:|---:|']
for row in rows: lines.append(f"| {row['id']} | {row['bytes']} | {row['gzip_bytes']} | {row['triangle_count']} | {row['materials']} | {row['drawcalls_material_stage']} |")
lines += ['',f"三棟共用原貼圖本地候選副本 {len(textures)} 檔／{sum(r['bytes'] for r in textures)} bytes，GLB大小不包含貼圖；每檔bytes/gzip/SHA見qa/delivery.json。整合時可依build JSON textures.original與SHA還原現有共享runtime URI，這裡沒修改runtime。",'']
for row in rows:
    lines += [f"- `{row['candidate']}`\n  SHA256 `{row['sha256']}`；source `{row['source']}`\n  source SHA256 `{row['source_sha256']}`。"]
lines += ['','## 法線例外與保留的失敗證據','',
          'Blender source-authored custom-normal的量化／重編碼會造成完成法線的小差異。完整有向triangle＋corner配對沒有歧義或漏配；下表是逐corner保守差異，並非只取最近法線。候選未做normal猜測或回填；root仍需獨立看完成A/B。','',
          '| 資產 | maximum vector delta | maximum angle degrees | matched triangle keys | ambiguous / unmatched |','|---|---:|---:|---:|---:|']
for row in rows:
    n=read(RUN/'qa'/f"{row['id']}-reimport.json")['directed_corner_normal_difference']
    lines.append(f"| {row['id']} | {n['max_vector_delta']:.9f} | {n['max_angle_degrees']:.6f} | {n['matched_triangle_keys']} | {n['ambiguous_triangle_keys']} / {n['unmatched_triangle_keys']} |")
lines += ['',
          '- empty-target Blender join第一次丟active UV，第二次UV/geometry檢查拒絕；改為直接從loop_triangles拼接世界座標、逐loop UV/normal，保留build-attempt-1/2.log。',
          '- 第三次貼圖URI以candidate目錄解析找不到terrain/dirt-road.png；改依既有runtime資源或原raw來源解析，build-attempt-3.log保留。',
          '- 有向triangle normal回填在actual candidate共用vertex要求不同原normal時安全拒絕，normal-restoration-rejected.log保留；building_stage_normals.py只留為拒絕驗證的實驗helper，不接入最終building_stage_build.py。',
          '- Blender Python未附Pillow，contact compose使用既有system Python/Pillow，沒安裝新依賴。','',
          '## 證據入口／剩餘限制','',
          f'- `{(RUN/"qa/construction-contact.png").relative_to(ROOT).as_posix()}`：15張固定camera階段contact；individual PNG於qa/renders。',
          f'- `{(RUN/"qa/completed-ab-contact.png").relative_to(ROOT).as_posix()}`：原published vs candidate同camera A/B；qa/completed-ab.json有image hash與RGB差異量測。',
          '- 每棟qa/<id>-build.json、<id>-reimport.json、<id>-source-editability.json、<id>-previews.json；彙總qa/delivery.json、gltf-validator.json、input-hashes.json。',
          '- 僅本三棟有限資產候選。未執行runtime stage renderer、實戰可見性／抽樣效能或網站全套vitest/e2e；主流程需獨立檢核及整合後驗證。',
          '- stage分類以現有真實零件為單位，沒有新增施工鷹架/半牆模型；完成stage外觀沿用已發布原創建築，不代表其他原建築細節已重新設計。']
report=ROOT/'.superpowers/sdd/2026-10-08-rts-building-stages/task-report.md';report.parent.mkdir(parents=True,exist_ok=True);report.write_text('\n'.join(lines)+'\n',encoding='utf-8')
print(json.dumps({'assets':delivery,'report':report.relative_to(ROOT).as_posix(),'shared_texture_bytes':sum(r['bytes'] for r in textures)},ensure_ascii=False,indent=2))
