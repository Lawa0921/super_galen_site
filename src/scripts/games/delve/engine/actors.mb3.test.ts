// actors.mb3.test.ts — co-op M-B3 Task 2：M-B1 遺留（localPid / mode 選項、visit 進出、沒人在等了的睡覺通知、
// 天氣錨點、公開的委託進度、挖掉別人的床、每人每天一次的藥師祝福）。
import { describe, it, expect } from 'vitest';
import { DelveGame, type DelveEvent } from './game';
import { T, W } from './tiles';
import { BIOME, LIQ } from './world';
import { DAY_LENGTH, FIXED_DT, TILE_SIZE } from './constants';
import { createCharacter } from '../save/character';
import { snapshotGame } from '../save/serialize';
import { splitSnapshot } from '../save/worldSave';
import { normalizeAppearance } from './appearance';

const FLOOR = 60;

/** 平地小世界（同 actors.test.ts）：y ≥ 60 石頭；本地玩家站在 (40, 59)；白天、和平 */
function arena(): DelveGame {
  const g = new DelveGame({ seed: 'mb3', width: 160, height: 100 });
  const w = g.world;
  g.liquids.setSprings([]);
  for (let y = 0; y < w.height; y++) for (let x = 0; x < w.width; x++) {
    w.setLiquid(x, y, 0, LIQ.NONE);
    w.setFg(x, y, y >= FLOOR ? T.STONE : T.AIR);
    w.setWall(x, y, W.NONE);
  }
  for (let x = 0; x < w.width; x++) { w.surface[x] = FLOOR; w.biome[x] = BIOME.FOREST; }
  g.teleport(40, FLOOR - 1);
  g.setDate({ season: 1, day: 2, hour: 12 });
  g.peaceful = true;
  g.drainEvents();
  return g;
}

const hero = () => createCharacter('乙', normalizeAppearance(undefined), 0);
const steps = (g: DelveGame, n: number): void => { for (let i = 0; i < n; i++) g.step(FIXED_DT); };
const sleepWaits = (ev: DelveEvent[]) => ev.filter((e) => e.type === 'sleep' && e.phase === 'wait');

describe('localPid 與 mode 選項', () => {
  it('帶選項：本地玩家的 pid / mode 照給的；不給 = h / solo', () => {
    const g = new DelveGame({ seed: 'mb3', width: 160, height: 100, localPid: 'p1', mode: 'replica' });
    expect(g.localPid).toBe('p1');
    expect(g.local.pid).toBe('p1');
    expect(g.mode).toBe('replica');
    expect(g.actors.size).toBe(1);
    const d = new DelveGame({ seed: 'mb3', width: 160, height: 100 });
    expect(d.localPid).toBe('h');
    expect(d.local.pid).toBe('h');
    expect(d.mode).toBe('solo');
    d.mode = 'host';
    expect(d.mode).toBe('host');
  });
});

describe('characterOf / visitOf', () => {
  it('characterOf / visitOf 等於舊路徑（splitSnapshot(snapshotGame)，savedAt / lastSeen 除外）', () => {
    const g = arena();
    const b = g.addActor('b', hero(), { x: 60, y: FLOOR - 1 });
    g.withActor(b, () => { g.give('wood', 12); g.giveGear('iron_sword', 2); g.addXp(500); });
    b.markers.push({ x: 50, y: 50 });
    const who = b.who!;
    const ref = g.withActor(b, () => splitSnapshot(snapshotGame(g, 0), who, { worldId: 'x', worldName: 'x', visits: {} }, 0));
    const { savedAt: _s, ...ch } = g.characterOf('b', 0);
    const { savedAt: _r, ...refCh } = ref.character;
    expect(ch).toEqual(refCh);
    const { lastSeen: _l, ...visit } = g.visitOf('b', 0);
    const { lastSeen: _m, ...refVisit } = ref.world.header.visits[who.id];
    expect(visit).toEqual(refVisit);
    // 本地玩家也一樣（cur 不變）
    expect(g.cur).toBe(g.local);
    const refLocal = splitSnapshot(snapshotGame(g, 0), { id: 'x', nick: 'x', createdAt: 0, rev: 0 }, { worldId: 'x', worldName: 'x', visits: {} }, 0);
    expect({ ...g.characterOf('h', 0), savedAt: 0, id: 'x', nick: 'x' }).toEqual(refLocal.character);
  });

  it('死亡中：同舊路徑，存成重生後的狀態（滿血、在重生點）', () => {
    const g = arena();
    const b = g.addActor('b', hero(), { x: 60, y: FLOOR - 1 });
    g.withActor(b, () => g.hurtPlayer(99999, 0));
    expect(b.dead).toBe(true);
    const who = b.who!;
    const ref = g.withActor(b, () => splitSnapshot(snapshotGame(g, 0), who, { worldId: 'x', worldName: 'x', visits: {} }, 0));
    expect(g.characterOf('b', 0)).toEqual(ref.character);
    expect(g.visitOf('b', 0)).toEqual(ref.world.header.visits[who.id]);
  });
});

