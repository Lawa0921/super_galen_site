# 原創手套高模修形交接

模型、骨架與動作持續全部原創。此次完成手套高模的局部曲面修復：手背橫向厚唇、修形造成的黑槽與凹袋已消除，掌面與手指保留原始輪廓；虎口與單一腕環可續用。獨立視覺複查**條件通過作為可變形 retopo 的高模基礎**，尚未完成手部或完整人物的商用資產。

[可旋轉預覽](http://127.0.0.1:4334/glove-refinement/) · [實際瀏覽器截圖](http://127.0.0.1:4334/glove-refinement/still.png) · [原始高模](http://127.0.0.1:4334/glove-sculpt/) · [遊戲](http://127.0.0.1:4324/games/rts/)。工作樹 `C:/Users/bag57/projects/super_galen_site/.claude/worktrees/rts`、分支 `feat/browser-rts`；正式人物 runtime 未換版，未 commit、push 或部署。

## 來源與最終版本

Run `art-factory/rts/runs/original-glove-sculpt/2026-10-06-v1`，contract `art-factory/rts/contracts/original-glove-sculpt.json` 保持 `qa_failed/runtime_publish_allowed=false`，另明確記錄高模可進 retopo。來源是專案 imagegen＋本機 Hunyuan3D 原創左手高模，沿用[前次來源交接](rts-handoff-2026-10-06-glove-sculpt.md)，未導入外部手模、骨架或動作。

| 檔案 | SHA-256 |
|---|---|
| immutable 原始 `candidate.glb` | `8c4962dd9f9789252c959f2e113a0459862cb8771cc85639a20608b9330895f9` |
| v4 `candidate/sculpt.glb` | `1c6e1129c1fa00c9839ace8fd3ef1fea233740b77814a22c9b4c266744ea60b0` |
| v4 `candidate/sculpt.blend` | `a514c419d3272b6a0ef3c2b9e6a6c893d29c1121849c1d2e6c7bdcb891471712` |
| `raw/dorsal-fairing.npz` | `c31d90bfc7c87ce990560aba7271ccfcbe6d6a23eb4ab9074e565a12c999adb8` |

最終高模 250,471 vertices／499,957 triangles；一個 QA clay 材質，沒有 UV、貼圖、骨架或動畫。所有形狀量測為來源模型座標單位，尚未適配人物公尺尺度。

## 修正與反證

最初 dorsal ROI 太高，誤動指根又留下原缺陷，已完整保存在 `iterations/rejected-high-roi-double-cuff`。v3 的 Y 高度投影漏掉陡壁與袋底，在手背產生新的水平暗槽；`qa/dorsal-mask-probe.json` 記錄缺陷區 418 個陡壁點完全沒有被修，該檔已標成 v3 歷史。v3 完整來源、QA、瀏覽器畫面與建模程式在 `iterations/rejected-normal-gated-band-v3`。

v4 從不可變 pre-sculpt 位置開始，採單一連通背側 patch 的 XYZ biharmonic 修形，固定外部與 761 個邊界 collar 點，調整 21,180 點。完整 ROI 與可動內部均為一個連通分量；最大移動 0.040298，線性求解相對殘差 6.56e-15。這是固定位置並懲罰邊界彎曲，**沒有聲稱精確約束法線或切線**。獨立顧問從七個同構圖視角確認暗槽消失、曲面連續，沒有新增平台邊。

solver 的三角面取自 pinned v3 GLB，透過位置雙射對回未雕修點；NPZ 不含面，不能稱為獨立 topology parity。builder 重新載入原始 GLB、清理後，逐值驗證 pre-sculpt 點一致才套用修形；原先 CMC 收整保留。腕口切在假內蓋以上，只有一圈開放邊界；可見的內側掌面不當成另一個封蓋。

Blender 正常 n-gon 曾在 GLB 匯出時切成一個零面積三角形；改為來源先明確 BEAUTY 三角化後消除。`qa/degenerate-probe.json` 明列 historical/v2 與當時兩個 SHA，不能當作最終版失敗。

## 實際驗證

- 3 個 fairing 測試通過：清除局部摺痕並保持外圈位置、拒絕空 patch、拒絕只有 collar 的離散孤島。孤島案例先實際以 `ValueError not raised` 失敗，再修正完整 ROI 檢查後通過。
- 最終 GLB 4 個幾何檢查通過：0 個面積小於 1e-12 的面、單一腕口 cycle、無其他 nonmanifold edges、983 點腕環共面誤差 1.51e-7。刻意開放的腕環不算已具厚度袖口。
- 189,706 個 protected 點、85,289 個指部點及 32,907 個主掌面點，作者位置變化與實際 GLB 最近點距離均為 0；所有作者點對匯出最大距離 3.44e-8。這只驗位置保留，沒有證明自交、拓撲語意或動作品質。
- 同原始 framing 的七個 Blender 視角；真實 Chromium 四視角、旋轉／暫停、滑鼠拖曳、390×844 無橫向溢出、參考圖載入、503 錯誤路徑皆通過。實際載入 GLB SHA 一致；250,471 個有效法線，0 page errors。
- Khronos validator 0 errors／0 warnings／0 hints；strict TypeScript 通過。此輪只動 factory 與本機預覽，沒有新的全站、完整 RTS 或效能驗收宣稱。

原始輸出、命令及退出碼見 run 的 `qa/release-results.json`；視覺與工具獨立檢核分列在 `qa/visual-review.json`、`qa/independent-review.json`。

## 接續關卡

建立原創可變形 retopo，重塑四個 MCP 體積與關節環，不直接把平滑背側逐面照抄或自動減面交付。重建腕口厚度／滾邊並配合人物袖套，適配原創 16 骨手部骨架，驗 open／half／grip，再做左右手、UV、材質與整體人物預算。

原創弩兵裝填、取箭與握持接觸、釋放時序、五動作、各兵種 3D 肖像及完整人物效能仍未完成；地圖岩壁、河岸、遺跡和其他兵種品質也仍在原始目標內。前次灰脊松林已接入，不能把此次單一手套修形當成角色與地圖需求完成。
