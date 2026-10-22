# CS 第一人稱動作與手部實作計畫

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 推進完整 CS2 品質目標，先補齊真實手部、可讀換彈流程與平順持槍動作；此里程碑不代表整體目標達成。

**Architecture:** 引擎保留權威換彈秒數與命中規則。獨立 viewmodel 模組取樣換彈／射擊動作，快取 GLB rest transforms，renderer 只更新既有節點。美術在隔離 worktree 製作，通過來源、機械與組裝檢查後才整合。

**Tech Stack:** TypeScript、Three.js、Vitest、Playwright、Blender 5.2。

**Spec:** `docs/superpowers/specs/2026-10-03-browser-cs-design.md`

## Global Constraints

- 沿用唯一舊城寫實風格、單人 3 對 3 爆破規則與網站字型。
- 保留九個碰撞體與權威 hitscan；動畫不能改動瞄準方向或造成命中提前／延後。
- 美術保留來源／授權／prompt（適用時）／候選與 QA；未通過候選不進 runtime。
- 主 cs 只有主代理寫入；美術 worker 僅在 cs-v6-hands 寫入其指定檔案。
- 不部署、不 push、不改與遊戲無關的全站失敗。

## Review Focus

- 四槍不同比例、作者原點／rotation，以及合併步槍網格的零件拆分。
- 動作跨越低幀率、暫停、死亡、換回合與換槍不能漂移或重播。
- 狙擊 reload 必須同步 HUD scope、相機 FOV 與模型可見性。
- 新手掌不能僅在單一圖角度成立；腰射、ADS、換彈均需檢查。
- 有限 pool／節點快取不能被動畫改成逐幀建 mesh、texture 或搜尋樹。

## Tasks

- [x] 寫換彈時間、部件復位、平順 ADS、暫停與 reduced-motion 的失敗測試。
- [x] 新增 `src/scripts/games/cs/weapon-motion.ts`，實作時間取樣、rest pose 快取與可選零件控制；測試放相鄰檔。
- [x] 整合 `renderer.ts`；移除固定 2.6 秒正弦換彈，將裝飾性 bob/sway 限於 viewmodel。
- [x] 更新 `presentation.ts`、`client.ts` 的狙擊換彈 scope 同步並補回歸測試。
- [ ] 隔離製作 anatomical CC0 手部與四槍零件候選，先 rifle 圖像檢核再批次；整合前核對 hashes。
- [ ] 實際 GLB E2E 驗證四槍時間線、節點復位、muzzle 投影與資源數量；真頁換彈／瞄鏡操作。
- [ ] 留動作各階段截圖與影片，獨立視覺／程式審查，最後凍結後跑相關 E2E、全單元測試、型別及建置。
- [ ] 單獨量測固定場景、特效壓力與真頁移動轉向；記錄 p95／最差幀，保留失敗紀錄。
- [ ] 對原始 CS2 品質目標重新審計，未完成則保持目標 active 並繼續後續缺口。

## 後續有限工作包：第一人稱光照連動

固定的相機燈使槍械在背陽面與向陽面一樣亮。沿用同一太陽方向，以現有靜態建築碰撞體的低成本射線估算直射可見度，平順調整 viewmodel 直射與天空填光；燈光方向轉換到相機座標，轉身時高光會跟著世界光源。這是近似遮光，不是烘焙 GI，也不替代棚布等細節的陰影。

- 先驗開闊／遮蔽／越過屋顶與幀率無關的過渡、暫停。
- renderer 實際移動與轉向驗燈的方向／亮度，確認沒有新增逐幀 GPU pass 或光源。
- 留日照與建築陰影兩組畫面；同機單獨量測實際遊玩，V5 gameplay p95 不退步超過 10%。

## 已驗證與待整合界線

第一人稱動作已通過真實舊 GLB 的手槍／衝鋒槍／狙擊槍彈匣位移、暫停與復位；來源前綴採唯一後綴綁定，重名安全略過。回合與比賽結束會清除凍結換彈姿勢，保留決勝彈效果。換彈釋放／插入／上膛聲音按實際時長觸發且不重播。狙擊 scope class 每幀與槍械可見性同步。

