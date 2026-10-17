# RTS 全模型與骨架整批修整計畫

> **For agentic workers:** Root is the sole writer of the current worktree; independent review remains read-only. Preserve all unrelated existing changes.

**Goal:** 將全部 runtime 3D 模型、必要骨架與動作修到可用，完成整批遊戲驗收後一次交付。

**Architecture:** 以目前 registry 與實際載入模型為完整清單，先鎖定基準與可編輯來源。候選留在單一 factory run；逐模型記錄通過／缺陷／修正／重驗，不以單角色局部通過交付，也不重建已合格的部分。

**Tech Stack:** Blender 5.2.1、Python、glTF、Three.js、Playwright Chromium、Vitest。

**Spec:** `docs/superpowers/specs/2026-10-04-browser-rts-design.md`；本次使用者明確授權所有模型與骨骼修整、完成後一次觀看。

**目前狀態（2026-10-16）:** 全部模型修整、獨立模型視覺檢核與最新操作回歸已完成；正式效能門檻仍未通過。完整來源批次為 `runs/visual-revision/2026-10-16-complete-v4`；無損封裝候選為 `2026-10-16-complete-packed-v4`，包含 34 個模型 ID／46 個 GLB。正式 80 單位／20 建築效能測試的中位數 59.88 FPS 通過，但 p95 33.4 ms 未達 <33 ms，整批最終驗收尚未完成。舊批次遭使用者否決的紀錄保留，不以舊勾選或機械測試替代使用者外觀判斷。

工人沿用 material-v1、弩手 motion-v5、祭司 anatomical-grips-v1、指揮官 anatomical-motion-v3、掠奪者 fullbody-v1、騎士 material-v1；衛兵 budget-v4 已保留閉合甲片並降至 19,932／9,989 三角形。岩石與礦坑改用 surface-v5 的封閉拓樸與固定密度 UV；橋梁 barrel、兩種投射物的立體尾翼均已通過來源與實景檢查。所有可動單位的兩級 LOD、完整動作、握持、接地與變形檢查已有對應證據，沒有以簡化佔位模型代替。

v4 補齊守衛／騎士的完整動畫邊界，並合併騎士完全等價的材質引用；幾何、權重與動畫 BIN 不變。執行端略過獨立隱藏 LOD 的世界矩陣更新，兩套動畫時間軸仍完整運作；小地圖改為一次像素上傳，八組真實 Canvas 比對完全一致。玩家視野資料改為先過濾後整批複製，保持模擬資料隔離與敵方資訊遮蔽。全套 Vitest 186 檔／1,889 項、靜音 Chromium RTS 操作回歸 33／33 通過，建置通過；全域 typecheck 維持 78 個既有診斷。46 個 GLB 格式驗證零錯誤，99 張材質在三種瀏覽器的解碼像素一致。

組裝預覽：[實際遊戲](http://127.0.0.1:4340/games/rts/)／[模型與骨架檢視](http://127.0.0.1:4340/)。4340 明確服務本輪候選；4321 的 public 模型仍是原本本機版本。使用者的整體外觀核准、正式 runtime 發布與整站完整 release gate 不在機械驗證中自動勾選。最新證據入口：`art-factory/rts/runs/visual-revision/2026-10-16-complete-packed-v4/qa/current-status.json`。

## Global Constraints

- 沿用深藍染布、暖黃銅、磨損皮革與既有生成來源；不得用粗略幾何替代正式美術。
- 全部八種單位、十二種建築變體、地標與場景模型均入清單；只有可動部件需要骨架。
- 保留已完成指揮官裝配；所有角色的手／武器／關節／完整動作同時驗收。
- 同一工作樹只由 root 寫入；不還原既有 dirty work、不 push／deploy。
- 測試 Chromium 使用 `--mute-audio`；不處理新的音訊或 GPU 基建。
- 一般單位 LOD0 8k–20k、英雄／騎士上限 35k、建築 10k–45k；實測性能決定必要優化。

## Review Focus

- 靜止握得住但攻擊／死亡穿模：全動作中間幀與端點、兩級 LOD 檢查。
- 骨架存在但權重拉扯或關節軸錯誤：實際頂點變形、肘膝腕與騎乘接觸檢查。
- LOD 或動作切換遺留位移：相同骨架／clip 契約及連續切換驗證。
- 建築完成態正常但施工／倒塌缺件：實際 ModelInstance lifecycle 各階段呈現。
- 候選正常但 runtime 仍是舊模型：已發布 URL 的 SHA 與候選逐檔相符。

## Task 1 — 完整清單與缺陷基準

- [x] 從 model registry 鎖定全部 URL、SHA 與 before 副本。
- [x] 在 `art-factory/rts/runs/all-models/2026-10-14-v1/qa/baseline/` 取得全部模型、多視角、所有 clip 與 lifecycle 影像。
- [x] 建立逐模型 coverage／defect ledger，分類來源、rig、geometry、material、contact、animation、LOD、runtime。
- [x] 對確定缺陷先加入會失敗的機械門檻；視覺缺陷保存前圖與具體判準。

## Task 2 — 角色／騎乘／攻城裝配與骨架

- [x] 依來源族群修整 worker、guard、crossbow、priest、neutral-raider、knight；commander 與既有合格 siege 完整回歸。
- [x] 沿用現有 authored geometry、generated material、手部曲面工具，依個別握把和實際腕部接點配合。
- [x] 修正骨架綁定、關節變形、武器接觸與動作衝突；保留 clip 名稱與骨架契約，弩手／攻城弩發射改為來源動畫的 16/24、12/24 秒並加入回歸與實際飛行測試。
- [x] 兩級 LOD、全部 clip 的權重／接觸／地面／body crossing 檢查和獨立視覺核驗通過。

## Task 3 — 靜態、施工與毀壞模型

- [x] 檢查十二建築變體完成／施工／倒塌／廢墟及隊色；修正發現的造型、支撐、接縫與顯示缺陷。
- [x] 檢查橋梁、樹、礦、石、木堆、四種地標、投射物；驗證尺寸、origin、法線、貼圖及 LOD。
- [x] 已合格模型記錄原 SHA 保留；任何不適用骨架項明列靜態理由。

## Task 4 — 整批整合與一次交付

- [x] 全候選 glTF 0 errors、來源／候選 manifest／外部貼圖完整；相關資產測試、1,889 單測與 33 項 RTS E2E 通過。全域既有 typecheck 欠債另記。
- [x] 使用真實遊戲渲染檢查八種單位、兩隊、LOD、portrait、工作／攻擊／施法／死亡及建築 lifecycle。56 張最新模型畫面獨立複審通過。
- [ ] 整批下載估算 34,586,224 bytes 通過、全模型 coverage 已獨立複審；正式 80 單位／20 建築 p95 33.4 ms 未達 <33 ms，保留 blocker，不放寬門檻。
- [ ] 只在整批通過後更新本機 public runtime／registry。候選 4340 的實際 HTTP SHA 已驗；目前仍由獨立候選路徑提供，未發布。
- [x] 提供一個整批候選預覽與 `complete-packed-v4/qa/final-acceptance.json` 證據總表；紀錄明確標示效能未過與整體尚未完成，不逐小項要求使用者驗收。
