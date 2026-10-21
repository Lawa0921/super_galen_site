// game.infinite.test.ts — 正式尺寸的世界是無限的（Task 8）：各 actor 周圍的載入區、停放 / 存讀檔往返、硬邊界、
// 遠方重生、外圍發現、據點 pin、記憶體上限。預設尺寸、固定種子；世界只生成一次（gen 共用）。
import { describe, expect, it } from 'vitest';
import { DelveGame } from './game';
import { generateWorld, type GenResult } from './worldgen';
import { OuterGen, frameOf, SEA_W } from './chunkgen';
import { X_LIMIT, chunkOfX } from './coords';
import { CHUNK, FIXED_DT, TILE_SIZE, WORLD_H, WORLD_W } from './constants';
import { LIQ } from './liquidKind';
import { T } from './tiles';
import { overlapsSolid } from './physics';
import { OUTER_REGION_BASE } from './discovery';
import { UNLOAD_COLS } from './streaming';
import { MAX_BREATH } from './actor';
import { CLAIM } from './settlement';
import { createCharacter } from '../save/character';
import { normalizeAppearance } from './appearance';
import { encodeWorld, restoreSplit, saveSplitGame } from '../save/worldSave';
import type { World } from './world';

const SEED = 'infinite-1a';
let GEN: GenResult | null = null;
const gen = (): GenResult => (GEN ??= generateWorld(SEED));
const game = (): DelveGame => {
  const g = new DelveGame({ seed: SEED, gen: gen(), peaceful: true });
  g.drainAll();
  return g;
};
const steps = (g: DelveGame, n: number): void => { for (let i = 0; i < n; i++) g.step(FIXED_DT); };
const CENTRAL = Math.ceil(WORLD_W / CHUNK);
const who = { id: 'inf', nick: '旅人', createdAt: 1, rev: 1 }, where = { worldId: 'winf', worldName: 'inf', visits: {} };
const hero = () => createCharacter('乙', normalizeAppearance(undefined), 0);

/** x 那一欄第一個實心格（會先 ensure 那一欄） */
function ground(g: DelveGame, x: number): number {
  const w = g.world;
  g.ensureAround(x);
  for (let y = 0; y < w.height; y++) if (w.isSolid(x, y)) return y;
  return w.height;
}
/** 站到 x 的地面上（腳底 = 第一個實心格的上一格） */
function standAt(g: DelveGame, x: number): number {
  const y = ground(g, x) - 1;
  g.teleport(x, y);
  return y;
}
const feetX = (g: DelveGame): number => Math.floor((g.player.x + g.player.w / 2) / TILE_SIZE);
const residentAround = (w: World, x: number, r: number): boolean => {
  for (let c = chunkOfX(x) - r; c <= chunkOfX(x) + r; c++) if (!w.isResident(c)) return false;
  return true;
};

describe('無限世界：建構', () => {
  it('(a) 預設尺寸 → bounds infinite、xMin = −1,000,000；外圍來源是 OuterGen', () => {
    const g = game();
    expect(g.world.width).toBe(WORLD_W);
    expect(g.world.height).toBe(WORLD_H);
    expect(g.world.bounds).toBe('infinite');
    expect(g.world.xMin).toBe(-1_000_000);
    expect(g.world.xMax).toBe(1_000_000);
    expect(g.world.source).toBeInstanceOf(OuterGen);
    // 中央欄全部常駐
    for (let c = 0; c < CENTRAL; c++) expect(g.world.isResident(c)).toBe(true);
  });

  it('frameOf(真的生成世界)：邊欄是海灘地表、cavernY < moltenY < height', () => {
    const gw = gen().world, f = frameOf(gw);
    expect(f.width).toBe(WORLD_W);
    expect(f.edgeL).toBe(gw.surface[0]);
    expect(f.edgeR).toBe(gw.surface[WORLD_W - 1]);
    const g = game();
    for (const [x, e] of [[0, f.edgeL], [WORLD_W - 1, f.edgeR]] as const) {
      expect(e).toBeGreaterThan(0);
      expect(e).toBeLessThan(f.cavernY);
      // 邊欄的地表格：那格實心、上一格不是
      expect(g.world.isSolid(x, e)).toBe(true);
      expect(g.world.isSolid(x, e - 1)).toBe(false);
    }
    expect(f.cavernY).toBeLessThan(f.moltenY);
    expect(f.moltenY).toBeLessThan(f.height);
  });

  it('小尺寸世界照舊有界（defaultBounds）', () => {
    const g = new DelveGame({ seed: 'small', width: 160, height: 100 });
    expect(g.world.bounds).toBe('legacy');
    expect(g.world.xMin).toBe(0);
  });
});

