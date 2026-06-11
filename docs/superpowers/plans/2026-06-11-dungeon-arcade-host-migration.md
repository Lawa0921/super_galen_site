# Host Migration（中離續行 Stage B）實作計畫

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development。每任務 TDD：測試→紅→實作→綠→全套零回歸→commit。
> Spec：`docs/superpowers/specs/2026-06-11-dungeon-arcade-host-migration-design.md`（先精讀全篇）。分支 `feature/host-migration`（自最新 master）。

**Goal:** FFA host 中離 → 剩餘玩家選新 host、世代化 signaling 重連、輸入視野合併補課、舊 host 判敗、對局續行；失敗 20s 降級為現行為（中止不計分）。

**Architecture:** 選舉＝最低 index 存活 guest 自任＋signaling 仲裁（取最低 index 的 offer）；重連＝重用 T11 guest-initiated 交握於 `mig{g}-` 世代槽位；補課＝各端送 `ffa-mig-sync`（cf+horizon+未消化輸入）給新 host 合併、回播 `ffa-mig-state`（合併輸入＋`hostForfeitF = max(horizon[舊host])+1`，禁 confirmedFrame+1）；熱插拔＝`MigratingTransport` facade 換 inner、FfaLockstep 不動。

**Tech Stack:** TypeScript、Vitest（unit/mock-net）、Playwright（3-context e2e 關 host）。

## 🔴 鐵則
1. Stage A 既有行為零回歸（guest 中離路徑、487 單元、32 e2e）。
2. 合併輸入冪等（`recordInput` 首寫保留；同幀同玩家輸入在各端必然相同——皆源自舊 host 有序轉發）。
3. `hostForfeitF` 必可達（max horizon+1，向下夾 INPUT_DELAY）；**禁 confirmedFrame+1**（Stage A 死鎖教訓）。
4. 純函式優先：選舉、merge、horizon 計算全部可單測；網路/Pixi 只做薄接線。
5. 測試紀律：`timeout 90 npx vitest run <file> --testTimeout=8000 --no-file-parallelism`；不輪詢背景 job。

## 檔案結構
- `net/signalClient.ts` + `pages/api/signal.ts`（MOD）：`mig{1..6}-guest-{0..6}-offer`/`mig{1..6}-host-ack-{0..6}` 槽位。
- `net/ffaMigration.ts`（NEW）：選舉/merge/horizon 純函式 + `MigratingTransport` + 遷移協調器（依賴注入 signaling/RTC/now，mock-net 可測）。
- `net/ffaLockstep.ts`（MOD 最小）：暴露 `exportSyncState(): {cf, horizon, inputs}` 與 `importMergedInputs(inputs)`（讀寫 inbox/replayEvents 的受控接口）。
- `net/ffaNetMain.ts`（MOD）：guest 的 host-down 路徑由「中止」改「啟動遷移→成功續行/逾時降級」；新 host 升格（hub+Stage A 偵測啟動）；`__tetrisDebug.migration`。
- `render/`（MOD 小）：遷移中橫幅。
- `tests/e2e/games-tetris-ffa-hostmig.spec.ts`（NEW）。

## 任務

### M1 世代化 signaling 槽位（unit, deps:—）
isValidSlot 兩端（signalClient.ts/signal.ts）加 `mig{g}-` 前綴規則（g 1..6）；測：合法各形、g=0/7 拒、i=7 拒、既有槽位零回歸。
Commit：`feat(net): generation-scoped migration signaling slots (mig{g}-...)`

