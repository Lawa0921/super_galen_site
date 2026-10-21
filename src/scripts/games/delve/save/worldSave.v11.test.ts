// 世界檔 format 11：外圍 chunk 鍵、外圍迷霧（exploredOuter）、bounds / outerGen、補零規則、停放的欄、format 10 一次遷移（先備份）。
import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DelveGame } from '../engine/game';
import { li, type Column, type ColumnLayers, type ColumnSource } from '../engine/column';
import { chunkKey, chunkOfX, tileKey } from '../engine/coords';
import { CHUNK } from '../engine/constants';
import { LIQ } from '../engine/liquidKind';
import { T } from '../engine/tiles';
import { FarChunks, decodeSave, encodeSave, restoreBlocker, snapshotGame, validChunkKeys, validTileKey } from './serialize';
import type { ChunkData } from '../engine/world';
import { V10_BACKUP_SUFFIX, WORLD_FORMAT, decodeWorld, encodeWorld, joinSplit, restoreSplit, saveSplitGame } from './worldSave';
import { SplitSession, saveSplit, type SplitStore } from './split';
import { FIXTURE_NOW, buildLegacyFixtureGame } from './legacyFixture';
import { FIXTURE10_PATH, FIXTURE10_WHERE, FIXTURE10_WHO } from './worldSave.v10.freeze.test';
import type { DelveCharacter } from './character';

/** 中央以外一律實心 STONE（沒有液體 / 牆） */
class StoneSource implements ColumnSource {
  readonly version = 1;
  fill(col: Column, x0: number, x1: number): void {
    for (let y = 0; y < col.height; y++) for (let x = x0; x < x1; x++) col.fg[li(x, y)] = T.STONE;
  }
  surfaceAt(): number { return 0; }
  biomeAt(): number { return 0; }
  layersAt(): ColumnLayers { return { rock: 10, deep: 50, molten: 90 }; }
}

const fixture10 = (): Uint8Array => readFileSync(FIXTURE10_PATH);
const fixtureChar = (): DelveCharacter => saveSplitGame(buildLegacyFixtureGame(), FIXTURE10_WHO, FIXTURE10_WHERE, FIXTURE_NOW).character;
const who = { id: 'c11', nick: '旅人', createdAt: 5, rev: 1 }, where = { worldId: 'w11', worldName: 'inf', visits: {} };

function memStore(o: { failBackup?: boolean } = {}): SplitStore & { log: string[] } {
  const log: string[] = [];
  return {
    log,
    async getSlot() { return null; },
    async getCharacter() { return null; },
    async backupSlot(from, to) { log.push(`backupSlot ${from} ${to}`); if (o.failBackup) throw new Error('backup failed'); },
    async putSplit(slot, world, character) {
      log.push(`putSplit ${slot} ${character.id}`);
      return { slot, seed: world.seed, savedAt: character.savedAt, bytes: world.bytes.length };
    },
    async listWorlds() { return []; },
    async listCharacters() { return []; },
    async deleteWorld() {},
    async deleteCharacter() {},
    async putCharacter() {},
  };
}

