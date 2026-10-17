// storage.test.ts — gzip 解壓的錯誤對應（截斷 / 損毀 → 友善訊息）與解壓上限（node 有 CompressionStream）
import { describe, it, expect } from 'vitest';
import { compress, decompress, importBlob, SaveFileError, CORRUPT_MSG, MAX_DECOMPRESSED } from './storage';

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
