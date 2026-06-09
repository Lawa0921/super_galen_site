import type { APIRoute } from 'astro';
import { getSignalStore } from '@scripts/games/tetris/net/signalStore';

// 按需執行（serverless function），非預渲染
export const prerender = false;

const TTL_SEC = 300; // 房間槽位 5 分鐘過期

/**
 * 驗證槽位字串是否合法（與 signalClient.ts 的 isValidSlot 保持同一套規則）。
 * 1v1：offer / answer
 * N 人星狀：host-offer / guest-{0..6}-answer / host-ack-{0..6}
 */
function isValidSlot(slot: string): boolean {
  if (slot === 'offer' || slot === 'answer' || slot === 'host-offer') return true;
  const guestMatch = slot.match(/^guest-(\d+)-answer$/);
  if (guestMatch) {
    const idx = Number(guestMatch[1]);
    return idx >= 0 && idx <= 6;
  }
  const ackMatch = slot.match(/^host-ack-(\d+)$/);
  if (ackMatch) {
    const idx = Number(ackMatch[1]);
    return idx >= 0 && idx <= 6;
  }
  return false;
}

const json = (obj: unknown, status = 200): Response =>
  new Response(JSON.stringify(obj), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });

function makeRoomCode(): string {
  // 去掉易混字元（0/O/1/I/L）
  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  let s = '';
  for (let i = 0; i < 5; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}

/** 讀取房間某槽位的 SDP：GET /api/signal?room=AB12C&slot=<valid-slot> */
export const GET: APIRoute = async ({ url }) => {
  const room = url.searchParams.get('room');
  const slot = url.searchParams.get('slot');
  if (!room || !slot || !isValidSlot(slot)) return json({ error: 'bad params' }, 400);
  const store = getSignalStore();
  const data = await store.get(`sig:${room}:${slot}`);
  return json({ data });
};

/**
 * POST /api/signal
 *  - { action: 'create' } → { room }
 *  - { room, slot: 'offer'|'answer', data } → { ok: true }
 */
export const POST: APIRoute = async ({ request }) => {
  let body: { action?: string; room?: string; slot?: string; data?: string };
  try {
    body = await request.json();
  } catch {
    return json({ error: 'bad json' }, 400);
  }

  if (body.action === 'create') {
    return json({ room: makeRoomCode() });
  }

  const { room, slot, data } = body;
  if (!room || !slot || !isValidSlot(slot) || typeof data !== 'string') {
    return json({ error: 'bad params' }, 400);
  }
  if (data.length > 60_000) return json({ error: 'too large' }, 413); // SDP 上限保護

  const store = getSignalStore();
  await store.set(`sig:${room}:${slot}`, data, TTL_SEC);
  return json({ ok: true });
};
