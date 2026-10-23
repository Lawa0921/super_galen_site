// validate.ts — 房主端：客人送來的一切都是不可信輸入。新物件、只拷貝已知欄位；不合法 → null，絕不拋。
import type { Payload } from './link';
import { POSE_BOAT, POSE_CLIMB, POSE_DEAD, POSE_GROUND, POSE_LEFT, WIRE_POSE_LEN, type ByeReason, type GuestCtrl, type Ps } from './protocol';
import { validCmd } from '../engine/commands';
import { HOTBAR_SIZE, TILE_SIZE } from '../engine/constants';
import { X_LIMIT } from '../engine/coords';
import { ITEMS, type ItemId, type WeaponKind } from '../engine/items';
import { FISH_STATES, WEAPON_KINDS, type PlayerPose } from '../engine/pose';

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
    case 'ping': case 'pong': {
      const at = get(o, 'at');
      return fin(at) ? { t: get(o, 't') as 'ping' | 'pong', at } : null;
    }
    case 'chkAck': {
      const rev = get(o, 'rev');
      return Number.isSafeInteger(rev) && (rev as number) >= 0 ? { t: 'chkAck', rev: rev as number } : null;
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
  const mt = get(o, 'mt');
  const lim = X_LIMIT * TILE_SIZE;
  if (!seq31(seq) || !seq31(tseq) || !fin(x) || !fin(y) || !fin(vx) || !fin(vy)) return null;
  if (Math.abs(x) > lim || Math.abs(y) > lim) return null;
  if (!Number.isSafeInteger(flags) || (flags as number) < 0 || (flags as number) > 7) return null;
  if (facing !== 1 && facing !== -1) return null;
  if (!Array.isArray(aim) || aim.length !== 2 || !fin(aim[0]) || !fin(aim[1])) return null;
  if (typeof mine !== 'boolean' || typeof use !== 'boolean') return null;
  if (!Number.isSafeInteger(slot) || (slot as number) < 0 || (slot as number) >= HOTBAR_SIZE) return null;
  const m = mt === null ? null : mantleOf(mt);
  if (m === undefined) return null;
  return {
    t: 'ps', seq, tseq, x, y, vx, vy, flags: flags as number, facing, aim: [aim[0], aim[1]], mine, use, slot: slot as number,
    mt: m ? [m.p, m.dir, m.edgeX, m.edgeY] : null,
  };
}

/** ws.br（房主送來、收件客人自己的呼吸）：省略 = 滿氣；有限數字夾到 0..max；其他 → null（沿用上一份） */
export function decodeBreath(v: unknown, max: number): number | null {
  if (v === undefined) return max;
  return fin(v) ? Math.max(0, Math.min(max, v)) : null;
}

// ── PlayerPose（M-C2 D2）：房主送來的 WirePose（客人端也照樣嚴格驗：壞的那份 pose 丟掉，絕不拋）──
const POSE_FLAGS = POSE_GROUND | POSE_BOAT | POSE_CLIMB | POSE_DEAD | POSE_LEFT;
/** 世界座標（px）：有限且在世界範圍內 */
const px = (v: unknown): v is number => fin(v) && Math.abs(v) <= X_LIMIT * TILE_SIZE;
const unit = (v: unknown): v is number => fin(v) && v >= 0 && v <= 1;
const dir1 = (v: unknown): v is 1 | -1 => v === 1 || v === -1;
const item = (v: unknown): v is ItemId => typeof v === 'string' && own(ITEMS, v);
const tup = (v: unknown, n: number): v is unknown[] => Array.isArray(v) && v.length === n;

/** [p, dir, edgeX, edgeY] → mantle；不合法 → undefined */
function mantleOf(v: unknown): NonNullable<PlayerPose['mantle']> | undefined {
  if (!tup(v, 4)) return undefined;
  const [p, dir, edgeX, edgeY] = v;
  if (!unit(p) || !dir1(dir) || !px(edgeX) || !px(edgeY)) return undefined;
  return { p, dir, edgeX, edgeY };
}

/** WirePose → PlayerPose（新物件、只拷貝已知欄位）；任何一格不合法 → null */
export function decodePose(w: unknown): PlayerPose | null {
  if (!tup(w, WIRE_POSE_LEN)) return null;
  const [x, y, vx, vy, flags, gfxOffY, iframes, liquidFrac, held, mt, atk, mi, fi, hurt] = w;
  if (!Number.isSafeInteger(hurt) || (hurt as number) < 0 || (hurt as number) > 255) return null;
  if (!px(x) || !px(y) || !fin(vx) || !fin(vy) || !fin(gfxOffY) || !fin(iframes) || iframes < 0 || !unit(liquidFrac)) return null;
  if (!Number.isSafeInteger(flags) || (flags as number) < 0 || ((flags as number) & ~POSE_FLAGS) !== 0) return null;
  if (held !== null && !item(held)) return null;
  const mantle = mt === null ? null : mantleOf(mt);
  if (mantle === undefined) return null;
  let attack: PlayerPose['attack'] = null;
  if (atk !== null) {
    if (!tup(atk, 6)) return null;
    const [ai, kind, angle, dir, at, dur] = atk;
    if (!item(ai) || !WEAPON_KINDS.includes(kind as WeaponKind) || !fin(angle) || !dir1(dir) || !fin(at) || !fin(dur) || dur <= 0) return null;
    attack = { item: ai, kind: kind as WeaponKind, angle, dir, at, dur };
  }
  let mining: PlayerPose['mining'] = null;
  if (mi !== null) {
    if (!tup(mi, 4)) return null;
    const [tx, ty, progress, pick] = mi;
    if (!Number.isSafeInteger(tx) || !Number.isSafeInteger(ty) || !unit(progress) || (pick !== null && !item(pick))) return null;
    mining = { x: tx as number, y: ty as number, progress, pick: pick as ItemId | null };
  }
  let fishing: PlayerPose['fishing'] = null;
  if (fi !== null) {
    if (!tup(fi, 4)) return null;
    const [state, fx, fy, liquid] = fi;
    type FishState = NonNullable<PlayerPose['fishing']>['state'];
    if (!FISH_STATES.includes(state as FishState) || !px(fx) || !px(fy) || (liquid !== 0 && liquid !== 1)) return null;
    fishing = { state: state as FishState, x: fx, y: fy, liquid: liquid === 1 };
  }
  const f = flags as number;
  return {
    x, y, vx, vy, onGround: (f & POSE_GROUND) !== 0, gfxOffY,
    facing: (f & POSE_LEFT) !== 0 ? -1 : 1, dead: (f & POSE_DEAD) !== 0, iframes,
    boating: (f & POSE_BOAT) !== 0, climbing: (f & POSE_CLIMB) !== 0,
    mantle, liquidFrac, held: held as ItemId | null, attack, mining, fishing, hurt: hurt as number,
  };
}