describe('removeActor 回傳 visit、addActor 吃回去', () => {
  it('位置 / 床 / 標記 / 迷霧原樣回來', () => {
    const g = arena();
    const w = g.world;
    w.setFg(62, FLOOR - 1, T.BED_HEAD); w.setFg(63, FLOOR - 1, T.BED_FOOT);
    const b = g.addActor('b', hero(), { x: 60, y: FLOOR - 1 });
    g.withActor(b, () => g.interact(62, FLOOR - 1)); // 白天也記床
    expect(b.bed).toEqual({ x: 62, y: FLOOR - 1 });
    b.markers.push({ x: 55, y: 50 });
    steps(g, 5);
    const px = { x: b.player.x, y: b.player.y };
    const { character, visit } = g.removeActor('b');
    expect(g.actors.has('b')).toBe(false);
    expect(visit.pos.x).toBe(px.x);
    expect(visit.pos.y).toBe(px.y);
    expect(visit.bed).toEqual({ x: 62, y: FLOOR - 1 });
    const b2 = g.addActor('b', character, null, visit);
    expect(b2.player.x).toBe(px.x);
    expect(b2.player.y).toBe(px.y);
    expect(b2.bed).toEqual({ x: 62, y: FLOOR - 1 });
    expect(b2.markers).toEqual([{ x: 55, y: 50 }]);
    expect(b2.explored.has(60, FLOOR - 1)).toBe(true);
    expect(b2.explored.has(150, 5)).toBe(false);
  });

  it('床頭已經不在 → 不留床', () => {
    const g = arena();
    const w = g.world;
    w.setFg(62, FLOOR - 1, T.BED_HEAD); w.setFg(63, FLOOR - 1, T.BED_FOOT);
    const b = g.addActor('b', hero(), { x: 60, y: FLOOR - 1 });
    g.withActor(b, () => g.interact(62, FLOOR - 1));
    const { character, visit } = g.removeActor('b');
    w.setFg(62, FLOOR - 1, T.AIR); w.setFg(63, FLOOR - 1, T.AIR);
    expect(g.addActor('b', character, null, visit).bed).toBeNull();
  });
});

