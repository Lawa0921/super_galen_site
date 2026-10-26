import { describe, it, expect, beforeEach, vi } from 'vitest';

/**
 * /api/signal 端點測試（檔名底線開頭，避免 Astro 當成路由）。
 * 無 Upstash env → MemoryStore 單例；每 case resetModules 取乾淨單例，端點與測試共用同一個 store。
 */

async function load() {
  const api = await import('./signal');
  const { getSignalStore } = await import('@scripts/games/tetris/net/signalStore');
  return { GET: api.GET, store: getSignalStore({}) };
}

type Get = Awaited<ReturnType<typeof load>>['GET'];

async function get(GET: Get, qs: string): Promise<{ status: number; json: Record<string, unknown> }> {
  const url = new URL(`http://localhost/api/signal?${qs}`);
  const res = await GET({ url, request: new Request(url) } as unknown as Parameters<Get>[0]);
  return { status: res.status, json: (await res.json()) as Record<string, unknown> };
}

describe('GET /api/signal', () => {
  beforeEach(() => { vi.resetModules(); });

  it('單槽 GET 照舊：{ data: string|null }', async () => {
    const { GET, store } = await load();
    await store.set('sig:R:guest-0-offer', 'x', 60);
    expect(await get(GET, 'room=R&slot=guest-0-offer')).toEqual({ status: 200, json: { data: 'x' } });
    expect(await get(GET, 'room=R&slot=guest-1-offer')).toEqual({ status: 200, json: { data: null } });
  });

  it('slots=a,b,c → 一次回 { data: { slot: 值|null } }，只呼叫一次 mget', async () => {
    const { GET, store } = await load();
    await store.set('sig:delve:R:guest-0-offer', 'o0', 60);
    await store.set('sig:delve:R:guest-2-offer', 'o2', 60);
    const mget = vi.spyOn(store, 'mget');
    const r = await get(GET, `room=${encodeURIComponent('delve:R')}&slots=guest-0-offer,guest-1-offer,guest-2-offer,guest-3-offer`);
    expect(r.status).toBe(200);
    expect(r.json).toEqual({ data: { 'guest-0-offer': 'o0', 'guest-1-offer': null, 'guest-2-offer': 'o2', 'guest-3-offer': null } });
    expect(mget).toHaveBeenCalledTimes(1);
    expect(mget).toHaveBeenCalledWith([
      'sig:delve:R:guest-0-offer', 'sig:delve:R:guest-1-offer', 'sig:delve:R:guest-2-offer', 'sig:delve:R:guest-3-offer',
    ]);
  });

  it('slots 剛好 8 個 → 200', async () => {
    const { GET } = await load();
    const slots = [0, 1, 2, 3, 4, 5, 6].map((i) => `guest-${i}-offer`).concat('offer');
    expect((await get(GET, `room=R&slots=${slots.join(',')}`)).status).toBe(200);
  });

  it.each([
    ['任一槽位非法', 'room=R&slots=guest-0-offer,bogus'],
    ['超過 8 個', `room=R&slots=${[0, 1, 2, 3, 4, 5, 6].map((i) => `guest-${i}-offer`).concat('offer', 'answer').join(',')}`],
    ['空的 slots', 'room=R&slots='],
    ['有空項目', 'room=R&slots=guest-0-offer,,guest-1-offer'],
    ['缺 room', 'slots=guest-0-offer'],
  ])('%s → 400', async (_name, qs) => {
    const { GET } = await load();
    expect((await get(GET, qs)).status).toBe(400);
  });
});
