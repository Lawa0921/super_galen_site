// spawn.coop.test.ts — 生怪每位玩家各自計算（co-op M-C2 D8）。
// 單人逐位元相同的期待值是用改動前的程式碼（92028e34）跑出來寫死的；不要為了讓測試過而重錄。
import { describe, it, expect } from 'vitest';
import { DelveGame } from './game';
import { T, W } from './tiles';
import { BIOME, LIQ } from './world';
import { FIXED_DT, TILE_SIZE } from './constants';
import { MAX_ENEMIES_TOTAL } from './spawn';
import { createCharacter } from '../save/character';
import { normalizeAppearance } from './appearance';

const FLOOR = 60, S = TILE_SIZE;
const hero = () => createCharacter('乙', normalizeAppearance(undefined), 0);

/** 寬平地：y ≥ 60 石頭、地表森林、深夜、會生怪；本地玩家站在 (x0, 59) */
function arena(seed: string, width: number, x0: number): DelveGame {
  const g = new DelveGame({ seed, width, height: 100 });
  const w = g.world;
  g.liquids.setSprings([]);
  for (let y = 0; y < w.height; y++) for (let x = 0; x < w.width; x++) {
    w.setLiquid(x, y, 0, LIQ.NONE);
    w.setFg(x, y, y >= FLOOR ? T.STONE : T.AIR);
    w.setWall(x, y, W.NONE);
  }
  for (let x = 0; x < w.width; x++) { w.surface[x] = FLOOR; w.biome[x] = BIOME.FOREST; }
  g.teleport(x0, FLOOR - 1);
  g.setDate({ season: 1, day: 3, hour: 23 });
  g.drainAll();
  return g;
}

/** FNV-1a 32-bit */
function fnv(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h.toString(16).padStart(8, '0');
}
/** 這一刻的怪物 + 玩家狀態 */
function digest(g: DelveGame): string {
  const es = g.enemies.map((e) => `${e.id}:${e.kind}:${e.body.x.toFixed(3)}:${e.body.y.toFixed(3)}:${e.hp}`).join('|');
  const p = g.local.player;
  return `${es}#${p.x.toFixed(3)}:${p.y.toFixed(3)}:${g.local.hp}:${g.local.dead}`;
}

/** 暖機 warmTicks 後再跑 600 tick：每 60 tick 記一次累計摘要 */
function record(g: DelveGame, warmTicks: number): { warm: string; marks: string[]; maxId: number; n: number } {
  for (let i = 0; i < warmTicks; i++) g.step(FIXED_DT);
  const warm = fnv(digest(g));
  let acc = '';
  const marks: string[] = [];
  let maxId = 0;
  for (let t = 1; t <= 600; t++) {
    g.step(FIXED_DT);
    acc = fnv(acc + digest(g));
    for (const e of g.enemies) maxId = Math.max(maxId, e.id);
    if (t % 60 === 0) marks.push(acc);
  }
  return { warm, marks, maxId, n: g.enemies.length };
}

describe('生怪：單人時 spawn 結果跟改動前逐位元相同', () => {
  it('固定種子：暖機 9000 tick 後的 600 tick，每 60 tick 的累計摘要和改動前一樣', () => {
    const r = record(arena('spawn-golden', 400, 200), 9000);
    expect(r).toEqual({
      warm: 'bf20c633', maxId: 6, n: 5,
      marks: ['181467bf', '52be8d24', '65807641', 'c8a993d6', 'fc9d180b', 'b6e8271f', '471f0f8b', '7679b240', '2570d154', '826477f7'],
    });
  });
  it('活躍範圍外凍著 38 隻怪：全世界上限 40 照樣擋住（單人計數 = 全部的怪）', () => {
    const g = arena('spawn-golden-cap', 400, 150);
    for (let k = 0; k < 38; k++) g.spawnEnemy('gel_blob', 150 + 95 + (k % 10), FLOOR - 1);
    const r = record(g, 9000);
    expect(r).toEqual({
      warm: 'f5bb029c', maxId: 40, n: 39,
      marks: ['4230ee54', '68394e8c', '94b34a0e', '5e32bd47', 'd8214431', 'b0cf66cb', 'd4b57746', 'ea95daff', '8d75e22a', '545e6446'],
    });
  });
});

/**
 * 每位玩家身邊生了幾隻（每刻把怪清掉 → 只看生成速度，不受附近上限影響）。
 * 新生的怪算給 x 最近的玩家；回傳依 xs 的順序。
 */
function spawnedNear(seed: string, xs: number[], seconds: number): number[] {
  const g = arena(seed, 1000, xs[0]);
  g.setDate({ season: 1, day: 3, hour: 20 });
  xs.slice(1).forEach((x, i) => g.addActor(`p${i + 1}`, hero(), { x, y: FLOOR - 1 }));
  const out = xs.map(() => 0);
  let seen = 0;
  for (let t = 0; t < seconds * 60; t++) {
    g.step(FIXED_DT);
    for (const e of g.enemies) {
      if (e.id <= seen) continue;
      seen = e.id;
      const ex = (e.body.x + e.body.w / 2) / S;
      let best = 0;
      xs.forEach((x, i) => { if (Math.abs(ex - x) < Math.abs(ex - xs[best])) best = i; });
      out[best]++;
    }
    g.enemies.length = 0;
  }
  return out;
}

describe('生怪：每位玩家各自計時（D8）', () => {
  it('生怪：2 位玩家相距很遠，各自身邊的怪數都會長到接近單人時的數量', () => {
    // 3 個種子加總（生成點 / 成群數量的隨機起伏大）；以前輪流當中心 → 每人約只有單人的一半
    let solo = 0, a = 0, b = 0;
    for (const seed of ['spawn-far', 'spawn-far-2', 'spawn-far-3']) {
      solo += spawnedNear(seed, [200], 200)[0];
      const two = spawnedNear(seed, [200, 750], 200);
      a += two[0]; b += two[1];
    }
    expect(solo).toBeGreaterThan(60);
    expect(a).toBeGreaterThanOrEqual(solo * 0.75);
    expect(b).toBeGreaterThanOrEqual(solo * 0.75);
  });

  it('全世界怪數不超過 160', () => {
    const g = arena('spawn-total', 1000, 150);
    g.spawn.x = 150; g.spawn.y = FLOOR - 1;
    // A 的活躍範圍外（95 格、還沒到消失距離）凍著 158 隻：A 那一帶已滿；B 在遠方照樣生，但全世界最多 160
    for (let k = 0; k < MAX_ENEMIES_TOTAL - 2; k++) g.spawnEnemy('gel_blob', 150 + 95 + (k % 12), FLOOR - 1);
    const b = g.addActor('p1', hero(), { x: 750, y: FLOOR - 1 });
    let max = 0;
    for (let t = 0; t < 60 * 180; t++) {
      g.local.iframes = 99; b.iframes = 99;          // 不讓怪把人打死（死了會回出生點、計時重來）
      g.step(FIXED_DT);
      max = Math.max(max, g.enemies.length);
    }
    expect(max).toBe(MAX_ENEMIES_TOTAL);
    const nearB = g.enemies.filter((e) => Math.abs(e.body.x / S - 750) < 120).length;
    expect(nearB).toBeGreaterThan(0);
  });
});