describe('無限世界：海、液體', () => {
  it('(b) teleport(4300) → 腳下是海水；60 刻不丟例外；載入的海不會整片醒來', () => {
    const g = game();
    const prof = (g.world.source as OuterGen).profile;
    const top = prof.waterTopAt(4300);
    expect(top).not.toBeNull();
    g.teleport(4300, top! - 1);
    expect(g.world.getLiquidType(4300, top!)).toBe(LIQ.WATER);
    expect(g.world.getLiquid(4300, top!)).toBeGreaterThan(0);
    g.step(FIXED_DT);
    // 只喚醒接縫（每欄左右各 2 格寬的一條）：遠少於這些欄的液體格總數
    let liquidTiles = 0, outerCols = 0;
    for (const cx of g.world.residentColumns()) {
      if (cx < CENTRAL) continue;
      outerCols++;
      for (let x = cx * CHUNK; x < cx * CHUNK + CHUNK; x++) for (let y = 0; y < g.world.height; y++) if (g.world.getLiquid(x, y)) liquidTiles++;
    }
    expect(outerCols).toBeGreaterThan(5);
    expect(g.liquids.activeCount).toBeLessThan(liquidTiles / 4);
    expect(() => steps(g, 60)).not.toThrow();
    // 剛生成的海與熔岩是靜止的：醒來的接縫很快退休
    steps(g, 60);
    expect(g.liquids.activeCount).toBeLessThan(800);
  });
});

describe('無限世界：停放 / 存讀檔（Review Focus 3）', () => {
  it('(c) −3000 挖一格 → 回出生點卸載（停放）→ 存讀檔 → 回去洞還在、沒改過的格等於第一次生成', () => {
    const g = game();
    const X = -3000;
    const gy = standAt(g, X) + 1;
    const cx = chunkOfX(X);
    // 第一次生成的那一帶
    const before: number[] = [];
    for (let y = gy - 8; y < gy + 12; y++) for (let x = X - 10; x < X + 10; x++) before.push(g.world.getFg(x, y));
    const dig = { x: X + 3, y: gy + 4 };
    expect(g.world.isSolid(dig.x, dig.y)).toBe(true);
    expect(g.mineInstant(dig.x, dig.y)).toBe(true);
    expect(g.world.getFg(dig.x, dig.y)).toBe(T.AIR);
    g.teleport(g.spawn.x, g.spawn.y);
    steps(g, 61);
    expect(g.world.isResident(cx)).toBe(false);
    expect(g.world.parkedChunks()).toContain(g.world.chunkIndex(cx, Math.floor(dig.y / CHUNK)));
    const { world, character } = saveSplitGame(g, who, where, 100);
    const r = restoreSplit(encodeWorld(world), character);
    if (!r.ok) throw new Error(r.message);
    const h = r.game;
    expect(h.world.bounds).toBe('infinite');
    expect(h.world.isResident(cx)).toBe(false);
    h.teleport(X, gy - 1);
    expect(h.world.getFg(dig.x, dig.y)).toBe(T.AIR);
    let k = 0;
    for (let y = gy - 8; y < gy + 12; y++) {
      for (let x = X - 10; x < X + 10; x++, k++) {
        if (x === dig.x && y === dig.y) continue;
        expect(h.world.getFg(x, y)).toBe(before[k]);
      }
    }
  });

  it('讀檔時遠方的外圍欄直接停放（不生成、不常駐）；走過去改過的格回來', () => {
    const g = game();
    const edits: { x: number; y: number }[] = [];
    for (const X of [-3000, 9000]) {
      const gy = standAt(g, X) + 1;
      const d = { x: X + 2, y: gy + 5 };
      expect(g.mineInstant(d.x, d.y)).toBe(true);
      edits.push(d);
    }
    // 遠方的箱子：內容在全域 chests、讀檔時依停放 chunk 的前景重建
    const chest = { x: edits[1].x, y: edits[1].y };
    g.world.setFg(chest.x, chest.y, T.CHEST);
    const ck = g.world.idx(chest.x, chest.y);
    g.world.chests.get(ck)![0] = { item: 'wood', count: 7 };
    edits[1] = { x: edits[1].x, y: edits[1].y - 1 };
    expect(g.mineInstant(edits[1].x, edits[1].y)).toBe(true);
    g.teleport(g.spawn.x, g.spawn.y);
    // 不等卸載：存檔時兩欄還常駐也一樣
    const { world, character } = saveSplitGame(g, who, where, 100);
    const r = restoreSplit(encodeWorld(world), character);
    if (!r.ok) throw new Error(r.message);
    const w = r.game.world;
    const loaded = w.drainColumnEvents().loaded;
    for (const d of edits) {
      const cx = chunkOfX(d.x);
      expect(w.isResident(cx)).toBe(false);
      expect(loaded).not.toContain(cx);
      expect(w.parkedChunks()).toContain(w.chunkIndex(cx, Math.floor(d.y / CHUNK)));
    }
    expect(w.chests.get(ck)?.[0]).toEqual({ item: 'wood', count: 7 });
    for (const d of edits) {
      r.game.teleport(d.x, d.y - 8);
      expect(w.getFg(d.x, d.y)).toBe(T.AIR);
    }
    expect(() => steps(r.game, 5)).not.toThrow();
  });
});