V6 rifle 手部前兩版皆被拒絕，未進 runtime。第三輪依獨立診斷修正掌面、左右手與手指關節，先驗扳機手的接觸位置，再製作支撐手及其他三槍。袖管需在腰射、ADS 與換彈的實際相機中出框；機械 QA 不代替握姿的視覺檢核。四槍新手與 rifle 真實彈匣的最終組裝驗收仍未完成。

V6 新地標前兩版皆被拒絕；只有 ground-only 候選通過獨立局部視覺檢核、來源與幾何保持檢查、實玩效能驗證後，已整合本機 runtime。現行環境 SHA-256 為 `6484d2ff45841b51bf4cefd89a8d03bacc6cbfc8fa5a48b7d5b47c615c367a1c`，73,522 triangles／31 draws／7,491,680 bytes；整體建築與遠景重複性仍待改善。證據為 `art-factory/cs/runs/run-20261004-v6-motion/qa/verification-ground-published.json`，不代表對外部署或完整 CS2 品質通過。

建築第三輪改查官方 CC0 的完整建築模組，先保留原始來源、材質、尺寸與三角面清單，再做單件輪廓檢核；先不組裝全地圖。既有九個碰撞體、玩法與地面保持不變。候選通過實際玩家視角與效能檢查前不得進 runtime。

### 後續已整合的兩項局部修正

官方 Poly Haven Modular Fort 01 圓塔已替換 A 區邊界後方的舊方塔。新增量為 2,768 triangles／2 draws／149,200 bytes；九個碰撞體及已核准地面保留。獨立視覺檢核為 LIMITED PASS，另查三個北界近牆視角，未見背景交界穿面；塔與不可行走背景樓群仍有被遮蔽的體積重疊。實際頁面高／低畫質 p95 為 16.7／16.8 ms。候選及本機整合記錄在 `run-20261004-v6-architecture`。

角色兩腿原先繞地面原點旋轉，真實 GLB 回歸測試量得髖部偏移 0.325049m。`repair_cs_soldier_pivots_v6.mjs` 重定位到來源髖部並補償子網格矩陣；整個 binary chunk 保持相同、rest world matrix 最大差 1.665e-16、4,120 triangles／31 draws 不變。候選測試轉綠且獨立檢核無 P1/P2，已本機整合；這仍是剛性整腿擺動，膝／踝／足底與上身瞄準鏈尚未完成。來源與 before/candidate 圖在 `run-20261004-v6-soldier`。

手部第三輪查到手網格與骨架尺度不一致，造成尖扁形變；第四輪已修同座標空間並通過 edge distortion gate，但實際指端接觸仍失敗，維持候選不可發布。下一步修正整手握把座標與關節目標，不把寬鬆接觸門檻當成通過。

第五輪握姿改善，但獨立檢核發現 index/thumb cap 完全重複、trigger target 誤收護圈，以及穿透 gate 未測量，判定 REJECT。第六輪修正互斥取樣與真扳機後仍被拒絕：整手最後縮成 .62，使 index 到合法接觸點的距離 69.932 mm 超過鏈長 55.191 mm；IK 掛錯 MCP，縮尺還掩蓋了 max 2.333 倍的局部 edge 伸長。原 2–3 mm 接觸門檻不得擴成 1.5–4.5 mm，拇指 10.992 mm 穿透也未通過。第七輪先保存正確 gate 的 RED，再修 final-scale 整手掛點、DIP 求解与拓樸權重；trigger-only 通過後才擴展支撐手和其他武器。獨立拒絕依據在 `checkpoint-6-trigger/qa/independent-review.json`。

### 第三人稱上下瞄準

