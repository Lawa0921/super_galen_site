// coop.infinite.test.ts — M-B3 驗收（Task 11）A3–A5：無限世界的停放 chunk、晚加入、外圍生成。
// A3／A4 用 HashSource（依座標雜湊的外圍）；A5 用正式尺寸、固定種子的真實世界（OuterGen）。
import { describe, it, expect } from 'vitest';
import { T } from '../engine/tiles';
import { chunkOfX } from '../engine/coords';
import { CHUNK } from '../engine/constants';
import { UNLOAD_EVERY } from '../engine/streaming';
import { SEA_W, SEG_W } from '../engine/legacy/chunkgen/index';
import type { DelveGame } from '../engine/game';
import { encodeWorld, restoreSplit, saveSplitGame } from '../save/worldSave';
import type { NetGuest } from './guest';
import { coopRig, FRAME, HashSource, infiniteGame, type Rig } from './testRig';

const REST_MS = 2000;

function until(r: Rig, cond: () => boolean, maxMs: number): boolean {
  for (let t = 0; t < maxMs; t += FRAME) { if (cond()) return true; r.run(FRAME); }
  return cond();
}

/** 在 (x0..x1, y0..y1) 內依序挖掉 nDig 格實心（mineInstant）、把 nPlace 格空氣放成 DIRT；回傳改過的格與期望值 */
function editArea(game: DelveGame, x0: number, x1: number, y0: number, y1: number, nDig: number, nPlace: number): [number, number, number][] {
  const w = game.world, out: [number, number, number][] = [];
  let dug = 0, placed = 0;
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    const f = w.getFg(x, y);
    if (dug < nDig && f !== T.AIR && game.mineInstant(x, y)) { dug++; out.push([x, y, T.AIR]); continue; }
    if (placed < nPlace && f === T.AIR && dug >= nDig && w.setFg(x, y, T.DIRT)) { placed++; out.push([x, y, T.DIRT]); }
  }
  expect(dug).toBe(nDig);
  expect(placed).toBe(nPlace);
  return out;
}

/** 單機跑步直到 cond（最多 n 步） */
function stepUntil(game: DelveGame, cond: () => boolean, n: number): void {
  for (let i = 0; i < n && !cond(); i++) game.step();
}

/** 房主把客人 p? 傳送到 (x, 地表) 並等同步 */
function sendGuest(r: Rig, g: NetGuest, x: number, ms = 3000): void {
  const hg = r.hostGame, a = hg.actors.get(g.pid!)!;
  hg.withActor(a, () => hg.teleport(x, hg.world.surfaceAt(x) - 1));
  r.run(ms);
}

describe('A3 房主在遠方改的東西，客人走過去才看到（infinite）', () => {
  it('x = 3000 挖 10 放 5 → 回出生點、停放 → 客人加入、被送過去 → sameTiles 為空、15 格都對', () => {
    const r = coopRig({ world: 'infinite', guests: 0 });
    const hg = r.hostGame, w = hg.world;
    const home = { x: hg.spawn.x, y: hg.spawn.y };
    hg.teleport(3000, 40);
    const cells = editArea(hg, 2996, 3006, 36, 60, 10, 5);
    hg.teleport(home.x, home.y);
    expect(until(r, () => w.parkedChunks().length > 0, (UNLOAD_EVERY * 3) * FRAME)).toBe(true);
    expect(w.isResident(chunkOfX(3000))).toBe(false);
    const g = r.join();
    expect(until(r, () => g.state === 'live', 5000)).toBe(true);
    r.run(1000);
    sendGuest(r, g, 3000);
    expect(r.synced(0)).toContain(chunkOfX(3000));
    expect(r.sameTiles(0)).toEqual([]);
    for (const [x, y, t] of cells) expect(g.game!.world.getFg(x, y), `${x},${y}`).toBe(t);
  });
});

