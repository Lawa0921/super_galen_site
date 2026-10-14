# CS V7 周界、角色來源與持續效能

本輪延續使用者的單人、CS2／CS:GO 寫實風格、命中／受擊回饋、hitscan＋後座力／散布與曳光需求。完整品質目標保持未完成；局部資產、測試和幀率不能代替整體驗收。唯一美術方向仍是 `../specs/2026-10-03-browser-cs-design.md`。

## 有限範圍與驗收

1. A 區西側一棟重複住宅，改為完整的官方 CC0 石牆模組。移除 `building('perimeter_west_1')` 當次產生的全部物件，不能留下原宿主外殼或裝飾。保留原牆厚度、高度與城垛缺口，只將長軸伸至 8.2m；不增加碰撞體、不改動線。
2. 保留原 24 材質全部語意與嵌入圖片 bytes，四片地面、兩片塔材質網格、九個碰撞體的 logical streams 必須一致。新增石牆使用兩個獨立來源材質與 1K 貼圖。預算為原場景加 8,000 triangles、最多 35 draws、加 2.5 MB。
3. 專用真 renderer 拍攝正面、近景、兩側接縫、沿牆斜視、天際線及玩家視角，另有六秒沿牆移動。相機位置必須通過 `canStand`。獨立審查與效能通過後，才可替換本機 runtime。
4. 新增真頁面 120 秒／畫質的連續實戰量測。透過鍵鼠與原遊戲流程購買、開火、換彈、死亡／回合結束及重新開始；不修改生命、AI 或計時器。分開報告 live、buy、round-over 等狀態，記錄長幀與繪圖資源，不把觀戰／結算時間混成存活操作成績。
5. 角色另走正式 MakeHuman／MPFB 來源查驗：僅取得正式來源、核對授權與實際 mesh／UV／貼圖／骨架資料。不安裝未知 addon、不接入 runtime、不重跑舊手部 solver。來源通過只代表可製作下一個候選。

## 可追溯版本

- 周界 worker commit `609765a3014a67b60aa3dd15621357a735cfe919`，主樹整合為 `a34fb8f1`。
- 候選 SHA `f81726b730da62009562c563791bd6bb0f9b18f5e8a70c84c87a0abb29f8f610`，9,675,560 bytes／75,368 triangles／35 draws。
- 固定 baseline SHA `1dc36a21bdb7bf77b4302a14a44a1eb8ae6b63170b955b7684f40ca913cc7f82`，保存於 V7 run 的 `raw/baseline/environment-accepted.glb`；build／QA 讀取前驗 SHA，不讀會變動的 public 資產作比較。
- 三個 QA 反例測試：舊宿主殘留、三角形 bounds 完整但內部有孔、同名材質但嵌入圖片 bytes 改變。root 實跑 3 tests／0 failures；offline 17 checks 全部通過。
- 真 renderer 證據：`runs/run-20261004-v7-perimeter-review/qa/{baseline,candidate-v1-resolved}/`。初次輸入檔名拼錯而未啟 browser，失敗紀錄留在 `candidate-v1/capture.json`。

## 持續效能證據與限制

`profile_cs_soak_v7.mjs` 記錄實際載入的程式與模型 SHA、硬體、buffer 尺寸、每秒資源數、狀態切換與射擊數。baseline 高／低各 120 秒；存活樣本最差 16.8ms。高畫質購買階段曾出現 33.4ms；低畫質回合結束曾出現 116.8ms。這筆尖峰沒有對應 Long Tasks API 事件，尚不能斷言是 shader 或 JS 根因，也不能宣稱所有切換均流暢。

第一次候選 soak 因 QA 腳本在 engine 切到 buy、HUD 尚未顯示的 80ms 期間讀取按鈕位置而中止。已等待可見按鈕再讀位置，原報告保留於 `run-20261004-v7-performance/qa/perimeter-v1/report.json`；這是驗證工具問題，未修改產品行為。修正後量測另存 `perimeter-v1-recovered`，不覆蓋失敗證據。

本輪仍不代表角色解剖、完整骨架動畫、所有建築近景或整體 CS2 品質通過；沒有對外部署授權。

## 本機整合結果

