# Dungeon Arcade 階段 2：排名完整性 / 防作弊核心　實作計畫

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 讓已上線的 1v1 排名計分擋掉「不經真實對局的造假」與並發重複計分——加上後端 replay 重模擬驗證、原子化結算、地址正規化。

**Architecture:** 1v1 線上是確定性鎖步（`seed + 雙方逐幀輸入 → 唯一結果`，見 `determinism.test.ts`）。回報結果時附上 `seed + 稀疏輸入紀錄`，`/api/match`（Vercel serverless function）用同一套純 TS 引擎重跑該局、確認宣稱的勝方真的由這些輸入產生；結算用 Redis `SET NX` 原子化；地址一律小寫入庫。

**Tech Stack:** Astro server endpoint（`prerender=false`）、純 TS 確定性引擎（`TetrisMatch`）、Upstash Redis REST、Vitest。

**Spec：** `docs/superpowers/specs/2026-06-06-dungeon-arcade-mainmenu-progression-8p-design.md`（§E 防作弊）。

**誠實限制（寫進註解，不誇大）：** replay 驗證能擋「用 curl 直接造假勝場」「不可能的分數」「挪用他人 replay」；**無法**擋「同一人控制兩個錢包、真的自己對打放水刷分」（需身分證明，超出範圍）。配合既有「雙方一致簽章才入帳」共識，已把實務作弊成本拉高到合理程度。

**全程慣例：** TDD；無 `!important`/行內樣式（本階段不碰 UI）；commit 結尾 `Co-Authored-By: Claude <noreply@anthropic.com>`；在 worktree 內、分支 `feature/dungeon-arcade-anticheat`。

---

## 檔案結構
- 修改 `src/scripts/games/tetris/net/rankStore.ts` — `markSettled` 回傳 boolean（SET NX 是否首次）。
- 修改 `src/scripts/games/tetris/net/rankStore.test.ts` — markSettled 原子性測試。
- 修改 `src/scripts/games/tetris/net/ranking.ts` — `reportResult` 以 markSettled 回傳值當原子閘。
- 修改 `src/scripts/games/tetris/net/ranking.test.ts` — 並發重複只計一次。
- 新增 `src/scripts/games/tetris/net/replay.ts` — `MatchReplay` 型別 + `simulateReplay` + `verifyReplay`（純函式、可在 serverless 跑）。
- 新增 `src/scripts/games/tetris/net/replay.test.ts`。
- 修改 `src/scripts/games/tetris/net/lockstep.ts` — 錄製 replay（seed + 稀疏逐幀輸入）+ `getReplay()`。
- 修改 `src/scripts/games/tetris/net/lockstep.test.ts` — getReplay → simulateReplay 還原一致。
- 修改 `src/pages/api/match.ts` — 驗 replay（seed 綁 matchId、side→ID 映射、大小上限）+ 地址小寫入庫。
- 修改 `src/pages/api/profile.ts` — addr 小寫查詢。
- 修改 `src/scripts/games/tetris/net/netMain.ts` — `reportRanked` 附上 replay + aId/bId。

---

## Task 1：原子化結算（markSettled → SET NX 回傳 boolean）

**Files:**
- Modify: `src/scripts/games/tetris/net/rankStore.ts`
- Test: `src/scripts/games/tetris/net/rankStore.test.ts`

- [ ] **Step 1: 寫失敗測試**（附加到 rankStore.test.ts 末端）

```ts
describe('markSettled 原子性（首次 true、重複 false）', () => {
  it('同一 matchId 第一次回 true、第二次回 false', async () => {
    const s = new MemoryRankStore();
    expect(await s.markSettled('m-atomic', 60)).toBe(true);
    expect(await s.markSettled('m-atomic', 60)).toBe(false);
  });
});
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `npx vitest run src/scripts/games/tetris/net/rankStore.test.ts`
Expected: FAIL（markSettled 目前回傳 void / 第二次不是 false）

- [ ] **Step 3: 實作**

在 `rankStore.ts` 的 `RankStore` 介面，把 `markSettled` 簽章改為回傳是否首次設定：

```ts
  /** 標記已結算；回傳 true 代表本次為首次（原子閘）。 */
  markSettled(matchId: string, ttlSec: number): Promise<boolean>;
```

`MemoryRankStore.markSettled` 改為：

```ts
  async markSettled(matchId: string, ttlSec: number): Promise<boolean> {
    const e = this.settled.get(matchId);
    if (e !== undefined && e > Date.now()) return false; // 已結算（未過期）
    this.settled.set(matchId, Date.now() + ttlSec * 1000);
    return true;
  }
