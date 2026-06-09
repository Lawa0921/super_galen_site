# Dungeon Arcade 階段 1：主選單 + 進度 UI + 內嵌排行榜　實作計畫

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 `/games/tetris` 入場畫面升級為三分頁主選單（PLAY / LEADERBOARD / PROFILE），讓玩家看到自己的等級/積分與內嵌排行榜；資料沿用現有 1v1 線上對戰產生（不改 netcode）。

**Architecture:** 新增純函式進度系統（XP/等級）、擴充既有 `rankStore` 玩家資料與 `ranking` 入帳路徑以累加 XP、新增 `/api/profile`、擴充 `/api/leaderboard` 欄位，最後在 `tetris.astro` 用三分頁選單呈現。後端皆為既有 serverless（Upstash 已接好），帳單安全不變。

**Tech Stack:** Astro 5 server endpoints（`prerender=false`）、TypeScript 純函式、Vitest 單元測試、Playwright e2e、Upstash Redis REST（`getRankStore` 已相容 `KV_REST_API_*`）。

**Spec：** `docs/superpowers/specs/2026-06-06-dungeon-arcade-mainmenu-progression-8p-design.md`（階段 1 章節）。

**全程慣例：** 每個檔案一個明確職責；無 `!important`、無行內樣式；commit 訊息用 Conventional Commits、結尾 `Co-Authored-By: Claude <noreply@anthropic.com>`。在 worktree 內執行（cwd 已是 worktree）。

---

## 檔案結構

- 新增 `src/scripts/games/tetris/net/progression.ts` — XP/等級純函式（無 IO）。
- 新增 `src/scripts/games/tetris/net/progression.test.ts` — 上者單元測試。
- 修改 `src/scripts/games/tetris/net/rankStore.ts` — `PlayerRecord` 加 `xp/level/games/top3`；新增 `normalizePlayer`；兩個實作的 `getPlayer` 正規化舊資料。
- 修改 `src/scripts/games/tetris/net/rankStore.test.ts` — 擴充欄位往返 + 正規化測試（檔案目前已存在，新增 describe）。
- 修改 `src/scripts/games/tetris/net/ranking.ts` — `fresh()` 補預設、`applyResult` 接 `progression`；`LeaderRow`/`leaderboard()` 加 `level/xp/games/top3`。
- 修改 `src/scripts/games/tetris/net/ranking.test.ts` — 結算後 XP/等級/場數斷言（檔案已存在，新增 case）。
- 新增 `src/pages/api/profile.ts` — `GET ?addr=` 回單一玩家檔案。
- 修改 `src/pages/games/tetris.astro` — 三分頁主選單 markup + style + script。
- 新增 `tests/e2e/games-tetris-menu.spec.ts` — 主選單分頁 e2e。

---

## Task 1：進度系統純函式 `progression.ts`

**Files:**
- Create: `src/scripts/games/tetris/net/progression.ts`
- Test: `src/scripts/games/tetris/net/progression.test.ts`

- [ ] **Step 1: 寫失敗測試**

Create `src/scripts/games/tetris/net/progression.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { xpForMatch, xpForLevel, levelForXp, levelProgress } from './progression';

describe('xpForMatch', () => {
  it('1v1 勝方：參與10 + 名次5 + 勝25 = 40', () => {
    expect(xpForMatch(2, 1, true)).toBe(40);
  });
  it('1v1 敗方：參與10 + 名次0 + 勝0 = 10', () => {
    expect(xpForMatch(2, 2, false)).toBe(10);
  });
  it('8 人冠軍：10 + 5*(8-1) + 25 = 70', () => {
    expect(xpForMatch(8, 1, true)).toBe(70);
  });
  it('8 人墊底：10 + 5*(8-8) + 0 = 10', () => {
    expect(xpForMatch(8, 8, false)).toBe(10);
  });
});

describe('xpForLevel / levelForXp（三角數門檻 50*L*(L-1)）', () => {
  it('門檻：L1=0, L2=100, L3=300', () => {
    expect(xpForLevel(1)).toBe(0);
    expect(xpForLevel(2)).toBe(100);
    expect(xpForLevel(3)).toBe(300);
  });
  it('levelForXp：0→1、99→1、100→2、299→2、300→3', () => {
    expect(levelForXp(0)).toBe(1);
    expect(levelForXp(99)).toBe(1);
    expect(levelForXp(100)).toBe(2);
    expect(levelForXp(299)).toBe(2);
    expect(levelForXp(300)).toBe(3);
  });
});

describe('levelProgress', () => {
  it('150 XP → 等級2、本級進度 50/200 = 0.25', () => {
    const p = levelProgress(150);
    expect(p.level).toBe(2);
    expect(p.into).toBe(50);
    expect(p.need).toBe(200);
    expect(p.ratio).toBeCloseTo(0.25, 5);
  });
});
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `npx vitest run src/scripts/games/tetris/net/progression.test.ts`
Expected: FAIL（`Cannot find module './progression'`）

- [ ] **Step 3: 實作**

Create `src/scripts/games/tetris/net/progression.ts`:

```ts
/**
 * 進度系統（純函式）：XP / 等級。只升不降，與 IO 無關，可單測。
 */

