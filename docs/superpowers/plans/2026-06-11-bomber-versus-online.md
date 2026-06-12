# Dungeon Bomber 連線對戰 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 為 /games/bomber 加入 2-4 人連線生存對戰：8 張固定對稱競技場、Elo 牌位＋XP 等級雙軌。

**Architecture:** 獨立純 TS `VersusMatch` 引擎（與單機共用 engine/ 原語、零 Pixi、全單測）；網路複用 tetris 的 lockstep/WebRTC/signal 模式（bomber 專屬副本）；結算複用 `/api/ffa-match` 共識回報模式與 `elo/ffaElo/progression` 公式，rankStore key 加 `bomber:` 前綴隔離天梯。

**Tech Stack:** TypeScript、Vitest、PixiJS 8（render 層）、WebRTC + Upstash signaling（沿用 tetris）、Astro API routes。

**Spec:** `docs/superpowers/specs/2026-06-11-bomber-versus-online-design.md`

**慣例（全計畫適用）：**
- 跑單測：`npx vitest run src/scripts/games/bomber/versus`（或具體檔案）
- 引擎鐵則：禁用 `Math.random` / `Date.now`（決定性）；UI 字串全英文（arcade 慣例）
- 每個 Task 結尾 commit，**只 `git add` 該 Task 列出的檔案**（工作區有使用者未提交的其他工作，絕不可 `git add -A`）

---

## Phase 1 — Versus 引擎＋8 競技場

### Task 1: versus 型別與 8 張競技場模板

**Files:**
- Create: `src/scripts/games/bomber/versus/types.ts`
- Create: `src/scripts/games/bomber/versus/arenas.ts`
- Test: `src/scripts/games/bomber/versus/arenas.test.ts`

- [ ] **Step 1: 寫失敗測試**

```ts
// src/scripts/games/bomber/versus/arenas.test.ts
import { describe, it, expect } from 'vitest';
import { ARENAS, parseArena } from './arenas';
import { GRID_COLS, GRID_ROWS } from '../engine/constants';

describe('arenas', () => {
  it('共 8 張，id 0-7，各有名稱與主題索引', () => {
    expect(ARENAS).toHaveLength(8);
    ARENAS.forEach((a, i) => {
      expect(a.id).toBe(i);
      expect(a.name.length).toBeGreaterThan(0);
      expect(a.theme).toBeGreaterThanOrEqual(0);
      expect(a.theme).toBeLessThanOrEqual(7);
    });
  });

  it('模板尺寸正確且外框全牆', () => {
    for (const a of ARENAS) {
      const { grid } = parseArena(a, 2, 1);
      expect(grid).toHaveLength(GRID_ROWS);
      grid.forEach((row) => expect(row).toHaveLength(GRID_COLS));
      for (let x = 0; x < GRID_COLS; x++) {
        expect(grid[0][x]).toBe('wall');
        expect(grid[GRID_ROWS - 1][x]).toBe('wall');
      }
    }
  });

  it('出生點：2 人場給 2 個、4 人場給 4 個，且彼此距離 >= 8（公平）', () => {
    for (const a of ARENAS) {
      for (const n of [2, 3, 4] as const) {
        const { spawns } = parseArena(a, n, 1);
        expect(spawns).toHaveLength(n);
        for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
          const d = Math.abs(spawns[i].x - spawns[j].x) + Math.abs(spawns[i].y - spawns[j].y);
          expect(d, `${a.name} spawns ${i},${j}`).toBeGreaterThanOrEqual(8);
        }
      }
    }
  });

  it('出生點四周 1 格淨空（floor，可起步）', () => {
    for (const a of ARENAS) {
      const { grid, spawns } = parseArena(a, 4, 7);
      for (const s of spawns) {
        expect(grid[s.y][s.x]).toBe('floor');
        const neighbors = [grid[s.y][s.x-1], grid[s.y][s.x+1], grid[s.y-1]?.[s.x], grid[s.y+1]?.[s.x]];
        expect(neighbors.filter((t) => t === 'floor').length).toBeGreaterThanOrEqual(1);
      }
    }
  });

  it('連通性：任一出生點可達其他所有出生點（非牆 flood fill）', () => {
    for (const a of ARENAS) {
      const { grid, spawns } = parseArena(a, 4, 3);
      const seen = new Set([`${spawns[0].x},${spawns[0].y}`]);
      const q = [spawns[0]];
      while (q.length) {
        const c = q.pop()!;
        for (const [dx, dy] of [[0,1],[0,-1],[1,0],[-1,0]]) {
          const k = `${c.x+dx},${c.y+dy}`;
          if (!seen.has(k) && grid[c.y+dy]?.[c.x+dx] && grid[c.y+dy][c.x+dx] !== 'wall') {
            seen.add(k); q.push({ x: c.x+dx, y: c.y+dy });
          }
        }
      }
      for (const s of spawns) expect(seen.has(`${s.x},${s.y}`), a.name).toBe(true);
    }
  });

  it('同 seed 同佈局；不同 seed 的 ? 箱可不同', () => {
    const a = ARENAS[0];
    const g1 = parseArena(a, 2, 42).grid.flat().join('');
    const g2 = parseArena(a, 2, 42).grid.flat().join('');
    expect(g1).toBe(g2);
  });
});
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `npx vitest run src/scripts/games/bomber/versus/arenas.test.ts`
Expected: FAIL（模組不存在）

- [ ] **Step 3: 實作 types.ts 與 arenas.ts**

```ts
// src/scripts/games/bomber/versus/types.ts
import type { Dir, CharacterId, Grid, Bomb, BlastCell, PowerUp, PowerUpKind, AbilityId, Vec } from '../engine/types';

export interface VersusPlayerInit { id: string; character: CharacterId; }

export interface VPlayer {
  id: string;
  character: CharacterId;
  x: number; y: number; prevX: number; prevY: number; dir: Dir;
  alive: boolean;
  /** 場終名次：1=冠軍。存活中為 0。 */
  placement: number;
  fireRange: number; maxBombs: number; speedLevel: number;
  shield: boolean; invulnMs: number; moveCooldownMs: number;
  abilityId: AbilityId; abilityCooldownMs: number; abilityMaxMs: number;
}

export type VersusStatus = 'playing' | 'finished';

export interface VersusState {
  status: VersusStatus;
  arenaId: number;
  elapsedMs: number;
  grid: Grid;
  players: VPlayer[];
  bombs: Bomb[];           // Bomb.owner 欄位存玩家 id（沿用型別，owner?: string 擴充見 Task 3）
  blasts: BlastCell[];
  powerUps: PowerUp[];
  /** sudden death：已塌完的圈數（0=未開始）。 */
  collapsedRings: number;
  /** 勝者 id；平局為 null（status=finished 時有意義）。 */
  winnerId: string | null;
}