```

`UpstashRankStore.markSettled` 改為用 `SET … NX EX`（原子）：

```ts
  async markSettled(matchId: string, ttlSec: number): Promise<boolean> {
    const r = await this.cmd('set', `done:${matchId}`, '1', 'NX', 'EX', String(ttlSec));
    return r === 'OK'; // NX 成功回 "OK"，已存在回 null
  }
```

- [ ] **Step 4: 跑測試確認通過**

Run: `npx vitest run src/scripts/games/tetris/net/rankStore.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/scripts/games/tetris/net/rankStore.ts src/scripts/games/tetris/net/rankStore.test.ts
git commit -m "feat(rankStore): markSettled returns first-writer boolean (SET NX) for atomic settle

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Task 2：`reportResult` 以 markSettled 當原子閘（防並發重複計分）

**Files:**
- Modify: `src/scripts/games/tetris/net/ranking.ts`
- Test: `src/scripts/games/tetris/net/ranking.test.ts`

- [ ] **Step 1: 寫失敗測試**（附加到 ranking.test.ts）

```ts
describe('並發重複結算只計一次', () => {
  it('雙方一致後，兩個 settled 請求同時進來 → 只 apply 一次', async () => {
    const s = new MemoryRankStore();
    const A = '0xaaaa', B = '0xbbbb', mid = 'm-race';
    await reportResult(s, { matchId: mid, reporter: A, opponent: B, winner: A }); // pending
    // 兩個「對手回報」同時抵達（同 winner）→ 只能有一個 settled、一個 already
    const [r1, r2] = await Promise.all([
      reportResult(s, { matchId: mid, reporter: B, opponent: A, winner: A }),
      reportResult(s, { matchId: mid, reporter: B, opponent: A, winner: A }),
    ]);
    expect([r1, r2].filter((x) => x === 'settled').length).toBe(1);
    expect([r1, r2].filter((x) => x === 'already').length).toBe(1);
    const pa = await s.getPlayer(A);
    expect(pa?.games).toBe(1); // 只計一場（非 2）
  });
});
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `npx vitest run src/scripts/games/tetris/net/ranking.test.ts`
Expected: FAIL（games=2 或兩個都 settled）

- [ ] **Step 3: 實作**

把 `reportResult` 的結算段改為以 `markSettled` 回傳值當唯一閘（移除 settle 前的第二次 isSettled 預檢）：

```ts
  if (oppClaim !== winner) return 'conflict';

  // 原子閘：只有第一個成功 markSettled 的請求能入帳（防並發重複計分）
  const first = await store.markSettled(matchId, SETTLED_TTL);
  if (!first) return 'already';
  await applyResult(store, reporter, opponent, winner);
  return 'settled';
```

（函式開頭那次 `if (await store.isSettled(matchId)) return 'already';` 的快速路徑保留即可。）

- [ ] **Step 4: 跑測試確認通過**

Run: `npx vitest run src/scripts/games/tetris/net/ranking.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/scripts/games/tetris/net/ranking.ts src/scripts/games/tetris/net/ranking.test.ts
git commit -m "fix(ranking): gate scoring on atomic markSettled to prevent concurrent double-count

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Task 3：地址大小寫正規化（入庫前一律小寫）

**Files:**
- Modify: `src/pages/api/match.ts`
- Modify: `src/pages/api/profile.ts`

（簽章仍以「使用者實際簽的原始大小寫」驗證，驗過後才小寫入庫——避免 checksummed vs lowercase 產生分裂紀錄。`verifySignature` 內部本來就會把兩邊轉小寫比對，所以以原始 reporter 驗證沒問題。）

- [ ] **Step 1: 修改 `match.ts`**

把 `reportResult` 呼叫改為傳入小寫地址（簽章驗證維持用原始 `rep`）：

```ts
  const message = buildResultMessage(m, rep, opp, win);
  if (!verifySignature(message, signature as string, rep)) {
    return json({ error: 'bad signature' }, 401);
  }

  const status = await reportResult(getRankStore(), {
    matchId: m,
    reporter: rep.toLowerCase(),
    opponent: opp.toLowerCase(),
    winner: win.toLowerCase(),
  });
  return json({ status });
```

- [ ] **Step 2: 修改 `profile.ts`**

```ts
  const addr = (url.searchParams.get('addr') ?? '').trim().toLowerCase();
```

- [ ] **Step 3: 建置驗證**

Run: `npm run build`
Expected: 成功、無型別錯誤。

- [ ] **Step 4: Commit**

