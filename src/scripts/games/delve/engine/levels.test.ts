import { describe, expect, it } from 'vitest';
import {
  BOSS_FIRST_XP, BOSS_XP, DAILY_CAP, DEATH_XP_LOSS, KILL_FULL, MAX_LEVEL, MAX_XP, Progression, REGION_XP, chestXp, enemyXp, killMul,
  levelDef, levelForXp, levelHp, lootIlvl, milestoneAt, progressOf, recipeXp, respecCost, skillPointsAt, titleFor, xpAtLevel, xpForEvent,
  xpToNext, type XpCtx,
} from './levels';
import { T } from './tiles';
import type { DelveEvent } from './game';

describe('XP curve', () => {
  it('levels 1..50, smooth and strictly increasing per level', () => {
    expect(xpAtLevel(1)).toBe(0);
    expect(xpToNext(MAX_LEVEL)).toBe(0);
    let prev = 0;
    for (let L = 1; L < MAX_LEVEL; L++) {
      const n = xpToNext(L);
      expect(n).toBeGreaterThan(prev);
      // 平滑：每級最多比上一級多 45%（前幾級）、後段趨近幾 %
      if (prev) expect(n / prev).toBeLessThan(1.45);
      prev = n;
      expect(xpAtLevel(L + 1)).toBe(xpAtLevel(L) + n);
    }
    expect(MAX_XP).toBe(xpAtLevel(MAX_LEVEL));
  });
  it('anchor numbers: first levels are quick, boss band (15–20) is ~18k–36k total', () => {
    expect(xpToNext(1)).toBe(200);
    expect(xpAtLevel(3)).toBe(480);
    expect(xpAtLevel(15)).toBeGreaterThan(15000);
    expect(xpAtLevel(15)).toBeLessThan(21000);
    expect(xpAtLevel(20)).toBeLessThan(40000);
    expect(MAX_XP).toBeGreaterThan(250000);
  });
  it('levelForXp / progressOf are consistent with xpAtLevel', () => {
    for (const L of [1, 2, 7, 19, 49, 50]) {
      expect(levelForXp(xpAtLevel(L))).toBe(L);
      if (L > 1) expect(levelForXp(xpAtLevel(L) - 1)).toBe(L - 1);
    }
    expect(levelForXp(-5)).toBe(1);
    expect(levelForXp(MAX_XP * 10)).toBe(MAX_LEVEL);
    const p = progressOf(xpAtLevel(4) + 100);
    expect(p).toEqual({ level: 4, into: 100, need: xpToNext(4), frac: 100 / xpToNext(4) });
    expect(progressOf(MAX_XP).frac).toBe(1);
  });
  it('per-level growth, skill points and milestones every 5 levels', () => {
    expect(levelHp(1)).toBe(0);
    expect(levelHp(50)).toBe(98);
    expect(levelDef(9)).toBe(0);
    expect(levelDef(10)).toBe(1);
    expect(levelDef(50)).toBe(5);
    expect(skillPointsAt(1)).toBe(0);
    expect(skillPointsAt(4)).toBe(3);
    expect(skillPointsAt(5)).toBe(5); // 4 + 里程碑 1
    expect(skillPointsAt(50)).toBe(59);
    expect(milestoneAt(4)).toBeNull();
    expect(milestoneAt(5)?.title).toBe(titleFor(5));
    expect(titleFor(1)).not.toBe(titleFor(5));
    expect(titleFor(7)).toBe(titleFor(5));
  });
});

