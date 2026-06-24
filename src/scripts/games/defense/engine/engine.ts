// Dungeon Defense engine — 純邏輯、確定性、無 RNG。座標單位 px，dt 單位 ms。
export interface Vec { x: number; y: number; }
export type TowerType = 'arrow' | 'bomb' | 'frost' | 'arcane';
export type EnemyType = 'slime' | 'skeleton' | 'bat' | 'boss';
export type Status = 'building' | 'wave' | 'won' | 'lost';

export interface Enemy {
  id: number; type: EnemyType; hp: number; maxHp: number; speed: number; gold: number;
  dist: number; slowMs: number; alive: boolean; x: number; y: number;
}
export interface Tower { id: number; slot: string; type: TowerType; level: number; cdMs: number; }
export interface Projectile {
  id: number; x: number; y: number; targetId: number; dmg: number; splash: number; slowMs: number;
  speed: number; active: boolean;
}
export interface Slot { id: string; x: number; y: number; }

export const FIELD_W = 480;
export const FIELD_H = 640;

// 蛇形路徑：上方入口 → 下方封印門（出界）。
export const PATH: Vec[] = [
  { x: 100, y: -20 }, { x: 100, y: 140 }, { x: 380, y: 140 }, { x: 380, y: 300 },
  { x: 100, y: 300 }, { x: 100, y: 460 }, { x: 380, y: 460 }, { x: 380, y: 660 },
];
// 建塔格緊貼路徑「旁邊」的地板（不在路上），各自掩護鄰近走廊（敵人走清空的路）。
export const SLOTS: Slot[] = [
  { id: 's0', x: 138, y: 82 },  // A(x100 直) 右側、近入口
  { id: 's1', x: 240, y: 108 }, // B(y140 橫) 上方
  { id: 's2', x: 342, y: 222 }, // C(x380 直) 左側
  { id: 's3', x: 240, y: 270 }, // D(y300 橫) 上方（內凹）
  { id: 's4', x: 138, y: 382 }, // E(x100 直) 右側
  { id: 's5', x: 240, y: 432 }, // F(y460 橫) 上方
  { id: 's6', x: 342, y: 540 }, // G(x380 直) 左側、近封印門
];

interface TowerDef { cost: number; range: number; cdMs: number; dmg: number; splash: number; slowMs: number; up: { cost: number; dmg: number; range: number; splash: number; slowMs: number }; }
const T = (cost: number, range: number, cdMs: number, dmg: number, splash: number, slowMs: number, up: Partial<TowerDef['up']>): TowerDef =>
  ({ cost, range, cdMs, dmg, splash, slowMs, up: { cost: up.cost ?? cost, dmg: up.dmg ?? dmg, range: up.range ?? range, splash: up.splash ?? splash, slowMs: up.slowMs ?? slowMs } });
export const TOWERS: Record<TowerType, TowerDef> = {
  arrow: T(50, 110, 350, 8, 0, 0, { dmg: 16, range: 130 }),
  bomb: T(80, 100, 950, 14, 52, 0, { dmg: 26, splash: 66 }),
  frost: T(60, 115, 650, 4, 0, 1200, { dmg: 8, slowMs: 1800 }),
  arcane: T(80, 170, 500, 22, 0, 0, { cost: 90, dmg: 40, range: 185 }),
};

const ENEMIES: Record<EnemyType, { hp: number; speed: number; gold: number; leak: number }> = {
  slime: { hp: 30, speed: 45, gold: 6, leak: 1 },
  skeleton: { hp: 80, speed: 35, gold: 10, leak: 2 },
  bat: { hp: 22, speed: 80, gold: 7, leak: 1 },
  boss: { hp: 600, speed: 28, gold: 80, leak: 10 },
};

