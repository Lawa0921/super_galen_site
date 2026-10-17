# 2026-10-07 原創河谷候選

此頁保留候選階段歷史證據。後續已接入本機遊戲，最新狀態與驗證見 [正式整合交接](rts-handoff-2026-10-07-river-runtime.md)；下列舊 hashes／測試數不代表目前版本。

完整目標仍是原創人類王國 RTS、對戰 AI、兩張小圖、全兵種原創模型／骨架／動作與會動的 3D 肖像，達到可商用品質。本包只改善雙河谷地；正式 runtime 未替換，人物品質仍未完成。

## 可操作成果

- 預覽：<http://127.0.0.1:4334/riverbank/>；可切原圖／候選、南北橋／全圖、全圖／已探索／開局視野、工人實際過橋。
- 截圖：<http://127.0.0.1:4334/riverbank/shots/walk-north.png>、<http://127.0.0.1:4334/riverbank/shots/candidate-overview.png>。
- 現有遊戲：<http://127.0.0.1:4324/games/rts/>。使用實際 RTS worktree，未占用其他分支服務。

河槽寬度 3–7.138m、水位 -.8m、河床 -1.25m；採原創生成地表材質與既有 192m 世界 UV。地表 2,716 三角面，保持一個地表 draw call。兩條橋路與基地位置保留；導航同步河槽。擴張金礦移至北 `(40.5,22.5)`、南 `(55.5,74.5)`，保留 ID、種類、數量；原礦模型侵入橋面，不能再宣稱資源座標不變。

原橋基底 y=2.695m，實際八塊拱形鋪石頂面為 2.8756–3.0095m；原 y=0 角色會走橋下。候選使用原 85 個 Blender 物件，調平八塊鋪石，橋寬倍率 1.4，整橋下移 2.690m。物件內頂點、面、UV、材質內容完全保留；只在 raw 保存後的匯出副本三角化／產切線。橋面 y=.005–.025m、欄杆內淨寬 6.048m，覆蓋既有 6m 導航走廊。道路在橋頭裁切，霧層貼合地表、水面與橋面。

## 最終資產與證據

- Run：`art-factory/rts/runs/riverbank/2026-10-07-v1`。
- 原橋 `.blend` SHA256：`116a2f8191236ac6a7b876a6c6cfc451378b1d1ee61d9192c4797ec7261dff84`。
- 最終候選 `candidate/stone-bridge-level.glb`：543,156 bytes、2,656 三角面、4 材質；SHA256 `1ba65f5121f2edb62577fd3ac779ce2c0b3962bfa43a3f006c8a7edc565317b2`。
- 新導航 blocked SHA：`17cb7ca91f7935d9730d518be650c847325487fbf07d89cd2be36c1b7f033e5e`。
- 新 noBuild SHA：`e041c72567f2399debfd2301d3d7c1c9a1511c003474f6700e03a6da05633283`。
- `qa/bridge-authoring.json` 保存物件移動與保留斷言；`qa/bridge-validator.json` 最終 0 errors、0 warnings、7 infos（未使用的 UV／切線及既有 NPOT 圖）。
- `qa/channel-browser.json`：8 張比較畫面、南北橋各 45 個橋面 ray samples、兩次真實 command／stepGame 工人過橋、3 種探索顯示、換圖、手機寬度；0 page errors。過橋是排除戰鬥的控制 fixture，不能冒稱完整自然對戰。
- `qa/release-checks.json`：候選 404 回復流程通過；原圖與候選各 180 frames，本機 Chromium p95 皆約 16.8ms；draw calls 132→134，三角面 457,433→460,825。這不是完整軍團壓力測試。

## 實際驗證

`node node_modules/vitest/vitest.mjs run --maxWorkers=4`：133 files／1,377 tests 通過，30.46s。包含 6 個新河谷測試；自然 AI 對戰於 447.75 模擬秒消滅未防守玩家，真實採集 2,610 金／930 木、訓練 7、建造 7，經濟帳一致。先前高並行輪有一個既有 Tetris import smoke 超過 5 秒，保留 `qa/full-vitest-timeout-attempt.log`；未修改其測試或 timeout，降低並行後全套通過。

嚴格 TypeScript 檢查所有 `src/scripts/games/rts/*.ts` 與 review scene：通過。編譯參數為 `--noEmit --strict --skipLibCheck --target es2022 --module esnext --moduleResolution bundler --lib es2022,dom,dom.iterable`。

`RTS_PORT=4324 node node_modules/@playwright/test/cli.js test tests/e2e/games-rts.spec.ts --config playwright.rts.config.ts --project chromium`：9 tests 通過；這是既有遊戲回歸，候選 UI 由上述專用 browser script 驗證。

獨立唯讀顧問依 review-pr 流程檢核方向、原碼與最終畫面，方向 PASS、無未解 P1/P2；欄杆淨寬 delta 複審亦通過。主代理抽驗原 bridge source、ray probes、最終截圖與報告。完整結果／檔案 SHA 見 `qa/snapshot.json` 與 `qa/independent-review.md`。

## 淘汰與剩餘工作

上凸拼接岸段像管子，保留在 `rejected/raised-sections`；未進 runtime。另一個 -.16m 淺槽缺乏視覺改善，亦未採用。最終 contract 為 `candidate/runtime_publish_allowed=false`，組裝 review 已提供使用者預覽。

正式接線時，需把純地圖 layout 與 Three.js geometry 分開，讓模擬不依賴 renderer；將候選地圖、橋 registry、實際場景／選圖縮圖共同換版，重驗自然對戰、採集擴張礦、多兵過橋與軍團效能。橋材質仍偏亮、岸坡細節尚可精修。第二張圖與所有人物／動畫／肖像品質繼續依原目標製作；未 push、部署或宣告全遊戲完成。