/** 一場對戰可得 XP：參與 10 + 名次獎勵 5*(人數-名次) + 勝利 25。placement 1 = 冠軍。 */
export function xpForMatch(players: number, placement: number, isWinner: boolean): number {
  const base = 10;
  const placeBonus = 5 * Math.max(0, players - placement);
  const winBonus = isWinner ? 25 : 0;
  return base + placeBonus + winBonus;
}

/** 累計到第 L 級（L>=1）所需總 XP：三角數門檻 50 * L * (L-1)。 */
export function xpForLevel(level: number): number {
  return 50 * level * (level - 1);
}

/** 由總 XP 推算等級（滿足門檻的最大 L，最低 1）。 */
export function levelForXp(totalXp: number): number {
  let level = 1;
  while (xpForLevel(level + 1) <= totalXp) level++;
  return level;
}

/** 等級進度：目前等級、本級已累積 into、本級需要 need、比例 ratio(0..1)。 */
export function levelProgress(totalXp: number): { level: number; into: number; need: number; ratio: number } {
  const level = levelForXp(totalXp);
  const cur = xpForLevel(level);
  const next = xpForLevel(level + 1);
  const into = totalXp - cur;
  const need = next - cur;
  return { level, into, need, ratio: need > 0 ? into / need : 0 };
}
```

- [ ] **Step 4: 跑測試確認通過**

Run: `npx vitest run src/scripts/games/tetris/net/progression.test.ts`
Expected: PASS（4 + 4 + ... 全綠）

- [ ] **Step 5: Commit**

```bash
git add src/scripts/games/tetris/net/progression.ts src/scripts/games/tetris/net/progression.test.ts
git commit -m "feat(progression): add pure XP/level functions for player progression

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Task 2：擴充 `PlayerRecord` 與 `rankStore`

**Files:**
- Modify: `src/scripts/games/tetris/net/rankStore.ts`
- Test: `src/scripts/games/tetris/net/rankStore.test.ts`（已存在，新增 describe）

- [ ] **Step 1: 寫失敗測試**

在 `src/scripts/games/tetris/net/rankStore.test.ts` 末端新增（檔案頂部 import 改為同時引入 `MemoryRankStore, normalizePlayer`）：

```ts
import { MemoryRankStore, normalizePlayer } from './rankStore';

describe('PlayerRecord 擴充欄位', () => {
  it('setPlayer/getPlayer 往返保留 xp/level/games/top3', async () => {
    const s = new MemoryRankStore();
    await s.setPlayer('0xabc', { name: 'A', rating: 1200, wins: 3, losses: 1, xp: 250, level: 2, games: 4, top3: 4 });
    const p = await s.getPlayer('0xabc');
    expect(p).toMatchObject({ rating: 1200, wins: 3, losses: 1, xp: 250, level: 2, games: 4, top3: 4 });
  });

  it('normalizePlayer 補齊舊資料缺少的欄位', () => {
    const legacy = { rating: 1100, wins: 2, losses: 2 } as Record<string, unknown>;
    const n = normalizePlayer(legacy);
    expect(n).toMatchObject({ rating: 1100, wins: 2, losses: 2, xp: 0, level: 1, games: 0, top3: 0 });
  });

  it('topPlayers 仍依 rating 由高到低', async () => {
    const s = new MemoryRankStore();
    await s.setPlayer('low', { rating: 1000, wins: 0, losses: 0, xp: 0, level: 1, games: 0, top3: 0 });
    await s.setPlayer('high', { rating: 1500, wins: 0, losses: 0, xp: 0, level: 1, games: 0, top3: 0 });
    const top = await s.topPlayers(10);
    expect(top.map((t) => t.id)).toEqual(['high', 'low']);
  });
});
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `npx vitest run src/scripts/games/tetris/net/rankStore.test.ts`
Expected: FAIL（`normalizePlayer` 未匯出 / 型別不符）

- [ ] **Step 3: 實作 — 擴充介面、新增 normalizePlayer、正規化 getPlayer**

在 `rankStore.ts`，把 `PlayerRecord` 介面改為：

```ts
export interface PlayerRecord {
  name?: string;
  rating: number;
  wins: number;
  losses: number;
  xp: number;
  level: number;
  games: number;
  top3: number;
}

