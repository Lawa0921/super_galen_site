# 原創弩兵：持弩、倒地與肩縫續作

本輪為有限進展，整體 goal 仍 active。使用者維持模型、骨架、動作全部原創；未採第三方素材。沒有更新 runtime、push、merge 或部署。

## 可直接查看

- 五段動作與雙 LOD：<http://127.0.0.1:4334/crossbow-carry/>
- 最新實際瀏覽器截圖：<http://127.0.0.1:4334/crossbow-carry/still.png>
- 遊戲：<http://127.0.0.1:4324/games/rts/>，仍為上一版已發布腰部修正版。

工作樹仍為 `.claude/worktrees/rts`，branch `feat/browser-rts`。大量既有 dirty edits 均保留。本輪 root 為唯一寫入者；兩個既有代理僅做唯讀診斷／審查。

## 來源與目前候選

run：`art-factory/rts/runs/original-crossbow-carry/2026-10-06-v1`。

| 檔案 | SHA-256 |
|---|---|
| candidate/original-crossbow-grip.blend | ee845a8004fd2267070e1459fa97da17d4b9797458185c012f1527303d9718bd |
| candidate/original-crossbow-grip-lod0.glb | 595a6a52846fe27801d19b32d9f54f12d26b6d952ce36049ab84a1310f20747a |
| candidate/original-crossbow-grip-lod1.glb | 56236d021bd788d2b5713eaf820829d4fc026eca5adebdee2bc57f4739766e36 |

繼承上一輪 `original-crossbow-weapon/.../geometry-candidate`（blend eda11af6…），武器本身 960／416 triangles，整組 19265／9815 triangles。`interface-candidate` 保存本輪局部袖口修正、舊動作與舊肩權重；`seam-candidate` 加上肩縫權重統一但仍保存舊動作；`candidate` 是從 seam 母體新製五段動作的目前整合版。三者不要混用 QA 身分。

## 本輪實作與實際通過範圍

1. 先固定可達 ready：20° shoulder protraction、相對原 Hand_R 世界 Z 左乘 +22°、R channel 約 (.04,.20,1.23)。原 20 bind bones 不改，以 Shoulder/UpperArm/Forearm/Hand 左右 8 骨解析求解；固定腕目標只用 UpperArm+Forearm=.351538m 的可達距離，沒有伸骨。
2. 原 body sleeve 尖片在實際握把中段穿透，225 個交點樣本全部在 glove solid 外。保留武器與手套，局部原貼圖表面依 geodesic falloff 收回手腕：LOD0 322／LOD1 246 個位置變更，topology/UV/weights 不變。原 ready body–weapon 45／30 crossing 降為 0。這只證明碰撞改善；完整腕口 gate 仍失敗（下節）。
3. 五段動作重新製作 8 臂骨；Idle/Walk 有小幅起伏，Attack 有 22mm 原創後座與回位，Hurt 保持握持。舊 IK wrist branch motion 不再移植。Death 原來向前倒會帶弩穿地，改 Root 原創向後倒、依真實 body surface 修正最後落地。手掌／武器關係固定，其他非臂曲線僅 Death Root 改變。
4. 肩部裂開源於同一 rest 位置用了不同 weights。統一肩區共點權重，保留 UV split：503／290 groups，1077／622 vertices 權重變更。兩 LOD、五 clip、半幀取樣，原最大裂縫約 52.95mm 降到 0.00333mm 以下；LOD1 最大 0。這不代表所有肩部曲面／材質都達到商用品質。
5. 最新 `qa/contact.json`：雙 LOD × 五 clips × 半幀，共 802 個 source poses；body–weapon、glove–weapon crossings 均 0，雙 grip channel drift 和 named-grip 近接亦通過。
6. 最新 `qa/actual-export-verification.json`：每 LOD 797 個四分之一幀 poses；所有骨 skin matrices 與 weapon vertices 的 source/GLB parity 通過。弩最低約 .341m，Death body 最後低點約 .0027m；全段 body 沒有超過 5mm 地面穿入。這個工具未比對全部 body vertices 的 source/export surface parity。
7. 最新 `qa/carry-preservation.json`：全部 bind、topology、UV、material assignments、weapon/gloves、腰部與 scope 外 positions/weights/curves 保全通過。GLTF validator 各 LOD 0 errors、4 個既有 skinned-mesh parent warnings；動畫 5 條，triangles 19265／9815。
8. 真 Chromium 已開上述 standalone preview，60 個 front/side/back poses、5 clips、雙 LOD、timeline、play/pause、mobile 截圖與 hashes 通過，page errors=0。root 已看 front/back、Attack side、Death final side。`qa/weapon-poses/report.json` 與 PNG 是實際浏览器證據。