type Group = { type: EnemyType; count: number };
export const WAVES: Group[][] = [
  [{ type: 'slime', count: 6 }],
  [{ type: 'slime', count: 8 }],
  [{ type: 'slime', count: 6 }, { type: 'bat', count: 3 }],
  [{ type: 'skeleton', count: 4 }, { type: 'slime', count: 4 }],
  [{ type: 'bat', count: 8 }, { type: 'slime', count: 4 }],
  [{ type: 'boss', count: 1 }, { type: 'slime', count: 6 }],
  [{ type: 'skeleton', count: 6 }, { type: 'bat', count: 4 }],
  [{ type: 'slime', count: 10 }, { type: 'skeleton', count: 4 }],
  [{ type: 'bat', count: 12 }, { type: 'skeleton', count: 4 }],
  [{ type: 'skeleton', count: 8 }, { type: 'bat', count: 6 }],
  [{ type: 'slime', count: 12 }, { type: 'skeleton', count: 6 }, { type: 'bat', count: 6 }],
  [{ type: 'boss', count: 2 }, { type: 'skeleton', count: 6 }, { type: 'bat', count: 6 }],
];

const START_GOLD = 250;
const BASE_HP = 20;
const SPAWN_GAP = 700;
const PROJ_SPEED = 340;
const waveBonus = (waveIndex: number): number => 30 + waveIndex * 10;

export function pathLength(path: Vec[]): number {
  let s = 0;
  for (let i = 1; i < path.length; i++) s += Math.hypot(path[i].x - path[i - 1].x, path[i].y - path[i - 1].y);
  return s;
}

export function posAt(path: Vec[], dist: number): { pos: Vec; reached: boolean } {
  if (dist <= 0) return { pos: { x: path[0].x, y: path[0].y }, reached: false };
  let d = dist;
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1], b = path[i];
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    if (d <= len) { const t = d / len; return { pos: { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }, reached: false }; }
    d -= len;
  }
  const e = path[path.length - 1];
  return { pos: { x: e.x, y: e.y }, reached: true };
}

/** 射程內「最前進」(dist 最大) 的 alive 敵；無則 null。 */
export function pickTarget(enemies: Enemy[], pos: Vec, range: number): Enemy | null {
  let best: Enemy | null = null;
  for (const e of enemies) {
    if (!e.alive) continue;
    if (Math.hypot(e.x - pos.x, e.y - pos.y) > range) continue;
    if (!best || e.dist > best.dist) best = e;
  }
  return best;
}

export class DefenseGame {
  private status: Status = 'building';
  private gold = START_GOLD;
  private baseHp = BASE_HP;
  private waveIndex = -1;
  private enemies: Enemy[] = [];
  private towers: Tower[] = [];
  private projectiles: Projectile[] = [];
  private queue: EnemyType[] = [];
  private spawnTimer = 0;
  private nid = 1; private tid = 1; private pid = 1;
  private slotPos = new Map(SLOTS.map((s) => [s.id, s]));

  private def(t: Tower): { range: number; cdMs: number; dmg: number; splash: number; slowMs: number } {
    const d = TOWERS[t.type];
    return t.level >= 2
      ? { range: d.up.range, cdMs: d.cdMs, dmg: d.up.dmg, splash: d.up.splash, slowMs: d.up.slowMs }
      : { range: d.range, cdMs: d.cdMs, dmg: d.dmg, splash: d.splash, slowMs: d.slowMs };
  }

  startWave(): boolean {
    if (this.status !== 'building') return false;
    if (this.waveIndex + 1 >= WAVES.length) return false;
    this.waveIndex++;
    this.queue = WAVES[this.waveIndex].flatMap((g) => Array<EnemyType>(g.count).fill(g.type));
    this.spawnTimer = 0;
    this.status = 'wave';
    return true;
  }

  build(slotId: string, type: TowerType): boolean {
    if (!this.slotPos.has(slotId)) return false;
    if (this.towers.some((t) => t.slot === slotId)) return false;
    const cost = TOWERS[type].cost;
    if (this.gold < cost) return false;
    this.gold -= cost;
    this.towers.push({ id: this.tid++, slot: slotId, type, level: 1, cdMs: 0 });
    return true;
  }

