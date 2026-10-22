# Browser CS art bundle

## V37 灰泥牆近景細節

`runs/run-20261010-v37-plaster-detail/`：三個灰泥牆材質（sunbleached／ochre／aged_sand_plaster）原本共用一張低對比 1k 貼圖（albedo std≈7/255、roughness 幾乎常數、normal ×0.55、512 px/m）。加入 Poly Haven CC0 `white_stucco_02` 高通灰泥顆粒 detail（1024²、0.9m 一格、1138 px/m，放在 occlusion 槽 + KHR_texture_transform），由 `src/scripts/games/cs/plaster-detail.ts` 在 shader 中疊加顆粒法線／腔體、世界座標低頻色差與反重複、牆腳髒污高度漸層及雨痕。GLB 只改 JSON（BIN byte-exact），draw call 不變，+597,463 bytes。cook：`source/cook_cs_plaster_detail_v37.mjs`；同鏡位截圖：`source/capture_cs_plaster_detail_v37.mjs`；契約：`contracts/plaster-detail-v37.asset-contract.json`。被拒候選在 `rejected/`。人審 pending。

## V37 投擲物（HE／閃光／煙霧）

`runs/run-20261010-v37-grenades/` 由既有已登錄的 3DModelsCC0「Guns & Explosives」CC0 包（rar SHA 與 V3 相同）取出 FragGrenade／Flashbang／Smoke_Grenade，保留作者幾何、UV 與 PBR，貼圖 512 WebP，輸出 `public/assets/games/cs/grenades.glb`（671,952 bytes，三節點各含獨立 `_pin`）。HUD 圖示 `hud/{he,flash,smoke}.webp` 是同一 CC0 模型在 Blender 確定性渲染的透明衍生圖，不含文字。契約 `contracts/grenades-v37.asset-contract.json`，轉檔 `source/convert_cs_grenades_v37.py`、優化 `optimize_cs_grenades_v37.ps1`、機械 QA `qa_cs_grenades_v37.py`。煙霧／爆炸沿用已核准的 V5 FX 貼圖（dust、muzzle-flash），沒有新增 FX 貼圖。

實機畫面 `capture_cs_grenades_v37.mjs <label>`（真 renderer＋真引擎物理），成本探針 `profile_cs_grenades_v37.mjs <label>`。最終截圖在該 run 的 `qa/`；人工美術審核 pending。整包上限改為 34 MB（見 `docs/games/breach-point.md`）。

## V33 人物與第一人稱手臂

`runs/run-20261008-v33-character/` 的 53 骨全身人物與四把武器的 48 骨第一人稱手臂已接入本機遊戲，保留 Blender 來源、原資產、授權、獨立檢核及發布雜湊。目前 public 為人物 stage7（授權眼鏡、眼部 alpha 修正及頭盔 coating），手臂仍為 stage5。Stage7 的 1,496 個 unit、47 個相關 Chromium 測試與 build 通過；完整紀錄在 `qa/verification-stage7.json`。`qa/preview.html` 提供實機圖片、換彈影片及目前限制。

最近完整操作覆蓋的 stage6-world 高／低畫質各 120 秒原生背景量測，P95 22.8／12.4 ms，最長幀 221.2／30.3 ms；兩者均涵蓋玩家、觀戰及下一回合，效能仍未驗收。這不是 stage7 材質的效能證據。現行 CS runtime bundle 為 31,833,840 bytes。整體 CS2 品質目標仍未完成，未對外部署。

新版 bobeer CC BY 4.0 結構手套仍在候選區；G 的手部接觸通過取樣檢查，但袖口外觀尚未接受，N 的新接縫原型也因動畫穿插而拒絕。不可將預覽候選視為 public。舊袖口腳本的 496 個樣本因 dt=0 沒有推進動畫，動態覆蓋聲明已撤回，詳見 `qa/reload-audit-correction.json`。

胸甲候選 D 提供 `qa/carrier-preview.html` 同鏡位比較，保留可編輯護板袋、肩帶、彈匣袋，新增按衣物量測的連續腰帶／側腰圍及薄織帶。模型為 39,496 tris／12 primitives／53 bones、3,914,836 bytes。來源保存與 28 張實機動作視圖通過，但 360 姿態接觸檢查失敗：插值位置與權重後的新頂點，不能精確跟隨原衣物變形，最大差 16.54mm。C/D 均拒絕放入 runtime；資料與獨立檢核在 `qa/carrier-surface-fit-review.json`。

另做腰帶單件 E：改沿 public 衣物原三角面裁切、使用實際匯出權重、修補三處小接縫孔。360 姿態對衣物的 gap 為 1.37–4.40mm，交叉穿插為 0；但靜態自相交 81 組，擴充動作檢查也失敗，因此同樣未發布。不能把單項 garment contact 通過當成整件驗收。E 的 39,869 tris／12 primitives／31,907,356 bytes 是候選預算，public 仍為 stage7。14 個離線工具測試與比較頁 8 項操作通過，未改動產品程式／public，也沒有新效能改善聲明。下一步需重新建構衣物與護具共用的接縫拓撲，停止 C/D 的插值外推及 E 的通用補孔路徑；證據見 `qa/waist-facets-e-review.json`。

## V32 城市延伸與建築細節

