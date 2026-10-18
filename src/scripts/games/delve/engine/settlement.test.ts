import { describe, expect, it } from 'vitest';
import { World } from './world';
import { T } from './tiles';
import { buildHouse, flatWorld } from './houseFixture';
import {
  ARRIVE_DELAY, CLAIM, LEVELS, Settlements, claimsOverlap, evaluate, levelFor, nextNeeds, perksFor, scoreOf, type SettleHost,
} from './settlement';
import { sunTimes } from './calendar';
import { TILE_SIZE as S } from './constants';

const GROUND = 30;
function world(): World {
  const w = new World(160, 50);
  flatWorld(w, GROUND);
  return w;
}
/** 房子 k：內部 8×5，左右並排（共用牆） */
function house(w: World, k: number, extra: [number, number, number][] = []): void {
  buildHouse(w, 10 + k * 9, 24, 8, 5, { extra });
}
function host(w: World, o: { night?: boolean; d?: number; px?: number; py?: number } = {}): SettleHost {
  return {
    world: w, time: 0,
    isNight: () => Boolean(o.night),
    sun: () => sunTimes(0),
    dayFrac: () => o.d ?? 0.5,
    playerTile: () => ({ x: o.px ?? 40, y: o.py ?? 28 }),
    playerOverlaps: () => false,
  };
}
/** 白天跑兩次搬入檢查：第一次排定「在路上」、第二次（等待設成 0）走進來 */
function arrive(s: Settlements, h: SettleHost): void {
  s.arriveDelay = 0;
  s.update(10, h);
  s.update(10, h);
}
function core(w: World, s: Settlements, x = 40): number {
  w.setFg(x, GROUND - 1, T.HEARTH);
  return s.found(x, GROUND - 1).id;
}

describe('settlement scoring', () => {
  it('no rooms → level 0, one valid room → level 1', () => {
    const w = world();
    const s = new Settlements();
    const id = core(w, s);
    expect(s.evaluation(id, w)!.level).toBe(0);
    house(w, 0);
    s.refresh(w, true);
    const ev = s.evaluation(id, w)!;
    expect(ev.metrics.rooms).toBe(1);
    expect(ev.level).toBe(1);
  });

  it('rooms outside the claim do not count', () => {
    const w = world();
    const s = new Settlements();
    const id = core(w, s, 10 + 4 + CLAIM.x + 12);
    house(w, 0);
    s.refresh(w, true);
    expect(s.evaluation(id, w)!.metrics.rooms).toBe(0);
  });

  it('score formula and level thresholds', () => {
    const m = { rooms: 2, comfort: 12, variety: 6, decor: 3, light: 4, safety: 2 };
    expect(scoreOf(m)).toBe(20 + 12 + 12 + 3 + 4 + 2);
    expect(levelFor({ ...m, score: scoreOf(m) })).toBe(2);
    expect(levelFor({ ...m, decor: 1, score: scoreOf(m) })).toBe(1);
    const lv3 = { rooms: 3, comfort: 30, variety: 10, decor: 6, light: 8, safety: 4 };
    expect(levelFor({ ...lv3, score: scoreOf(lv3) })).toBe(3);
  });

  it('two furnished rooms reach level 2, three decorated rooms reach level 3', () => {
    const w = world();
    const s = new Settlements();
    const id = core(w, s, 50);
    house(w, 0, [[5, 4, T.CHEST], [6, 2, T.PAINTING]]);
    house(w, 1, [[5, 4, T.BOOKSHELF], [6, 1, T.SHELF]]);
    s.refresh(w, true);
    let ev = s.evaluation(id, w)!;
    expect(ev.metrics.rooms).toBe(2);
    expect(ev.level).toBe(2);
    house(w, 2, [[5, 4, T.POTTED_PLANT], [6, 4, T.RUG], [2, 0, T.CHANDELIER], [6, 1, T.PAINTING]]);
    house(w, 3, [[5, 4, T.SOFA_L], [6, 4, T.SOFA_R], [1, 1, T.BANNER]]);
    s.refresh(w, true);
    ev = s.evaluation(id, w)!;
    expect(ev.metrics.variety).toBeGreaterThanOrEqual(10);
    expect(ev.level).toBe(3);
  });

  it('next-level checklist lists what is missing', () => {
    const m = { rooms: 1, comfort: 5, variety: 4, decor: 0, light: 1, safety: 0, score: 0 };
    m.score = scoreOf(m);
    const needs = nextNeeds(m, 1);
    expect(needs.map((n) => n.zh)).toEqual(['可入住的房間', '據點分數', '家具種類', '裝飾']);
    expect(needs.every((n) => !n.ok)).toBe(true);
    expect(nextNeeds(m, LEVELS.length)).toEqual([]);
  });

  it('perks unlock by level', () => {
    expect(perksFor(0)).toEqual([]);
    expect(perksFor(1)).toEqual(['spawn', 'calm']);
    expect(perksFor(2)).toEqual(['spawn', 'calm', 'ward', 'craft']);
    expect(perksFor(3)).toContain('waypoint');
  });

  it('claims cannot overlap', () => {
    const s = new Settlements();
    s.found(40, 20);
    expect(s.canFound(40 + CLAIM.x * 2, 20)).toBe('overlap');
    expect(s.canFound(40 + CLAIM.x * 2 + 1, 20)).toBe('ok');
    expect(claimsOverlap({ x: 0, y: 0 }, { x: 0, y: CLAIM.y * 2 + 1 })).toBe(false);
  });

  it('level-up emits an event', () => {
    const w = world();
    const s = new Settlements();
    const id = core(w, s);
    s.refresh(w, true);
    s.drainEvents();
    house(w, 0);
    s.refresh(w);
    expect(s.drainEvents()).toContainEqual(expect.objectContaining({ type: 'settlement', phase: 'level', id, level: 1 }));
  });
});

