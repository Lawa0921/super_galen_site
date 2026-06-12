import type { APIRoute } from 'astro';
import { getQueueStore, type MatchInfo, type QueueEntry, type QueueStore } from '@scripts/games/tetris/net/queueStore';
import { tryFormMatch } from '@scripts/games/tetris/net/matchmaking';
import { DEFAULT_RATING } from '@scripts/games/tetris/net/elo';

export const prerender = false;

/** entry 存活時間：靠 5s heartbeat 續命，斷線 15s 內自然出隊。 */
const ENTRY_TTL_SEC = 15;
/** 撮合原子閘 TTL：持鎖者 crash 也會在 3s 後自復原（下個 poll 重試）。 */
const LOCK_TTL_SEC = 3;
/** 配對結果存活時間：所有玩家 3s 一 poll，30s 綽綽有餘；過期即不可再領。 */
const MATCH_TTL_SEC = 30;

const json = (obj: unknown, status = 200): Response =>
  new Response(JSON.stringify(obj), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });

// 簡易 per-instance rate limit（照 match.ts 模式；搭配 Upstash 免費硬上限做雙保險）。
// 隊列是輪詢型流量：每位排隊者 ~32 req/分（20 poll + 12 heartbeat），
// 同 NAT 後最多 8 人共用一 IP → 上限取 600/分/實例（夠 8 人排隊、仍擋得住失控迴圈）。
const hits = new Map<string, { n: number; reset: number }>();
function limited(ip: string): boolean {
  const now = Date.now();
  const e = hits.get(ip);
  if (!e || e.reset < now) {
    hits.set(ip, { n: 1, reset: now + 60_000 });
    return false;
  }
  e.n++;
  return e.n > 600;
}

/** 5 碼房號（與 signal.ts makeRoomCode 同邏輯；signal 的 create 只發碼不落地，房號純粹是槽位 key 的命名空間）。 */
function makeRoomCode(): string {
  // 去掉易混字元（0/O/1/I/L）
  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  let s = '';
  for (let i = 0; i < 5; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}

/**
 * 對外（與 queueClient.MatchedInfo 對齊）的配對結果：players 帶 {id, name} 供 lobby 顯示。
 * queueStore.MatchInfo 的 players 型別是 string[]，但兩個實作都只做 JSON/淺拷貝 round-trip
 * （shape-agnostic），故以此較豐富的形狀進出 store，僅在邊界轉型。
 */
interface QueueMatchInfo extends Omit<MatchInfo, 'players'> {
  players: { id: string; name: string }[];
}

function setMatchInfo(store: QueueStore, playerId: string, info: QueueMatchInfo): Promise<void> {
  return store.setMatch(playerId, info as unknown as MatchInfo, MATCH_TTL_SEC);
}

async function getMatchInfo(store: QueueStore, playerId: string): Promise<QueueMatchInfo | null> {
  const m = (await store.getMatch(playerId)) as unknown as QueueMatchInfo | null;
  // room 為空字串者是 join 時寫入的墓碑（覆蓋舊局殘留），視同無配對
  return m && m.room ? m : null;
}

/** 撮合成立：開房、寫每位玩家的結果（host=最早者）、把他們移出等待池（防殘留再撮合）。 */
async function formMatch(store: QueueStore, players: QueueEntry[], mode: '1v1' | 'ffa'): Promise<void> {
  const room = makeRoomCode();
  const roster = players.map((p) => ({ id: p.id, name: p.name }));
  for (let i = 0; i < players.length; i++) {
    await setMatchInfo(store, players[i].id, {
      room,
      role: i === 0 ? 'host' : 'guest', // players 已依 joinedAt 升冪 → 最早者當 host
      mode,
      count: players.length,
      players: roster,
    });
    await store.leave(players[i].id);
  }
}

/**
 * POST /api/queue — 快速配對隊列。
 * body: { action: 'join'|'heartbeat'|'poll'|'leave', id, name?, rating? }
 *
 * poll 回應（與 queueClient 對齊）：
 *   配對成立 → { matched: { room, role, mode, count, players: [{id,name}] } }
 *   仍在等   → { waiting: true, position, waitedMs }
 *   不在隊列 → { waiting: false }（entry 過期等；client 可自行重新 join）
 *
 * 撮合決策只在 poll 中執行（serverless 無 worker），以 claimMatchLock（SET NX）
 * 保證同一時刻只有一個 poll 跑撮合；鎖落敗方下一輪經 getMatch 領取結果。
 */
export const POST: APIRoute = async ({ request, clientAddress }) => {
  let ip = 'unknown';
  try { ip = clientAddress; } catch { /* 某些環境不提供 */ }
  if (limited(ip)) return json({ error: 'rate limited' }, 429);

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return json({ error: 'bad json' }, 400);
  }

  const { action, id } = body;
  if (typeof id !== 'string' || id.length === 0 || id.length > 64) {
    return json({ error: 'bad params' }, 400);
  }
  const store = getQueueStore();

  switch (action) {
    case 'join': {
      const { name, rating } = body;
      if (name !== undefined && (typeof name !== 'string' || name.length > 24)) {
        return json({ error: 'bad params' }, 400);
      }
      if (rating !== undefined && (typeof rating !== 'number' || !Number.isFinite(rating))) {
        return json({ error: 'bad params' }, 400);
      }
      const entry: QueueEntry = {
        id,
        name: (name as string | undefined) || 'Player',
        rating: (rating as number | undefined) ?? DEFAULT_RATING,
        joinedAt: Date.now(),
      };
      // 覆蓋上一局殘留的 match 紀錄（取消後立刻重排不得被導回死房）
      await setMatchInfo(store, id, { room: '', role: 'guest', mode: '1v1', count: 0, players: [] });
      await store.enqueue(entry, ENTRY_TTL_SEC);
      return json({ ok: true });
    }

    case 'heartbeat': {
      await store.heartbeat(id, ENTRY_TTL_SEC);
      return json({ ok: true });
    }

    case 'leave': {
      await store.leave(id);
      return json({ ok: true });
    }

    case 'poll': {
      // 1) 已有配對結果（別人撮合時把我配進去了）→ 直接領取
      const existing = await getMatchInfo(store, id);
      if (existing) return json({ matched: existing });

      // 2) 嘗試取得撮合鎖；落敗代表有人正在撮合 → 本輪只回等待狀態
      let waiting = await store.listWaiting();
      if (await store.claimMatchLock(LOCK_TTL_SEC)) {
        const formed = tryFormMatch(waiting, Date.now());
        if (formed) {
          await formMatch(store, formed.players, formed.mode);
          const mine = formed.players.find((p) => p.id === id);
          if (mine) {
            const info = await getMatchInfo(store, id);
            if (info) return json({ matched: info });
          }
          // 自己沒被配進這局（如第 9 人）→ 以剩餘者回報等待狀態
          waiting = waiting.filter((w) => !formed.players.some((p) => p.id === w.id));
        }
      }

      // 3) 仍在等：回 position 與 waitedMs；不在等待池（過期等）→ waiting:false
      const pos = waiting.findIndex((w) => w.id === id);
      if (pos === -1) return json({ waiting: false });
      return json({ waiting: true, position: pos + 1, waitedMs: Date.now() - waiting[pos].joinedAt });
    }

    default:
      return json({ error: 'bad params' }, 400);
  }
};