describe('睡覺：沒人在等了也通知', () => {
  const FL = 60;
  function room(): DelveGame {
    const g = new DelveGame({ seed: 'sleep', width: 160, height: 100 });
    const w = g.world;
    g.liquids.setSprings([]);
    for (let y = 0; y < w.height; y++) for (let x = 0; x < w.width; x++) {
      w.setLiquid(x, y, 0, LIQ.NONE);
      w.setFg(x, y, y >= FL ? T.STONE : T.AIR);
      w.setWall(x, y, W.NONE);
    }
    for (let x = 0; x < w.width; x++) { w.surface[x] = FL; w.biome[x] = BIOME.FOREST; }
    w.setFg(42, FL - 1, T.BED_HEAD); w.setFg(43, FL - 1, T.BED_FOOT);
    g.teleport(41, FL - 1);
    g.peaceful = true;
    g.addActor('b', hero(), { x: 49, y: FL - 1 });
    g.setDate({ season: 1, day: 2, hour: 22 });
    g.step(FIXED_DT);
    g.drainEvents(); g.drainEvents('b');
    return g;
  }

  it('A 上床又起來 → B 收到 ready 0 / total 2', () => {
    const g = room();
    g.interact(42, FL - 1);
    expect(g.sleepWaiting()).toEqual({ ready: 1, total: 2 });
    steps(g, 2);
    expect(sleepWaits(g.drainEvents('b'))).toEqual([expect.objectContaining({ ready: 1, total: 2 })]);
    g.setMoveX(1);
    steps(g, 2);
    expect(sleepWaits(g.drainEvents('b'))).toEqual([expect.objectContaining({ type: 'sleep', phase: 'wait', ready: 0, total: 2 })]);
    expect(g.sleepWaiting()).toBeNull();
    // 之後不再重複通知
    steps(g, 30);
    expect(sleepWaits(g.drainEvents('b'))).toEqual([]);
  });

  it('單機：夜晚上床、睡到起來，沒有任何 wait 事件', () => {
    const g = new DelveGame({ seed: 'solo-sleep', width: 160, height: 100 });
    g.peaceful = true;
    const f = g.feetTile();
    g.world.setFg(f.x + 1, f.y, T.BED_HEAD); g.world.setFg(f.x + 2, f.y, T.BED_FOOT);
    g.setDate({ season: 1, day: 2, hour: 22 });
    g.drainEvents();
    g.interact(f.x + 1, f.y);
    expect(g.sleeping).toBe(true);
    steps(g, 60 * 10);
    expect(g.sleeping).toBe(false);
    expect(sleepWaits(g.drainEvents())).toEqual([]);
  });
});

describe('天氣錨點', () => {
  const stormEvents = (g: DelveGame, n: number): number => {
    let c = 0;
    for (let i = 0; i < n; i += 60) { steps(g, 60); c += g.drainEvents().filter((e) => e.type === 'lightning').length; }
    return c;
  };

  it('非單機：本地死了，第一個活著的 actor 當中心 → 還是會打雷', () => {
    const g = arena();
    g.mode = 'host';
    g.addActor('b', hero(), { x: 60, y: FLOOR - 1 });
    g.forceWeather('storm');
    g.withActor(g.local, () => g.hurtPlayer(99999, 0));
    g.local.respawnT = 999;
    expect(g.local.dead).toBe(true);
    expect(stormEvents(g, 1800)).toBeGreaterThan(0);
  });

  it('單機：本地死了沒有中心（現行行為）→ 不打雷', () => {
    const g = arena();
    g.forceWeather('storm');
    g.withActor(g.local, () => g.hurtPlayer(99999, 0));
    g.local.respawnT = 999;
    expect(g.local.dead).toBe(true);
    expect(stormEvents(g, 1800)).toBe(0);
  });

  it('單機活著：照常打雷', () => {
    const g = arena();
    g.forceWeather('storm');
    expect(stormEvents(g, 1800)).toBeGreaterThan(0);
  });
});

