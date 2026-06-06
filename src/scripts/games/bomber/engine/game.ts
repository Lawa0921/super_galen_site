// game.ts
import type {
  Grid, Bomb, BlastCell, Enemy, PowerUp, PowerUpKind, Vec, Dir, BomberState, BomberEvent, InputAction, Player,
} from './types';
import { generateFloor } from './generate';
import { makePlayer, dirDelta, speedMs } from './player';
import { isWalkable, breakCrate } from './board';
import { BOMB_FUSE_MS, BLAST_TTL_MS, ENEMY_MOVE_MS, INVULN_MS, SPAWN } from './constants';
import { resolveChain } from './bomb';
import { SCORE, descendBonus } from './scoring';
import { chooseEnemyDir } from './enemy';
import { createRng } from './rng';

export interface BomberOptions { seed?: number; floor?: number; }

export class BomberGame {
  private seed: number;
  private floor: number;
  private grid: Grid;
  private player: Player;
  private bombs: Bomb[] = [];
  private blasts: BlastCell[] = [];
  private enemies: Enemy[] = [];
  private powerUps: PowerUp[] = [];
  private hidden: Record<string, PowerUpKind> = {};
  private exit: Vec;
  private status: 'playing' | 'gameover' = 'playing';
  private score = 0;

  private held = new Set<Dir>();
  private lastHeld: Dir | null = null;
  private events: BomberEvent[] = [];

  private rng = createRng((this.seed ^ 0xabcdef) >>> 0);
  private frozen = false; // debug only
  private clearedEmitted = false;

  constructor(opts: BomberOptions = {}) {
    this.seed = opts.seed ?? 1;
    this.floor = opts.floor ?? 1;
    this.rng = createRng((this.seed ^ 0xabcdef) >>> 0);
    const layout = generateFloor(this.seed, this.floor);
    this.grid = layout.grid;
    this.enemies = layout.enemies;
    this.hidden = layout.hiddenPowerUps;
    this.exit = layout.exit;
    this.player = makePlayer();
  }

  // ---- input ----
  setHeld(dir: Dir, down: boolean): void {
    if (down) { this.held.add(dir); this.lastHeld = dir; }
    else {
      this.held.delete(dir);
      if (this.lastHeld === dir) {
        this.lastHeld = this.held.size > 0 ? [...this.held][this.held.size - 1] : null;
      }
    }
  }
  /**
   * 處理一次動作輸入。'bomb' 為單次放彈；方向會「設為按住」(setHeld true)——
   * 呼叫端（鍵盤層）必須在 keyup 時配對呼叫 setHeld(dir, false)，否則玩家會一直往該方向走。
   * 注意：render 的方向鍵直接用 setHeld，不走這條路；此分支主要供完整 InputAction 介面使用。
   */
  input(action: InputAction): void {
    if (this.status !== 'playing') return;
    if (action === 'bomb') { this.placeBomb(); return; }
    // 方向鍵的瞬按也記為 held，讓不放開也能走（render 會配 keyup 取消）
    this.setHeld(action, true);
  }

  private chosenDir(): Dir | null {
    if (this.lastHeld && this.held.has(this.lastHeld)) return this.lastHeld;
    for (const d of this.held) return d;
    return null;
  }

  private placeBomb(): void {
    if (this.bombs.length >= this.player.maxBombs) return;
    if (this.bombs.some((b) => b.x === this.player.x && b.y === this.player.y)) return;
    this.bombs.push({ x: this.player.x, y: this.player.y, fuseMs: BOMB_FUSE_MS, range: this.player.fireRange });
    this.events.push({ kind: 'bombPlaced', x: this.player.x, y: this.player.y });
  }

  private blocked(x: number, y: number): boolean {
    if (!isWalkable(this.grid, x, y)) return true;
    return this.bombs.some((b) => b.x === x && b.y === y);
  }