目前本機環境來源為 `runs/run-20261008-v32-city-extension/`。第一圈建築外退 8m，加入外街地面、四角返回立面、後排樓房、倒角石柱、鐵欄與窗戶五金。活動範圍仍是 48 × 56m，視覺地面延伸至 168 × 176m；子彈與 AI 共用 `city-surfaces.json` 的外景表面，薄裝飾不作精細碰撞。

`raw/city-kit.blend` 保留 35 個 collection assets／79 個 linked instances；作者零件與場景配方在 `raw/city-source.json`，`source/author_cs_city_v32.py` 建立來源，`source/cook_cs_city_v32.py` 做 ownership 遷移、屬性保護與合批。環境為 143,354 tris／32 primitives，零新增貼圖；17 個 runtime 檔案共 26,887,061 bytes。來源、候選、拒絕原因、雜湊與測試由本次 `manifest.json` 串連，封存入口為 `source/record_cs_city_v32.mjs`（`.py` 保留相容入口）。

144 檔／1,474 unit、382 Python、59 CS Chromium E2E、9 項工具回歸及 build 通過。`qa/preview.html` 有 15 個玩家視角及前後比較，`qa/preview-verification.json` 記錄實際開啟與 25 張圖片載入。Astro 本機開啟非 public 的比較頁須使用 `/@fs/` 加上該檔案的絕對路徑。

`qa/gameplay-native-final/report.json` 是 Intel Graphics／D3D11、1440×900／DPR1、各 240 秒的原生背景操作量測。高／低 P95 為 24.9／16.8ms，但最長幀仍達 733.4／604.1ms；重複緩衝區配置已修正，持續慢速區段的根因尚未完全查明。`qa/review.json` 保留首次超標、對照、環境中斷與無效樣本，不宣稱 FPS 保證或優於 V31。本機接入已完成，使用者美術審閱仍為 pending，未對外部署。

## V31 模組化製作入口

地圖新增資產採用「授權來源 → 局部座標零件庫 → 接點／prefab 配方 → 場景配置 → 靜態匯出」流程。來源零件保留在 Blender Collection Assets；GLB 是匯出結果，不從合併後的 `DETAIL_*` 反向切割成假零件。唯一美術風格仍由 `profile.json` 的 `style_source` 指向。

第一個切片在 `runs/run-20261008-v31-modular-assembly/`，含四個 CC0 城牆／拱門零件、`raw/kit-catalog.json`、`raw/west-wall-prefab.json`、`raw/west-wall-scene.json` 及可編輯 `raw/architecture-kit.blend`。接點方向、共同 uniform scale、來源 SHA、PBR、實際網格與碰撞用途均有檢查。拱門尚未驗收為可穿越門洞；沒有新增 LOD。

- `source/build_cs_kit_v31.py`：由固定來源與配方生成 catalog、獨立 kit GLB 和候選 environment，僅寫本次 run，不直接寫 public。
- `source/author_cs_kit_library_v31.py`：Blender 背景建立 Collection Assets／linked instances，重開後核對位置、矩陣和 socket 方向。
- `source/capture_cs_kit_v31.mjs <唯一標籤> [候選GLB]`：背景使用真 renderer 檢查七個玩家鏡位。未指定候選時讀取 public 原生資產。
- `qa/preview.html`：查看零件庫、原生長牆組件及前後比較。兩片短牆的方案因黑縫被拒，完整保留在 `rejected/two-short-walls/`；數學接點對齊不能取代美術驗收。

碰撞的現行來源是 `src/scripts/games/cs/map-data.json`，此 cooker 由它產生完整 snapshot；歷史 `contracts/collision_bounds.json` 的九障礙快照不可當作目前完整地圖。這次只遷移西側城牆；其他建築家族、武器與骨架角色依 [模組化設計](../../docs/superpowers/specs/2026-10-08-cs-modular-assembly-design.md) 逐步遷移。

本機已接入原生 16m 長牆 prefab，環境 83,734 tris／32 primitives，增加 38,620 bytes、不增加貼圖；全部17項 runtime 檔案共22,535,997 bytes。`qa/verification.json` 記錄375 Python、142檔／1459 unit、60項CS Chromium E2E及build通過；首次 unit import timeout與pause HUD測試競態的失敗證據保留，pause測試先等待既有80ms HUD更新再檢查凍結，不改runtime邏輯。全站跨瀏覽器E2E未跑。

`qa/performance-summary.json`：Intel Graphics／D3D11，1440×900 viewport／DPR1，完整Chromium背景高低畫質各180秒，均覆蓋存活、觀戰與下一回合；RAF p95為18.2／11.7ms，最差52.4／23.8ms。這是特定裝置的callback間隔，不是實際螢幕FPS，也不是受控基線效能提升。`qa/preview.html`可看零件庫和同鏡位比較；來源`.blend`可下載編輯。只在本機發布，人審待使用者查看，未對外部署。

## V7 ????????

`runs/run-20261004-v7-character-fabric/` ?? built-in imagegen ????????????????????????????????????????????????????source?full ????? diffuse ??? UV ???58 ??? bufferView?????????normal ???? alpha ???????????? 1254? ?? 2048????????????

