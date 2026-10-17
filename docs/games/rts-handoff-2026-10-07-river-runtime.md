# 2026-10-07 雙河谷地正式本機整合

完整目標仍是原創人類王國 RTS、AI 對戰、兩張小圖，以及所有兵種的原創模型／骨架／動作與 3D 動態肖像。本里程碑完成河谷接線，沒有宣告全遊戲或人物商用品質完成。模型、動作均未改採外部素材；未 push、部署。

遊戲：<http://127.0.0.1:4324/games/rts/>。比較頁：<http://127.0.0.1:4334/riverbank/>。實際混編過橋截圖：<http://127.0.0.1:4334/riverbank/shots/group-bridge-28.png>。比較頁的新版直接使用正式 `createMap`、`Battlefield` 與 runtime 模型，只有「原來畫面」使用凍結 layout／舊橋。

## 修改與資產

- 純地圖配置拆到 `river-layout.ts`，模擬不依賴 Three.js。`createMap('river')` 正式採用彎河；`scene.ts` 同步地面、水面、道路、迷霧。高地圖的 layout、資源、scenery、terrain mask hashes 保持原值。
- 擴張金礦北 `(40.5,22.5)`、南 `(55.5,74.5)`；在生成樹群前設定新礦位，避免原樹群貼礦。ID、3500 金數量與雙橋進攻路線保留。
- 原創石橋 stable ID／URL 不變。runtime SHA256 `1ba65f5121f2edb62577fd3ac779ce2c0b3962bfa43a3f006c8a7edc565317b2`，543156 bytes。來源 85 個原創 Blender mesh、UV、材質內容保留，修整座標；鋪石 y=.025、基底 y=.005、欄杆內寬 6.048m。原始橋與凍結 baseline 均保留。
- 更新 river 選圖縮圖：實際 Battlefield 1000×600 截圖，Lanczos 600×360、WebP quality 88／method 6。SHA256 `d6a87dc76a955ca9c3d5bb8ea07b991fb0cca11aa53f8a6ccef67e20acdb9d4c`，50316 bytes；高地縮圖未改。
- building／map-preview registry 與 riverbank contract 記錄本機整合、原創來源、root assembly review；使用者整體美術接受仍 pending。

## 真實流程與回歸

證據集中於 `art-factory/rts/runs/riverbank/2026-10-07-v1/qa/runtime/`。

`interaction/report.json` 使用實際遊戲頁，控制 fixture 僅準備位置、兵種與剩餘 4 金；選取、採集、移動透過滑鼠，行走與採集沿正式模擬。北／南礦各採完 4 金、回城入帳，離開可見範圍後模型仍隱藏。兩橋各通過攻城車、騎士、衛兵、弩手；重開後 7 geometry、4 material、2 texture 全部 dispose，舊 context lost、新 context 正常。這不是自然經濟通關，也不是全模型連續碰撞證明。

`assembly/assembly.json`：兩圖開局迷霧、資源樹、worker 肖像與滑鼠伐木耗盡；每處 12 棵關聯樹與材堆正確隱藏。`channel-browser.json`：正式場景三種探索狀態、換圖、小螢幕比較頁、兩橋各 45 個橋面高度樣本，0 page errors。濕岸 shader 在正式 WebGL 畫面實際編譯。`bridge-validator.json`：0 errors、0 warnings。

第一輪全套找到 AI 既有固定進攻集合點 `(known.x±6, known.z+6)` 落入新河道，已知最後建築仍無法進攻。先新增紅測試，再改成原首選加上依記憶 footprint 產生的 16 方向／兩圈周界候選，通過既有 `issueCommand → planningObstacles → findPath`；全失敗退避 5 秒，成功保留 70 秒節奏。未讀隱藏敵方位置。新增合法邊界房屋 `(37,5)`、隱藏 entity 搬移但記憶不變、全部候選封死等回歸；原失敗與紅綠記錄皆保留。

最終 `full-vitest-final.log`：`node node_modules/vitest/vitest.mjs run --maxWorkers=4`，134 files／1383 tests 全部通過，32.14 秒。`typecheck.log`：全部 RTS TypeScript、比較場景與新手動 UI fixture，strict／noEmit 通過。`build.log`：`npm run build` 成功，27.82 秒。最終相關 Chromium E2E 結果另見 `e2e-final.log`。本里程碑未跑整站所有瀏覽器 E2E。

`performance/`：既有軍團壓力 fixture，1080p／DPR 1、80 個可見且在畫面內的單位、20 棟建築、騎士動態肖像，暖機 6 秒後採樣 60 秒。RTX 5090 Laptop GPU／Chromium，3488 frames，中位數 59.8802 FPS、p95 16.8ms、最大 33.5ms；0 errors。四份角色模型實際下載 hash 與 runtime 相符。這是控制負載、非一般設備保證。

## 獨立檢核與剩餘工作

唯讀顧問 `rts_waist_repair_design` 檢核地圖／場景資料流、實際採礦／雙橋／釋放／截圖，未發現功能性 P1/P2；`rts_ai_path_diagnosis` 重現進攻失敗與合法邊界反例，修正後 APPROVE，完整消滅合法房屋。root 抽驗來源、實際報告、影像與時效。最後 AI source 寫入早於 1383-test 全綠日誌；E2E 再於最終碼重跑。摘要記錄見 `qa/runtime/independent-review.md`，來源與證據檔案 hashes 見 `snapshot.json`。

橋材質偏亮、攻城車貼欄時的完整模型淨空仍屬美術／幾何待驗範圍，截圖投影重疊不能直接當碰撞證據。原兩圖殘餘房屋舊 fixture `(38,15)` 並非合法可建地基；另有合法 `(37,5)` 完整回歸，本次未藉搬動舊 fixture 隱藏失敗。

下一個重點回到完整角色品質：目前袖口候選仍 qa_failed，不應把局部通過當成角色整體完成。以完整模型、正常遊戲鏡頭和肖像共同檢查輪廓、材質、連續 idle／walk／attack／death 等動作；所有兵種與第二張圖的整體可商用品質仍需完成。