export type VersusEvent =
  | { kind: 'bombPlaced'; x: number; y: number; ownerId: string }
  | { kind: 'explode'; cells: Vec[] }
  | { kind: 'crateBreak'; x: number; y: number }
  | { kind: 'pickup'; playerId: string; powerUp: PowerUpKind }
  | { kind: 'playerDead'; playerId: string }
  | { kind: 'ringCollapse'; ring: number }
  | { kind: 'finish'; winnerId: string | null }
  | { kind: 'ability'; playerId: string; id: AbilityId };

export type VersusInput = 'bomb' | 'ability';
```

```ts
// src/scripts/games/bomber/versus/arenas.ts
import type { Grid, Tile, Vec } from '../engine/types';
import { GRID_COLS, GRID_ROWS } from '../engine/constants';
import { createRng } from '../engine/rng';

/** 模板字元：W 牆、C 必箱、? 50% 箱（seed 決定，沿水平軸鏡像對稱）、. 地板、1-4 出生點。 */
export interface ArenaDef {
  id: number;
  name: string;        // 英文（arcade UI 慣例）
  nameZh: string;      // 選圖卡顯示用
  theme: number;       // tileSets 索引 0-7
  rows: string[];      // GRID_ROWS 行、每行 GRID_COLS 字
}

export interface ParsedArena { grid: Grid; spawns: Vec[]; }

// 13×11。設計原則：出生點四角/對邊、點對稱；中央留決戰空間。
export const ARENAS: ArenaDef[] = [
  {
    id: 0, name: 'STONE PLAZA', nameZh: '石牢廣場', theme: 0,
    rows: [
      'WWWWWWWWWWWWW',
      'W1.?CCCCC?.2W',
      'W.W?W?W?W?W.W',
      'W??C?...?C??W',
      'W?W.W.W.W.W?W',
      'WC?...?...?CW',
      'W?W.W.W.W.W?W',
      'W??C?...?C??W',
      'W.W?W?W?W?W.W',
      'W3.?CCCCC?.4W',
      'WWWWWWWWWWWWW',
    ],
  },
  {
    id: 1, name: 'BONE GALLERY', nameZh: '白骨迴廊', theme: 1,
    rows: [
      'WWWWWWWWWWWWW',
      'W1.CC...CC.2W',
      'W.WWW?W?WWW.W',
      'W?C...?...C?W',
      'W?W?WWWWW?W?W',
      'W..?..C..?..W',
      'W?W?WWWWW?W?W',
      'W?C...?...C?W',
      'W.WWW?W?WWW.W',
      'W3.CC...CC.4W',
      'WWWWWWWWWWWWW',
    ],
  },
  {
    id: 2, name: 'MOLTEN WORKS', nameZh: '熔火工坊', theme: 2,
    rows: [
      'WWWWWWWWWWWWW',
      'W1?C..W..C?2W',
      'W?W?W.W.W?W?W',
      'WC?.......?CW',
      'W.W?W...W?W.W',
      'WW....W....WW',
      'W.W?W...W?W.W',
      'WC?.......?CW',
      'W?W?W.W.W?W?W',
      'W3?C..W..C?4W',
      'WWWWWWWWWWWWW',
    ],
  },
  {
    id: 3, name: 'FROST ATRIUM', nameZh: '寒冰天井', theme: 3,
    rows: [
      'WWWWWWWWWWWWW',
      'W1.?C.W.C?.2W',
      'W.W.W?W?W.W.W',
      'W?CC.....CC?W',
      'WCW?W?W?W?WCW',
      'W..?.....?..W',
      'WCW?W?W?W?WCW',
      'W?CC.....CC?W',
      'W.W.W?W?W.W.W',
      'W3.?C.W.C?.4W',
      'WWWWWWWWWWWWW',
    ],
  },
  {
    id: 4, name: 'VOID ALTAR', nameZh: '虛空祭壇', theme: 4,
    rows: [
      'WWWWWWWWWWWWW',
      'W1..?CCC?..2W',
      'W.?.......?.W',
      'W?.WW...WW.?W',
      'WC.W..?..W.CW',
      'WC?..???..?CW',
      'WC.W..?..W.CW',
      'W?.WW...WW.?W',
      'W.?.......?.W',
      'W3..?CCC?..4W',
      'WWWWWWWWWWWWW',
    ],
  },
  {
    id: 5, name: 'TOXIC FEN', nameZh: '毒霧沼澤', theme: 5,
    rows: [
      'WWWWWWWWWWWWW',
      'W1?CC?.?CC?2W',
      'W?W.WCWCW.W?W',
      'WCC?..?..?CCW',
      'W.WCW?W?WCW.W',
      'W?..C?.?C..?W',
      'W.WCW?W?WCW.W',
      'WCC?..?..?CCW',
      'W?W.WCWCW.W?W',
      'W3?CC?.?CC?4W',
      'WWWWWWWWWWWWW',
    ],
  },
  {
    id: 6, name: 'GOLD VAULT', nameZh: '黃金寶庫', theme: 6,
    rows: [
      'WWWWWWWWWWWWW',
      'W1.C?...?C.2W',
      'W.WWC?.?CWW.W',
      'WCWC?CCC?CWCW',
      'W?C?C???C?C?W',
      'W..?C?C?C?..W',
      'W?C?C???C?C?W',
      'WCWC?CCC?CWCW',
      'W.WWC?.?CWW.W',
      'W3.C?...?C.4W',
      'WWWWWWWWWWWWW',
    ],
  },
  {
    id: 7, name: 'MOONLIT GARDEN', nameZh: '月光庭園', theme: 7,
    rows: [
      'WWWWWWWWWWWWW',
      'W1.........2W',
      'W.W?W?W?W?W.W',
      'W?C??...??C?W',
      'W.?WW?C?WW?.W',
      'W..?C...C?..W',
      'W.?WW?C?WW?.W',
      'W?C??...??C?W',
      'W.W?W?W?W?W.W',
      'W3.........4W',
      'WWWWWWWWWWWWW',
    ],
  },
];