describe('A4 晚加入的客人（infinite）', () => {
  it('中央改 30 格、x = −2500 改 20 格並停放 → saveSplitGame → restoreSplit → 新 NetHost → 客人在出生點與 −2500 都一致', () => {
    const pre = infiniteGame('coop-a4');
    const home = { x: pre.spawn.x, y: pre.spawn.y };
    const center = editArea(pre, home.x - 12, home.x + 12, home.y - 6, home.y + 10, 15, 15);
    pre.teleport(-2500, 40);
    const outer = editArea(pre, -2505, -2495, 36, 60, 10, 10);
    pre.teleport(home.x, home.y);
    stepUntil(pre, () => !pre.world.isResident(chunkOfX(-2500)), UNLOAD_EVERY * 3);
    expect(pre.world.parkedChunks().length).toBeGreaterThan(0);
    const who = { id: 'host-a4', nick: '房主', createdAt: 1, rev: 1 }, where = { worldId: 'w-a4', worldName: 'a4', visits: {} };
    const saved = saveSplitGame(pre, who, where, 1);
    const res = restoreSplit(encodeWorld(saved.world), saved.character, { source: new HashSource() });
    if (!res.ok) throw new Error(res.message);
    const hg = res.game;
    expect(hg.world.isResident(chunkOfX(-2500))).toBe(false);
    expect(hg.world.parkedChunks().map((k) => hg.world.chunkCoords(k).cx)).toContain(chunkOfX(-2500));
    const r = coopRig({ world: 'infinite', guests: 0, game: hg });
    const g = r.join();
    expect(until(r, () => g.state === 'live', 5000)).toBe(true);
    r.run(1000);
    sendGuest(r, g, home.x);
    expect(r.synced(0)).toContain(chunkOfX(home.x));
    expect(r.sameTiles(0)).toEqual([]);
    for (const [x, y, t] of center) expect(g.game!.world.getFg(x, y), `${x},${y}`).toBe(t);
    sendGuest(r, g, -2500);
    expect(r.synced(0)).toContain(chunkOfX(-2500));
    expect(r.sameTiles(0)).toEqual([]);
    for (const [x, y, t] of outer) expect(g.game!.world.getFg(x, y), `${x},${y}`).toBe(t);
  });
});

describe('A5 真實世界的外圍（real）', () => {
  it('客人走進中央以外第一片海與生態段 → sameTiles 為空；沒改過的外圍 chunk 不在任何 col.diff 裡', () => {
    const r = coopRig({ world: 'real', worldSeed: 'coop-real' });
    const g = r.guests[0], hg = r.hostGame, w = hg.world;
    expect(g.state).toBe('live');
    const W = w.width, sea = W + Math.floor(SEA_W / 2), land = W + SEA_W + Math.floor(SEG_W / 2);
    for (const x of [sea, land]) {
      sendGuest(r, g, x, 2500);
      r.run(REST_MS);
      expect(Math.abs(Math.floor(g.game!.local.player.x / 16) - x)).toBeLessThanOrEqual(1);
      expect(r.synced(0)).toContain(chunkOfX(x));
      expect(r.sameTiles(0)).toEqual([]);
      // 海那段：客人自己生成的海水也在（不是房主送來的）
      if (x === sea) expect(g.game!.world.getLiquid(x, w.surfaceAt(x) - 3)).toBeGreaterThan(0);
    }
    // 外圍、沒改過（沒進編輯日誌、tile／液體都沒被標記改過）的 chunk 不該出現在 col.diff
    const centerHi = Math.ceil(W / CHUNK);
    let outerCols = 0;
    for (const c of r.cols[0]) {
      if (c.cx >= 0 && c.cx < centerHi) continue;
      outerCols++;
      for (const cy of c.diff) {
        const k = w.chunkIndex(c.cx, cy);
        const changed = w.edits.rev(k) > 0 || w.modifiedChunks.has(k) || w.liquidModified.has(k);
        expect(changed, `col ${c.cx} diff cy ${cy}`).toBe(true);
      }
    }
    expect(outerCols).toBeGreaterThan(10);
  }, 60_000);
});