```bash
git add src/pages/api/match.ts src/pages/api/profile.ts
git commit -m "fix(api): normalize wallet addresses to lowercase for storage/lookup

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Task 4：`replay.ts` — 確定性重模擬 + 驗證（純函式）

**Files:**
- Create: `src/scripts/games/tetris/net/replay.ts`
- Test: `src/scripts/games/tetris/net/replay.test.ts`

- [ ] **Step 1: 寫失敗測試**

Create `src/scripts/games/tetris/net/replay.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { simulateReplay, verifyReplay, type MatchReplay } from './replay';
import { TetrisMatch } from '../engine/match';
import type { InputAction } from '../engine/game';

const SIM_DT = 1000 / 60;

// 用「一方狂硬降把自己堆死」造一個可重現、有確定勝負的對局，並錄成 replay
function buildReplay(seed: number): { replay: MatchReplay; winner: 'A' | 'B' } {
  const m = new TetrisMatch({ seed });
  const events: MatchReplay['events'] = [];
  let f = 0;
  for (; f < 4000 && m.phase === 'playing'; f++) {
    const a: InputAction[] = (f % 2 === 0) ? ['hardDrop'] : []; // A 一直硬降 → 很快堆頂
    const b: InputAction[] = [];
    if (a.length || b.length) events.push({ f, a, b });
    for (const x of a) m.input('A', x);
    for (const x of b) m.input('B', x);
    m.step(SIM_DT);
  }
  return { replay: { seed, frameCount: f, events }, winner: m.winner as 'A' | 'B' };
}

describe('simulateReplay / verifyReplay', () => {
  it('重模擬還原出與原局相同的勝方', () => {
    const { replay, winner } = buildReplay(123);
    expect(['A', 'B']).toContain(winner);
    expect(simulateReplay(replay)).toBe(winner);
  });
  it('宣稱正確勝方 → verify 通過；宣稱反方 → 不通過', () => {
    const { replay, winner } = buildReplay(123);
    const other = winner === 'A' ? 'B' : 'A';
    expect(verifyReplay(replay, winner)).toBe(true);
    expect(verifyReplay(replay, other)).toBe(false);
  });
  it('超量事件/幀數直接拒絕', () => {
    expect(verifyReplay({ seed: 1, frameCount: 99_999_999, events: [] }, 'A')).toBe(false);
  });
});
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `npx vitest run src/scripts/games/tetris/net/replay.test.ts`
Expected: FAIL（找不到 './replay'）

- [ ] **Step 3: 實作 — 建立 `src/scripts/games/tetris/net/replay.ts`**

```ts
import { TetrisMatch, type Side } from '../engine/match';
import type { InputAction } from '../engine/game';

const SIM_DT = 1000 / 60;
const MAX_FRAMES = 60 * 60 * 20; // 上限 20 分鐘，防爆量
const MAX_EVENTS = 8000;

/** 一場 1v1 鎖步的可重播紀錄：seed + 總幀數 + 稀疏的逐幀雙方輸入。 */
export interface MatchReplay {
  seed: number;
  frameCount: number;
  events: Array<{ f: number; a: InputAction[]; b: InputAction[] }>;
}

/** 以確定性引擎重跑該局，回傳勝方（未分勝負回 null）。 */
export function simulateReplay(replay: MatchReplay): Side | null {
  const byFrame = new Map<number, { a: InputAction[]; b: InputAction[] }>();
  for (const e of replay.events) byFrame.set(e.f, { a: e.a, b: e.b });
  const m = new TetrisMatch({ seed: replay.seed });
  const n = Math.min(replay.frameCount, MAX_FRAMES);
  for (let f = 0; f < n && m.phase === 'playing'; f++) {
    const ins = byFrame.get(f);
    if (ins) {
      for (const a of ins.a) m.input('A', a);
      for (const b of ins.b) m.input('B', b);
    }
    m.step(SIM_DT);
  }
  return m.winner ?? null;
}

/** replay 結構合理且重模擬出的勝方 == 宣稱勝方。 */
export function verifyReplay(replay: MatchReplay, claimedWinnerSide: Side): boolean {
  if (!replay || typeof replay.seed !== 'number' || !Number.isFinite(replay.frameCount) || !Array.isArray(replay.events)) {
    return false;
  }
  if (replay.frameCount > MAX_FRAMES || replay.events.length > MAX_EVENTS) return false;
  return simulateReplay(replay) === claimedWinnerSide;
}
```

註：`TetrisMatch` 已有公開的 `phase`（`'playing'|'result'`）與 `winner`（`Side | null`，netMain/aiMain 皆讀取），引擎為純 TS、無瀏覽器相依，可在 Vercel serverless 執行。

