// actors.test.ts — 一個 DelveGame 裡的多個玩家角色（co-op M-B1 Task 2）：
// addActor / removeActor / withActor / input(pid) / 事件 pid 與 drainEvents(pid) / 各自的經驗 / 揮擊編號 / 在地天氣。
import { describe, it, expect } from 'vitest';
import { DelveGame, PRIVATE_EVENTS, type DelveEvent } from './game';
import { T, W } from './tiles';
import { BIOME, LIQ } from './world';
import { FIXED_DT, TILE_SIZE } from './constants';
import { SOLO_PID } from './actor';
import { createCharacter } from '../save/character';
import { normalizeAppearance } from './appearance';
import type { ItemId } from './items';

const FLOOR = 60;

/** 平地小世界：y ≥ 60 石頭、x 40..69 地表是泥土；本地玩家站在 (40, 59) */
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
const types = (ev: DelveEvent[]) => ev.map((e) => e.type);

describe('addActor / removeActor', () => {
  it('兩個 actor 的背包 / 血量各自獨立；新 actor 出生在重生點規則的位置', () => {
    const g = arena();
    const b = g.addActor('b', hero(), { x: 60, y: FLOOR - 1 });
    expect(g.actors.size).toBe(2);
    expect([...g.actors.keys()]).toEqual(['h', 'b']);
    expect(g.cur).toBe(g.local);
    expect(b.inventory).not.toBe(g.local.inventory);
    const before = g.local.inventory.count('torch');
    g.withActor(b, () => g.give('torch', 7));
    expect(g.local.inventory.count('torch')).toBe(before);
    expect(b.inventory.count('torch')).toBeGreaterThanOrEqual(7);
    b.hp = 33;
    expect(g.local.hp).not.toBe(33);
    expect(g.hp).toBe(g.local.hp);
    // 沒給位置 → respawnPoint（沒床、沒爐心 = 世界出生點）
    const c = g.addActor('c', hero());
    const sp = g.withActor(c, () => g.feetTile());
    expect(sp).toEqual({ x: g.spawn.x, y: g.spawn.y });
    expect(() => g.addActor('b', hero())).toThrow();
  });

  it('removeActor 回傳的角色含該 actor 的背包；不能移除本地 actor', () => {
    const g = arena();
    const b = g.addActor('b', hero(), { x: 60, y: FLOOR - 1 });
    g.withActor(b, () => g.give('gold_bar' as ItemId, 3));
    const ch = g.removeActor('b');
    expect(ch.inventory.slots.some((s) => s?.item === 'gold_bar' && s.count === 3)).toBe(true);
    expect(g.actors.has('b')).toBe(false);
    expect(g.actors.size).toBe(1);
    expect(() => g.removeActor(SOLO_PID)).toThrow();
  });
});

describe('withActor', () => {
  it('fn 丟例外後 cur 還原成 local', () => {
    const g = arena();
    const b = g.addActor('b', hero(), { x: 60, y: FLOOR - 1 });
    expect(() => g.withActor(b, () => { expect(g.cur).toBe(b); throw new Error('boom'); })).toThrow('boom');
    expect(g.cur).toBe(g.local);
    // 巢狀
    g.withActor(b, () => g.withActor(g.local, () => expect(g.cur).toBe(g.local)));
    expect(g.cur).toBe(g.local);
  });
});

