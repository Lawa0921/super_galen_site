// game.ts
import type {
  Grid, Bomb, BlastCell, Enemy, PowerUp, Vec, Dir, BomberState, BomberEvent, InputAction, Player,
} from './types';
import { generateFloor } from './generate';
import { makePlayer, dirDelta, speedMs } from './player';
import { isWalkable } from './board';
import { BOMB_FUSE_MS } from './constants';

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
  private hidden: Record<string, import('./types').PowerUpKind> = {};
  private exit: Vec;
  private status: 'playing' | 'gameover' = 'playing';

  private held = new Set<Dir>();
  private lastHeld: Dir | null = null;
  private events: BomberEvent[] = [];

  constructor(opts: BomberOptions = {}) {
    this.seed = opts.seed ?? 1;
    this.floor = opts.floor ?? 1;
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
    else { this.held.delete(dir); if (this.lastHeld === dir) this.lastHeld = null; }
  }
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
    this.stepPlayerMove(dtMs);
    // 炸彈/敵人/爆風/碰撞在 Task 11、12 補上
  }

  private stepPlayerMove(dtMs: number): void {
    const p = this.player;
    if (p.invulnMs > 0) p.invulnMs = Math.max(0, p.invulnMs - dtMs);
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
      grid: this.grid, player: this.player, bombs: this.bombs, blasts: this.blasts,
      enemies: this.enemies, powerUps: this.powerUps, exit: this.exit,
      exitActive: this.enemies.every((e) => !e.alive),
      floor: this.floor, score: 0, status: this.status,
    };
  }

  drainEvents(): BomberEvent[] { const e = this.events; this.events = []; return e; }
}