/** 補齊舊資料缺少的進度欄位（向後相容）。 */
export function normalizePlayer(p: Record<string, unknown>): PlayerRecord {
  return {
    name: typeof p.name === 'string' ? p.name : undefined,
    rating: Number(p.rating ?? 1000),
    wins: Number(p.wins ?? 0),
    losses: Number(p.losses ?? 0),
    xp: Number(p.xp ?? 0),
    level: Number(p.level ?? 1),
    games: Number(p.games ?? 0),
    top3: Number(p.top3 ?? 0),
  };
}
```

把 `MemoryRankStore.getPlayer` 改為正規化回傳：

```ts
  async getPlayer(id: string): Promise<PlayerRecord | null> {
    const p = this.players.get(id);
    return p ? normalizePlayer(p as unknown as Record<string, unknown>) : null;
  }
```

把 `UpstashRankStore.getPlayer` 改為正規化：

```ts
  async getPlayer(id: string): Promise<PlayerRecord | null> {
    const r = await this.cmd('get', `player:${id}`);
    return r ? normalizePlayer(JSON.parse(String(r)) as Record<string, unknown>) : null;
  }
```

（`setPlayer`、`topPlayers`、共識相關方法不變。）

- [ ] **Step 4: 跑測試確認通過**

Run: `npx vitest run src/scripts/games/tetris/net/rankStore.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/scripts/games/tetris/net/rankStore.ts src/scripts/games/tetris/net/rankStore.test.ts
git commit -m "feat(rankStore): extend PlayerRecord with xp/level/games/top3 + legacy normalize

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Task 3：把進度接進 `ranking` 入帳路徑

**Files:**
- Modify: `src/scripts/games/tetris/net/ranking.ts`
- Test: `src/scripts/games/tetris/net/ranking.test.ts`（已存在，新增 case）

- [ ] **Step 1: 寫失敗測試**

在 `ranking.test.ts` 新增（沿用該檔既有的 MemoryRankStore 建立方式；下方為自含 case）：

```ts
import { MemoryRankStore } from './rankStore';
import { reportResult } from './ranking';

describe('結算後累加 XP / 等級 / 場數', () => {
  it('雙方一致結算 → 勝方 xp40、敗方 xp10，兩人 games=1', async () => {
    const s = new MemoryRankStore();
    const A = '0xAAAA', B = '0xBBBB', mid = 'm1';
    expect(await reportResult(s, { matchId: mid, reporter: A, opponent: B, winner: A })).toBe('pending');
    expect(await reportResult(s, { matchId: mid, reporter: B, opponent: A, winner: A })).toBe('settled');
    const pa = await s.getPlayer(A);
    const pb = await s.getPlayer(B);
    expect(pa?.xp).toBe(40);
    expect(pa?.wins).toBe(1);
    expect(pa?.games).toBe(1);
    expect(pb?.xp).toBe(10);
    expect(pb?.losses).toBe(1);
    expect(pb?.games).toBe(1);
    expect(pa?.level).toBe(1); // 40 XP < 100，仍 1 級
  });
});
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `npx vitest run src/scripts/games/tetris/net/ranking.test.ts`
Expected: FAIL（`xp` 為 undefined / 不等於 40）

- [ ] **Step 3: 實作 — fresh() 補預設 + applyMatchProgress + applyResult 改寫 + LeaderRow 擴充**

在 `ranking.ts` 頂部 import 補進 `progression`：

```ts
import { updateRatings, tierFor, DEFAULT_RATING } from './elo';
import { xpForMatch, levelForXp } from './progression';
import type { RankStore, PlayerRecord } from './rankStore';
```

`fresh()` 改為：

```ts
function fresh(): PlayerRecord {
  return { rating: DEFAULT_RATING, wins: 0, losses: 0, xp: 0, level: 1, games: 0, top3: 0 };
}
```

新增名次進度套用函式（放在 `applyResult` 之前）：

```ts
/** 依本場名次累加 XP/等級/場數/勝負/前三。placement 1 = 冠軍。 */
function applyMatchProgress(rec: PlayerRecord, placement: number, players: number): void {
  const isWinner = placement === 1;
  rec.xp += xpForMatch(players, placement, isWinner);
  rec.level = levelForXp(rec.xp);
  rec.games += 1;
  if (isWinner) rec.wins += 1; else rec.losses += 1;
  if (placement <= 3) rec.top3 += 1;
}
```

`applyResult` 改為（用 `applyMatchProgress` 取代原本手動 wins/losses）：

```ts
async function applyResult(store: RankStore, a: string, b: string, winner: string): Promise<void> {
  const pa = (await store.getPlayer(a)) ?? fresh();
  const pb = (await store.getPlayer(b)) ?? fresh();
  const w = winner === a ? 'a' : 'b';
  const upd = updateRatings(pa.rating, pb.rating, w);
  pa.rating = upd.a;
  pb.rating = upd.b;
  // 1v1：勝方名次 1、敗方名次 2，人數 2
  applyMatchProgress(pa, w === 'a' ? 1 : 2, 2);
  applyMatchProgress(pb, w === 'b' ? 1 : 2, 2);
  await store.setPlayer(a, pa);
  await store.setPlayer(b, pb);
}
```

`LeaderRow` 介面與 `leaderboard()` 擴充欄位：

```ts
export interface LeaderRow {
  id: string;
  rating: number;
  tier: string;
  level: number;
  xp: number;
  wins: number;
  losses: number;
  games: number;
  top3: number;
  name?: string;
}

