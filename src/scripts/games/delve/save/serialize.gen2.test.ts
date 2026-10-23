// serialize.gen2.test.ts — Task 15：gen2 世界存檔（genVersion 8、地塊鎖）、舊世界位元組不變、讀檔版本比對（genBlocker）。
import { describe, expect, it } from 'vitest';
import { DelveGame } from '../engine/game';
import { FIXED_DT } from '../engine/constants';
import { T } from '../engine/tiles';
import { BlueprintIndex } from '../engine/gen2/blueprint';
import { GEN2_VERSION } from '../engine/gen2';
import { SPAWN_X } from '../engine/gen2/layout';
import { fnv1a } from '../net/codec';
import {
  COMPAT_GEN, SaveFormatError, decodeSave, encodeSave, restoreGame, snapshotGame, validGen2,
  type RestoreResult,
} from './serialize';
import { genBlocker } from './genCheck';
import { decodeWorld, encodeWorld, joinSplit, saveSplitGame } from './worldSave';

type RestoreOk = Extract<RestoreResult, { ok: true }>;
/** 改動 snapshotGame 之前（base ce5e6f6d6）錄下：seed 'v7'、160×100、savedAt 1 的存檔位元組 fnv1a */
const V7_SAVE_HASH = 3533975371;
const who = { id: 'c-g2', nick: '旅人', createdAt: 1, rev: 0 }, where = { worldId: 'w-g2', worldName: 'g2', visits: {} };

/** 家鄉以外第一片大陸的地下小屋（有箱子） */
function firstCabin(g: DelveGame) {
  const src = g.gen2()!;
  const cab = new BlueprintIndex(g.seed, src.layout, src.profile).overlapping(4200, 40_000).find((b) => b.kind === 'cabin' && b.chests.length > 0);
  if (!cab) throw new Error('no cabin');
  return cab;
}
/** 一個已走動、有鎖的 gen2 遊戲 */
function gen2Game(seed = 'sv'): DelveGame {
  const g = new DelveGame({ seed, worldGen: { kind: 'gen2' } });
  const c = firstCabin(g).chests[0];
  g.teleport(c.x, c.y - 1); g.step(FIXED_DT);
  return g;
}