/** 解析模板：playerCount 決定啟用幾個出生點（1..N）；? 箱由 seed 決定且沿水平中軸鏡像。 */
export function parseArena(def: ArenaDef, playerCount: 2 | 3 | 4, seed: number): ParsedArena {
  const rng = createRng((seed ^ (def.id * 0x9e3779b1)) >>> 0);
  // 先為上半部（含中列）的每個 ? 擲骰，下半部鏡像取用 → 公平
  const maybe: boolean[][] = [];
  for (let y = 0; y < GRID_ROWS; y++) {
    maybe.push([]);
    for (let x = 0; x < GRID_COLS; x++) {
      if (def.rows[y][x] !== '?') { maybe[y].push(false); continue; }
      if (y <= Math.floor((GRID_ROWS - 1) / 2)) maybe[y].push(rng() < 0.5);
      else maybe[y].push(false); // 佔位，待會鏡像覆寫
    }
  }
  for (let y = Math.floor((GRID_ROWS - 1) / 2) + 1; y < GRID_ROWS; y++) {
    const my = GRID_ROWS - 1 - y;
    for (let x = 0; x < GRID_COLS; x++) {
      if (def.rows[y][x] === '?') maybe[y][x] = def.rows[my][x] === '?' ? maybe[my][x] : rng() < 0.5;
    }
  }

  const grid: Grid = [];
  const spawnAt: Record<string, Vec> = {};
  for (let y = 0; y < GRID_ROWS; y++) {
    const row: Tile[] = [];
    for (let x = 0; x < GRID_COLS; x++) {
      const ch = def.rows[y][x];
      if (ch === 'W') row.push('wall');
      else if (ch === 'C') row.push('crate');
      else if (ch === '?') row.push(maybe[y][x] ? 'crate' : 'floor');
      else {
        row.push('floor');
        if (ch >= '1' && ch <= '4') spawnAt[ch] = { x, y };
      }
    }
    grid.push(row);
  }
  const spawns: Vec[] = [];
  for (let i = 1; i <= playerCount; i++) {
    const s = spawnAt[String(i)];
    if (!s) throw new Error(`arena ${def.id} missing spawn ${i}`);
    spawns.push(s);
  }
  return { grid, spawns };
}
```

- [ ] **Step 4: 跑測試到綠**（依測試訊息微調模板字元——例如出生點淨空、距離不足時改 `.`/`?` 位置；模板每行必須恰 13 字、共 11 行）

Run: `npx vitest run src/scripts/games/bomber/versus/arenas.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/scripts/games/bomber/versus/types.ts src/scripts/games/bomber/versus/arenas.ts src/scripts/games/bomber/versus/arenas.test.ts
git commit -m "feat(bomber-versus): 8 symmetric arena templates + parser (TDD)"
```

---

### Task 2: Bomb.owner 泛化（敵彈 'enemy' → 任意 ownerId）

**Files:**
- Modify: `src/scripts/games/bomber/engine/types.ts`（`Bomb.owner?: 'enemy'` → `owner?: string`）
- Test: 既有測試不得壞

- [ ] **Step 1: 改型別**

```ts
// engine/types.ts — Bomb
export interface Bomb { x: number; y: number; fuseMs: number; range: number; owner?: string; }
```

單機程式中所有 `b.owner === 'enemy'` / `owner: 'enemy'` 比較不需改（字串相容）。

- [ ] **Step 2: 跑全引擎測試**

Run: `npx vitest run src/scripts/games/bomber`
Expected: 154 PASS（無迴歸）

- [ ] **Step 3: Commit**

```bash
git add src/scripts/games/bomber/engine/types.ts
git commit -m "refactor(bomber): generalize Bomb.owner to string (versus player ids)"
```

---

### Task 3: VersusMatch 核心（建構/移動/放彈/道具）

**Files:**
- Create: `src/scripts/games/bomber/versus/versusMatch.ts`
- Test: `src/scripts/games/bomber/versus/versusMatch.test.ts`

- [ ] **Step 1: 寫失敗測試**

```ts
// src/scripts/games/bomber/versus/versusMatch.test.ts
import { describe, it, expect } from 'vitest';
import { VersusMatch } from './versusMatch';

const P2 = [{ id: 'alice', character: 'lena' as const }, { id: 'bob', character: 'mira' as const }];

describe('VersusMatch: 建構', () => {
  it('玩家出生在競技場出生點、versus 平衡屬性（命1/火2/彈1/速1）', () => {
    const m = new VersusMatch({ seed: 1, arenaId: 0, players: P2 });
    const s = m.getState();
    expect(s.players).toHaveLength(2);
    expect(s.players[0].x).not.toBe(s.players[1].x);
    for (const p of s.players) {
      expect(p.alive).toBe(true);
      expect(p.fireRange).toBe(2);
      expect(p.maxBombs).toBe(1);
      expect(p.speedLevel).toBe(1);
      expect(p.shield).toBe(false);
    }
  });

  it('保留角色技能、冷卻 = 單機 ×1.5', () => {
    const m = new VersusMatch({ seed: 1, arenaId: 0, players: P2 });
    const [a, b] = m.getState().players;
    expect(a.abilityId).toBe('detonate');
    expect(a.abilityMaxMs).toBe(9000 * 1.5);
    expect(b.abilityId).toBe('inferno');
    expect(b.abilityMaxMs).toBe(14000 * 1.5);
  });
});

describe('VersusMatch: 移動與放彈', () => {
  it('setHeld 後 step 會移動（grid-locked），且不能穿牆', () => {
    const m = new VersusMatch({ seed: 1, arenaId: 0, players: P2 });
    const before = m.getState().players[0];
    m.setHeld('alice', 'right', true);
    m.step(400);
    m.setHeld('alice', 'right', false);
    const after = m.getState().players[0];
    expect(after.x).toBeGreaterThanOrEqual(before.x); // 卡箱則原地
  });

  it('放彈：owner=玩家 id、各自額度獨立', () => {
    const m = new VersusMatch({ seed: 1, arenaId: 0, players: P2 });
    m.input('alice', 'bomb');
    m.input('bob', 'bomb');
    const s = m.getState();
    expect(s.bombs).toHaveLength(2);
    expect(new Set(s.bombs.map((b) => b.owner))).toEqual(new Set(['alice', 'bob']));
    // alice maxBombs=1：再放無效
    m.input('alice', 'bomb');
    expect(m.getState().bombs).toHaveLength(2);
  });

  it('道具拾取提升屬性（fire/bomb/speed/shield；無 heart）', () => {
    const m = new VersusMatch({ seed: 1, arenaId: 0, players: P2 });
    m.debugGivePowerUp('alice', 'fire');
    m.debugGivePowerUp('alice', 'shield');
    const a = m.getState().players[0];
    expect(a.fireRange).toBe(3);
    expect(a.shield).toBe(true);
  });
});
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `npx vitest run src/scripts/games/bomber/versus/versusMatch.test.ts`
Expected: FAIL（VersusMatch 不存在）

- [ ] **Step 3: 實作 VersusMatch 骨架**

