# RTS 庭院、屋面與組裝輸出細修交接

2026-10-08，`feat/browser-rts`，原 worktree 的既有修改保留。五個模型與一張土面圖片已接入本機遊戲，未 commit、push 或對外部署。這是有限範圍的美術與效能改善，整體人物造型與美術接受度仍未完成。

- [本機遊戲](http://127.0.0.1:4324/games/rts/)
- [前後比較、五種角色動作與零件庫](http://127.0.0.1:4334/assembly-refinement/)
- [工坊截圖](../../art-factory/rts/runs/assembly-refinement/2026-10-08-v2/qa/workshop-after.png)
- [河谷對局截圖](../../art-factory/rts/runs/assembly-refinement/2026-10-08-v2/qa/candidate-battle/river-base.png)

## 實際變更

兵營、馬廄、工坊由大面積淺色底座改為土質庭院，保留入口高度與遊戲占地。1 m 石緣、角石與三段台階跨三棟共用，來源保留在 linked Blender 零件庫與配方。屋坡的面朝向、原 UV 對應及法線已修正；補真正封閉、使用原始石材貼圖的山牆；工坊四根木柱頂部按實際斜屋面接合。

衛兵雙 LOD 核心依材質合批，由 30 降至 11 primitive，劍、盾與 GuardBody 節點仍獨立。逐三角面的位置、法線、UV、蒙皮權重及動畫資料保持相同；未將合批當成人物造型重製。相容的衛兵／弩兵 LOD 共用每個單位自己的骨架與 mixer，必須先通過根變換、骨架、bind 與動作相容檢查。不同單位仍獨立播放。

視野圓改用逐列填入，保留舊逐格檢查的格中心邊界、歷史探索與更新頻率；獨立比對 21,384 組輸入一致。

## 驗證結果

| 範圍 | 實際結果 |
| --- | --- |
| Python 組裝／幾何契約 | 19 項通過；含原有模組契約 9 項 |
| 全套 Vitest | 142 檔、1,441 項通過，`--maxWorkers=4` |
| RTS strict TypeScript | exit 0；ES2022、Bundler、DOM／DOM.Iterable |
| Production build | `npm.cmd run build` 通過，27.49 秒 |
| Chromium 操作 | 13/13 通過，含雙圖集結、採集入帳、建造、訓練、付費科技、英雄、暫停及返回選圖 |
| 五個 GLB 格式 | 0 errors、47 warnings；保留產生切線等既有格式警告 |
| 衛兵動畫保留 | 雙 LOD、五動作、五時間點，共 50 姿勢，蒙皮位置一致 |
| 共用骨架實際 WebGL | 衛兵／弩兵 30 組動作時間點，LOD 來回切換最大位置誤差 0，bounds／bind 保留 |
| 雙圖組裝 | 無瀏覽器錯誤；迷霧與採木耗盡仍正確隱藏資源植被 |
| 首圖下載 | 正式靜態 build、gzip level 6：32,475,157 B，低於 35 MB；動態工人肖像通過 |

最後兩次預設並行的全套測試均為 1,440/1,441：唯一失敗是既有 Tetris Pixi 動態 import 超過 5 秒。該檔單獨 12/12 通過；全套限制四個 worker 後 1,441/1,441 通過，沒有更改測試、逾時或斷言。兩次失敗紀錄一併保留。

正式 minified production build 的壓力量測：1920×1080、DPR 1、80 單位和 20 建築全部在畫面內、騎士動態肖像、60 秒、RTX 5090 Laptop GPU。3,348 幀，median **59.8802 FPS**、p95 **25 ms**、最大 **104.2 ms**，世界 946 draw calls、肖像 10。通過既有 55 FPS／33 ms／500 ms 門檻；不外推至未測硬體。

先前開發模式候選約 48 FPS 的失敗量測仍保留。最終版同時包含骨架共享、視野填入與正式 minification，不能將前後數字宣稱為單一改動的提升比例。17 個載入 GLB 的 SHA 經核對；五個候選發布後與 public、靜態 build、registry 及性能報告完全相同。

## 證據與來源

本輪根目錄為 `art-factory/rts/runs/assembly-refinement/2026-10-08-v2/`。

- `kit.json`、`raw/source-lock.json`、`recipes/`、`raw/kingdom-kit.blend`：可編輯來源與來源鎖；只發布三棟，其他配方為來源參考。
- `raw/before/`：改前五模型與 registry；比較頁的「細修前」使用此快照。
- `qa/publication.json`：精確發布範圍與新舊 SHA；`qa/final-verification.json`：最終檢查、來源摘要及日誌索引。
- `qa/preview-browser.json`、五組 before／after PNG、`qa/candidate-battle/assembly.json`：實際瀏覽器檢核。
- `qa/guard-bake.json`、`qa/guard-animation-parity.json`、`qa/shared-rig-browser.json`：合批和動作不變量。
- `qa/performance-production/performance-assembly-candidate-formal-production-dedicated-portrait.json`：正式效能原始數據。
- `qa/download-budget-published.json`、`qa/verification/`：接入後下載與測試日誌。
- `qa/root-review.json`：獨立視覺及程式檢核；根變換檢查已補強，bind state 對調疑慮由獨立蒙皮位置測試排除。

## 保留限制

人物比例、衣甲、臉部與完整動作沒有全面重做；馬廄草堆仍過於方正，部分石緣偏厚。這輪沒有全面翻新地圖或提供任意牆體編輯器。原 `modular-kingdom/2026-10-08-v1` 的 13 模型效能失敗紀錄仍成立，本輪只衍生並發布上述三棟。瀏覽器及下載均為本機驗證，沒有測部署 CDN。
