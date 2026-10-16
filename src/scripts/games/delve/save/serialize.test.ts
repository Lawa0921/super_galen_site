// serialize.test.ts
import { describe, it, expect } from 'vitest';
import { DelveGame } from '../engine/game';
import { World } from '../engine/world';
import { T, W } from '../engine/tiles';
import { CHUNK, GEN_VERSION, FIXED_DT } from '../engine/constants';
import {
  snapshotGame, encodeSave, decodeSave, serializeGame, restoreGame, diffChunks, SaveFormatError,
  SAVE_FORMAT, CHUNK_BYTES,
} from './serialize';

const SMALL = { width: 160, height: 100 };

function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

function modified(): DelveGame {
  const g = new DelveGame({ seed: 'save-me', ...SMALL });
  for (let i = 0; i < 30; i++) g.step(FIXED_DT);
  g.mineInstant(g.spawn.x, g.spawn.y + 1);
  g.world.setFg(5, 5, T.PLANKS);
  g.world.setWall(150, 90, W.STONE_WALL);
  g.world.setFg(159, 99, T.TORCH); // 右下角 partial chunk
  g.give('copper_ore', 7);
  g.inventory.select(3);
  g.setMoveX(1);
  for (let i = 0; i < 20; i++) g.step(FIXED_DT);
  g.setMoveX(0);
  return g;
}

describe('save serialize', () => {
  it('新世界存檔不含任何 chunk', () => {
    const g = new DelveGame({ seed: 'fresh', ...SMALL });
    const snap = snapshotGame(g);
    expect(snap.header.chunks).toEqual([]);
    expect(snap.header.genVersion).toBe(GEN_VERSION);
    expect(snap.header.format).toBe(SAVE_FORMAT);
  });
  it('只存被修改的 chunk', () => {
    const g = modified();
    const snap = snapshotGame(g);
    expect(snap.header.chunks).toEqual([...g.world.modifiedChunks].sort((a, b) => a - b));
    const total = g.world.chunksX * g.world.chunksY;
    expect(snap.header.chunks.length).toBeLessThan(total);
    expect(snap.header.chunks.length).toBeGreaterThanOrEqual(3);
    const bytes = encodeSave(snap);
    expect(bytes.length).toBeLessThan(snap.header.chunks.length * CHUNK_BYTES + 4096);
    expect(CHUNK_BYTES).toBe(CHUNK * CHUNK * 2);
  });
  it('序列化 → 反序列化 重現世界 + 玩家 + 背包 + 時間', () => {
    const g = modified();
    const bytes = serializeGame(g);
    const r = restoreGame(bytes);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const h = r.game;
    expect(h.seed).toBe(g.seed);
    expect(bytesEqual(h.world.fg, g.world.fg)).toBe(true);
    expect(bytesEqual(h.world.wall, g.world.wall)).toBe(true);
    expect(h.world.getFg(159, 99)).toBe(T.TORCH);
    expect(h.player.x).toBe(g.player.x);
    expect(h.player.y).toBe(g.player.y);
    expect(h.inventory.toJSON()).toEqual(g.inventory.toJSON());
    expect(h.inventory.selected).toBe(3);
    expect(h.time).toBeCloseTo(g.time, 6);
    expect(h.tick).toBe(g.tick);
    expect([...h.world.modifiedChunks].sort()).toEqual([...g.world.modifiedChunks].sort());
  });
  it('還原後再存一次，位元相同（存檔穩定）', () => {
    const g = modified();
    const a = serializeGame(g, 1000);
    const r = restoreGame(a);
    if (!r.ok) throw new Error('restore failed');
    const b = serializeGame(r.game, 1000);
    expect(bytesEqual(b, a)).toBe(true);
  });
  it('還原後世界 chunk 全標 dirty（render 會重畫）', () => {
    const r = restoreGame(serializeGame(modified()));
    if (!r.ok) throw new Error('restore failed');
    expect(r.game.world.drainDirty().length).toBe(r.game.world.chunksX * r.game.world.chunksY);
  });
  it('生成器版本不符：預設回報錯誤；allowGenMismatch 時仍可還原', () => {
    const g = modified();
    const snap = snapshotGame(g);
    snap.header.genVersion = GEN_VERSION + 1;
    const bytes = encodeSave(snap);
    const r = restoreGame(bytes);
    expect(r).toMatchObject({ ok: false, error: 'gen_version' });
    if (!r.ok) expect(r.saveGenVersion).toBe(GEN_VERSION + 1);
    const forced = restoreGame(bytes, { allowGenMismatch: true });
    expect(forced.ok).toBe(true);
  });
  it('損毀資料 → format 錯誤，不丟例外', () => {
    expect(restoreGame(new Uint8Array([1, 2, 3, 4, 5]))).toMatchObject({ ok: false, error: 'format' });
    const good = serializeGame(modified());
    expect(restoreGame(good.slice(0, good.length - 10))).toMatchObject({ ok: false, error: 'format' });
    expect(() => decodeSave(new Uint8Array(3))).toThrow(SaveFormatError);
  });
  it('存檔尺寸異常 → size 錯誤', () => {
    const snap = snapshotGame(modified());
    snap.header.width = -5;
    expect(restoreGame(encodeSave(snap))).toMatchObject({ ok: false, error: 'size' });
  });
  it('背包內容在 JSON 層被驗證（壞項目丟棄）', () => {
    const snap = snapshotGame(modified());
    (snap.header.inventory.slots as unknown[])[0] = { item: 'hacked', count: 5 };
    const r = restoreGame(encodeSave(snap));
    if (!r.ok) throw new Error('restore failed');
    expect(r.game.inventory.slots[0]).toBeNull();
  });
});

describe('diffChunks', () => {
  it('找出兩個世界內容不同的 chunk', () => {
    const a = new World(100, 70), b = new World(100, 70);
    expect(diffChunks(a, b)).toEqual([]);
    b.fg[b.idx(40, 10)] = T.DIRT;
    b.wall[b.idx(99, 69)] = W.DIRT_WALL;
    expect(diffChunks(a, b)).toEqual([a.chunkIndex(1, 0), a.chunkIndex(3, 2)]);
  });
  it('尺寸不同丟錯', () => {
    expect(() => diffChunks(new World(10, 10), new World(11, 10))).toThrow();
  });
});