  // ---- main loop ----
  step(dtMs: number): void {
    if (this.status !== 'playing') return;
    // Snapshot invuln before movement so the player is protected for the full remaining duration this tick,
    // and invuln granted by hurtPlayer() this tick is not immediately consumed.
    const invulnAtStart = this.player.invulnMs;
    this.stepBlasts(dtMs);
    this.stepBombs(dtMs);
    if (!this.frozen) this.stepPlayerMove(dtMs);
    this.stepEnemies(dtMs);
    this.pickup();
    this.resolveBlastDamage(invulnAtStart);
    // Decrement invuln AFTER damage check (only if invuln was active at tick start)
    if (invulnAtStart > 0) this.player.invulnMs = Math.max(0, this.player.invulnMs - dtMs);
    this.checkDescend();
  }

  private stepBombs(dtMs: number): void {
    const detonating: Bomb[] = [];
    for (const b of this.bombs) { b.fuseMs -= dtMs; if (b.fuseMs <= 0) detonating.push(b); }
    if (detonating.length === 0) return;
    const { cells, brokenCrates, consumed } = resolveChain(this.grid, this.bombs, detonating);
    // 移除已爆炸彈
    this.bombs = this.bombs.filter((b) => !consumed.includes(b));
    // 破壞箱子 + 揭露道具 + 加分
    for (const c of brokenCrates) {
      this.grid = breakCrate(this.grid, c.x, c.y);
      this.score += SCORE.crate;
      this.events.push({ kind: 'crateBreak', x: c.x, y: c.y });
      const key = `${c.x},${c.y}`;
      const drop = this.hidden[key];
      if (drop) { this.powerUps.push({ x: c.x, y: c.y, kind: drop }); delete this.hidden[key]; }
    }
    // 產生爆風格
    for (const c of cells) this.blasts.push({ x: c.x, y: c.y, ttlMs: BLAST_TTL_MS });
    this.events.push({ kind: 'explode', cells });
  }

  private stepBlasts(dtMs: number): void {
    for (const bl of this.blasts) bl.ttlMs -= dtMs;
    this.blasts = this.blasts.filter((bl) => bl.ttlMs > 0);
  }

  private stepEnemies(dtMs: number): void {
    const moveMsBase = (e: Enemy): number => Math.max(80, ENEMY_MOVE_MS[e.kind] - (this.floor - 1) * 15);
    for (const e of this.enemies) {
      if (!e.alive) continue;
      e.moveAccMs += dtMs;
      if (e.moveAccMs < moveMsBase(e)) { e.prevX = e.x; e.prevY = e.y; continue; }
      e.moveAccMs = 0;
      const dir = chooseEnemyDir(this.grid, e, this.player, this.bombs, this.rng);
      if (!dir) { e.prevX = e.x; e.prevY = e.y; continue; }
      const v = dirDelta(dir);
      e.dir = dir;
      e.prevX = e.x; e.prevY = e.y;
      e.x += v.x; e.y += v.y;
    }
  }

  private resolveBlastDamage(invulnAtStart: number): void {
    const onBlast = (x: number, y: number): boolean => this.blasts.some((b) => b.x === x && b.y === y);
    // 敵人被爆風炸死
    for (const e of this.enemies) {
      if (e.alive && onBlast(e.x, e.y)) {
        e.alive = false;
        this.score += SCORE.enemy;
        this.events.push({ kind: 'enemyKill', x: e.x, y: e.y });
      }
    }
    // 發出 floorClear 事件（只發一次）
    if (!this.clearedEmitted && this.enemies.every((e) => !e.alive) && this.enemies.length > 0) {
      this.clearedEmitted = true;
      this.events.push({ kind: 'floorClear' });
    }
    // 玩家：爆風 or 敵人接觸（用 tick 開始時的無敵值判斷）
    const p = this.player;
    const touched = onBlast(p.x, p.y) || this.enemies.some((e) => e.alive && e.x === p.x && e.y === p.y);
    if (touched && invulnAtStart <= 0) this.hurtPlayer();
  }

  private hurtPlayer(): void {
    const p = this.player;
    if (p.shield) {
      p.shield = false;
      p.invulnMs = INVULN_MS;
      this.events.push({ kind: 'playerHit', shielded: true });
      return;
    }
    p.lives -= 1;
    this.events.push({ kind: 'playerHit', shielded: false });
    if (p.lives <= 0) {
      this.status = 'gameover';
      this.events.push({ kind: 'gameover' });
      return;
    }
    // 重生於出生點 + 無敵
    p.x = SPAWN.x; p.y = SPAWN.y; p.prevX = SPAWN.x; p.prevY = SPAWN.y;
    p.moveCooldownMs = 0; p.invulnMs = INVULN_MS;
  }

