// exec.test.ts — 指令匯流排 DelveGame.exec(pid, cmd) / act(cmd)（co-op M-B2 Task 2，計畫 B1 / B2 / B3 / B10）：
// act 與直接呼叫方法逐位元組等價；exec('b', …) 只動 B（背包、箱子、說話、技能、重生爐心）；place；沒有這個 pid 會拋。
import { describe, it, expect } from 'vitest';
import { DelveGame, type DelveEvent } from './game';
import { T, W } from './tiles';
import { BIOME, LIQ } from './world';
import { FIXED_DT } from './constants';
import { createCharacter } from '../save/character';
import { normalizeAppearance } from './appearance';
import { encodeSave, snapshotGame } from '../save/serialize';
import { buildHouse } from './houseFixture';
import type { ItemId } from './items';

const FLOOR = 60;

/** 平地小世界（同 actors.test.ts）：y ≥ 60 石頭、x 40..69 地表是泥土；本地玩家站在 (40, 59) */
function arena(): DelveGame {
  const g = new DelveGame({ seed: 'actors', width: 160, height: 100 });
  const w = g.world;
  g.liquids.setSprings([]);
  for (let y = 0; y < w.height; y++) for (let x = 0; x < w.width; x++) {
    w.setLiquid(x, y, 0, LIQ.NONE);
    w.setFg(x, y, y >= FLOOR ? T.STONE : T.AIR);
    w.setWall(x, y, W.NONE);
  }
  for (let x = 0; x < w.width; x++) { w.surface[x] = FLOOR; w.biome[x] = BIOME.FOREST; }
  for (let x = 40; x < 70; x++) w.setFg(x, FLOOR, T.DIRT);
  g.teleport(40, FLOOR - 1);
  g.setDate({ season: 1, day: 2, hour: 12 });
  g.peaceful = true;
  g.drainEvents();
  return g;
}

const hero = () => createCharacter('乙', normalizeAppearance(undefined), 0);
function steps(g: DelveGame, n: number): void { for (let i = 0; i < n; i++) g.step(FIXED_DT); }
const slotOf = (g: DelveGame, item: ItemId): number => g.inventory.slots.findIndex((s) => s?.item === item);

describe('act 和直接呼叫等價', () => {
  /** 同一段腳本：direct = 直接呼叫既有方法，否則透過 act。回傳每一步的回傳值 */
  function script(g: DelveGame, direct: boolean): unknown[] {
    const out: unknown[] = [];
    const run = (fn: () => unknown): void => { out.push(fn()); steps(g, 30); };
    g.give('wood', 3);
    run(() => (direct ? g.craft('planks') : g.act({ op: 'craft', recipe: 'planks' })));
    run(() => (direct ? g.inventory.swap(0, 5) : g.act({ op: 'swap', a: 0, b: 5 })));
    g.giveGear('iron_chestplate', 1);
    const ci = slotOf(g, 'iron_chestplate');
    run(() => (direct ? g.equipFromInventory(ci) : g.act({ op: 'equip', slot: ci })));
    run(() => (direct ? g.unequip('body') : g.act({ op: 'unequip', slot: 'body' })));
    const li = slotOf(g, 'iron_chestplate');
    run(() => (direct ? g.toggleLock(li) : g.act({ op: 'lock', at: li })));
    g.world.setFg(42, FLOOR - 1, T.CHEST);
    g.world.chests.get(g.world.idx(42, FLOOR - 1))![2] = { item: 'gold_ore', count: 5 };
    run(() => g.interact(42, FLOOR - 1));
    const pi = slotOf(g, 'planks');
    run(() => (direct ? g.depositToChest(pi) : g.act({ op: 'chestDeposit', slot: pi })));
    run(() => (direct ? g.takeAllFromChest() : g.act({ op: 'chestTakeAll' })));
    run(() => (direct ? g.closeChest() : g.act({ op: 'chestClose' })));
    g.addXp(2200);
    run(() => (direct ? g.learnSkill('b_vigor') : g.act({ op: 'learnSkill', id: 'b_vigor' })));
    return out;
  }
  it('快照位元組、事件、回傳值都相同', () => {
    const a = arena(), b = arena();
    const ra = script(a, true), rb = script(b, false);
    expect(rb).toEqual(ra);
    // 腳本真的有做事（不是兩邊都失敗）
    expect(ra[0]).toEqual({ ok: true });
    expect(ra[2]).toBe(true);
    expect(ra[4]).toBe(true);
    expect(ra[7]).toBeGreaterThan(0);
    expect(ra[9]).toBeNull();
    expect(encodeSave(snapshotGame(b, 0))).toEqual(encodeSave(snapshotGame(a, 0)));
    expect(JSON.stringify(b.drainAll())).toBe(JSON.stringify(a.drainAll()));
  });
});