describe('settlers moving in', () => {
  it('merchant moves in during the day once there is a valid room', () => {
    const w = world();
    const s = new Settlements();
    core(w, s);
    arrive(s, host(w));
    expect(s.npcs.length).toBe(0);
    house(w, 0);
    arrive(s, host(w));
    expect(s.npcs.map((n) => n.kind)).toEqual(['merchant']);
    expect(s.npcs[0].bed).toEqual({ x: 13, y: 28 });
    expect(s.drainEvents()).toContainEqual(expect.objectContaining({ type: 'npc', phase: 'arrive', kind: 'merchant' }));
  });

  it('settlers announce themselves, arrive after a delay, and walk in from the claim edge (not on the bed)', () => {
    const w = world();
    const s = new Settlements();
    const c = core(w, s);
    house(w, 0);
    const at = (t: number): SettleHost => ({ ...host(w), time: t });
    s.update(10, at(0));
    expect(s.npcs.length).toBe(0);
    expect(s.pending?.kind).toBe('merchant');
    expect(s.drainEvents()).toContainEqual(expect.objectContaining({ type: 'npc', phase: 'coming', kind: 'merchant' }));
    s.update(10, at(30));
    expect(s.npcs.length).toBe(0); // 還在路上
    s.update(10, at(30 + ARRIVE_DELAY));
    expect(s.npcs.length).toBe(1);
    const ev = s.drainEvents().find((e) => e.type === 'npc' && e.phase === 'arrive')!;
    expect(ev).toBeDefined();
    const tx = Math.floor((ev.x + 10) / S);
    expect(Math.abs(tx - s.coreById(c)!.x)).toBeGreaterThan(CLAIM.x - 16);
    expect(s.npcs[0].state).not.toBe('sleep');
    // 存檔裡的「在路上」也會留著
    const s2 = new Settlements();
    s.pending = { kind: 'smith', core: s.cores[0].id, at: 123 };
    s2.load(JSON.parse(JSON.stringify(s.toJSON())), w);
    expect(s2.pending).toEqual({ kind: 'smith', core: s.cores[0].id, at: 123 });
  });

  it('a bed against the wall: the settler never stands inside the wall (moving in / waking up) and can lie down', () => {
    const w = world();
    const s = new Settlements();
    core(w, s);
    buildHouse(w, 10, 24, 8, 5, { bed: false, extra: [[6, 4, T.BED_HEAD], [7, 4, T.BED_FOOT]] });
    s.refresh(w, true);
    const n = s.moveIn('merchant', s.cores[0].id, w, true)!;
    const clear = (): boolean => {
      const b = n.body;
      for (let ty = Math.floor(b.y / S); ty <= Math.floor((b.y + b.h - 0.01) / S); ty++)
        for (let tx = Math.floor(b.x / S); tx <= Math.floor((b.x + b.w - 0.01) / S); tx++) if (w.isSolid(tx, ty)) return false;
      return true;
    };
    expect(clear()).toBe(true);
    for (let i = 0; i < 60 * 16; i++) s.update(1 / 60, host(w, { night: true, d: 0.95, px: 14 }));
    expect(n.state).toBe('sleep');
    for (let i = 0; i < 10; i++) s.update(1 / 60, host(w, { d: 0.5, px: 14 }));
    expect(n.state).not.toBe('sleep');
    expect(clear()).toBe(true);
  });

  it('nobody moves in at night', () => {
    const w = world();
    const s = new Settlements();
    core(w, s);
    house(w, 0);
    arrive(s, host(w, { night: true }));
    expect(s.npcs.length).toBe(0);
  });

  it('each settler needs their own room with a bed', () => {
    const w = world();
    const s = new Settlements();
    const id = core(w, s);
    house(w, 0, [[5, 4, T.ANVIL]]);
    arrive(s, host(w));
    expect(s.npcs.length).toBe(1);
    expect(s.canMoveIn('smith', id, w)).toEqual({ ok: false, why: '沒有空房間（要有床）' });
    house(w, 1);
    arrive(s, host(w));
    expect(s.npcs.map((n) => n.kind).sort()).toEqual(['merchant', 'smith']);
    expect(new Set(s.npcs.map((n) => n.home)).size).toBe(2);
  });

  it('special requirements: smith needs a furnace / anvil, cartographer needs Lv2 + a bookshelf', () => {
    const w = world();
    const s = new Settlements();
    const id = core(w, s, 50);
    house(w, 0); house(w, 1); house(w, 2);
    s.refresh(w, true);
    expect(s.canMoveIn('smith', id, w).why).toBe('據點裡有熔爐或鐵砧');
    expect(s.canMoveIn('cartographer', id, w).ok).toBe(false);
    expect(s.canMoveIn('merchant', id, w).ok).toBe(true);
  });

  it('a settler whose room breaks becomes homeless, and gets it back when fixed', () => {
    const w = world();
    const s = new Settlements();
    core(w, s);
    house(w, 0);
    arrive(s, host(w));
    const n = s.npcs[0];
    expect(n.home).not.toBeNull();
    w.setFg(13, 28, T.AIR); w.setFg(14, 28, T.AIR); // 拆床
    s.refresh(w);
    expect(n.home).toBeNull();
    expect(s.drainEvents()).toContainEqual(expect.objectContaining({ type: 'npc', phase: 'homeless', kind: 'merchant' }));
    expect(n.mood).toBeLessThan(30);
    w.setFg(13, 28, T.BED_HEAD); w.setFg(14, 28, T.BED_FOOT);
    s.refresh(w);
    expect(n.home).not.toBeNull();
  });

  it('removing the hearth disbands the settlement and settlers leave', () => {
    const w = world();
    const s = new Settlements();
    core(w, s);
    house(w, 0);
    arrive(s, host(w));
    s.drainEvents();
    s.remove(40, GROUND - 1);
    expect(s.cores).toEqual([]);
    expect(s.npcs).toEqual([]);
    const ev = s.drainEvents();
    expect(ev).toContainEqual(expect.objectContaining({ type: 'npc', phase: 'leave' }));
    expect(ev).toContainEqual(expect.objectContaining({ type: 'settlement', phase: 'lost' }));
  });
});