describe('無限世界：多個 actor（Review Focus 2）', () => {
  it('(d) 一人在 −3000、一人在 9000：兩邊常駐、中間卸載；B 旁邊的怪照常模擬', () => {
    const g = game();
    standAt(g, -3000);
    const by = ground(g, 9000) - 1;
    g.addActor('b', hero(), { x: 9000, y: by });
    steps(g, 120);
    const w = g.world;
    expect(residentAround(w, -3000, 6)).toBe(true);
    expect(residentAround(w, 9000, 6)).toBe(true);
    for (let c = chunkOfX(-3000) + UNLOAD_COLS + 1; c < 0; c++) expect(w.isResident(c)).toBe(false);
    for (let c = CENTRAL; c < chunkOfX(9000) - UNLOAD_COLS; c++) expect(w.isResident(c)).toBe(false);
    const e = g.spawnEnemy('gel_blob', 9010, by - 4);
    const x0 = e.body.x, y0 = e.body.y;
    steps(g, 120);
    expect(g.enemies).toContain(e);
    expect(e.body.x !== x0 || e.body.y !== y0).toBe(true);
  });
});

describe('無限世界：硬邊界（Review Focus 4）', () => {
  it('(e) 往右走到 X_LIMIT：x 不超過 X_LIMIT − 1、不丟例外；往左同理', () => {
    const g = game();
    standAt(g, X_LIMIT - 3);
    g.setMoveX(1);
    expect(() => steps(g, 120)).not.toThrow();
    expect(g.player.x + g.player.w).toBeLessThanOrEqual(X_LIMIT * TILE_SIZE);
    expect(feetX(g)).toBeLessThanOrEqual(X_LIMIT - 1);
    standAt(g, -X_LIMIT);
    g.setMoveX(-1);
    expect(() => steps(g, 120)).not.toThrow();
    expect(g.player.x).toBeGreaterThanOrEqual(-X_LIMIT * TILE_SIZE);
    expect(feetX(g)).toBeGreaterThanOrEqual(-X_LIMIT);
  });
});

describe('無限世界：遠方重生（Review Focus 5）', () => {
  it('(f) 床在 −3000、在 6000 死亡 → 重生在床邊：腳下兩格內有實心、不在石頭裡', () => {
    const g = game();
    const by = standAt(g, -3000);
    const w = g.world;
    for (let y = by - 3; y <= by; y++) for (let x = -3001; x <= -2997; x++) w.setFg(x, y, T.AIR);
    w.setFg(-3000, by, T.BED_HEAD); w.setFg(-2999, by, T.BED_FOOT);
    g.bed = { x: -3000, y: by };
    standAt(g, 6000);
    steps(g, 61);
    expect(w.isResident(chunkOfX(-3000))).toBe(false);
    g.hurtPlayer(9999, 0);
    expect(g.dead).toBe(true);
    g.local.respawnT = FIXED_DT / 2;
    steps(g, 1);
    expect(g.dead).toBe(false);
    const p = g.player;
    expect(Math.abs(feetX(g) - -3000)).toBeLessThanOrEqual(2);
    expect(overlapsSolid(w, p.x, p.y, p.w, p.h)).toBe(false);
    const fy = Math.floor((p.y + p.h) / TILE_SIZE);
    const fx0 = Math.floor(p.x / TILE_SIZE), fx1 = Math.floor((p.x + p.w - 1) / TILE_SIZE);
    let support = false;
    for (let y = fy; y < fy + 2; y++) for (let x = fx0; x <= fx1; x++) if (w.isSolid(x, y)) support = true;
    expect(support).toBe(true);
  });
});