describe('input(pid)', () => {
  it("input('b').moveX = 1 只讓 B 移動", () => {
    const g = arena();
    const b = g.addActor('b', hero(), { x: 60, y: FLOOR - 1 });
    steps(g, 10);
    const ax = g.local.player.x, bx = b.player.x;
    g.input('b').moveX = 1;
    expect(g.input('b').moveX).toBe(1);
    steps(g, 30);
    expect(b.player.x).toBeGreaterThan(bx + 16);
    expect(g.local.player.x).toBe(ax);
  });

  it('setMoveX 等輸入 API 作用在本地 actor（即使在別人的 withActor 裡呼叫）', () => {
    const g = arena();
    const b = g.addActor('b', hero(), { x: 60, y: FLOOR - 1 });
    g.withActor(b, () => { g.setMoveX(-1); g.setJump(true); g.setAim(45, FLOOR); g.setMining(true); g.setUse(true); });
    expect(g.local.moveX).toBe(-1);
    expect(g.local.jump).toBe(true);
    expect(g.local.aim).toEqual({ x: 45, y: FLOOR });
    expect(g.local.miningHeld).toBe(true);
    expect(g.local.useHeld).toBe(true);
    expect(b.moveX).toBe(0);
    expect(b.miningHeld).toBe(false);
    expect(g.withActor(b, () => g.aimTile())).toEqual({ x: 45, y: FLOOR });
  });

  it('input(pid) 的 aim / mining / use / selected / jump / up / drop 寫到該 actor', () => {
    const g = arena();
    const b = g.addActor('b', hero(), { x: 60, y: FLOOR - 1 });
    const inp = g.input('b');
    inp.aim = { x: 61, y: FLOOR };
    inp.mining = true; inp.use = true; inp.jump = true; inp.up = true; inp.drop = true;
    inp.selected = 2;
    expect(b.aim).toEqual({ x: 61, y: FLOOR });
    expect(inp.aim).toEqual({ x: 61, y: FLOOR });
    expect([b.miningHeld, b.useHeld, b.jump, b.upHeld, b.dropHeld]).toEqual([true, true, true, true, true]);
    expect(b.inventory.selected).toBe(2);
    expect(inp.selected).toBe(2);
    expect(g.local.inventory.selected).toBe(0);
    // select 是私人事件：只給 b
    expect(types(g.drainEvents('h'))).not.toContain('select');
    expect(types(g.drainEvents('b'))).toContain('select');
    expect(() => g.input('zz')).toThrow();
  });
});