describe('format 10 → 11：補零規則（Review Focus 1）', () => {
  it('fixture 是 format 10、chunk 6（x 192..223）是存檔裡改過的 chunk', () => {
    const wd = decodeWorld(fixture10());
    expect(wd.header.format).toBe(10);
    expect(wd.header.width).toBe(200);
    expect(wd.header.chunks).toContain(chunkKey(Math.ceil(200 / CHUNK), 6, 0));
    expect(wd.header.bounds).toBeUndefined();
  });

  it('讀進無限世界：chunk 6 的 x 200..223 是來源的 STONE（不是 payload 補的空氣），x < 200 與 fixture 相同', () => {
    const ch = fixtureChar();
    const base = restoreSplit(fixture10(), ch);
    if (!base.ok) throw new Error(base.message);
    expect(base.game.world.bounds).toBe('legacy');
    const r = restoreSplit(fixture10(), ch, { bounds: 'infinite', source: new StoneSource() });
    if (!r.ok) throw new Error(r.message);
    const a = base.game.world, b = r.game.world;
    expect(b.bounds).toBe('infinite');
    for (let y = 0; y < b.height; y++) {
      for (let x = 200; x < 224; x++) {
        expect(b.getFg(x, y)).toBe(T.STONE);
        expect(b.getLiquid(x, y)).toBe(0);
      }
      for (let x = 160; x < 200; x++) {
        expect(b.getFg(x, y)).toBe(a.getFg(x, y));
        expect(b.getWall(x, y)).toBe(a.getWall(x, y));
        expect(b.getLiquid(x, y)).toBe(a.getLiquid(x, y));
      }
    }
    // 沒有外圍迷霧、存回去也不會冒出外圍的 chunk
    expect(r.game.explored.encodeOuter()).toBeUndefined();
  });

  it('format 10 檔裡出現外圍鍵 → restoreBlocker 回 size；有 bounds 才接受', () => {
    const wd = decodeWorld(fixture10());
    const { data } = joinSplit(wd, fixtureChar());
    const outer = chunkKey(Math.ceil(200 / CHUNK), -1, 1);
    const h = { ...data.header, chunks: [...data.header.chunks, outer] };
    expect(restoreBlocker(h)?.error).toBe('size');
    expect(restoreBlocker({ ...h, bounds: 'infinite' })).toBeNull();
    // 中央鍵超出範圍：有沒有 bounds 都拒絕
    const total = Math.ceil(200 / CHUNK) * Math.ceil(100 / CHUNK);
    expect(restoreBlocker({ ...data.header, chunks: [total], bounds: 'infinite' })?.error).toBe('size');
  });

  it('validChunkKeys / validTileKey：沒有 bounds 只接受中央範圍', () => {
    const h = { width: 200, height: 100 }, hi = { ...h, bounds: 'infinite' as const };
    const cOuter = chunkKey(7, -3, 2), tOuter = tileKey(200, -40, 10), tEdge = tileKey(200, 200, 10);
    expect(validTileKey(5, h)).toBe(true);
    expect(validTileKey(200 * 100, h)).toBe(false);
    expect(validTileKey(tOuter, h)).toBe(false);
    expect(validTileKey(tOuter, hi)).toBe(true);
    expect(validTileKey(tEdge, hi)).toBe(true);
    expect(validTileKey(tileKey(200, 50, 100), hi)).toBe(false); // y 越界
    expect(validTileKey(tileKey(200, 1_000_000, 3), hi)).toBe(false); // X_LIMIT 外
    expect(validChunkKeys([0, 3], h)).toEqual([0, 3]);
    expect(() => validChunkKeys([cOuter], h)).toThrow();
    expect(validChunkKeys([cOuter], hi)).toEqual([cOuter]);
    expect(() => validChunkKeys([chunkKey(7, -3, 4)], hi)).toThrow(); // cy 越界
    expect(() => validChunkKeys([1, 1], hi)).toThrow(); // 重複
  });
});