describe('gen2 存檔', () => {
  it('gen2 世界存讀往返：genVersion 8、outerGen = GEN2_VERSION、鎖、改過的 chunk、搜刮過的結構箱子都保留；沒改過的 chunk 重算相同', () => {
    const g = new DelveGame({ seed: 'sv', worldGen: { kind: 'gen2' } });
    const cab = firstCabin(g), c = cab.chests[0];
    g.teleport(c.x, c.y - 1); g.step(FIXED_DT);
    const k = g.world.idx(c.x, c.y);
    const loot = g.world.chests.get(k)!;
    expect(loot[0]).not.toBeNull();   // 生成的箱子有東西（搜刮才有意義）
    const rest = loot.slice(1);
    loot[0] = null; g.world.touchChest(c.x, c.y);
    expect(g.world.setFg(c.x + 2, c.y, T.AIR) || g.world.getFg(c.x + 2, c.y) === T.AIR).toBe(true);
    g.world.setFg(c.x + 2, c.y - 1, T.STONE);
    expect(g.gen2()!.locks.toJSON().length).toBeGreaterThan(1);   // 家鄉 + 走過的海 / 大陸

    const data = decodeSave(encodeSave(snapshotGame(g, 1)));
    expect(data.header.genVersion).toBe(8);
    expect(data.header.outerGen).toBe(GEN2_VERSION);
    expect(data.header.bounds).toBe('infinite');
    expect(data.header.gen2!.locks).toEqual(g.gen2()!.locks.toJSON());

    const r = restoreGame(data);
    if (!r.ok) throw new Error(r.message);
    const h = (r as RestoreOk).game;
    expect(h.genKind).toBe('gen2');
    expect(h.genVersion).toBe(8);
    // 讀回來的鎖表 = 存檔的（Layout 建構前就載好）
    expect(h.gen2()!.locks.toJSON()).toEqual(data.header.gen2!.locks);
    h.world.ensureColumn(c.x >> 5);
    expect(h.world.getFg(c.x + 2, c.y)).toBe(T.AIR);
    expect(h.world.getFg(c.x + 2, c.y - 1)).toBe(T.STONE);
    // 搜刮過的不重新補滿，其他格照舊
    expect(h.world.chests.get(k)![0]).toBeNull();
    expect(h.world.chests.get(k)!.slice(1)).toEqual(rest);
    // 沒改過的 chunk：兩邊都重新生成，逐格相同（不是兩邊都 null）
    g.world.ensureColumn(SPAWN_X >> 5); h.world.ensureColumn(SPAWN_X >> 5);
    for (const cy of [8, 10, 12]) {
      const a = g.world.readChunk(SPAWN_X >> 5, cy);
      expect(a).not.toBeNull();
      expect(h.world.readChunk(SPAWN_X >> 5, cy)).toEqual(a);
    }
  }, 60000);

  it('讀檔時離得很遠（停放路徑）：搜刮過的箱子不補滿、沒搜刮的箱子不消失', () => {
    const g = new DelveGame({ seed: 'sv', worldGen: { kind: 'gen2' } });
    const cab = firstCabin(g), c = cab.chests[0];
    g.teleport(c.x, c.y - 1); g.step(FIXED_DT);
    const k = g.world.idx(c.x, c.y);
    g.world.chests.get(k)![0] = null; g.world.touchChest(c.x, c.y);
    const want = g.world.chests.get(k)!.map((s) => (s ? { ...s } : null));
    // 同一片大陸、另一個沒碰過的結構箱子（沒改過的 chunk）
    const src = g.gen2()!;
    const other = new BlueprintIndex(g.seed, src.layout, src.profile).overlapping(4200, 40_000)
      .flatMap((b) => b.chests).find((o) => Math.abs((o.x >> 5) - (c.x >> 5)) > 4);
    if (!other) throw new Error('no other chest');
    // 回出生點再存（小屋那一欄卸載、改過的 chunk 停放）
    g.teleport(SPAWN_X, g.spawn.y); for (let i = 0; i < 61; i++) g.step(FIXED_DT);   // UNLOAD_EVERY = 60 刻檢查一次
    expect(g.world.isResident(c.x >> 5)).toBe(false);

    const r = restoreGame(encodeSave(snapshotGame(g, 1)));
    if (!r.ok) throw new Error(r.message);
    const h = r.game;
    expect(h.world.isResident(c.x >> 5)).toBe(false);
    h.teleport(c.x, c.y - 1); h.step(FIXED_DT);
    expect(h.world.chests.get(k)).toEqual(want);
    h.teleport(other.x, other.y - 1); h.step(FIXED_DT);
    const ok = h.world.chests.get(h.world.idx(other.x, other.y));
    expect(ok).toBeDefined();
    expect(ok!.some((s) => s !== null)).toBe(true);
  }, 60000);

  it('舊世界 v7 的存檔位元組不變（沒有 gen2 欄位、genVersion 7）', () => {
    const g = new DelveGame({ seed: 'v7', width: 160, height: 100 }), h = snapshotGame(g, 1).header;
    expect(h.genVersion).toBe(7);
    expect('gen2' in h).toBe(false);
    expect(fnv1a(encodeSave(snapshotGame(g, 1)), 0x811c9dc5)).toBe(V7_SAVE_HASH);
  });

  it('genBlocker 真值表', () => {
    const ok8 = { format: 9, genVersion: 8, outerGen: 0, bounds: 'infinite' as const, gen2: { locks: [] } };
    expect(genBlocker({ format: 9, genVersion: 7, outerGen: 2, bounds: 'infinite' })).toMatchObject({ error: 'gen_version', newer: false });
    expect(genBlocker({ format: 9, genVersion: 7, outerGen: 1, bounds: 'infinite' })).toBeNull();
    expect(genBlocker({ format: 9, genVersion: 7 })).toBeNull();
    expect(genBlocker({ ...ok8, outerGen: 1 })).toMatchObject({ newer: true });
    expect(genBlocker({ ...ok8, gen2: { locks: [[1, 1, 99, null]] } })).toMatchObject({ newer: true });
    expect(genBlocker(ok8)).toBeNull();
    expect(genBlocker({ ...ok8, bounds: undefined })).not.toBeNull();
    expect(genBlocker({ format: 5, genVersion: COMPAT_GEN[0] })).toBeNull();
    expect(genBlocker({ format: 9, genVersion: 6 })).toMatchObject({ newer: false });
    expect(() => validGen2({ locks: 'x' })).toThrow(SaveFormatError);
    // 補充：v8 沒有 gen2 / 沒有 outerGen → 擋（不是較新）；未知的較新 genVersion → newer；allowGenMismatch 只放行其他版本
    expect(genBlocker({ ...ok8, gen2: undefined })).toMatchObject({ newer: false });
    expect(genBlocker({ ...ok8, outerGen: undefined })).toMatchObject({ newer: false });
    expect(genBlocker({ format: 9, genVersion: 9 })).toMatchObject({ saveGenVersion: 9, newer: true });
    expect(genBlocker({ format: 9, genVersion: 6 }, { allowGenMismatch: true })).toBeNull();
    expect(genBlocker({ ...ok8, outerGen: 1 }, { allowGenMismatch: true })).toMatchObject({ newer: true });
    expect(genBlocker({ format: 9, genVersion: 7, outerGen: 2 })?.message).toMatch(/outer/);
    expect(validGen2(undefined)).toBeUndefined();
    expect(() => validGen2({ locks: [[1, 1, 0, 'nope']] })).toThrow(SaveFormatError);
    expect(validGen2({ locks: [[1, 1, 0, null]], junk: 1 })).toEqual({ locks: [[1, 1, 0, null]] });
  });

  it('讀檔：v8 存檔缺 gen2 / v7 存檔帶 gen2 = 損毀；v8 較新版 → gen_version newer；v8 不是正式尺寸 → size', () => {
    const g = new DelveGame({ seed: 'v7', width: 160, height: 100 });
    const legacy = snapshotGame(g, 1);
    const withGen2 = encodeSave({ ...legacy, header: { ...legacy.header, gen2: { locks: [] } } });
    expect(() => decodeSave(withGen2)).toThrow(SaveFormatError);
    expect(restoreGame(withGen2)).toMatchObject({ ok: false, error: 'format' });
    const v8 = { ...legacy.header, genVersion: 8, bounds: 'infinite' as const, outerGen: 0 };
    expect(() => decodeSave(encodeSave({ ...legacy, header: v8 }))).toThrow(SaveFormatError);
    expect(restoreGame(encodeSave({ ...legacy, header: { ...v8, gen2: { locks: [] } } }))).toMatchObject({ ok: false, error: 'size' });
    const newer = restoreGame(encodeSave({ ...legacy, header: { ...v8, outerGen: GEN2_VERSION + 1, gen2: { locks: [] } } }));
    expect(newer).toMatchObject({ ok: false, error: 'gen_version', saveGenVersion: 8, newer: true });
    // 未知的較新 genVersion：gen2 欄位長什麼樣都不管（不會被當成損毀），一律「請更新」
    const v9 = restoreGame(encodeSave({ ...legacy, header: { ...legacy.header, genVersion: 9, gen2: { locks: 'future' } as never } }));
    expect(v9).toMatchObject({ ok: false, error: 'gen_version', saveGenVersion: 9, newer: true });
  });

  it('世界檔（format 11）的 gen2 欄位經 splitSnapshot / decodeWorld / joinSplit 往返不變', () => {
    const g = gen2Game();
    const want = snapshotGame(g, 1).header.gen2!;
    expect(want.locks.length).toBeGreaterThan(1);
    const { world, character } = saveSplitGame(g, who, where, 1);
    const back = decodeWorld(encodeWorld(world));
    expect(back.header.gen2).toEqual(want);
    expect(joinSplit(back, character).data.header.gen2).toEqual(want);
    expect(back.header.genVersion).toBe(8);
    expect(back.header.outerGen).toBe(GEN2_VERSION);
    // 舊世界的世界檔沒有 gen2 欄位（B6）
    const legacy = saveSplitGame(new DelveGame({ seed: 'v7', width: 160, height: 100 }), who, where, 1).world;
    expect('gen2' in decodeWorld(encodeWorld(legacy)).header).toBe(false);
    // 世界檔：v8 缺 gen2 = 損毀
    const { gen2: _g, ...noGen2 } = world.header;
    expect(() => decodeWorld(encodeWorld({ ...world, header: noGen2 }))).toThrow(SaveFormatError);
  }, 60000);
});