?????? 69.87 MB??? budget ? 17.33 MB?? 75.2%??????????? baseColor 2K????? 1K?27 ? before/full/budget ? GLB ?????????????????????????????? runtime ???61 ??? Python ?????? 11 ???118 ??1295 ? unit?build ????? hash ???? `qa/verification.json`??????????human review pending?runtime publish false?

## V7 完整骨架 pose 基礎

`skin-rig.ts` 已提供顯式 opt-in 的53骨控制層，保留父链、獨立實例與來源資料，將來源 +Z 透過非 Bone visual layer 對齊遊戲 -Z。完整姿勢從 rest 一次重算，無效輸入整批拒絕。此 API 尚未接入 presentation；步態、持槍、瞄準及受擊 channel 仍待完成，不能將有限 pose 截圖稱為正式動畫。

`runs/run-20261004-v7-skin-pose/qa/verification.json` 保存9項新骨架測試、完整118檔／1295項unit與build成功證據。真正DB607角色的全部頂點檢查顯示位移0.22950m、重複／復原／其他角色／原始來源誤差0，53骨parent不變；獨立五圖檢查無新增skin撕裂或鞋踝斷開。既有服裝穿模仍不因本次局部通過而批准。後續衣物另試正式CC0短袖上衣／深色褲，靜態和有限姿態仍需獨立判定。

## V7 候選角色貼圖預算

`runs/run-20261004-v7-character-textures/qa/verification.json` 記錄純貼圖候選驗證。新候選由 65.41 MB 降至 16.85 MB（約 74%），43 個非圖片 bufferView、骨架和材質語意不變。第一版全 1K 背心透明孔洞超過既定差異門檻而拒絕；第二版保留背心 baseColor 2K，其餘上限 1K，通過 coverage、normal 與獨立 20 張圖片比較。來源保留，失敗版在 `rejected/character-textures-v7/`。RGBA8 mip payload 估算下降約75%，不是 GPU 記憶體或新角色 FPS 實測。

40 項角色美術工具測試、完整 117 檔／1,286 項單元測試通過。本包沒有改 runtime 程式或模型；先前 36 項 CS browser 通過及 build 證據的六份相關程式快照仍逐 byte 相同。新角色背心穿模與骨架動作仍未通過，貼圖包只批准作後續候選組裝，`runtime_publish_allowed=false`；完整 CS2 品質目標仍未完成。

## V7 角色隔離與資源釋放

`runs/run-20261004-v7-model-ownership/qa/verification.json` 記錄本機程式驗證。角色及武器複製後具有獨立骨架與材質，同一角色內保留共享的骨架／材質，geometry 和圖片仍共用。換槍釋放該實例的材質與骨架貼圖，結束 renderer 才釋放共用資產。新增七項測試先失敗再通過；完整單元測試 117 檔／1,286 項通過，build exit 0。CS 專項最終 36 通過、104 平台略過；第一次整組的載入取消測試曾逾時，已保留紀錄，加入診斷後單獨兩項與完整重跑均通過，未宣稱該一次逾時根因已修復。

真正 GLB 的雙角色檢核確認只有指定角色變形、兩份骨架 GPU 貼圖都可回收。剩餘一張 Three 內部貼圖經 native uniform tracing 確認為共用的 16×16 `DFG_LUT`，不是模型貼圖；先前 null-shadow 假設已被對照實驗推翻。`runs/run-20261004-v7-performance/qa/model-ownership-final/` 保存最新高／低畫質各 120 秒量測與腳本快照：RTX 5090 Laptop／D3D11，最差皆 16.8ms，均無超過 25ms 的幀；18 個程式／資產 hash 已核對。此結果不代表其他裝置或未接入的骨架角色效能。

角色 field 候選已補完整眼部、口腔與深色長袖，仍因背心／褲靴穿模而拒絕，維持 candidate-only。官方低筒鞋來源與相容性候選另在 fit run 檢查；未替換 runtime 角色、未對外發布。完整 CS2 品質目標仍未完成。

## V7 周界與首次受擊效能

最新本機驗證在 `runs/run-20261004-v7-performance/qa/verification-perimeter-gradient.json`。A 區西側整棟重複住宅已換成 Poly Haven CC0 石牆，保留原始城垛、厚度與 1K 材質；原 24 材質、15 個受保護節點和碰撞不變。固定 baseline 已入庫，候選與 runtime SHA 都是 `f81726b730da62009562c563791bd6bb0f9b18f5e8a70c84c87a0abb29f8f610`。真 public 的七視角與沿牆影片在 `runs/run-20261004-v7-perimeter-review/qa/published-final/`。

首次受擊的全螢幕內陰影改為固定漸層、僅過渡透明度。獨立 Chromium process 對照中，原版兩次最差幀 100.1／99.9ms，現行修正為 33.4／33.4ms；仍有長幀，不能宣稱完全消除。命中、受擊方向、輕重紅暈與 600ms 提示保留。原始量測腳本另以 `profile-source.mjs` 綁定報告 SHA。

同版本 RTX 5090 Laptop／D3D11、1920×1080／DPR 1.5 的真頁高／低畫質各 120 秒，p95 皆 16.7ms，最差 33.2／16.8ms，沒有超過 50ms 的幀；高畫質 buffer 1920×1080，低畫質 1280×720。這是特定裝置與路線的結果，CSS compositor 記憶體未量測。116 個單元測試檔／1,279 項通過；CS 專項 35 通過、100 依平台略過、0 失敗；build exit 0。13 個資產的 public、兩份 build 輸出及本機 HTTP SHA 一致。全站 E2E 本輪未重跑。

