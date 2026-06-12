# 快速配對隊列 實作計畫

> REQUIRED SUB-SKILL: superpowers:subagent-driven-development。每任務 TDD。
> Spec：`docs/superpowers/specs/2026-06-11-dungeon-arcade-matchmaking-queue-design.md`（先讀）。分支 `feature/matchmaking-queue`。

**Goal:** QUICK MATCH 按鈕 → Upstash 隊列 → poll 中原子撮合（2 人=1v1、3-8 人=FFA、10 秒湊團窗）→ 自動建房/加入 → 60 秒空池提示轉 vs-AI。

**鐵則:** 撮合決策只在 poll 請求中執行（serverless 無 worker）；`SET NX` 原子閘防重複撮合；entry TTL 15s+5s heartbeat；全部重用既有 host/join 流程（lobby/WebRTC/鎖步零改動）；帳單安全（排隊者每 3 秒 1 poll、每 poll ≤5 Redis 指令）。

## 任務

### Q1 撮合純函式（unit, deps:—）
`net/matchmaking.ts`：`interface QueueEntry { id: string; name: string; rating: number; joinedAt: number }`；`tryFormMatch(waiting: QueueEntry[], now: number): { players: QueueEntry[]; mode: '1v1'|'ffa' } | null`——規則：waiting 依 joinedAt 升冪；最早者等待 <10_000ms → null；≥3 人 → 取最早 min(n,8) 人 mode 'ffa'；=2 人 → '1v1'；<2 → null。常數 `MATCH_WINDOW_MS=10_000` 可注入。測 ~8 例（窗邊界/2/3/8/9 人取 8/排序穩定/空池）。
Commit：`feat(net): matchmaking tryFormMatch pure rules`

### Q2 隊列儲存（unit, deps:—）
`net/queueStore.ts`：照 `rankStore.ts` 模式 Memory+Upstash 雙實作＋`getQueueStore()` env 選擇。介面：`enqueue(entry, ttlSec)`／`heartbeat(id, ttlSec)`／`leave(id)`／`listWaiting(): Promise<QueueEntry[]>`（過期不回）／`claimMatchLock(ttlSec): Promise<boolean>`（SET NX）／`setMatch(playerId, info, ttlSec)`／`getMatch(playerId)`。Upstash：ZSET `queue:waiting`（score=joinedAt）＋`queue:entry:{id}`（TTL）＋`queue:match:{id}`；listWaiting 以 entry 存活為準並順手 ZREM 過期者。測 Memory 全介面＋過期語意 ~8 例（Upstash 路徑結構同 rankStore 由型別把關）。
Commit：`feat(net): queue store (memory + upstash)`

### Q3 API（unit, deps:Q1,Q2）
`src/pages/api/queue.ts`（**prerender=false、測試檔命名 `_queue.test.ts` 防 Astro 當路由**，照 `_ffa-match.test.ts` 手法直呼 handler）：POST `{action:'join'|'heartbeat'|'poll'|'leave', id, name?, rating?}`。poll：先 `getMatch(id)` 有就回 `{matched}`；否則 `claimMatchLock(3)` 成功才 `listWaiting`→`tryFormMatch`→成立時 `createRoom`（重用既有 signal 建房或直接產 5 碼 room）＋對每位玩家 `setMatch`（host=最早者，info={room, role, mode, count, players}）→回自己的結果或 `{waiting, position, waitedMs}`。rate limit 照 match.ts。測 ~8 例（join→poll pending→兩人→雙方 poll 到互補角色／三人 FFA／鎖只成立一次／壞參 400）。
Commit：`feat(api): /api/queue — join/heartbeat/poll/leave with atomic matching`

### Q4 前端 client（unit, deps:—）
`net/queueClient.ts`：`startQueue(opts: {id, name, rating, onUpdate(waitedMs), onMatched(info), onError, fetchFn?, now?, intervalMs?=3000, heartbeatMs?=5000}): { cancel(): void }`——join 後雙計時器（poll/heartbeat）、matched 即停、cancel 送 leave 並清計時器、fetch 失敗重試 3 次後 onError。mock fetch 測 ~6 例。
Commit：`feat(net): queue client polling loop`

### Q5 UI + e2e（deps:Q3,Q4）
tetris.astro PLAY 分頁加 `#quick-match` 按鈕（mode-select 內最上方，風格同 ms-btn）＋排隊面板 `#queue-panel`（等待秒數、取消鈕、60 秒後出現「目前沒有玩家排隊，先跟 AI 打一場？」`#queue-ai-offer` 按鈕→走既有 startAi('normal')）。matched → host 走既有 hostGame/hostFfaGame(count)、guest joinGame/joinFfaGame(room)——重用 onStatus/lobby 流程（隊列局 lobby 顯示「配對成功，連線中…」，host 滿員自動開始：FFA 時 hostFfaGame 的 lobby start 在人到齊時自動觸發——最小做法：隊列局傳 autoStart 旗標）。識別：暱稱用既有 #online-name 或 'Player-xxxx'。**禁 inline style/!important**。e2e NEW `games-tetris-queue.spec.ts`：兩 context 都按 QUICK MATCH → 自動配成 1v1 開打（lockstep 存在）；三 context → FFA（migration/forfeit 機制照常）；取消離隊；（AI 提示用注入縮短常數驗 DOM）。
Commit：`feat(ui): quick-match button + queue panel + auto host/join`

### Q6 全套+PR（deps:Q5）
全套 vitest＋全部遊戲 e2e（14 specs）＋build 三綠 → PR `feat(games): 快速配對隊列 — 免房號自動配對（1v1+FFA，空池轉 AI）`。

## 風險
- 撮合鎖 TTL 3s 內 crash → 下個 poll 重試（鎖過期自復原）。
- 兩人同 ms join 順序：ZSET score 同分用 id 次序，撮合穩定。
- FFA 自動開始與既有 lobby start 按鈕互斥（autoStart 不顯示按鈕）。
