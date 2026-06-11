import { describe, it, expect, vi, afterEach } from 'vitest';
import { createRoom, getSlot, isValidSlot } from './signalClient';

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

describe('isValidSlot：槽位白名單驗證', () => {
  // --- 1v1 既有槽位零回歸 ---
  it('offer 合法', () => expect(isValidSlot('offer')).toBe(true));
  it('answer 合法', () => expect(isValidSlot('answer')).toBe(true));

  // --- 多人新槽位 ---
  it('host-offer 合法', () => expect(isValidSlot('host-offer')).toBe(true));

  it('guest-0-answer 合法', () => expect(isValidSlot('guest-0-answer')).toBe(true));
  it('guest-6-answer 合法（最大 guest index）', () => expect(isValidSlot('guest-6-answer')).toBe(true));
  it('guest-3-answer 合法（中間值）', () => expect(isValidSlot('guest-3-answer')).toBe(true));

  it('host-ack-0 合法', () => expect(isValidSlot('host-ack-0')).toBe(true));
  it('host-ack-6 合法（最大 ack index）', () => expect(isValidSlot('host-ack-6')).toBe(true));
  it('host-ack-3 合法（中間值）', () => expect(isValidSlot('host-ack-3')).toBe(true));

  // --- guest-initiated 星狀槽位（T11：每 guest 各自的 offer）---
  it('guest-0-offer 合法', () => expect(isValidSlot('guest-0-offer')).toBe(true));
  it('guest-6-offer 合法（最大 guest index）', () => expect(isValidSlot('guest-6-offer')).toBe(true));
  it('guest-4-offer 合法（中間值）', () => expect(isValidSlot('guest-4-offer')).toBe(true));

  // --- 未知/超範圍槽位必須被拒 ---
  it('bogus → 非法', () => expect(isValidSlot('bogus')).toBe(false));
  it('guest-7-answer 超範圍（> 6）→ 非法', () => expect(isValidSlot('guest-7-answer')).toBe(false));
  it('guest-9-answer 超範圍 → 非法', () => expect(isValidSlot('guest-9-answer')).toBe(false));
  it('host-ack-7 超範圍（> 6）→ 非法', () => expect(isValidSlot('host-ack-7')).toBe(false));
  it('host-ack-99 超範圍 → 非法', () => expect(isValidSlot('host-ack-99')).toBe(false));
  it('guest-7-offer 超範圍（> 6）→ 非法', () => expect(isValidSlot('guest-7-offer')).toBe(false));
  it('guest-9-offer 超範圍 → 非法', () => expect(isValidSlot('guest-9-offer')).toBe(false));
  it('guest-offer（缺 index）→ 非法', () => expect(isValidSlot('guest-offer')).toBe(false));
  it('空字串 → 非法', () => expect(isValidSlot('')).toBe(false));
  it('guest-answer（缺 index）→ 非法', () => expect(isValidSlot('guest-answer')).toBe(false));
  it('host-ack（缺 index）→ 非法', () => expect(isValidSlot('host-ack')).toBe(false));
  it('OFFER（大寫）→ 非法（大小寫敏感）', () => expect(isValidSlot('OFFER')).toBe(false));

  // --- 世代化遷移槽位（host migration：mig{1..6}-guest-{0..6}-offer / mig{1..6}-host-ack-{0..6}）---
  it('mig1-guest-0-offer 合法（最小世代/最小 index）', () =>
    expect(isValidSlot('mig1-guest-0-offer')).toBe(true));
  it('mig6-guest-6-offer 合法（最大世代/最大 index）', () =>
    expect(isValidSlot('mig6-guest-6-offer')).toBe(true));
  it('mig1-host-ack-0 合法（最小世代/最小 index）', () =>
    expect(isValidSlot('mig1-host-ack-0')).toBe(true));
  it('mig6-host-ack-6 合法（最大世代/最大 index）', () =>
    expect(isValidSlot('mig6-host-ack-6')).toBe(true));
  it('mig3-guest-2-offer 合法（中間值）', () =>
    expect(isValidSlot('mig3-guest-2-offer')).toBe(true));
  it('mig0-guest-0-offer（g=0）→ 非法', () =>
    expect(isValidSlot('mig0-guest-0-offer')).toBe(false));
  it('mig7-guest-0-offer（g=7 超範圍）→ 非法', () =>
    expect(isValidSlot('mig7-guest-0-offer')).toBe(false));
  it('mig1-guest-7-offer（i=7 超範圍）→ 非法', () =>
    expect(isValidSlot('mig1-guest-7-offer')).toBe(false));
  it('mig7-host-ack-0（g=7 超範圍）→ 非法', () =>
    expect(isValidSlot('mig7-host-ack-0')).toBe(false));
  it('mig1-host-ack-7（i=7 超範圍）→ 非法', () =>
    expect(isValidSlot('mig1-host-ack-7')).toBe(false));
  it('mig-guest-0-offer（缺世代數字）→ 非法', () =>
    expect(isValidSlot('mig-guest-0-offer')).toBe(false));
  it('mig1-guest-0-answer（遷移流程無 answer 形式）→ 非法', () =>
    expect(isValidSlot('mig1-guest-0-answer')).toBe(false));
});

describe('isValidSlot 用在 getSlot：非法槽位直接拋錯（不發 fetch）', () => {
  it('bogus 槽位 → getSlot 拋錯，不打網路', async () => {
    const spy = vi.fn();
    vi.stubGlobal('fetch', spy);
    // @ts-expect-error 故意傳非法槽位測試 runtime 守衛
    await expect(getSlot('AB12C', 'bogus')).rejects.toThrow(/invalid slot/i);
    expect(spy).not.toHaveBeenCalled();
  });

  it('guest-9-answer 超範圍 → getSlot 拋錯，不打網路', async () => {
    const spy = vi.fn();
    vi.stubGlobal('fetch', spy);
    // @ts-expect-error 超範圍
    await expect(getSlot('AB12C', 'guest-9-answer')).rejects.toThrow(/invalid slot/i);
    expect(spy).not.toHaveBeenCalled();
  });
});

describe('不同 matchId（room）的同槽位資料互相隔離', () => {
  it('roomA/offer 與 roomB/offer 讀到各自的資料', async () => {
    // 模擬兩個 room 各回自己的值
    vi.stubGlobal('fetch', async (url: string) => {
      const u = new URL(url, 'http://localhost');
      const room = u.searchParams.get('room');
      return {
        ok: true,
        status: 200,
        json: async () => ({ data: room === 'ROOM1' ? 'sdp-A' : 'sdp-B' }),
      } as unknown as Response;
    });
    expect(await getSlot('ROOM1', 'offer')).toBe('sdp-A');
    expect(await getSlot('ROOM2', 'offer')).toBe('sdp-B');
  });
});
