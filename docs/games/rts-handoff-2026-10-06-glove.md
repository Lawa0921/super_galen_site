# 原創可動手部交接

模型、骨架與動作全部維持原創。重建左右手的連續手掌與五指、每手 15 根指骨及 2 秒開合動作，取代原先不能張開的固定閉拳。**這是可續用的手部動作基礎；手套外觀、人物接合和握弩裝填仍未完成，contract 維持 `qa_failed`、`runtime_publish_allowed=false`。**

[可操作預覽](http://127.0.0.1:4334/articulated-glove/) · [實際瀏覽器截圖](http://127.0.0.1:4334/articulated-glove/still.png) · [瀏覽器播放錄影](http://127.0.0.1:4334/articulated-glove/playback.webm)。可切換左右手、兩種精細度與視角，播放或拖曳時間軸。遊戲仍在 [4324](http://127.0.0.1:4324/games/rts/)；正式人物未換版。沒有 commit、push、merge 或對外部署。

工作樹 `C:/Users/bag57/projects/super_galen_site/.claude/worktrees/rts`，分支 `feat/browser-rts`。Run 為 `art-factory/rts/runs/original-articulated-glove/2026-10-06-v1`；固定六個檔案 SHA、實際驗證與限制見 `qa/authoring.json`、`qa/release-results.json`、`qa/root-review.json`。來源是上一輪原創弩兵 Attack blend，SHA `5ab95a9b070d33a83ccc871ce092414ad513804152fc38e73f70b02556117c37`，保持未改；只重用本專案 imagegen 原創 leather tile，來源權利／prompt 見 contract 指向的 provenance。沒有外部手模、rig、mocap 或動畫。

## 已修正與實測

舊手的手指互相連成環，genus 為 8，無指骨；baseline 正確失敗。新手為單一閉合 genus-zero 網格，固定腕口。最初兩骨拇指把約 81 度轉向集中在根部，造成掌面折穿；現以三根原創拇指骨分開對掌、MCP 和 IP 屈曲，保留約 40.5 度根部對掌與約 70.4 度 IP 彎曲。IP 權重過渡從約 9.8mm 擴為約 19.7mm，解掉末節內翻。LOD1 改由平滑表面減面，保留可彎曲的指節。

| 檢查 | 結果 |
|---|---|
| 原創網格回歸 | 3 tests 通過；新增第三拇指骨的測試先因 15／16 骨數差異失敗，再修至通過 |
| 真實 source topology | 四個網格均單一閉合 genus 0；每手 Hand＋15 指骨，共 16 bones |
| 表面變形 | 雙手／雙 LOD 共 388 個半幀姿勢，非共面三角交會、退化面、腕漂移均 0；體積為正，骨長與循環端點通過 |
| GLB round-trip | 四檔各 385 個 1/8 幀姿勢，共 1,540；最大矩陣差 1.37e-6，最大表面差 1.56e-6m |
| Khronos | 四檔均 0 errors，各保留一個 `NODE_SKINNED_MESH_NON_ROOT` warning |
| 真實 Chromium | 48 個姿勢／視角截圖，檔案 SHA、16 骨、播放暫停、時間軸、手機版皆通過，page errors 0 |
| 預覽文字 | 實際 DOM 的中文名稱、秒數及注入 HTTP 503 後的中文錯誤訊息通過；原始 TS 無 U+FFFD |
| Strict TypeScript | `original_glove_scene.ts` 通過；實際命令、輸出與來源 hashes 見 `qa/tool-verification.json` |

LOD0 每手 3,248 triangles，LOD1 每手 1,948。來源以 24 FPS、0–48 幀、每 1/4 幀原創 keyframes 製作，匯出維持 2 秒長度。檢查涵蓋半幀採樣中的手部非共面交叉，不代表連續時間碰撞證明，也不包含武器或全身接觸。

匯出 verifier 曾誤取 Blender import 建立的 `Icosphere` 骨骼顯示輔助球，造成約 1m 假誤差；已限定真正名稱及 armature 的手套 mesh，四檔實際表面一致。歷次失敗留在 `iterations/`；`qa/deformation-coarse.json` 是較早候選，最終以 `deformation-dense.json` 及固定 SHA 為準。

## 獨立檢核與後續

唯讀顧問抽驗固定 assets、dense deformation、GLB parity、validator、browser 與近景圖片，接受 standalone articulation 基礎；**商用外觀仍不通過**：指形偏均勻圓管、指蹼深尖 V、掌墊／指腹／關節和手套縫線不足；彎指是懸空的爪狀手勢，未證明實際夾持；LOD1 近景指尖有切面。預覽曾被誤報有替代字元，主代理查 raw UTF-8 與真實 DOM 證實沒有，不修改正確字串。

下一步優先修掌面與指形、手套結構和材質，再處理人物接合。保留這版可動骨架作基線，每次表面修改都重跑變形與匯出檢查。不要因零交點直接把候選放入 runtime。

弩兵整合將由原有 20 骨新增左右各 15 指骨，兩 LOD 必須保持同一 50 骨 hierarchy／bind。既有 Hand bind 不能直接當作新手掌語義座標；新手 X 跨掌、−Y 掌面、＋Z 指尖、腕口 0，需實際對齊握把及 sleeve。舊閉拳完全受 Hand 單骨影響，沒有可直接縫合的開口環；兩個 Hand 長約 0.1255m，新手連 cuff 約 0.18m，不能只按 bone 長度縮放就宣稱接合完成。

還需完成五個人物 clips、弩弦／箭矢裝填、真實握持接觸、攻擊釋放時序及肖像／80 單位效能驗證；地圖岩壁、河岸、遺跡與其他兵種品質仍在原任務範圍。本輪只改 factory 候選及本地 review，沒有重新宣稱全站、完整 RTS 或整體美術驗收通過。