describe('format 11：無限世界的存讀檔', () => {
  const mk = (): DelveGame => new DelveGame({ seed: 'inf-11', width: 200, height: 100, peaceful: true, bounds: 'infinite', columnSource: new StoneSource() });

  it('外圍挖洞 / 迷霧 / 箱子 / 結冰 / 半格 → saveSplitGame → restoreSplit 全部回來、format 11', () => {
    const g = mk(), w = g.world;
    expect(w.bounds).toBe('infinite');
    w.ensureColumn(chunkOfX(-40));
    w.ensureColumn(chunkOfX(5000));
    expect(w.getFg(-40, 50)).toBe(T.STONE);
    expect(w.setFg(-40, 50, T.AIR)).toBe(true);
    expect(w.setFg(5000, 60, T.AIR)).toBe(true);
    // 外圍箱子
    w.setFg(-38, 50, T.CHEST);
    const ck = w.idx(-38, 50);
    const slots = w.chests.get(ck)!;
    slots[0] = { item: 'copper_coin', count: 9 };
    // 結冰（要有水、不是實心）
    w.setFg(5002, 60, T.AIR);
    w.setLiquid(5002, 60, 200, LIQ.WATER);
    w.setFrozen(5002, 60, true);
    // 半格（實心）
    expect(w.setHalf(5004, 60, true)).toBe(true);
    // 外圍迷霧
    g.explored.revealDisc(-40, 50, 6);
    g.explored.reveal(5000, 60);

    const snap = snapshotGame(g, 1);
    expect(snap.header.bounds).toBe('infinite');
    expect(snap.header.outerGen).toBe(1);
    expect(snap.header.exploredOuter).toBeDefined();
    const outerKeys = snap.header.chunks.filter((k) => k >= 2 ** 20);
    expect(outerKeys.length).toBeGreaterThanOrEqual(2);
    // 外圍鍵排在中央之後（數字升冪）
    expect(snap.header.chunks).toEqual([...snap.header.chunks].sort((a, b) => a - b));

    const { world, character } = saveSplitGame(g, who, where, 7);
    expect(world.header.format).toBe(WORLD_FORMAT);
    expect(WORLD_FORMAT).toBe(11);
    const r = restoreSplit(encodeWorld(world), character, { source: new StoneSource() });
    if (!r.ok) throw new Error(r.message);
    expect(r.world.format).toBe(11);
    expect(r.world.bounds).toBe('infinite');
    expect(r.world.outerGen).toBe(1);
    const h = r.game.world;
    expect(h.bounds).toBe('infinite');
    expect(h.getFg(-40, 50)).toBe(T.AIR);
    expect(h.getFg(-41, 50)).toBe(T.STONE);
    expect(h.getFg(-38, 50)).toBe(T.CHEST);
    expect(h.chests.get(ck)?.[0]).toEqual({ item: 'copper_coin', count: 9 });
    // 讀檔時離玩家很遠的外圍欄直接停放（Task 8）：走近（載入）才蓋回來
    expect(h.isResident(chunkOfX(5000))).toBe(false);
    expect(h.parkedChunks()).toContain(h.chunkIndex(chunkOfX(5000), Math.floor(60 / CHUNK)));
    r.game.ensureAround(5000);
    expect(h.getLiquid(5002, 60)).toBe(200);
    expect(h.isFrozen(5002, 60)).toBe(true);
    expect(h.getFg(5000, 60)).toBe(T.AIR);
    expect(h.isHalf(5004, 60)).toBe(true);
    expect(r.game.explored.has(-40, 50)).toBe(true);
    expect(r.game.explored.has(-44, 50)).toBe(true);
    expect(r.game.explored.has(5000, 60)).toBe(true);
    expect(r.game.explored.has(5001, 60)).toBe(false);
    expect(r.game.explored.count).toBe(g.explored.count);
    // 再存一次：位元組相同（存讀往返穩定）
    const again = saveSplitGame(r.game, who, { ...where, visits: r.world.visits }, 7).world;
    expect(Buffer.from(encodeWorld(again)).equals(Buffer.from(encodeWorld(world)))).toBe(true);
  });

  it('欄被停放時，存檔也包含那個 chunk', () => {
    const g = mk(), w = g.world, cx = chunkOfX(-3000);
    w.ensureColumn(cx);
    w.setFg(-3000, 70, T.AIR);
    expect(w.unloadColumn(cx)).toBe(true);
    expect(w.isResident(cx)).toBe(false);
    const k = w.chunkIndex(cx, Math.floor(70 / CHUNK));
    expect(w.parkedChunks()).toContain(k);
    const snap = snapshotGame(g, 1);
    expect(snap.header.chunks).toContain(k);
    expect(snap.header.liquids!.chunks).toContain(k);
    const { world, character } = saveSplitGame(g, who, where, 7);
    const r = restoreSplit(encodeWorld(world), character, { source: new StoneSource() });
    if (!r.ok) throw new Error(r.message);
    // 讀檔時那一欄離玩家很遠 → 直接停放、不常駐（Task 8）；載入後蓋回來
    expect(r.game.world.isResident(cx)).toBe(false);
    expect(r.game.world.parkedChunks()).toContain(k);
    r.game.world.ensureColumn(cx);
    expect(r.game.world.getFg(-3000, 70)).toBe(T.AIR);
    expect(r.game.world.getFg(-2999, 70)).toBe(T.STONE);
  });

  it('有界世界的 snapshot 沒有 bounds / outerGen / exploredOuter', () => {
    const h = snapshotGame(buildLegacyFixtureGame(), 1).header;
    expect('bounds' in h).toBe(false);
    expect('outerGen' in h).toBe(false);
    expect('exploredOuter' in h).toBe(false);
  });
});