describe('settler schedule', () => {
  it('walks to bed and sleeps at night, gets up in the morning', () => {
    const w = world();
    const s = new Settlements();
    core(w, s);
    house(w, 0);
    arrive(s, host(w));
    const n = s.npcs[0];
    n.body.x = 16 * S; n.body.y = 29 * S - n.body.h; // 房間右邊
    for (let i = 0; i < 60 * 12; i++) s.update(1 / 60, host(w, { night: true, d: 0.95, px: 14 }));
    expect(n.state).toBe('sleep');
    expect(Math.floor(n.body.x / S)).toBe(13);
    for (let i = 0; i < 10; i++) s.update(1 / 60, host(w, { d: 0.5, px: 14 }));
    expect(n.state).not.toBe('sleep');
  });

  it('far away settlers are frozen but still end up in bed at night', () => {
    const w = world();
    const s = new Settlements();
    core(w, s);
    house(w, 0);
    arrive(s, host(w));
    const n = s.npcs[0];
    n.body.x = 16 * S; n.body.y = 29 * S - n.body.h;
    s.update(1 / 60, host(w, { night: true, d: 0.95, px: 159, py: 0 }));
    s.update(1 / 60, host(w, { night: true, d: 0.95, px: 159, py: 0 }));
    expect(n.state).toBe('sleep');
  });

  it('opens a closed door to walk out and closes it behind', () => {
    const w = world();
    const s = new Settlements();
    core(w, s, 50);
    house(w, 0);
    arrive(s, host(w, { px: 30 }));
    const n = s.npcs[0];
    n.room = null; n.home = null; // 讓他往外面的核心走（模擬上班）
    n.act = 'work';
    n.targetX = 4 * S; n.state = 'walk'; n.body.x = 11 * S; n.body.y = 29 * S - n.body.h;
    let opened = false;
    for (let i = 0; i < 60 * 6; i++) {
      n.act = 'work'; if (n.targetX === null) n.targetX = 4 * S;
      s.update(1 / 60, host(w, { px: 30 }));
      if (w.getFg(9, 28) === T.DOOR_OPEN) opened = true;
    }
    expect(opened).toBe(true);
    expect(n.body.x).toBeLessThan(9 * S);
    expect(w.getFg(9, 28)).toBe(T.DOOR_CLOSED);
  });
});

