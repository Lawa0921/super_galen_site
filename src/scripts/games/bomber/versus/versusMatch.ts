// src/scripts/games/bomber/versus/versusMatch.ts
import type { Dir, Vec, PowerUpKind, Grid, Bomb, BlastCell, PowerUp } from '../engine/types';
import { isWalkable, breakCrate } from '../engine/board';
import { resolveChain } from '../engine/bomb';
import { dirDelta, speedMs } from '../engine/player';
import { getCharacter } from '../engine/characters';
import { BOMB_FUSE_MS, BLAST_TTL_MS, GRID_COLS, GRID_ROWS } from '../engine/constants';
import { createRng } from '../engine/rng';
import { ARENAS, parseArena } from './arenas';
import type { VersusState, VersusEvent, VersusPlayerInit, VPlayer, VersusInput } from './types';

/** versus 模式技能冷卻倍數（比單機長，給更多對抗空間）。 */
export const ABILITY_CD_MULT = 1.5;

/** versus 出生屬性（全員一致，公平競技）。 */
const VS_START = { fireRange: 2, maxBombs: 1, speedLevel: 1 } as const;

/** 箱底道具生成機率。 */
const POWERUP_RATE = 0.4;

/** versus 可生成的道具種類（不含 heart，無生命系統）。 */
const POWERUPS: PowerUpKind[] = ['fire', 'bomb', 'speed', 'shield'];

/** Sudden death 開始時間（ms）。 */
export const SUDDEN_DEATH_AT_MS = 120_000;

/** Sudden death 每次縮圈間隔（ms）。 */
export const RING_INTERVAL_MS = 3_000;

/** 最大可縮圈數。 */
export const MAX_COLLAPSE_RING = 3;

export interface VersusOptions {
  seed: number;
  arenaId: number;
  players: VersusPlayerInit[];
}

/** VersusMatch：雙人/多人競技場核心引擎。
 *  - 禁用 Math.random / Date.now；全部走 deterministic rng。
 *  - step(dtMs) 為主循環；外部每幀呼叫。
 */
export class VersusMatch {
  // ---- 遊戲核心狀態 ----
  private grid: Grid;
  private players: VPlayer[];
  private bombs: Bomb[] = [];
  private blasts: BlastCell[] = [];
  private powerUps: PowerUp[] = [];
  /** 箱底隱藏道具：key = "x,y"。 */
  private hiddenPowerUps: Record<string, PowerUpKind> = {};

  private status: VersusState['status'] = 'playing';
  private arenaId: number;
  private elapsedMs = 0;
  private collapsedRings = 0;
  private winnerId: string | null = null;

  /** 每位玩家目前按住的方向鍵集合。 */
  private held: Map<string, Set<Dir>> = new Map();

  private events: VersusEvent[] = [];

  constructor(opts: VersusOptions) {
    this.arenaId = opts.arenaId;
    const playerCount = opts.players.length as 2 | 3 | 4;
    const { grid, spawns } = parseArena(ARENAS[opts.arenaId], playerCount, opts.seed);
    this.grid = grid;

    // ---- 初始化箱底道具（左上象限擲骰，三象限鏡像複製） ----
    const rng = createRng((opts.seed ^ 0xf00dbabe) >>> 0);
    const midX = Math.floor((GRID_COLS - 1) / 2); // 6
    const midY = Math.floor((GRID_ROWS - 1) / 2); // 5

    const puMap: Record<string, PowerUpKind> = {};

    // 第一步：只對左上象限的 crate 格擲骰
    for (let y = 0; y <= midY; y++) {
      for (let x = 0; x <= midX; x++) {
        if (grid[y][x] === 'crate' && rng() < POWERUP_RATE) {
          puMap[`${x},${y}`] = POWERUPS[Math.floor(rng() * 4)];
        }
      }
    }

    // 第二步：右上象限鏡像左上（x > midX, y <= midY）
    for (let y = 0; y <= midY; y++) {
      for (let x = midX + 1; x < GRID_COLS; x++) {
        const mx = GRID_COLS - 1 - x;
        const mirrorKey = `${mx},${y}`;
        if (grid[y][x] === 'crate' && puMap[mirrorKey] !== undefined) {
          puMap[`${x},${y}`] = puMap[mirrorKey];
        }
      }
    }

    // 第三步：下半鏡像上半（y > midY）
    for (let y = midY + 1; y < GRID_ROWS; y++) {
      const my = GRID_ROWS - 1 - y;
      for (let x = 0; x < GRID_COLS; x++) {
        const mirrorKey = `${x},${my}`;
        if (grid[y][x] === 'crate' && puMap[mirrorKey] !== undefined) {
          puMap[`${x},${y}`] = puMap[mirrorKey];
        }
      }
    }

    this.hiddenPowerUps = puMap;

    // ---- 初始化玩家 ----
    this.players = opts.players.map((pi, i) => {
      const profile = getCharacter(pi.character);
      const spawn = spawns[i];
      const heldSet = new Set<Dir>();
      this.held.set(pi.id, heldSet);

      return {
        id: pi.id,
        character: pi.character,
        x: spawn.x, y: spawn.y,
        prevX: spawn.x, prevY: spawn.y,
        dir: 'down' as Dir,
        alive: true,
        placement: 0,
        // versus 平衡起始屬性
        fireRange: VS_START.fireRange,
        maxBombs: VS_START.maxBombs,
        speedLevel: VS_START.speedLevel,
        shield: false,
        invulnMs: 0,
        moveCooldownMs: 0,
        // 技能：冷卻為單機 × ABILITY_CD_MULT
        abilityId: profile.ability.id,
        abilityMaxMs: profile.ability.cooldownMs * ABILITY_CD_MULT,
        abilityCooldownMs: 0,
      } satisfies VPlayer;
    });
  }