MakeHuman／MPFB 的正式來源已另存 `runs/run-20261004-v7-character-source/`，含套件與逐檔授權。授權衝突的 gloves1 不可使用；其餘衣物和手套目前只是來源候選，尚未替換角色或手部。整體 CS2 品質、完整骨架動畫與近景精細度仍未完成。預覽為 `http://localhost:4002/games/cs`；4321 屬於另一工作樹，沒有對外部署。

## V6 動作與光照（持續開發）

`runs/run-20261004-v6-motion/qa/verification-motion-lighting.json` 記錄本輪可核對的程式、測試與量測版本：四槍依實際換彈時長播放動作／機械聲，來源前綴零件可動，回合結果取消凍結姿勢，狙擊鏡每幀同步。viewmodel 使用世界太陽方向與九個靜態建築的近似直射遮蔽；它不等同 GI 或棚布細節陰影。

- `capture_cs_motion_v6.mjs <label> [candidate-directory] [weapon]` 可路由候選 GLB，不必先替換 runtime；留腰射、ADS、換彈關鍵幀及影片。
- `capture_cs_lighting_v6.mjs <label>` 留日照、轉向、建築陰影的真 renderer 畫面。
- `capture_cs_environment_v6.mjs <label> [candidate-glb]` 留出生、A/B、倉庫與地面畫面。
- `profile_cs_play_v6.mjs <label> [candidate-environment-glb]` 單獨跑真頁鍵鼠、AI、HUD 與音效；`profile_cs_v6.mjs` 為固定鏡位與人工 FX 壓力測試。不得同時跑其他瀏覽器或 Blender 重算。

V6 手部與前兩版自製地標皆被拒絕，未替換 runtime。手部第四輪已修復骨架與網格尺度不一致的形變，但指端接觸仍未通過。地面先採用 Poly Haven 鋪石，該歷史版本的 30 通過／80 平台略過、建置與真頁量測保留於 `qa/verification-ground-published.json`。機械／局部 QA 通過不代表 CS2 品質目標完成。

同版固定六人場景及六人同步射擊的 8 組高／低畫質量測已完成：Intel Graphics D3D11，每組暖機後 180 幀，p95／最差幀皆不超過 16.8 ms，21 個程式／模型／FX hash 與 runtime 相符。結果與 V5 對照在 `runs/run-20261004-v6-motion/qa/performance-review.json`；這是 renderer fixture，完整真頁操作仍以獨立 gameplay 報告為準。

後續本機版本已採用官方 Modular Fort 01 圓塔，取代 A 區後方方塔；環境為 76,290 tris／33 draws／7,640,880 bytes。角色兩腿支點也已修到髖部，保留全部 mesh／UV／PBR binary，4,120 tris／31 draws 不變。兩項都有獨立局部檢核，bundle hash 與本機整合證據在 `runs/run-20261004-v6-architecture/qa/published-bundle-integrity.json`；新真頁量測在 `runs/run-20261004-v6-motion/qa/gameplay-architecture-soldier-candidate.json`，高／低 p95 16.7／16.8 ms。前段 8 組固定場景報告是新增圓塔與髖部修正之前的歷史快照。

最新完整局部驗證快照是 `runs/run-20261004-v6-motion/qa/verification-architecture-pivots.json`：116 檔／1,275 單元測試通過、CS 瀏覽器 31 通過／84 平台略過／0 失敗、build exit 0；本版 8 組固定場景及特效壓力量測在 `performance-architecture-pivots.json`，p95／最差幀皆不超過 16.8 ms。HTTP 提供的環境與角色 hash 也與候選及 registry 相同。全站 E2E 未在本次局部資產修正重跑。

第五版 trigger-only 候選已修整手握把 frame，形狀與腰射／ADS／換彈畫面保留於 `runs/run-20261004-v6-motion/qa/rifle-checkpoint-5`。獨立檢核確認三項假陽性：食指與拇指使用相同 41 個取樣頂點、扳機 target 混入護圈、穿透深度只是常數而未測量，因此拒絕採用。第六版須先以互斥指端、唯一真扳機曲面及實際 signed clearance 重現失敗，再修握姿；不能沿用第五版機械報告中的 PASS。

第三人稱上下瞄準已修正：引擎 pitch 與垂直 recoil 同步到快取肩軸，保留雙臂／槍的相對位置，頭部有限跟隨。實際模型 RED/GREEN、上下瞄準／四槍切換畫面與獨立 review 在 `runs/run-20261004-v6-soldier/qa/aim-*`。最新程式驗證是 `runs/run-20261004-v6-motion/qa/verification-actor-aim.json`：1,277 unit、32 CS 通過／88 平台略過、build/targeted tsc 成功；真頁高／低 p95 16.8／16.7ms，fixed 八組 p95/worst 皆不超過 16.8ms。這仍是剛性模型的有限修正，未完成完整骨架、細緻握姿或 CS2 品質。

## V6 日間天空