describe('settlement save', () => {
  it('round-trips cores, settlers and the spawn core', () => {
    const w = world();
    const s = new Settlements();
    const id = core(w, s);
    house(w, 0);
    arrive(s, host(w));
    s.spawnCore = id;
    s.npcs[0].talks = 3;
    const j = JSON.parse(JSON.stringify(s.toJSON()));
    const s2 = new Settlements();
    s2.load(j, w);
    expect(s2.cores).toEqual(s.cores);
    expect(s2.spawnCore).toBe(id);
    expect(s2.npcs.map((n) => [n.kind, n.home, n.talks])).toEqual([['merchant', s.npcs[0].home, 3]]);
    expect(s2.npcs[0].body.x).toBeCloseTo(s.npcs[0].body.x, 1);
    expect(JSON.stringify(s2.toJSON())).toBe(JSON.stringify(s.toJSON()).replace(/"nextId":\d+/, `"nextId":${s2.nextId}`));
  });

  it('drops broken entries instead of failing', () => {
    const w = world();
    const s = new Settlements();
    s.load({ cores: [{ id: 1, x: 5, y: 5 }, 'x'], npcs: [{ kind: 'nobody' }], spawnCore: 9 }, w);
    expect(s.cores).toEqual([]); // (5,5) 不是爐心
    expect(s.npcs).toEqual([]);
    expect(s.spawnCore).toBeNull();
    s.load(null, w);
    expect(s.cores).toEqual([]);
  });
});
