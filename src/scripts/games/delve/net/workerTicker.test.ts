// workerTicker.test.ts — Worker 計時器：分頁在背景時 setInterval 被節流，改由 Worker 內的計時器驅動
import { describe, it, expect, vi, afterEach } from 'vitest';
import { workerTicker, type TickWorker } from './workerTicker';
import { DELVE_BUILD } from './build';

function fakeWorker() {
  const w = {
    sent: [] as number[],
    terminated: 0,
    onmessage: null as ((e: { data: unknown }) => void) | null,
    onerror: null as ((e: unknown) => void) | null,
    postMessage(ms: number) { w.sent.push(ms); },
    terminate() { w.terminated++; },
  };
  return w satisfies TickWorker & Record<string, unknown>;
}

afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

describe('workerTicker', () => {
  it('start 把間隔送給 worker；訊息觸發 cb', () => {
    const w = fakeWorker();
    const t = workerTicker(() => w);
    const cb = vi.fn();
    t.start(cb, 16);
    expect(w.sent).toEqual([16]);
    w.onmessage!({ data: 0 });
    w.onmessage!({ data: 0 });
    expect(cb).toHaveBeenCalledTimes(2);
    expect(typeof cb.mock.calls[0][0]).toBe('number');
  });

  it('stop 後 terminate，之後的訊息不再呼叫 cb', () => {
    const w = fakeWorker();
    const t = workerTicker(() => w);
    const cb = vi.fn();
    t.start(cb, 16);
    const handler = w.onmessage!;
    t.stop();
    expect(w.sent).toEqual([16, 0]);
    expect(w.terminated).toBe(1);
    handler({ data: 0 });
    expect(cb).not.toHaveBeenCalled();
  });

  it('沒有 Worker → 退回 setInterval', () => {
    vi.useFakeTimers();
    vi.stubGlobal('Worker', undefined);
    const t = workerTicker();
    const cb = vi.fn();
    t.start(cb, 10);
    vi.advanceTimersByTime(35);
    expect(cb).toHaveBeenCalledTimes(3);
    t.stop();
    vi.advanceTimersByTime(50);
    expect(cb).toHaveBeenCalledTimes(3);
  });

  it('建構 Worker 丟錯 → 退回 setInterval', () => {
    vi.useFakeTimers();
    const t = workerTicker(() => { throw new Error('csp'); });
    const cb = vi.fn();
    t.start(cb, 10);
    vi.advanceTimersByTime(25);
    expect(cb).toHaveBeenCalledTimes(2);
    t.stop();
  });
});

describe('workerTicker 失敗保護', () => {
  it('error 事件 → 改用 setInterval 繼續跳', () => {
    vi.useFakeTimers();
    const w = fakeWorker();
    const t = workerTicker(() => w);
    const cb = vi.fn();
    t.start(cb, 10);
    w.onerror!(new Event('error'));
    expect(w.terminated).toBe(1);
    vi.advanceTimersByTime(35);
    expect(cb).toHaveBeenCalledTimes(3);
    t.stop();
  });

  it('worker 一直沒訊息 → 看門狗後退回 setInterval', () => {
    vi.useFakeTimers();
    const w = fakeWorker();
    const t = workerTicker(() => w);
    const cb = vi.fn();
    t.start(cb, 10);
    vi.advanceTimersByTime(249);
    expect(cb).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1 + 30); // 250ms 看門狗觸發，之後每 10ms 一次
    expect(w.terminated).toBe(1);
    expect(cb).toHaveBeenCalledTimes(3);
    t.stop();
  });

  it('正常 worker：看門狗不觸發、不重複跳', () => {
    vi.useFakeTimers();
    const w = fakeWorker();
    const t = workerTicker(() => w);
    const cb = vi.fn();
    t.start(cb, 10);
    w.onmessage!({ data: 0 });
    vi.advanceTimersByTime(1000);
    expect(w.terminated).toBe(0);
    expect(cb).toHaveBeenCalledTimes(1);
    t.stop();
    expect(w.terminated).toBe(1);
  });
});

describe('DELVE_BUILD', () => {
  it('DELVE_BUILD 在 vitest 下是 dev', () => {
    expect(DELVE_BUILD).toBe('dev');
  });
});