describe('format 10 一次遷移：先備份', () => {
  it('fromLoaded 吃 format 10 → 第一次 saveSplit 先 backupSlot(slot, slot + .v10.bak) 再 putSplit；第二次不再備份', async () => {
    expect(V10_BACKUP_SUFFIX).toBe('.v10.bak');
    const ch = fixtureChar();
    const r = restoreSplit(fixture10(), ch);
    if (!r.ok) throw new Error(r.message);
    const s = SplitSession.fromLoaded(r.world, ch, 'main');
    expect(s.pendingBackup).toBe(V10_BACKUP_SUFFIX);
    const st = memStore();
    await saveSplit(st, s, r.game, 100);
    expect(st.log).toEqual(['backupSlot main main.v10.bak', `putSplit main ${ch.id}`]);
    expect(s.pendingBackup).toBeNull();
    await saveSplit(st, s, r.game, 101);
    expect(st.log).toEqual(['backupSlot main main.v10.bak', `putSplit main ${ch.id}`, `putSplit main ${ch.id}`]);
  });

  it('backupSlot 丟錯 → putSplit 沒被呼叫、整個丟出；format 11 的世界不備份', async () => {
    const ch = fixtureChar();
    const r = restoreSplit(fixture10(), ch);
    if (!r.ok) throw new Error(r.message);
    const s = SplitSession.fromLoaded(r.world, ch, 'main');
    const st = memStore({ failBackup: true });
    await expect(saveSplit(st, s, r.game, 100)).rejects.toThrow('backup failed');
    expect(st.log).toEqual(['backupSlot main main.v10.bak']);
    expect(s.pendingBackup).toBe(V10_BACKUP_SUFFIX);

    const { world } = saveSplitGame(r.game, FIXTURE10_WHO, FIXTURE10_WHERE, 5);
    const s11 = SplitSession.fromLoaded(decodeWorld(encodeWorld(world)).header, ch, 'w2');
    expect(s11.pendingBackup).toBeNull();
    const st2 = memStore();
    await saveSplit(st2, s11, r.game, 100);
    expect(st2.log).toEqual([`putSplit w2 ${ch.id}`]);
  });
});

describe('寫出的東西一定讀得回來（無限世界的清單長度）', () => {
  const mk = (): DelveGame => new DelveGame({ seed: 'inf-big', width: 200, height: 100, peaceful: true, bounds: 'infinite', columnSource: new StoneSource() });
  // 舊上限：中央 chunk 數 + chunkTotal(8400, 2400)
  const OLD_CAP = 7 * 4 + 263 * 75;

  it('外圍迷霧 N 塊 + 液體 N 塊（N > 舊上限）→ 合併檔 / 世界檔都讀得回來、角色的 visit 沒被丟掉', () => {
    const g = mk(), w = g.world;
    const COLS = 5000, N = COLS * w.chunksY;
    expect(N).toBeGreaterThan(OLD_CAP);
    // 所有停放 chunk 共用同一份六層（只讀）：左上角一格水
    const K = CHUNK * CHUNK, z = (): Uint8Array => new Uint8Array(K);
    const d: ChunkData = { fg: z(), wall: z(), liquid: z(), liquidType: z(), frozen: z(), half: z() };
    d.liquid[0] = 77; d.liquidType[0] = LIQ.WATER;
    // 玩家附近的欄常駐（parkChunk 會拒絕）→ 從 cx −20 往西
    const C0 = -20 - COLS;
    for (let cx = C0; cx < C0 + COLS; cx++) {
      for (let cy = 0; cy < w.chunksY; cy++) {
        expect(w.parkChunk(cx, cy, d)).toBe(true);
        w.liquidModified.add(w.chunkIndex(cx, cy));
        g.explored.reveal(cx * CHUNK + 1, cy * CHUNK + 1);
      }
    }
    const snap = snapshotGame(g, 1);
    expect(snap.header.liquids!.chunks.length).toBe(N);
    expect(snap.header.exploredOuter!.chunks.length).toBe(N);
    // 合併檔
    const back = decodeSave(encodeSave(snap));
    expect(back.header.liquids!.chunks.length).toBe(N);
    expect(back.header.exploredOuter!.chunks.length).toBe(N);
    // 世界檔
    const { world, character } = saveSplitGame(g, who, where, 7);
    const bytes = encodeWorld(world);
    const wd = decodeWorld(bytes);
    expect(wd.header.visits[who.id]).toBeDefined();
    expect(wd.header.visits[who.id].exploredOuter!.chunks.length).toBe(N);
    expect(wd.header.liquids!.chunks.length).toBe(N);
    const r = restoreSplit(bytes, character, { source: new StoneSource() });
    if (!r.ok) throw new Error(r.message);
    const h = r.game;
    expect(h.explored.has(C0 * CHUNK + 1, 1)).toBe(true);
    expect(h.explored.has(-21 * CHUNK + 1, 3 * CHUNK + 1)).toBe(true);
    expect(h.explored.has(-21 * CHUNK + 2, 3 * CHUNK + 1)).toBe(false);
    expect(h.explored.count).toBe(g.explored.count);
    const far = chunkOfX(-4000 * CHUNK);
    expect(h.world.isResident(far)).toBe(false);
    h.world.ensureColumn(far);
    expect(h.world.getLiquid(far * CHUNK, 2 * CHUNK)).toBe(77);
    expect(h.world.getLiquidType(far * CHUNK, 2 * CHUNK)).toBe(LIQ.WATER);
    expect(h.world.getLiquid(far * CHUNK + 1, 2 * CHUNK)).toBe(0);
  });

  it('有界世界的上限照舊：chunk 鍵清單比 chunk 總數長 → 損毀', () => {
    const h = { width: 200, height: 100 };
    expect(() => validChunkKeys(Array.from({ length: 29 }, (_, i) => i), h)).toThrow();
  });
});

