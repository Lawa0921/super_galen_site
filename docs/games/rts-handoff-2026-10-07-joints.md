# 原創手部關節與變形交接（2026-10-07）

本輪把原創靜態手套推進到四指關節環、16 骨綁定與可播放的原創開合。**局部指節可續用，完整握持仍退回；整體 `qa_failed/runtime_publish_allowed=false`。** 沒有換入正式人物，沒有 push 或部署。模型、骨架、動作均沿用本專案原創來源。

[實際互動預覽](http://127.0.0.1:4334/glove-joints/)／[Chromium 截圖](http://127.0.0.1:4334/glove-joints/still.png)。可切張手／半握／握持、播放暫停、拖曳時間軸與旋轉；畫面明列握持變形未通過。工作樹仍是 `C:/Users/bag57/projects/super_galen_site/.claude/worktrees/rts`，`feat/browser-rts`。

Run：`art-factory/rts/runs/original-glove-joints/2026-10-07-v1`。完整命令、成功與失敗分列於 `qa/release-results.json`；封存指紋見 `qa/evidence-sha256.json`。上一版靜態基底及其證據保持不變。

| 當前檔案 | SHA-256 |
|---|---|
| 靜態 `joint-surface.glb` | `a67b3dfd55406ae7e29a4ce7328f6874530c28df8440f2b80d01594091fe08e4` |
| 靜態 `joint-surface.blend` | `a2bd740041e6eca0bd929b0d81c2372e7ea9b17cb67cdd26402e507249281199` |
| v3 `joint-rig.blend` | `ebd8bc8b462538eec0bd9829ce29c8d42ace7ee2083582e2e9ea2d68e99da5bc` |
| v3 動畫 `glove-l-lod0.glb` | `3392dd48a87b2d61a6d9f0ae2673cb68effb3024427985d769e86c766b416dba` |

## 幾何與來源

保留原創 quad base 的掌面／虎口與 827 個原始頂點。四指以實際原創高模橫截線重建 PIP／DIP，共 8 個中央關節環，每環前後各一個 12 點支撐環，總計 1,456 vertices／2,873 triangles。當前腕口仍是 37 edges 的開口，沒有厚度、UV 或正式材質。

實際切面探查發現 Index／Middle 到來源 Z=.330 仍連通，不能使用共同 .285 切面；因此兩指改在 .345 接面，Ring／Little 保留 .285，避免為切面移動小指關節。保留真實邊界循環順序；Middle 邊界局部凹入，使用周長參數接環，沒有強行按極角排序改變拓撲。原始高模、前版 quad blend 均固定雜湊。

靜態 GLB 的 10 項檢查涵蓋單一曲面、單一腕環、流形／繞序、近零面、非相鄰非共面交叉、預算、Euler disk、protected 頂點至實際曲面距離與實際關節帶。**827 點距離 0 只證明位置保留，並非整片曲面的逐面或法線一致。** 關節帶透過雙射位置映射，逐格驗證中央環與兩側支撐環的每個 quad 在 GLB 中都有對應兩個三角面。

## 原創綁定與已修正的局部折穿

四指 PIP／DIP 中心取自原創截面的面積質心；MCP 是近端中心線外推，拇指仍用原創臨時位置，兩者尚未核准。各骨屈曲軸由 rest 方向與掌側／對掌方向建立，保留原創 2 秒時間曲線；舊 curl 幅度暫作深彎紅燈基準，不能當作已接受的握持目標。

- v1 使用世界 Z 的固定窄權重帶，半握 58、全握 382／384 個交叉，已保存在 `iterations/rejected-narrow-z-binding-v1`。
- v2 改沿局部軸、依截面半徑定寬，且作者檔先限制為四個正規化權重，避免 GLB 匯出才截掉影響。半握同指折穿消除，但 Index／Middle 單獨 PIP 深彎仍各有 14 個交叉；完整半握 30、全握 300／302。此版、預覽與診斷保存在 `iterations/rejected-radius-heuristic-binding-v2`。
- v3 用二骨平面 LBS 的局部 Jacobian 定出 smoothstep 過渡半寬：`h > 1.5 × r × tan(最大角度 / 2)`，加 15% 裕量。原 `1.15r` 在 86° 內側的數值 Jacobian 為 -0.1157，回歸先紅；修正後 5 個數學／接環測試通過。這只適用理想二骨平面模型，不是整隻手的碰撞或多骨變形證明。

v3 五指第 2／3 關節，每個取 33 個角度，共 **330 個實際 Blender 單關節姿勢，0 個測得交叉**。獨立顧問接受保留四指 PIP／DIP 關節環及此局部權重成果。這不是 MCP／CMC、PIP+DIP 複合動作、隔離姿勢 GLB parity 或完整握持驗收。

## 完整動作仍失敗

當前完整 OpenClose 的 Blender 七姿勢測試：開掌 0、半握 30、全握 263／265；實際 GLB 重新匯入後同樣測試：開掌 0、半握 30、全握均 267。兩條命令退出碼均為 1，失敗原樣保留。這些是交叉三角形配對數，不是穿透深度或失敗姿勢數。

主要殘留為 Thumb 與其他指頭交叉、Middle3 壓進掌面、MCP／CMC 掌根變形。MCP 權重仍依世界 Z 與 XY 高斯分配；Thumb1／CMC 仍是固定 XYZ mask。不要把單關節成功推廣成全手成功，也不要只擴大權重來掩蓋過深的握持目標。

## 實際匯出與瀏覽器驗證

- 左手 LOD0 的 385 個 1/8 幀姿勢，Blender → 實際 GLB 匯入比對通過；rest 頂點雙射，最大頂點位置誤差 2.03904e-6 m，skin matrix 誤差 1.35042e-6。此檢查是位置／skin parity，未涵蓋右手、其他 LOD 或變形後三角化方式完全相同；兩者完整碰撞數已分開記錄。
- Chromium 實際 GLB：3 姿勢 × 4 視角共 12 張，16 骨、2 秒動作、雜湊一致；播放暫停、實際 skin 頂點變動、時間軸、拖曳視角、390×844 無溢出、中文未損壞及真實 503 失敗路徑通過，0 page errors。
- Khronos validator：0 errors、1 個 `NODE_SKINNED_MESH_NON_ROOT` warning；父節點變換的 runtime 契約尚未驗證，不宣稱 runtime 安全。strict TypeScript 通過。此輪僅 factory 與獨立本機預覽，沒有新的全站、完整 RTS 或效能通過宣稱。

## 下一個有限製作包

先獨立轉各指 MCP 與 Thumb1／CMC，定位掌根折穿與跨指權重；改成符合原創掌部曲面的局部軸／連續權重。通過後檢查同指 PIP+DIP 的複合彎曲，再針對實際弩握把建立原創握持路徑與接觸目標，獨立安排拇指對掌時序。保留已通過的 PIP／DIP 基礎；不要重回已淘汰 grid-port 掌面或繼續盲調舊 curl。

手腕厚度、材質、左右手／全身接合、弩兵裝填與射擊時序、其餘兵種及 3D 肖像品質、地圖岩壁／河岸／遺跡仍未完成；全原創與可商用品質的原始目標保持不變。
