// serialize.liquid.test.ts — 存檔格式 6：液體（只存被改過的 chunk、RLE 壓縮）、v5 → v6 遷移、生成器 v4 存檔可遷移
import { describe, it, expect } from 'vitest';
import { DelveGame } from '../engine/game';
import { T, W, SOLID_LUT } from '../engine/tiles';
import { LIQ } from '../engine/world';
import { CHUNK, GEN_VERSION } from '../engine/constants';
import {
  encodeSave, decodeSave, serializeGame, restoreGame, snapshotGame, SAVE_FORMAT, encodeLiquidRle, decodeLiquidRle,
} from './serialize';

const SMALL = { width: 160, height: 100 };

/** 小世界：清空液體，x 20..140 清成空氣，第 60 列以下石頭，x 60..70 有一個石盆 */
function scene(): DelveGame {
  const g = new DelveGame({ seed: 'save-liquid', ...SMALL, peaceful: true });
  const w = g.world;
  for (let i = 0; i < w.liquid.length; i++) { w.liquid[i] = 0; w.liquidType[i] = 0; }
  for (let y = 0; y < 100; y++) for (let x = 20; x < 140; x++) { w.setFg(x, y, y >= 60 ? T.STONE : T.AIR); w.setWall(x, y, W.NONE); }
  for (let y = 54; y < 60; y++) { w.setFg(60, y, T.STONE); w.setFg(70, y, T.STONE); }
  g.liquids.settle(50);
  g.teleport(40, 59);
  return g;
}
const run = (g: DelveGame, n: number): void => { for (let i = 0; i < n; i++) g.step(); };

describe('存檔格式 6（液體）', { timeout: 180_000 }, () => {
  it('格式版本 6', () => {
    expect(SAVE_FORMAT).toBe(6);
    expect(snapshotGame(scene()).header.format).toBe(6);
  });

  it('RLE：來回一致、空的 chunk 很小、壞資料丟例外', () => {
    const n = CHUNK * CHUNK * 3;
    const amt = new Uint8Array(n), typ = new Uint8Array(n);
    for (let i = 100; i < 400; i++) { amt[i] = 255; typ[i] = LIQ.WATER; }
    amt[500] = 37; typ[500] = LIQ.HONEY;
    const enc = encodeLiquidRle(amt, typ);
    expect(enc.length).toBeLessThan(40);
    const dec = decodeLiquidRle(enc, n);
    expect([...dec.amount]).toEqual([...amt]);
    expect([...dec.type]).toEqual([...typ]);
    expect(() => decodeLiquidRle(enc, n + 1)).toThrow();
    expect(() => decodeLiquidRle(new Uint8Array([5, 0, 9]), 5)).toThrow();
  });

  it('自然生成（沒動過）的液體不存：新世界的液體清單是空的', () => {
    const g = new DelveGame({ seed: 'save-natural', ...SMALL });
    const snap = snapshotGame(g);
    expect(snap.header.liquids?.chunks ?? []).toEqual([]);
  });

  it('倒進去的水（流到別的 chunk 也一樣）存回來位元相同，讀檔後繼續流', () => {
    const g = scene();
    g.liquids.pour(65, 40, LIQ.WATER, 255);
    g.liquids.pour(100, 50, LIQ.LAVA, 255);
    run(g, 20); // 水還在半空中流
    const snap = snapshotGame(g);
    expect(snap.header.liquids!.chunks.length).toBeGreaterThan(0);
    const r = restoreGame(encodeSave(snap));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const w = r.game.world;
    expect(Buffer.from(w.liquid).equals(Buffer.from(g.world.liquid))).toBe(true);
    expect(Buffer.from(w.liquidType).equals(Buffer.from(g.world.liquidType))).toBe(true);
    // 讀檔後液體被喚醒，會繼續流到盆底
    expect(r.game.liquids.activeCount).toBeGreaterThan(0);
    run(r.game, 400);
    let basin = 0;
    for (let x = 61; x < 70; x++) basin += w.getLiquid(x, 59);
    expect(basin).toBeGreaterThan(200);
  });

  it('液體 chunk 的 RLE 資料壞掉 → 格式錯誤', () => {
    const g = scene();
    g.liquids.pour(65, 40, LIQ.WATER, 255);
    run(g, 5);
    const snap = snapshotGame(g);
    snap.header.liquids!.data = 'AAAA';
    const r = restoreGame(encodeSave(snap));
    expect(r).toMatchObject({ ok: false, error: 'format' });
  });

  it('v5 存檔（生成器 v4）→ 遷移：可以讀、液體依新生成器重建、被改過 chunk 裡蓋到方塊的液體清掉', () => {
    const g = new DelveGame({ seed: 'save-migrate', ...SMALL });
    const w = g.world;
    for (let x = 30; x < 50; x++) w.setFg(x, 70, T.STONE); // 玩家修改
    const snap = snapshotGame(g);
    snap.header.format = 5;
    snap.header.genVersion = 4;
    delete snap.header.liquids;
    const bytes = encodeSave(snap);
    expect(decodeSave(bytes).header.liquids).toBeUndefined();
    const r = restoreGame(bytes);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const rw = r.game.world;
    let inSolid = 0;
    for (let i = 0; i < rw.liquid.length; i++) if (rw.liquid[i] && SOLID_LUT[rw.fg[i]]) inSolid++;
    expect(inSolid).toBe(0);
    expect(GEN_VERSION).toBe(5);
  });

  it('其他生成器版本（v3）還是回報 gen_version', () => {
    const snap = snapshotGame(new DelveGame({ seed: 'old', ...SMALL }));
    snap.header.format = 5;
    snap.header.genVersion = 3;
    const r = restoreGame(encodeSave(snap));
    expect(r).toMatchObject({ ok: false, error: 'gen_version', saveGenVersion: 3 });
  });

  it('serializeGame / restoreGame 用一般流程也保留液體', () => {
    const g = scene();
    g.liquids.pour(65, 50, LIQ.HONEY, 255);
    run(g, 120);
    const r = restoreGame(serializeGame(g));
    expect(r.ok && r.game.world.liquidTotal(LIQ.HONEY)).toBe(g.world.liquidTotal(LIQ.HONEY));
  });
});

