# 原創手部低模基底交接（2026-10-07）

使用者要求模型、骨架與動作全部原創。本輪沿用本專案原創高模，以來源曲面重建低模；沒有引入素材庫手模、骨架或動畫。**目前只條件接受靜態基底進入局部關節重拓撲，整體仍為 `qa_failed/runtime_publish_allowed=false`。**

- 工作樹：`C:/Users/bag57/projects/super_galen_site/.claude/worktrees/rts`，`feat/browser-rts`。保留既有工作，沒有 push、部署或正式人物換版。
- [可旋轉低模](http://127.0.0.1:4334/glove-retopo/)／[實際 Chromium 截圖](http://127.0.0.1:4334/glove-retopo/still.png)／[來源高模比較](http://127.0.0.1:4334/glove-refinement/)。頁面明列尚未綁骨、沒有開合動作。
- Run：`art-factory/rts/runs/original-glove-retopo/2026-10-07-v1`。狀態與命令證據見 `qa/release-results.json`；當前檔案封存雜湊見 `qa/evidence-sha256.json`。

## 現在可續用的版本

| 資產 | SHA-256 |
|---|---|
| 原創 v4 sculpt GLB | `1c6e1129c1fa00c9839ace8fd3ef1fea233740b77814a22c9b4c266744ea60b0` |
| `candidate/quad-base.glb` | `532b84f70b0856260ca57a0f617f85b683c02dea956dcc1fe590bb0ac85b98fb` |
| `candidate/quad-base.blend` | `5bce5971e1482eadc9a81d5ed82f251007873221d40708cbeedcc30bc805d7e9` |

當前 1,250 vertices／2,461 triangles；Blender 來源保留 1,229 quads 加 3 triangles。單一開放腕環 37 edges，0 bones／0 animations，沒有 UV 或正式材質。保留五指、U 形指蹼與虎口來源輪廓，不能把自動重建面流當成完成的可變形網格。

## 失敗路線與修正

1. Source-fitted grid 的兩次完整試作，開掌非相鄰交點由 195 降到 81，握拳仍失敗。根因是掌面格線與直弦拇指接面無法表達原始虎口曲面。停止此路線，兩版來源、模型、程式及 QA 保留於 `iterations/rejected-port-order-v1`、`iterations/rejected-grid-port-v2`。
2. Blender Quadriflow 最初誤報 manifold preflight。實際來源的 4,361 條短邊觸發其絕對 `1e-4` 座標門檻；工作座標放大 100 倍後執行，完成後還原來源單位。診斷及上游程式來源見 `qa/quadriflow-preflight-diagnosis.json`，沒有改動 Blender 或來源高模。
3. 第一個重建結果除了腕環，另有 Ring 側 3 點小孔；把所有邊界投影到手腕會拉出長刀片，實際 GLB 有 101 個交點。此版隔離於 `iterations/rejected-unclassified-boundary-quad-v1`。目前按來源腕環距離辨識真正腕口，小孔僅在原位置投影來源曲面後補面，實際 GLB 複驗恢復唯一腕環、0 個採樣交點。

上一版 grid 的動畫、候選與九張姿勢圖已由 active `raw/candidate/qa` 移到對應 iteration 的 `active-root-leftovers`，16 個移動檔案均逐一核對未改雜湊。`raw/source-landmarks.json` 只保留原創位置、尺度與骨段作距離量測分區，不代表目前已綁骨；不再讀取失敗網格的拓撲。舊動畫檢查不可作為當前低模的動作證據。

## 實際驗證與限制

- 2 項截面數學測試先紅後綠：非對稱閉合截面取樣、拒絕不包含原點的截面。這是歷史 grid 工具的測試，不代表 quad 動作通過。
- 當前實際 GLB 的 8 項靜態檢查通過：單一曲面、單一腕環、無其他非流形邊、法線繞序一致、無近零面、無測得非相鄰非共面交叉、低於 4,000 triangles、disk topology。交叉演算法不涵蓋全部共面重疊情況，沒有宣稱數學上的全面無自交證明。
- 原創高模與低模做雙向**頂點至曲面**距離量測。最差區域 p95 為 0.0150222 來源單位，最大 0.0554149；以規劃的 0.105 m／來源單位換算約 1.58／5.82 mm。這是量測，沒有距離合格門檻，不是完整 Hausdorff 距離，也不是最終人物尺度。區域來自座標與最近骨段分區，非語意分割。
- 七個同構圖 Blender 視角與四個實際 Chromium 視角；旋轉／暫停、滑鼠拖曳、390×844 無橫向溢出、原創參考圖載入、真實 HTTP 503 失敗路徑皆通過。瀏覽器收到的 GLB SHA 一致、1,250 個有效法線、0 page errors。
- Khronos validator：0 errors／warnings／hints；review 入口 strict TypeScript 通過。這輪只變更 factory 與本機獨立預覽，沒有新的全站、完整 RTS 或效能通過宣稱。
- 獨立唯讀視覺顧問條件接受作局部關節重建基底；另一次來源／工具稽核確認當前候選、preview 與幾何證據一致，提出的狀態缺漏、歷史動畫混用已修正。

## 下一個有限製作包

以當前 `.blend` 的真實曲面為底，局部整理 MCP／PIP／DIP 關節環，將極點與三角面移離彎折帶；補腕口厚度並固定袖口接合區。接著適配原創 16 骨、連續權重與原創開掌／半握／握持，密集檢查變形、穿透及 Blender → GLB → Three.js 一致性，再做 UV／材質、左右手與全身預算。不要回到已失敗的 grid-port 拓撲或以素模宣布商用美術完成。

弩兵裝填／取箭、弩弦與箭矢機構、實際釋放時序、各兵種整體人物與五動作、3D 肖像品質及岩壁／河岸／遺跡等地圖美術仍屬原始目標；單一手套基底並未完成整個遊戲。
