// storage.test.ts — gzip 解壓的錯誤對應（截斷 / 損毀 → 友善訊息）、解壓上限（node 有 CompressionStream）、自動存檔排程
import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  compress, decompress, importBlob, startAutosave, previewOf, characterRecord, characterMeta, SaveFileError, CORRUPT_MSG, MAX_DECOMPRESSED,
  type SlotMeta,
} from './storage';
import { DelveGame } from '../engine/game';
import { OUTFITS, normalizeAppearance } from '../engine/appearance';
import { plainLook, type DollLook } from '../engine/doll';
import { avatarSheet } from '../render/avatarArt';
import { charDollLook } from '../render/titleModel';
import { createCharacter, decodeCharacter, encodeCharacter, type DelveCharacter } from './character';
import { restoreSplit, saveSplitGame } from './worldSave';

describe('decompress', () => {
  it('壓縮 / 解壓往返；不是 gzip 的原樣回傳', async () => {
    const raw = new TextEncoder().encode('DLVS hello hello hello hello');
    const z = await compress(raw);
    expect(z[0]).toBe(0x1f);
    expect([...await decompress(z)]).toEqual([...raw]);
    expect([...await decompress(raw)]).toEqual([...raw]);
  });

  it('截斷的 gzip → 「存檔檔案已損毀或不完整」', async () => {
    const raw = new Uint8Array(200_000).map((_, i) => (i * 7919) & 0xff);
    const z = await compress(raw);
    const cut = z.slice(0, Math.floor(z.length / 2));
    await expect(decompress(cut)).rejects.toThrow(CORRUPT_MSG);
    await expect(importBlob(new Blob([cut]))).rejects.toBeInstanceOf(SaveFileError);
    expect(CORRUPT_MSG).toBe('存檔檔案已損毀或不完整');
  });

  it('壞掉的 gzip 內容 → 同樣的友善訊息', async () => {
    const z = await compress(new Uint8Array(5000).fill(3));
    const bad = z.slice();
    for (let i = 12; i < bad.length - 8; i++) bad[i] ^= 0x5a;
    await expect(decompress(bad)).rejects.toThrow(CORRUPT_MSG);
  });

  it('解壓超過上限 → 中止（不會吃光記憶體）', async () => {
    expect(MAX_DECOMPRESSED).toBe(64 * 1024 * 1024);
    const z = await compress(new Uint8Array(4096).fill(0));
    await expect(decompress(z, 1024)).rejects.toThrow(/太大/);
  });
});

describe('startAutosave', () => {
  const meta: SlotMeta = { slot: 'main', seed: 's', savedAt: 1, bytes: 3 };
  afterEach(() => { vi.useRealTimers(); });

  it('每 intervalMs 與 pagehide 呼叫 save；上一次沒寫完不會重入', async () => {
    vi.useFakeTimers();
    let release!: () => void;
    const save = vi.fn(() => new Promise<SlotMeta>((r) => { release = () => r(meta); }));
    const onSaved = vi.fn();
    const stop = startAutosave({ save, intervalMs: 1000, onSaved });
    vi.advanceTimersByTime(1000); expect(save).toHaveBeenCalledTimes(1);
    globalThis.dispatchEvent(new Event('pagehide')); expect(save).toHaveBeenCalledTimes(1); // busy
    release(); await vi.advanceTimersByTimeAsync(0); // 只沖 microtask，不推時間（interval 不會跑）
    expect(onSaved).toHaveBeenCalledWith(meta); expect(save).toHaveBeenCalledTimes(1);
    globalThis.dispatchEvent(new Event('pagehide')); expect(save).toHaveBeenCalledTimes(2); // 只有 pagehide 觸發
    stop();
  });

  it('閒置時 pagehide 立刻存一次（不用等 interval）', () => {
    vi.useFakeTimers();
    const save = vi.fn(async () => meta);
    const stop = startAutosave({ save, intervalMs: 60_000 });
    globalThis.dispatchEvent(new Event('pagehide'));
    expect(save).toHaveBeenCalledTimes(1);
    stop();
  });

  it('save 丟錯 → onError，之後還能再存', async () => {
    vi.useFakeTimers();
    const err = new Error('tx aborted');
    const save = vi.fn<() => Promise<SlotMeta>>().mockRejectedValueOnce(err).mockResolvedValue(meta);
    const onError = vi.fn(), onSaved = vi.fn();
    const stop = startAutosave({ save, intervalMs: 1000, onSaved, onError });
    await vi.advanceTimersByTimeAsync(1000);
    expect(save).toHaveBeenCalledTimes(1);
    expect(onError).toHaveBeenCalledTimes(1); expect(onError).toHaveBeenCalledWith(err);
    await vi.advanceTimersByTimeAsync(1000);
    expect(save).toHaveBeenCalledTimes(2);
    expect(onSaved).toHaveBeenCalledWith(meta); expect(onError).toHaveBeenCalledTimes(1);
    stop();
  });

  it('save 同步丟錯也走 onError，不會卡住 busy', async () => {
    vi.useFakeTimers();
    const save = vi.fn<() => Promise<SlotMeta>>().mockImplementationOnce(() => { throw new Error('sync'); }).mockResolvedValue(meta);
    const onError = vi.fn();
    const stop = startAutosave({ save, intervalMs: 1000, onError });
    await vi.advanceTimersByTimeAsync(1000); expect(onError).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1000); expect(save).toHaveBeenCalledTimes(2);
    stop();
  });

  it('stop 之後不再呼叫 save', async () => {
    vi.useFakeTimers();
    const save = vi.fn(async () => meta);
    const stop = startAutosave({ save, intervalMs: 1000 });
    stop();
    await vi.advanceTimersByTimeAsync(5000);
    globalThis.dispatchEvent(new Event('pagehide'));
    expect(save).not.toHaveBeenCalled();
  });
});