引擎射線有 pitch，但模型始終水平持槍。真實 renderer/GLB 測試已重現：pitch 0.4 時，槍的單位方向向量誤差 0.397339。有限修正以 actor-space 肩軸 `(0,1.447,.012)` 帶動双臂與槍，保留 glTF 的 Rx90° rest matrix；頭部繞 `(0,1.57,0)` 跟隨並限幅 ±0.65。換槍採固定 rest mount 並移除舊 parent，不把當下傾角烘進新槍。WeakMap 快取軸，維持幾何／材質資源數。

- [x] 原 runtime 真正 RED，修正後方向／肩部固定／雙臂握槍相對矩陣／腿不動／暫停／換槍唯一性／非戰鬥復位轉綠。
- [x] 補 Rx90° rest 保持、head limit、重複呼叫與 NaN 邊界單元測試。
- [x] 固定版本完成近距離動作／四槍切換 capture、獨立檢核、CS 全瀏覽器與本機效能重驗。

此有限修正由 `cs_v6_motion_review` 獨立核准，沒有 P1/P2；116 檔／1,277 單元測試、CS 32 通過／88 平台略過、build 及 targeted tsc 都成功。真頁高／低 p95 為 16.8／16.7ms，最差單幀仍為 50／33.4ms；八組 fixed renderer/FX p95 與 worst 均不超過 16.8ms。證據在 `run-20261004-v6-motion/qa/verification-actor-aim.json`；新 GLB 未涉及本次程式修正，整體目標保持未完成。

### 已整合的日間 HDR 背景

- [x] 官方 CC0 Kloofendal 1K 來源 hash、HDR 數值、1.5 MB 預算與實測太陽高度差 gate。
- [x] 背景與既有環境照明分離；source Sky 只生成 PMREM 後釋放，新增 HDR 明確持有與釋放。
- [x] 載入失敗／同頁重試、雙重 dispose、HDR 旋轉與照明分離的真實 renderer 測試。
- [x] 背景限定方案與全 360° 雲帶通過独立局部視覺 review；正式 URL 留 11 張當前版本截圖。
- [x] 1,277 unit、34 CS 通過／96 平台略過、build/tsc、13 個本機 HTTP 資產 hash 核對。

證據：`run-20261004-v6-motion/qa/verification-sky-published.json`。高／低畫質真頁 p95 16.7／16.8 ms，最差皆 33.3 ms；固定八組不超過 16.8 ms。首次 HDR cubemap 六面轉換造成舊測試初幀 1→7 的真實差異，已保留失敗並顯式驗初幀與後續 30 幀 cache；没有改低畫質持續單 pass 要求。這不代表手部、整體場景或 CS2 品質完成。

### 牆面材質有限 A/B

唯讀診斷確認粉刷牆的 roughness 影像直接接到 BSDF，覆蓋原 material() 設定的 .82 值；GLB 因而使用 factor 1。三種牆色也共享同一個世界 UV 相位。此處僅製作 roughness factor 恢復與額外固定相位兩個候選；保留幾何、二進位貼圖、2m 密度、污漬上下方向、光照與其他材質，不增加 draw/texture。

- [x] 原資料三項 RED，修正後 factor 生效、PBR 對齊、來源不變與錯誤素材安全拒絕三項 GREEN。
- [x] source SHA、binary chunk、mesh/node/accessor/image/texture 相同，只有白名單三個材質 metadata 改動。
- [x] 同版 spawn/A/B/warehouse 畫面對照與獨立視覺選擇：採 roughness-only；phase 因污漬更顯眼且沒有消除週期而拒絕。
- [x] 選定候選完成效能、正式路徑與全 CS 回歸後本機登錄。

候選與契約：`run-20261004-v6-wall-material`、`contracts/wall-material-v6.asset-contract.json`。roughness-only 只增加 56 bytes，environment SHA `1dc36a21bdb7bf77b4302a14a44a1eb8ae6b63170b955b7684f40ca913cc7f82`。同機真頁高／低 p95 16.7／16.8 ms，最差 33.2／33.4 ms；八組 fixed p95/worst ≤16.8 ms、draw/triangles 不變。全 CS 34 通過／96 平台略過／0 失敗；實際 URL 留九視角、13 個 HTTP hash 與 build 輸出一致。`verification-wall-published.json` 記錄 source hash 未變，因此沿用前次 1,277 unit 與 tsc，另有三項 offline material RED/GREEN。這是經 A/B 接受的美術調整，不是物理粗糙度測量，也未解決重複建築。

