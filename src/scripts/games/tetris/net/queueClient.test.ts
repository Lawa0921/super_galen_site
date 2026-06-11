import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { startQueue, MAX_FETCH_RETRIES, type MatchedInfo } from './queueClient';

/** 記錄所有 POST body 的 mock fetch 工廠。 */
function makeFetch(handler: (body: Record<string, unknown>, callIndex: number) => unknown) {
  const calls: Record<string, unknown>[] = [];
  const fetchFn = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>;
    calls.push(body);
    const result = handler(body, calls.length - 1);
    if (result instanceof Error) throw result;
    return { ok: true, status: 200, json: async () => result } as unknown as Response;
  });
  return { fetchFn: fetchFn as unknown as typeof fetch, calls };
}

const MATCH: MatchedInfo = {
  room: 'AB12C',
  role: 'host',
  mode: '1v1',
  count: 2,
  players: [
    { id: 'p1', name: 'Alice' },
    { id: 'p2', name: 'Bob' },
  ],
};

function baseOpts(over: Partial<Parameters<typeof startQueue>[0]> = {}) {
  return {
    id: 'p1',
    name: 'Alice',
    rating: 1200,
    onUpdate: vi.fn(),
    onMatched: vi.fn(),
    onError: vi.fn(),
    intervalMs: 3000,
    heartbeatMs: 5000,
    ...over,
  };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('queueClient startQueue', () => {
  it('join 後 poll 到 waiting → onUpdate(waitedMs)', async () => {
    const { fetchFn, calls } = makeFetch((body) => {
      if (body.action === 'join') return { ok: true };
      if (body.action === 'poll') return { waiting: true, position: 1, waitedMs: 3210 };
      return { ok: true };
    });
    const opts = baseOpts({ fetchFn });
    startQueue(opts);
    await vi.advanceTimersByTimeAsync(0); // 讓 join 完成
    expect(calls[0]).toMatchObject({ action: 'join', id: 'p1', name: 'Alice', rating: 1200 });

    await vi.advanceTimersByTimeAsync(3000); // 第一次 poll
    expect(opts.onUpdate).toHaveBeenCalledWith(3210);
    expect(opts.onMatched).not.toHaveBeenCalled();
    expect(opts.onError).not.toHaveBeenCalled();
  });

  it('poll 到 matched → 停掉雙計時器並 onMatched(info)', async () => {
    const { fetchFn, calls } = makeFetch((body) => {
      if (body.action === 'join') return { ok: true };
      if (body.action === 'poll') return { matched: MATCH };
      return { ok: true };
    });
    const opts = baseOpts({ fetchFn });
    startQueue(opts);
    await vi.advanceTimersByTimeAsync(3000); // join + 第一次 poll → matched
    expect(opts.onMatched).toHaveBeenCalledTimes(1);
    expect(opts.onMatched).toHaveBeenCalledWith(MATCH);

    const callsAfterMatch = calls.length;
    await vi.advanceTimersByTimeAsync(60_000); // matched 後不該再有任何請求
    expect(calls.length).toBe(callsAfterMatch);
    expect(opts.onMatched).toHaveBeenCalledTimes(1);
  });

  it('cancel() → 送 leave 並清計時器（之後不再 poll/heartbeat）', async () => {
    const { fetchFn, calls } = makeFetch((body) => {
      if (body.action === 'poll') return { waiting: true, position: 1, waitedMs: 100 };
      return { ok: true };
    });
    const opts = baseOpts({ fetchFn });
    const handle = startQueue(opts);
    await vi.advanceTimersByTimeAsync(3000); // join + 一次 poll

    handle.cancel();
    await vi.advanceTimersByTimeAsync(0); // 讓 leave 請求送出
    expect(calls.some((c) => c.action === 'leave' && c.id === 'p1')).toBe(true);

    const callsAfterCancel = calls.length;
    await vi.advanceTimersByTimeAsync(60_000);
    expect(calls.length).toBe(callsAfterCancel); // 沒有新的 poll/heartbeat
    expect(opts.onError).not.toHaveBeenCalled();
  });

  it('heartbeat 依 heartbeatMs 週期送出', async () => {
    const { fetchFn, calls } = makeFetch((body) => {
      if (body.action === 'poll') return { waiting: true, position: 1, waitedMs: 100 };
      return { ok: true };
    });
    // 把 poll 間隔拉大，隔離 heartbeat 行為
    const opts = baseOpts({ fetchFn, intervalMs: 100_000, heartbeatMs: 5000 });
    startQueue(opts);
    await vi.advanceTimersByTimeAsync(0); // join 完成

    await vi.advanceTimersByTimeAsync(5000);
    expect(calls.filter((c) => c.action === 'heartbeat').length).toBe(1);
    await vi.advanceTimersByTimeAsync(5000);
    expect(calls.filter((c) => c.action === 'heartbeat').length).toBe(2);
    expect(calls.filter((c) => c.action === 'heartbeat').every((c) => c.id === 'p1')).toBe(true);
  });

  it(`fetch 連續失敗（初次 + ${MAX_FETCH_RETRIES} 次重試）→ onError 且停止輪詢`, async () => {
    const { fetchFn, calls } = makeFetch((body) => {
      if (body.action === 'join') return { ok: true };
      return new Error('network down');
    });
    // heartbeat 拉遠，讓失敗計數只來自 poll
    const opts = baseOpts({ fetchFn, intervalMs: 1000, heartbeatMs: 100_000 });
    startQueue(opts);
    await vi.advanceTimersByTimeAsync(0); // join 成功

    // 失敗 1~MAX_FETCH_RETRIES 次：還在重試，不報錯
    await vi.advanceTimersByTimeAsync(1000 * MAX_FETCH_RETRIES);
    expect(opts.onError).not.toHaveBeenCalled();

    // 第 MAX_FETCH_RETRIES+1 次連續失敗 → onError
    await vi.advanceTimersByTimeAsync(1000);
    expect(opts.onError).toHaveBeenCalledTimes(1);

    const callsAfterError = calls.length;
    await vi.advanceTimersByTimeAsync(60_000); // 停止後不再有請求
    expect(calls.length).toBe(callsAfterError);
    expect(opts.onMatched).not.toHaveBeenCalled();
  });

  it('matched 之後不再送 heartbeat', async () => {
    const { fetchFn, calls } = makeFetch((body) => {
      if (body.action === 'join') return { ok: true };
      if (body.action === 'poll') return { matched: MATCH };
      return { ok: true };
    });
    const opts = baseOpts({ fetchFn, intervalMs: 3000, heartbeatMs: 5000 });
    startQueue(opts);
    await vi.advanceTimersByTimeAsync(3000); // 第一次 poll 就 matched（在 heartbeat 5000 之前）
    expect(opts.onMatched).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(30_000);
    expect(calls.filter((c) => c.action === 'heartbeat').length).toBe(0);
  });

  it('poll 一度失敗後成功 → 失敗計數歸零，不會誤觸 onError', async () => {
    let failNext = true;
    const { fetchFn } = makeFetch((body) => {
      if (body.action === 'join') return { ok: true };
      if (body.action === 'poll') {
        if (failNext) {
          failNext = false;
          return new Error('blip');
        }
        return { waiting: true, position: 1, waitedMs: 500 };
      }
      return { ok: true };
    });
    const opts = baseOpts({ fetchFn, intervalMs: 1000, heartbeatMs: 100_000 });
    startQueue(opts);
    await vi.advanceTimersByTimeAsync(1000); // 失敗一次
    expect(opts.onError).not.toHaveBeenCalled();

    // 之後全部成功 → 連跑很多輪也不會 onError
    await vi.advanceTimersByTimeAsync(10_000);
    expect(opts.onError).not.toHaveBeenCalled();
    expect(opts.onUpdate).toHaveBeenCalledWith(500);
  });

  it('伺服器回非 2xx 也算失敗（計入重試）', async () => {
    const fetchFn = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>;
      if (body.action === 'join') {
        return { ok: true, status: 200, json: async () => ({ ok: true }) } as unknown as Response;
      }
      return { ok: false, status: 500, json: async () => ({}) } as unknown as Response;
    }) as unknown as typeof fetch;
    const opts = baseOpts({ fetchFn, intervalMs: 1000, heartbeatMs: 100_000 });
    startQueue(opts);
    await vi.advanceTimersByTimeAsync(1000 * (MAX_FETCH_RETRIES + 1));
    expect(opts.onError).toHaveBeenCalledTimes(1);
  });
});