/** 取排行榜前 n 名（附段位/等級/戰績）。 */
export async function leaderboard(store: RankStore, n: number): Promise<LeaderRow[]> {
  const top = await store.topPlayers(n);
  const rows: LeaderRow[] = [];
  for (const t of top) {
    const p = await store.getPlayer(t.id);
    rows.push({
      id: t.id,
      rating: t.rating,
      tier: tierFor(t.rating),
      level: p?.level ?? 1,
      xp: p?.xp ?? 0,
      wins: p?.wins ?? 0,
      losses: p?.losses ?? 0,
      games: p?.games ?? 0,
      top3: p?.top3 ?? 0,
      name: p?.name,
    });
  }
  return rows;
}
```

- [ ] **Step 4: 跑測試確認通過**

Run: `npx vitest run src/scripts/games/tetris/net/ranking.test.ts`
Expected: PASS（含既有 case 不退步）

- [ ] **Step 5: Commit**

```bash
git add src/scripts/games/tetris/net/ranking.ts src/scripts/games/tetris/net/ranking.test.ts
git commit -m "feat(ranking): accrue XP/level/games on settle + enrich leaderboard rows

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Task 4：新增 `/api/profile` 端點

**Files:**
- Create: `src/pages/api/profile.ts`

（API route 需 Astro context，難以純 vitest 單測；邏輯已由 `getPlayer`/`tierFor` 測過。此處以建置 + 手動 curl 驗證。）

- [ ] **Step 1: 實作**

Create `src/pages/api/profile.ts`:

```ts
import type { APIRoute } from 'astro';
import { getRankStore } from '@scripts/games/tetris/net/rankStore';
import { tierFor } from '@scripts/games/tetris/net/elo';
import { levelProgress } from '@scripts/games/tetris/net/progression';

export const prerender = false;

const json = (obj: unknown, status = 200): Response =>
  new Response(JSON.stringify(obj), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });

/** GET /api/profile?addr=0x... — 取單一玩家檔案；找不到回 { profile: null }。 */
export const GET: APIRoute = async ({ url }) => {
  const addr = (url.searchParams.get('addr') ?? '').trim();
  if (!addr) return json({ error: 'missing addr' }, 400);
  const p = await getRankStore().getPlayer(addr);
  const profile = p
    ? {
        addr,
        name: p.name ?? null,
        level: p.level,
        xp: p.xp,
        progress: levelProgress(p.xp).ratio,
        rating: p.rating,
        tier: tierFor(p.rating),
        games: p.games,
        wins: p.wins,
        losses: p.losses,
        top3: p.top3,
      }
    : null;
  return json({ profile });
};
```

- [ ] **Step 2: 建置驗證 + 手動 curl**

Run: `npm run build`
Expected: 成功（`/api/profile` 被打包為函式，無型別錯誤）

