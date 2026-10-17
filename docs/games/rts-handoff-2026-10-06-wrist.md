# RTS 原創弩兵腕口拓撲交接（2026-10-06）

目前是 **qa_failed 的局部修整候選**，不是整體商用模型完成。全部模型、骨架、動作維持原創，不採第三方mesh/rig/animation。原目標仍包含完整人物品質、各兵種動態3D肖像、兩張豐富地圖及對AI玩法；這些不能以袖口子項通過取代。

可操作预覽：[前臂修整](http://127.0.0.1:4334/crossbow-wrist/)；[實際桌面截圖](http://127.0.0.1:4334/crossbow-wrist/still.png)。遊戲仍是[4324版本](http://127.0.0.1:4324/games/rts/)，未換入此候選。4334是既有靜態review服務，沒有啟動原生桌面helper。

工作樹：`C:/Users/bag57/projects/super_galen_site/.claude/worktrees/rts`，`feat/browser-rts`，Windows 10.0.26200.0／Blender5.2.1。root唯一寫入者，兩代理唯讀。既有大量dirty edits全部保留，沒有commit/push/deploy。

## 來源與凍結候選

run：`art-factory/rts/runs/original-crossbow-wrist-topology/2026-10-06-v1`。

| 檔案 | SHA-256 |
|---|---|
| candidate/original-crossbow-grip.blend | 1c4ccb86a79301376a18a04247df1eca1df8edbfd70a4a1956d100c7b47fabb7 |
| candidate/original-crossbow-grip-lod0.glb | 78a049df99a40a1bcfece40f0d44f1bd86ff6a38bad0983764b41237901b5abc |
| candidate/original-crossbow-grip-lod1.glb | bdf2c7945d11770f33589f6eda88f3473d08c8f0feaa2415ccba0728bb01a3d5 |

原母體是carry candidate `ee845a8…18bd`，完整SHA與原成果見前一份`rts-handoff-2026-10-06-carry.md`。本輪沒有覆寫母體。新source保留原20 bind與五動作，武器/手套所有data不變。LOD0/1整組GLB為19,460／9,815 triangles，仍低於20,000／10,000。

## 實作與紅燈基準

1. 完整boundary基準：R0 52V53E、R1 69V73E、L1 71V78E均有branch且出glove；L0完整54V54E、全inside。本輪baseline test先以正確原因exit1，證據`qa/baseline-regression.json`。
2. 切面用實際carry Idle0 posed axis，距Hand朝Forearm head：R0 .035m、R1 .075m、L1 .130m。只能使用本輪軸定義，不套用先前probe的另一套距離。
3. 跨切面scope涵蓋同側UpperArm/Forearm/Hand，以免L1肘部混合權重漏選。僅合併新切面的degree1端點，不做全圈distance weld。三環依序39／30／36V，各為單一degree2閉環。
4. 從原有前臂表面射線取樣輪廓、逐面沿用原atlas，新增4／4／7段並封在實際手套內。沒有加第三方mesh或簡單圓柱蓋板。輪廓射線無命中時使用原面nearest projection；細節與UV仍需視覺檢核。
5. 新切面共用平均同側arm權重，逐段平滑至Hand=1封口。v1沿用每點不同權重會把R0極短邊在Attack拉至28.48x；此候選已修正。所有留存原頂點位置、權重及完整原face UV/material精確保全，完整L0左腕不改。
6. `OriginalSourceVertex`是原頂點ID+1；新點為0。POINT `WristRepairSide`／`WristTerminalSide`，FACE `WristRepairFace`不可同名，Blender會自動改名。這些只供source QA，不假設GLB保存。

## 最新實際驗證

| 檢查 | 結果與界線 |
|---|---|
| cut-sections | PASS，三處單環 |
| topology-preservation | **FAIL**；保存、全cap包含、新strip封閉通過；完整接面尚有14條繼承boundary |
| wrist-deformation | PASS，802半幀source poses；逐LOD Idle0參考；最大邊長1.069889x、最大面積1.076111x；15組clip末端cap inside |
| weapon contact | PASS，802 source poses，body/weapon及glove/weapon crossings全0 |
| actual export | PASS，1,594四分之一幀；bone matrices、weapon vertices及body/weapon地面gate。**沒有驗證全部body表面source/export等價** |
| Khronos GLB | 各LOD 0 errors、4個既有skin parent warnings |
| Chromium | 60個實際姿勢/視角，雙LOD、五clip、timeline、play/pause、mobile、SHA核对；page errors=0 |
| 獨立唯讀檢核 | REQUEST_CHANGES，見qa/independent-review.md |

所有report SHA與candidate身分在`qa/evidence-index.json`，root判定在`qa/root-review.json`。root已查看Blender前/背近景與瀏覽器完整畫面。測試通過沒有等同美術核准。

## 真正剩餘問題與下一步

- 新接合段上方仍有真缺面：R0 4條、R1 6條、L1 4條proximal boundary。獨立probe發現R1有22mm／9mm級對應端點距離；不能當純UV seam、不能放寬成PASS。保留完整surface gate false。
- 肩背/手肘的藍色三角已由唯讀診斷定位到v1整面TeamCloth指派。後續材質修正在`rts-handoff-2026-10-06-surface.md`，不覆寫本候選。染色修正後背頸/腋下仍有真幾何缺損，完整表面gate繼續失敗。
- 手套材質、Attack瞄準/裝填表現、其餘兵種及地圖品質仍待做。新strip自相交/UV品質及實際GLB表面契約尚未完整驗收。
- 沒有app/runtime改動，所以本輪未重跑全站Vitest、遊戲E2E或80單位性能；不能拿前輪通過代替新候選接入後驗證。

## 操作入口

Blender指令皆用`-b --python-exit-code 1 --python art-factory/rts/tools/<tool>.py`。

- `original_crossbow_wrist_topology_verify.py -- --baseline`：預期exit1；不保存母體。
- `original_crossbow_wrist_cut_probe.py`：三切面證據。
- `original_crossbow_wrist_topology_build.py`：從frozen carry重建本run candidate；不寫runtime。重建後必須重跑相應證據，勿沿用舊SHA。
- `original_crossbow_wrist_topology_verify.py`：完整gate目前預期exit1，會保存各局部結果。
- `original_crossbow_wrist_deformation.py`：完整新strip半幀面積/邊長與cap包含。
- `original_crossbow_weapon_contact.py -- <run> --dense`、`original_crossbow_weapon_export.py -- <run>`、`original_crossbow_weapon_render.py -- <run>`。
- `node art-factory/rts/tools/original_crossbow_carry_package.mjs <run> crossbow-wrist`，接`RTS_REVIEW_URL=http://127.0.0.1:4334/crossbow-wrist/`的`original_crossbow_weapon_browser.mjs <run>`。
- `tmp/rts/wrist-record.py`彙整目前候選，會核對unchanged runtime SHA。`tmp/rts/wrist-capture.mjs`取得真桌面截圖。

v1來源與報告保存在`iterations/v1`，不是可發佈fallback。原runtime弩兵仍是waist版，SHA `0970c9c5…c58`／`6decb613…5ccf`；完整值已再次核對於evidence-index。