### 手部 checkpoint 9：先修正可驗證的形變與接觸

Checkpoint 8 獨立檢核為 REJECT：A 僅以手填 gap 與 edge connectivity 代替真 skin face；B 沒有 pinned Dirichlet、旋轉不沿父鏈且 .62 尺度比較錯；C 仍對 landmark 求解，之後又被 IK 改寫。原報告保留，拒絕判決在 `checkpoint-8-trigger/qa/independent-review.json`。

Root 改用可單獨測試的 NumPy/SciPy 工具。實際 831 vertices 與來源 hash 已抽驗；cp9 exporter 的反向 normal transform 已由 triangle positions 重算修正。Probe 的 runtime geometry 降為正確的 source-derived 宣稱：只有 root/author matrices 是 actual GLB import，不能把代數 roundtrip 當成實際 GLB mesh correspondence。

- [x] 真三角形 signed distance／solid angle、skin face 與 center 面向、全部 skin vertices 穿透 gate；9 個幾何反例及獨立有限 APPROVE。
- [x] 真 Dirichlet、階層 FK/LBS、same-scale strain，完整 digit coverage 與 per-vertex leakage；兩個 review 反例 RED→GREEN，獨立有限 APPROVE。
- [x] 原始 source 真網格證明 harmonic weights 深彎失敗；增加 seeds 仍不合格，拒絕證據保留。
- [x] bounded surface graph Laplacian energy 權重，exact pins、每骨 BVLS 收斂後 row normalize；明確不是 volume/cotangent FEM BBW。
- [x] 查到舊關節中心在 skin 外；以局部 solid thickness chord 校正，並要求兩側不同 seed、有限軸向/徑向與最近 digit chain。這仍是待視覺檢核的 anatomical candidate。
- [x] 量測同時報告壓縮：修正後 30° stress max/min=1.282/.730，60°=1.612/.478、80°=1.819/.343。60°/80° 不通過保守 reciprocal 1.8 gate，因此 QA exit 1，未宣稱權重或握姿可發布。
- [x] 新手部工具群 34 個測試通過（`tmp/cs-v6-validation/hand-v9-green.log`）；來源製作環境為隔離 `tmp/cs-solver-venv`，不改網站依賴。
- [ ] 實際五指 skin patch + whole-hand penetration 的 bounded pose solve；真正 objective calls 包括 numerical Jacobian，最多 1,200 次，convergence/bounds/接觸/雙向 strain 任一失敗即拒絕。
- [ ] CPU 多角度手部診斷、握姿獨立檢核、實際 GLB correspondence、其他 weapon components／self-collision、真 renderer 及效能驗收。

截至本段沒有新的手部 GLB 進 runtime；遊戲維持前述 wall/sky/aim 已驗證版本。整體 CS2 品質目標保持 active，未重跑或修復歷史全站 E2E 失敗。


### Checkpoint 9：尺寸、碰撞與握姿診斷

以下是離線候選的歷史結果，均未核准為遊戲資產。每次 solve 保存 source bytes、模組、權重、參數與 SHA；後續程式修正不改寫舊結果。

| 診斷 | 方法／尺寸 | 結果 |
|---|---|---|
| pose-solve-v1 | LBS／.62／1,200 calls | edge ratio .385963–1.626705；未收斂，REJECT |
| pose-solve-v2 | LBS／.62／修正關節中心 | edge ratio .447192–1.587310；掌心 gap 26.01–27.64mm，REJECT |
| scale-probe-0850 | DQS／.85／400 calls | 六處接觸通過；edge ratio .535626–1.691234，REJECT |
| scale-probe-0925 | DQS／.925／400 calls | 六處接觸通過；edge ratio .536579–1.691219，REJECT |
| scale-probe-1000 | DQS／1.0／400 calls | edge ratio .437070–2.359406，握把穿透 2.075mm，REJECT |
| guard-ordering-0850 | DQS／.85／600 calls | weapon proper crossing 22→0、自交 132→0；仍有 strain／proxy／收斂失敗，REJECT |
| pose-prior-0850 | 同一 warm start／600 calls，僅增加 8 DOF prior | 接觸通過、proper crossing 0／0，但深 U 拇指沒有改善，REJECT |

