# RTS 原創弩兵衣料表面交接（2026-10-06）

最新候選：[實際互動預覽](http://127.0.0.1:4334/crossbow-surface/)；[桌面截圖](http://127.0.0.1:4334/crossbow-surface/still.png)。維持全部原創、未替換runtime、未push/deploy。這輪解決隊伍染色碎片的來源，**不是全模型美術通過**。

前一份`rts-handoff-2026-10-06-wrist.md`保留腕口拓撲/動作里程碑與測試，本文是其材質延伸。原目標的其他兵種、動態3D肖像整體品質及兩張地圖豐富度仍未完成；不要只看測試數宣告商用品質。

## 根因與修正

獨立唯讀診斷指出舊版`human_units_prepare.py`每個UV面只採四點、兩票即整面染色，`human_units_build.py`按原polygon index指定slot1。原弩兵LOD0 slot1為2,167 tris、169 components，其中56個單三角；LOD1為1,222 tris、172 components，其中50個單三角。隊伍材質把這些碎片顯著染藍/紅。這不是`prepareTeamMasks`的錯誤，舊材質根本沒有texel mask。

本輪從**原GLB內嵌的1,024 atlas**取既有原創衣料藍色遮罩，重用專案現有`blue_fabric_mask`、`feather_mask`與runtime `TeamClothMasked` shader。保留原始albedo所有bytes，不畫新衣甲、不借外部材質。兩個原body primitives改用同一masked原albedo材質；GLB只修改JSON，**BIN chunk完全相同**，不重新簡化/輸出幾何。Blender可編輯來源僅修改body材質配置。

`original_crossbow_team_surface.py`不是全身建模工具，不能拿它修真裂縫。root已看實際前/背、藍/紅、近/遠景；正面染色色塊改善，背頸/腋下黑色幾何缺損仍明顯。

## 版本與證據

run：`art-factory/rts/runs/original-crossbow-team-surface/2026-10-06-v1`。

| 檔案 | SHA-256 |
|---|---|
| candidate/original-crossbow-grip.blend | 35e6c95a646fd8647b3c24fc54ab11106ea53796503ef81d34c76e877e81a4f1 |
| candidate/original-crossbow-grip-lod0.glb | c9d50da5979ea61eb79519a6cb25fcbe4411a7a3fcf4ddf6083379a81771820c |
| candidate/original-crossbow-grip-lod1.glb | 61bcccd3dfbf1958a3c8b023089a9a5371c87ae07d8e651eb2bf8659ce874509 |
| candidate/team-mask-1024.png | 71ffb3a3a9a2fd8390eb8f65d1b37ab900e96ae21fd9908e2025665ac968e70b |
| raw/original-embedded-body-albedo.jpg | 734ccac4c569241b97bd401d6e3d2ddbe7a48523c1039bd8782ee11783d9e166 |

Source為腕口候選blend `1c4ccb86…abb7`，GLB `78a049df…5abc`／`bdf2c794…a3d5`。完整source指紋保存在material-migration與blend-preservation reports。兩LOD仍為19,460／9,815 triangles。

| 檢查 | 實際結果 |
|---|---|
| 紅燈基準 | 舊body材質沒有teamTintMask，baseline test正確exit1 |
| conversion tests | 2通過：只變body材質、其他JSON/武器不變；錯LOD/body拒絕 |
| material-migration | PASS；兩LOD同albedo；所有geometry/UV/skin/animation/images BIN bytes相同 |
| mask | 原藍衣料74,237 pixels，平均mask .999；灰金屬 .0197、金色 .0068、膚色/皮革 .0026；非cloth零mask的recolor RGB逐點不變 |
| Blender preservation | 所有mesh座標/topology/UV/weights、20 bind、全部curves與非body面材質配置不變 |
| Khronos GLB | 各LOD 0 errors、4個原有skin-parent warnings |
| 真瀏覽器材質 | 18張before/after、藍/紅、雙LOD、前/背/斜前；errors=0 |
| 真瀏覽器動作 | 60姿勢/視角、五clips、雙LOD、timeline/play/pause/mobile、SHA核對；errors=0 |

原腕口run的802 source變形、802武器接觸與1,594 source/GLB骨/武器姿勢證據是**繼承證據**：此輪沒有假稱重跑，BIN byte-identical與Blender source preservation確保該資料未改。完整body GLB表面自相交、真破口、所有UV問題仍未驗收。

## 保留的阻擋與下一個有限工作包

- 腕口完整surface gate仍false，三處共14條proximal boundary含真裂縫；詳前份wrist交接，不能因材質較順眼豁免。
- 原body本來有大量boundary。source代理判定共享邊winding無翻面，但仍有幾何唯一boundary；mask修正後背頸/腋下仍見黑色缺面。應建立整片原創body表面重建/接縫契約，使用白材質與原atlas分別看幾何，不能繼續把全部黑片歸因染色。
- 手套現有土褐色材質、Attack瞄準/裝填表現未到整體品質要求。其餘人物與地圖亦待做。
- 未改app/runtime，因此本輪沒有全站Vitest/遊戲E2E或80單位性能測試；接入前仍必須做對應驗證。

## 重現

Python（有PIL/numpy）：`C:/Users/bag57/.cache/codex-rts3d/hunyuan21/venv/Scripts/python.exe`。

- `original_crossbow_team_surface_test.py --baseline`預期紅；不帶參數跑兩個conversion regression。
- `original_crossbow_team_surface.py`建立mask與只改JSON的GLB。
- Blender `-b --python-exit-code 1 --python .../original_crossbow_team_surface_blend.py`保存可編輯材質counterpart。
- `node .../original_crossbow_validator.cjs <run>`。
- `node .../original_crossbow_carry_package.mjs <run> crossbow-surface`打包既有4334服務；`original_crossbow_team_surface_browser.mjs`檢查兩隊與前後差異；`original_crossbow_weapon_browser.mjs <run>`配`RTS_REVIEW_URL=http://127.0.0.1:4334/crossbow-surface/`測五動作。

不要直接執行舊`human_units_build.py production`或`original_crossbow_grip_build.py`重建覆寫這份來源，它們會重做既有rig/動作。材質GLB刻意用JSON遷移維持BIN完全不变。