describe('exec(pid, cmd)', () => {
  it("exec('b') 用 B 的背包", () => {
    const g = arena();
    const b = g.addActor('b', hero(), { x: 50, y: FLOOR - 1 });
    g.drainEvents('h'); g.drainEvents('b');
    g.withActor(b, () => g.give('wood', 3));
    const localWood = g.local.inventory.count('wood');
    expect(g.exec('b', { op: 'craft', recipe: 'planks' })).toEqual({ ok: true });
    expect(b.inventory.count('planks')).toBe(4);
    expect(b.inventory.count('wood')).toBe(2);
    expect(g.local.inventory.count('planks')).toBe(0);
    expect(g.local.inventory.count('wood')).toBe(localWood);
    const isCraft = (e: DelveEvent) => e.type === 'craft';
    expect(g.drainEvents('b').filter(isCraft)).toEqual([expect.objectContaining({ type: 'craft', recipe: 'planks', pid: 'b' })]);
    expect(g.drainEvents('h').filter(isCraft)).toEqual([]);
    expect(g.cur).toBe(g.local);
  });

  it("exec('b') 的箱子", () => {
    const g = arena();
    const b = g.addActor('b', hero(), { x: 50, y: FLOOR - 1 });
    g.world.setFg(52, FLOOR - 1, T.CHEST);
    expect(g.withActor(b, () => g.interact(52, FLOOR - 1))).toBe(true);
    expect(b.openChest).toEqual({ x: 52, y: FLOOR - 1 });
    expect(g.local.openChest).toBeNull();
    b.inventory.slots[7] = { item: 'gold_ore', count: 6 };
    g.local.inventory.slots[7] = { item: 'gold_ore', count: 2 };
    expect(g.exec('b', { op: 'chestDeposit', slot: 7 })).toBe(true);
    expect(b.inventory.slots[7]).toBeNull();
    expect(g.local.inventory.slots[7]).toEqual({ item: 'gold_ore', count: 2 });
    expect(g.world.chests.get(g.world.idx(52, FLOOR - 1))![0]).toEqual({ item: 'gold_ore', count: 6 });
    expect(g.local.openChest).toBeNull();
    g.exec('b', { op: 'chestClose' });
    expect(b.openChest).toBeNull();
    expect(g.drainEvents('b')).toContainEqual({ type: 'chest', open: false, x: 52, y: FLOOR - 1, pid: 'b' });
  });

  it('說話、技能、重生點不會落到本地', () => {
    const g = arena();
    const b = g.addActor('b', hero(), { x: 120, y: FLOOR - 1 });
    // 說話
    expect(g.withActor(b, () => g.debugEncounter('peddler', 2))).not.toBeNull();
    g.drainEvents('h'); g.drainEvents('b');
    expect(g.exec('b', { op: 'talk' })).toBe(true);
    expect(g.drainEvents('b')).toContainEqual(expect.objectContaining({ type: 'folktalk', pid: 'b' }));
    expect(g.talkNearest()).toBe(false);
    // 技能
    g.withActor(b, () => g.addXp(2200));
    expect(g.exec('b', { op: 'learnSkill', id: 'b_vigor' })).toBeNull();
    expect(g.exec('b', { op: 'learnSkill', id: 'b_dash' })).toBeNull();
    expect(g.exec('b', { op: 'skill', skill: 'dash' })).toBe(true);
    expect(b.skillCd.dash).toBeGreaterThan(0);
    expect(g.local.skillCd.dash).toBe(0);
    // 重生爐心（B10）：B 旁邊蓋房子、放爐心
    buildHouse(g.world, 110, FLOOR - 6, 8, 5);
    const localCore = g.local.spawnCore;
    const placed = g.withActor(b, () => {
      g.give('hearth', 1);
      const i = slotOf(g, 'hearth');
      g.inventory.swap(i, 0);
      g.input('b').selected = 0;
      return g.tryPlace(120, FLOOR - 1);
    });
    expect(placed).toBe(true);
    const id = g.settle.cores[0].id;
    expect(g.exec('b', { op: 'spawnCore', id })).toBe(true);
    expect(g.actors.get('b')!.spawnCore).toBe(id);
    expect(g.local.spawnCore).toBe(localCore);
    expect(g.settle.spawnCore).toBe(localCore);
    // settle.spawnCore 跟著 cur（B10）：切到 B 讀到的是 B 的
    expect(g.withActor(b, () => g.settle.spawnCore)).toBe(id);
  });

  it('place：選格、放置；超出觸及範圍 → false + blocked reach', () => {
    const g = arena();
    const b = g.addActor('b', hero(), { x: 50, y: FLOOR - 1 });
    b.inventory.slots[1] = { item: 'dirt', count: 10 };
    g.drainEvents('b');
    expect(g.exec('b', { op: 'place', x: 52, y: FLOOR - 1, slot: 1 })).toBe(true);
    expect(g.world.getFg(52, FLOOR - 1)).toBe(T.DIRT);
    expect(b.inventory.slots[1]).toEqual({ item: 'dirt', count: 9 });
    expect(b.inventory.selected).toBe(1);
    expect(g.local.inventory.selected).toBe(0);
    steps(g, 8);
    expect(g.exec('b', { op: 'place', x: 70, y: FLOOR - 1, slot: 1 })).toBe(false);
    expect(g.world.getFg(70, FLOOR - 1)).toBe(T.AIR);
    expect(g.drainEvents('b')).toContainEqual(expect.objectContaining({ type: 'blocked', reason: 'reach' }));
  });

  it('place 守門：冷卻、死亡、划船都回 false', () => {
    const g = arena();
    const b = g.addActor('b', hero(), { x: 50, y: FLOOR - 1 });
    b.inventory.slots[1] = { item: 'dirt', count: 10 };
    expect(g.exec('b', { op: 'place', x: 52, y: FLOOR - 1, slot: 1 })).toBe(true);
    expect(g.exec('b', { op: 'place', x: 53, y: FLOOR - 1, slot: 1 })).toBe(false);
    expect(b.inventory.slots[1]).toEqual({ item: 'dirt', count: 9 });
    steps(g, 8);
    expect(g.exec('b', { op: 'place', x: 53, y: FLOOR - 1, slot: 1 })).toBe(true);
    steps(g, 8);
    g.withActor(b, () => { g.boating = true; });
    expect(g.exec('b', { op: 'place', x: 54, y: FLOOR - 1, slot: 1 })).toBe(false);
    g.withActor(b, () => { g.boating = false; });
    // hp = 0 不會自己判死（死亡走 applyDamage → die）：用致命傷害讓 B 真的倒下
    g.withActor(b, () => { g.hurtPlayer(99999, 0); });
    expect(b.dead).toBe(true);
    steps(g, 1);
    expect(g.exec('b', { op: 'place', x: 54, y: FLOOR - 1, slot: 1 })).toBe(false);
    expect(g.world.getFg(54, FLOOR - 1)).toBe(T.AIR);
  });

  it('toss 分派到 tossSlot（細節見 toss.test.ts）', () => {
    const g = arena();
    g.inventory.slots[0] = { item: 'dirt', count: 4 };
    expect(g.act({ op: 'toss', slot: 0, n: 5 })).toBe(false);
    expect(g.act({ op: 'toss', slot: 0, n: 1 })).toBe(true);
    expect(g.inventory.slots[0]).toEqual({ item: 'dirt', count: 3 });
  });

  it('沒有這個 pid 會拋', () => {
    const g = arena();
    expect(() => g.exec('zz', { op: 'respec' })).toThrow(/no actor/);
  });
});