describe('事件 pid', () => {
  it('A 挖東西：mine 兩邊都有，pickup 只出現在 drainEvents(h)', () => {
    const g = arena();
    g.addActor('b', hero(), { x: 66, y: FLOOR - 1 });
    const pick = g.local.inventory.slots.findIndex((s) => s?.item === 'wood_pickaxe');
    g.selectSlot(pick);
    g.setAim(41, FLOOR);
    g.setMining(true);
    let gotH: DelveEvent[] = [], gotB: DelveEvent[] = [];
    for (let i = 0; i < 120; i++) {
      g.step(FIXED_DT);
      gotH = gotH.concat(g.drainEvents('h'));
      gotB = gotB.concat(g.drainEvents('b'));
    }
    const mineH = gotH.filter((e) => e.type === 'mine');
    expect(mineH.length).toBeGreaterThan(0);
    expect(mineH[0].pid).toBe('h');
    expect(gotB.filter((e) => e.type === 'mine').length).toBe(mineH.length);
    const pickH = gotH.filter((e) => e.type === 'pickup');
    expect(pickH.length).toBeGreaterThan(0);
    expect(pickH.every((e) => e.pid === 'h')).toBe(true);
    expect(types(gotB)).not.toContain('pickup');
    expect(types(gotB)).not.toContain('select');
  });

  it('drainEvents 各 pid 各取各的、不互相吃掉；drainAll 拿全部', () => {
    const g = arena();
    const b = g.addActor('b', hero(), { x: 66, y: FLOOR - 1 });
    g.withActor(b, () => g.giveBuff('bless'));
    g.giveBuff('ward');
    const all = g.drainAll();
    // step 外的 UI / API 呼叫：cur = 本地 → 帶本地 pid（不是公開事件）
    expect(all.map((e) => [e.type, e.pid])).toEqual([['buff', 'b'], ['buff', 'h']]);
    expect(g.drainEvents('h')).toEqual([]);
    expect(g.drainEvents('b')).toEqual([]);
    g.withActor(b, () => g.giveBuff('bless'));
    g.withActor(g.local, () => g.giveBuff('ward'));
    expect(g.drainEvents('b').map((e) => e.pid)).toEqual(['b']);
    expect(g.drainEvents('h').map((e) => e.pid)).toEqual(['h']);
    expect(g.drainEvents('b')).toEqual([]);
  });

  it('本地 UI 呼叫（合成 / 技能樹 / 給 buff）推的私人事件只給本地，不會出現在 drainEvents(b)', () => {
    const g = arena();
    g.addActor('b', hero(), { x: 66, y: FLOOR - 1 });
    g.drainAll();
    g.give('planks', 10);
    expect(g.craft('workbench').ok).toBe(true);
    g.addXp(2200);
    expect(g.learnSkill('b_vigor')).toBeNull();
    g.giveBuff('bless');
    const evH = g.drainEvents('h'), evB = g.drainEvents('b');
    for (const t of ['craft', 'xp', 'levelup', 'learn', 'buff'] as const) {
      expect(types(evH)).toContain(t);
      expect(types(evB)).not.toContain(t);
    }
    expect(evH.filter((e) => PRIVATE_EVENTS.has(e.type)).every((e) => e.pid === 'h')).toBe(true);
  });

  it('removeActor 之後只剩一人：佇列裡 b 的私人事件不會漏給 h', () => {
    const g = arena();
    const b = g.addActor('b', hero(), { x: 66, y: FLOOR - 1 });
    g.drainEvents('h');
    g.withActor(b, () => g.giveBuff('bless'));
    g.removeActor('b');
    expect(g.actors.size).toBe(1);
    expect(g.drainEvents('h').filter((e) => e.type === 'buff')).toEqual([]);
  });

  it('drainEvents(不存在的 pid) → []、不記游標（不會擋住佇列清空）', () => {
    const g = arena();
    g.giveBuff('bless');
    expect(g.drainEvents('zz')).toEqual([]);
    expect(types(g.drainEvents())).toContain('buff');
    g.giveBuff('ward');
    expect(types(g.drainEvents('zz'))).toEqual([]);
    expect(types(g.drainEvents())).toEqual(['buff']);
  });

  it('world 段（actor 迴圈外）推的事件沒有 pid，即使 cur 剛好是 local', () => {
    const g = arena();
    g.addActor('b', hero(), { x: 66, y: FLOOR - 1 });
    g.drainAll();
    g.forceWeather('storm');
    // 液體反應是世界前段推的
    g.world.setLiquid(30, FLOOR - 1, 255, LIQ.WATER);
    g.world.setLiquid(31, FLOOR - 1, 255, LIQ.LAVA);
    g.liquids.wake(30, FLOOR - 1);
    steps(g, 30);
    const liq = g.drainAll().filter((e) => e.type === 'liquid');
    expect(liq.length).toBeGreaterThan(0);
    expect(liq.every((e) => e.pid === undefined)).toBe(true);
  });

  it('單機：事件不帶 pid（和多 actor 之前完全一樣）', () => {
    const g = arena();
    g.giveBuff('bless');
    g.selectSlot(3);
    steps(g, 5);
    const ev = g.drainEvents();
    expect(ev.length).toBeGreaterThan(0);
    expect(ev.every((e) => !('pid' in e))).toBe(true);
  });

  it('PRIVATE_EVENTS 含 pickup / blocked / select / xp / levelup / hurt / chest；mine / kill / hit 是公開的', () => {
    for (const t of ['pickup', 'blocked', 'select', 'xp', 'levelup', 'hurt', 'talk', 'trade', 'quest', 'bubble', 'craft', 'chest', 'mirror', 'rebirth'] as const) {
      expect(PRIVATE_EVENTS.has(t)).toBe(true);
    }
    for (const t of ['mine', 'place', 'kill', 'hit', 'boss', 'liquid', 'lightning', 'sleep', 'door'] as const) expect(PRIVATE_EVENTS.has(t)).toBe(false);
  });
});

describe('經驗記給事件的 pid', () => {
  it('B 挖礦的經驗記給 B，A 不變', () => {
    const g = arena();
    const b = g.addActor('b', hero(), { x: 66, y: FLOOR - 1 });
    g.drainAll();
    const ax = g.local.levels.xp, bx0 = b.levels.xp;
    g.world.setFg(67, FLOOR, T.COPPER_ORE);
    g.withActor(b, () => g.mineInstant(67, FLOOR));
    const evB = g.drainEvents('b'), evH = g.drainEvents('h');
    expect(b.levels.xp).toBeGreaterThan(bx0);
    expect(g.local.levels.xp).toBe(ax);
    expect(evB.some((e) => e.type === 'xp' && e.pid === 'b')).toBe(true);
    expect(evH.some((e) => e.type === 'xp')).toBe(false);
    expect(evH.some((e) => e.type === 'mine')).toBe(true);
  });
});

