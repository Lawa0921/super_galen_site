# 死亡確認與隊友觀戰實作計畫

> 主代理採用 superpowers:executing-plans 直接實作；獨立代理只做唯讀檢核。使用者已授權持續改善，不另設批准停點，不 commit/push/deploy。

**Goal:** 致命受擊後明確呈現擊殺者、武器與觀戰對象，能切換存活隊友，下一回合完全復位。

**Architecture:** 新增小型 `SpectatorState` 保存每場／每回合的死亡事件與觀戰選擇。client 控制 UI、輸入與音效；renderer 使用同一個目標 ID，避免 UI 與鏡頭各選不同隊友。

**Tech Stack:** TypeScript、Astro、Three.js、Vitest、D3D11 Chromium Playwright。

**Spec:** `docs/superpowers/specs/2026-10-03-browser-cs-design.md` 的死亡觀戰、V5 回饋與持續品質目標。

## 範圍與限制

- 沿用已在遊戲中使用的美術、字型、HUD 風格，不整合未接受的手部／倒地／掉槍素材。
- 致命受擊先保留 0.65 秒原視角；此時間用模擬時鐘，暫停也暫停。操作切換可提早跳至隊友。
- 死亡一次清除輸入、退出 pointer lock；死亡時失去 lock 不得造成全場自動暫停。Esc/失焦仍可暫停。
- 觀戰只選同隊存活者；目標死亡自動換人，無隊友時留在死亡位置，不洩露敵方視角。
- 死亡摘要跨 pause/resume 保留，每回合／每場／復活清除；音效只播一次。
- 本輪不宣稱完成屍體動畫、觀戰第一人稱持槍模型、完整握姿或 CS2 品質。

## 風險與驗收

- pointerlockchange 不能把死亡當成 Esc；e2e 檢查 timer 持續前進且 pause 隱藏。
- 切換後被觀戰者死亡：state 單測與瀏覽器鏡頭、名字一致性。
- 致命事件剛好結束回合：摘要保留，不能蓋掉既有結果延遲。
- 按住射擊時死亡／新回合：亡者不再射擊，復位不沿用 fire/aim。
- 只有一名／沒有隊友：禁用切換按鈕，絕不選敵人；鍵盤也遵守。

## Task 1：可測試的死亡與觀戰狀態

**Files:** `src/scripts/games/cs/spectator.ts`、`spectator.test.ts`。

**Interface:**
```ts
selectViewActor(match: Match, requested?: number | null): Actor
class SpectatorState {
  viewId: number | null;
  death: { killerId: number; killerName: string; weapon: WeaponId; head: boolean } | null;
  update(match: Match | null): 'none' | 'died' | 'revived';
  cycle(match: Match, direction: -1 | 1): boolean;
  available(match: Match): number;
}
```

- [x] 先測真實 `stepMatch` 產生的致命事件、0.65 秒 hold、僅同隊選擇、目標死亡、pause（時間不變）、round/match/null 清除。
- [x] 跑 `npx.cmd vitest run src/scripts/games/cs/spectator.test.ts`，保存失敗原因，再實作與重驗。

## Task 2：實際客戶端流程

**Files:** `client.ts`、`renderer.ts`、`audio.ts`、`cs.astro`、`_cs.scss`、`tests/e2e/games-cs-feedback.spec.ts`。

```ts
const transition = spectator.update(match);
if (transition === 'died') { clearInput(); document.exitPointerLock(); audio.death(); }
renderer.render(match, dt, look, aim, spectator.viewId);
```

- [x] e2e 先以真引擎受擊驗證死亡卡不存在造成失敗；測試 route 只提供可控 actor/AI，不改正式 debug API。
- [x] 加死亡／觀戰卡、左右按鈕與方向鍵、死亡輸入 guard、旁觀聽點；保留原有玩家命中回饋。
- [x] 真實死亡、切換、目標死亡、暫停/續玩、下一回合、新比賽流程，截取桌面與窄版畫面。
- [x] 全套 Vitest、相關 Chromium e2e、production build；未存在的 lint 不新增。
- [x] 固定硬體單一 GPU，持續實際操作幀率取樣；報告時區分 live、觀戰與回合階段。
- [x] 唯讀獨立 review、必要修正與重驗。保存來源、測試、截圖、效能條件與未完成範圍。

## 執行紀錄

證據集中於 `tmp/cs-spectator-v1/`。狀態先有 5 個正確原因的失敗測試再通過；瀏覽器先確認死亡卡不存在而失敗。實際整合首輪另抓出「開局即死亡，HUD 首次轉 live 誤暫停」的競態，已在該路徑檢查 alive。`e2e-boundaries.log` 的 2 案涵蓋死亡到下一回合、聲像距離/方向及最後一擊結束比賽；桌面與 800×600 已實看。全套 Vitest 133 檔／1382 測試及 build 已通過；完整 CS 瀏覽器和 60 秒效能採樣另記最終結果。

新改動只涉及 runtime 行為與 DOM 卡片，未改舊封存素材；手部 packet 的 125 個 artifact 與 32 個 source snapshot 雜湊仍一致。舊 packet 的 runtime 雜湊是當時歷史記錄，本次合法 runtime 差異改記在新 backup／delta 中。

最終功能驗證：`vitest-full.log` 為 133 檔／1382 passed，`e2e-full.log` 為 40 passed（2.9 分鐘），`build.log` 為 exit 0。獨立代理唯讀碼審與桌面／800×600 畫面檢核未發現阻塞；新邊界測試結果也已回讀。

效能：`sustained-clean/report.json` 使用正常 AI、真實鍵鼠、無 route 替換、無採样內截圖／CPU profiler；Windows headless Chromium D3D11、Intel Graphics 0x7D67、1920×1080 DPR 1.5，高／低實際 buffer 1600×900／1280×720。每種品質 60 秒、3600 幀，平均 16.666ms、p95 16.7ms、最差 16.8ms，沒有 long task 或 page error。低品質包含 10.666 秒 live 觀戰；高品質自然死亡立即結束回合，持續觀戰 coverage 未完成。DOM phase/life 分類有約 80ms 更新延遲，這不是多硬體或長時壓測。

保留異常證據：第一次採樣因腳本未等 HUD 更新而重複點擊 deploy 中止；v2 含採樣內截圖造成的約 1 秒峰值，另有未釐清的高品質 100ms／末段低品質觀戰 long task。取消採样內截圖的獨立 CPU 診斷最差 33.4ms；最終乾淨採样沒有重現原峰值。此證據不等於已修好未重現的遊戲卡頓根因。完整 CS2 品質、正式角色死亡／掉槍／握姿與高品質持續觀戰效能仍未完成。
