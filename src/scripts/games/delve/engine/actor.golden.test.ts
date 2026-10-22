// actor.golden.test.ts — 玩家狀態搬進 PlayerActor 的「golden」回歸：
// 固定種子小世界 + 腳本化輸入（移動、跳、挖、放、攻擊、喝藥、釣魚、睡覺）跑 600 tick，
// 每 60 tick 的存檔快照 + getState + 怪物的 hash、與 drainEvents 類型序列，必須和重構前錄下的完全一樣。
// 期待值是用重構前的程式碼（3ab578d8 + 計畫 commit 22fe9e4b）跑出來寫死的；不要為了讓測試過而重錄。
import { describe, it, expect } from 'vitest';
import { DelveGame } from './game';
import { T, W } from './tiles';
import { LIQ } from './world';
import { FIXED_DT } from './constants';
import type { ItemId } from './items';
import { encodeSave, snapshotGame } from '../save/serialize';

const SMALL = { width: 160, height: 100 };
const FLOOR = 60, BED = { x: 46, y: 59 };

/** 平地：全圖清空、y ≥ 60 石頭；x 70..85 一池深 4 格的水；床在 (46, 59) */
function arena(): DelveGame {
  const g = new DelveGame({ seed: 'golden', ...SMALL });
  const w = g.world;
  g.liquids.setSprings([]);
  for (let y = 0; y < w.height; y++) for (let x = 0; x < w.width; x++) {
    w.setLiquid(x, y, 0, LIQ.NONE);
    w.setFg(x, y, y >= FLOOR ? T.STONE : T.AIR);
    w.setWall(x, y, W.NONE);
  }
  for (let x = 0; x < w.width; x++) { w.surface[x] = FLOOR; w.biome[x] = 0; }
  for (let y = FLOOR; y < FLOOR + 4; y++) for (let x = 70; x <= 85; x++) { w.setFg(x, y, T.AIR); w.setLiquid(x, y, 255, LIQ.WATER); }
  for (let x = 70; x <= 85; x++) w.surface[x] = FLOOR + 4;
  for (let x = 40; x < 70; x++) w.setFg(x, FLOOR, T.DIRT);
  w.setFg(BED.x, BED.y, T.BED_HEAD); w.setFg(BED.x + 1, BED.y, T.BED_FOOT);
  g.liquids.settle(200);
  g.teleport(40, FLOOR - 1);
  g.setDate({ season: 1, day: 2, hour: 12 });
  return g;
}

function hold(g: DelveGame, item: ItemId, n = 1): void {
  g.give(item, n);
  const i = g.inventory.slots.findIndex((s) => s?.item === item);
  if (i > 0) g.inventory.swap(i, 0);
  g.selectSlot(0);
}

/** 第 t 刻（step 之前）的輸入 */
function script(g: DelveGame, t: number): void {
  const pt = g.playerTile();
  // 移動
  if (t === 0) g.setMoveX(1);
  if (t === 50) g.setMoveX(0);
  // 跳（同時往左走回來）
  if (t === 60) { g.setJump(true); g.setMoveX(-1); }
  if (t === 76) g.setJump(false);
  if (t === 110) g.setMoveX(0);
  // 挖腳下右邊的泥土
  if (t === 120) { g.selectSlot(g.inventory.slots.findIndex((s) => s?.item === 'wood_pickaxe')); g.setAim(pt.x + 1, FLOOR); g.setMining(true); }
  if (t === 150) g.setAim(pt.x + 2, FLOOR);
  if (t === 179) g.setMining(false);
  // 把挖開的洞填回泥土
  if (t === 180) { hold(g, 'dirt', 10); g.setAim(pt.x + 1, FLOOR); g.setUse(true); }
  if (t === 186) g.setUse(false);
  if (t === 200) { g.setAim(pt.x + 2, FLOOR); g.setUse(true); }
  if (t === 206) g.setUse(false);
  // 攻擊
  if (t === 240) { g.spawnEnemy('gel_blob', pt.x - 4, FLOOR - 1); hold(g, 'wood_sword'); }
  if (t >= 240 && t < 300) {
    const e = g.enemies[0];
    if (e) g.setAimWorld(e.body.x + e.body.w / 2, e.body.y + e.body.h / 2);
    if (t === 241) g.setMining(true);
  }
  if (t === 299) g.setMining(false);
  // 受傷 → 喝藥
  if (t === 300) { g.hurtPlayer(30, (pt.x + 3) * 16); hold(g, 'healing_potion', 2); }
  if (t === 330) g.setUse(true);
  if (t === 332) g.setUse(false);
  // 釣魚：走到池邊、拋竿、強制上鉤、收竿
  if (t === 360) { g.teleport(68, FLOOR - 1); g.give('worm', 5); hold(g, 'wood_rod'); g.setAim(77, FLOOR - 2); }
  if (t === 362) g.setUse(true);
  if (t === 364) g.setUse(false);
  if (t === 405) g.debugForceBite();
  if (t === 408) g.setUse(true);
  if (t === 410) g.setUse(false);
  // 晚上上床睡覺
  if (t === 430) { g.peaceful = true; g.teleport(BED.x - 2, FLOOR - 1); g.setDate({ season: 1, day: 2, hour: 22 }); g.setAim(BED.x, BED.y); }
  if (t === 432) g.setUse(true);
  if (t === 436) g.setUse(false);
}

