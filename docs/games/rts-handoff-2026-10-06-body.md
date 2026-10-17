# RTS 原創弩兵連續表面交接（2026-10-06）

[互動預覽](http://127.0.0.1:4334/crossbow-body/) · [實際截圖](http://127.0.0.1:4334/crossbow-body/still.png)。本輪重建弩兵身體的連續表面，維持模型、骨架、動作全原創。**候選尚未替換遊戲內模型，亦未 push/deploy；不是整體商業美術驗收通過。**

前份為 `rts-handoff-2026-10-06-surface.md`。原始目標仍包括所有兵種、會動的 3D 肖像、完整原創動作與兩張更豐富的地圖；那些工作沒有因本輪拓撲通過而完成。

## 根因與製作

同一角色的原始 TripoSR／xatlas／projection v3 母模可按完全相同的空間座標還原成封閉網格：16,560 個 UV 分裂點合併為 13,234 個幾何點，26,464 三角面，沒有邊界或非流形邊，原逐面角 UV 完全保留。舊流程先減面 UV 分裂網格、再綁定，各片得到不同權重，造成肩頸／腋下在動畫中裂開。

母模：`art-factory/rts/runs/unit-bodies/crossbow/v1/projected/candidate/guard-neural-v3.blend`，SHA `6467f72f90b373b8409d93d6f274c908c967921e61cb4fa4944b58200a2c6be0`。沿用上一版原創材質、20 根骨架、五動作、雙手與弩。

最終順序：精確幾何合併並保留 face-corner UV → 原 bind 表面權重投影與連續拓撲上的正則平滑 → 同一母模分成兩個 LOD → 各自減面 → 在 bind 空間完整切除舊神經網路手部、依原創修整袖口輪廓重建至真手套內側 → 固定 cap 為 Hand 單骨權重 → 與 Blender 匯出器一致的 `>0.0001`／top 4／normalize → GLB。

不能將 cuff 做完後再減面：會把 cap 與 Forearm 混合權重，破壞手套接合。失敗版本保留在 `iterations/rejected-post-cuff-decimation/`，未進 runtime。也不能把舊權重門檻當作切割邊界；新 closed-source 路徑以面鄰接補完整切割區域，禁止端點硬焊。原本破碎來源的 legacy 路徑保留並有回歸測試。

## 固定候選與驗證

run：`art-factory/rts/runs/original-crossbow-body-surface/2026-10-06-v1`。

| 候選 | SHA-256 |
|---|---|
| original-crossbow-grip.blend | 91d1048ab31dad70e4e66b2a99cea3d666de6e8fb201f9a084f16c00b5922ffe |
| original-crossbow-grip-lod0.glb | a19394158b02cd61bdf9e8d9ee1c93ac52b92ab4a3c7704298b7dbf10795252b |
| original-crossbow-grip-lod1.glb | 60c0ee2d541cb33606346e2e7fa4923e7a639f1159a7f51f70b302712a4b5a6f |

| 實跑檢查 | 結果與限制 |
|---|---|
| 舊版紅燈 | body surface baseline 正確 exit 1：LOD0 5,254 邊界邊、152 個分離片；舊切割也因 2.994mm 缺口正確失敗 |
| 切割回歸 | 5 cases 通過：closed 母模 R52/L48 完整環與 torso 保留；legacy R0=39、R1=30、L1=36 |
| Source／GLB 完整表面 | 兩 LOD 各為單一連通封閉身體，邊界／非流形／winding 錯誤／退化面均 0；GLB 按同座標 UV 點取 quotient 後相同 |
| 匯出皮膚權重 | 檢查 3,520／2,435 個 UV 重複點權重一致；全頂點 rest 最大偏差 0.000000523m，權重 L1 最大誤差 0.000000150 |
| 原創資料保留 | 20 bind matrices、五動作所有 curves、雙手／雙弩 geometry、UV、weights 完全相同 |
| 面數 | 實際 GLB／Three.js 18,516／9,648 tris；其中 body 14,556／6,232 |
| 袖口變形 | 802 個半幀姿勢通過；20 個 clip-end cap containment 檢查通過。最大邊長比例 1.518、面積比例 1.447；不代表已證明全身無自相交 |
| 武器接觸 | 802 個半幀姿勢通過，body／glove 對武器沒有檢出的非共面穿越；接觸面积與整體自然度另審 |
| 真實 GLB 動作 | 1,594 個四分之一幀姿勢通過骨架／武器位置與接地驗證；完整 body rest/skin parity 由本輪新 verifier 補齊 |
| Khronos validator | 每 LOD 0 errors，4 個原有 skinned-mesh parent warnings |
| 瀏覽器 | 18 張藍／紅 before-after 視角；60 張五動作雙 LOD 姿勢，timeline、play/pause、mobile、檔案 SHA 核對；page errors 0 |

白模 `qa/baseline-white-*`／`candidate-white-*` 用相同鏡頭分辨真正裂縫與材質明暗；實際貼圖與五動作證據分別在 `qa/browser/`、`qa/weapon-poses/`。本輪只修改離線工廠、候選與 review 預覽，沒有改 app 或 runtime，因此沒有把舊全站測試／80 單位性能結果當成本候選的接入驗收。

## 品質界線與接續

完整身體閉合與匯出權重問題已具備機械證據。臉部、護甲表面、袖口 UV、手套材質、瞄準／裝填與整体動作自然度仍需實際美術審核；見同 run `qa/independent-review.md` 和 `qa/root-review.json`。拓撲封閉不排除表面互相穿插，也不等於可商用完成品。

接入 runtime 前仍需依實際最終版本做遊戲內肖像、交戰、效能與完整回歸；其他兵種與兩張地圖工作仍開放。不借第三方模型／骨架／動作，不用幾何遮片掩蓋缺陷。

## 重現入口

- Blender：`original_crossbow_body_build.py`，`--before-cuff` 產生切割測試 fixture，`--no-export` 只存 source。
- `original_crossbow_body_cut_test.py` 五個切割 cases；`original_crossbow_body_verify.py -- --baseline` 預期紅，不帶參數驗最終 source／GLB。
- `original_crossbow_wrist_deformation.py -- --run <run>`；`original_crossbow_weapon_contact.py -- <run> --dense`；`original_crossbow_weapon_export.py -- <run>`。
- `node original_crossbow_validator.cjs <run>`；`node original_crossbow_carry_package.mjs <run> crossbow-body`。
- `node original_crossbow_team_surface_browser.mjs <run> crossbow-body crossbow-surface`；設定 `RTS_REVIEW_URL=http://127.0.0.1:4334/crossbow-body/` 後執行 `original_crossbow_weapon_browser.mjs <run>`。

工具均在 `art-factory/rts/tools/`。Blender 使用 `-b --python-exit-code 1 --python`，Windows 重導 log 後用 `exit $LASTEXITCODE` 保留原生退出碼，避免 stderr deprecation warning 被 PowerShell 誤當失敗。不可直接重跑舊全角色建模工具覆蓋目前候選。