describe('XP source rules', () => {
  it('enemy XP scales with tier; boss is a flat bonus; minion is tiny', () => {
    expect(enemyXp('gel_blob')).toBeLessThan(enemyXp('night_walker'));
    expect(enemyXp('night_walker')).toBeLessThan(enemyXp('bone_knight'));
    expect(enemyXp('warden_wisp')).toBe(2);
    expect(enemyXp('lantern_warden')).toBe(BOSS_XP);
  });
  it('kill decay per kind per in-game day', () => {
    for (let n = 0; n < KILL_FULL; n++) expect(killMul(n)).toBe(1);
    expect(killMul(KILL_FULL)).toBeLessThan(1);
    expect(killMul(200)).toBe(0.1);
  });
  it('chest XP grows with depth; recipe XP by station', () => {
    expect(chestXp(0)).toBe(20);
    expect(chestXp(1)).toBe(80);
    expect(recipeXp('anvil')).toBeGreaterThan(recipeXp('workbench'));
    expect(recipeXp(null)).toBeGreaterThan(0);
  });
  it('lootIlvl: depth is the driver; level lifts it by at most 1', () => {
    expect(lootIlvl(1, 1)).toBe(1);
    expect(lootIlvl(1, 12)).toBe(2);
    expect(lootIlvl(1, 50)).toBe(2);
    expect(lootIlvl(3, 1)).toBe(3);
    expect(lootIlvl(5, 50)).toBe(5);
  });
  it('respec cost grows with spent points; free when nothing is spent', () => {
    expect(respecCost(0)).toEqual({ shard: 0, dust: 0 });
    expect(respecCost(5)).toEqual({ shard: 8, dust: 0 });
    expect(respecCost(25).shard).toBeGreaterThan(respecCost(5).shard);
    expect(respecCost(25).dust).toBe(2);
  });
});

function ctx(o: Partial<XpCtx> = {}): XpCtx {
  return {
    day: 0, idx: (x, y) => y * 1000 + x, depth: () => 0, fishCount: () => 1, isFish: () => true, legendary: () => false,
    catStats: () => [], recipeStation: () => 'workbench', ...o,
  };
}
const kill = (kind: 'gel_blob' | 'lantern_warden' | 'night_walker'): DelveEvent => ({ type: 'kill', id: 1, kind, x: 10, y: 20 });

describe('Progression', () => {
  it('gain → level up with the right number of levels', () => {
    const p = new Progression();
    expect(p.level).toBe(1);
    const r = p.gain(xpAtLevel(3) + 10);
    expect(r).toEqual({ amount: xpAtLevel(3) + 10, from: 1, to: 3 });
    expect(p.level).toBe(3);
    expect(p.points).toBe(2);
  });
  it('XP is capped at MAX_XP', () => {
    const p = new Progression();
    p.gain(MAX_XP * 3);
    expect(p.xp).toBe(MAX_XP);
    expect(p.gain(100).amount).toBe(0);
  });
  it('learn spends points; failing reasons do not change anything; respec refunds everything', () => {
    const p = new Progression();
    p.gain(xpAtLevel(6));
    expect(p.points).toBe(6);
    expect(p.learn('b_edge')).toBe('req');
    expect(p.learn('b_vigor')).toBeNull();
    expect(p.learn('b_edge')).toBeNull();
    expect(p.learn('b_dash')).toBeNull();
    expect(p.rank('b_dash')).toBe(1);
    expect(p.spent).toBe(4);
    expect(p.points).toBe(2);
    const v = p.version;
    expect(p.respec()).toBe(4);
    expect(p.version).toBeGreaterThan(v);
    expect(p.spent).toBe(0);
    expect(p.points).toBe(6);
    expect(p.respecs).toBe(1);
  });
  it('xp bonus from 博學 multiplies gains', () => {
    const p = new Progression();
    p.gain(xpAtLevel(12));
    p.ranks = { c_hands: 1, c_thrift: 1, c_fortune: 1, c_scholar: 2 };
    p.version++;
    expect(p.gain(100).amount).toBe(110);
  });
  it('death: loses 10% of current-level progress and never de-levels', () => {
    const p = new Progression();
    p.gain(xpAtLevel(5) + 500);
    const lost = p.die();
    expect(lost).toBe(Math.floor(500 * DEATH_XP_LOSS));
    expect(p.level).toBe(5);
    const q = new Progression();
    q.gain(xpAtLevel(5));
    expect(q.die()).toBe(0);
    expect(q.level).toBe(5);
  });
});