  // ---- 輸入介面 ----

  /** 設定某玩家的方向鍵按住狀態。 */
  setHeld(playerId: string, dir: Dir, held: boolean): void {
    const set = this.held.get(playerId);
    if (!set) return;
    if (held) set.add(dir);
    else set.delete(dir);
  }

  /** 單次動作輸入（放彈 / 技能）。 */
  input(playerId: string, action: VersusInput): void {
    if (this.status !== 'playing') return;
    const player = this.players.find((p) => p.id === playerId);
    if (!player || !player.alive) return;

    if (action === 'bomb') {
      this.placeBomb(player);
    } else if (action === 'ability') {
      this.activateAbility(player);
    }
  }

  // ---- 主循環 ----

  /** 推進遊戲時間 dtMs 毫秒。 */
  step(dtMs: number): void {
    if (this.status !== 'playing') return;

    this.elapsedMs += dtMs;

    // 1. 玩家移動 + 屬性遞減
    this.stepPlayers(dtMs);

    // 2. 炸彈引信 + 爆炸結算
    this.stepBombs(dtMs);

    // 3. 爆風存活期遞減
    this.stepBlasts(dtMs);

    // TODO Task 4: 爆風/碰撞傷害判定
    // TODO Task 5: sudden death 縮圈
  }

  // ---- 私有步驟 ----

  /** 所有玩家：冷卻遞減、移動、道具拾取。 */
  private stepPlayers(dtMs: number): void {
    for (const p of this.players) {
      if (!p.alive) continue;

      // 遞減各項冷卻
      if (p.invulnMs > 0) p.invulnMs = Math.max(0, p.invulnMs - dtMs);
      if (p.abilityCooldownMs > 0) p.abilityCooldownMs = Math.max(0, p.abilityCooldownMs - dtMs);
      if (p.moveCooldownMs > 0) {
        p.moveCooldownMs = Math.max(0, p.moveCooldownMs - dtMs);
      }

      // 移動（冷卻歸零才處理）
      if (p.moveCooldownMs <= 0) {
        const heldSet = this.held.get(p.id);
        const dir = heldSet && heldSet.size > 0 ? heldSet.values().next().value as Dir : null;
        if (dir) {
          p.dir = dir;
          const v = dirDelta(dir);
          const nx = p.x + v.x;
          const ny = p.y + v.y;
          // 可行走且無炸彈阻擋
          if (isWalkable(this.grid, nx, ny) && !this.bombs.some((b) => b.x === nx && b.y === ny)) {
            p.prevX = p.x; p.prevY = p.y;
            p.x = nx; p.y = ny;
            p.moveCooldownMs = speedMs(p.speedLevel);
            // 移動後立即檢查道具拾取
            this.checkPickup(p);
          }
        }
      }
    }
  }

  /** 炸彈引信遞減；到期者觸發連鎖爆炸。 */
  private stepBombs(dtMs: number): void {
    const detonating: Bomb[] = [];
    for (const b of this.bombs) {
      b.fuseMs -= dtMs;
      if (b.fuseMs <= 0) detonating.push(b);
    }
    if (detonating.length === 0) return;

    const { cells, brokenCrates, consumed } = resolveChain(this.grid, this.bombs, detonating);

    // 移除已爆炸彈
    this.bombs = this.bombs.filter((b) => !consumed.includes(b));

    // 破壞木箱 + 揭露道具
    for (const c of brokenCrates) {
      this.grid = breakCrate(this.grid, c.x, c.y);
      this.events.push({ kind: 'crateBreak', x: c.x, y: c.y });
      const key = `${c.x},${c.y}`;
      const drop = this.hiddenPowerUps[key];
      if (drop) {
        this.powerUps.push({ x: c.x, y: c.y, kind: drop });
        delete this.hiddenPowerUps[key];
      }
    }

    // 產生爆風格
    for (const c of cells) this.blasts.push({ x: c.x, y: c.y, ttlMs: BLAST_TTL_MS });
    this.events.push({ kind: 'explode', cells });
  }