describe('委託進度是公開的', () => {
  it('accept 只給接的人；progress / ready 兩邊都有、沒有 pid', () => {
    const g = new DelveGame({ seed: 'alpha', peaceful: true });
    const key = 'v0:elder';
    const n = g.folk.byKey(key)!;
    g.teleport(Math.floor((n.body.x + n.body.w / 2) / TILE_SIZE) + 1, Math.floor((n.body.y + n.body.h - 1) / TILE_SIZE));
    g.addActor('b', hero(), g.feetTile());
    g.drainEvents(); g.drainEvents('b');
    const slay = g.questOffers(key).find((q) => q.kind === 'slay')!;
    expect(g.acceptQuest(key, slay.id)).toBe(true);
    const a = g.drainEvents('h'), b = g.drainEvents('b');
    expect(a.some((e) => e.type === 'quest' && e.phase === 'accept')).toBe(true);
    expect(b.some((e) => e.type === 'quest' && e.phase === 'accept')).toBe(false);
    const t = g.playerTile();
    const e = g.spawnEnemy(slay.enemy!, t.x + 3, t.y - 2);
    g.debugDamage(e.id, 9999);
    steps(g, 5);
    const isProg = (ev: DelveEvent) => ev.type === 'quest' && (ev.phase === 'progress' || ev.phase === 'ready');
    const ha = g.drainEvents('h').filter(isProg), hb = g.drainEvents('b').filter(isProg);
    expect(ha.length).toBeGreaterThan(0);
    expect(hb).toEqual(ha);
    for (const ev of ha) expect(ev.pid).toBeUndefined();
  });
});

describe('挖掉別人的床會通知他', () => {
  it('B 的床被 A 挖掉：B 清床並收到 spawn set:false，A 沒有這則', () => {
    const g = arena();
    const w = g.world;
    w.setFg(62, FLOOR - 1, T.BED_HEAD); w.setFg(63, FLOOR - 1, T.BED_FOOT);
    const b = g.addActor('b', hero(), { x: 60, y: FLOOR - 1 });
    g.withActor(b, () => g.interact(62, FLOOR - 1));
    expect(b.bed).not.toBeNull();
    g.drainEvents(); g.drainEvents('b');
    expect(g.mineInstant(62, FLOOR - 1)).toBe(true);
    expect(b.bed).toBeNull();
    expect(g.drainEvents('b')).toContainEqual(expect.objectContaining({ type: 'spawn', set: false, pid: 'b' }));
    expect(g.drainEvents('h').some((e) => e.type === 'spawn')).toBe(false);
  });
});

describe('藥師祝福每人每天一次', () => {
  it('本地讀寫 perkDays.healer、其他人用 healerDay', () => {
    const g = new DelveGame({ seed: 'alpha', peaceful: true });
    const t = g.playerTile();
    g.world.setFg(t.x + 2, t.y, T.HEARTH); g.settle.found(t.x + 2, t.y);
    g.debugMoveIn('healer', true);
    const h = g.settle.npc('healer')!;
    g.teleport(Math.floor(h.body.x / TILE_SIZE) + 1, Math.floor((h.body.y + h.body.h - 1) / TILE_SIZE));
    const b = g.addActor('b', hero(), g.feetTile());
    const bless = (a: typeof b) => g.withActor(a, () => g.buffOn('bless'));
    const clear = (a: typeof b) => g.withActor(a, () => { delete g.buffs.bless; });
    const talk = (a: typeof b) => g.withActor(a, () => g.residentTalk('healer'));
    const day = Math.floor(g.time / DAY_LENGTH);

    expect(b.healerDay).toBe(-1);
    talk(g.local);
    expect(bless(g.local)).toBe(true);
    expect(bless(b)).toBe(false);
    expect(g.perkDays.healer).toBe(day);
    // 同一天 B 說話 → B 也有
    talk(b);
    expect(bless(b)).toBe(true);
    expect(b.healerDay).toBe(day);
    // perkDays 只跟本地變
    expect(g.perkDays.healer).toBe(day);
    // 同一天再說 → 不重給
    clear(g.local); clear(b);
    talk(g.local); talk(b);
    expect(bless(g.local)).toBe(false);
    expect(bless(b)).toBe(false);
    // 隔天 A 再說 → 再給；B 還沒說所以 healerDay 不動
    g.time += DAY_LENGTH;
    talk(g.local);
    expect(bless(g.local)).toBe(true);
    expect(g.perkDays.healer).toBe(day + 1);
    expect(b.healerDay).toBe(day);
    expect(bless(b)).toBe(false);
    talk(b);
    expect(bless(b)).toBe(true);
    expect(b.healerDay).toBe(day + 1);
  });
});
