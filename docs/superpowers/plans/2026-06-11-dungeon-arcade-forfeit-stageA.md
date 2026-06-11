# 中離續行 Stage A（Guest Forfeit Continuation）實作計畫

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development。每任務 TDD：先測試→紅→實作→綠→全套零回歸→commit。
> Spec：`docs/superpowers/specs/2026-06-11-dungeon-arcade-forfeit-continuation-design.md`（先讀 Stage A 全部）。

**Goal:** FFA guest 中離（主動/close/靜默逾時）→ 確定性判敗淘汰、對局續行、共識計分照常；1v1 對手中離顯示 FORFEIT WIN 不計分；host 中離維持中止（Stage B 解）。

**Architecture:** Host 取 F=（中離者最後輸入幀 M）+1 廣播 `{t:'ffa-forfeit',p,f}` 控制訊息（ordered channel 保證序）；各端 `lockstep.scheduleForfeit(p,F)` 在幀 F 套輸入前執行 `match.forfeit(p)`（同 topout 淘汰路徑）；棄權後缺幀由既有「已淘汰補空輸入」吸收。Replay 加可選 `forfeits` 欄位，重模擬同序套用 → 防作弊可重現、舊格式相容。

**Tech Stack:** TypeScript、Vitest（unit/mock-net）、Playwright（3-context e2e）。

## 🔴 鐵則
1. **確定性**：forfeit 必須「在幀 F、套用該幀輸入之前」執行，lockstep 與 simulateFfaReplay 同序；F 一律由 host 決定廣播，任何端不得自行判定。
2. **既有正常路徑零回歸**：無中離的 FFA/1v1 全部既有測試（437+ 例、e2e 19+）必須綠。
3. 控制訊息與幀訊息分流：lockstep inbox 只收 FfaFrameMsg（既有 shape 驗證不動）；控制訊息走 transport 的獨立 `onControl` 回呼。
4. 測試紀律：`timeout 90 npx vitest run <file> --testTimeout=8000 --no-file-parallelism`；e2e `expect.poll` 去 flake。

## 檔案結構
- **engine/ffa.ts**（MOD）：`forfeit(id)`＋ko 事件 `reason?: 'forfeit'`。
- **net/ffaLockstep.ts**（MOD）：`scheduleForfeit(p,f)`、advance 幀首套用、`getReplay()` 含 forfeits。
- **net/ffaReplay.ts**（MOD）：`FfaReplay.forfeits?`、simulate 同序套用、verify bounds。
- **net/ffaTransport.ts**（MOD）：Hub `onChannelClose(cb)`/`sendControl`/`onControl`＋`ffa-leave` 快速路徑；Spoke `onClose(cb)`/`sendControl`/`onControl`。
- **net/ffaNetMain.ts**（MOD）：host 三偵測→廣播；guest onControl→scheduleForfeit；host-leave 中止文案；ESC 離開送 ffa-leave；FORFEIT UI。
- **net/netMain.ts**（MOD 小）：1v1 forfeit win 文案。
- **tests/e2e/games-tetris-ffa-forfeit.spec.ts**（NEW）。

## 任務

### F1 引擎 forfeit（unit, deps:—）
`engine/ffa.ts`：
- ko 事件型別加可選 `reason?: 'forfeit'`（既有發 ko 處不帶 reason，零行為變更）。
- `forfeit(id: string): void`：`phase==='playing'` 且 id 存活 → 走既有淘汰路徑（同 topout：placement=目前存活數、發 `{kind:'ko', id, placement, reason:'forfeit'}`、若剩 1 人發 victory + phase='result'）；其餘情況 no-op。
測試（~8 例）：4 人 forfeit 1 → placement=4、續行可玩；連續 forfeit 到剩 1 → victory；已 topout 者 forfeit no-op；result 後 no-op；不存在 id no-op；同幀 forfeit 兩人依呼叫序名次確定；**零回歸：不呼叫 forfeit 的同 seed 對局與 main 分支行為逐位一致**（既有測試本來就保證，跑全套）。
Commit：`feat(engine): FfaMatch.forfeit — deterministic leave-as-elimination`