  private checkDescend(): void {
    const cleared = this.enemies.every((e) => !e.alive);
    if (!cleared) return;
    const p = this.player;
    if (p.x !== this.exit.x || p.y !== this.exit.y) return;
    this.floor += 1;
    this.score += descendBonus(this.floor);
    this.events.push({ kind: 'descend', floor: this.floor });
    const layout = generateFloor(this.seed, this.floor);
    this.grid = layout.grid;
    this.enemies = layout.enemies;
    this.hidden = layout.hiddenPowerUps;
    this.exit = layout.exit;
    this.bombs = []; this.blasts = []; this.powerUps = [];
    // 保留道具能力，只重置位置
    p.x = SPAWN.x; p.y = SPAWN.y; p.prevX = SPAWN.x; p.prevY = SPAWN.y;
    p.moveCooldownMs = 0;
    this.clearedEmitted = false;
  }

  private pickup(): void {
    const p = this.player;
    const hit = this.powerUps.find((u) => u.x === p.x && u.y === p.y);
    if (!hit) return;
    this.powerUps = this.powerUps.filter((u) => u !== hit);
    this.applyPowerUp(hit.kind);
    this.score += SCORE.powerup;
    this.events.push({ kind: 'pickup', powerUp: hit.kind });
  }

  private applyPowerUp(kind: PowerUpKind): void {
    const p = this.player;
    if (kind === 'fire') p.fireRange = Math.min(p.fireRange + 1, 8);
    else if (kind === 'bomb') p.maxBombs = Math.min(p.maxBombs + 1, 8);
    else if (kind === 'speed') p.speedLevel = Math.min(p.speedLevel + 1, 4);
    else if (kind === 'shield') p.shield = true;
  }

  private stepPlayerMove(dtMs: number): void {
    const p = this.player;
    if (p.moveCooldownMs > 0) { p.moveCooldownMs = Math.max(0, p.moveCooldownMs - dtMs); return; }
    const dir = this.chosenDir();
    if (!dir) { p.prevX = p.x; p.prevY = p.y; return; }
    p.dir = dir;
    const v = dirDelta(dir);
    const tx = p.x + v.x, ty = p.y + v.y;
    if (this.blocked(tx, ty)) { p.prevX = p.x; p.prevY = p.y; return; }
    p.prevX = p.x; p.prevY = p.y;
    p.x = tx; p.y = ty;
    p.moveCooldownMs = speedMs(p.speedLevel);
  }

  getState(): BomberState {
    return {
      grid: this.grid, // grid is treated read-only by the render layer; sharing avoids per-frame deep copies
      player: { ...this.player },
      bombs: this.bombs.map((b) => ({ ...b })),
      blasts: this.blasts.map((b) => ({ ...b })),
      enemies: this.enemies.map((e) => ({ ...e })),
      powerUps: this.powerUps.map((u) => ({ ...u })),
      exit: { ...this.exit },
      exitActive: this.enemies.every((e) => !e.alive),
      floor: this.floor,
      score: this.score,
      status: this.status,
    };
  }

  drainEvents(): BomberEvent[] { const e = this.events; this.events = []; return e; }

  // ---- debug / test seams ----
  debugMoveEnemy(id: number, x: number, y: number): void {
    const e = this.enemies.find((q) => q.id === id);
    if (e) { e.x = x; e.y = y; e.prevX = x; e.prevY = y; }
  }
  debugKillEnemy(id: number): void {
    const e = this.enemies.find((q) => q.id === id);
    if (e) e.alive = false;
  }
  debugSetFire(n: number): void { this.player.fireRange = n; }
  debugSetInvuln(ms: number): void { this.player.invulnMs = ms; }
  debugTeleportPlayer(x: number, y: number): void {
    const p = this.player;
    p.x = x; p.y = y; p.prevX = x; p.prevY = y;
  }
  debugFreezePlayer(): void { this.frozen = true; }
}
