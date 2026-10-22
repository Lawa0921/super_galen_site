// validate.ts — 房主端：客人送來的一切都是不可信輸入。新物件、只拷貝已知欄位；不合法 → null，絕不拋。
import type { Payload } from './link';
import type { ByeReason, GuestCtrl, Ps } from './protocol';
import { validCmd } from '../engine/commands';
import { HOTBAR_SIZE, TILE_SIZE } from '../engine/constants';
import { X_LIMIT } from '../engine/coords';

const MAX_STR = 64;
const BYE: readonly ByeReason[] = ['leave', 'closed', 'timeout'];
const own = (o: object, k: string): boolean => Object.prototype.hasOwnProperty.call(o, k);
const isRec = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === 'object' && !Array.isArray(v);
const get = (o: Record<string, unknown>, k: string): unknown => (own(o, k) ? o[k] : undefined);
const str = (v: unknown): v is string => typeof v === 'string' && v.length <= MAX_STR;
const fin = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const seq31 = (v: unknown): v is number => Number.isSafeInteger(v) && (v as number) >= 0 && (v as number) <= 0x7fffffff;
const u32 = (v: unknown): v is number => Number.isSafeInteger(v) && (v as number) >= 0 && (v as number) <= 0xffffffff;

function parseJson(data: Payload): unknown {
  if (typeof data !== 'string') return undefined;
  try { return JSON.parse(data); } catch { return undefined; }
}

export function parseGuestCtrl(data: Payload, chunksY: number, cxRange: { lo: number; hi: number }): GuestCtrl | null {
  const o = parseJson(data);
  if (!isRec(o)) return null;
  switch (get(o, 't')) {
    case 'hello': {
      const proto = get(o, 'proto'), build = get(o, 'build'), charId = get(o, 'charId'), nick = get(o, 'nick');
      if (!seq31(proto) || !str(build) || !str(charId) || !str(nick)) return null;
      // character 原樣保留，Task 8 再用 validateCharacterStrict 驗
      return { t: 'hello', proto, build, charId, nick, character: get(o, 'character') };
    }
    case 'ready': return { t: 'ready' };
    case 'cmd': {
      const seq = get(o, 'seq');
      if (!seq31(seq)) return null;
      const cmd = validCmd(get(o, 'cmd'));
      return cmd ? { t: 'cmd', seq, cmd } : null;
    }
    case 'sum': {
      const cx = get(o, 'cx'), sums = get(o, 'sums');
      if (!Number.isSafeInteger(cx) || (cx as number) < cxRange.lo || (cx as number) > cxRange.hi) return null;
      if (!Array.isArray(sums) || sums.length !== chunksY || !sums.every(u32)) return null;
      return { t: 'sum', cx: cx as number, sums: sums.slice() };
    }
    case 'bye': {
      const reason = get(o, 'reason');
      return BYE.includes(reason as ByeReason) ? { t: 'bye', reason: reason as ByeReason } : null;
    }
    default: return null;
  }
}

/** state 通道的 ps：所有數值有限、座標在世界範圍內、slot 在快捷欄內、facing ±1 */
export function parsePs(data: Payload): Ps | null {
  const o = parseJson(data);
  if (!isRec(o) || get(o, 't') !== 'ps') return null;
  const seq = get(o, 'seq'), tseq = get(o, 'tseq'), x = get(o, 'x'), y = get(o, 'y'), vx = get(o, 'vx'), vy = get(o, 'vy');
  const flags = get(o, 'flags'), facing = get(o, 'facing'), aim = get(o, 'aim'), slot = get(o, 'slot');
  const mine = get(o, 'mine'), use = get(o, 'use');
  const lim = X_LIMIT * TILE_SIZE;
  if (!seq31(seq) || !seq31(tseq) || !fin(x) || !fin(y) || !fin(vx) || !fin(vy)) return null;
  if (Math.abs(x) > lim || Math.abs(y) > lim) return null;
  if (!Number.isSafeInteger(flags) || (flags as number) < 0 || (flags as number) > 7) return null;
  if (facing !== 1 && facing !== -1) return null;
  if (!Array.isArray(aim) || aim.length !== 2 || !fin(aim[0]) || !fin(aim[1])) return null;
  if (typeof mine !== 'boolean' || typeof use !== 'boolean') return null;
  if (!Number.isSafeInteger(slot) || (slot as number) < 0 || (slot as number) >= HOTBAR_SIZE) return null;
  return { t: 'ps', seq, tseq, x, y, vx, vy, flags: flags as number, facing, aim: [aim[0], aim[1]], mine, use, slot: slot as number };
}
