// net/snapshot.test.ts — 世界層級快照：往返、不送 chunk、visit 套本地、worldSig 的敏感度。
import { describe, expect, it } from 'vitest';
import { DelveGame } from '../engine/game';
import { T, W } from '../engine/tiles';
import { FIXED_DT } from '../engine/constants';
import { buildHouse } from '../engine/houseFixture';
import { applyWorldSnap, snapshotWorld, worldSig } from './snapshot';

const SMALL = { width: 200, height: 100 };
const GROUND = 60;

function arena(opts: { localPid?: string; mode?: 'solo' | 'host' | 'replica' } = {}): DelveGame {
  const g = new DelveGame({ seed: 'snap', ...SMALL, peaceful: true, ...opts });
  const w = g.world;
  g.liquids.setSprings([]);
  for (let y = 0; y < w.height; y++) for (let x = 0; x < w.width; x++) { w.setFg(x, y, y >= GROUND ? T.STONE : T.AIR); w.setWall(x, y, W.NONE); w.setLiquid(x, y, 0, 0); }
  g.teleport(60, GROUND - 1);
  g.setDate({ hour: 12 });
  for (let i = 0; i < 5; i++) g.step(FIXED_DT);
  g.drainEvents();
  return g;
}
function steps(g: DelveGame, n: number): void { for (let i = 0; i < n; i++) g.step(FIXED_DT); }
/** 據點：房子 + 爐心 */
function village(g: DelveGame): void {
  buildHouse(g.world, 50, GROUND - 6, 8, 5);
  g.give('hearth', 1);
  const i = g.inventory.slots.findIndex((s) => s?.item === 'hearth');
  g.inventory.swap(i, 0);
  g.selectSlot(0);
  expect(g.tryPlace(60, GROUND - 1)).toBe(true);
}
/** 等居民搬進來（白天，商人最先到） */
function withResident(g: DelveGame): void {
  village(g);
  g.settle.arriveDelay = 0;
  steps(g, 60 * 13);
  expect(g.settle.npc('merchant')).not.toBeNull();
}
function quest(id: string) {
  return { id, giver: 'guide', giverName: 'G', kind: 'slay' as const, title: 't', desc: 'd', n: 3, enemy: 'gel_blob' as const, reward: { xp: 1, coins: 1 } };
}

