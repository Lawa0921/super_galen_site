// legacyFixture11.test.ts — FIXTURE11_EDITS（凍結常數）與 buildLegacyFixture11() 的實際改動一致
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { buildLegacyFixture11, FIXTURE11_EDITS as E, FIXTURE11_PATH, FIXTURE11_WHO, FIXTURE11_WHERE } from './legacyFixture11';
import { T } from '../engine/tiles';
import { restoreSplit, saveSplitGame } from './worldSave';

describe('legacyFixture11', { timeout: 120_000 }, () => {
  const g = buildLegacyFixture11();
  const w = g.world;
  it('EDITS 是凍結常數、非空', () => {
    expect(Object.isFrozen(E)).toBe(true);
    expect(E.dug.length).toBe(11 * 4 - 1 + 1);
    expect(E.planks).toHaveLength(5);
    expect(E.dug.some(([x, y]) => x === E.chest.x && y === E.chest.y)).toBe(false);
  });
  it('新建的 fixture 與 EDITS 完全一致', () => {
    for (const [x, y] of E.dug) { g.ensureAround(x); expect(w.getFg(x, y), `dug ${x},${y}`).toBe(T.AIR); }
    for (const [x, y] of E.planks) expect(w.getFg(x, y), `plank ${x},${y}`).toBe(T.PLANKS);
    expect(w.getFg(E.chest.x, E.chest.y)).toBe(T.CHEST);
    expect(w.chests.get(w.idx(E.chest.x, E.chest.y))?.slice(0, E.chest.items.length)).toEqual(E.chest.items);
  });
  it('凍結檔載入後改動仍在', () => {
    const { character } = saveSplitGame(g, FIXTURE11_WHO, FIXTURE11_WHERE, 1);
    const r = restoreSplit(new Uint8Array(readFileSync(FIXTURE11_PATH)), character);
    if (!r.ok) throw new Error(r.message);
    const rw = r.game.world;
    for (const [x, y] of E.dug) { r.game.ensureAround(x); expect(rw.getFg(x, y), `dug ${x},${y}`).toBe(T.AIR); }
    for (const [x, y] of E.planks) expect(rw.getFg(x, y)).toBe(T.PLANKS);
    expect(rw.getFg(E.chest.x, E.chest.y)).toBe(T.CHEST);
    expect(rw.chests.get(rw.idx(E.chest.x, E.chest.y))?.slice(0, 2)).toEqual(E.chest.items);
  });
});