其後另採用三種粉刷牆 roughness factor `.82` 的有限 A/B 結果：只有 GLB JSON 三個值改動，binary／幾何／貼圖不變，environment 增加 56 bytes、SHA 為 `1dc36a21bdb7bf77b4302a14a44a1eb8ae6b63170b955b7684f40ca913cc7f82`。相位平移版讓近景污漬更醒目，已拒絕。最新證據 `runs/run-20261004-v6-motion/qa/verification-wall-published.json`：34 CS 通過／96 略過、build 成功、13 runtime/HTTP/build hash 核對；高／低 p95 16.7／16.8 ms、最差 33.2／33.4 ms；runtime TS hash 未變，沿用已通過的 1,277 unit/tsc，另加三項素材工具測試。現行 bundle 共 16,334,985 bytes。這是視覺檢核接受的微調，不是物理校準或整體完成。

已本機整合 Poly Haven 的 CC0 `Kloofendal 38d Partly Cloudy (Pure Sky)` 1K HDR。保留來源像素，只旋轉背景對準世界光；實測太陽高度差 1.013°。原有 world/viewmodel PMREM 保持不變，替換環境照明的過暗方案與太陽高度不符的 Qwantani 來源都保留拒絕證據。來源、契約、全 360° 畫面與獨立檢核在 `runs/run-20261004-v6-sky`。

最新本機證據為 `runs/run-20261004-v6-motion/qa/verification-sky-published.json`：116 檔／1,277 單元測試、34 CS 瀏覽器通過／96 平台略過／0 失敗、build 與 targeted tsc 成功。13 件資產共 16,334,929 bytes；正式本機 HTTP、public、build 輸出的 HDR hash 相符。高／低畫質真頁 p95 為 16.7／16.8 ms，最差單幀皆約 33.3 ms；8 組固定場景 p95/worst 不超過 16.8 ms。效能限於報告的 Intel Graphics/D3D11 與採樣路線。

HDR 首次使用會做一次六面 cubemap 轉換；測試明確保留初幀 7 passes，後續 30 幀、resize 及切回低畫質均為單 pass，貼圖數保持不變。這項初始化成本不列為持續多 pass。手部 checkpoint 7 仍有穿透、接觸及局部拉伸失敗，未進 runtime；全站 E2E 本輪未重跑，整體 CS2 品質目標未完成。

## V5 戰鬥回饋與近景細節

本輪沿用同一份 CS2／CS:GO 舊城風格入口；使用者已選擇即時命中、後座力／散布與可見彈道。`runs/run-20261003-v5-detail` 保存新增門窗五金、遮棚結構、修正版手套／袖口、四槍 FX anchors，以及原創彈殼的 Blender 來源。`runs/run-20261003-v5-fx` 保存 image_gen 原圖、完整提示詞、透明 WebP 和 alpha QA；軟透明特效的例外契約在 `contracts/combat-fx-v5.asset-contract.json`。

- 建模：`build_cs_environment_v5.py`、`build_cs_viewhands_v5.py`、`build_cs_casing_v5.py`，配合相應 optimize／qa 腳本。手套只改 `view_hands`，保留授權槍身及原 PBR；每槍 `muzzle` local −Z 指向槍管前方、`ejection_port` local +X 為拋殼方向。
- 組裝：`node art-factory/cs/source/capture_cs_combat_v5.mjs` 留下四槍腰射／瞄準、日照／暗面／木箱／地面／敵人命中與分段 FX 截圖。這是受控 renderer fixture；真頁控制、命中 HUD、狙擊鏡、載入失敗及生命周期由 `playwright.cs.config.ts` 另驗。
- 效能：其他瀏覽器測試結束後，單獨跑 `profile_cs_v5.mjs`（六人固定鏡位＋60發／秒的人工 FX 壓力）及 `profile_cs_play_v5.mjs`（真頁、真 AI、鍵鼠轉向／射擊／換彈）。報告記錄 GPU、解析度、幀時間、繪製數量和實際程式／資產 SHA。
- 本機登錄：`python art-factory/cs/source/publish_cs_v5.py` 要求獨立視覺 review、capture、候選機械 QA、效能版本全部一致，才更新 registry 與 review queue；不對外部署。舊版 QA、拒絕理由及前一份 registry 保留在各自 run，勿用 V3/V4 publisher 覆蓋 V5。

戰鬥特效使用固定容量 Points／InstancedMesh／LineSegments；曳光只影響視覺，真實傷害仍是 hitscan。機械、程式、視覺、實玩與全站回歸各有不同證據，統一以 `runs/run-20261003-v5-combat/qa/` 的最終報告為準；機械通過不代表人體或特效觀感通過。

V5 最終本機驗證：114 個單元測試檔、1,258 項通過；CS 瀏覽器專項 26 通過、64 依平台略過，建置成功。Intel 內顯／D3D11、1080p DPR 1.5 真頁操作，高畫質平均 59.6 FPS、p95 16.7 ms，低畫質平均 59.7 FPS、p95 16.8 ms；兩者最差單幀約 66.7 ms。第一輪固定鏡位的 720p 低畫質曾有 966.7 ms RAF 停頓，840 幀獨立複測未重現，原始資料保留，原因未確定。全站 2,200 項結果為 1,886 通過、160 失敗、148 略過、6 未執行，不能宣稱全站全綠；詳細版本限制見 `qa/verification.json`。12 件 runtime 資產共 14,404,970 bytes 已通過來源／候選／QA／量測版本比對並登錄本機；使用者美術驗收仍待確認，未對外部署。