describe('無限世界：外圍發現', () => {
  it('(g) 進海、走進外圍第一段陸地 → discover 外圍地區；日誌總數不變', () => {
    const g = game();
    const before = g.discovery.stats();
    const prof = (g.world.source as OuterGen).profile;
    g.teleport(4300, prof.waterTopAt(4300)! - 1);
    steps(g, 2);
    const sea = g.drainAll().filter((e) => e.type === 'discover');
    expect(sea.map((e) => e.type === 'discover' && e.region.name)).toContain('東方大海');
    const x = WORLD_W + SEA_W + 50;
    standAt(g, x - 6);
    g.setMoveX(1);
    let found: { id: number; name: string } | null = null;
    for (let i = 0; i < 120 && !found; i++) {
      g.step(FIXED_DT);
      for (const e of g.drainAll()) if (e.type === 'discover' && e.region.id >= OUTER_REGION_BASE && e.region.name !== '東方大海') found = e.region;
    }
    expect(found).not.toBeNull();
    expect(found!.name.startsWith('東境・')).toBe(true);
    expect(g.discovery.isFound(found!.id)).toBe(true);
    const after = g.discovery.stats();
    expect(after.cats.map((c) => c.total)).toEqual(before.cats.map((c) => c.total));
    expect(after.cats.map((c) => c.found)).toEqual(before.cats.map((c) => c.found));
    // 存讀檔：外圍地區 id 留著
    const { world, character } = saveSplitGame(g, who, where, 100);
    const r = restoreSplit(encodeWorld(world), character);
    if (!r.ok) throw new Error(r.message);
    expect(r.game.discovery.isFound(found!.id)).toBe(true);
    expect(r.game.discovery.stats().cats.map((c) => c.found)).toEqual(before.cats.map((c) => c.found));
  });
});

describe('無限世界：據點 pin', () => {
  it('(h) 據點核心在 −2000 → 主角走到 3000 後那幾欄仍常駐；拆掉之後才卸載', () => {
    const g = game();
    const y = standAt(g, -2000);
    const w = g.world;
    g.teleport(-1990, y);
    w.setFg(-2000, y, T.HEARTH);
    g.settle.found(-2000, y);
    standAt(g, 3000);
    steps(g, 121);
    for (let c = chunkOfX(-2000 - CLAIM.x); c <= chunkOfX(-2000 + CLAIM.x); c++) expect(w.isResident(c)).toBe(true);
    // 範圍外、離主角很遠的外圍欄照常卸載
    expect(w.isResident(chunkOfX(-2000 - CLAIM.x) - 2)).toBe(false);
    w.setFg(-2000, y, T.AIR);
    g.settle.remove(-2000, y);
    steps(g, 60);
    expect(w.isResident(chunkOfX(-2000))).toBe(false);
  });
});

describe('無限世界：記憶體上限', () => {
  it('(i) 從東海灘每次 teleport 64 格、跑 60 刻，往東 6,400 格：常駐欄有上限、沒有停放', () => {
    const g = game();
    const start = WORLD_W - 40;
    let maxRes = 0;
    for (let x = start; x <= start + 6400; x += 64) {
      const prof = (g.world.source as OuterGen).profile;
      const wt = x >= WORLD_W ? prof.waterTopAt(x) : null;
      if (wt !== null) g.teleport(x, wt - 1); else standAt(g, x);
      steps(g, 60);
      g.hp = g.maxHp(); g.breath = MAX_BREATH;
      maxRes = Math.max(maxRes, g.world.residentColumns().length);
      expect(g.world.residentColumns().length).toBeLessThanOrEqual(CENTRAL + 2 * UNLOAD_COLS + 3);
      expect(g.world.parkedChunks().length).toBe(0);
    }
    expect(maxRes).toBeGreaterThan(CENTRAL);
  }, 120_000);
});