  upgrade(towerId: number): boolean {
    const t = this.towers.find((x) => x.id === towerId);
    if (!t || t.level >= 2) return false;
    const cost = TOWERS[t.type].up.cost;
    if (this.gold < cost) return false;
    this.gold -= cost;
    t.level = 2;
    return true;
  }

  private damage(e: Enemy, dmg: number): void {
    if (!e.alive) return;
    e.hp -= dmg;
    if (e.hp <= 0) { e.alive = false; this.gold += e.gold; }
  }

  step(dtMs: number): void {
    if (this.status !== 'wave') return;
    // 生成
    this.spawnTimer -= dtMs;
    if (this.spawnTimer <= 0 && this.queue.length > 0) {
      const type = this.queue.shift() as EnemyType;
      const d = ENEMIES[type];
      const p0 = posAt(PATH, 0).pos;
      this.enemies.push({ id: this.nid++, type, hp: d.hp, maxHp: d.hp, speed: d.speed, gold: d.gold, dist: 0, slowMs: 0, alive: true, x: p0.x, y: p0.y });
      this.spawnTimer = SPAWN_GAP;
    }
    // 敵人移動
    for (const e of this.enemies) {
      if (!e.alive) continue;
      const sp = e.speed * (e.slowMs > 0 ? 0.5 : 1);
      e.slowMs = Math.max(0, e.slowMs - dtMs);
      e.dist += (sp * dtMs) / 1000;
      const at = posAt(PATH, e.dist);
      e.x = at.pos.x; e.y = at.pos.y;
      if (at.reached) { e.alive = false; this.baseHp -= ENEMIES[e.type].leak; }
    }
    // 塔開火
    for (const t of this.towers) {
      t.cdMs -= dtMs;
      if (t.cdMs > 0) continue;
      const def = this.def(t);
      const pos = this.slotPos.get(t.slot) as Slot;
      const target = pickTarget(this.enemies, pos, def.range);
      if (!target) continue;
      this.projectiles.push({ id: this.pid++, x: pos.x, y: pos.y, targetId: target.id, dmg: def.dmg, splash: def.splash, slowMs: def.slowMs, speed: PROJ_SPEED, active: true });
      t.cdMs = def.cdMs;
    }
    // 投射物
    for (const p of this.projectiles) {
      if (!p.active) continue;
      const tgt = this.enemies.find((e) => e.id === p.targetId && e.alive);
      if (!tgt) { p.active = false; continue; }
      const dx = tgt.x - p.x, dy = tgt.y - p.y, d = Math.hypot(dx, dy);
      if (d < 10) {
        this.damage(tgt, p.dmg);
        if (p.splash > 0) for (const e of this.enemies) if (e.alive && e.id !== tgt.id && Math.hypot(e.x - tgt.x, e.y - tgt.y) <= p.splash) this.damage(e, p.dmg);
        if (p.slowMs > 0) tgt.slowMs = Math.max(tgt.slowMs, p.slowMs);
        p.active = false;
      } else { p.x += (dx / d) * p.speed * dtMs / 1000; p.y += (dy / d) * p.speed * dtMs / 1000; }
    }
    // 清理
    this.enemies = this.enemies.filter((e) => e.alive);
    this.projectiles = this.projectiles.filter((p) => p.active);
    // 波次結束
    if (this.queue.length === 0 && this.enemies.length === 0) {
      if (this.waveIndex >= WAVES.length - 1) this.status = 'won';
      else { this.gold += waveBonus(this.waveIndex); this.status = 'building'; }
    }
    // 失敗
    if (this.baseHp <= 0) { this.baseHp = 0; this.status = 'lost'; }
  }

  getState() {
    return {
      status: this.status, gold: this.gold, baseHp: this.baseHp,
      wave: this.waveIndex + 1, totalWaves: WAVES.length,
      enemies: this.enemies, towers: this.towers, projectiles: this.projectiles,
      slots: SLOTS, path: PATH,
    };
  }
}