## V4 細節與效能修訂

現行修訂沿用同一份風格指南、碰撞地圖與已核對的 CC0 PBR。`build_cs_environment_v4.py` 增加露石、壁燈、管線、格柵、箱體鐵帶與街面磨耗，降低密集百葉及不可見背面的幾何；來源和候選保存在 `runs/run-20261003-v4-environment/`。先用 Blender 背景執行該腳本，再以 `python art-factory/cs/source/optimize_cs_environment_v4.py` 加工。

- 機械檢查：`python art-factory/cs/source/qa_cs_environment_v4.py art-factory/cs/runs/run-20261003-v4-environment/candidate/environment-runtime.glb`。
- 固定鏡位：`node art-factory/cs/source/capture_cs_v4.mjs`；`--reference` 使用凍結的原 renderer 與 v3 環境。六個鏡位包含出生、A/B、倉庫近景、西側巷道及地面。
- 效能：`node art-factory/cs/source/profile_cs_v4.mjs <label>`，可用 `--reference` 比較原 renderer，`CS_PROFILE_ENV` 指定候選環境。報告記錄 driver、renderer/engine/model SHA、像素尺寸、RAF/CPU 提交、draw/triangles。`ablation` label 執行單因素測試；baseline 原始碼僅供量測，不被遊戲入口引用。
- 實玩效能：其他瀏覽器測試結束後，單獨執行 `node art-factory/cs/source/profile_cs_play_v4.mjs`。在 1080p／DPR 1.5 下以真實鍵盤、Pointer Lock 滑鼠操作移動、轉向、射擊、換彈和瞄準；記錄高／低畫質 RAF 與最終頁面截圖，拒絕死亡／換回合或未產生轉向輸入的採樣，不停用 bot 或修改生命值。
- 本機發布：獨立視覺檢核通過後執行 `python art-factory/cs/source/publish_cs_environment_v4.py`，它比對候選／QA／截圖／審核 SHA。最終用 `python art-factory/cs/source/qa_cs_bundle_v4.py` 核對 runtime 與最終量測版本。

renderer 保留 HDR，改用 FXAA、半尺寸 SSAO、單次更新的 PCF 陰影；高畫質渲染最多約 207 萬像素、低畫質約 92 萬像素，HUD 仍使用原生 DOM 解析度。FPS 結果限於報告中的裝置、視角與 60Hz 排程，不代表所有電腦都能保證 60 FPS。

以下 V3 流程保留供歷史來源重現；不要用舊 publisher 覆蓋 V4 registry 或覆寫舊 QA 證據。

`/games/cs` 的資產工廠。V3 依使用者指定的 CS2／CS:GO 寫實方向，將港口改為沙色舊城街區，搭配 PBR 建築、授權槍械與局部隊色人物。唯一風格來源是 `docs/superpowers/specs/2026-10-03-browser-cs-design.md`；這是原創場景與 CC0 模型組裝，並非 Valve 資產或商業 CS2 畫質等價版本。

## 來源與路徑