```ts
// src/scripts/games/bomber/versus/versusMatch.ts
import type { Dir, Vec, PowerUpKind } from '../engine/types';
import { isWalkable, breakCrate } from '../engine/board';
import { computeBlast } from '../engine/blast';
import { resolveChain } from '../engine/bomb';
import { dirDelta, speedMs } from '../engine/player';
import { getCharacter } from '../engine/characters';
import { BOMB_FUSE_MS, BLAST_TTL_MS, GRID_COLS, GRID_ROWS } from '../engine/constants';
import { createRng } from '../engine/rng';
import { ARENAS, parseArena } from './arenas';
import type { VersusState, VersusEvent, VersusPlayerInit, VPlayer, VersusInput } from './types';

export const ABILITY_CD_MULT = 1.5;
const VS_START = { fireRange: 2, maxBombs: 1, speedLevel: 1 } as const;
const POWERUP_RATE = 0.4;
const POWERUPS: PowerUpKind[] = ['fire', 'bomb', 'speed', 'shield'];
export const SUDDEN_DEATH_AT_MS = 120_000;
export const RING_INTERVAL_MS = 3_000;
export const MAX_COLLAPSE_RING = 3; // 塌 1..3 圈，留中央 5×3 決戰區

export interface VersusOptions { seed: number; arenaId: number; players: VersusPlayerInit[]; }

export class VersusMatch {
  /* 內部欄位：grid, players: VPlayer[], bombs, blasts, powerUps,
     hiddenPowerUps（箱底道具，建構時由 rng 對稱撒佈）, elapsedMs,
     collapsedRings, status, winnerId, events, held: Map<playerId, Set<Dir>>, rng */
  // 完整實作要點：
  // 1. constructor：parseArena(ARENAS[arenaId], players.length, seed)；
  //    依序把玩家放到 spawns[i]；屬性 = VS_START、lives 概念以 alive+shield 表達；
  //    ability 取 getCharacter(ch).ability，cooldownMs ×= ABILITY_CD_MULT。
  //    箱底道具：對「上半部（含中列）」每個 crate 以 rng()<POWERUP_RATE 擲骰選 POWERUPS，
  //    下半部鏡像複製（與 ? 箱同樣的公平原則）。
  // 2. setHeld(playerId, dir, held) / input(playerId, 'bomb'|'ability')。
  // 3. step(dtMs)：與 BomberGame 同 pipeline 順序——
  //    stepPlayers（held 移動，moveCooldown=speedMs(speedLevel)）→
  //    stepBombs（fuse 倒數→resolveChain→blasts/crateBreak/道具掉落）→
  //    stepBlasts（ttl）→ suddenDeath（Task 5）→ resolveDamage（Task 4）→ checkFinish（Task 4）。
  // 4. getState()：深拷貝（players/bombs/blasts map {...x}）。
  // 5. drainEvents()。
  // 6. debug seams：debugGivePowerUp(playerId, kind)、debugMovePlayer(playerId, x, y)、
  //    debugSetElapsed(ms)。
  // 放彈額度：bombs.filter(b => b.owner === playerId).length < player.maxBombs。
  // 道具拾取：玩家踏上 powerUp 格即拾取（fire/bomb/speed 提升至各角 caps；shield=true）。
}
```

（實作細節依上方要點完整寫出；移動/放彈/道具/爆炸的具體程式直接參考
`engine/game.ts` 對應段落改為 per-player 版本——`stepPlayers` 對每位 alive 玩家跑
單機 `stepPlayer` 等價邏輯；`resolveChain` / `computeBlast` / `breakCrate` 原樣複用。）

- [ ] **Step 4: 跑測試到綠**

Run: `npx vitest run src/scripts/games/bomber/versus/versusMatch.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/scripts/games/bomber/versus/versusMatch.ts src/scripts/games/bomber/versus/versusMatch.test.ts
git commit -m "feat(bomber-versus): VersusMatch core — spawn/move/bombs/powerups (TDD)"
```

---

### Task 4: 傷害、淘汰、勝負與技能

**Files:**
- Modify: `src/scripts/games/bomber/versus/versusMatch.ts`
- Test: `src/scripts/games/bomber/versus/versusRules.test.ts`

- [ ] **Step 1: 寫失敗測試**

```ts
// src/scripts/games/bomber/versus/versusRules.test.ts
import { describe, it, expect } from 'vitest';
import { VersusMatch } from './versusMatch';
import { BOMB_FUSE_MS } from '../engine/constants';

const P2 = [{ id: 'alice', character: 'lena' as const }, { id: 'bob', character: 'mira' as const }];
const P3 = [...P2, { id: 'carol', character: 'aya' as const }];

describe('VersusMatch: 傷害與淘汰', () => {
  it('被爆風炸到：無盾即死（playerDead 事件、placement 由淘汰順序回填）', () => {
    const m = new VersusMatch({ seed: 1, arenaId: 0, players: P2 });
    const bob = m.getState().players[1];
    // 把 bob 搬到 alice 旁邊，alice 放彈走開引爆
    const alice = m.getState().players[0];
    m.debugMovePlayer('bob', alice.x + 1, alice.y);
    m.input('alice', 'bomb');
    m.debugMovePlayer('alice', alice.x, alice.y + 2); // 走開（測試直接搬）
    m.step(BOMB_FUSE_MS + 50);
    const s = m.getState();
    expect(s.players[1].alive).toBe(false);
    expect(s.players[1].placement).toBe(2);   // 2 人場第一個死 = 第 2 名
    expect(s.status).toBe('finished');
    expect(s.winnerId).toBe('alice');
    expect(s.players[0].placement).toBe(1);
  });

  it('盾擋一次死：shield 消失、短暫無敵、不淘汰', () => {
    const m = new VersusMatch({ seed: 1, arenaId: 0, players: P2 });
    const alice = m.getState().players[0];
    m.debugGivePowerUp('bob', 'shield');
    m.debugMovePlayer('bob', alice.x + 1, alice.y);
    m.input('alice', 'bomb');
    m.debugMovePlayer('alice', alice.x, alice.y + 2);
    m.step(BOMB_FUSE_MS + 50);
    const bob = m.getState().players[1];
    expect(bob.alive).toBe(true);
    expect(bob.shield).toBe(false);
    expect(bob.invulnMs).toBeGreaterThan(0);
  });

  it('3 人場：同幀雙殺 → 兩人同名次、倖存者勝', () => {
    const m = new VersusMatch({ seed: 1, arenaId: 0, players: P3 });
    const a = m.getState().players[0];
    m.debugMovePlayer('bob', a.x + 1, a.y);
    m.debugMovePlayer('carol', a.x - 1 >= 1 ? a.x - 1 : a.x + 2, a.y);
    m.input('alice', 'bomb');
    m.debugMovePlayer('alice', a.x, a.y + 2);
    m.step(BOMB_FUSE_MS + 50);
    const s = m.getState();
    expect(s.status).toBe('finished');
    expect(s.winnerId).toBe('alice');
    const placements = s.players.map((p) => p.placement).sort();
    expect(placements).toEqual([1, 2, 2]); // 同幀死共享第 2 名
  });

  it('全滅同幀 = 平局（winnerId null、全員 placement 1）', () => {
    const m = new VersusMatch({ seed: 1, arenaId: 0, players: P2 });
    const a = m.getState().players[0];
    m.debugMovePlayer('bob', a.x + 1, a.y);
    m.input('alice', 'bomb');
    // alice 不走開 → 同歸於盡
    m.step(BOMB_FUSE_MS + 50);
    const s = m.getState();
    expect(s.status).toBe('finished');
    expect(s.winnerId).toBeNull();
    expect(s.players.map((p) => p.placement)).toEqual([1, 1]);
  });
});

describe('VersusMatch: 技能', () => {
  it('lena 遙控起爆：引爆自己的彈、不動他人的彈', () => {
    const m = new VersusMatch({ seed: 1, arenaId: 0, players: P2 });
    m.input('alice', 'bomb');
    m.input('bob', 'bomb');
    m.input('alice', 'ability');
    m.step(50);
    const s = m.getState();
    expect(s.bombs.filter((b) => b.owner === 'alice')).toHaveLength(0); // 已爆
    expect(s.bombs.filter((b) => b.owner === 'bob')).toHaveLength(1);   // 不受影響
  });

  it('技能冷卻獨立計時', () => {
    const m = new VersusMatch({ seed: 1, arenaId: 0, players: P2 });
    m.input('alice', 'bomb');
    m.input('alice', 'ability');
    expect(m.getState().players[0].abilityCooldownMs).toBeGreaterThan(0);
    expect(m.getState().players[1].abilityCooldownMs).toBe(0);
  });
});
```