describe('讀存檔時不默默丟資料', () => {
  const mk = (): DelveGame => new DelveGame({ seed: 'inf-loud', width: 200, height: 100, peaceful: true, bounds: 'infinite', columnSource: new StoneSource() });
  afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });

  it('FarChunks.park：那一欄在讀檔途中變成常駐（parkChunk 回 false）→ 直接寫進常駐欄；修改標記照存檔內容', () => {
    const g = mk(), w = g.world, cx = chunkOfX(-3000);
    const both = w.chunkIndex(cx, 2), liqOnly = w.chunkIndex(cx, 1);
    const far = new FarChunks(w, new Set([both]), new Set([both, liqOnly]));
    expect(far.isFar(cx)).toBe(true);
    const a = far.get(both);
    a.fg.fill(T.STONE); a.fg[(3 << 5) | 4] = T.AIR;
    a.liquid[(3 << 5) | 4] = 90; a.liquidType[(3 << 5) | 4] = LIQ.WATER;
    w.modifiedChunks.add(both); w.liquidModified.add(both);
    const b = far.get(liqOnly);
    expect(b.fg[(5 << 5) | 6]).toBe(T.STONE);
    b.fg[(5 << 5) | 6] = T.AIR; b.liquid[(5 << 5) | 6] = 40; b.liquidType[(5 << 5) | 6] = LIQ.WATER;
    w.liquidModified.add(liqOnly);
    w.ensureColumn(cx);
    expect(far.park()).toEqual([both, liqOnly].sort((p, q) => p - q));
    const x0 = cx * CHUNK;
    expect(w.getFg(x0 + 4, 2 * CHUNK + 3)).toBe(T.AIR);
    expect(w.getLiquid(x0 + 4, 2 * CHUNK + 3)).toBe(90);
    expect(w.getFg(x0 + 5, 2 * CHUNK + 3)).toBe(T.STONE);
    expect(w.getFg(x0 + 6, CHUNK + 5)).toBe(T.AIR);
    expect(w.getLiquid(x0 + 6, CHUNK + 5)).toBe(40);
    expect(w.parkedChunks()).toEqual([]);
    expect(w.modifiedChunks.has(both)).toBe(true);
    expect(w.modifiedChunks.has(liqOnly)).toBe(false);
    expect(w.liquidModified.has(liqOnly)).toBe(true);
  });

  it('FarChunks.park：一般情況（欄沒常駐）→ 停放，回傳空清單', () => {
    const g = mk(), w = g.world, cx = chunkOfX(-3000), ci = w.chunkIndex(cx, 2);
    const far = new FarChunks(w, new Set([ci]), new Set([ci]));
    far.get(ci);
    w.modifiedChunks.add(ci); w.liquidModified.add(ci);
    expect(far.park()).toEqual([]);
    expect(w.parkedChunks()).toEqual([ci]);
    expect(w.isResident(cx)).toBe(false);
  });

  it('snapshotGame：有改過的 chunk 既不常駐也沒停放 → 測試環境丟例外', () => {
    const g = mk(), w = g.world, ci = w.chunkIndex(chunkOfX(-3000), 1);
    w.modifiedChunks.add(ci);
    expect(() => snapshotGame(g, 1)).toThrow(/neither resident nor parked/);
    const g2 = mk();
    g2.world.liquidModified.add(g2.world.chunkIndex(chunkOfX(4000), 0));
    expect(() => snapshotGame(g2, 1)).toThrow(/neither resident nor parked/);
  });

  it('snapshotGame：正式環境 → console.error、照樣存（那個 chunk 不寫）', () => {
    vi.stubEnv('NODE_ENV', 'production');
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    const g = mk(), w = g.world, ci = w.chunkIndex(chunkOfX(-3000), 1);
    w.modifiedChunks.add(ci);
    const snap = snapshotGame(g, 1);
    expect(snap.header.chunks).not.toContain(ci);
    expect(err).toHaveBeenCalledTimes(1);
    expect(String(err.mock.calls[0][0])).toMatch(/neither resident nor parked/);
  });
});
