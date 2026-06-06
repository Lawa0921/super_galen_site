/**
 * 與 /api/signal 互動的小客戶端：建房、寫/讀/輪詢 offer/answer 槽位。
 */
const API = '/api/signal';
export type Slot = 'offer' | 'answer';

async function postJson(body: unknown): Promise<Record<string, unknown>> {
  const res = await fetch(API, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  return (await res.json()) as Record<string, unknown>;
}

export async function createRoom(): Promise<string> {
  const r = await postJson({ action: 'create' });
  if (typeof r.room !== 'string') throw new Error('create room failed');
  return r.room;
}

export async function putSlot(room: string, slot: Slot, data: string): Promise<void> {
  await postJson({ room, slot, data });
}

export async function getSlot(room: string, slot: Slot): Promise<string | null> {
  const res = await fetch(`${API}?room=${encodeURIComponent(room)}&slot=${slot}`);
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