本機 dev 驗證（另開終端 `npm run dev` 後）：
```bash
curl -s "http://localhost:4321/api/profile?addr=0xnope" ; echo
# 預期：{"profile":null}
curl -s "http://localhost:4321/api/profile" -o /dev/null -w "%{http_code}\n"
# 預期：400
```

- [ ] **Step 3: Commit**

```bash
git add src/pages/api/profile.ts
git commit -m "feat(api): add /api/profile endpoint for single player record

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Task 5：主選單三分頁 — markup + style

**Files:**
- Modify: `src/pages/games/tetris.astro`

- [ ] **Step 1: 取代 markup**

把現有兩個區塊（`<div class="mode-select" id="mode-select">…</div>` 與 `<div class="mode-select" id="online-panel" hidden>…</div>`，即第 31–55 行那段）整段換成：

```html
    <div class="main-menu" id="main-menu">
      <nav class="mm-tabs" role="tablist">
        <button class="mm-tab is-active" data-tab="play" type="button">▶ PLAY</button>
        <button class="mm-tab" data-tab="leaderboard" type="button">🏆 LEADERBOARD</button>
        <button class="mm-tab" data-tab="profile" type="button">👤 PROFILE</button>
      </nav>

      <section class="mm-panel is-active" id="panel-play">
        <div class="mode-select" id="mode-select">
          <div class="ms-buttons">
            <button class="ms-btn ms-solo" data-mode="solo">SOLO</button>
            <button class="ms-btn" data-mode="ai" data-diff="easy">vs AI · EASY</button>
            <button class="ms-btn" data-mode="ai" data-diff="normal">vs AI · NORMAL</button>
            <button class="ms-btn ms-hard" data-mode="ai" data-diff="hard">vs AI · HARD</button>
            <button class="ms-btn ms-online" data-mode="online">vs 線上對戰</button>
          </div>
        </div>
        <div class="mode-select" id="online-panel" hidden>
          <div class="ms-buttons">
            <input id="online-name" class="online-input" maxlength="12" placeholder="暱稱（選填）" autocomplete="off" />
            <button class="ms-btn ms-wallet" id="online-wallet">🦊 連錢包打排名賽</button>
            <button class="ms-btn ms-online" id="online-create">建立房間</button>
            <div class="online-join">
              <input id="online-room" class="online-input" maxlength="5" placeholder="房號" autocomplete="off" />
              <button class="ms-btn" id="online-join-btn">加入房間</button>
            </div>
            <p class="online-status" id="online-status"></p>
          </div>
        </div>
      </section>

      <section class="mm-panel" id="panel-leaderboard" hidden>
        <h2 class="ms-title">🏆 LEADERBOARD</h2>
        <ol class="lb-list" id="lb-list"><li class="lb-empty">載入中…</li></ol>
      </section>

      <section class="mm-panel" id="panel-profile" hidden>
        <h2 class="ms-title">👤 PROFILE</h2>
        <p class="profile-guest" id="profile-guest">訪客無等級／積分。<br />連錢包以建立你的玩家檔案。</p>
        <button class="ms-btn ms-wallet" id="profile-wallet">🦊 連錢包</button>
        <div class="profile-stats" id="profile-stats" hidden></div>
      </section>
    </div>
