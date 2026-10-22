# CS 地圖細節與效能實作計畫

> 主代理執行程式優化；美術使用獨立工作樹。使用者已授權既定 CS2／CS:GO 方向的細節與效能改善。

**目標：** 增加玩家高度可見的舊城細節，實測降低單人遊玩幀時間。

**架構：** 保留 Three.js 與純邏輯引擎、既有碰撞／AI 規則；依單因素 profiling 調整 GPU 工作量，消除每幀資源重建。美術沿用 Blender 與登錄的 CC0 PBR，加工到新 v4 run，不覆蓋 v3 證據。

**Spec：** `docs/superpowers/specs/2026-10-03-browser-cs-design.md`。

**基準：** `ad4bee26`；主工作樹 `cs`，美術工作樹 `cs-detail-perf`。不修改入口其他工作，不發布網站。

## 範圍與驗收

- [x] 新 profiling harness：1280×720、1920×1080、1080p DPR 1.5，同驅動／6 actors／固定視角。記 RAF mean/p95、CPU 提交時間、draw/triangles、SHA；比較原版、高畫質單因素、最終版。禁止用不同 GPU 路徑證明產品改善。最終 runtime SHA 已與兩種量測核對。
- [x] 先寫失敗測試：高 DPI 像素預算、低／高畫質切換與 resize、陰影更新和射擊資源生命週期。依量測實作半解析度 AO、陰影工作減量與解析度預算；保留動態角色陰影與瞄準。
- [x] HUD 保留節點，只有內容變更才寫入；測試擊殺消失、計分同步與重新開局。CPU AI 改動只在有量測證據時加入。
- [x] Blender 新 v4 候選：局部破損石材、門窗／鐵件與街面細節；降低密集百葉等無效幾何。維持 9 個碰撞 footprint、來源／材質／幾何契約；空間分塊只在同場景實測較快時採用。
- [x] 真頁操作移動、購買、射擊、換彈、瞄準、暫停與畫質切換；capture 出生、A/B 點及近景，獨立視覺檢核後本機替換 runtime。
- [x] 執行全套 Vitest、相關全瀏覽器 e2e、type-check、build 與專案收尾測試，記錄失敗與限制；獨立程式審查，交付 preview、截圖、同條件前後數據。全站 e2e 仍有失敗，不代表全站驗收通過，詳見下列紀錄。

## 特別回歸

1. 視窗縮放或 DPR 改變時 render targets 尺寸一致，低畫質不偷偷執行 AO。
2. 角色移動、死亡與新回合必須更新陰影；AO normal pass 不重算同一幀陰影。
3. 射擊後曳光線消失，反覆射擊不累積 GPU geometry/material。
4. HUD 換隊／新局／計分板／feed 逾時仍正確，同值無 DOM 重建。
5. 細節不擋行走或射擊、不增加未授權外部素材；可用品質不能只靠機械 QA 宣告。

## 執行紀錄