describe('xpForEvent (anti-farm)', () => {
  it('kills give XP that decays when farming one kind on one day, and recovers the next day', () => {
    const p = new Progression();
    const first = xpForEvent(p, kill('gel_blob'), ctx())!;
    expect(first.amount).toBe(enemyXp('gel_blob'));
    let total = first.amount;
    for (let k = 1; k < 60; k++) total += xpForEvent(p, kill('gel_blob'), ctx())!.amount;
    expect(total).toBeLessThan(enemyXp('gel_blob') * 60 * 0.4);
    // 別種怪不受影響
    expect(xpForEvent(p, kill('night_walker'), ctx())!.amount).toBe(enemyXp('night_walker'));
    // 隔天恢復
    expect(xpForEvent(p, kill('gel_blob'), ctx({ day: 1 }))!.amount).toBe(enemyXp('gel_blob'));
  });
  it('boss: big first-time bonus, then the flat amount', () => {
    const p = new Progression();
    expect(xpForEvent(p, kill('lantern_warden'), ctx())!.amount).toBe(BOSS_XP + BOSS_FIRST_XP);
    expect(xpForEvent(p, kill('lantern_warden'), ctx())!.amount).toBe(BOSS_XP);
  });
  it('ore: small XP, nothing for player-placed ore, and a daily cap', () => {
    const p = new Progression();
    const mine = (x: number): DelveEvent => ({ type: 'mine', x, y: 5, tile: T.COPPER_ORE, item: 'copper_ore' });
    expect(xpForEvent(p, mine(1), ctx())!.amount).toBeGreaterThan(0);
    expect(xpForEvent(p, { type: 'place', x: 2, y: 5, tile: T.COPPER_ORE, item: 'copper_ore' }, ctx())).toBeNull();
    expect(xpForEvent(p, mine(2), ctx())).toBeNull();
    // 放回去再挖：還是沒有
    xpForEvent(p, { type: 'place', x: 2, y: 5, tile: T.COPPER_ORE, item: 'copper_ore' }, ctx());
    expect(xpForEvent(p, mine(2), ctx())).toBeNull();
    let sum = 0;
    for (let x = 100; x < 400; x++) sum += xpForEvent(p, mine(x), ctx())?.amount ?? 0;
    expect(sum).toBeLessThanOrEqual(DAILY_CAP.ore);
    expect(xpForEvent(p, mine(999), ctx({ day: 3 }))!.amount).toBeGreaterThan(0);
    // 不是礦
    expect(xpForEvent(p, { type: 'mine', x: 7, y: 7, tile: T.DIRT, item: 'dirt' }, ctx())).toBeNull();
  });
  it('regions by category; completing a category gives a one-time bonus', () => {
    const p = new Progression();
    const ev: DelveEvent = { type: 'discover', region: { id: 3, name: '某處', cat: 'site', kind: 'cabin' } };
    expect(xpForEvent(p, ev, ctx())!.amount).toBe(REGION_XP.site);
    const done = ctx({ catStats: () => [{ cat: 'site', found: 4, total: 4 }] });
    const r = xpForEvent(p, ev, done)!;
    expect(r.amount).toBeGreaterThan(REGION_XP.site);
    expect(xpForEvent(p, ev, done)!.amount).toBe(REGION_XP.site);
  });
  it('chests: first open only, never player-placed ones', () => {
    const p = new Progression();
    const open: DelveEvent = { type: 'chest', open: true, x: 4, y: 4 };
    expect(xpForEvent(p, open, ctx())!.amount).toBe(chestXp(0));
    expect(xpForEvent(p, open, ctx())).toBeNull();
    xpForEvent(p, { type: 'place', x: 9, y: 9, tile: T.CHEST, item: 'chest' }, ctx());
    expect(xpForEvent(p, { type: 'chest', open: true, x: 9, y: 9 }, ctx())).toBeNull();
  });
  it('crafting: first time per recipe only', () => {
    const p = new Progression();
    const c: DelveEvent = { type: 'craft', recipe: 'torch', item: 'torch', n: 3 };
    expect(xpForEvent(p, c, ctx())!.amount).toBe(recipeXp('workbench'));
    expect(xpForEvent(p, c, ctx())).toBeNull();
  });
  it('lore / treasure / codex: only first-time events carry XP', () => {
    const p = new Progression();
    expect(xpForEvent(p, { type: 'lore', id: 1, x: 0, y: 0, first: true }, ctx())!.amount).toBeGreaterThan(0);
    expect(xpForEvent(p, { type: 'lore', id: 1, x: 0, y: 0, first: false }, ctx())).toBeNull();
    expect(xpForEvent(p, { type: 'treasure', item: 'magnet' }, ctx())!.amount).toBeGreaterThan(0);
    const normal = xpForEvent(p, { type: 'codex', affix: 'keen' }, ctx())!.amount;
    const unique = xpForEvent(p, { type: 'codex', affix: 'stormcall' }, ctx())!.amount;
    expect(unique).toBeGreaterThan(normal);
  });
  it('fishing: first catch of a species is worth more; repeat catches are capped per day', () => {
    const p = new Progression();
    const fish = (item: 'silver_minnow' | 'soggy_boot'): DelveEvent => ({ type: 'fish', phase: 'catch', x: 0, y: 0, item });
    expect(xpForEvent(p, fish('silver_minnow'), ctx({ fishCount: () => 1 }))!.amount).toBeGreaterThan(10);
    let sum = 0;
    for (let k = 0; k < 100; k++) sum += xpForEvent(p, fish('silver_minnow'), ctx({ fishCount: () => 5 }))?.amount ?? 0;
    expect(sum).toBeLessThanOrEqual(DAILY_CAP.fish);
  });
  it('xp / levelup / unrelated events give nothing', () => {
    const p = new Progression();
    expect(xpForEvent(p, { type: 'select', slot: 1 }, ctx())).toBeNull();
  });
});