三尺寸 CPU 圖經獨立視覺檢核，只選 .85 作下一個診斷基線；沒有批准任何尺寸。舊 .62 把原約 205mm 手長縮為 127mm，已排除。

- Actual imported GLB 的 trigger 68／grip 284 個三角形，已逐面與 source-derived 座標核對：全部唯一對應、最大頂點誤差 0。這不代表 hand bind／export 已驗證。
- Actual weapon proper crossings 在 .85／.925／1.0 分別為 22／33／49 records；非相鄰手部自交為 132／141／109。原始手網格同檢查為 0。.85 的槍體交叉位於護圈後段，沒有據此宣稱 receiver 穿面。
- 五個保守碰撞 hull 取自 imported receiver／guard 的來源 component，各自閉合，不把 trigger 開孔整體封住；source SHA 與完整 proxy set 已加反例測試。
- Finger ordering／spacing residual 只是軟約束。Proper-crossing 診斷不涵蓋共面重疊、完整包含或連續三角面穿透，零 records 不是資產通過。
- guard-ordering 最低 edge ratio .5479766、guard proxy clearance −.3225mm，仍不符 reciprocal 1.8／−.25mm 門檻。
- pose-prior 保持同一 .85、warm start、bounds、600-call 上限及硬門檻。thumb PIP／DIP 約 1.4、twist −.5，仍貼角度上限；最低 edge ratio .5479304。獨立視覺 A/B 確認沒有可辨識改善，停止調 prior／penalty。
- 1,755 個自然拇指姿勢的 bounds 內粗網格，沒有找到同時滿足接觸與全手穿透條件的候選；它只是固定 base 診斷，不是 optimizer 收斂證據。

目前離線 v9 工具為 60 tests／0 fail／0 error，證據在 `tmp/cs-v6-validation/hand-pose-prior-v9-green.log`。DQS 已實際接入 solver；舊 snapshot 仍保留當時模組 bytes。下一步先核對實際拇指 landmarks／骨長，不能只憑 MCP／PIP／DIP 名稱斷言缺少 CMC 關節，也不再重跑同一全手 600-call 路線。

A 區建築的獨立檢核另指出：現有 Fort gate 是真開口，不能直接貼到不可通行邊界，造成假入口。只繼續檢查既有授權來源的封閉模組；尚未建立或發布新立面。

截至此紀錄，新手部與新立面均未進 runtime。遊戲維持已驗證的 wall／sky／aim 版本，整體 CS2 品質目標未達成。

### 拇指彎曲軸 A/B 與來源骨架檢查

來源 face 616 的指腹法線在兩個末端骨頭的橫截面內，與目前彎曲方向相差約 50°。新增離線 hinge helper 先以既有固定 +X 行為重現 4 tests／3 fail，再轉為 v9 全 64 pass；獨立 consultant 只核准 basis／方向／Euler 數學，沒有批准解剖或姿態。

`thumb-hinge-grid-v1` 對原 +X 與指腹對齊軸各測同一組 1,755 個自然 flex 網格，固定 base、其他四指、尺度與 bounds，28.25 秒完成，未跑 optimizer。接觸排名的最佳 cost 40.406→14.209，但各取前六名做全幾何 QA，對齊軸仍有 7.70–11.21mm 握把穿透；不能發布。排名沒有全手穿透項，因此這個結果也不能證明所有 1,755 個姿勢皆無解。完整網格、來源 bytes／hash、參數與限制保存在該 report；inputs drift 檢查通過。