- 完整石牆通過獨立幾何／視覺檢核，固定 baseline 與 SHA guard 已由 `cf3c7965` 入庫。候選已本機發布；13 件資產共 18,369,609 bytes，public、dist/client、.vercel/output/static 與 HTTP 全部核對。`published-final` 七張截圖直接讀 public，沒有路由替換模型。
- 首次受擊尖峰以 fresh Chromium process 做單因素拆分：原 inset blur 100.1／99.9ms，只加 compositor 83.3／83.4ms，隱藏紅暈 16.8／16.8ms。改固定 radial-gradient、僅動畫 opacity 後，真 runtime 33.4／33.4ms。兩 trial 的有限因果證據指向 blur 成本；未排除 driver cache，也未量測 CSS layer 記憶體。
- 同新石牆＋新紅暈的真頁高／低畫質各 120 秒，RTX 5090 Laptop D3D11，p95 皆 16.7ms、最差 33.2／16.8ms；高／低共 990／1,075 發，無超過 50ms 幀，無 page errors。保留每狀態統計，不將觀戰或結算樣本冒充存活射擊。
- 完整 unit 116 檔／1,279 通過；CS suite 35 通過、100 平台略過、0 失敗；build exit 0。HUD 截圖先確認生命已更新再等紅暈 200ms 淡入，以免 80ms HUD 節流造成舊生命值截圖。最終集中證據為 `runs/run-20261004-v7-performance/qa/verification-perimeter-gradient.json`。
- 正式 MakeHuman 五個來源包、42 個使用中來源檔與授權已入庫，root 重跑六項來源測試通過。gloves1 的包頁 CC0／檔頭 AGPL 衝突已隔離；其餘候選仍未組裝進 runtime。

## 下一個有限工作包：正式骨架角色候選

獨立 `feat/cs-v7-character-rig` 工作樹以 MPFB v2.0.17／commit `80919fa4682335c41847f761a4d79dcad4124732` 為固定來源。先查原始程式與授權，在隔離 Blender 設定目錄以 `--factory-startup --disable-autoexec` 驗證 hm08 base、GameEngine rig 和 weights，通過後才擬合一套服裝與手套，輸出全身與前臂 review GLB。此包只修改自己的新來源、契約、候選和 QA；不改 public、renderer、manifest，也不重跑舊手部 solver。

候選驗收包括 UV、有限值、skin/joints、正規化權重、關鍵手指骨、rest 對稱、材質引用、實際三角形／draw／bytes 與可見穿模。原始 126K triangles 套裝不是 runtime 預算；人體、握姿和真 renderer 效能未通過前保持 `runtime_publish_allowed:false`。整體目標持續進行。

### 骨架接入前已確認的程式契約

`presentation.ts` 現在透過 `source.clone(true)` 複製剛性角色，以 `left_leg/right_leg/left_arm/right_arm` 節點及硬編肩軸驅動，並會重新掛接名為 `head` 的節點；`renderer.ts` 的第一人稱槍械也直接 clone。這些不是新 GameEngine skin rig 的相容介面，不能只把新 GLB 複製成 soldier.glb。後續接入須以實際 skin 資料測試每個角色骨架獨立、休止姿勢、骨節驅動、武器掛點和資源釋放，避免原剛性 reparent 邏輯破壞骨架。來源候選工作包不修改這些行為。

### 骨架候選與瀏覽器診斷

MPFB 固定版本已能在隔離 extension 設定下建立 hm08／GameEngine 53 骨架。第一次直接 addon 載入曾在全域 Blender 目錄建立四個設定／空 log 檔；worker 保存時間與 SHA 後回復本輪新增項，正式 extension 路徑已轉為 worktree。此副作用與隔離證據由 rig run 保留。

來源 `.blend` 的 body Mask 起初未進 GLB：27,300 triangles 與已評估 8,860 triangles 不一致。改以複本套 Mask、保留 Armature 後相符。預覽圖另有白名單名稱錯誤而隱藏整個 body proxy，頭部本身沒有被刪除。兩者皆不能只靠「有限值／權重通過」發現。

真 GLB 透面則來自全部材質使用 BLEND：GLTFLoader 同時關掉 depthWrite。只在 capture 設 transparent=false 的對照不足，已保留為失敗診斷；現行工具 `capture_cs_character_rig_v7.mjs` 禁止材質覆寫，只接受獨立 GLB 候選。最終 material-only 候選 `1c5be30bbb2a804242490662d32b2f8fe4074e6a853ee493511fe5b7b3ca60ce` 將四件實心材質改 OPAQUE、背心／靴改 MASK 0.5；root 核對 BIN 逐 byte 相同，獨立審查六視角確認 alpha／depth 顯示修復通過。證據在 `run-20261004-v7-character-browser/qa/independent-alpha-review.json`。

整體角色仍未通過：眼睛部件缺失、背心／衣物與袖口／手套、褲腳／靴穿插，紅色醫護服與超級英雄手套輪廓不符合方向。未替換任何 runtime 模型，也未把修正材質當作美術完成。

下一個已登錄來源包為 commit `b61cda6b`：`character-kit-source-v7.asset-contract.json` 與 `run-20261004-v7-character-kit-source`。由同一份 SHA 已固定的官方 CC0 ZIP 提取 20 檔，包含深色長袖／褲裝 `male_casualsuit01`、高／低眼睛和棕色材質、牙齒與舌頭。16 個依賴引用及五組 hm08 mapping／OBJ 頂點對應通過；沿用工具六個測試通過。只作配戰術背心的中性服裝與完整頭部候選，不宣稱是已驗收軍裝。原始檔保留上游空白以維持 ZIP bytes，格式檢查只針對新撰 JSON。