- [ ] **Step 2: 跑測試確認失敗** → Expected: FAIL

- [ ] **Step 3: 實作**

要點（完整邏輯，比照單機對應段改 per-player）：
- `resolveDamage()`：對每位 alive 玩家檢查其格是否在 blasts（玩家為格鎖定移動，直接用 x,y；
  versus 雙方都是玩家、無「視覺格」需求——對稱公平）。命中：有盾→`shield=false; invulnMs=1500`；
  無盾且 `invulnMs<=0`（以 tick 開始快照判定，沿用單機 invulnAtStart 紀律）→
  `alive=false`、推 `playerDead`。**同 tick 死亡者共享名次**：
  `placement = aliveCountBeforeThisTick`（如 3 人場 tick 前 3 人活、本 tick 死 2 人 → 兩人都是第 2 名）。
- `checkFinish()`：alive ≤ 1 → `status='finished'`；倖存者 `placement=1`、`winnerId=其 id`；
  全滅 → 本 tick 死亡者全部 `placement = aliveCountBeforeThisTick === players.length ? 1 : 原值`，
  平局時同幀死者名次提為 1、`winnerId=null`。推 `finish` 事件。
- 技能四式：自單機 `effectDetonate/effectInferno/effectBlink/effectBulwark` 移植為
  per-player 版（this.player → 指定玩家；detonate 只引爆 `owner===playerId` 的彈）。

- [ ] **Step 4: 跑 versus 全部測試到綠** → `npx vitest run src/scripts/games/bomber/versus` PASS

- [ ] **Step 5: Commit**

```bash
git add src/scripts/games/bomber/versus/versusMatch.ts src/scripts/games/bomber/versus/versusRules.test.ts
git commit -m "feat(bomber-versus): damage/elimination/placements/draws + abilities (TDD)"
```

---

### Task 5: Sudden death 塌縮圈

**Files:**
- Modify: `src/scripts/games/bomber/versus/versusMatch.ts`
- Test: `src/scripts/games/bomber/versus/suddenDeath.test.ts`

- [ ] **Step 1: 寫失敗測試**

```ts
import { describe, it, expect } from 'vitest';
import { VersusMatch, SUDDEN_DEATH_AT_MS, RING_INTERVAL_MS, MAX_COLLAPSE_RING } from './versusMatch';
import { GRID_COLS, GRID_ROWS } from '../engine/constants';

const P2 = [{ id: 'a', character: 'lena' as const }, { id: 'b', character: 'mira' as const }];

describe('sudden death', () => {
  it('120s 前不塌；120s 塌第 1 圈（d=1 全變牆）', () => {
    const m = new VersusMatch({ seed: 1, arenaId: 0, players: P2 });
    m.debugMovePlayer('a', 6, 5); m.debugMovePlayer('b', 6, 4); // 先撤到中央避免被塌死
    m.debugSetElapsed(SUDDEN_DEATH_AT_MS - 10);
    m.step(5);
    expect(m.getState().collapsedRings).toBe(0);
    m.step(20); // 跨過 120s
    const s = m.getState();
    expect(s.collapsedRings).toBe(1);
    for (let x = 1; x < GRID_COLS - 1; x++) {
      expect(s.grid[1][x]).toBe('wall');
      expect(s.grid[GRID_ROWS - 2][x]).toBe('wall');
    }
  });

  it('站在塌縮格上即死（無視盾）', () => {
    const m = new VersusMatch({ seed: 1, arenaId: 0, players: P2 });
    // a 留在出生點（d=1 圈上）、b 搬到中央
    m.debugMovePlayer('b', 6, 5);
    m.debugGivePowerUp('a', 'shield');
    m.debugSetElapsed(SUDDEN_DEATH_AT_MS - 1);
    m.step(10);
    const s = m.getState();
    expect(s.players[0].alive).toBe(false); // 盾擋不了塌縮
    expect(s.status).toBe('finished');
    expect(s.winnerId).toBe('b');
  });

  it('每 3 秒一圈、最多塌 MAX_COLLAPSE_RING 圈', () => {
    const m = new VersusMatch({ seed: 1, arenaId: 0, players: P2 });
    m.debugMovePlayer('a', 6, 5); m.debugMovePlayer('b', 6, 4);
    m.debugSetElapsed(SUDDEN_DEATH_AT_MS - 1);
    m.step(RING_INTERVAL_MS * 10); // 足夠塌完
    expect(m.getState().collapsedRings).toBe(MAX_COLLAPSE_RING);
  });
});
```

- [ ] **Step 2: 跑測試確認失敗** → FAIL

- [ ] **Step 3: 實作**

```ts
// versusMatch.ts 內：
private stepSuddenDeath(): void {
  if (this.elapsedMs < SUDDEN_DEATH_AT_MS) return;
  const due = 1 + Math.floor((this.elapsedMs - SUDDEN_DEATH_AT_MS) / RING_INTERVAL_MS);
  const target = Math.min(MAX_COLLAPSE_RING, due);
  while (this.collapsedRings < target) {
    const r = this.collapsedRings + 1;
    for (let y = 0; y < GRID_ROWS; y++) for (let x = 0; x < GRID_COLS; x++) {
      const d = Math.min(x, GRID_COLS - 1 - x, y, GRID_ROWS - 1 - y);
      if (d === r) {
        this.grid[y][x] = 'wall';
        // 該格上的彈/道具/爆風一併清除
        this.bombs = this.bombs.filter((b) => !(b.x === x && b.y === y));
        this.powerUps = this.powerUps.filter((p) => !(p.x === x && p.y === y));
        for (const p of this.players) {
          if (p.alive && p.x === x && p.y === y) this.killPlayer(p); // 無視盾/無敵
        }
      }
    }
    this.collapsedRings = r;
    this.events.push({ kind: 'ringCollapse', ring: r });
  }
}
```