- [ ] **Step 4: 跑測試確認通過**

Run: `npx vitest run src/scripts/games/tetris/net/replay.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/scripts/games/tetris/net/replay.ts src/scripts/games/tetris/net/replay.test.ts
git commit -m "feat(net): deterministic replay simulate + verify (server-side anti-cheat core)

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Task 5：Lockstep 錄製 replay + `getReplay()`

**Files:**
- Modify: `src/scripts/games/tetris/net/lockstep.ts`
- Test: `src/scripts/games/tetris/net/lockstep.test.ts`

- [ ] **Step 1: 寫失敗測試**（附加到 lockstep.test.ts）

```ts
import { simulateReplay } from './replay';

it('getReplay() 重模擬出的勝方 == 實際對局勝方', () => {
  const { a, b } = LoopbackPair.create();
  const peerA = new Lockstep({ seed: 999, localSide: 'A', transport: a });
  const peerB = new Lockstep({ seed: 999, localSide: 'B', transport: b });
  // A 狂硬降把自己堆死
  for (let f = 0; f < 4000 && peerA.match.phase === 'playing'; f++) {
    if (f % 2 === 0) peerA.pressLocal('hardDrop');
    peerA.tick();
    peerB.tick();
  }
  expect(peerA.match.phase).toBe('result');
  const replay = peerA.getReplay();
  expect(replay.seed).toBe(999);
  expect(simulateReplay(replay)).toBe(peerA.match.winner);
});
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `npx vitest run src/scripts/games/tetris/net/lockstep.test.ts`
Expected: FAIL（`getReplay` 不存在）

- [ ] **Step 3: 實作 — 在 `lockstep.ts` 錄製套用的輸入**

(a) import 型別 + 新增欄位（在 class 內，`inbox` 宣告附近）：

```ts
import type { MatchReplay } from './replay';
```

```ts
  private readonly seed: number;
  private replayEvents: MatchReplay['events'] = [];
```

(b) constructor 開頭存 seed：

```ts
  constructor(opts: LockstepOptions) {
    this.match = new TetrisMatch({ seed: opts.seed });
    this.seed = opts.seed;
    this.localSide = opts.localSide;
    this.transport = opts.transport;
```

(c) 在 `tick()` 的 while 迴圈，套用輸入「之前」錄下非空幀（與套用順序一致）：

```ts
    while (this.inbox.A.has(this.simFrame) && this.inbox.B.has(this.simFrame)) {
      const aIn = this.inbox.A.get(this.simFrame)!;
      const bIn = this.inbox.B.get(this.simFrame)!;
      if (aIn.length || bIn.length) this.replayEvents.push({ f: this.simFrame, a: aIn, b: bIn });
      for (const act of aIn) this.match.input('A', act);
      for (const act of bIn) this.match.input('B', act);
      this.match.step(SIM_DT);
      this.inbox.A.delete(this.simFrame);
      this.inbox.B.delete(this.simFrame);
      this.simFrame++;
    }
```

(d) 新增方法（class 內，`tick()` 之後）：

```ts
  /** 取得本局可重播紀錄（用於後端 replay 抽驗）。 */
  getReplay(): MatchReplay {
    return { seed: this.seed, frameCount: this.simFrame, events: this.replayEvents };
  }
```

- [ ] **Step 4: 跑測試確認通過**

Run: `npx vitest run src/scripts/games/tetris/net/lockstep.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/scripts/games/tetris/net/lockstep.ts src/scripts/games/tetris/net/lockstep.test.ts
git commit -m "feat(lockstep): record deterministic replay log + getReplay()

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Task 6：接線——回報附 replay、`/api/match` 驗 replay

**Files:**
- Modify: `src/scripts/games/tetris/net/netMain.ts`
- Modify: `src/pages/api/match.ts`

回報的 winner 是「ID（地址）」，replay 重模擬出的是「side（A/B）」。映射靠 host=A、guest=B：回報時附上 `aId`/`bId`（reporter 依自己的 `localSide` 推出）。seed 由 `matchId`（格式 `${room}-${seed.toString(36)}`）綁定——伺服器從 matchId 解析 seed 並要求 `replay.seed` 相符，replay 即被簽章（matchId 已簽）間接綁定。

- [ ] **Step 1: netMain `reportRanked` 附 replay + aId/bId**

把 `reportRanked` 內送出的 body 改為（lockstep 變數在 `runGame` 作用域內可取）：

```ts
    async function reportRanked(winnerSide: Side): Promise<void> {
      if (!(identity.ranked && oppRanked && identity.signMessage)) return;
      const winnerId = winnerSide === localSide ? identity.id : oppId;
      const aId = localSide === 'A' ? identity.id : oppId;
      const bId = localSide === 'A' ? oppId : identity.id;
      try {
        const sig = await identity.signMessage(buildResultMessage(matchId, identity.id, oppId, winnerId));
        const res = await fetch('/api/match', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            matchId, reporter: identity.id, opponent: oppId, winner: winnerId, signature: sig,
            aId, bId, replay: lockstep.getReplay(),
          }),
        });
        const { status } = (await res.json()) as { status: string };
        banner.text += status === 'settled' ? '\nRANKED ✓' : status === 'pending' ? '\n等對手確認…' : '';
      } catch { /* 回報失敗不影響對局 */ }
    }
