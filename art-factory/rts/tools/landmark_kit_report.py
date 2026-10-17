"""Assemble evidence-backed handoff after author visually reviews final renders."""
import json,hashlib
from pathlib import Path
ROOT=Path(__file__).resolve().parents[3];RUN=ROOT/'art-factory/rts/runs/landmark-kit/2026-10-08-v1'
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def report():
    a=json.loads((RUN/'qa/delivery-audit.json').read_text());ri=json.loads((RUN/'qa/reimport.json').read_text())
    observations={
        'river-gatehouse':'正背面與兩斜視均可見厚石拱、13 個曲面楔塊、左右不同破損牆冠、石牆轉折；八片木柵、橫樑与斜撐封堵入口，不暗示可穿行；底部石構與碎石接地。',
        'river-shrine':'磨損三階台、腰收祭台、原創八芒日輪嵌件、三種高度的斷柱與低矮圍牆；RTS 剪影低寬，落地柱鼓與石塊可辨識；無旗幟、文字或資源標識。',
        'highland-watchtower':'八面厚壁、兩個實際穿牆窗洞、窗台/拱緣/內壁、變高破損牆頂、空頂內部与木梁殘架實看；較高而窄，與門樓/祭址不混淆。正面窗口可見對側內壁，背窗可見透空，不是貼黑窗片。',
        'quarry-ruins':'三階切石工作面、實際楔孔與裂縫、偏心吊臂/斜撐、榫接黃銅箍、卷繩絞盤/手柄、下垂繩与落地石料均可見；橫向不對稱、吊架腳落在石鞋。'}
    images=[{'path':p.relative_to(ROOT).as_posix(),'sha256':sha(p)} for p in sorted((RUN/'qa').glob('*reimport.png'))]+[{'path':(RUN/'qa/multiview-contact.png').relative_to(ROOT).as_posix(),'sha256':sha(RUN/'qa/multiview-contact.png')}]
    visual={'review_type':'author self-review of actual final GLB reimport renders; root independent review pending','reviewed_views':'four models × front/back/two obliques, fixed RTS all-four assembly and both-LOD comparison','observations':observations,'lod_observation':'LOD1 保留主剪影、木柵封堵、祭台/斷柱、塔樓厚壁/窗洞、吊臂/絞盤；末次匯出重建加權法線，避免 collapse 後大面片的暗塊。','images':images,'runtime_publish_allowed':False,'independent_review':'not performed by this author; root will arrange'}
    (RUN/'qa/visual-review.json').write_text(json.dumps(visual,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    lines=['# Task 1 報告：原創 3D 地標候選','',
        '狀態：**DONE_WITH_CONCERNS**。四個原創可編輯 `.blend`、八個 LOD0/LOD1 `.glb`、來源與配方快照、多視角/RTS/LOD 比較及真實重匯入均已完成。全部保留 `runtime_publish_allowed: false`；本報告只交付候選，整體遊戲商用驗收與 runtime 整合仍由主流程處理。','',
        '工作樹：`C:/Users/bag57/projects/super_galen_site_rts_landmarks_commercial`，branch `feat/rts-commercial-landmarks`；起點由主流程建立於 `79789f39fd8e0112482ef3e389add73c2420edf4`。Windows / PowerShell；Blender 實測版本 `5.2.1 LTS`。沒有執行模型的資訊來源可宣稱，不冒稱 baseline tests passed。既有未追蹤的 `docs/superpowers/plans/2026-10-08-rts-3d-landmark-kit.md` 保持原樣。','',
        '## 產出與来源','',
        '- 契約：`art-factory/rts/contracts/landmark-kit-2026-10-08.json:1`，含四 asset ID、footprint、LOD/材質/下載預算、禁止事項、screen grouping、有意門窗開口及審查狀態。',
        '- 候選：`art-factory/rts/runs/landmark-kit/2026-10-08-v1/candidate/`，四資產各 `-lod0.glb` / `-lod1.glb`；所有貼圖嵌入 GLB，無外部遺失 URI。',
        '- 可編輯來源：同 run `raw/<asset-id>.blend` 與 `raw/<asset-id>-modules.json:1`；保留命名零件、module family、接合說明與原始控制頂點/面 JSON。共用楔拱、石構、轉製輪廓、環形線腳、木構、封端繩索 helper；匯出階段才按材質合併。',
        '- 接合/來源凍結：`raw/module-interfaces.json:1`、`raw/sources.json:1`、`raw/provenance-lock.json:1`、`raw/recipe/`、`prompts/authored-model-brief.md:1`。27 筆原始圖、prompt/contract、材質 derivative/生成配方都已複製與 SHA256 核對，無缺失來源。',
        '- 所有模型由本次授權的原創 Blender 控制網格/造型配方製作；原石、橡木、黃銅像素來自既有 builtin-imagegen 原圖，無第三方下載。石材生成 prompt 在凍結的 kingdom-buildings v2 contract；木材 prompt 在 siege contract；黃銅原始 atlas、兩個 prompt、crop QA、材質配方均已凍結。既有紀錄未列 imagegen 內部模型版本，不虛構補齊；粗糙度/金屬度為作者參數，normal 為已有來源亮度導數，非量測物理值。','',
        '## 實测数據','',
        '| 候選 | 三角面 | 材質 / draw groups | GLB bytes | gzip bytes |',
        '|---|---:|---:|---:|---:|']
    for r in a['assets']:lines.append(f"| {r['id']} LOD{r['lod']} | {r['triangles']:,} | {r['materials']} / {r['draw_groups']} | {r['bytes']:,} | {r['gzip_bytes']:,} |")
    lines+=['','LOD0 均在 6k–16k 目標內，LOD1 均在 2k–5k 目標內，每 prefab 至多四材質。來源 Blender 保留較密可編輯 mesh；runtime 候選的 oversampling 在 LOD0 收斂，再獨立簡化 LOD1，沒有填面數湊指標。','','| SHA256 對象 | 完整 hash |','|---|---|']
    for r in a['assets']:
        if r['lod']==0:lines.append(f"| {r['id']} source .blend | `{r['source_sha256']}` |")
        lines.append(f"| {r['id']} LOD{r['lod']} .glb | `{r['sha256']}` |")
    source_manifest=json.loads((RUN/'raw/sources.json').read_text())
    lines+=['','原始圖、prompt/來源契約、原圖處理配方與重用 derivative 的完整凍結記錄如下；授權範圍來自本次 task brief（凍結 SHA 見 `raw/provenance-lock.json`）及既有 original imagegen 來源記錄，不把来源記錄冒稱第三方授權文件。','','| 凍結來源／權利 provenance 證據 | SHA256 |','|---|---|']
    for s in source_manifest['sources']:
        lines.append(f"| `{s['frozen'].split('raw/inputs/')[-1]}` | `{s['sha256']}` |")
    lines+=['','| 地圖兩唯一 prefab，含雙 LOD | gzip bytes | 目標 |','|---|---:|---:|']
    for m in a['maps']:lines.append(f"| {m['map']} | {m['both_lods_gzip_bytes']:,} | ≤ 2,000,000 |")
    lines+=['','壓縮數據以 Python `gzip.compress(..., mtime=0)` 實測，包含每張圖兩 prefab 的 LOD0+LOD1，共四 GLB；鏡像/重複擺放不需重复下載。不假設部署端自動壓縮：實際傳輸達標仍須主流程確認 HTTP Content-Encoding。原始 GLB 下載總量另列 `qa/delivery-audit.json:1`。石牆 RGB 縮至384，切石/木材256、黃銅128、normal/MR128；皆由既有生成來源確定性縮圖。','',
        '## 實際驗證','',
        '1. TDD：先建立未實作 helper 和四個行為測試，真實執行得到四個 `NotImplementedError` 紅燈；實作後 `python -B art-factory/rts/tools/landmark_kit_geometry_test.py` 四案全部 OK。涵蓋真正曲面楔塊的封閉/正體積/厚度、凹破損輪廓、錯誤半徑/深度/退化拒絕、足跡/埋地/高度越界。證據 `qa/tdd.json:1`；不是單純常數鏡像測試。',
        '2. 以 Blender 5.2.1 真實 import 八個 GLB，零退化三角面、零 position-weld 後開放/非流形邊、零孤立頂點、正有向體積、UV finite/存在、normal finite/unit、origin zero、scale1、source Z-up 與 GLB Y-up bounds 全部正常。無遺失 image，所有 GLB image 由 bufferView 嵌入。每個三角面具 POSITION/NORMAL/TANGENT/TEXCOORD_0。證據 `qa/reimport.json:1` 與 `qa/delivery-audit.json:1`。',
        '3. Khronos glTF validator：`node art-factory/rts/tools/landmark_kit_validator.cjs` 八檔 **0 errors / 0 warnings**。只讀使用主要工作樹既有 `tmp/rts/handoff-20261006/validator/node_modules/gltf-validator`，沒有安裝套件或更動其內容。證據 `qa/gltf-validator.json:1`。',
        '4. 來源/候選/QA 指向同 SHA：`python -B art-factory/rts/tools/landmark_kit_audit.py` 核對 27 來源及所有 derivative、四 source、八 candidate、reimport/validator SHA、材質/primitive、軸向與 map budget，通過。Python AST 七個工具語法通過；Node `--check` 通過；交付文字機密樣式掃描無命中。',
        '5. 四模型各正面、背面、兩斜視近照（720×720），`qa/multiview-contact.png`，`qa/rts-assembly-reimport.png`（1600×850），`qa/lod-comparison-reimport.png`（1600×1100）。全部是实际 GLB 重匯入渲染，作者已實看；没有只看 source Blend。觀察及圖片 SHA 在 `qa/visual-review.json:1`。','',
        '## 造型實看與有意開放結構','']
    for asset,ob in observations.items():lines.append(f'- `{asset}`：{ob}')
    lines+=['','所有零件為封閉厚實實體；塔樓屋頂开放、窗洞、门洞形凹空、斷柱頂與採石缺口均有實際封端/側壁/内壁，不是零厚面。最高塔樓源 bounds 為約5.005m；最低地基約 -0.060m，水平全部在原點±1.9m內；完整數據見 audit。','',
        '## 修正与失敗軌跡','',
        '- 初次 export material-join 引用已被 Blender join 刪除的 Object，改为先凍結 group 再 join；加入 `--python-exit-code 1`，避免 Blender 腳本錯誤卻 process 0 被誤判。',
        '- 首輪重匯入抓到祭址薄黃銅 disc 的半厚 bevel 退化与小件 LOD 拓撲失敗，以及採石 LOD 一個微退化面。改用厚度限制 bevel、網格 dissolve-degenerate、薄小黃銅至少0.60 collapse保留；沒有降低驗證門檻。首輪 `qa/attempt-1/` 保留失败報告与整組图。',
        '- 首輪 validator 為0 error /32 tangent警告；增加顯式三角化與 tangent export 后零警告。第二輪结构/validator 全通过，`qa/attempt-2/` 保留其証據。',
        '- 含雙 LOD 的河谷 gzip 初為2,090,590 bytes，將原石 RGB512確定性縮至384达標；進一步實看 LOD比較，補 final weighted normals以消除 collapse後暗面；最后重新输出、validator、八檔 roundtrip及多視角渲染，没有沿用先前hash驗收。','',
        '## 已做 / 未做 / concerns','',
        '- 已做：四原創模型、模組/接合/配方來源、UV/PBR、LOD、完整 hash/来源冻结、八 GLB 真實重匯入與 validator、16 近照、RTS 組裝及雙 LOD 比較、機械/作者視覺 QA，下載预算。',
        '- 未做（依 ownership）：runtime/renderer/terrain/AI/尋路/資源/玩法、registry/共用工具修改、主工作樹写入、commit/push/deploy；沒有跑不相干全站測試，沒有派子代理或 reviewer。',
        '- concerns：候選尚待主代理安排獨立 review-pr 检核，之后需實際 renderer與兩地图放置/遮擋/效能驗證；压缩傳輸须實測实际 endpoint。不可因本包机械 QA 通過宣稱整個遊戲可商用。既有 imagegen内部模型版本未记录；已明確保存实际能證明的来源与prompt，不补造事实。',
        '- 無工作包技術阻塞，候選目前没有 unresolved QA failure。`runtime_publish_allowed` 全部 false。']
    # Normalize author handoff prose to the user's Traditional Chinese locale.
    table={'楼':'樓','与':'與','测':'測','数':'數','据':'據','来':'來','际':'際','门':'門','内':'內','边':'邊','构':'構','层':'層','阶':'階','缩':'縮','图':'圖','处':'處','体':'體','写':'寫','录':'錄','冻':'凍','结':'結','证':'證','实':'實','检':'檢','传':'傳','输':'輸','过':'過','开':'開','为':'為','时':'時','后':'後','无':'無','转':'轉','别':'別','压':'壓','纹':'紋','样':'樣','标':'標','单':'單','块':'塊','网':'網','个':'個','关':'關','会':'會','应':'應','现':'現','从':'從','备':'備','装':'裝','轮':'輪','动':'動','变':'變','认':'認','顶':'頂','删':'刪','对':'對','该':'該','审':'審','还':'還','负':'負','责':'責','达':'達','运':'運','环':'環','于':'於','项':'項','断':'斷','几':'幾','较':'較','风':'風','库':'庫','异':'異','针':'針','带':'帶','链':'鏈','错':'錯','误':'誤','扫':'掃','视':'視','号':'號','点':'點','获':'獲','总':'總','键':'鍵','调':'調','术':'術','权':'權','题':'題','选':'選','独':'獨','夹':'夾','许':'許','将':'將','机':'機','义':'義','报':'報','验':'驗','七':'八'}
    table.update({'没':'沒','复':'複','証':'證'})
    reporttext=''.join(table.get(c,c) for c in '\n'.join(lines)+'\n')
    reportpath=ROOT/'.superpowers/sdd/2026-10-08-rts-3d-landmark-kit/task-1-report.md';reportpath.write_text(reporttext,encoding='utf-8')
    print(reportpath)
if __name__=='__main__':report()
