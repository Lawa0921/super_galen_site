// enemies.test.ts — 怪物資料表與 AI 狀態機（在小測試世界裡直接驅動 stepEnemy）
import { describe, it, expect } from 'vitest';
import { World } from './world';
import { T } from './tiles';
import { Rng } from './rng';
import { ENEMIES, ENEMY_KINDS, NATURAL_KINDS, makeEnemy, stepEnemy, type AiCtx, type Enemy, type EnemyKind } from './enemies';
import { TILE_SIZE as S, FIXED_DT } from './constants';
import { isItemId } from './items';

/** 40×30 世界：第 20 列以下石頭 */
function flat(floor = 20): World {
  const w = new World(60, 30);
  for (let y = floor; y < 30; y++) for (let x = 0; x < 60; x++) w.setFg(x, y, T.STONE);
  return w;
}
function ctxFor(w: World, px: number, py: number, extra: Partial<AiCtx> = {}): AiCtx & { shots: string[] } {
  const shots: string[] = [];
  return {
    q: w, px, py, playerDead: false, rng: new Rng('ai'), night: true,
    shoot: (kind) => { shots.push(kind); },
    teleportSpot: () => ({ x: px - 5 * S, y: 20 * S }),
    summon: () => {},
    bossEvent: () => {},
    shots,
    ...extra,
  };
}
function sim(e: Enemy, c: AiCtx, seconds: number): void {
  for (let i = 0, n = Math.round(seconds / FIXED_DT); i < n; i++) stepEnemy(e, c, FIXED_DT);
}
const cx = (e: Enemy): number => e.body.x + e.body.w / 2;

describe('怪物表', () => {
  it('至少 10 種一般怪物，每種都有原創中文名、正數值、掉落物是已知道具', () => {
    expect(NATURAL_KINDS.length).toBeGreaterThanOrEqual(10);
    for (const k of ENEMY_KINDS) {
      const d = ENEMIES[k];
      expect(d.kind).toBe(k);
      expect(d.name.zh.length).toBeGreaterThan(1);
      expect(d.hp).toBeGreaterThan(0);
      expect(d.kbRes).toBeGreaterThanOrEqual(0);
      expect(d.kbRes).toBeLessThanOrEqual(1);
      for (const r of d.drops) expect(isItemId(r.item)).toBe(true);
      expect(d.habitat.length).toBeGreaterThan(0);
    }
    // 素材分布：凝膠 / 骨頭 / 羽毛 / 獠牙 / 甲殼 / 蜂刺 / 菇孢 / 餘燼 都有怪會掉
    const all = new Set(ENEMY_KINDS.flatMap((k) => ENEMIES[k].drops.map((r) => r.item)));
    for (const m of ['gel', 'bone', 'feather', 'fang', 'chitin', 'stinger', 'spore', 'ember'] as const) expect(all.has(m), m).toBe(true);
  });
});

