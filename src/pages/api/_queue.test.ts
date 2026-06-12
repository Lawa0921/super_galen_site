import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

/**
 * /api/queue 端點測試。
 *
 * 檔名以底線開頭（_queue.test.ts）防止 Astro 把測試檔當成路由打包，
 * 並照 _ffa-match.test.ts 手法直呼 handler（每 case vi.resetModules()
 * 取乾淨單例：無 Upstash env → MemoryQueueStore，端點與測試共用同一單例）。
 *
 * 時間控制：MemoryQueueStore 與端點都用 Date.now()，
 * 用 vi.useFakeTimers + setSystemTime 推進湊團窗（10s）與 entry TTL（15s）。
 */

const T0 = 1_750_000_000_000;

async function loadPost() {
  const mod = await import('./queue');
  return mod.POST;
}

/** 建一個 Astro APIContext 風格的呼叫物件（只用到 request / clientAddress）。 */
function ctx(body: unknown, ip = '127.0.0.1') {
  const request = new Request('http://localhost/api/queue', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { request, clientAddress: ip } as never;
}

type Post = Awaited<ReturnType<typeof loadPost>>;

async function call(POST: Post, body: unknown): Promise<{ status: number; json: Record<string, unknown> }> {
  const res = await POST(ctx(body));
  return { status: res.status, json: (await res.json()) as Record<string, unknown> };
}

async function join(POST: Post, id: string, name = id.toUpperCase(), rating = 1000) {
  const r = await call(POST, { action: 'join', id, name, rating });
  expect(r.status).toBe(200);
  return r;
}

beforeEach(() => {
  vi.resetModules();
  vi.useFakeTimers();
  vi.setSystemTime(T0);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('POST /api/queue — 參數防護', () => {
  it('壞 JSON → 400', async () => {
    const POST = await loadPost();
    const request = new Request('http://localhost/api/queue', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{ not json',
    });
    const res = await POST({ request, clientAddress: '127.0.0.1' } as never);
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: string }).error).toBe('bad json');
  });

  it('缺 id / 未知 action / 型別錯 → 400', async () => {
    const POST = await loadPost();
    expect((await call(POST, { action: 'poll' })).status).toBe(400); // 缺 id
    expect((await call(POST, { action: 'destroy', id: 'a' })).status).toBe(400); // 未知 action
    expect((await call(POST, { action: 'join', id: 42 })).status).toBe(400); // id 非字串
    expect((await call(POST, { action: 'join', id: 'a', name: 7 })).status).toBe(400); // name 非字串
    expect((await call(POST, { action: 'join', id: 'a', rating: 'x' })).status).toBe(400); // rating 非數字
  });
});

describe('POST /api/queue — join 與 pending poll', () => {
  it('join → poll 回 waiting（含 position 與 waitedMs）', async () => {
    const POST = await loadPost();
    await join(POST, 'p1', 'Alice');
    vi.setSystemTime(T0 + 4_000); // 還在 10s 湊團窗內
    const r = await call(POST, { action: 'poll', id: 'p1' });
    expect(r.status).toBe(200);
    expect(r.json.matched).toBeUndefined();
    expect(r.json.waiting).toBe(true);
    expect(r.json.position).toBe(1);
    expect(r.json.waitedMs).toBe(4_000);
  });

  it('不在隊列中的 id poll → waiting:false（不報錯，client 可自行重新 join）', async () => {
    const POST = await loadPost();
    const r = await call(POST, { action: 'poll', id: 'ghost' });
    expect(r.status).toBe(200);
    expect(r.json.matched).toBeUndefined();
    expect(r.json.waiting).toBe(false);
  });
});

