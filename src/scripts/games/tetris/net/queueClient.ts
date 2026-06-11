/**
 * 快速配對隊列前端 client：與 /api/queue 互動的輪詢迴圈。
 *
 * 職責（對應計畫 Q4）：
 *   - startQueue：join 後啟動雙計時器（poll 每 intervalMs、heartbeat 每 heartbeatMs）
 *   - poll 回 waiting → onUpdate(waitedMs)；回 matched → 停掉雙計時器並 onMatched(info)
 *   - cancel()：送 leave 並清計時器
 *   - fetch 連續失敗（初次 + MAX_FETCH_RETRIES 次重試）→ onError 並停止
 *
 * API 形狀（與 /api/queue 對齊，見計畫 Q3）：
 *   POST { action: 'join'|'heartbeat'|'poll'|'leave', id, name?, rating? }
 *   poll 回 { matched: { room, role, mode, count, players } }
 *        或 { waiting: true, position, waitedMs }
 */
const API = '/api/queue';

/** 連續 fetch 失敗的重試上限：初次失敗後再重試 3 次，仍失敗才 onError。 */
export const MAX_FETCH_RETRIES = 3;

export interface MatchedInfo {
  room: string;
  role: 'host' | 'guest';
  mode: '1v1' | 'ffa';
  count: number;
  players: { id: string; name: string }[];
}

export interface StartQueueOpts {
  id: string;
  name: string;
  rating: number;
  onUpdate: (waitedMs: number) => void;
  onMatched: (info: MatchedInfo) => void;
  onError: (err: Error) => void;
  /** 測試注入用；預設 globalThis.fetch。 */
  fetchFn?: typeof fetch;
  /** poll 間隔，預設 3000ms。 */
  intervalMs?: number;
  /** heartbeat 間隔，預設 5000ms。 */
  heartbeatMs?: number;
}

export interface QueueHandle {
  cancel(): void;
}

export function startQueue(opts: StartQueueOpts): QueueHandle {
  const fetchFn = opts.fetchFn ?? fetch;
  const intervalMs = opts.intervalMs ?? 3000;
  const heartbeatMs = opts.heartbeatMs ?? 5000;

  let stopped = false;
  let pollTimer: ReturnType<typeof setInterval> | null = null;
  let hbTimer: ReturnType<typeof setInterval> | null = null;
  let consecutiveFailures = 0;

  async function post(body: Record<string, unknown>): Promise<Record<string, unknown>> {
    const res = await fetchFn(API, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`queue api ${res.status}`);
    return (await res.json()) as Record<string, unknown>;
  }

  function stopTimers(): void {
    if (pollTimer !== null) {
      clearInterval(pollTimer);
      pollTimer = null;
    }
    if (hbTimer !== null) {
      clearInterval(hbTimer);
      hbTimer = null;
    }
  }

  /** 失敗一次：超過重試上限就 onError 並整個停掉；否則等下一個 tick 自然重試。 */
  function recordFailure(err: unknown): void {
    consecutiveFailures += 1;
    if (consecutiveFailures > MAX_FETCH_RETRIES) {
      stopped = true;
      stopTimers();
      opts.onError(err instanceof Error ? err : new Error(String(err)));
    }
  }

  async function pollOnce(): Promise<void> {
    try {
      const r = await post({ action: 'poll', id: opts.id });
      consecutiveFailures = 0;
      if (stopped) return;
      const matched = r.matched as MatchedInfo | undefined;
      if (matched) {
        stopped = true;
        stopTimers();
        opts.onMatched(matched);
        return;
      }
      if (typeof r.waitedMs === 'number') opts.onUpdate(r.waitedMs);
    } catch (err) {
      if (!stopped) recordFailure(err);
    }
  }

  async function heartbeatOnce(): Promise<void> {
    try {
      await post({ action: 'heartbeat', id: opts.id });
      consecutiveFailures = 0;
    } catch (err) {
      if (!stopped) recordFailure(err);
    }
  }

  // join → 成功後啟動雙計時器
  void (async () => {
    try {
      await post({ action: 'join', id: opts.id, name: opts.name, rating: opts.rating });
      if (stopped) return; // join 還沒回來就被 cancel
      pollTimer = setInterval(() => void pollOnce(), intervalMs);
      hbTimer = setInterval(() => void heartbeatOnce(), heartbeatMs);
    } catch (err) {
      if (!stopped) {
        stopped = true;
        opts.onError(err instanceof Error ? err : new Error(String(err)));
      }
    }
  })();

  return {
    cancel(): void {
      if (stopped) return; // matched/onError 後 cancel 為 no-op（不重複送 leave）
      stopped = true;
      stopTimers();
      void post({ action: 'leave', id: opts.id }).catch(() => {
        /* leave 失敗交給 entry TTL 自然過期 */
      });
    },
  };
}
