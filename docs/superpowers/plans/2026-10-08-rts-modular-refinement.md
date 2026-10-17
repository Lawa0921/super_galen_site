# RTS 模組細修與組裝輸出計畫

> 主代理沿目前 RTS worktree 執行；其他代理唯讀檢核。使用 writing-plans／executing-plans；使用者已要求繼續精進，沿既有原創製作授權執行。

**Goal:** 讓兵營、馬廄、工坊的庭院與接地更合理，同時減少組裝角色的多餘繪製成本。
**Architecture:** 可編輯原創零件保留；另輸出材質合批的遊戲模型。新資產放獨立 run，不覆寫前輪來源。以實際相同相機對照與資料不變量驗收，不以零件數作美術判準。
**Tech Stack:** Blender 5.2、glTF、Three.js、Python、Playwright、Vitest。
**Spec:** `docs/superpowers/specs/2026-10-04-browser-rts-design.md`、`2026-10-08-rts-modular-production.md`。

## 工作與驗收

- [x] 先紅後綠製作衛兵組裝烘焙器：依獨立審查保留劍盾與 GuardBody 節點，30 primitive 降至 11。骨架、曲線、每個三角面的 POSITION／NORMAL／UV／權重與材質保持不變；拒絕會破壞動畫的 mesh node、不同變換及 morph。保留原始零件來源與對應表。
- [x] 製作新庭院候選：從已核准原創建築及地面來源重組兵營／馬廄／工坊基座、台階、牆腳與內填地面。清楚區分支撐結構和功能庭院，保持 catalog 占地、模型入口高度及可達性；石緣、角石及三段台階跨三棟共用。
- [x] 同角度近景比較並完成獨立視覺複核：修正既有兩坡法線、補有原始石材貼圖的山牆、修工坊四柱接屋面、入口肩與石緣落地。RTS 組裝驗收併入下一項。
- [x] 48 FPS 候選證據後新增相容 LOD 共用骨架／mixer：新增及補強至 9 項共享骨架測試，另 37 項模型測試；真實衛兵／弩手 30 組五動作×三時間點×LOD 來回切換，蒙皮點最大誤差 0，保留 bind / bounds。逐列視野填入與舊逐格邊界保持相同。
- [x] 候選路由驗證雙地圖、角色五種動作／雙 LOD／動態肖像、80 單位 20 建築。正式 minified build 的 60 秒量測 median 59.88 FPS／p95 25 ms；未降低 55 FPS／p95 33 ms 門檻。保留失敗的開發模式量測，不將兩種建置差異宣稱為單一優化收益。
- [x] 19 Python、142 files／1,441 Vitest（--maxWorkers=4）、strict TS、build、13 Chromium E2E、32.48 MB gzip 下載與獨立唯讀審查通過。五 GLB 及一張原創土面轉檔接入本機。預設並行兩次 Tetris import 逾時留存；單檔及降低並行全套通過，未修改逾時或斷言。不 commit、push 或部署。

## 已知界線

前輪只整理了整棟來源，未讓庭院與輪廓變好；13 個候選已因效能失敗退出 runtime。本輪不將舊失敗結果說成通過。完整人物重新造型／骨架、任意牆體編輯器、未測硬體效能不在此有限修整包中。詳細證據見 `docs/games/rts-handoff-2026-10-08-refinement.md`。