describe('Progression save round-trip', () => {
  it('toJSON → load keeps everything', () => {
    const p = new Progression();
    p.gain(xpAtLevel(9) + 37);
    p.learn('b_vigor'); p.learn('b_vigor'); p.learn('p_stride');
    xpForEvent(p, kill('gel_blob'), ctx({ day: 2 }));
    xpForEvent(p, { type: 'place', x: 2, y: 5, tile: T.IRON_ORE, item: 'iron_ore' }, ctx({ day: 2 }));
    xpForEvent(p, { type: 'chest', open: true, x: 4, y: 4 }, ctx({ day: 2 }));
    xpForEvent(p, { type: 'craft', recipe: 'torch', item: 'torch', n: 3 }, ctx({ day: 2 }));
    p.respecs = 2;
    const j = JSON.parse(JSON.stringify(p.toJSON()));
    const q = new Progression();
    q.load(j);
    expect(q.toJSON()).toEqual(p.toJSON());
    expect(q.level).toBe(9);
    expect(q.rank('b_vigor')).toBe(2);
  });
  it('bad data is normalized: unknown skills dropped, over-spent trees reset, negative xp clamped', () => {
    const q = new Progression();
    q.load({ xp: -50, ranks: { nope: 3, b_vigor: 2 }, respecs: 'x' });
    expect(q.xp).toBe(0);
    expect(q.spent).toBe(0); // level 1 = 0 點，點了 2 級 → 整棵樹重置
    const r = new Progression();
    r.load({ xp: xpAtLevel(10), ranks: { b_edge: 1 } }); // 沒有前置
    expect(r.spent).toBe(0);
    const s = new Progression();
    s.load(null);
    expect(s.xp).toBe(0);
  });
});
