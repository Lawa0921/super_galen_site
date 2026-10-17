# 地圖區域景觀改善（2026-10-07）

依使用者「畫面空曠、景物重複，缺少地標與區域特色」改善地圖，人物模型與動作維持目前版本。來源規格仍為 `docs/superpowers/specs/2026-10-04-browser-rts-design.md`。

- 遊戲：<http://127.0.0.1:4324/games/rts/>
- 前後對照：<http://127.0.0.1:4334/landscape-districts/>（開局是正常視野；全景只為景觀檢視而揭露霧）
- 實際 workspace：`C:/Users/bag57/projects/super_galen_site/.claude/worktrees/rts`，`feat/browser-rts`。延續既有大量未提交工作，未提交、推送或部署。

## 本輪變更

- 谷地使用較綠草地、深色林地、花／蕨叢及蘆葦河岸；隘口保留灰礫地與松林，以草叢和立石區別。
- 新增原創生成的石拱、破塔、立石、棄車，兩圖各四處。使用固定相機插畫卡片，具有完整 3.8m `blocked/noBuild` 足跡，沒有可操作建築的旗幟或隊色。
- 低矮植被為 819／633 株的成片分布，遵守探索視野、道路與資源間距，新建築覆蓋後隱藏；不攔截滑鼠、不消耗模擬 RNG。
- 既有樹木、資源數量／位置、主路與橋梁未移動。原玩法改善仍保留。

## 資產與淘汰證據

兩張 1024² RGBA WebP 共 1,628,284 bytes，來源為 builtin imagegen 原創，不引入外部兵種或授權素材。原圖、prompt、裁切／去背腳本與明暗底 QA 均保留於 asset factory。

| Runtime | SHA256 |
| --- | --- |
| `terrain/valley-undergrowth.webp` | `7d3c66b1c24c1c1bb8304eac0282fde70b1f50713fbfa92447fc04f85d147f27` |
| `terrain/kingdom-ruins.webp` | `45f731c828b1905a0c538a51d6e5e3c86b66fddd764ef1f35b926cccb7f004a3` |

Factory runs：`art-factory/rts/runs/landscape-{districts,landmarks}/2026-10-07-v1/`。正式 registry 為 `art-factory/rts/manifests/terrain-registry.json`，runtime gate 為 `public/assets/games/rts/model-registry.json` 的 landscape 欄位。HTTP 下載 SHA 與 runtime 檔案一致，證據 `landscape-districts/.../qa/published-paths.json`。

第一版交叉草卡與靜態可建造塔因視覺和操作語意不合格，留在 `qa/candidate-assembly`，未以該組装發佈。第二版改為面向固定相機的單卡；第三版再調整成片分布及地表配色。原創原圖未重畫或覆蓋。

## 驗證

- Vitest：138 files／1,423 tests passed，34.68 秒，native exit 0；`tmp/rts/districts-final-vitest-native.log`。獨立複審追加的兩圖逐格足跡檢查另跑 5/5，`tmp/rts/districts-footprint.log`。
- RTS 全部來源、相關 e2e 與 manual scripts strict TypeScript：exit 0，`tmp/rts/districts-final-types.log`。本專案無 ESLint／Prettier。
- Chromium 12/12 E2E，1.7 分鐘：採集入庫、資源集結、小地圖命令、建造、科技、招募、暫停／重開與退出，`tmp/rts/districts-e2e.log`。
- 正式資產兩圖 WebGL 組裝：正常初始只顯示一處遺跡，全探索顯示四處；工人滑鼠採木至耗盡、12 棵資源樹與木堆同步消失；page errors 均空。證據 `qa/published/assembly.json`。耗盡情境將木量設為四，故不是自然完整戰役證明。
- Production build：27.78 秒、exit 0，`tmp/rts/districts-build.log`。首次誤用舊版 CLI 路徑無法啟動，改依已安裝 Astro 的 `bin/astro.mjs` 完成。
- Production 本機 gzip HTTP 首圖：遊戲資產 31,913,293 bytes，低於 35,000,000 上限；49 個請求含兩張新 atlas，實際動態大頭貼通過、page errors 空。`tmp/rts/download-budget.json`。未宣稱外站 CDN 壓縮已驗。
- 對照頁兩圖／兩視角切換及全部圖片載入通過，`qa/review-gallery.png`。
- 本輪 tracked source 的 `git diff --check` 通過；整個既有 dirty worktree 另有舊 `tests/manual/rts-performance-fixture.ts` CRLF whitespace 提示，未順手改寫。
- 大量單位效能：RTX 5090 Laptop／1920×1080／80 單位＋20 建築全部在畫面、騎士動態大頭貼開啟，暖機後 60 秒 median **80 FPS**、p95 **20.8ms**、max **33.4ms**，page errors 空、native exit 0。達到 median ≥55 FPS／p95 <33ms；`qa/performance/performance-release-formal-dedicated-portrait.json`。這是指定硬體的負載情境，並非其他 GPU 保證。

## 獨立檢核與限制

唯讀 consultant 檢查 v3 開局／全景／森林圖及程式，原交叉 X 和功能塔兩項 P2 已解除；追加要求為修正單卡 contract 及逐格足跡驗證，均已處理。紀錄 `qa/independent-review.json`。

地標是固定相機插畫，非可旋轉 3D 模型；遠景的棄車／破塔仍偏小且低對比，未投射動態陰影，近景仍有插畫感。這輪為可檢視的地圖改善，使用者整體美術接受仍待回饋；人物品質與窄路群兵避讓不是本輪已解決項。未重跑兩場自然完整玩家戰役；本輪導航、AI 回歸、兩圖實際採集及 Chromium 流程均已重驗。
