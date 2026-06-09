import { describe, it, expect, vi, afterEach } from 'vitest';
import { createRoom, getSlot } from './signalClient';

afterEach(() => vi.unstubAllGlobals());

describe('signalClient 對非 2xx 回應的處理', () => {
  it('postJson：伺服器回 5xx → createRoom 拋出含狀態碼的錯誤', async () => {
    vi.stubGlobal('fetch', async () => ({ ok: false, status: 502, json: async () => ({}) }) as unknown as Response);
    await expect(createRoom()).rejects.toThrow(/502/);
  });

  it('getSlot：伺服器回 5xx → 拋出含狀態碼的錯誤（不會把 HTML 當 JSON 解析）', async () => {
    vi.stubGlobal('fetch', async () => ({ ok: false, status: 500, json: async () => ({}) }) as unknown as Response);
    await expect(getSlot('AB12C', 'offer')).rejects.toThrow(/500/);
  });

  it('正常 2xx → createRoom 回房號', async () => {
    vi.stubGlobal('fetch', async () => ({ ok: true, status: 200, json: async () => ({ room: 'AB12C' }) }) as unknown as Response);
    await expect(createRoom()).resolves.toBe('AB12C');
  });
});