  /** 爆風存活期遞減、清除過期格。 */
  private stepBlasts(dtMs: number): void {
    for (const bl of this.blasts) bl.ttlMs -= dtMs;
    this.blasts = this.blasts.filter((bl) => bl.ttlMs > 0);
  }

  // ---- 放彈 ----

  private placeBomb(player: VPlayer): void {
    // 該玩家現役彈數未超額
    if (this.bombs.filter((b) => b.owner === player.id).length >= player.maxBombs) return;
    // 腳下無彈
    if (this.bombs.some((b) => b.x === player.x && b.y === player.y)) return;

    this.bombs.push({
      x: player.x, y: player.y,
      fuseMs: BOMB_FUSE_MS,
      range: player.fireRange,
      owner: player.id,
    });
    this.events.push({ kind: 'bombPlaced', x: player.x, y: player.y, ownerId: player.id });
  }

  // ---- 技能（空殼，Task 4 實作） ----

  /** 技能啟動空殼：冷卻欄位已建置，效果由 Task 4 補充。 */
  private activateAbility(player: VPlayer): void {
    if (player.abilityCooldownMs > 0) return;
    player.abilityCooldownMs = player.abilityMaxMs;
    this.events.push({ kind: 'ability', playerId: player.id, id: player.abilityId });
    // TODO Task 4: switch (player.abilityId) { case 'detonate': ... }
  }

  // ---- 道具拾取 ----

  /** 玩家移動到 powerUp 格後呼叫。 */
  private checkPickup(player: VPlayer): void {
    const hit = this.powerUps.find((u) => u.x === player.x && u.y === player.y);
    if (!hit) return;
    this.powerUps = this.powerUps.filter((u) => u !== hit);
    this.applyPowerUp(player, hit.kind);
    this.events.push({ kind: 'pickup', playerId: player.id, powerUp: hit.kind });
  }

  /** 套用道具效果（no heart in versus）。 */
  private applyPowerUp(player: VPlayer, kind: PowerUpKind): void {
    const profile = getCharacter(player.character);
    const caps = profile.caps;
    if (kind === 'fire') player.fireRange = Math.min(player.fireRange + 1, caps.fireRange);
    else if (kind === 'bomb') player.maxBombs = Math.min(player.maxBombs + 1, caps.maxBombs);
    else if (kind === 'speed') player.speedLevel = Math.min(player.speedLevel + 1, caps.speedLevel);
    else if (kind === 'shield') player.shield = true;
    // heart 不適用於 versus（不含生命值系統）
  }

  // ---- 狀態查詢 ----

  /** 深拷貝當前狀態。 */
  getState(): VersusState {
    return {
      status: this.status,
      arenaId: this.arenaId,
      elapsedMs: this.elapsedMs,
      grid: this.grid.map((row) => row.slice()),
      players: this.players.map((p) => ({ ...p })),
      bombs: this.bombs.map((b) => ({ ...b })),
      blasts: this.blasts.map((bl) => ({ ...bl })),
      powerUps: this.powerUps.map((u) => ({ ...u })),
      collapsedRings: this.collapsedRings,
      winnerId: this.winnerId,
    };
  }

  /** 取出並清空事件佇列。 */
  drainEvents(): VersusEvent[] {
    const e = this.events;
    this.events = [];
    return e;
  }

  // ---- debug seams（測試用） ----

  /** 直接對玩家套用道具效果。 */
  debugGivePowerUp(playerId: string, kind: PowerUpKind): void {
    const player = this.players.find((p) => p.id === playerId);
    if (!player) return;
    this.applyPowerUp(player, kind);
  }

  /** 強制移動玩家到指定格。 */
  debugMovePlayer(playerId: string, x: number, y: number): void {
    const player = this.players.find((p) => p.id === playerId);
    if (!player) return;
    player.x = x; player.y = y;
    player.prevX = x; player.prevY = y;
  }

  /** 強制設定已經過時間（供 sudden death 測試用）。 */
  debugSetElapsed(ms: number): void {
    this.elapsedMs = ms;
  }
}
