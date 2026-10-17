# 原創松林本機接入交接

原始目標仍是可商用品質的原創人類王國 RTS：兩張小地圖、AI、採集／建築／科技／英雄與每兵種動態 3D 肖像。使用者指定模型、骨架與動作全部原創，並指出地圖單調、人物造型與動作未達可用品質。這輪只完成松林景物與地圖樹種差異；完整目標未完成。

工作樹 `C:/Users/bag57/projects/super_galen_site/.claude/worktrees/rts`，分支 `feat/browser-rts`。保留既有大量未提交工作；沒有 commit、push、merge 或對外部署。4324 為本機遊戲，4334 為檢視頁，4002 是其他服務。

## 直接檢視

- [本機遊戲](http://127.0.0.1:4324/games/rts/)：選「灰脊隘口」看松林，「雙河谷地」保留橡樹。
- [兩圖實景頁](http://127.0.0.1:4334/highland-pine/)：可選開局、近景、總覽、通道、採盡後；10 張實際遊戲截圖，桌面／手機皆實測。
- [灰脊松林原尺寸](http://127.0.0.1:4334/highland-pine/pass-forest.png)。全探索鏡頭與縮量採木測試的限制在檢視頁明列。

## 修改與來源

`art-factory/rts/contracts/highland-pine.json` 指向唯一既有風格指南；`runs/highland-pine/2026-10-06-v1` 保存原始生圖提示、透明枝葉、可編輯 Blender、候選與被拒版本、QA、review、實景。runtime key 為 `pine`，GLB SHA-256 為 `843e5d68053e4e6e61bec1678fd348e7dcac6110845a3a3bf3c7c2ff041ae2cc`；5,664 三角面、兩材質、1,569,104 bytes。樹皮沿用本專案原創生成素材，沒有第三方模型／植物庫。

`maps.ts` 只按地圖切換樹種；`terrain.ts` 將 pine 納入原林地遮罩；`scenery.ts` 保留 GLB primitive 的實例化與迷霧邏輯；`scene.ts` 的木材環樹保留 `resourceId`。`models.ts` 按地圖下載樹種，僅在 pine cutout 開啟 alpha-to-coverage。兩圖資源、場景座標／比例／旋轉、blocked/noBuild、地形權重雜湊與替換前完全相同。

模型在加入明確 UVMap 前曾產生 `texCoord=-1`；新增檢查先失敗後通過，失敗 GLB 留在 `iterations/revised-canopy-invalid-texcoord`。首版松冠則留在 `iterations/first-canopy`，未進 runtime。Khronos validator 最終 0 errors、1 warning（樹皮 tangent 由 runtime 生成）及 1 info（384px 樹皮），實景未見法線異常。

## 驗證與限制

- TDD：貼圖兩案例、pine GLB UV 真實失敗件、map/scenery/models 43 項相關測試先失敗後通過。全站 Vitest 最終 **132 檔／1,371 項通過**；strict RTS TypeScript exit 0。
- 正式本機資產 Chromium RTS **13 項通過**；production build exit 0。兩圖實景都零頁面錯誤；真實滑鼠命令採盡四木材後，該點 12 樹與木堆消失；一般 E2E 另驗正常資源採集、支付與蓋房。
- 灰脊 92 靜態 pine（兩材質批次）及 24 資源 pine；實際 4x MSAA、cutout A2C 開啟。HTTP 下載的 GLB bytes hash 與本機候選、runtime 檔一致。
- 兩圖壓力測試：RTX 5090 Laptop、1080p、80 單位／20 建築與騎士動態肖像、各 60 秒。灰脊中位 **80 FPS**、p95 **24.9ms**、max **37.5ms**；河谷中位 **79.37 FPS**、p95 **25ms**、max **54.1ms**；均零錯誤。這是特定機器與固定負載結果，不代表所有電腦。原始資料見 run 的 `qa/release-results.json`。
- 首次效能啟動前，組裝腳本誤以 UTF-8 讀取 PowerShell 的 UTF-16 測試 log，因而停止且尚無 pine registry；隨後測試初始化失敗。已修正讀取編碼、同批裝入 registry/GLB 後重跑成功；失敗日誌保留，不計作效能樣本。
- 主代理與獨立唯讀 consultant 接受一般 RTS 中景松林，近景仍可見枝葉分層及卡片感。使用者整體美術驗收尚未完成。

驗證命令、native exit code、實際資料與檔案 hashes 集中於 `art-factory/rts/runs/highland-pine/2026-10-06-v1/qa/release-results.json`。不要將結構／測試成功擴大成全遊戲商用品質完成。

## 後續仍須完成

地圖岩壁仍像重複排石，河岸高低層次與遺跡尚未處理。人物與動作仍有未通過項目，前一輪弩兵裙甲 UV 修版仍是候選，沒有因松林接線替換 runtime 人物。原創人物／動畫、每兵種肖像品質及整體戰役驗收仍須持續。