```

- [ ] **Step 2: `/api/match` 驗 replay**

在 `match.ts` import：

```ts
import { verifyReplay, type MatchReplay } from '@scripts/games/tetris/net/replay';
```

在簽章驗證通過後、呼叫 `reportResult` 之前插入 replay 驗證：

```ts
  const message = buildResultMessage(m, rep, opp, win);
  if (!verifySignature(message, signature as string, rep)) {
    return json({ error: 'bad signature' }, 401);
  }

  // ── replay 抽驗：宣稱勝方必須由 seed + 雙方輸入重現 ──
  const replay = body.replay as MatchReplay | undefined;
  const aId = body.aId, bId = body.bId;
  if (!replay || typeof aId !== 'string' || typeof bId !== 'string') {
    return json({ error: 'missing replay' }, 400);
  }
  // seed 必須與 matchId 內嵌的 seed 相符（matchId 已被簽章 → 綁定 replay）
  const seedFromMatch = parseInt(m.split('-')[1] ?? '', 36);
  if (!Number.isFinite(seedFromMatch) || replay.seed !== seedFromMatch) {
    return json({ error: 'replay seed mismatch' }, 400);
  }
  // 確認宣稱的 winner ID 對應到 replay 重模擬出的勝方 side
  const expectWinnerId = (side: 'A' | 'B') => (side === 'A' ? aId : bId);
  const okA = verifyReplay(replay, 'A') && expectWinnerId('A').toLowerCase() === win.toLowerCase();
  const okB = verifyReplay(replay, 'B') && expectWinnerId('B').toLowerCase() === win.toLowerCase();
  if (!okA && !okB) {
    return json({ error: 'replay does not support result' }, 400);
  }

  const status = await reportResult(getRankStore(), {
    matchId: m,
    reporter: rep.toLowerCase(),
    opponent: opp.toLowerCase(),
    winner: win.toLowerCase(),
  });
  return json({ status });
```

註：`verifyReplay` 內已做大小/幀數上限；再加 Astro/Vercel 對 body 大小本有限制。`aId/bId` 映射未被簽章，但「雙方一致才入帳」共識會要求對手回報同一 winner ID，誤報映射無法單方成立（Sybil 自打自仍無法靠此擋，見計畫開頭限制）。

- [ ] **Step 3: 建置驗證**

Run: `npm run build`
Expected: 成功（engine + replay 被打包進 `/api/match` 函式，無型別錯誤）。

- [ ] **Step 4: 全套單元 + 既有線上 e2e（兩瀏覽器）回歸**

Run: `npx vitest run`
Expected: 全綠。

Run: `npx playwright test tests/e2e/games-tetris-online.spec.ts --project=chromium`
Expected: 通過（線上對戰跑完、結算路徑含 replay 不報錯）。若該 e2e 因 WebRTC 環境不穩偶發失敗，重跑一次；穩定失敗才視為回歸。

- [ ] **Step 5: Commit**

```bash
git add src/scripts/games/tetris/net/netMain.ts src/pages/api/match.ts
git commit -m "feat(match): require & verify deterministic replay before recording ranked result

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## 完成後驗收
- 單元測試全綠（含 markSettled 原子性、並發只計一次、replay 重模擬/驗證、lockstep getReplay 一致）。
- `/api/match` 沒帶 replay 或 replay 對不上宣稱勝方 → 400 拒絕；正常對局結算照舊 `settled`。
- 地址大小寫不再分裂（小寫入庫/查詢）。
- 不影響 SOLO/vs-AI（它們不打 `/api/match`）。

## 階段 2 不做（留待後續）
- 名次制 FFA 積分（generalised ELO）＋ 8 人 replay → 併入階段 3（8 人大亂鬥）。
- leaderboard N+1 查詢改 MGET（純效能，非安全）。
- 完整 anti-Sybil（身分證明）——超出本專案範圍。