describe('POST /api/queue — 撮合', () => {
  it('兩人 join → 過窗後雙方 poll 到互補 role（host=最早者）、同 room、mode 1v1', async () => {
    const POST = await loadPost();
    await join(POST, 'p1', 'Alice');
    vi.setSystemTime(T0 + 1_000);
    await join(POST, 'p2', 'Bob');
    vi.setSystemTime(T0 + 11_000); // 最早者已等滿 10s 窗

    const r1 = await call(POST, { action: 'poll', id: 'p1' });
    const m1 = r1.json.matched as Record<string, unknown>;
    expect(m1).toBeDefined();
    expect(m1.mode).toBe('1v1');
    expect(m1.count).toBe(2);
    expect(m1.role).toBe('host'); // p1 最早 join → host
    expect(typeof m1.room).toBe('string');
    expect((m1.room as string)).toMatch(/^[A-Z0-9]{5}$/);
    expect(m1.players).toEqual([
      { id: 'p1', name: 'Alice' },
      { id: 'p2', name: 'Bob' },
    ]);

    const r2 = await call(POST, { action: 'poll', id: 'p2' });
    const m2 = r2.json.matched as Record<string, unknown>;
    expect(m2).toBeDefined();
    expect(m2.role).toBe('guest');
    expect(m2.room).toBe(m1.room); // 同一房
    expect(m2.mode).toBe('1v1');
    expect(m2.players).toEqual(m1.players);

    // matched 後 entry 必須從等待池移除（防殘留再撮合）
    const { getQueueStore } = await import('@scripts/games/tetris/net/queueStore');
    expect(await getQueueStore().listWaiting()).toEqual([]);
  });

  it('三人 join → 過窗後撮成 ffa、count=3、host=最早者', async () => {
    const POST = await loadPost();
    await join(POST, 'p1');
    vi.setSystemTime(T0 + 500);
    await join(POST, 'p2');
    vi.setSystemTime(T0 + 900);
    await join(POST, 'p3');
    vi.setSystemTime(T0 + 10_500);

    const r3 = await call(POST, { action: 'poll', id: 'p3' });
    const m3 = r3.json.matched as Record<string, unknown>;
    expect(m3).toBeDefined();
    expect(m3.mode).toBe('ffa');
    expect(m3.count).toBe(3);
    expect(m3.role).toBe('guest');
    expect((m3.players as Array<{ id: string }>).map((p) => p.id)).toEqual(['p1', 'p2', 'p3']);

    const r1 = await call(POST, { action: 'poll', id: 'p1' });
    expect((r1.json.matched as Record<string, unknown>).role).toBe('host');
    expect((r1.json.matched as Record<string, unknown>).room).toBe(m3.room);
  });

  it('並發 poll：claimMatchLock 確保撮合只成立一次（兩人最終拿到同一 room）', async () => {
    const POST = await loadPost();
    await join(POST, 'p1');
    await join(POST, 'p2');
    vi.setSystemTime(T0 + 11_000);

    // 兩個 poll 真並發進 handler：鎖只讓其中一個跑撮合
    const [a, b] = await Promise.all([
      call(POST, { action: 'poll', id: 'p1' }),
      call(POST, { action: 'poll', id: 'p2' }),
    ]);
    // 沒拿到 matched 的那位，下一輪 poll 一定拿到（鎖落敗方走 getMatch 路徑）
    const followUps = await Promise.all([
      call(POST, { action: 'poll', id: 'p1' }),
      call(POST, { action: 'poll', id: 'p2' }),
    ]);
    const rooms = new Set<string>();
    for (const r of [a, b, ...followUps]) {
      const m = r.json.matched as Record<string, unknown> | undefined;
      if (m) rooms.add(m.room as string);
    }
    expect(rooms.size).toBe(1); // 只開了一間房（撮合只成立一次）

    // 雙方各自都拿到 matched（並發輪或補一輪）
    for (const id of ['p1', 'p2']) {
      const r = await call(POST, { action: 'poll', id });
      // match 紀錄仍在 TTL 內 → 重 poll 也回同一房
      const m = r.json.matched as Record<string, unknown>;
      expect(m).toBeDefined();
      expect(rooms.has(m.room as string)).toBe(true);
    }
  });

  it('過期 entry 不入撮合：超過 TTL 沒 heartbeat 的人不會被配進局', async () => {
    const POST = await loadPost();
    await join(POST, 'p1'); // t0 join，TTL 15s → t0+15s 過期
    vi.setSystemTime(T0 + 16_000); // p1 已過期
    await join(POST, 'p2');
    await join(POST, 'p3');
    vi.setSystemTime(T0 + 26_000); // p2 已等滿 10s 窗；p2/p3 entry 仍存活

    const r = await call(POST, { action: 'poll', id: 'p2' });
    const m = r.json.matched as Record<string, unknown>;
    expect(m).toBeDefined();
    expect(m.mode).toBe('1v1'); // 只剩 p2、p3 兩人 → 1v1，p1 不在局內
    expect((m.players as Array<{ id: string }>).map((p) => p.id)).toEqual(['p2', 'p3']);

    const r1 = await call(POST, { action: 'poll', id: 'p1' });
    expect(r1.json.matched).toBeUndefined();
    expect(r1.json.waiting).toBe(false); // 過期者既未配對也不在等待池
  });
});

describe('POST /api/queue — heartbeat 與 leave', () => {
  it('heartbeat 續命：超過原 TTL 仍可被撮合', async () => {
    const POST = await loadPost();
    await join(POST, 'p1'); // 無 heartbeat 的話 t0+15s 過期
    vi.setSystemTime(T0 + 10_000);
    const hb = await call(POST, { action: 'heartbeat', id: 'p1' });
    expect(hb.status).toBe(200);
    await join(POST, 'p2'); // joinedAt = t0+10s
    vi.setSystemTime(T0 + 20_000); // p1 已等 20s（> 原 TTL 15s，靠 heartbeat 活著）

    const r = await call(POST, { action: 'poll', id: 'p2' });
    const m = r.json.matched as Record<string, unknown>;
    expect(m).toBeDefined();
    expect(m.role).toBe('guest'); // p1 最早 → host，p2 = guest
    expect((m.players as Array<{ id: string }>).map((p) => p.id)).toEqual(['p1', 'p2']);
  });

  it('leave 離隊：離開者不入撮合，剩 1 人 poll 仍 waiting', async () => {
    const POST = await loadPost();
    await join(POST, 'p1');
    await join(POST, 'p2');
    const lv = await call(POST, { action: 'leave', id: 'p1' });
    expect(lv.status).toBe(200);
    vi.setSystemTime(T0 + 11_000);

    const r = await call(POST, { action: 'poll', id: 'p2' });
    expect(r.json.matched).toBeUndefined();
    expect(r.json.waiting).toBe(true);
    expect(r.json.position).toBe(1); // p1 已離隊 → p2 排第一
  });

  it('撮合成功後重新 join 不吃舊 match 紀錄（不會被導回死房）', async () => {
    const POST = await loadPost();
    await join(POST, 'p1');
    await join(POST, 'p2');
    vi.setSystemTime(T0 + 11_000);
    const first = await call(POST, { action: 'poll', id: 'p1' });
    expect(first.json.matched).toBeDefined();

    // p1 取消那局、立刻重新排隊：poll 不得回剛才的舊房
    await join(POST, 'p1');
    vi.setSystemTime(T0 + 12_000); // 還在新一輪湊團窗內
    const again = await call(POST, { action: 'poll', id: 'p1' });
    expect(again.json.matched).toBeUndefined();
    expect(again.json.waiting).toBe(true);
  });
});