注意 `elapsedMs += dtMs` 在 step 開頭累計；`debugSetElapsed(ms)` 設定 `elapsedMs`。
`killPlayer` 抽出共用（傷害淘汰與塌縮共用，塌縮路徑跳過盾/無敵檢查）。

- [ ] **Step 4: 跑測試到綠** → PASS

- [ ] **Step 5: Commit**

```bash
git add src/scripts/games/bomber/versus/versusMatch.ts src/scripts/games/bomber/versus/suddenDeath.test.ts
git commit -m "feat(bomber-versus): sudden-death collapsing rings (TDD)"
```

---

### Task 6: 決定性——狀態 hash 與重放

**Files:**
- Modify: `src/scripts/games/bomber/versus/versusMatch.ts`（加 `stateHash()`）
- Test: `src/scripts/games/bomber/versus/determinism.test.ts`

- [ ] **Step 1: 寫失敗測試**

```ts
import { describe, it, expect } from 'vitest';
import { VersusMatch } from './versusMatch';
import { createRng } from '../engine/rng';

const P = [
  { id: 'a', character: 'lena' as const }, { id: 'b', character: 'mira' as const },
  { id: 'c', character: 'aya' as const },  { id: 'd', character: 'rosa' as const },
];
const DIRS = ['up', 'down', 'left', 'right'] as const;

function runScripted(seed: number, frames: number): string {
  const m = new VersusMatch({ seed, arenaId: 3, players: P });
  const script = createRng(seed ^ 0xabcdef); // 決定性輸入腳本
  for (let f = 0; f < frames; f++) {
    for (const p of P) {
      const r = script();
      if (r < 0.3) m.setHeld(p.id, DIRS[Math.floor(script() * 4)], script() < 0.5);
      else if (r < 0.35) m.input(p.id, 'bomb');
      else if (r < 0.38) m.input(p.id, 'ability');
    }
    m.step(1000 / 60);
  }
  return m.stateHash();
}

describe('determinism', () => {
  it('同 seed＋同輸入流 → 每端 stateHash 一致（模擬 4 端各自重放）', () => {
    const h1 = runScripted(777, 3600); // 60s
    const h2 = runScripted(777, 3600);
    const h3 = runScripted(777, 3600);
    expect(h2).toBe(h1);
    expect(h3).toBe(h1);
  });

  it('不同 seed → hash 不同', () => {
    expect(runScripted(777, 600)).not.toBe(runScripted(778, 600));
  });
});
```

- [ ] **Step 2: 跑測試確認失敗** → FAIL（stateHash 不存在）

- [ ] **Step 3: 實作 stateHash（FNV-1a 疊代字串化關鍵狀態）**

```ts
stateHash(): string {
  let h = 0x811c9dc5;
  const mix = (s: string) => { for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); } };
  mix(String(this.elapsedMs | 0));
  mix(this.grid.flat().join(''));
  for (const p of this.players) mix(`${p.id},${p.x},${p.y},${p.alive ? 1 : 0},${p.fireRange},${p.maxBombs},${p.shield ? 1 : 0},${p.placement}`);
  for (const b of this.bombs) mix(`${b.x},${b.y},${b.fuseMs | 0},${b.owner}`);
  for (const bl of this.blasts) mix(`${bl.x},${bl.y}`);
  return (h >>> 0).toString(16);
}
```

- [ ] **Step 4: 跑測試到綠** → PASS

- [ ] **Step 5: Commit**

```bash
git add src/scripts/games/bomber/versus/versusMatch.ts src/scripts/games/bomber/versus/determinism.test.ts
git commit -m "feat(bomber-versus): stateHash + N-client determinism replay test"
```

---

### Task 7: 3 套新磚組美術（毒沼/寶庫/庭園）＋ tileSets 擴充

**Files:**
- Create: `public/assets/games/bomber/tiles-fen.png`、`tiles-vault.png`、`tiles-garden.png`（各 192×64：floor|wall|crate）
- Modify: `src/scripts/games/bomber/render/assets.ts`（tileSets 擴到 8）

- [ ] **Step 1: 生成素材**（沿用既有管線；prompt 模板同 `tmp/mobgen/gen-batch2.sh tiles 段`）

```bash
GEN=.claude/skills/nanobanana-image-gen/scripts/generate.mjs
TILE="16-bit pixel-art game tile, top-down orthographic, one square tile filling the ENTIRE image edge to edge, NO border, NO objects, NO text."
# 毒沼：murky green swamp floor with bubbling toxic pools / vine-choked mossy wall / rotted rope-bound crate
# 寶庫：polished gold-inlaid marble floor / gilded vault-brick wall with gold trims / ornate golden chest
# 庭園：moonlit garden flagstones with grass tufts / silver-blue hedge-stone wall / wooden planter crate with flowers
# 每主題 3 張 → convert -filter box -resize 64x64! -colors 48 → +append 成 192×64 條
```

- [ ] **Step 2: assets.ts 載入 3 條新 tileSets（比照 tiles-frost/void 的接法），tileSets 索引 5/6/7**

- [ ] **Step 3: 跑 build 確認資源載入無誤** → `npm run build` Complete

- [ ] **Step 4: Commit**

```bash
git add public/assets/games/bomber/tiles-fen.png public/assets/games/bomber/tiles-vault.png public/assets/games/bomber/tiles-garden.png src/scripts/games/bomber/render/assets.ts
git commit -m "feat(bomber-versus): three new arena tile themes (fen/vault/garden)"
```

---

### Task 8: Versus 渲染＋熱座驗證模式

**Files:**
- Create: `src/scripts/games/bomber/render/versusMain.ts`（versus 啟動：VersusMatch + 既有 GridView/EntityView 適配）
- Create: `src/scripts/games/bomber/render/VersusEntityView.ts`（多玩家渲染：以 walk sheet 畫 N 個玩家、塌縮圈警告閃爍）
- Modify: `src/pages/games/bomber.astro`（`?mode=hotseat` 入口：本機雙人同鍵盤 debug——P1 WASD+Space+E、P2 方向鍵+Enter+Shift）
- Modify: `src/scripts/games/bomber/render/GridView.ts`（versus 用 arena theme 而非樓層 biome：`render(state, layout, themeOverride?)`）

- [ ] **Step 1: 實作渲染**（VersusEntityView 比照 EntityView 玩家段做 N 份：
  `characterMap[p.character]` 選 walk sheet、`dirToRow(p.dir)`、淘汰者隱藏；
  sudden death：`collapsedRings` 變化時下一圈格子以紅色 alpha 閃爍 3 秒警告——
  d === collapsedRings+1 的格畫紅色半透明覆層）