### F2 鎖步排程棄權（mock-net, deps:F1）
`net/ffaLockstep.ts`：
- `private forfeitAt = new Map<string, number>()`；`scheduleForfeit(p: string, f: number): void`（p 在 playerIds、f 有限數才收；可重複呼叫冪等＝取最早 f）。
- `advance()` 迴圈頂（phase 檢查之後、補空輸入之前）：對每個 `forfeitAt` 中 `f <= simFrame` 且尚未定名次的 p → `match.forfeit(p)`＋記入 `replayForfeits.push({f: simFrame…` **注意**：記錄用排程的 f 還是實際套用幀？**用實際套用幀 simFrame**（= max(f, 套用時幀)；正常情況 f>confirmedFrame 所以 simFrame===f；記實際值保證 replay 重現一致）。
- `getReplay()` 回傳加 `forfeits: [...]`（空陣列時可省略欄位或給空陣列——**統一給欄位、空陣列**，簡化下游）。
測試（~8 例）：LoopbackHub 4 端，一端在幀 K 後停止 tick、host 端（測試模擬）對全員 scheduleForfeit(p, K+1) → 全員續行到 victory、**各端全盤狀態 JSON 一致**、中離者 placement 正確；f 之前的輸入照常生效（在 K 幀前的移動有效）；scheduleForfeit 對未知 p/壞 f 忽略；getReplay().forfeits 含正確 {f,p}；既有無中離測試零回歸。
Commit：`feat(net): FfaLockstep.scheduleForfeit — frame-scheduled deterministic forfeit`

### F3 Replay forfeits（unit, deps:F1；可與 F2 平行）
`net/ffaReplay.ts`：
- `FfaReplay` 加 `forfeits?: Array<{ f: number; p: string }>`。
- `simulateFfaReplay`：每幀套輸入前，先套該幀 forfeits（依陣列序）→ `match.forfeit(p)`。
- `verifyFfaReplay`：forfeits 若存在 → 陣列、長度 ≤ playerIds.length、每項 f 有限數且 0<=f<=frameCount、p ∈ playerIds；違反 → false。
測試（~8 例）：用 F2 的 lockstep 跑一場含中離的局 → getReplay → simulate 名次與實際一致；無 forfeits 欄位的舊 replay 照常（向後相容）；竄改 forfeit 的 f/p → 名次變或 verify false；畸形 forfeits（非陣列/p 不在名單/f 負數）→ verify false 不丟例外。`/api/ffa-match` 測試檔加 1 例：含 forfeits 的合法局結算 'applied'（沿用 `src/pages/api/_ffa-match.test.ts` 既有手法）。
Commit：`feat(net): FfaReplay forfeits — replayable + verifiable leave events`

### F4 傳輸層控制通道（mock-net, deps:—；可與 F1 平行）
`net/ffaTransport.ts`：
- 控制訊息判別：raw JSON parse 後 `t` 欄位以 `ffa-` 開頭即控制訊息（FfaFrameMsg 無 t 欄位）。
- **FfaHubTransport**：`onChannelClose(cb: (idx: number) => void)`（建構時對每條 channel 掛 close 偵測——RelayChannel 介面加可選 `onclose` 掛點：`interface RelayChannel { send; open; set onclose? }`，mock 與 wrapChannel 都支援）；收 guest raw：若是控制訊息 `ffa-leave` → 觸發 `onChannelClose(idx)`（快速路徑）並**不 relay**；其他控制訊息→上層 onControl＋relay；幀訊息→既有（relay＋上層）。`sendControl(msg: object)`：JSON 後 routeFrame(null,…) 廣播＋回灌自身 onControl。`onControl(cb)`。
- **FfaSpokeTransport**：`onClose(cb)`（channel close）；onmessage 分流：控制→onControl、幀→既有 onMessage；`sendControl(msg)`。
- lockstep 不動（控制訊息不會進 inbox——hub/spoke 已分流；防呆仍在）。
測試（~8 例）：mock channels——guest 送 ffa-leave → hub 觸發 onChannelClose(idx) 且其他 guest 沒收到該訊息；hub sendControl → 全 channel 收到＋自身 onControl；spoke 收控制訊息 → onControl 而非 onMessage；幀訊息行為不變（既有 9 例零回歸）；channel close → 對應回呼。
Commit：`feat(net): FfaTransport control channel + channel-close hooks (ffa-leave fast path)`