describe('角色列表預覽（preview.look）', () => {
  const sheet = (l: DollLook): string => avatarSheet(l).b.px.join();
  it('轉換後的角色：預覽畫的是穿著原本衣服的樣子（不是布衣）；舊記錄沒有 look → 只畫外觀', () => {
    const app = normalizeAppearance({ outfit: OUTFITS.findIndex((o) => o.id === 'gothic'), color1: 3, color2: 7, acc: 1 });
    const g = new DelveGame({ seed: 'preview', width: 160, height: 100, appearance: app });
    g.give('iron_helmet'); g.equipFromInventory(g.inventory.slots.findIndex((x) => x?.item === 'iron_helmet'));
    const before = g.doll().look;
    const who = { id: 'p-1', nick: 'p', createdAt: 0, rev: 0 }, where = { worldId: 'w', worldName: 'preview', visits: {} };
    const old = { ...saveSplitGame(g, who, where, 1).character, cformat: 1 } as DelveCharacter;
    const r = restoreSplit(saveSplitGame(g, who, where, 1).world, decodeCharacter(encodeCharacter(old)));
    if (!r.ok) throw new Error(r.message);
    const c = saveSplitGame(r.game, { ...who, rev: 1 }, where, 2).character;
    expect(c.cformat).toBe(2);
    const p = previewOf(c);
    expect(p.look).toBeDefined();
    expect(sheet(charDollLook(p))).toBe(sheet(before)); // 衣服 + 頭飾 + 頭盔都在
    expect(sheet(charDollLook({ appearance: c.appearance }))).toBe(sheet(plainLook(c.appearance)));
    expect(sheet(charDollLook({ appearance: c.appearance }))).not.toBe(sheet(before));
  });
});

describe('角色記錄的 pendingWorld（co-op C1）', () => {
  // IndexedDB 沒有單元測試環境：putCharacter / putSplit / listCharacters 都經這兩個純函式建記錄與列表列
  it('putCharacter 帶 pendingWorld 時 listCharacters 看得到；之後一般 putCharacter 會清掉', () => {
    const c = { ...createCharacter('乙', normalizeAppearance(undefined), 5), rev: 3 };
    const data = new Uint8Array([1, 2, 3]);
    const marked = characterRecord(c, data, 'w-friend');
    expect(marked.pendingWorld).toBe('w-friend');
    expect(characterMeta(marked, marked.preview ?? previewOf(c)).pendingWorld).toBe('w-friend');
    for (const plain of [characterRecord(c, data), characterRecord(c, data, null)]) {
      expect('pendingWorld' in plain).toBe(false);
      const m = characterMeta(plain, plain.preview ?? previewOf(c));
      expect('pendingWorld' in m).toBe(false);
      expect(m).toMatchObject({ id: c.id, nick: c.nick, savedAt: c.savedAt, rev: 3 });
    }
  });
});