大型掩體的有限 CC0 搜尋也保留在 `run-20261004-v7-cover-source/qa/initial-source-assessment.json`。四個木箱來源實際都是低矮長箱，不能用網頁整組寬度推論能替換 3×3×1.6m 掩體；未製作或發布失真拼合方案。

## Bounded model ownership preparation

The new character is still candidate-only. Before any skin-based actor can enter gameplay, model cloning must isolate actor bones, materials and bone palettes while retaining shared geometry/textures. Preserve same-source skeleton/material sharing within each instance. Split instance removal from renderer-owned asset shutdown; cover held and first-person weapon replacement. This does not adapt aiming, locomotion or weapon grip to the new rig.

Root reproduced five failing clone/replacement tests, followed by two failing final-shutdown regressions, before the respective fixes. Tests must observe a moved skinned vertex in one instance with another instance/source unchanged, independent bone textures, transformed imports, shared materials, forty replacements, and final once-only asset disposal. Validate actual frozen rig GLB through GLTFLoader separately, then run full unit, CS browser suite and build. Old shader-preparation, gun animation and hit/hurt tests remain regression gates.

### Field-outfit and clone ownership checkpoint

The frozen rig package was integrated as 9ac4b73d, the field package as 11fa3da2. Root reran 8 rig QA tests and 4 field QA tests, inspected both real GLBs, and reverified all 34 field source files. Field AE2116 adds complete eyes/teeth/tongue and civilian long sleeves but remains rejected: independent six-view GLB review finds severe vest/shirt and trouser/tall-boot intersections. Its independent report is kept beside field-v1-source-alpha captures. Official CC0 shoes04 low-cut black footwear source was integrated as 1c51faad: seven byte-exact archive members, five references (including .mhw), 1,722 source vertices and 3,320 triangles. It is not a fitted runtime shoe yet.

The next isolated worker package owns only new character-fit-v7 builder/QA/contract/run paths: evaluate this compatible shoe silhouette and one bounded source-geometry vest separation, retain untouched source/UV/weights and failed versions, test ankle/arm poses, and avoid more than two unaided visual iterations. No runtime publication or source rebranding as military gear.

Model ownership code passed 117 unit files / 1,286 tests and build exit 0. Actual GLB deformation proves separate actors and private bone palettes. Native GL sampler tracing identified the one retained post-disposal texture as Three's module-global dfgLUT (16x16 RG16F), not any of the eight character maps or two bone palettes. The earlier null-shadow hypothesis was specifically disproved by shadowAllocated=true with the same retention. E2E mirrors production shadow refresh and asserts exactly one known retained LUT. The first complete CS run had 35 passes / 104 platform skips and one cancellation-fixture startup timeout; isolated instrumented recheck passed both cancellation and failed-asset cases. Final complete CS rerun passed 36 tests / 104 platform skips / 0 failures; the first timeout remains unexplained and recorded. This is not full-site E2E acceptance.

Latest model-ownership-final soak completed 120 seconds per quality on RTX 5090 Laptop / D3D11: high 7,212 frames and low 7,215 frames, worst 16.8ms each, no frames over 25ms, errors empty. All 18 input hashes and the capture script snapshot were reverified. Geometry/texture counts grew during gameplay; this is not a zero-allocation claim or a measurement of the unpublished skinned candidate.

### 貼圖預算有限工作包

以 sock-trim 固定候選 `09b21c722e861aa84418b7d58f9b3bb305d78add79d44fb597f5a89887b53a39` 為輸入，僅降採樣嵌入 PNG 至最大 1024。色彩以 linear-light、premultiplied alpha 處理；normal 以向量平均後正規化。原圖、材質語意、骨架、權重與全部非圖片 bufferView bytes 保留。先以合成資料測試成功與拒絕案例，再對真 GLB 比對六視角、alpha coverage、檔案大小與 RGBA8 mip payload 估算。保持 candidate-only，不將此改善當作背心穿模、骨架動畫或 FPS 已通過。

結果：全 1K 版本因背心 MASK coverage 超差而拒絕，未放寬門檻。第二版只讓背心 baseColor 維持 2K，SHA `db60715e8ae73e0ffe13533f1b9d5e03c11a85957cafb8eda19d12fee09718ce`，16,847,072 bytes，較來源減少74.24%；43非圖片views不變、四張1024來源圖byte-exact，coverage與normal通過。獨立20張 before/after 圖比較通過；牙齒僅atlas/alpha、沒有張口渲染。40角色工具測試與1286完整unit通過。只批准貼圖候選交接，衣物與動作未通過，runtime不變。