## 必須保留的失敗與限制

`qa/cuff-preservation-containment.json` **明確 FAIL**。舊 `qa/cuff-historical-witness-only.json` 只檢查 165 個舊 terminal witness points；不可再用它宣稱完整 cuff 過關。

完整 boundary graph 由 polygon edge count=1 建立：

| 腕口 | vertices/edges | 分岔 vertices | 完整採樣在 glove 外 |
|---|---|---|---|
| R LOD0 | 52/53 | 5307 | 47/255 |
| R LOD1 | 69/73 | 677,3535,3543,3573 | 95/392 |
| L LOD0 | 54/54 | 無 | 0/244 |
| L LOD1 | 71/78 | 1797,1814,1075,1452,1463,1788 | 62/393 |

這是實際拓撲分岔，不是只漏幾個 UV duplicate。唯讀探測 geometric quotient weld 1e-8 到 1e-6 未能把 failing component 變成閉環，部分反而變 degree-1；禁止靠加大 weld tolerance 或放寬 gate 宣稱修好。舊 terminal report 只取 axial 幾何條件造成多段種子，不是完整環。

下一步要依完整腕口與外部可見面重建接合過渡段，保留原貼圖/手指/武器與已通過的動作；不要繼續移整隻手、缩握把或只重投影舊 165 點。也要驗證接合交線落在真正 glove cuff 區，不能用 body 自報 changed indices 當独立證據。`original_cuff_blend` 是 decimation 前歷史欄位，使用前先確認能映射到當前 glove vertex/triangle，勿直接假定 index 可用。

整體還要修手套材質、射擊瞄準方向／裝填表現、clip 切換、肩面細節與真正遊戲／肖像觀感。新 Attack 的碰撞通過不等於完成射擊美術驗收。其他兵種與兩張地圖的完整原創商用品質仍未完成。

## 失敗軌跡與重建

- `rejected-motion-v1`：移植舊 wrist motion，Attack 最高220/138 crossings、Hurt32/25。改為重新製作臂骨曲線後收斂。
- `rejected-floating-v2`：武器接觸與 export parity 通過，但 Death body 停在地上約75mm；新增 actual body floor gate 先失敗，再修 Root 平滑落地。
- `pre-seam-motion-v3`：落地已修、肩縫仍裂，保留作對照。
- 目前 candidate：新肩縫版，full-rim QA 仍拒絕 runtime。

主要工具：`original_crossbow_interface_probe.py`（必凍結 active action，否則 render 會回原 pose）、`original_crossbow_cuff_rebuild.py`、`original_crossbow_cuff_boundary.py`、`original_crossbow_cuff_verify.py`、`original_crossbow_shoulder_rebuild.py`、`original_crossbow_shoulder_verify.py`、`original_crossbow_carry_build.py -- --seam`、`original_crossbow_carry_preserve.py`。目前 cuff builder 舊默認會寫 candidate；不要直接重跑而覆蓋整合候選，後續修正版應先改獨立輸出。

重新打包：`node art-factory/rts/tools/original_crossbow_carry_package.mjs`。瀏覽器驗證用 `RTS_REVIEW_URL=http://127.0.0.1:4334/crossbow-carry/` 呼叫 `original_crossbow_weapon_browser.mjs <run>`。密集接觸與 export 工具沿用 `original_crossbow_weapon_contact.py -- <run> --dense`、`original_crossbow_weapon_export.py -- <run>`。

正式 runtime SHA 保持 LOD0 `0970c9c51ebc03e8b01528db721291cc801faddf0f60a8e3ebf161ef8bea4c58`、LOD1 `6decb6135b3b42a35a6cf67f5dc04df2b1699e1224cdbA89752a66e807385ccf`（大小寫無意義）。本輪沒有遊戲程式／正式資產變更，未重跑全站 Vitest／遊戲 E2E；不把前輪全套成功當本候選通過。