describe('snapshotWorld / applyWorldSnap', () => {
  it('往返：據點、委託、傳送碑、擊殺、鎖箱、天氣、時間都等於房主', () => {
    const host = arena({ mode: 'host' });
    withResident(host);
    expect(host.settle.cores.length).toBe(1);
    expect(host.settle.npc('merchant')!.home).not.toBeNull();
    expect(host.quests.accept(quest('q1') as never)).toBe(true);
    host.stonesUnlocked.add(1);
    host.kills = { gel_blob: 2 };
    host.world.unlocked.add(host.world.idx(70, GROUND - 1));
    host.world.keysUsed = 1;
    host.forceWeather('rain');
    const replica = arena({ localPid: 'p1', mode: 'replica' });
    applyWorldSnap(replica, snapshotWorld(host, null));
    expect(replica.settle.toJSON()).toEqual(host.settle.toJSON());
    // 居民的家保留房主的；副本不重新分配、不發事件（tile 還沒同步也一樣）
    expect(replica.settle.npc('merchant')!.home).toBe(host.settle.npc('merchant')!.home);
    expect(replica.quests.toJSON()).toEqual(host.quests.toJSON());
    expect([...replica.stonesUnlocked]).toEqual([...host.stonesUnlocked]);
    expect(replica.kills).toEqual(host.kills);
    expect([...replica.world.unlocked]).toEqual([...host.world.unlocked]);
    expect(replica.world.keysUsed).toBe(1);
    expect(replica.weather().kind).toBe('rain');
    expect(replica.time).toBe(host.time);
    expect(replica.tick).toBe(host.tick);
    steps(replica, 10);
    replica.settle.refresh(replica.world, true);
    expect(replica.settle.npc('merchant')!.home).toBe(host.settle.npc('merchant')!.home);
    expect(replica.settle.drainEvents()).toEqual([]);
  });

  it('居民與旅人的 id / key 與房主一致（ws 靠 id 配對）；存檔輸出不帶 id', () => {
    const host = arena({ mode: 'host' });
    withResident(host);
    const tr = host.debugEncounter('peddler', 5);
    expect(tr).not.toBeNull();
    const replica = arena({ localPid: 'p1', mode: 'replica' });
    applyWorldSnap(replica, snapshotWorld(host, null));
    expect(replica.settle.npc('merchant')!.id).toBe(host.settle.npc('merchant')!.id);
    expect(replica.settle.nextId).toBe(host.settle.nextId);
    const rt = replica.folk.byKey(tr!.key);
    expect(rt).not.toBeNull();
    expect(rt!.id).toBe(tr!.id);
    expect(host.settle.toJSON().npcs.every((n) => !('id' in n))).toBe(true);
    expect(host.folk.toJSON().travellers.every((n) => !('id' in n))).toBe(true);
    expect(host.folk.toJSON().travellers.length).toBeGreaterThan(0);
  });

  it('不送 chunk：改 200 格地形前後長度相同', () => {
    const host = arena({ mode: 'host' });
    const before = JSON.stringify(snapshotWorld(host, null)).length;
    for (let k = 0; k < 200; k++) host.world.setFg(10 + (k % 100), 20 + Math.floor(k / 100) * 20, T.STONE);
    expect(JSON.stringify(snapshotWorld(host, null)).length).toBe(before);
  });

  it('visit 套到本地：markers 與已揭露的格', () => {
    const host = arena({ mode: 'host' });
    const replica = arena({ localPid: 'p1', mode: 'replica' });
    const other = arena({ mode: 'host' });
    other.local.explored.revealDisc(60, 59, 3);
    other.local.markers.push({ x: 33, y: 44 });
    const v = other.visitOf(other.localPid);
    applyWorldSnap(replica, snapshotWorld(host, v));
    expect(replica.local.markers).toEqual([{ x: 33, y: 44 }]);
    expect(replica.local.explored.has(60, 59)).toBe(true);
  });

  it('visit 的床在客人副本信任房主（床的 chunk 還沒同步）', () => {
    const host = arena({ mode: 'host' });
    const replica = arena({ localPid: 'p1', mode: 'replica' });
    const v = host.visitOf(host.localPid);
    v.bed = { x: 70, y: GROUND - 1 };
    applyWorldSnap(replica, snapshotWorld(host, v));
    expect(replica.local.bed).toEqual({ x: 70, y: GROUND - 1 });
  });

  it('之後重送的 world（visit null）不把房主的 spawnCore 寫到客人本地 actor；客人自己的照舊（爐心還在）', () => {
    const host = arena({ mode: 'host' });
    village(host);
    const id = host.settle.cores[0].id;
    // 房主設了重生爐心、客人沒有
    host.settle.spawnCore = id;
    const replica = arena({ localPid: 'p1', mode: 'replica' });
    const v = host.visitOf(host.localPid);
    applyWorldSnap(replica, snapshotWorld(host, { ...v, spawnCore: null }));
    expect(replica.local.spawnCore).toBeNull();
    applyWorldSnap(replica, snapshotWorld(host, null));
    expect(replica.local.spawnCore).toBeNull();
    expect(replica.settle.spawnCore).toBeNull();
    // 反過來：客人設了、房主沒有
    host.settle.spawnCore = null;
    applyWorldSnap(replica, snapshotWorld(host, { ...v, spawnCore: id }));
    expect(replica.local.spawnCore).toBe(id);
    applyWorldSnap(replica, snapshotWorld(host, null));
    expect(replica.local.spawnCore).toBe(id);
    expect(replica.settle.spawnCore).toBe(id);
  });

  it('perkDays.healer 不套到客人', () => {
    const host = arena({ mode: 'host' });
    host.perkDays = { guide: 5, healer: 7 };
    const replica = arena({ localPid: 'p1', mode: 'replica' });
    applyWorldSnap(replica, snapshotWorld(host, null));
    expect(replica.perkDays.guide).toBe(5);
    expect(replica.perkDays.healer).not.toBe(7);
  });
});

describe('worldSig', () => {
  it('NPC 走動、time 不同 → 相同；接委託 → 不同', () => {
    const host = arena({ mode: 'host' });
    withResident(host);
    const a = snapshotWorld(host, null);
    const sig = worldSig(a);
    expect(worldSig({ ...a, time: a.time + 100, tick: a.tick + 9 })).toBe(sig);
    for (const n of host.settle.npcs) n.body.x += 40;
    steps(host, 120);
    expect(worldSig(snapshotWorld(host, null))).toBe(sig);
    host.quests.accept(quest('q2') as never);
    expect(worldSig(snapshotWorld(host, null))).not.toBe(sig);
  });
});
