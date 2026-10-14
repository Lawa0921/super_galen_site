# CS 死亡資料與呈現準備

> **For agentic workers:** 使用 superpowers:executing-plans。root 為 dirty worktree 唯一寫入者；顧問只讀。

**Goal:** 保留真實致命命中與死亡瞬間角色資料，使回合內延遲處理仍有正確擊殺歸屬與倒地輸入。完整倒地、屍體與掉槍仍需可用骨架及視覺驗收，不能以資料層通過宣告完成。

**Architecture:** `Match.deaths` 與短效 `shots` 分開；每名角色每回合最多一筆不可變快照，回合重設清空。快照複製致命 `Shot` 與死亡瞬間 `Actor`，保留既有命中、傷害與經濟規則。觀戰器以該回合死亡紀錄還原資訊，初次載入已死亡狀態不補播死亡事件或重新延長停留。

**Tech Stack:** 現有 TypeScript、Vitest、Playwright；不引入物理依賴或未核准素材。

**Spec:** `docs/superpowers/specs/2026-10-03-browser-cs-design.md`。

## Constraints / Review Focus

- 同一事件的快照不得與角色或短效射擊事件共享可變物件；後续狀態不得改寫死亡入口。
- 舊回合資訊不得出現在新回合；重複 renderer/觀戰 update 不重發死亡事件。
- 已死亡狀態的首次顯示須保留擊殺資訊，同時直接進入可用隊友視角。
- 暫時沒有致命命中來源的 hp=0 快照不能編造兇手；手动 fixture 的 transient Shot 仍可提供同回合已確認資訊。
- 全部資產與 renderer 維持現狀，直到骨架/碰撞/自然動作通過獨立檢核；不將剛體四肢整塊轉倒當作 CS2 倒地品質。

## Tasks

- [x] 在 `engine.test.ts` 先寫死亡紀錄保留、快照隔離、重複射擊、回合清理與非致命邊界測試，確認紅燈。
- [x] 在 `engine.ts` 增加 `DeathRecord`/`Match.deaths`，只在真實致命命中時記錄，重設回合時清空。
- [x] 在 `spectator.test.ts` 先寫射擊事件逾時後資訊仍正確與已死快照無事件重播的測試，確認紅燈；實作 `spectator.ts`。
- [x] 以實際引擎擊殺與頁面 HUD 驗證延遲/重建觀戰器、隊友切換與回合重設；留存截圖。
- [x] 跑全套 Vitest、相關 CS Chromium 與 build；獨立檢核、來源雜湊與交付資訊。
- [x] 根據骨架顧問結論記錄完整倒地的正確下一步，保持 CS2 品質目標未完成。

## 驗證與限制

- TDD：新增引擎案例先為 3 failed / 15 passed，觀戰案例先為 2 failed / 5 passed；實作後兩檔 25 passed。原始輸出保留於 `tmp/cs-death-record-v1/`。
- 全套 Vitest 首跑 `--maxWorkers=2` 有 4 個其他遊戲案例逾時；沒有修改測試門檻或該遊戲程式，以 `--maxWorkers=1` 重驗後為 133 files / 1389 tests passed。環境樣本僅是當下資訊，不能證明逾時根因已排除。
- CS Chromium 42 passed，含新案例先延遲觀戰器一秒，讓真實引擎清掉射擊事件，再檢查 HUD、既有 hold、重建觀戰器、死亡音效一次性及回合清理。這是受控整合驗證，不是自然遊玩效能測試。
- `npm run build` 成功（exit 0）；建置輸出與本輪來源雜湊見 `tmp/cs-death-record-v1/verification.json`。
- 獨立唯讀檢核：`/root/death_presentation_architecture`，方向與靜態實作 PASS，未發現阻擋缺陷。非阻擋 P3：尚未直接測試人工同回合復活同一 id 後再次死亡時的 duplicate guard；正式玩法目前沒有同回合復活路徑。
- 快照每名角色每回合最多一筆由引擎 guard 限制；本輪沒有增加屍體、掉槍、物理或渲染資產，也沒有再次量測幀率。

## 正式倒地的下一步（未完成）

現有正式 soldier 的手臂／腿各只有肩／髖 pivot，沒有可變形的肘、膝、脊椎骨架（`build_cs_soldier_v5.py:270–304`、`presentation.ts:26–47`）；不以整條肢體轉倒替代自然死亡動作。先讓完整 skinned 候選通過握槍接觸、變形、LOD 與自然遊玩效能驗收，再接方向性死亡動畫、短時間碰撞及睡眠狀態。

屍體與掉槍須各有獨立 visual owner，從本次快照進入，避免被活人 gait/aim 改寫。接觸需涵蓋地面、牆、障礙頂面及空中死亡；武器釋放變換連續，無武器／身體穿插。最後一殺在 `match-over` 仍要能完成動作，所以使用遵守暫停的呈現時鐘，不能只依賴已停止的 `m.time`。最多六具屍體／六把掉槍，重設回合、換 match 與 dispose 清除；自然遊玩效能及多回合資源數需另驗。

CS2 品質總目標仍未完成，正式角色、完整倒地、地圖細節及先前間歇卡頓仍需後續工作。