- [ ] **Step 2: hotseat 模式接鍵盤**（兩套 keymap 寫死在 versusMain，僅 debug 用）
- [ ] **Step 3: 瀏覽器手動驗證**：`/games/bomber?mode=hotseat&arena=5` 雙人對炸、
  塌縮圈、技能、結束畫面文字（先用簡單 overlay：WINNER: P1）
- [ ] **Step 4: 跑全部測試＋build** → PASS / Complete
- [ ] **Step 5: Commit**

```bash
git add src/scripts/games/bomber/render/versusMain.ts src/scripts/games/bomber/render/VersusEntityView.ts src/scripts/games/bomber/render/GridView.ts src/pages/games/bomber.astro
git commit -m "feat(bomber-versus): versus renderer + hotseat debug mode"
```

---

## Phase 2 — 連線

### Task 9: bomberLockstep（仿 ffaLockstep）

**Files:**
- Create: `src/scripts/games/bomber/net/bomberLockstep.ts`
- Test: `src/scripts/games/bomber/net/bomberLockstep.test.ts`

- [ ] **Step 1: 寫失敗測試**（比照 `src/scripts/games/tetris/net/ffaLockstep.test.ts` 的結構——
  用該檔內既有的 `LoopbackHub` 模式寫 bomber 版：4 端 loopback、亂序/延遲投遞、
  最終 4 端 `match.stateHash()` 一致；淘汰玩家停止送輸入後其餘端仍可推進）

```ts
// 核心斷言（完整測試結構抄 ffaLockstep.test.ts 改型別）
import { BomberLockstep, LoopbackBomberHub } from './bomberLockstep';
// VersusInput 動作集合：{ t:'held', d:Dir, v:boolean } | { t:'bomb' } | { t:'ability' }
it('4 端 loopback 跑 600 幀：全端 stateHash 一致', () => { /* ... */ });
it('某端 frame 缺輸入時其他端等待（不推進）', () => { /* ... */ });
it('畸形網路訊息被忽略不丟例外', () => { /* ... */ });
```

- [ ] **Step 2: FAIL** → **Step 3: 實作**

```ts
// bomberLockstep.ts 要點（結構 1:1 仿 ffaLockstep.ts，替換泛型內容）：
export const INPUT_DELAY = 3;
export type VersusAction =
  | { t: 'held'; d: 'up' | 'down' | 'left' | 'right'; v: boolean }
  | { t: 'bomb' } | { t: 'ability' };
export interface BomberFrameMsg { f: number; p: string; a: VersusAction[] }
export interface BomberLockstepTransport {
  send(msg: BomberFrameMsg): void;
  onMessage(cb: (msg: BomberFrameMsg) => void): void;
}
export interface BomberLockstepOptions {
  playerIds: string[]; localId: string; seed: number; arenaId: number;
  characters: Record<string, CharacterId>;
  transport: BomberLockstepTransport; inputDelay?: number;
}
export class BomberLockstep {
  readonly match: VersusMatch;
  // queueLocal(action: VersusAction)：累積本地輸入
  // tick()：送出 sendFrame 輸入 → 全員 simFrame 輸入到齊才 apply+match.step(1000/60)
  // apply：held → match.setHeld(p, d, v)；bomb/ability → match.input(p, ...)
  // shape 驗證：VALID 動作檢查（仿 ffaLockstep VALID_ACTIONS 精神）
}
export class LoopbackBomberHub { /* 仿 ffaLockstep.ts 的 LoopbackHub */ }
```

- [ ] **Step 4: PASS** → **Step 5: Commit**

```bash
git add src/scripts/games/bomber/net/bomberLockstep.ts src/scripts/games/bomber/net/bomberLockstep.test.ts
git commit -m "feat(bomber-net): deterministic N-player lockstep over transport abstraction (TDD)"
```

---

### Task 10: 傳輸與信令（WebRTC＋房間碼）

**Files:**
- Create: `src/scripts/games/bomber/net/bomberTransport.ts`（copy-adapt `tetris/net/ffaTransport.ts`：
  訊息 shape 改 `BomberFrameMsg`、房間 key 加 `bomber:` 前綴；Hub=房主中繼、Spoke=來賓）
- Test: `src/scripts/games/bomber/net/bomberTransport.test.ts`（copy-adapt `ffaTransport.test.ts`）

- [ ] **Step 1: 寫測試（adapt 既有）** → **Step 2: FAIL** → **Step 3: 實作（adapt 既有）**
- 信令直接複用 `tetris/net/signalClient.ts`（建房/加房/SDP 交換 API 不變），
  房號生成沿用，僅在 room key 組字串處傳入 `bomber:` 前綴參數
  （若 signalClient 寫死 key，加可選參數 `ns = 'tetris'`，預設值不變、tetris 零影響）。
- [ ] **Step 4: PASS；跑 tetris net 全部測試確認零迴歸** → `npx vitest run src/scripts/games/tetris/net` PASS
- [ ] **Step 5: Commit**

```bash
git add src/scripts/games/bomber/net/bomberTransport.ts src/scripts/games/bomber/net/bomberTransport.test.ts src/scripts/games/tetris/net/signalClient.ts
git commit -m "feat(bomber-net): WebRTC transport + namespaced signaling rooms"
```

---

### Task 11: Lobby UI＋開局握手

**Files:**
- Modify: `src/pages/games/bomber.astro`（選角畫面加 ONLINE 按鈕 → lobby 區塊）
- Create: `src/scripts/games/bomber/net/lobby.ts`（純邏輯：房態機 host/guest、ready 集合、
  開局廣播 `{seed, arenaId, players:[{id,character}], hostTime}`）
- Test: `src/scripts/games/bomber/net/lobby.test.ts`

- [ ] **Step 1: lobby.ts 純邏輯 TDD**（房態轉移：waiting→ready→starting；
  房主選圖；2-4 人限制；ready 全齊才可開局；guest 中途離開回 waiting）
- [ ] **Step 2: UI**：lobby 面板（房間碼大字、玩家列＝角色頭像+ready 燈、
  地圖選擇器＝8 張卡（nameZh＋主題縮圖，房主可選、來賓唯讀）、READY/START 鍵）。
  美術沿用選角畫面語言（墨底金框）。地圖縮圖：每張 arena 用其磚組 floor+wall 拼 64×48 小圖（build 時靜態檔）。
- [ ] **Step 3: versusMain 接 lockstep**：開局訊息 → `new BomberLockstep(...)` →
  遊戲迴圈每幀 `queueLocal` + `tick`；斷線（datachannel close）→ 該玩家判死（不再送輸入即可，
  本端顯示 DISCONNECTED 標記）。
- [ ] **Step 4: 雙頁籤手動驗證**：建房/加入/選角/ready/開打/塌縮/勝負。
- [ ] **Step 5: Commit**