- 開工工作樹只有既有 ` D node_modules` 環境差異；不納入本次 commit。
- 程式巡檢：4096 陰影、全尺寸 SSAO、4x HalfFloat MSAA、高 DPR 疊加；HUD 每 80ms 重建 6 列表格。原因仍待單因素實測。
- GPU 單因素量測：主要瓶頸為 4x HDR MSAA；關閉後 1080p 大部分幀回到 16.7ms。原 771 draws 包含重複陰影；once-per-frame 後減少約 190 draws。CPU 提交約 3–6ms，無證據需要改 bot 決策頻率，因此維持 AI 行為。
- 實作：保留 HalfFloat HDR，以 OutputPass 後 FXAA 替換 MSAA；SSAO 半尺寸；陰影 2048、每幀只更新一次；高／低像素上限分別 1920×1080／1280×720。曳光改共用可增長 LineSegments buffer，HUD 重用節點。
- TDD：HUD 3 cases 原行為 2 fail/1 pass → 3 pass。renderer 3 browser cases 原行為 2 fail/1 pass → 3 pass（buffer 預算、陰影更新／曳光資源、quality resize）。
- 實際截圖發現 Three 0.182 對 PCFSoftShadowMap 採 BASIC shader；改為 PCFShadowMap/radius 1.5。新增 actual compiled shader 檢查 false（RED）→ true（GREEN）；重跑全部 3 renderer e2e 通過。拒絕影像保存在 `v4-environment/qa/rejected-shadow/`。
- 預備量測均維持 60Hz 封頂；舊 baseline/ablation/renderer-optimized/final-candidate 為診斷中間資料。最終數字僅採含 source/model SHA 的 `v4-performance/qa/final.json`。raw baseline renderer 與 ad4bee26 只差 import 路徑。
- 完整 Vitest 預設 workers 首次 1 個 Pixi import 超過 5s（1239 pass/1 timeout）；控制並行度 `--maxWorkers=4` 後完整 111 files / 1240 tests 全通過（25.83s）。沒有放寬斷言或 timeout。
- build 成功；完整全瀏覽器 Playwright 以 4 workers 執行，最終結果見下。
- 獨立畫面檢核找出地面薄片朝下的回歸；新機械 QA 在舊候選失敗（normal Y=-1），修正後 702/702 鋪面頂點朝上。來源 .blend 打包 15 張貼圖，單獨搬移開啟 15/15 通過。候選 SHA `1b91f28e11f502277d817c4f53755c15f46ca2dcaeaac7f205f8cef029806348`。
- 獨立 consultant 六鏡位最終視覺 PASS；陰影柔化、地面亮度／接縫與新增細節均無阻擋項。本機 publisher 核對 capture／review／機械 SHA 後已替換 runtime；使用者審核仍 pending，沒有外部發布。
- 四槍以真正遊戲頁操作購買／出擊／射擊／換彈／瞄準／暫停，4/4 成功、無 browser errors，模型 SHA 對應最終候選；狙擊槍透過實際回合獎金取得購買金額。
- 額外修正快速按 R 漏輸入：以暫停 RAF、在兩幀間送原生 keydown/up 的測試先重現失敗；加入 reloadPending 並於 simulation step 後清除，pause／new match／round change 會取消。獨立 consultant 精準檢核 PASS；測試拆成新局，避免測試角色被 bot 擊殺後無法第二次射擊造成 fixture 失敗。
- 最終 CS 專項 19 passed / 36 skipped（既有 desktop Chromium 遊玩範圍，fallback／裝置告知跑全部瀏覽器）；加強恢復後 phase／health 前置條件的兩個 regression 再跑 2/2 pass。
- 最終 build exit 0（56.08s），CS TypeScript 檢查與 git diff --check 通過。Preview 與近景截圖 URL 都回傳 HTTP 200。
- 最終完整 Vitest 使用 `--maxWorkers=1` 控制並行資源，111 files／1240 tests 全通過（98.32s）。先前和全站瀏覽器同跑的 4 workers 曾遇到 Pixi import 5s timeout；未放寬 timeout 或修改其他遊戲測試。
- 全站瀏覽器測試執行 59.52 分鐘：2170 tests，1876 passed／164 failed／130 skipped，runner errors 0。失敗依 spec／browser 摘要存入 `v4-performance/qa/fullsite-regressions.json`；沒有同條件基準的項目不推定為既有問題。此 sweep 開始於最後模型發布／R 修正之前，最終 CS 變更以專項 19 passed 與加強後兩項 regression 為準。
- 所有瀏覽器測試結束後單獨量測：Intel Graphics／D3D11，最終六個固定場景平均 16.666ms、p95 16.7–16.8ms；1080p 高畫質原本平均 61.219ms。高畫質合計 draws 771→585，triangles 717992→437427；環境本身 110076→75506 triangles、9149120→7192212 bytes。
- 真頁高／低畫質各測 600 多幀，平均 16.693ms、p95 16.8ms，最慢 33.3ms；原生 Pointer Lock 轉向 91 events，移動／射擊／換彈／瞄準／暫停均成功，採樣全程 live、hp=100，browser errors 0。採樣資料記錄所有模型及 renderer／client／HUD／AI 的 SHA，均與 runtime 相符；60Hz RAF 封頂不代表所有硬體保證 60 FPS。
- Bundle integrity 全通過，runtime 14,276,052 bytes；本機發布契約已標示可用，人類審核仍 pending，沒有 push 或外部部署。完整驗證紀錄在 `v4-environment/qa/verification.json`。
- 網址檢查曾產生未追蹤的 `NUL` 暫存檔；自動審核以 blocked by policy 拒絕清理，未重試繞過。此檔未被 runtime 引用，也不納入提交。
- 獨立全站報告抽驗有效：164 異常含 163 failed＋1 timed out，無 runner／JSON 解析問題。CS 有兩項預設路徑逾時（換彈最終完成但超過 4 秒、重新開始 click 超過 60 秒），三項 renderer 檢查全過；資源競爭僅列為推論。其他失敗抽查亦為真實斷言／runtime 問題，未歸因。詳見 `v4-performance/qa/fullsite-review.json`。
