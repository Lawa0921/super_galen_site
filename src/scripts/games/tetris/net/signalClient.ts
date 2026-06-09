/**
 * 與 /api/signal 互動的小客戶端：建房、寫/讀/輪詢 offer/answer 槽位。
 *
 * 槽位白名單（與 /api/signal.ts 的 SLOTS 規則保持一致）：
 *   1v1：offer / answer
 *   N 人星狀：host-offer / guest-{0..6}-answer / host-ack-{0..6}
 */
const API = '/api/signal';

/** 驗證槽位字串是否合法（與 api/signal.ts 的 SLOTS 同一套規則）。 */
export function isValidSlot(slot: string): boolean {
  if (slot === 'offer' || slot === 'answer' || slot === 'host-offer') return true;
  // guest-{0..6}-answer
  const guestMatch = slot.match(/^guest-(\d+)-answer$/);
  if (guestMatch) {
    const idx = Number(guestMatch[1]);
    return idx >= 0 && idx <= 6;
  }
  // host-ack-{0..6}
  const ackMatch = slot.match(/^host-ack-(\d+)$/);
  if (ackMatch) {
    const idx = Number(ackMatch[1]);
    return idx >= 0 && idx <= 6;
  }
  return false;
}

export type Slot = string;

async function postJson(body: unknown): Promise<Record<string, unknown>> {
  const res = await fetch(API, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`signal api ${res.status}`);
  return (await res.json()) as Record<string, unknown>;
}

export async function createRoom(): Promise<string> {
  const r = await postJson({ action: 'create' });
  if (typeof r.room !== 'string') throw new Error('create room failed');
  return r.room;
}

export async function putSlot(room: string, slot: Slot, data: string): Promise<void> {
  if (!isValidSlot(slot)) throw new Error(`invalid slot: ${slot}`);
  await postJson({ room, slot, data });
}

export async function getSlot(room: string, slot: Slot): Promise<string | null> {
  if (!isValidSlot(slot)) throw new Error(`invalid slot: ${slot}`);
  const res = await fetch(`${API}?room=${encodeURIComponent(room)}&slot=${slot}`);
  if (!res.ok) throw new Error(`signal GET ${res.status}`);
  const json = (await res.json()) as { data?: string | null };
  return json.data ?? null;
}

/** 輪詢直到該槽位有值或逾時。 */
export async function pollSlot(
  room: string,
  slot: Slot,
  opts: { timeoutMs?: number; intervalMs?: number } = {},
): Promise<string> {
  const timeoutMs = opts.timeoutMs ?? 90_000;
  const intervalMs = opts.intervalMs ?? 1200;
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const data = await getSlot(room, slot);
    if (data) return data;
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  throw new Error(`timeout waiting for ${slot}`);
}
