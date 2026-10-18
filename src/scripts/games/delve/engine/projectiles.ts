// projectiles.ts — 投射物（箭 / 飛刀 / 迴旋木刃 / 法術 / 光刃 / 怪物的刺與火球）。碰撞傷害由 game 結算，這裡只管移動與撞牆。
import { overlapsSolid, type Body } from './physics';
import type { PhysEnv } from './entities';

export type ProjKind = 'arrow' | 'knife' | 'boomerang' | 'bolt' | 'wave' | 'stinger' | 'fireball' | 'ember' | 'wisp';
export interface Projectile {
  id: number;
  kind: ProjKind;
  /** true = 怪物射的（打玩家）；false = 玩家的（打怪物） */
  hostile: boolean;
  body: Body;
  damage: number;
  knockback: number;
  /** 暴擊率（玩家投射物） */
  crit: number;
  /** 剩餘壽命（秒） */
  life: number;
  gravity: number;
  /** 還能穿透幾隻 */
  pierce: number;
  hit: Set<number>;
  /** 火焰（命中時點燃） */
  flame?: boolean;
  /** 迴旋：飛出的秒數；> out 後回頭 */
  t: number;
  returning?: boolean;
  /** 撞牆就消失（否則穿牆，例：首領火球） */
  solidHit: boolean;
  /** 已經撞牆（箭插在牆上，短暫停留後消失） */
  stuck?: boolean;
  /** 迴旋木刃 / 法術的武器 id（渲染用） */
  item?: string;
  /** 發射當下武器詞條的命中效果（燃燒 / 冰凍 / 中毒 / 吸血 / 連鎖 / 破甲；玩家投射物） */
  fx?: HitFx;
}
/** 命中效果（機率 / 比例都是 %） */
export interface HitFx { burn: number; frost: number; poison: number; leech: number; chain: number; soul: number; pen: number; }

const SIZE: Record<ProjKind, [number, number]> = {
  arrow: [6, 6], knife: [6, 6], boomerang: [12, 12], bolt: [8, 8], wave: [14, 22],
  stinger: [6, 6], fireball: [10, 10], ember: [8, 8], wisp: [8, 8],
};

export class ProjList {
  readonly list: Projectile[] = [];
  private nextId = 1;
  static readonly MAX = 160;

  spawn(kind: ProjKind, hostile: boolean, cx: number, cy: number, vx: number, vy: number, o: Partial<Projectile> = {}): Projectile {
    const [w, h] = SIZE[kind];
    const p: Projectile = {
      id: this.nextId++, kind, hostile, damage: 10, knockback: 100, crit: 0, life: 2, gravity: 0, pierce: 1,
      hit: new Set(), t: 0, solidHit: true, ...o,
      body: { x: cx - w / 2, y: cy - h / 2, w, h, vx, vy, onGround: false, gfxOffY: 0 },
    };
    this.list.push(p);
    if (this.list.length > ProjList.MAX) this.list.shift();
    return p;
  }

  /**
   * 移動所有投射物。target = 迴旋木刃回收點（玩家中心）。回傳這步撞牆的投射物（render 火花用）。
   * 迴旋木刃：飛出 0.42 秒或撞牆就回頭，回程穿牆、碰到玩家由 game 回收。
   */
  step(q: PhysEnv, dt: number, target: { x: number; y: number }): Projectile[] {
    const walls: Projectile[] = [];
    for (let i = this.list.length - 1; i >= 0; i--) {
      const p = this.list[i], b = p.body;
      p.life -= dt; p.t += dt;
      if (p.life <= 0 || p.pierce <= 0) { this.list.splice(i, 1); continue; }
      if (p.stuck) continue;
      if (p.kind === 'boomerang') {
        if (!p.returning && p.t > 0.42) p.returning = true;
        if (p.returning) {
          const dx = target.x - (b.x + b.w / 2), dy = target.y - (b.y + b.h / 2), r = Math.hypot(dx, dy) || 1;
          const sp = 520;
          b.vx += ((dx / r) * sp - b.vx) * Math.min(1, dt * 9);
          b.vy += ((dy / r) * sp - b.vy) * Math.min(1, dt * 9);
          b.x += b.vx * dt; b.y += b.vy * dt;
          continue;
        }
      }
      b.vy += p.gravity * dt;
      // 子步移動（快的箭 ~10px/步），撞到實心格就停
      const steps = Math.max(1, Math.ceil(Math.hypot(b.vx, b.vy) * dt / 5));
      let hitWall = false;
      for (let k = 0; k < steps; k++) {
        const nx = b.x + (b.vx * dt) / steps, ny = b.y + (b.vy * dt) / steps;
        if (p.solidHit && overlapsSolid(q, nx + b.w / 4, ny + b.h / 4, b.w / 2, b.h / 2)) { hitWall = true; break; }
        b.x = nx; b.y = ny;
      }
      if (hitWall) {
        walls.push(p);
        if (p.kind === 'boomerang') { p.returning = true; continue; }
        if (p.kind === 'arrow' || p.kind === 'knife') { p.stuck = true; p.life = Math.min(p.life, 0.6); p.pierce = 0.5; continue; }
        this.list.splice(i, 1);
      }
    }
    return walls;
  }
  clear(): void { this.list.length = 0; }
}
