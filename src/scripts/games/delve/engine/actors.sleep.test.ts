// actors.sleep.test.ts — 全員上床才睡（co-op M-B1 Task 4，B7）。
import { describe, it, expect } from 'vitest';
import { DelveGame, type DelveEvent } from './game';
import { T, W } from './tiles';
import { BIOME, LIQ } from './world';
import { FIXED_DT } from './constants';
import { createCharacter } from '../save/character';
import { normalizeAppearance } from './appearance';

const FLOOR = 60;
const hero = () => createCharacter('乙', normalizeAppearance(undefined), 0);

/** 平地；床 A 在 (42,59)、床 B 在 (50,59)；本地玩家站 (41,59)，第二人 'b' 站 (49,59)，晚上 */
function room(): { g: DelveGame; b: ReturnType<DelveGame['addActor']> } {
  const g = new DelveGame({ seed: 'sleep', width: 160, height: 100 });
  const w = g.world;
  g.liquids.setSprings([]);
  for (let y = 0; y < w.height; y++) for (let x = 0; x < w.width; x++) {
    w.setLiquid(x, y, 0, LIQ.NONE);
    w.setFg(x, y, y >= FLOOR ? T.STONE : T.AIR);
    w.setWall(x, y, W.NONE);
  }
  for (let x = 0; x < w.width; x++) { w.surface[x] = FLOOR; w.biome[x] = BIOME.FOREST; }
  for (const bx of [42, 50]) { w.setFg(bx, FLOOR - 1, T.BED_HEAD); w.setFg(bx + 1, FLOOR - 1, T.BED_FOOT); }
  g.teleport(41, FLOOR - 1);
  g.peaceful = true;
  const b = g.addActor('b', hero(), { x: 49, y: FLOOR - 1 });
  g.setDate({ season: 1, day: 2, hour: 22 });
  g.step(FIXED_DT);
  g.drainEvents();
  return { g, b };
}
const sleepA = (g: DelveGame) => g.interact(42, FLOOR - 1);
const sleepB = (g: DelveGame, b: PlayerB) => g.withActor(b, () => g.interact(50, FLOOR - 1));
type PlayerB = ReturnType<DelveGame['addActor']>;
const run = (g: DelveGame, sec: number): DelveEvent[] => { for (let i = 0; i < sec / FIXED_DT; i++) g.step(FIXED_DT); return g.drainEvents(); };
const sleepEv = (ev: DelveEvent[]) => ev.filter((e) => e.type === 'sleep');

describe('全員上床才睡', () => {
  it('單人：上床就睡，沒有等待狀態 / wait 事件', () => {
    const g = new DelveGame({ seed: 'solo-sleep', width: 160, height: 100 });
    g.peaceful = true;
    const f = g.feetTile();
    g.world.setFg(f.x + 1, f.y, T.BED_HEAD); g.world.setFg(f.x + 2, f.y, T.BED_FOOT);
    g.setDate({ season: 1, day: 2, hour: 22 });
    g.drainEvents();
    g.interact(f.x + 1, f.y);
    expect(g.sleeping).toBe(true);
    expect(g.sleepWaiting()).toBeNull();
    expect(sleepEv(g.drainEvents()).map((e) => (e as { phase: string }).phase)).toEqual(['start']);
  });

  it('A 上床 B 沒上床：不睡、時間照走、sleepWaiting = 1/2；B 上床 → 睡，兩人回滿血', () => {
    const { g, b } = room();
    g.local.hp = 10; b.hp = 20;
    const t0 = g.time;
    sleepA(g);
    expect(g.sleeping).toBe(false);
    expect(g.sleepWaiting()).toEqual({ ready: 1, total: 2 });
    const ev = run(g, 2);
    expect(sleepEv(ev)).toEqual([expect.objectContaining({ type: 'sleep', phase: 'wait', ready: 1, total: 2 })]);
    expect(g.sleeping).toBe(false);
    expect(g.time).toBeGreaterThan(t0 + 1.9);
    sleepB(g, b);
    expect(g.sleeping).toBe(true);
    expect(g.sleepWaiting()).toBeNull();
    const ev2 = run(g, 4);
    expect(sleepEv(ev2).map((e) => (e as { phase: string }).phase)).toEqual(['start', 'wake']);
    expect(g.isNight()).toBe(false);
    expect(g.local.hp).toBe(g.withActor(g.local, () => g.maxHp()));
    expect(b.hp).toBe(g.withActor(b, () => g.maxHp()));
    expect(g.local.sleepReady).toBe(false);
    expect(b.sleepReady).toBe(false);
  });

  it('A 等待中移動 → 取消 ready', () => {
    const { g } = room();
    sleepA(g);
    expect(g.local.sleepReady).toBe(true);
    g.setMoveX(1);
    run(g, 0.2);
    expect(g.local.sleepReady).toBe(false);
    expect(g.sleepWaiting()).toBeNull();
  });

  it('A 等待中受傷 → 取消 ready', () => {
    const { g } = room();
    sleepA(g);
    g.hurtPlayer(5, 0);
    expect(g.local.sleepReady).toBe(false);
  });

  it('A 等待中燒傷 / 溺水（持續傷害）→ 也取消 ready', () => {
    const { g } = room();
    sleepA(g);
    expect(g.local.sleepReady).toBe(true);
    g.local.burning = 2; g.local.burnTick = 0;
    run(g, FIXED_DT);
    expect(g.local.sleepReady).toBe(false);
    expect(g.local.hp).toBeLessThan(g.maxHp());
  });

  it('A 等待中床被拆 / 被傳走 → 取消 ready', () => {
    const { g } = room();
    sleepA(g);
    g.world.setFg(42, FLOOR - 1, T.AIR);
    run(g, 0.1);
    expect(g.local.sleepReady).toBe(false);
    const r2 = room();
    sleepA(r2.g);
    r2.g.teleport(100, FLOOR - 1);
    run(r2.g, 0.1);
    expect(r2.g.local.sleepReady).toBe(false);
  });

  it('B 死亡不算活著：只要 A 上床就能睡', () => {
    const { g, b } = room();
    g.withActor(b, () => g.hurtPlayer(9999, 0));
    expect(b.dead).toBe(true);
    sleepA(g);
    expect(g.sleeping).toBe(true);
  });

  it('A 已 ready 後 B 死亡 / 被移除 → 開始睡', () => {
    const { g, b } = room();
    sleepA(g);
    expect(g.sleeping).toBe(false);
    g.removeActor('b');
    run(g, 0.1);
    expect(g.sleeping).toBe(true);
    expect(b.sleepReady).toBe(false);
  });

  it('附近有敵人的 actor 不能 ready（blocked sleep），別人照樣可以', () => {
    const { g, b } = room();
    g.peaceful = false;
    g.spawnEnemy('night_walker', 75, FLOOR - 1);
    g.drainEvents();
    sleepB(g, b);
    expect(b.sleepReady).toBe(false);
    expect(g.drainEvents('b').some((e) => e.type === 'blocked' && e.reason === 'sleep')).toBe(true);
    sleepA(g);
    expect(g.local.sleepReady).toBe(true);
  });
});