```

- [ ] **Step 2: 新增樣式**

在 `<style>` 區塊末端（`</style>` 之前）加入（沿用既有色票，無 `!important`、無行內樣式）：

```css
  .main-menu {
    position: absolute;
    inset: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 22px;
    padding: 24px;
    z-index: 20;
  }
  .mm-tabs { display: flex; gap: 10px; flex-wrap: wrap; justify-content: center; }
  .mm-tab {
    font-family: inherit;
    font-size: 11px;
    letter-spacing: 1px;
    color: #6fa8d8;
    background: rgba(8, 12, 22, 0.72);
    border: 1px solid rgba(54, 230, 255, 0.35);
    border-radius: 8px;
    padding: 10px 14px;
    cursor: pointer;
    transition: color 0.15s ease, box-shadow 0.15s ease, border-color 0.15s ease;
  }
  .mm-tab:hover { color: #36e6ff; }
  .mm-tab.is-active {
    color: #eafdff;
    border-color: rgba(54, 230, 255, 0.85);
    box-shadow: 0 0 14px rgba(54, 230, 255, 0.45);
  }
  .mm-panel { display: none; flex-direction: column; align-items: center; gap: 16px; min-width: min(420px, 86vw); }
  .mm-panel.is-active { display: flex; }
  .mm-panel[hidden] { display: none; }

  .lb-list {
    list-style: none;
    margin: 0;
    padding: 0;
    width: 100%;
    max-height: 52vh;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .lb-row, .lb-empty {
    display: grid;
    grid-template-columns: 42px 1fr auto auto auto auto;
    gap: 8px;
    align-items: center;
    font-size: 10px;
    letter-spacing: 1px;
    color: #cfe9ff;
    background: rgba(8, 12, 22, 0.82);
    border: 1px solid rgba(54, 230, 255, 0.18);
    border-radius: 6px;
    padding: 8px 10px;
  }
  .lb-empty { display: block; text-align: center; color: #6fa8d8; }
  .lb-rank { color: #ffd23f; }
  .lb-tier { color: #c15cff; }
  .lb-rating { color: #4dff88; }

  .profile-guest { font-size: 11px; line-height: 1.8; color: #6fa8d8; text-align: center; }
  .profile-stats { width: 100%; display: flex; flex-direction: column; gap: 8px; }
  .profile-stats[hidden] { display: none; }
  .pf-row { display: flex; justify-content: space-between; font-size: 11px; color: #cfe9ff; }
  .pf-row .pf-k { color: #6fa8d8; }
  .pf-bar { height: 10px; border: 1px solid rgba(54, 230, 255, 0.4); border-radius: 5px; overflow: hidden; background: rgba(8,12,22,0.7); }
  .pf-bar > i { display: block; height: 100%; background: #36e6ff; }
```

備註：把既有 `.mode-select` 的定位樣式若與 `.main-menu` 衝突可保留（`.mode-select` 現在是面板內子容器）；不要刪除既有 `.ms-*`、`.online-*` 樣式。

- [ ] **Step 3: 建置驗證**

Run: `npm run build`
Expected: 成功、無錯誤。

- [ ] **Step 4: Commit**

```bash
git add src/pages/games/tetris.astro
git commit -m "feat(tetris-menu): three-tab main menu shell (play/leaderboard/profile)

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Task 6：主選單 script — 分頁切換 + 排行榜/檔案渲染

**Files:**
- Modify: `src/pages/games/tetris.astro`（`<script>` 區塊）

- [ ] **Step 1: 改開局移除目標為整個主選單**

把 script 內三處 `modeSelect?.remove(); onlinePanel?.remove();`（在 `startSolo`、`startAiMode`、`onStatus` 的 `connected` 分支）改為移除整個選單。先在變數宣告區（`const modeSelect = …` 附近）新增：

```ts
  const mainMenu = document.getElementById('main-menu');
```

然後把那三處的兩行移除呼叫，各自替換為單行：

```ts
    mainMenu?.remove();
```

（`startSolo`、`startAiMode` 內原本的 `modeSelect?.remove(); onlinePanel?.remove();` → `mainMenu?.remove();`；`onStatus` 內 `connected` 分支的 `modeSelect?.remove(); onlinePanel?.remove();` → `mainMenu?.remove();`。）

- [ ] **Step 2: 新增分頁切換 + 渲染邏輯**

在 script 末端（最後那段 `const mode = params.get('mode'); …` 之前）加入：

```ts
  // ---- 分頁切換 ----
  const tabs = Array.from(document.querySelectorAll<HTMLElement>('.mm-tab'));
  const panels: Record<string, HTMLElement | null> = {
    play: document.getElementById('panel-play'),
    leaderboard: document.getElementById('panel-leaderboard'),
    profile: document.getElementById('panel-profile'),
  };
  let lbLoaded = false;
  function switchTab(name: string): void {
    tabs.forEach((t) => t.classList.toggle('is-active', t.dataset.tab === name));
    for (const [key, el] of Object.entries(panels)) {
      if (!el) continue;
      const active = key === name;
      el.classList.toggle('is-active', active);
      el.hidden = !active;
    }
    if (name === 'leaderboard' && !lbLoaded) { lbLoaded = true; void loadLeaderboard(); }
    if (name === 'profile' && wallet) void loadProfile(wallet.address);
  }
  tabs.forEach((t) => t.addEventListener('click', () => switchTab(t.dataset.tab ?? 'play')));

  // ---- 工具 ----
  function escapeHtml(s: string): string {
    return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));
  }
  function shortAddr(a: string): string {
    return a.length > 12 ? `${a.slice(0, 6)}…${a.slice(-4)}` : a;
  }

  // ---- 排行榜 ----
  interface LbRow { id: string; name?: string; level: number; rating: number; tier: string; wins: number; losses: number }
  async function loadLeaderboard(): Promise<void> {
    const list = document.getElementById('lb-list');
    if (!list) return;
    list.innerHTML = '<li class="lb-empty">載入中…</li>';
    try {
      const res = await fetch('/api/leaderboard?n=20');
      const data = (await res.json()) as { rows: LbRow[] };
      if (!data.rows.length) { list.innerHTML = '<li class="lb-empty">尚無紀錄，快來搶頭香！</li>'; return; }
      list.innerHTML = data.rows
        .map((r, i) => {
          const who = r.name ? escapeHtml(r.name) : shortAddr(r.id);
          return `<li class="lb-row"><span class="lb-rank">#${i + 1}</span><span class="lb-name">${who}</span><span class="lb-lv">Lv.${r.level}</span><span class="lb-tier">${r.tier}</span><span class="lb-rating">${r.rating}</span><span class="lb-wl">${r.wins}-${r.losses}</span></li>`;
        })
        .join('');
    } catch {
      list.innerHTML = '<li class="lb-empty">排行榜載入失敗</li>';
    }
  }

  // ---- 個人檔案 ----
  interface Profile { name: string | null; level: number; xp: number; progress: number; rating: number; tier: string; games: number; wins: number; losses: number; top3: number }
  async function loadProfile(addr: string): Promise<void> {
    const guest = document.getElementById('profile-guest');
    const stats = document.getElementById('profile-stats');
    if (!stats) return;
    if (guest) guest.hidden = true;
    stats.hidden = false;
    stats.innerHTML = '<p class="profile-guest">載入中…</p>';
    try {
      const res = await fetch(`/api/profile?addr=${encodeURIComponent(addr)}`);
      const data = (await res.json()) as { profile: Profile | null };
      const p = data.profile;
      if (!p) {
        stats.innerHTML = '<p class="profile-guest">新玩家！打一場排名賽即可建立檔案。</p>';
        return;
      }
      const name = p.name ? escapeHtml(p.name) : shortAddr(addr);
      stats.innerHTML = [
        `<div class="pf-row"><span class="pf-k">玩家</span><span>${name}</span></div>`,
        `<div class="pf-row"><span class="pf-k">等級</span><span>Lv.${p.level}（XP ${p.xp}）</span></div>`,
        `<div class="pf-bar"><i></i></div>`,
        `<div class="pf-row"><span class="pf-k">積分</span><span>${p.rating} · ${p.tier}</span></div>`,
        `<div class="pf-row"><span class="pf-k">戰績</span><span>${p.games} 場 · ${p.wins} 勝 ${p.losses} 敗</span></div>`,
        `<div class="pf-row"><span class="pf-k">前三名次</span><span>${p.top3} 次</span></div>`,
      ].join('');
      // 進度條寬度用 setProperty（腳本動態樣式，非靜態行內樣式，符合規範）
      const bar = stats.querySelector<HTMLElement>('.pf-bar > i');
      if (bar) bar.style.setProperty('width', `${Math.round(p.progress * 100)}%`);
    } catch {
      stats.innerHTML = '<p class="profile-guest">檔案載入失敗</p>';
    }
  }
```

- [ ] **Step 3: profile 分頁的連錢包按鈕接線 + 連錢包後同步 profile**

把既有 `onConnectWallet` 改為連完同步更新兩顆錢包鈕並（若在 profile 分頁）載入檔案；並替 `#profile-wallet` 綁定。將原 `onConnectWallet` 函式內容改為：

```ts
  async function onConnectWallet(): Promise<void> {
    try {
      wallet = await connectWallet();
      if (wallet) {
        const label = `🦊 ${wallet.address.slice(0, 6)}…${wallet.address.slice(-4)}`;
        const onlineBtn = document.getElementById('online-wallet');
        if (onlineBtn) { onlineBtn.textContent = `${label}（排名賽）`; onlineBtn.classList.add('connected'); }
        const pfBtn = document.getElementById('profile-wallet');
        if (pfBtn) { pfBtn.textContent = label; pfBtn.classList.add('connected'); }
        void loadProfile(wallet.address);
      } else if (statusEl) {
        statusEl.textContent = '找不到錢包，將以暱稱進行（不計排名）';
      }
    } catch {
      if (statusEl) statusEl.textContent = '錢包連接取消';
    }
  }
```

在既有 `document.getElementById('online-wallet')?.addEventListener(...)` 附近，新增：

```ts
  document.getElementById('profile-wallet')?.addEventListener('click', () => void onConnectWallet());
```

- [ ] **Step 4: 建置驗證**

Run: `npm run build`
Expected: 成功、無型別錯誤。

- [ ] **Step 5: Commit**

```bash
git add src/pages/games/tetris.astro
git commit -m "feat(tetris-menu): tab switching + leaderboard/profile rendering

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Task 7：主選單 e2e + 全套回歸

**Files:**
- Create: `tests/e2e/games-tetris-menu.spec.ts`

- [ ] **Step 1: 寫 e2e**

Create `tests/e2e/games-tetris-menu.spec.ts`（參考既有 `tests/e2e/games-*.spec.ts` 的 chromium 設定與 base URL；下方用相對路徑）：

```ts
import { test, expect } from '@playwright/test';

test.describe('Tetris 主選單三分頁', () => {
  test('預設顯示 PLAY 分頁與模式按鈕', async ({ page }) => {
    await page.goto('/games/tetris');
    await expect(page.locator('.mm-tab', { hasText: 'PLAY' })).toHaveClass(/is-active/);
    await expect(page.locator('[data-mode="solo"]')).toBeVisible();
  });

  test('切到 LEADERBOARD 顯示清單容器（空狀態或資料）', async ({ page }) => {
    await page.goto('/games/tetris');
    await page.locator('.mm-tab', { hasText: 'LEADERBOARD' }).click();
    await expect(page.locator('#panel-leaderboard')).toBeVisible();
    await expect(page.locator('#lb-list')).toBeVisible();
    // 載入後不應停在「載入中…」
    await expect(page.locator('#lb-list')).not.toContainText('載入中…', { timeout: 5000 });
  });

  test('切到 PROFILE 訪客顯示連錢包 CTA', async ({ page }) => {
    await page.goto('/games/tetris');
    await page.locator('.mm-tab', { hasText: 'PROFILE' }).click();
    await expect(page.locator('#profile-guest')).toBeVisible();
    await expect(page.locator('#profile-wallet')).toBeVisible();
  });

  test('?mode=solo 仍直接開局（選單移除）', async ({ page }) => {
    await page.goto('/games/tetris?mode=solo');
    await expect(page.locator('#main-menu')).toHaveCount(0);
    await expect(page.locator('#tetris-canvas')).toBeVisible();
  });
});
```

- [ ] **Step 2: 跑此 e2e**

Run: `npx playwright test tests/e2e/games-tetris-menu.spec.ts --project=chromium`
Expected: 4 passed。（若 webServer 設定需先啟動，依 `playwright.config.ts` 既有 webServer 自動起；如失敗先 `npm run build && npm run preview` 對照。）

- [ ] **Step 3: 全套單元測試回歸**

Run: `npx vitest run`
Expected: 全綠（既有 197 + 新增約 11，無退步）。

- [ ] **Step 4: 既有遊戲 e2e 不退步**

Run: `npx playwright test tests/e2e/games-tetris.spec.ts tests/e2e/games-tetris-ai.spec.ts tests/e2e/games-hall.spec.ts --project=chromium`
Expected: 全綠。

- [ ] **Step 5: Commit**

```bash
git add tests/e2e/games-tetris-menu.spec.ts
git commit -m "test(e2e): main menu tabs (play/leaderboard/profile) + solo deep-link

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## 完成後驗收

- 進 `/games/tetris`：三分頁可切換；PLAY 維持 SOLO/AI/線上既有行為。
- LEADERBOARD 分頁：顯示排行榜（空狀態或現有資料），含名次/暱稱/等級/段位/積分/戰績。
- PROFILE 分頁：訪客顯示連錢包 CTA；連錢包後顯示等級（XP）、積分、段位、戰績。
- 打一場 1v1 排名賽（雙方簽章一致）後，玩家 XP 累加、等級/積分更新並反映在 PROFILE 與 LEADERBOARD。
- `npx vitest run` 全綠；既有遊戲 e2e 不退步。
- 不引入新雲端成本（沿用既有 Upstash / serverless）。

## 階段 1 不做（留待後續階段）

名次制 FFA 積分改寫、replay 抽驗、結算共識、8 人大亂鬥 netcode（星狀中繼）、私人房 2–8、公開快速配對 —— 各自於階段 2/3/4 以獨立 spec→plan 進行。