### M2 遷移純函式 + MigratingTransport（unit+mock-net, deps:—）
`net/ffaMigration.ts`：
```ts
export function electHost(playerIds: string[], hostId: string, placedIds: string[], selfId: string): { role: 'host'|'join'; candidateId: string }
// 候選=排除 hostId 與 placedIds 後原始 index 最低者；selfId===candidateId → role 'host'
export interface SyncState { cf: number; horizon: Record<string, number>; inputs: Array<{f:number; p:string; a:string[]}> }
export function mergeSync(states: SyncState[]): { inputs: SyncState['inputs']; horizon: Record<string, number> } // 冪等去重（f+p 鍵，首見保留）
export function hostForfeitFrame(horizon: Record<string,number>, hostId: string, inputDelay: number): number // max(horizon[hostId]+1, inputDelay)
export class MigratingTransport implements FfaLockstepTransport { constructor(inner); send/onMessage 委派; swap(inner): void /* 重綁訊息流到同一上層回呼，swap 期間緩衝 */ }
```
測（~12 例）：選舉（基本/候選已淘汰跳下一個/自己是候選/全淘汰邊界）；mergeSync 冪等與並集；hostForfeitFrame 夾值；MigratingTransport swap 前後訊息不漏不重（mock inner ×2）。
Commit：`feat(net): migration primitives — election/merge/forfeit-frame + MigratingTransport`

### M3 Lockstep 同步接口（unit, deps:—）
ffaLockstep.ts 加 `exportSyncState()`（cf＝confirmedFrame、horizon＝各玩家 inbox+已套用的最大幀、inputs＝inbox 全部未消化幀＋自己已送未確認的本地幀）與 `importMergedInputs(inputs)`（走 recordInput 冪等）。測：export 形狀正確；import 後 advance 可越過原缺口；冪等重複 import 無害；既有 13 例零回歸。
Commit：`feat(net): FfaLockstep sync-state export/import for host migration`

### M4 遷移協調器 + netMain 接線（mock-net, deps:M1-M3）
`ffaMigration.ts` 加 `runMigration(deps)`（注入 signal client、RTC 工廠、transport、lockstep、now/timeout）：guest host-down → electHost → host 角色：輪詢 mig 槽收 offer→answer→waitOpen→收各端 ffa-mig-sync→mergeSync→廣播 ffa-mig-state→swap 成 hub→啟動 Stage A 偵測；join 角色：寫 offer（**ELECTION_GRACE_MS=3000 後若發現更低 index 候選 offer 則讓位**）→等 ack→送 sync→收 state→import+scheduleForfeit→swap。任何步逾時（MIGRATION_TIMEOUT_MS=20000）→ reject → netMain 降級中止。netMain：host-down 分支改呼叫 runMigration；UI 橫幅「重新連線中…」；`__tetrisDebug.migration={gen,state}`；MAX_MIGRATIONS=6。
測（mock-net ~8 例）：3 端完整遷移序列各端最終狀態 JSON 一致並續行到 victory；雙候選讓位收斂；逾時降級；新 host 再死→gen2 再遷移；Stage A guest 中離在新 host 下仍有效。
Commit：`feat(net): host-migration orchestrator — elect/reconnect/merge/resume`

### M5 e2e + 全套（e2e, deps:M4）
NEW `games-tetris-ffa-hostmig.spec.ts`（照 ffa-forfeit spec 手法）：3-context 開打 → `ctxHost.close()` → g1/g2 `expect.poll`（60s）：migration state 達 'done'、舊 host placement=3、confirmedFrame 恢復推進 → 驅動分勝負 standings 一致。全套 vitest＋全部 13 支遊戲 e2e＋build 三綠。
Commit：`test(e2e): FFA host-leave migration continuation (3-context)`

### M6 收尾（manual+PR, deps:M5）
介面走查（遷移橫幅截圖）→ spec 限制段補實測數據 → PR（標題 `feat(net): host migration — 任何人中離對局都能續行`，body 含測試數字與誠實限制）。

## 風險
- 真實 RTC 重連在 headless 的 ICE 時序：e2e 逾時預算 60s；失敗路徑本身也是合法降級（斷言遷移成功仍為硬目標）。
- room TTL：M4 開頭確認 signal room 存活時長，不足則遷移前 touch（沿用既有 API）。
- swap 競態：MigratingTransport swap 期間緩衝訊息（M2 測試明確覆蓋）。