```bash
git add src/pages/games/bomber.astro src/scripts/games/bomber/net/lobby.ts src/scripts/games/bomber/net/lobby.test.ts src/scripts/games/bomber/render/versusMain.ts
git commit -m "feat(bomber-net): room lobby UI + start handshake + disconnect handling"
```

---

### Task 12: 連線 e2e（雙頁籤）

**Files:**
- Create: `tests/e2e/bomber-online.spec.ts`（copy-adapt `tests/e2e/games-tetris-online.spec.ts`）

- [ ] **Step 1: 寫 e2e**：頁籤 A 建房取房號 → 頁籤 B 輸碼加入 → 雙方 ready →
  斷言雙方都進入 versus（`__bomberVersusDebug.match` 存在、players 2、status playing）。
  沿用 tetris online spec 的 in-page dispatch 與輪詢模式；chromium only。
- [ ] **Step 2: 跑到綠** → `npx playwright test tests/e2e/bomber-online.spec.ts --project=chromium` PASS
- [ ] **Step 3: Commit**

```bash
git add tests/e2e/bomber-online.spec.ts
git commit -m "test(bomber-net): two-tab online smoke e2e"
```

---

## Phase 3 — 結算與牌位

### Task 13: Versus replay 模組

**Files:**
- Create: `src/scripts/games/bomber/net/versusReplay.ts`
- Test: `src/scripts/games/bomber/net/versusReplay.test.ts`

- [ ] **Step 1: TDD**（比照 `tetris/net/ffaReplay.ts`）：
  `BomberLockstep.getReplay()` 輸出 `{seed, arenaId, characters, playerIds, frameCount, inputs(稀疏)}`；
  `simulateVersusReplay(replay)` 重跑 → 回 `{standings: string[], stateHash}`；
  測試：打完一場（loopback）→ simulate 名次與實際一致。
- [ ] **Step 2-4: FAIL → 實作 → PASS**
- [ ] **Step 5: Commit**

```bash
git add src/scripts/games/bomber/net/versusReplay.ts src/scripts/games/bomber/net/versusReplay.test.ts src/scripts/games/bomber/net/bomberLockstep.ts
git commit -m "feat(bomber-net): versus replay capture + verification simulate (TDD)"
```

---

### Task 14: /api/bomber-match 結算端點

**Files:**
- Create: `src/pages/api/bomber-match.ts`（copy-adapt `src/pages/api/ffa-match.ts`）
- Test: `src/pages/api/_bomber-match.test.ts`（copy-adapt `_ffa-match.test.ts`）

- [ ] **Step 1: 寫測試（adapt）**：共識（過半一致入帳）/ 衝突 / 重複（already）/
  簽章驗證 / replay seed 與 matchId 相符驗證。**rankStore key 一律 `bomber:` 前綴**
  （`bomber:player:<id>`），與 tetris 紀錄完全隔離。
- [ ] **Step 2-4: FAIL → 實作 → PASS**
  - Elo：2 人場走 `updateRatings`（elo.ts）、3-4 人場走 `updateRatingsNWay`（ffaElo.ts）
  - XP：`xpForMatch(players, placement, placement === 1)` 累加、`levelForXp` 回推等級
  - 回應含每位玩家 `{ratingBefore, ratingAfter, xpGained, level}` 供結算畫面顯示
- [ ] **Step 5: Commit**

```bash
git add src/pages/api/bomber-match.ts src/pages/api/_bomber-match.test.ts
git commit -m "feat(bomber-rank): consensus match settlement API with isolated bomber ladder"
```

---

### Task 15: 結算畫面＋牌位顯示

**Files:**
- Create: `src/scripts/games/bomber/net/bomberRanking.ts`（client：組 claim、簽章、POST、解析回應）
- Modify: `src/scripts/games/bomber/render/versusMain.ts`＋`src/pages/games/bomber.astro`
  （場終 overlay：名次表、Elo ±、XP bar、REMATCH / LOBBY 按鈕）

- [ ] **Step 1: bomberRanking 純邏輯 TDD**（claim 組裝與簽章訊息格式，比照 tetris `ranking.ts` 對應段）
- [ ] **Step 2: 結算 UI**（沿用 gameover overlay 風格；REMATCH=同房同設定重開新 seed）
- [ ] **Step 3: 雙頁籤手動驗證**（兩端結算數字一致、重複回報回 already）
- [ ] **Step 4: Commit**

```bash
git add src/scripts/games/bomber/net/bomberRanking.ts src/scripts/games/bomber/render/versusMain.ts src/pages/games/bomber.astro
git commit -m "feat(bomber-rank): result screen with Elo delta + XP progress + rematch"
```

---

### Task 16: 排行榜 bomber 分頁

**Files:**
- Modify: `src/pages/games/leaderboard.astro`＋`src/pages/api/leaderboard.ts`
  （API 加 `?game=bomber` 參數讀 `bomber:` 前綴紀錄；頁面加 TETRIS / BOMBER 分頁切換）

- [ ] **Step 1: API 測試＋實作**（無 game 參數＝tetris，零迴歸）
- [ ] **Step 2: 頁面分頁 UI**
- [ ] **Step 3: e2e**：`tests/e2e/games-hall.spec.ts` 既有 leaderboard 測試保持綠；
  加一個 bomber 分頁載入斷言
- [ ] **Step 4: Commit**

```bash
git add src/pages/games/leaderboard.astro src/pages/api/leaderboard.ts tests/e2e/games-hall.spec.ts
git commit -m "feat(bomber-rank): leaderboard bomber tab"
```

---

### Task 17: 全套驗證＋出貨

- [ ] **Step 1:** `npx vitest run src/scripts/games` 全綠（bomber 單機 154＋versus/net 新增＋tetris 零迴歸）
- [ ] **Step 2:** `npm run build` Complete
- [ ] **Step 3:** `npx playwright test tests/e2e/bomber.spec.ts tests/e2e/bomber-online.spec.ts tests/e2e/games-hall.spec.ts --project=chromium` 全綠
- [ ] **Step 4:** 雙頁籤真人實測一場完整流程（lobby→對戰→sudden death→結算→排行榜）
- [ ] **Step 5:** 開 `release/bomber-versus` 分支 → push → PR → merge（沿用 #154 流程）

---

## Self-Review 紀錄

- Spec 覆蓋：8 競技場(T1)、versus 規則(T3-5)、技能平衡(T3/T4)、決定性(T6)、
  3 新磚組(T7)、渲染/熱座(T8)、lockstep(T9)、傳輸/信令(T10)、lobby(T11)、
  e2e(T12)、replay(T13)、共識結算+Elo+XP(T14)、結算畫面(T15)、排行榜(T16) ✅
- 型別一致：`VersusAction`/`BomberFrameMsg`/`VersusState.placement`/`stateHash()` 跨 Task 已對齊 ✅
- 注意：T3/T4 的「比照單機段落移植」處附了具體要點與位置（engine/game.ts 對應函式），
  執行者需照要點寫完整程式，不是留白。