describe('AI', () => {
  const at = (w: World, kind: EnemyKind, tx: number, ty = 19): Enemy => {
    const e = makeEnemy(1, kind, (tx + 0.5) * S, (ty + 1) * S);
    void w;
    return e;
  };
  it('跳跳型（凝膠團）：落地等一下再朝玩家跳', () => {
    const w = flat(), e = at(w, 'gel_blob', 10);
    const c = ctxFor(w, 30 * S, 19 * S);
    let jumped = false;
    for (let i = 0; i < 180; i++) { stepEnemy(e, c, FIXED_DT); if (e.body.vy < -100) jumped = true; }
    expect(jumped).toBe(true);
    expect(cx(e)).toBeGreaterThan(10.5 * S + 20);
  });
  it('步行型（夜行屍）：朝玩家走、遇到一格高的牆會跳過去', () => {
    const w = flat();
    w.setFg(16, 19, T.STONE);
    const e = at(w, 'night_walker', 10);
    const c = ctxFor(w, 30 * S, 19 * S);
    sim(e, c, 4);
    expect(cx(e)).toBeGreaterThan(17 * S);
  });
  it('步行型：被高牆擋住會掉頭亂走（不會永遠卡著）', () => {
    const w = flat();
    for (let y = 10; y < 20; y++) w.setFg(16, y, T.STONE);
    const e = at(w, 'night_walker', 12);
    const c = ctxFor(w, 30 * S, 19 * S);
    let wandered = false;
    for (let i = 0; i < 60 * 5; i++) { stepEnemy(e, c, FIXED_DT); if (e.state === 'wander') wandered = true; }
    expect(wandered).toBe(true);
  });
  it('爬行型（岩甲蟹）：靠近時衝刺', () => {
    const w = flat(), e = at(w, 'rock_crab', 20);
    const c = ctxFor(w, 24 * S, 19.5 * S);
    let dashed = false;
    for (let i = 0; i < 120; i++) { stepEnemy(e, c, FIXED_DT); if (e.state === 'dash') dashed = true; }
    expect(dashed).toBe(true);
  });
  it('飛行型（穴蝠）：不受重力、靠近玩家', () => {
    const w = flat(), e = at(w, 'cave_bat', 10, 10);
    const c = ctxFor(w, 30 * S, 12 * S);
    const d0 = Math.abs(cx(e) - c.px);
    sim(e, c, 2);
    expect(Math.abs(cx(e) - c.px)).toBeLessThan(d0 - 60);
    expect(e.body.y + e.body.h).toBeLessThan(20 * S);
  });
  it('俯衝型（暗羽梟）：盤旋 → 俯衝 → 拉高', () => {
    const w = flat(), e = at(w, 'dusk_owl', 20, 8);
    const c = ctxFor(w, 24 * S, 18 * S);
    const states = new Set<string>();
    for (let i = 0; i < 60 * 6; i++) { stepEnemy(e, c, FIXED_DT); states.add(e.state); }
    for (const s of ['hover', 'dive', 'rise']) expect(states.has(s), s).toBe(true);
  });
  it('射擊型（刺翅蜂）：保持距離並射刺', () => {
    const w = flat(), e = at(w, 'thorn_hornet', 20, 10);
    const c = ctxFor(w, 26 * S, 18 * S);
    sim(e, c, 4);
    expect(c.shots.filter((k) => k === 'stinger').length).toBeGreaterThanOrEqual(1);
  });
  it('植物（噬花藤）：咬向玩家但頭不離根部 5 格', () => {
    const w = flat(), e = at(w, 'snap_vine', 20, 19);
    const c = ctxFor(w, 26 * S, 18 * S);
    let lunged = false, maxR = 0;
    for (let i = 0; i < 60 * 4; i++) {
      stepEnemy(e, c, FIXED_DT);
      if (e.state === 'lunge') lunged = true;
      maxR = Math.max(maxR, Math.hypot(cx(e) - e.anchor!.x, e.body.y + e.body.h / 2 - e.anchor!.y));
    }
    expect(lunged).toBe(true);
    expect(maxR).toBeLessThanOrEqual(5 * S + 0.01);
    expect(maxR).toBeGreaterThan(2 * S);
  });
  it('幽靈型（咒顱）：穿牆追玩家', () => {
    const w = flat();
    for (let y = 0; y < 20; y++) for (let x = 14; x < 18; x++) w.setFg(x, y, T.STONE);
    const e = at(w, 'cursed_skull', 10, 12);
    const c = ctxFor(w, 30 * S, 12 * S);
    sim(e, c, 4);
    expect(cx(e)).toBeGreaterThan(18 * S);
  });
  it('瞬移型（燼角魔）：瞬移到玩家附近、施法後丟火球', () => {
    const w = flat(), e = at(w, 'ember_imp', 5);
    const c = ctxFor(w, 40 * S, 19 * S);
    sim(e, c, 4);
    expect(Math.abs(cx(e) - (c.px - 5 * S))).toBeLessThan(S);
    expect(c.shots).toContain('fireball');
  });
  it('首領：第一階段射三連火球、血量一半進入碎籠 → 第二階段衝刺；玩家死亡就離開', () => {
    const w = flat();
    const e = makeEnemy(1, 'lantern_warden', 30 * S, 8 * S);
    const ph: string[] = [];
    const c = ctxFor(w, 30 * S, 19 * S, { bossEvent: (p) => ph.push(p) });
    sim(e, c, 3);
    expect(c.shots.filter((k) => k === 'fireball').length).toBeGreaterThanOrEqual(3);
    e.hp = e.maxHp * 0.4;
    sim(e, c, 0.1);
    expect(e.state).toBe('shatter');
    expect(ph).toContain('phase2');
    const seen = new Set<string>();
    for (let i = 0; i < 60 * 8; i++) { stepEnemy(e, c, FIXED_DT); seen.add(e.state); }
    expect(seen.has('dash')).toBe(true);
    expect(seen.has('ring')).toBe(true);
    c.playerDead = true;
    let alive = true;
    for (let i = 0; i < 60 * 5 && alive; i++) alive = stepEnemy(e, c, FIXED_DT);
    expect(alive).toBe(false);
    expect(ph).toContain('leave');
  });
});