/** FNV-1a 32 bit */
function fnv(bytes: Uint8Array, h = 0x811c9dc5): number {
  for (let i = 0; i < bytes.length; i++) { h ^= bytes[i]; h = Math.imul(h, 0x01000193) >>> 0; }
  return h >>> 0;
}
function hashGame(g: DelveGame): string {
  let h = fnv(encodeSave(snapshotGame(g, 0)));
  const extra = {
    state: g.getState(),
    enemies: g.enemies.map((e) => ({ kind: e.kind, x: e.body.x, y: e.body.y, vx: e.body.vx, vy: e.body.vy, hp: e.hp })),
    projectiles: g.projectiles.list.length,
  };
  h = fnv(new TextEncoder().encode(JSON.stringify(extra)), h);
  return h.toString(16).padStart(8, '0');
}
/** 連續相同的類型壓成 type*n */
function compress(types: string[]): string {
  const out: string[] = [];
  for (let i = 0; i < types.length;) {
    let j = i;
    while (j < types.length && types[j] === types[i]) j++;
    out.push(j - i > 1 ? `${types[i]}*${j - i}` : types[i]);
    i = j;
  }
  return out.join(' ');
}

/** 第二段腳本：溺水 → 死亡 → 重生（走 step 的死亡分支），再給 buff、學突進、放技能（含冷卻中再按一次） */
function script2(g: DelveGame, t: number): void {
  if (t === 0) { g.teleport(77, FLOOR + 3); g.breath = 0.05; g.hp = 3; }
  if (t === 420) { g.giveBuff('bless'); g.addXp(2200); for (const id of ['b_vigor', 'b_dash'] as const) g.learnSkill(id); }
  if (t === 430) { g.setMoveX(1); g.useSkill('dash'); }
  if (t === 470) g.setMoveX(0);
  if (t === 500) g.useSkill('dash');
  if (t === 520) { g.setMoveX(-1); g.setJump(true); }
  if (t === 540) { g.setJump(false); g.setMoveX(0); }
}

function record(sc: (g: DelveGame, t: number) => void = script): { hash: string; events: string }[] {
  const g = arena();
  g.drainEvents();
  const out: { hash: string; events: string }[] = [];
  let types: string[] = [];
  for (let t = 0; t < 600; t++) {
    sc(g, t);
    g.step(FIXED_DT);
    for (const e of g.drainEvents()) { types.push(e.type); if (process.env.GOLDEN_DEBUG) console.log(t, JSON.stringify(e)); }
    if ((t + 1) % 60 === 0) { out.push({ hash: hashGame(g), events: compress(types) }); types = []; }
  }
  return out;
}

/** 重構前（PlayerActor 之前）錄下的期待值 */
const GOLDEN: { hash: string; events: string }[] = [
  { hash: '2c65d3d3', events: 'discover*2 xp levelup xp' },
  { hash: '3551a013', events: '' },
  { hash: '19004f3c', events: 'mine pickup mine pickup' },
  { hash: 'c5c42f75', events: 'place*2' },
  { hash: 'dfe5d9d0', events: 'attack*2 hit attack' },
  { hash: '9ea32d14', events: 'hurt heal' },
  { hash: '0ba12a02', events: 'fish*4 xp' },
  { hash: '7413da98', events: 'spawn sleep' },
  { hash: '84250096', events: '' },
  { hash: 'ac50ccf1', events: 'sleep' },
];

/**
 * 第二段（溺水死亡重生 + buff + 技能）：在 PlayerActor 重構後、多 actor 之前的 HEAD（39791710）錄下；
 * 最終審查另對重構前的真正基準 22fe9e4b 跑過，期待值同樣通過（單機行為從計畫基準起就沒變）。
 */
const GOLDEN2: { hash: string; events: string }[] = [
  { hash: 'be6c3bc3', events: 'discover*2 xp levelup xp bubble hurt*2 xploss death' },
  { hash: '49b4a369', events: '' },
  { hash: '1984d770', events: '' },
  { hash: 'ece0cfcf', events: '' },
  { hash: 'b4873720', events: 'respawn' },
  { hash: '22cc3db6', events: 'discover xp splash' },
  { hash: '3127c064', events: '' },
  { hash: '3f52bf7f', events: 'buff xp levelup*4 learn*2 skill bubble' },
  { hash: 'cd025422', events: 'skill splash' },
  { hash: '0ed2fef9', events: 'splash' },
];

describe('PlayerActor golden：單機逐 tick 不變', () => {
  it('600 tick 腳本：每 60 tick 的快照 hash 與事件序列和重構前一樣', () => {
    const got = record();
    if (GOLDEN.length === 0) console.log(JSON.stringify(got, null, 2));
    expect(got).toEqual(GOLDEN);
  });
  it('600 tick 腳本二（溺水 → 死亡 → 重生、buff、技能）：和多 actor 之前一樣', () => {
    const got = record(script2);
    if (GOLDEN2.length === 0) console.log(JSON.stringify(got, null, 2));
    expect(got).toEqual(GOLDEN2);
  });
  it('單機只有一個 actor：local === cur、pid = h', () => {
    const g = arena();
    expect(g.actors.size).toBe(1);
    expect(g.local).toBe(g.cur);
    expect(g.local.pid).toBe('h');
    expect(g.actors.get('h')).toBe(g.local);
    expect(g.localPid).toBe('h');
    expect(g.mode).toBe('solo');
    // 相容 getter 指向同一個 actor 的欄位
    expect(g.player).toBe(g.local.player);
    expect(g.inventory).toBe(g.local.inventory);
    g.hp = 42;
    expect(g.local.hp).toBe(42);
  });
});