describe('揮擊編號全域唯一', () => {
  it('A 和 B 同一刻揮劍打同一隻怪：兩下都算', () => {
    const g = arena();
    g.peaceful = false;
    const b = g.addActor('b', hero(), { x: 44, y: FLOOR - 1 });
    g.teleport(42, FLOOR - 1);
    for (const who of [g.local, b]) g.withActor(who, () => { g.give('wood_sword'); const i = g.inventory.slots.findIndex((s) => s?.item === 'wood_sword'); g.inventory.select(i); });
    const e = g.spawnEnemy('gel_blob', 43, FLOOR - 1);
    e.hp = 999; e.maxHp = 999;
    g.drainAll();
    const px = e.body.x + e.body.w / 2, py = e.body.y + e.body.h / 2;
    g.setAimWorld(px, py); g.setMining(true);
    g.input('b').aim = { x: px / TILE_SIZE, y: py / TILE_SIZE }; g.input('b').mining = true;
    steps(g, 6);
    const hits = g.drainAll().filter((ev) => ev.type === 'hit' && ev.id === e.id);
    expect(hits.length).toBeGreaterThanOrEqual(2);
  });
});

describe('在地天氣依 actor', () => {
  it('A 在森林下雨、B 在雪原下雪（同一刻查詢不互相快取）', () => {
    const g = arena();
    for (let x = 100; x < 160; x++) g.world.biome[x] = BIOME.SNOW;
    const b = g.addActor('b', hero(), { x: 120, y: FLOOR - 1 });
    g.forceWeather('rain');
    expect(g.localWeatherState().kind).toBe('rain');
    expect(g.withActor(b, () => g.localWeatherState().kind)).toBe('snow');
    expect(g.localWeatherState().kind).toBe('rain');
    steps(g, 1);
    expect(g.withActor(b, () => g.localWeatherState().kind)).toBe('snow');
    expect(g.localWeatherState().kind).toBe('rain');
  });
});

describe('step：死亡 / 活著的 actor 各跑各的', () => {
  it('A 死了 B 照樣能移動；A 照常倒數重生', () => {
    const g = arena();
    const b = g.addActor('b', hero(), { x: 60, y: FLOOR - 1 });
    // A 的床就在地上（重生不會從世界出生點摔下來）
    g.world.setFg(46, FLOOR - 1, T.BED_HEAD); g.world.setFg(47, FLOOR - 1, T.BED_FOOT);
    g.bed = { x: 46, y: FLOOR - 1 };
    steps(g, 5);
    g.hurtPlayer(9999, 0);
    expect(g.local.dead).toBe(true);
    const bx = b.player.x;
    g.input('b').moveX = 1;
    steps(g, 30);
    expect(b.player.x).toBeGreaterThan(bx + 16);
    expect(b.dead).toBe(false);
    steps(g, 60 * 5);
    expect(g.local.dead).toBe(false);
    const ev = g.drainEvents('b');
    expect(ev.some((e) => e.type === 'respawn' && e.pid === 'h')).toBe(true);
  });

  it('B 受傷 / 死亡只動 B', () => {
    const g = arena();
    const b = g.addActor('b', hero(), { x: 60, y: FLOOR - 1 });
    const hpA = g.local.hp;
    g.withActor(b, () => g.hurtPlayer(9999, 0));
    expect(b.dead).toBe(true);
    expect(g.local.dead).toBe(false);
    expect(g.local.hp).toBe(hpA);
    const evH = g.drainEvents('h'), evB = g.drainEvents('b');
    expect(types(evH)).not.toContain('hurt');
    expect(types(evB)).toContain('hurt');
    expect(types(evH)).toContain('death');
  });
});