- 街區：`source/build_cs_environment_v3.py` 原創 Blender 建築；五組 Poly Haven CC0 貼圖的 URL、授權與 SHA 在 `runs/run-20261003-v3-environment/texture-sources.json`。
- M4A1：3DModelsCC0／nisu，CC0；`runs/run-20261003-v3-characters/m4a1-source.json` 記錄 OpenGameArt 原始下載與 SHA。保留作者幾何、UV 與 PBR。
- Makarov、Grease Gun、狙擊槍與 C4：作者官方 [CC0 Guns & Explosives](https://3dmodelscc0.itch.io/free-cc0-guns-explosives-pack)；原始 FBX／貼圖與授權資料位於 `runs/run-20261003-v3-weapons/`。162 MB 原始 RAR 僅本機保留，不入 Git；使用中的原始檔均已保留。
- 人物：原創 Blender 模型，通過的精確來源、候選、視覺報告與使用中 SHA 以 `manifests/asset_registry.json` 為準。失敗版本保留拒絕理由，不能作為發布依據。
- 遊戲入口卡：經檢核的 Three.js 遊戲內截圖，以 Sharp 確定性裁切、縮放及 WebP 編碼為 1200×675；不是概念圖。

## 重現與檢核

在隔離建模 worktree 根目錄執行，避免覆寫正在使用的候選；Blender 一律 `--background --factory-startup`，不修改互動中的場景。

1. 環境：`python art-factory/cs/source/ingest_cs_pbr_v3.py` → Blender 執行 `build_cs_environment_v3.py` → PowerShell 執行 `optimize_cs_environment_v3.ps1`。原 `.blend`、GLB 與渲染保留在環境 run。
2. M4：先用 Blender 執行 `build_cs_characters_v3.py` 建立手部來源與報告，再執行 `convert_cs_rifle_m4a1_v3.py`。該第一步的舊士兵只是歷史候選，不能直接發布。M4 用 glTF Transform 4.5.0 的 `webp --quality 90 --effort 75` 產生 `rifle-runtime.glb`。
3. 其他武器：Blender 執行 `convert_cs_weapon_pack_v3.py`，再執行 `optimize_cs_weapons_v3.ps1`。已附手部 library，無須另一工作樹；DirectX normal 的綠通道翻轉與 SHA 記在 `weapon-pack-report.json`。
   人物另用 Blender 執行 `build_cs_soldier_v5.py`，再以相同 WebP90 設定生成 `soldier-runtime.glb`。它沿用 v3 的材質與匯出工具，增加收窄的手臂、分層材質和胸前辨識布面板；來源仍在 character run。
4. 啟動本工作樹 Astro preview，再執行 `node art-factory/cs/source/capture_cs_v3.mjs --candidates`。這會用真實 renderer 在固定鏡位拍攝候選；不等同使用者操作流程測試。正式檔檢核移除 `--candidates`。
5. 機械 QA、獨立實際畫面檢核都通過後，用 `publish_cs_environment_v3.py` 或 `publish_cs_models_v3.py <review-json>` 複製至本機 runtime，並比對發布後 SHA。`benchmark_cs_v3.mjs` 記錄本機高／低畫質幀時間；不推論所有裝置效能。
6. `build_cs_card_v3.mjs` 產生入口卡候選；確認來源截圖通過後才替換入口卡。最後跑 `npx playwright test --config=playwright.cs.config.ts`、完整 Vitest、型別檢查及 build。

Windows 的 `playwright.cs.config.ts` 為桌面 Chromium 選用 D3D11 硬體 WebGL；預設 headless 使用 SwiftShader CPU，這個場景會明顯拖慢。產品斷言與跨瀏覽器 fallback 檢查保持相同。效能量測可執行 `node art-factory/cs/source/benchmark_cs_v3.mjs 150 --hardware`；報告必須連同實際 driver 一起閱讀，不能把 GPU 結果當作軟體渲染結果。預設全站測試的原始失敗仍保留。

`asset_generation_manual_review:false` 允許已授權範圍的本機組裝；`assembly_human_review:pending` 保留使用者未驗收的事實，並不代表外部發布授權。單件檢核與整包 gate 分開記錄；bundle 未通過時不能宣稱全批完成。

## 空間與資源契約

`map-data.json` 是碰撞、路線與目標點唯一來源；`contracts/collision_bounds.json` 核對九個 `COLLIDER_*` 節點。GLB Y-up、XZ 地面、前向 -Z；士兵約 1.8 m，眼高 1.58 m。`view_hands` 子樹在第三人稱隱藏；腿部節點保存 rest pose 再加步行擺動。各武器使用自己的第一人稱姿態，不能套用同一個 bounding box。

環境使用 16-bit position／10-bit normal 與 WebP90；重複 UV 保留浮點。模型幾何 draw count 與多 pass renderer 的實際 draw count 分別記錄。低畫質直接繪製世界，停用 SSAO、陰影並釋放不用的 shadow target。

`run-20261003-v2`、`build_cs_assets.py` 與 `write_registry.py` 是歷史流程；不要以它們重新產生 V3 registry。被使用者否決的 V2 runtime 在 `rejected/v2-user-visual-feedback/` 保留，不當作新的核准證據。

## V7 槍口校正與完整角色約束

`run-20261004-v7-sniper-bore` 以原槍口環面量測修正狙擊槍 root／muzzle TRS；BIN、幾何與貼圖完全保留，世界 muzzle anchor 不变。本機 runtime 已接入，來源、重建、Three 量測、真射擊、before/after 影格、Intel 高低畫質實測及最終 unit／CS browser 結果集中於該 run 的 `qa/verification.json`；既有浮掌仍未解決。

`run-20261004-v7-skin-ik` 使用八個 skinned meshes／53 骨的 fabric-budget 候選，驗證雙臂、非零掌部掛點、clone 隔離及姿勢還原。這仍是診斷掛點，沒有正式握點、手指握合或步態；不得直接當成 runtime soldier 或沿用舊剛性骨節 reparent 流程。

## 手部 checkpoint 9（離線診斷，尚未發布）

Checkpoint 8 的 A/B 通過宣稱已被獨立檢核推翻；詳見 `runs/run-20261004-v6-hands/checkpoint-8-trigger/qa/independent-review.json`。不得用舊 builder 或 QA 結果直接發布手部。

新的 pure Python 工具以真 skin triangles、完整頂點穿透、父骨鏈 FK 與一次 `.62` 尺度為準。可在本機隔離 solver 環境執行：

```powershell
& tmp/cs-solver-venv/Scripts/python.exe -m unittest discover -s art-factory/cs/source -p 'test_cs_hand_*_v9.py' -v
& tmp/cs-solver-venv/Scripts/python.exe art-factory/cs/source/qa_cs_hand_rig_v9.py
& tmp/cs-solver-venv/Scripts/python.exe art-factory/cs/source/solve_cs_hand_pose_v9.py your-new-unique-label .925 400
```

環境使用 NumPy 2.4.3／SciPy 1.18.1，僅供離線製作，不是網站 runtime 依賴。QA 會保留過度伸長與壓縮；目前 60°/80° rig stress 仍失敗，該命令正確回傳 exit 1。Pose solve 即使數值 gate 通過也只屬候選，仍需完整武器碰撞、多視角與真頁驗收。所有新手部 `runtime_publish_allowed` 維持 false。

Solver ??? label ????????????????????????????? objective ???????? Jacobian??? 1200???????????? bytes/hash???????????????????? skin triangle ????????? baked vertices ???? DQS ???

### 同相位接地候選（DEV）

`runs/run-20261005-v7-cmu-body-track/manifest.json` 記錄新的 21 節點共同身體軌跡、壓縮資料與實戰驗證。比較頁為該 run 的 `qa/preview.html`；遊戲入口 `http://localhost:4002/games/cs?skinCandidate=1`。正式發布與整體自然動作仍待審，不使用已拒絕的 support-body／global-strike retiming 資料。

### 新版角色受擊（DEV）

`runs/run-20261005-v7-combat-pose/manifest.json` 記錄真實命中事件驅動的短促肩胸反應，以及失敗的完整脊椎瞄準候選。受擊比較在該 run 的 `qa/preview.html`；`skinCandidate=1` 已接入。完整瞄準、側移、握姿與正式美術發布仍待完成。

### 雙臂瞄準診斷（未通過，未接入）

`runs/run-20261005-v7-rifle-aim/manifest.json` 保留四版可行性試驗與拒絕證據。最新肩框架肘 pole 修正改善後翻，實際 bore 與握點數學檢核通過，但極角仍折腕、槍托離肩；診斷頁會明示未通過。下一步需槍托肩窩與腕方向約束、有限軀幹／肩帶協調，不能再擴大前移或重啟 full-spine pitch。遊戲仍使用已驗證的 hit-only 動作。

### 肩部接觸與離肩診斷（未通過，未接入）

`runs/run-20261005-v7-shoulder-contact/manifest.json` 記錄原槍托埋入背心、握點可達範圍，以及有限貼肩／離肩試驗。新的固定軀幹參考使七個樣本一次求解，但下瞄肘形、三角面穿交與肘模式切換仍失敗；`qa/preview.html` 提供兩版截圖比較。離線 crossing 工具保留非共面切觸、透明材質等回歸測試，數字不等同完整碰撞或自然動作通過。既有遊戲 runtime 未接入此診斷包。

### 連續肘部與頭頸（有限候選，未接入）

`runs/run-20261005-v7-elbow-path/manifest.json` 保留連續肘路徑、有限左肩前伸、頭頸跟隨與真 3D 互動預覽。舊切換跳變已解決，有限低姿視覺改善；極端角度仍不適合作自然肩射。CPU skin／交面搜尋只供離線使用，未加入遊戲迴圈。碰撞數不是可見穿模數，局部遮擋證據及所有未通過項均留在報告中。


V33 controlled performance follow-up: shadow-refresh B identifies100 extra calls/377407 triangles and a noisy paired median4.823ms, without changing production cadence. Conservative rigid LOD C is rejected: only12.1% fewer character triangles, failed webbing surface gate, unresolved index seam changes; C2 controlled GPU median saving0.359ms is noisy and calls unchanged. No public asset/runtime change. See `runs/run-20261008-v33-character/qa/rigid-lod-checkpoint.json`; corrected topology audit v2 and five offline regression checks are retained. Stage6 quality/performance goal remains unfinished.


World-weapon runtime increment: load-time rigid templates remove each NPC gun's unused FPS hand rig without changing meshes/materials/transforms/anchors. Full147-file1496-test suite,64 Chromium tests and build pass; four same-context1440x900 pixel pairs are exact. Six instantiated actors remove288 bones/360 nodes, with original FPS48-bone rigs retained. `qa/world-weapon/verification.json` records the independently reviewed delta. Fresh high/low120s samples both cover player/spectator/next round; high P95/P99/worst22.8/38.6/221.2ms with48>50ms, low12.4/17.3/30.3ms with0>50ms. No page/GL/HMR/lifecycle errors; no causal FPS improvement claim. Preview stage12 shows these results, and high-quality performance remains unaccepted.

### V34：移動手感、進點掩體與剛性零件

`runs/run-20261009-v34-handling-detail` 已整合至本機 `/games/cs`。十組箱體增加頂蓋、板縫與扣件，其中四組是中路與 A／B 入口的新掩體；狙擊槍增加沿既有輪廓組裝的物鏡／目鏡固定環和調節握環。Blender 來源保留獨立零件，執行時併入既有材質批次。舊環境 143,354 個三角及原槍械、手臂、骨架、動畫與定位點均通過保存檢查。環境／狙擊槍維持 32／12 primitives；共用法線圖無損改為 WebP，整包從 31,833,840 降至 31,668,796 bytes。

移動改為實際水平速度、加速、摩擦減速與反向急停；準度依速度恢復，槍械重量、慢走及瞄準影響移速。全套 149 份／1,506 項單元測試、64 項 Chromium 測試及 build 通過。九張正式本機資產截圖在該 run 的 `qa/preview.html`；完整證據在 `qa/verification.json`，整合前備份在 `raw/before-local-integration`。

此增量不代表 CS2 品質達標。高／低畫質各 120 秒的 P95 為 20.9／12.7 ms；低畫質前 11.3 秒集中出現長幀，最長 245.8 ms。另一次 60 秒低畫質樣本無 >50 ms 長幀，但原因未定位，不能宣稱已修好。自然實戰的持續觀戰效能樣本不足；觀戰功能測試已通過。人物、其餘槍械細節與完整操作／玩法仍有後續工作，未部署或推送。
