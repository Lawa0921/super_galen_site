# 原創弩重製：本體可續用，人物動作未通過

使用者要求模型、骨架與動作全部原創；本輪沒有採用第三方模型、骨架或動作包，也沒有 push、部署或更新 runtime。原始目標仍包含整套人物／3D 動態肖像、兩張地圖與對戰電腦；目前不能宣稱整體達到商用品質。

工作目錄是 `.claude/worktrees/rts`，branch `feat/browser-rts`，既有未提交工作完整保留。唯一風格指南仍是 `docs/superpowers/specs/2026-10-04-browser-rts-design.md`。

## 可檢視產出

- 武器本體互動預覽：<http://127.0.0.1:4334/crossbow-weapon.html>。可拖曳、旋轉、切換 LOD；桌面與手機實際 Chromium 操作通過，手機構圖已修正裁切。
- 靜態圖：<http://127.0.0.1:4334/crossbow-weapon.png>。
- 現行遊戲：<http://127.0.0.1:4324/games/rts/>，本輪未替換其模型。

新弩包含連續曲面木托、左右同軸的封閉鋼弩臂、弦、箭槽、機匣、握把、扳機護圈與真實中空腳踏環。沿用專案原創木紋／鋼／皮革圖；metallic 與 roughness 是作者設定，並非量測掃描材質。

本體來源：`art-factory/rts/runs/original-crossbow-weapon/2026-10-06-v1/geometry-candidate/`。

| 檔案 | SHA-256 |
|---|---|
| original-crossbow-grip.blend | eda11af6d0be24b6169e6e853640a09e2adb9d048dc3e82e634ad86528fd9d85 |
| original-crossbow-grip-lod0.glb | f59d10eee3c8c249d353a9635ea761b67021efe04e7f95879d348549636026c1 |
| original-crossbow-grip-lod1.glb | bf54901a75db536447da6db286681febc0734be3212593393799121d7da838b8 |

武器為 960／416 triangles；整個兵種為 19265／9815 triangles。`qa/geometry-preserved.json` 實測確認原 body、hands geometry/UV/weights、20 bind bones、五條原 action 與原 packed images 全部保持。這只接受可續用的武器本體，不接受帶入舊動作後的完整人物。

## 已驗證與失敗軌跡

1. 舊武器 actual source 測試失敗：弩臂開殼、偏離木托中心 0.13m、全部武器材質無圖。`qa/baseline.json`。
2. 新造型第一版 992／376 triangles；握把使用圓角矩形截面而穿指，護圈碰左手。來源與影像保留於 `rejected-v1/`。
3. 修成真圓握把、調整護圈後，本體 960／416 triangles。雙 LOD × 五 clip 共 208 個來源姿勢，手套／全弩交叉為零，named grip 最近頂點距離約 1.52–1.63mm。此檢查不等於袖口或軀幹也無碰撞。
4. 原 Death 會讓武器穿地：舊 runtime 母體最低 Z=-0.237m，新本體配同動作為 -0.328m。`qa/floor-baseline.json`、`qa/death-ground-baseline.json`。
5. 僅修改 Death 六個 arm bones，使弩最低 Z=+0.134m；GLB 以四分之一幀取樣，與來源逐點／骨矩陣誤差 <1e-4，舊 cuff 門檻亦通過。但新增全武器對 body 檢查發現穿胸／頭／前臂，故整版退回，保存在 `rejected-death-v1/`。
6. 擴充到五 clip 的六骨持弩前移試作（目前 `candidate/`）也退回：左手目標漂移 Idle 最大 0.126m、Death 0.305m，Attack 會穿手；不可發布。這不是 exporter 誤差，是鎖定肩根與腕角的幾何不可達。
7. 改用解析兩段臂 solver 檢查可達性。UpperArm 0.167474m + Forearm 0.184064m = 0.351538m；固定 Hand matrix 時必須檢查腕／Hand head，不能以含 Hand 的 0.477040m 總長判斷。六骨 24 組只有 6 組可達，仍碰撞；八骨（加入 Shoulder L/R）54 組有 31 組可達，仍未通過完整接觸或外觀驗收。禁止將「31 可達」寫成「31 通過」。

八骨例子 Shoulder 20°、weapon yaw 60°（相對原 yaw 38°，即左乘 +22°）、R channel=(.04,.20,1.23)：已無胸／腹／頭交叉，仍有 trigger grip 27（Hand_R 23／Forearm_R 4）與 support grip 18（Hand_L）個非共面三角交叉。多組殘留固定在 Hand 加權的原袖口／握把交界，下一步應定位真實交點，不能繼續只移動整隻手。

獨立 consultant 同意武器幾何可續用，motion 不接受。初次將弩臂／木托正常交會誤認為弩臂 X 交叉，經正上視圖與單一鏡射 closed loft 核對後撤回；腳踏環側面呈線也不构成功能否決。

## 目前證據身分與保護界線

- `qa/root-review.json` 明確 `rejected-for-runtime`；合約維持 `qa_failed/runtime_publish_allowed=false`。不能用任一零 error 的 GLB validator、browser ready 或 geometry pass 覆蓋動作退回。
- `qa/evidence-index.json` 區分幾何母體、退回 Death 試作、目前退回 carry 試作與可達性診斷。部分頂層舊結構／export 報告屬 Death 試作，已明列 superseded，不能當作目前 candidate 的證據。
- `candidate/grip-candidate-report.json` 是保留原 cuff 證人點的歷史報告，來源 hash 不代表新候選，不是核准依據。
- 現行 runtime 仍為腰部修正版：LOD0 `0970c9c51ebc03e8b01528db721291cc801faddf0f60a8e3ebf161ef8bea4c58`；LOD1 `6decb6135b3b42a35a6cf67f5dc04df2b1699e1224cdba89752a66e807385ccf`。本輪結尾重讀 SHA 一致。
- 本輪沒有修改遊戲程式或正式資產，沒有重跑整站 Vitest／完整 E2E；上一輪全套結果不能當成本輪動作通過。

## 下一個有限工作包

1. 以 geometry-candidate 母體和 `qa/shoulder-feasibility.json` 的可達姿勢，定位握把與原 body cuff 的真實交點與表面法向，分清封口、內藏面、可見外表面。不要只用三角形包圍盒或多數骨權重當結論。
2. 依交點決定最小握把／袖口接口修正；再用原 20 骨中的 8 個肩臂手骨製作可達的持弩姿勢。先達成一個自然、無穿透、無伸骨的站姿，再做完整 clip；停止新的參數 grid。
3. 肩骨加入後需新驗肩甲／軀幹自交、肘腕自然度、雙握持、四個在世 clip 切換連續性、Death 全段 body／地面接觸及 LOD／GLB parity。Death 若無連續雙握持解，可讓 L 手原創放開；不可直接改 bind rest 或偷縮骨。
4. 完整獨立驗收後才使用既有 fail-closed publisher 更新本地 runtime，再跑遊戲流程、肖像、全套測試及需要的效能驗證。其餘兵種、地圖單調問題與整體商用品質要求仍未完成。

重製互動預覽：`node art-factory/rts/tools/original_crossbow_weapon_package.mjs`；驗證：`node art-factory/rts/tools/original_crossbow_weapon_preview_test.mjs`。來源檢查用 `original_crossbow_weapon_verify.py`；碰撞門檻用 `original_crossbow_weapon_contact.py -- <run> --dense`（目前理應 FAIL，不得跳過）。