### F5 netMain 接線＋UI（mock-net+ui, deps:F2,F3,F4）
`net/ffaNetMain.ts`：
- host：`SILENCE_TIMEOUT_MS = 10_000` 常數；三偵測（onChannelClose；ffa-leave 已併入 close；靜默逾時：每秒檢查各 guest 頻道 lastMessageAt，逾時且「同期間至少一其他頻道有訊息」→ 視同 close）→ 計算 `F = lastRelayedFrame(p) + 1`（hub 記錄每 guest 最後 relay 的幀號——在 FfaHubTransport 或 netMain 層記，選 netMain 層：onMessage 已收到 parse 後的 FfaFrameMsg 可記 max f）→ `sendControl({t:'ffa-forfeit', p, f:F})` 廣播（含自身回灌）→ 自身 scheduleForfeit。
- guest：`onControl` 收 `ffa-forfeit`（shape 驗證：p∈playerIds、f 有限數）→ `scheduleForfeit(p,f)`。
- guest 對 host 頻道 `onClose` → 既有 disconnected 路徑、文案「HOST 離線，對局中止」。
- 中離者已淘汰（正常看完結局關分頁）→ forfeit no-op 自然吸收，無需特判。
- ESC「離開對戰」：關閉前 `transport.sendControl({t:'ffa-leave'})`（spoke）；host 離開則直接關（Stage A host 離開＝全局中止）。確認文案補「離開將判敗」。
- UI：收到 ko reason='forfeit' → 該盤疊「FORFEIT」標籤（FfaBoards/StandingsPanel 沿用淘汰視覺＋文字）。
`net/netMain.ts`：1v1 `transport.onClose` 顯示改「OPPONENT FORFEIT\nYOU WIN」＋小字「對手已離線（此局不計分）」（既有不回報行為不變）。
測試：mock-net 單元（host 偵測→廣播 forfeit 訊息形狀正確、F 計算=lastFrame+1、guest onControl 驗證與排程、靜默逾時條件含「其他頻道活躍」前提、壞控制訊息忽略）；`npx tsc --noEmit` 動到檔案零新錯；`npm run build` 綠。
Commit：`feat(net+ui): guest-leave forfeit wiring — detection, broadcast, FORFEIT tag, 1v1 forfeit-win`

### F6 e2e＋全套自測（e2e, deps:F5）
- NEW `tests/e2e/games-tetris-ffa-forfeit.spec.ts`（照 `games-tetris-ffa.spec.ts` 3-context 手法）：3 人開局進 playing → **關閉 g2 context**（`ctxG2.close()`）→ `expect.poll`：host 與 g1 觀測 g2 placement=3（forfeit）、confirmedFrame 持續推進（對局未凍結）、繼續驅動到分出勝負 standings 一致。timeout 給足（靜默逾時 10s + 偵測週期）。
- 全套：vitest 全綠＋`timeout 600 npx playwright test tests/e2e/games-hall.spec.ts tests/e2e/games-tetris.spec.ts tests/e2e/games-tetris-ai.spec.ts tests/e2e/games-tetris-menu.spec.ts tests/e2e/games-tetris-pause.spec.ts tests/e2e/games-tetris-result.spec.ts tests/e2e/games-tetris-online.spec.ts tests/e2e/games-tetris-ffa.spec.ts tests/e2e/games-tetris-skins.spec.ts tests/e2e/games-tetris-ffa-forfeit.spec.ts --project=chromium` 全綠＋build 綠。
- 手動走查指引（給主會話）：雙視窗 FFA、一窗直接關閉、另窗體感（10 秒內判敗續行）。
Commit：`test(e2e): FFA guest-leave forfeit continuation (3-context)`

## 測試計畫匯總
unit/mock-net 約 +32 例（F1 8、F2 8、F3 9、F4 8、F5 若干）；e2e +1 spec；全套零回歸硬關卡。

## 風險
- close 事件在 headless 不觸發？→ e2e 用 context.close()（會關 DataChannel）；若 close 不可靠，靜默逾時兜底（e2e timeout 給 20s+）。
- F 計算競態（host 廣播後又收到 p 的舊幀）：ordered channel 下不可能（close 後無新訊息；leave 快速路徑時 hub 停止 relay 該 guest）。
- 已在 result 的局收到 forfeit：match.forfeit no-op（F1 涵蓋）。