停止把新關節數量或重跑全手求解當成預設下一步。另檢查作者正式釋出的 CC0 WRAD ARMS 骨架，僅作既有人工作品的 rig 參考；其 retro 外觀未批准為遊戲素材。契約為 `hand-rig-reference-v6.asset-contract.json`，所有來源固定 commit，runtime publish 保持 false。

### 上半身受擊與首次 shader 準備

- 受擊改為以來源髖部 `(0, 1.02, .016)` 為支點，上半身、手臂和槍共同反應。雙腿留在 actor 根節點，不再被整體傾斜帶動；沒有新增 mesh 或 draw call。先取得兩項失敗測試，再通過全部 1,279 項單元測試。
- 真 `stepMatch` 產生 36 damage 非致命命中，實際 GLB 的站立／行走腿矩陣不受 hit strength 影響，雙手相對槍矩陣維持一致，恢復及四武器切換檢查通過。圖片、影片、source hash 與有限獨立 APPROVE 在 `run-20261004-v6-soldier/qa/reaction-candidate-v1/`。這不代表完整角色動畫或手部握姿已通過。
- 同 Intel D3D11 本機 gameplay 最初仍有轉視角 50–67ms 尖峰。長任務與 CPU profile 指向 `WebGLProgram.onFirstUse / getProgramInfoLog`；真 GLB 回歸測試另證實角色布料、橡膠及手槍三種 program 在進戰鬥後才建立。
- `preparePrograms()` 在載入階段以來源 soldier／四種 weapon 編譯 HDR、direct、shadow 與第一人稱 lighting variants；同步完成並在 finally 恢復 render target／shadow 設定，不新增非同步 dispose 競態。初始 RED、三項 GREEN 與診斷都保留在 `tmp/cs-v6-validation/`。
- 修正後非 CPU-sampling gameplay：high 623、low 619 samples，p95 16.7／16.8ms，兩者最慢 16.8ms，沒有 >25ms frame 或 long task。證據 `run-20261004-v6-motion/qa/gameplay-shader-prepare.json`。只代表這次約十秒／模式的本機操作樣本，不能推論所有硬體、長時間遊玩或整體品質已達標。
- 最終驗證：116 files／1,279 unit pass；CS browser 35 pass、100 platform skip、0 fail／flaky；targeted TypeScript 與 build exit 0。首次全 CS 回歸的暫停測試讀到未同步 HUD 彈藥，修正 test-only 觀測為同一 paused Match 的實際數值，再等待 HUD 同步；正向換彈與暫停取消各兩次通過，完整套件重新通過。原失敗未刪除。完整來源、資產 hash、HTTP 200 與 build output 對照在 `run-20261004-v6-motion/qa/verification-shader-prepare.json`。

### 封閉立面兩輪拒絕與路線停止

- `run-20261004-v6-closed-facade` v1：刪除整張宿主面卻未覆蓋側邊與上方；重新匯出還漏掉 19 種既有 tint，造成全景褪色。獨立 REJECT，未發布。
- `run-20261004-v6-closed-facade-v2`：材質經獨立 binary 比對確實恢復；但 `y_high` 從 `cy0` 起算，把中央宿主整面補回。overlap=0／pass=true 是常數，coverage green 無效。即使只修成 cy1，source 城垛頂部約 63% 投影覆蓋仍會露出空腔。
- v2 的 texture reuse 是現有 architecture 的 256px JPEG82→WebP90 衍生圖與 normal scale .55，不是完整 1K 近景品質；7,598,172 bytes 雖比 public 少 42,764 bytes，不能取代美術驗收。
- 兩輪真 renderer 圖與獨立拒絕紀錄皆保留。停止第三輪「完整宿主貼單片 wall」微修；後續若沿用此來源，須重新定義獨立 perimeter segment／完整 backing、trim、真 silhouette coverage 與近景 texel 要求。public environment 保留已驗證版本。

整體 CS2 品質目標尚未達成；手部、角色完整動畫與新建築組裝仍有未完成要求。未 push 或部署。
