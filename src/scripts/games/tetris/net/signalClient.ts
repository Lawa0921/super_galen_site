/**
 * 與 /api/signal 互動的小客戶端：建房、寫/讀/輪詢 offer/answer 槽位。
 *
 * 槽位白名單（與 /api/signal.ts 的 SLOTS 規則保持一致）：
 *   1v1：offer / answer
 *   N 人星狀（host-initiated，T9 保留）：host-offer / guest-{0..6}-answer / host-ack-{0..6}
 *   N 人星狀（guest-initiated，T11 真實 WebRTC）：guest-{0..6}-offer / host-ack-{0..6}
 *   Host migration 世代化槽位：mig{1..6}-guest-{0..6}-offer / mig{1..6}-host-ack-{0..6}
 */
const API = '/api/signal';

/** 驗證槽位字串是否合法（與 api/signal.ts 的 SLOTS 同一套規則）。 */
export function isValidSlot(slot: string): boolean {
  if (slot === 'offer' || slot === 'answer' || slot === 'host-offer') return true;
  // guest-{0..6}-answer（host-initiated 流程）
  const guestAnsMatch = slot.match(/^guest-(\d+)-answer$/);
  if (guestAnsMatch) {
    const idx = Number(guestAnsMatch[1]);
    return idx >= 0 && idx <= 6;
  }
  // guest-{0..6}-offer（guest-initiated 流程：每 guest 各自的 SDP offer）
  const guestOfferMatch = slot.match(/^guest-(\d+)-offer$/);
  if (guestOfferMatch) {
    const idx = Number(guestOfferMatch[1]);
    return idx >= 0 && idx <= 6;
  }
  // host-ack-{0..6}
  const ackMatch = slot.match(/^host-ack-(\d+)$/);
  if (ackMatch) {
    const idx = Number(ackMatch[1]);
    return idx >= 0 && idx <= 6;
  }
  // 世代化遷移槽位（host migration）：mig{1..6}-guest-{0..6}-offer / mig{1..6}-host-ack-{0..6}
  const migMatch = slot.match(/^mig(\d+)-(?:guest-(\d+)-offer|host-ack-(\d+))$/);
  if (migMatch) {
    const gen = Number(migMatch[1]);
    const idx = Number(migMatch[2] ?? migMatch[3]);
    return gen >= 1 && gen <= 6 && idx >= 0 && idx <= 6;
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

/**
 * 命名空間前綴：把房號加上遊戲別前綴，避免不同遊戲（tetris / bomber）的房號在
 * 同一個 signal store（key = `sig:${room}:${slot}`）相撞。
 *  - 預設 `ns = ''` → 房號原樣傳出，tetris 既有行為「位元級不變」（零回歸）。
 *  - bomber 路徑傳入 `'bomber:'` → 實際房 key 變成 `bomber:AB12C`，與 tetris 的 `AB12C` 隔離。
 * 顯示給使用者的房號仍是 createRoom() 回傳的乾淨 5 碼，前綴只作用在 store key 層。
 */
function nsRoom(ns: string, room: string): string {
  return ns ? `${ns}${room}` : room;
}

export async function putSlot(
  room: string,
  slot: Slot,
  data: string,
  ns = '',
): Promise<void> {
  if (!isValidSlot(slot)) throw new Error(`invalid slot: ${slot}`);
  await postJson({ room: nsRoom(ns, room), slot, data });
}

export async function getSlot(
  room: string,
  slot: Slot,
  ns = '',
): Promise<string | null> {
  if (!isValidSlot(slot)) throw new Error(`invalid slot: ${slot}`);
  const res = await fetch(`${API}?room=${encodeURIComponent(nsRoom(ns, room))}&slot=${slot}`);
  if (!res.ok) throw new Error(`signal GET ${res.status}`);
  const json = (await res.json()) as { data?: string | null };
  return json.data ?? null;
}

/** 輪詢直到該槽位有值或逾時。 */
export async function pollSlot(
  room: string,
  slot: Slot,
  opts: { timeoutMs?: number; intervalMs?: number } = {},
  ns = '',
): Promise<string> {
  const timeoutMs = opts.timeoutMs ?? 90_000;
  const intervalMs = opts.intervalMs ?? 1200;
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const data = await getSlot(room, slot, ns);
    if (data) return data;
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  throw new Error(`timeout waiting for ${slot}`);
}
