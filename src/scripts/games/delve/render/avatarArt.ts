// avatarArt.ts — 玩家角色的 Q 版日系紙娃娃（純 Bmp，無 DOM；toCanvas 在 sprites.ts）。
//   樣子由 engine/doll.ts 的 DollLook 決定：頭 / 身 / 腿 / 背各部位是「基本服裝（客製化）」、時裝或防具，
//   外加看得見的飾品（飾品鞋、胸前墜飾、腰間小物）。每格依圖層順序合成（engine/doll.ts DOLL_LAYERS）：
//     第一張（body）：背飾 → 後髮 → 身體（脖子）→ 腿 → 胸（上衣 / 胸甲 / 墜飾 / 腰間）
//     （渲染器在中間畫：手臂 + 手持工具 / 武器）
//     第二張（head）：臉 → 前髮 → 頭飾（頭盔 / 帽子）→ 前飾品（髮飾 / 眼鏡）
//   背面（爬繩）與倒地的影格手臂直接畫在第一張，第二張是空的（背面時背飾蓋在背上）。
//   影格 44×54、腳底在最下一列、身體中心 x = 22；側面一律面向右（繪製時鏡像）。光從左上，1px 描邊。
import { Bmp, INK, hex, rotPrep, rotate, type RGB } from './pixel';
import { OUTFITS, type Appearance } from '../engine/appearance';
import type { DollLook, DollPiece } from '../engine/doll';
import type { ArmorSetId } from '../engine/items';
import { drawHead, type Expr, type HairMotion } from './avatarHead';
import { CLOTH_RAMPS, DARK, GOLD, LEATHER, WHITE, clothRamp, darker, skinRamp } from './avatarPalette';
import {
  armor5, armorSet, backArt, beltArt, bootExtra, bootRamp, chestDetail, chestSpots, greaveKnee, lookId, neckArt, upgrades,
  helmetOnly as helmetHeadOnly, hatOnly as hatHeadOnly,
} from './avatarGear';
import { ARMOR_RAMP } from './combatArt';
import { WALK_FRAMES, IDLE_FRAMES } from './anim';
import { CLIMB_FRAMES, HANG_FRAMES, MANTLE_FRAMES, SWIM_FRAMES } from './playerAnim';

export const AV_FW = 44;
export const AV_FH = 54;
const CX = 22;
/** 站立時腳踝的列（鞋底 = 最下一列） */
const ANKLE = AV_FH - 2;
const HIP_Y = 43;
const THIGH = 4.5, SHIN = 4.5;
/** 頭的區域原點（側面 / 背面） */
const HEAD_X = 13, HEAD_Y = 13;
/** 肩膀軸心（影格座標，未加每格位移） */
export const AV_SHOULDER_FRONT = { x: 24, y: 33 };
export const AV_SHOULDER_BACK = { x: 20, y: 33 };
/** 手臂圖：26×34、軸心 (13,3)；手心距軸心 HAND_REACH px */
export const ARM_W = 26, ARM_H = 34, ARM_PIV = { x: 13, y: 3 };
export const HAND_REACH = 7;

/** 影格表的排列：動畫 → [起始索引, 格數] */
export const SHEET = (() => {
  const order: [string, number][] = [
    ['idle', IDLE_FRAMES], ['blink', IDLE_FRAMES], ['walk', WALK_FRAMES], ['jump', 1], ['fall', 1],
    ['climb', CLIMB_FRAMES], ['hang', HANG_FRAMES], ['mantle', MANTLE_FRAMES], ['swim', SWIM_FRAMES], ['hurt', 1], ['dead', 1],
  ];
  const out: Record<string, [number, number]> = {};
  let i = 0;
  for (const [k, n] of order) { out[k] = [i, n]; i += n; }
  return { ...out, total: i } as Record<SheetAnim, [number, number]> & { total: number };
})();
export type SheetAnim = 'idle' | 'blink' | 'walk' | 'jump' | 'fall' | 'climb' | 'hang' | 'mantle' | 'swim' | 'hurt' | 'dead';
export const SHEET_ANIMS: readonly SheetAnim[] = ['idle', 'blink', 'walk', 'jump', 'fall', 'climb', 'hang', 'mantle', 'swim', 'hurt', 'dead'];
/** 每格：身體相對站立的位移（肩膀跟著動）、要不要由渲染器畫可旋轉的手臂 */
export interface FrameMeta { dx: number; dy: number; arms: boolean; }
export interface AvatarFrame { body: Bmp; head: Bmp; meta: FrameMeta; }

// ── 部位 → 畫法 ──────────────────────────────────────────
/** 上衣 / 下身：基本服裝（外觀的配色）、時裝（服裝預設配色）或防具 */
type Wear = { kind: 'outfit'; o: string; c1: RGB[]; c2: RGB[] } | { kind: 'armor'; set: ArmorSetId; p: DollPiece };
function wearOf(l: DollLook, p: DollPiece | null): Wear {
  const set = armorSet(p);
  if (set && p) return { kind: 'armor', set, p };
  const vo = lookId(p, 'outfit:');
  if (vo) {
    const def = OUTFITS.find((o) => o.id === vo) ?? OUTFITS[0];
    return { kind: 'outfit', o: def.id, c1: clothRamp(def.colors[0]), c2: clothRamp(def.colors[1]) };
  }
  return { kind: 'outfit', o: OUTFITS[l.app.outfit]?.id ?? 'explorer', c1: clothRamp(l.app.color1), c2: clothRamp(l.app.color2) };
}
const outfitOf = (w: Wear): string => (w.kind === 'outfit' ? w.o : 'armor');

// ── 肢體 ─────────────────────────────────────────────────
/** 粗線段：左側受光（r[4] 或 r[3]）、右側暗（r[2]） */
function seg(b: Bmp, x0: number, y0: number, x1: number, y1: number, half: number, r: RGB[]): void {
  const dx = x1 - x0, dy = y1 - y0, len = Math.hypot(dx, dy) || 1;
  const ux = dx / len, uy = dy / len, nx = uy, ny = -ux;
  for (let y = Math.floor(Math.min(y0, y1) - half - 1); y <= Math.ceil(Math.max(y0, y1) + half + 1); y++) {
    for (let x = Math.floor(Math.min(x0, x1) - half - 1); x <= Math.ceil(Math.max(x0, x1) + half + 1); x++) {
      const px = x + 0.5 - x0, py = y + 0.5 - y0;
      const t = px * ux + py * uy, s = px * nx + py * ny;
      if (t < -0.5 || t > len + 0.5 || Math.abs(s) > half) continue;
      b.set(x, y, s < -half + 1 ? r[half >= 1.8 ? 4 : 3] : s > half - 1 ? r[2] : r[3]);
    }
  }
}

interface LegPose { thigh: number; shin: number; }
type ShoeKind = 'boot' | 'loafer' | 'sneaker' | 'zori' | 'mary' | 'tall' | 'armor';
interface LegStyle {
  parts: [number, RGB[], number][];
  shoe: { kind: ShoeKind; r: RGB[]; accent?: RGB; extra?: 'jump' | 'swift' };
  greave: ArmorSetId | null;
}

function legStyle(l: DollLook, w: Wear): LegStyle {
  const sk = skinRamp(l.app.skin);
  let st: LegStyle;
  if (w.kind === 'armor') { const r = armor5(w.set); st = { parts: [[1, r, 1.7]], shoe: { kind: 'armor', r }, greave: w.set }; }
  else {
    const { c1, c2 } = w;
    switch (w.o) {
      case 'sailor': st = { parts: [[0.5, sk, 1.4], [1, DARK, 1.4]], shoe: { kind: 'loafer', r: LEATHER }, greave: null }; break;
      case 'miko': st = { parts: [[1, c1, 2.2]], shoe: { kind: 'zori', r: WHITE }, greave: null }; break;
      case 'hoodie': st = { parts: [[0.38, CLOTH_RAMPS[2], 1.7], [1, DARK, 1.4]], shoe: { kind: 'sneaker', r: WHITE, accent: c2[3] }, greave: null }; break;
      case 'coat': st = { parts: [[1, CLOTH_RAMPS[1], 1.6]], shoe: { kind: 'tall', r: LEATHER }, greave: null }; break;
      case 'maid': st = { parts: [[1, WHITE, 1.4]], shoe: { kind: 'mary', r: DARK }, greave: null }; break;
      default: st = { parts: [[0.4, darker(c1), 1.8], [1, sk, 1.4]], shoe: { kind: 'boot', r: LEATHER }, greave: null };
    }
  }
  // 飾品鞋蓋過原本的鞋
  if (l.feet) st.shoe = { kind: 'boot', r: bootRamp(l.feet), extra: l.feet };
  return st;
}

/** 一條腿（側面）：大腿 / 小腿依樣式分段上色，鞋尖朝右；護脛加膝甲 */
function legBmp(pose: LegPose, hipX: number, hipY: number, st: LegStyle, far: boolean): { b: Bmp; ankleY: number; knee: [number, number] } {
  const b = new Bmp(AV_FW, AV_FH);
  const rad = (d: number): number => (d * Math.PI) / 180;
  const kx = hipX + Math.sin(rad(pose.thigh)) * THIGH, ky = hipY + Math.cos(rad(pose.thigh)) * THIGH;
  const ax = kx + Math.sin(rad(pose.shin)) * SHIN, ay = ky + Math.cos(rad(pose.shin)) * SHIN;
  const at = (t: number): [number, number] => t <= 0.5 ? [hipX + (kx - hipX) * t * 2, hipY + (ky - hipY) * t * 2] : [kx + (ax - kx) * (t - 0.5) * 2, ky + (ay - ky) * (t - 0.5) * 2];
  paintLeg(b, st, at, far);
  if (st.greave && !far) greaveKnee(b, st.greave, kx, ky);
  shoe(b, st, Math.round(ax - 2), Math.round(ay), far);
  b.outline(INK);
  return { b, ankleY: ay, knee: [kx, ky] };
}
function paintLeg(b: Bmp, st: LegStyle, at: (t: number) => [number, number], far: boolean): void {
  const dk = (r: RGB[]): RGB[] => (far ? darker(r) : r);
  let t0 = 0;
  const pieces: [number, number, RGB[], number][] = [];
  for (const [t1, r, half] of st.parts) { pieces.push([t0, t1, r, half]); t0 = t1; }
  for (let i = pieces.length - 1; i >= 0; i--) {
    const [a0, a1, r, half] = pieces[i];
    const cuts = [a0, ...(a0 < 0.5 && a1 > 0.5 ? [0.5] : []), a1];
    for (let k = cuts.length - 2; k >= 0; k--) { const p = at(cuts[k]), q = at(cuts[k + 1]); seg(b, p[0], p[1], q[0], q[1], half, dk(r)); }
  }
}
function shoe(b: Bmp, st: LegStyle, x: number, y: number, far: boolean): void {
  const s = st.shoe, r = far ? darker(s.r) : s.r;
  switch (s.kind) {
    case 'boot': case 'armor':
      b.rect(x, y - 2, 5, 1, r[4]); b.rect(x, y - 1, 5, 1, r[3]); b.rect(x, y, 6, 1, r[3]); b.rect(x, y + 1, 6, 1, r[1]);
      b.set(x, y - 1, r[4]); if (s.kind === 'armor') b.set(x + 1, y, r[4]);
      break;
    case 'tall':
      b.rect(x, y - 3, 5, 1, r[4]); b.rect(x, y - 2, 5, 2, r[3]); b.rect(x, y, 6, 1, r[3]); b.rect(x, y + 1, 6, 1, r[1]);
      b.set(x, y - 2, r[4]); b.set(x + 4, y - 3, r[2]);
      break;
    case 'loafer': case 'mary':
      b.rect(x, y, 6, 1, r[3]); b.rect(x, y + 1, 6, 1, r[1]); b.set(x + 1, y, r[4]);
      if (s.kind === 'mary') b.set(x + 2, y - 1, r[3]);
      break;
    case 'sneaker':
      b.rect(x, y - 1, 5, 1, r[3]); b.rect(x, y, 6, 1, r[3]); b.rect(x, y + 1, 6, 1, r[2]);
      b.set(x + 2, y, s.accent ?? r[2]); b.set(x + 3, y, s.accent ?? r[2]);
      break;
    case 'zori':
      b.rect(x, y - 1, 5, 2, r[3]); b.set(x + 4, y - 1, r[2]); b.rect(x - 1, y + 1, 7, 1, LEATHER[3]);
      break;
  }
  if (s.extra && !far) bootExtra(b, s.extra, x, y);
}

// ── 身體（側面） ─────────────────────────────────────────
const TORSO_ROWS: Record<number, [number, number]> = {
  31: [20, 24], 32: [18, 26], 33: [17, 27], 34: [17, 27], 35: [17, 27], 36: [17, 27], 37: [17, 27],
  38: [18, 26], 39: [18, 26], 40: [18, 26], 41: [17, 27], 42: [17, 27],
};
const HOODIE_ROWS: Record<number, [number, number]> = {
  ...TORSO_ROWS, 33: [16, 27], 34: [16, 27], 35: [16, 27], 36: [16, 27], 37: [16, 27], 38: [17, 26], 39: [17, 26], 40: [17, 26], 41: [16, 27], 42: [16, 27],
};
function fillRows(b: Bmp, rows: Record<number, [number, number]>, r: RGB[], dx: number, dy: number, from = 0, to = 99): void {
  const ys = Object.keys(rows).map(Number).filter((y) => y >= from && y <= to);
  const top = Math.min(...ys), bot = Math.max(...ys);
  for (const y of ys) {
    const [x0, x1] = rows[y];
    for (let x = x0; x <= x1; x++) b.set(x + dx, y + dy, x === x0 || y === top ? r[4] : x >= x1 - 1 || y === bot ? r[2] : r[3]);
  }
}
/** 裙襬：從 y0 往下每列往外擴；褶線每 3 欄一條；flap = 往後飄 */
function skirt(b: Bmp, y0: number, widths: [number, number][], r: RGB[], dx: number, dy: number, pleats: boolean, flap: number): void {
  widths.forEach(([x0, x1], k) => {
    const sh = Math.round(flap * k * 0.4);
    for (let x = x0 - sh; x <= x1 - Math.round(sh * 0.4); x++) {
      const last = k === widths.length - 1;
      let c = x === x0 - sh ? r[4] : x >= x1 - 1 ? r[2] : r[3];
      if (pleats && k > 0 && (x - x0 + 30) % 3 === 2) c = r[2];
      if (last) c = pleats && (x - x0 + 30) % 3 === 2 ? r[1] : r[2];
      b.set(x + dx, y0 + k + dy, c);
    }
  });
}

interface BodyPose { dx: number; dy: number; flare: number; flap: number; f: number; }

/** 下身的裙 / 袴 / 圍裙前片（腿之後、上衣之前） */
function lowerSide(b: Bmp, w: Wear, p: BodyPose): void {
  if (w.kind !== 'outfit') return;
  const { dx, dy, flare, flap } = p, c1 = w.c1, c2 = w.c2, fw = flare ? 1 : 0;
  const S = (x: number, y: number, c: RGB): void => b.set(x + dx, y + dy, c);
  if (w.o === 'sailor') skirt(b, 41 - fw, [[17, 27], [16 - fw, 28 + fw], [16 - fw, 28 + fw], [15 - fw, 29 + fw], [15 - fw * 2, 29 + fw * 2]], c1, dx, dy, true, flap);
  if (w.o === 'maid') {
    skirt(b, 41 - fw, [[17, 27], [16, 28], [15 - fw, 29 + fw], [15 - fw, 29 + fw], [14 - fw, 30 + fw], [14 - fw * 2, 30 + fw * 2]], c1, dx, dy, false, flap);
    for (let y = 41 - fw; y <= 45 - fw; y++) for (let x = 23; x <= 28; x++) S(x, y, x === 23 || x === 28 ? c2[2] : c2[3]);
    for (let x = 14 - fw * 2; x <= 30 + fw * 2; x++) S(x, 46 - fw, (x & 1) ? WHITE[2] : WHITE[3]);
  }
  if (w.o === 'miko') {
    skirt(b, 39, [[17, 27], [17, 27], [16, 28], [16, 28], [16 - fw, 28 + fw], [15 - fw, 29 + fw], [15 - fw, 29 + fw]], c1, dx, dy, true, flap * 0.5);
    S(27, 39, c1[4]); S(28, 39, c1[4]); S(28, 40, c1[3]);
  }
}

/** 上衣 / 胸甲（含大衣下擺、墜飾、腰間小物） */
function topSide(b: Bmp, l: DollLook, w: Wear, lowerMiko: boolean, p: BodyPose): void {
  const { dx, dy, flare, flap, f } = p, o = outfitOf(w);
  const S = (x: number, y: number, c: RGB): void => b.set(x + dx, y + dy, c);
  const line = (pts: [number, number][], c: RGB): void => { for (const [x, y] of pts) S(x, y, c); };
  const fw = flare ? 1 : 0;
  if (w.kind === 'outfit' && w.o === 'coat') {
    const c1 = w.c1;
    for (let k = 0; k <= 6 - fw * 2; k++) {
      const y = 42 + k, trail = Math.round(flap * k * 0.5) + (flare ? Math.round(k * 0.6) : 0);
      for (let x = 16 - trail; x <= 21; x++) S(x, y, x === 16 - trail ? c1[4] : k === 6 - fw * 2 ? c1[2] : c1[3]);
      for (let x = 25; x <= 28 - (k > 4 ? 1 : 0); x++) S(x, y, x === 25 ? c1[4] : x === 28 ? c1[2] : k === 6 - fw * 2 ? c1[2] : c1[3]);
    }
  }
  const top = w.kind === 'armor' ? armor5(w.set) : o === 'sailor' || o === 'miko' ? WHITE : o === 'explorer' ? w.c2 : w.c1;
  const rows = o === 'hoodie' ? HOODIE_ROWS : TORSO_ROWS;
  fillRows(b, rows, top, dx, dy, 31, o === 'miko' && lowerMiko ? 38 : 42);
  if (w.kind === 'armor') {
    chestDetail(b, w.set, rows, dx, dy, 'side');
    const sp = chestSpots(rows, dx, dy);
    upgrades(b, w.p, sp.spots, sp.gem, f, ARMOR_RAMP[w.set]);
  } else {
    const { c1, c2 } = w;
    if (o === 'explorer') {
      for (let y = 32; y <= 40; y++) for (let x = 17; x <= 27; x++) {
        const r0 = TORSO_ROWS[y];
        if (!r0 || x < r0[0] || x > r0[1]) continue;
        if (x <= 21 || x >= 26) S(x, y, x === r0[0] ? c1[4] : x >= r0[1] ? c1[2] : c1[3]);
      }
      line([[21, 31], [22, 31], [23, 31], [24, 31]], c2[4]);
      for (let k = 0; k <= 8; k++) S(18 + k, 32 + k, LEATHER[3]);
      for (let x = 17; x <= 27; x++) S(x, 41, LEATHER[2]);
      S(25, 41, GOLD);
      for (let y = 38; y <= 42; y++) for (let x = 14; x <= 17; x++) S(x, y, y === 38 ? LEATHER[4] : x === 14 ? LEATHER[4] : LEATHER[3]);
      S(16, 40, GOLD);
    } else if (o === 'sailor') {
      for (let y = 31; y <= 36; y++) for (let x = 16; x <= 20; x++) S(x, y, y === 35 && x < 20 ? WHITE[3] : x === 16 ? c1[4] : c1[3]);
      line([[23, 31], [24, 32], [25, 33], [26, 34]], c1[3]);
      line([[22, 31], [23, 32], [24, 33]], c1[2]);
      line([[26, 34], [27, 34], [26, 35], [27, 35]], c2[3]);
      S(26, 34, c2[4]);
      line([[27, 36], [26, 37], [27, 37], [27, 38]], c2[2]);
      for (let x = 17; x <= 27; x++) S(x, 40, WHITE[2]);
    } else if (o === 'miko') {
      line([[22, 31], [23, 32], [24, 33], [25, 34], [26, 35]], c1[3]);
      line([[21, 31], [22, 32], [23, 33]], WHITE[2]);
    } else if (o === 'hoodie') {
      for (let y = 28; y <= 34; y++) for (let x = 13; x <= 21; x++) {
        const nx = (x + 0.5 - 17.4) / 3.6, ny = (y + 0.5 - 31.2) / 3, d = nx * nx + ny * ny;
        if (d > 1) continue;
        S(x, y, d < 0.25 ? c1[1] : nx < -0.3 ? c1[4] : ny > 0.5 ? c1[2] : c1[3]);
      }
      for (let x = 22; x <= 27; x++) S(x, 37, c1[2]);
      S(22, 38, c1[2]); S(22, 39, c1[2]); S(22, 40, c1[2]);
      line([[25, 32], [25, 33], [25, 34], [25, 35]], c2[3]); S(25, 36, c2[4]);
      line([[26, 32], [26, 33], [26, 34]], c2[2]); S(26, 35, c2[4]);
      for (let x = 16; x <= 27; x++) S(x, 42, c1[2]);
    } else if (o === 'coat') {
      line([[23, 31], [24, 32], [25, 33], [26, 34], [27, 35]], c2[3]);
      line([[22, 31], [23, 32], [24, 33]], c2[2]);
      S(27, 37, c2[4]); S(27, 39, c2[4]);
      for (let x = 17; x <= 27; x++) S(x, 41, LEATHER[2]);
      S(26, 41, GOLD);
    } else if (o === 'maid') {
      line([[20, 31], [21, 31], [22, 31], [23, 31], [24, 31]], c2[4]);
      for (let y = 33; y <= 40; y++) for (let x = 23; x <= 27; x++) S(x, y, x === 23 || x === 27 ? c2[2] : (y === 33 && (x & 1)) ? c2[4] : c2[3]);
      line([[22, 32], [21, 33], [22, 34]], c2[3]);
      for (const [x, y] of [[13, 38], [14, 38], [13, 39], [14, 39], [15, 39], [16, 39], [13, 40], [14, 40], [12, 41], [13, 41]] as [number, number][]) S(x, y, x <= 13 ? c2[4] : c2[3]);
      S(15, 40, c2[2]); S(16, 40, c2[2]);
    }
  }
  if (l.neck) neckArt(b, l.neck, dx, dy);
  if (l.belt) beltArt(b, l.belt, dx, dy);
}

// ── 身體（背面：爬繩） ───────────────────────────────────
const BACK_ROWS: Record<number, [number, number]> = {
  31: [19, 25], 32: [17, 27], 33: [17, 27], 34: [17, 27], 35: [17, 27], 36: [17, 27], 37: [17, 27],
  38: [18, 26], 39: [18, 26], 40: [18, 26], 41: [17, 27], 42: [17, 27],
};
function lowerBack(b: Bmp, w: Wear, dx: number, dy: number, sway: number): void {
  if (w.kind !== 'outfit') return;
  const c1 = w.c1, S = (x: number, y: number, c: RGB): void => b.set(x + dx, y + dy, c);
  if (w.o === 'sailor') skirt(b, 41, [[17, 27], [16, 28], [16, 28], [15, 29], [15, 29]], c1, dx, dy, true, sway);
  if (w.o === 'maid') {
    skirt(b, 41, [[17, 27], [16, 28], [15, 29], [15, 29], [14, 30], [14, 30]], c1, dx, dy, false, sway);
    for (let x = 14; x <= 30; x++) S(x, 46, (x & 1) ? WHITE[2] : WHITE[3]);
  }
  if (w.o === 'miko') { skirt(b, 39, [[17, 27], [17, 27], [16, 28], [16, 28], [16, 28], [15, 29], [15, 29]], c1, dx, dy, true, sway * 0.5); for (let x = 20; x <= 24; x++) S(x, 39, c1[4]); S(19, 40, c1[3]); S(25, 40, c1[3]); }
}
function topBack(b: Bmp, l: DollLook, w: Wear, lowerMiko: boolean, dx: number, dy: number, sway: number, f: number): void {
  const o = outfitOf(w), S = (x: number, y: number, c: RGB): void => b.set(x + dx, y + dy, c);
  if (w.kind === 'outfit' && w.o === 'coat') {
    const c1 = w.c1;
    for (let k = 0; k <= 6; k++) for (let x = 16; x <= 28; x++) {
      if (x === 22 && k > 1) continue;
      S(x + (x < 22 ? -Math.round(sway * k * 0.3) : 0), 42 + k, x === 16 ? c1[4] : x === 28 ? c1[2] : k === 6 ? c1[2] : c1[3]);
    }
  }
  const top = w.kind === 'armor' ? armor5(w.set) : o === 'sailor' || o === 'miko' ? WHITE : w.c1;
  fillRows(b, BACK_ROWS, top, dx, dy, 31, o === 'miko' && lowerMiko ? 38 : 42);
  if (w.kind === 'armor') {
    chestDetail(b, w.set, BACK_ROWS, dx, dy, 'back');
    upgrades(b, w.p, chestSpots(BACK_ROWS, dx, dy).spots, null, f, ARMOR_RAMP[w.set]);
    return;
  }
  const { c1, c2 } = w;
  if (o === 'explorer') {
    for (let y = 33; y <= 40; y++) for (let x = 18; x <= 26; x++) S(x, y, y <= 34 ? LEATHER[4] : x === 18 ? LEATHER[4] : x === 26 ? LEATHER[2] : LEATHER[3]);
    for (let x = 18; x <= 26; x++) S(x, 35, LEATHER[2]);
    S(22, 36, GOLD); S(18, 32, LEATHER[2]); S(26, 32, LEATHER[2]); S(18, 31, LEATHER[2]); S(26, 31, LEATHER[2]);
    for (let x = 17; x <= 27; x++) S(x, 41, LEATHER[2]);
  } else if (o === 'sailor') {
    for (let y = 31; y <= 36; y++) for (let x = 17; x <= 27; x++) {
      const stripe = (y === 35 && x >= 18 && x <= 26) || ((x === 18 || x === 26) && y <= 35);
      S(x, y, stripe ? WHITE[3] : x === 17 ? c1[4] : x === 27 ? c1[2] : c1[3]);
    }
  } else if (o === 'hoodie') {
    for (let y = 30; y <= 36; y++) for (let x = 18; x <= 26; x++) {
      const nx = (x + 0.5 - 22) / 4.4, ny = (y + 0.5 - 32.6) / 3.6, d = nx * nx + ny * ny;
      if (d > 1) continue;
      S(x, y, d < 0.3 ? c1[1] : nx < -0.4 ? c1[4] : ny > 0.4 ? c1[2] : c1[3]);
    }
    for (let x = 17; x <= 27; x++) S(x, 42, c1[2]);
  } else if (o === 'coat') {
    for (let y = 35; y <= 42; y++) S(22, y, c1[2]);
    for (let x = 17; x <= 27; x++) S(x, 40, LEATHER[2]);
  } else if (o === 'maid') {
    for (let k = 0; k <= 7; k++) { S(18 + k, 32 + k, c2[3]); S(26 - k, 32 + k, c2[3]); }
    ['bb...bb', 'bBbkbBb', 'bbbkbbb', '.bb.bb.'].forEach((row, y) => { for (let x = 0; x < row.length; x++) { const ch = row[x]; if (ch !== '.') S(19 + x, 38 + y, ch === 'B' ? c2[4] : ch === 'k' ? c2[2] : c2[3]); } });
  }
  void l;
}

/** 背面的腿：lift = 這條腿抬起幾 px（膝蓋往外彎） */
function backLeg(hipX: number, lift: number, st: LegStyle, far: boolean): Bmp {
  const b = new Bmp(AV_FW, AV_FH);
  const ay = ANKLE - lift, ky = HIP_Y + (ay - HIP_Y) / 2 - lift * 0.3, kx = hipX + (hipX < CX ? -1 : 1) * lift * 0.35;
  const at = (t: number): [number, number] => t <= 0.5 ? [hipX + (kx - hipX) * t * 2, HIP_Y + (ky - HIP_Y) * t * 2] : [kx + (hipX - kx) * (t - 0.5) * 2, ky + (ay - ky) * (t - 0.5) * 2];
  paintLeg(b, st, at, far);
  if (st.greave) greaveKnee(b, st.greave, kx, ky);
  const r = far ? darker(st.shoe.r) : st.shoe.r, x = Math.round(hipX - 1.5), y = Math.round(ay);
  b.rect(x, y - 1, 4, 1, r[3]); b.rect(x, y, 4, 1, r[3]); b.rect(x, y + 1, 4, 1, r[1]); b.set(x, y - 1, r[4]);
  b.outline(INK);
  return b;
}

// ── 手臂 ─────────────────────────────────────────────────
/** 手臂朝下（軸心 = 肩）；袖子依上衣：短袖 / 長袖 + 袖口 / 泡泡袖 / 巫女大袖 / 防具（套裝細節 + 稀有度滾邊） */
export function avatarArm(l: DollLook, back: boolean, f = 0): Bmp {
  const w = wearOf(l, l.body), sk0 = skinRamp(l.app.skin);
  const dk = (r: RGB[]): RGB[] => (back ? darker(r) : r);
  const sk = dk(sk0);
  const arm = new Bmp(ARM_W, ARM_H);
  const col = (y0: number, y1: number, r: RGB[], x0 = 12, x1 = 14): void => {
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) arm.set(x, y, x === x0 ? r[4] : x === x1 ? r[2] : r[3]);
  };
  const hand = (): void => { arm.rect(12, 8, 3, 2, sk[3]); arm.set(12, 8, sk[4]); arm.set(14, 9, sk[2]); arm.set(13, 10, sk[2]); };
  if (w.kind === 'armor') {
    const r = dk(armor5(w.set)), R = ARMOR_RAMP[w.set];
    col(1, 6, r); col(1, 3, r, 11, 15); arm.set(11, 1, r[4]); col(7, 7, sk); hand();
    arm.set(12, 5, R[1]); arm.set(13, 5, R[1]); arm.set(14, 5, R[1]);
    if (!back) upgrades(arm, w.p, [[11, 3], [12, 3], [13, 3], [14, 3], [15, 3], [12, 6], [13, 6], [14, 6]], null, f, R);
  } else {
    const { o, c1, c2 } = w;
    if (o === 'explorer') { col(1, 3, dk(c2)); col(4, 7, sk); arm.rect(12, 4, 3, 1, dk(c2)[2]); hand(); }
    else if (o === 'sailor') { col(1, 6, dk(WHITE)); col(7, 7, dk(c1)); hand(); }
    else if (o === 'hoodie') { col(1, 6, dk(c1)); arm.rect(12, 7, 3, 1, dk(c1)[2]); hand(); arm.set(12, 8, dk(c1)[3]); }
    else if (o === 'coat') { col(1, 6, dk(c1)); col(7, 7, dk(c2)); hand(); }
    else if (o === 'maid') { col(1, 3, dk(c1), 11, 15); col(4, 6, sk); col(7, 7, dk(WHITE)); hand(); }
    else if (o === 'miko') {
      const wh = dk(WHITE), r = dk(c1);
      col(1, 7, wh);
      for (let y = 3; y <= 11; y++) for (let x = 15; x <= 17; x++) arm.set(x, y, y === 11 ? r[3] : x === 17 ? wh[2] : wh[3]);
      arm.set(14, 8, r[3]); hand();
    } else { col(1, 7, dk(c1)); hand(); }
  }
  arm.outline(INK);
  return arm;
}
/** 背面爬繩時手臂的袖子顏色 */
function armSleeve(l: DollLook): RGB[] {
  const w = wearOf(l, l.body);
  if (w.kind === 'armor') return armor5(w.set);
  return w.o === 'sailor' || w.o === 'miko' ? WHITE : w.o === 'explorer' ? skinRamp(l.app.skin) : w.c1;
}

// ── 影格 ─────────────────────────────────────────────────
interface SidePose {
  near: LegPose; far: LegPose;
  /** 腳要不要貼地（依最低的腳踝把身體往下推） */
  snap: boolean;
  expr: Expr; hair: HairMotion;
  /** 身體 / 頭相對站立的位移 */
  bodyDx: number; bodyDy: number; headDx: number; headDy: number;
  flare: number; flap: number; sweat?: boolean;
}

function sideFrame(l: DollLook, p: SidePose, f: number, trace?: string[]): AvatarFrame {
  const top = wearOf(l, l.body), low = wearOf(l, l.legs);
  const st = legStyle(l, low);
  const far = legBmp(p.far, CX - 1.5, HIP_Y, st, true), near = legBmp(p.near, CX + 1, HIP_Y, st, false);
  const dy = p.snap ? Math.round(ANKLE - Math.max(far.ankleY, near.ankleY)) : 0;
  const body = new Bmp(AV_FW, AV_FH), head = new Bmp(AV_FW, AV_FH), hairBack = new Bmp(AV_FW, AV_FH);
  const headTrace: string[] = [];
  drawHead(hairBack, head, HEAD_X + p.headDx + p.bodyDx, HEAD_Y + dy + p.bodyDy + p.headDy, {
    app: l.app, expr: p.expr, motion: p.hair, gear: l.head, view: 'side', sweat: p.sweat, f, trace: headTrace,
  });
  // 背飾（身體後面）
  if (l.back) { backArt(body, l.back, 'side', p.flap * 0.5 + (p.flare ? 0.6 : 0), p.flare ? (p.hair.lift > 0.7 ? 1 : 0.4) : 0, p.bodyDx, dy + p.bodyDy, f); trace?.push('back'); }
  body.blit(hairBack, 0, 0); trace?.push('backHair');
  // 脖子
  const neck = new Bmp(AV_FW, AV_FH), sk = skinRamp(l.app.skin);
  neck.rect(21 + p.bodyDx, 29 + dy + p.bodyDy, 3, 2, sk[2]);
  body.blit(neck, 0, 0); trace?.push('body');
  body.blit(far.b, p.bodyDx, dy);
  body.blit(near.b, p.bodyDx, dy);
  if (st.greave) upgrades(body, low.kind === 'armor' ? low.p : null, [[Math.round(near.knee[0]) + p.bodyDx, Math.round(near.knee[1]) + dy - 1], [Math.round(near.knee[0]) + p.bodyDx + 1, Math.round(near.knee[1]) + dy - 1]], null, f, ARMOR_RAMP[st.greave]);
  trace?.push('legs');
  const chest = new Bmp(AV_FW, AV_FH), bp: BodyPose = { dx: p.bodyDx, dy: dy + p.bodyDy, flare: p.flare, flap: p.flap, f };
  const lowerMiko = low.kind === 'outfit' && low.o === 'miko';
  lowerSide(chest, low, bp);
  topSide(chest, l, top, lowerMiko, bp);
  chest.outline(INK);
  body.blit(chest, 0, 0); trace?.push('chest');
  trace?.push(...headTrace);
  return { body, head, meta: { dx: p.bodyDx, dy: dy + p.bodyDy, arms: true } };
}

const still = (expr: Expr = 'normal'): SidePose => ({
  near: { thigh: 4, shin: 2 }, far: { thigh: -4, shin: -3 }, snap: true, expr, hair: { swing: 0, lift: 0 },
  bodyDx: 0, bodyDy: 0, headDx: 0, headDy: 0, flare: 0, flap: 0,
});

/** 背面爬繩：手交替（抓在頭的兩側上方）、對側的腳抬起；背飾蓋在背上 */
function backFrame(l: DollLook, o: { handL: number; handR: number; liftL: number; liftR: number; bodyDx: number; bodyDy: number; swing: number }, f: number): AvatarFrame {
  const top = wearOf(l, l.body), low = wearOf(l, l.legs);
  const st = legStyle(l, low), body = new Bmp(AV_FW, AV_FH);
  const { bodyDx: dx, bodyDy: dy } = o;
  body.blit(backLeg(CX + 2, o.liftR, st, true), dx, dy);
  body.blit(backLeg(CX - 2, o.liftL, st, false), dx, dy);
  const chest = new Bmp(AV_FW, AV_FH);
  lowerBack(chest, low, dx, dy, o.swing);
  topBack(chest, l, top, low.kind === 'outfit' && low.o === 'miko', dx, dy, o.swing, f);
  chest.outline(INK);
  body.blit(chest, 0, 0);
  if (l.back) backArt(body, l.back, 'back', o.swing, 0, dx, dy, f);
  const back = new Bmp(AV_FW, AV_FH), headL = new Bmp(AV_FW, AV_FH);
  drawHead(back, headL, HEAD_X + dx, HEAD_Y + dy, { app: l.app, expr: 'normal', motion: { swing: o.swing, lift: 0 }, gear: l.head, view: 'back', f });
  body.blit(back, 0, 0);
  body.blit(headL, 0, 0);
  // 手臂畫在頭上面：肩 → 往外的手肘 → 手抓在頭的兩側（高的那隻在頭頂旁邊）
  const arms = new Bmp(AV_FW, AV_FH), sk = skinRamp(l.app.skin), sleeve = armSleeve(l);
  const arm = (side: -1 | 1, hy: number): void => {
    const sx = CX + side * 5 + dx, sy = 33 + dy;
    const hx = CX + side * (hy < 14 ? 6 : 8) + dx, ex = CX + side * 10 + dx, ey = (sy + hy) / 2 + 2;
    seg(arms, sx, sy, ex, ey, 1.5, sleeve);
    seg(arms, ex, ey, hx, hy + 2, 1.3, sleeve);
    const x = Math.round(hx) - 1, y = Math.round(hy) - 1;
    arms.rect(x, y, 3, 3, sk[3]); arms.set(x, y, sk[4]); arms.set(x + 2, y + 2, sk[2]); arms.set(x + (side < 0 ? 2 : 0), y + 1, sk[2]);
  };
  arm(-1, o.handL);
  arm(1, o.handR);
  arms.outline(INK);
  body.blit(arms, 0, 0);
  return { body, head: new Bmp(AV_FW, AV_FH), meta: { dx, dy, arms: false } };
}

/** 把點陣逆時針轉 90°（倒地用；精確轉置，不失真） */
function rot90ccw(src: Bmp): Bmp {
  const o = new Bmp(src.h, src.w);
  for (let y = 0; y < src.h; y++) for (let x = 0; x < src.w; x++) {
    const v = src.raw(x, y);
    if (v >>> 24) o.setRaw(y, src.w - 1 - x, v);
  }
  return o;
}

function deadFrame(l: DollLook): AvatarFrame {
  const fr = sideFrame(l, { ...still('dead'), hair: { swing: 0.6, lift: 0 } }, 0);
  const stand = fr.body;
  stand.blit(avatarArm(l, false), AV_SHOULDER_FRONT.x - ARM_PIV.x, AV_SHOULDER_FRONT.y - ARM_PIV.y);
  stand.blit(fr.head, 0, 0);
  // 逆時針轉 90°：頭在左、臉朝上；再鏡像 → 頭在右（面向右時躺下的頭朝前）
  const r = rot90ccw(stand);
  let x0 = r.w, x1 = -1, y1 = -1;
  for (let y = 0; y < r.h; y++) for (let x = 0; x < r.w; x++) if (r.on(x, y)) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
  const out = new Bmp(AV_FW, AV_FH);
  out.blit(r, Math.round((AV_FW - (x1 - x0 + 1)) / 2) - x0, AV_FH - 1 - y1);
  const flip = new Bmp(AV_FW, AV_FH);
  flip.blit(out, 0, 0, true);
  return { body: flip, head: new Bmp(AV_FW, AV_FH), meta: { dx: 0, dy: 0, arms: false } };
}

/** 精確順時針轉 90°（游泳：站姿 → 頭朝前趴著） */
function rot90cw(src: Bmp): Bmp {
  const o = new Bmp(src.h, src.w);
  for (let y = 0; y < src.h; y++) for (let x = 0; x < src.w; x++) {
    const v = src.raw(x, y);
    if (v >>> 24) o.setRaw(src.h - 1 - y, x, v);
  }
  return o;
}
/** 內容外框 */
function bbox(b: Bmp): { x0: number; y0: number; x1: number; y1: number } {
  let x0 = b.w, y0 = b.h, x1 = -1, y1 = -1;
  for (let y = 0; y < b.h; y++) for (let x = 0; x < b.w; x++) if (b.on(x, y)) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
  return { x0, y0, x1, y1 };
}
/** 游泳時身體往前傾的角度（度，順時針）：頭朝前上方、腳在後下方 */
const SWIM_TILT = 52;
/**
 * 游泳：側面站姿（腿上下打水、雙手往頭頂方向交替划）連同手臂一起畫好，再精確順時針轉 90° →
 * 身體水平、頭朝前、臉朝下（自由式），頭髮自然往後飄。整個人放在碰撞框的中段（水面線附近也看得到）。
 */
function swimFrame(l: DollLook, f: number): AvatarFrame {
  const ph = (f / SWIM_FRAMES) * Math.PI * 2;
  const p = still();
  p.snap = false;
  p.near = { thigh: 18 * Math.sin(ph), shin: 18 * Math.sin(ph) - 14 };
  p.far = { thigh: -18 * Math.sin(ph), shin: -18 * Math.sin(ph) - 14 };
  p.hair = { swing: 0.2 * Math.sin(ph), lift: 0 };
  const fr = sideFrame(l, p, f);
  const stand = new Bmp(AV_FW, AV_FH);
  const SWIM_REACH = HAND_REACH + 4;
  const reach = (deg: number): { x: number; y: number } => ({ x: Math.round(Math.sin((deg * Math.PI) / 180) * SWIM_REACH), y: Math.round(Math.cos((deg * Math.PI) / 180) * SWIM_REACH) });
  // 划水：前手 / 後手在「頭頂前方 ↔ 身側」之間交替（轉 90° 後 = 往前伸 ↔ 划到腰）
  // 蛙式 / 自由式：雙手在「頭頂前方（180°）↔ 胸前（80°）」之間交替；轉 50° 後 = 往游的方向伸、再划回來
  const front = 130 + 50 * Math.sin(ph), back = 130 - 50 * Math.sin(ph);
  const sleeve = armSleeve(l), sk = skinRamp(l.app.skin);
  const armLayer = (deg: number, s: { x: number; y: number }, dark: boolean): Bmp => {
    const b = new Bmp(AV_FW, AV_FH), h = reach(deg), sl = dark ? darker(sleeve) : sleeve, kk = dark ? darker(sk) : sk;
    seg(b, s.x, s.y, s.x + h.x * 0.6, s.y + h.y * 0.6, 1.4, sl);
    seg(b, s.x + h.x * 0.6, s.y + h.y * 0.6, s.x + h.x, s.y + h.y, 1.3, kk);
    b.outline(INK);
    return b;
  };
  stand.blit(armLayer(back, AV_SHOULDER_BACK, true), 0, 0);
  stand.blit(fr.body, 0, 0);
  // 前手：伸過頭頂時在頭後面、划回胸前時在頭前面（不會整條蓋住臉）
  const fa = armLayer(front, AV_SHOULDER_FRONT, false);
  if (front > 150) { stand.blit(fa, 0, 0); stand.blit(fr.head, 0, 0); } else { stand.blit(fr.head, 0, 0); stand.blit(fa, 0, 0); }
  const r = rotate(rotPrep(stand), CX, 33, (SWIM_TILT * Math.PI) / 180, 72), bb = bbox(r);
  const out = new Bmp(AV_FW, AV_FH);
  const w = bb.x1 - bb.x0 + 1, h = bb.y1 - bb.y0 + 1;
  // 水平置中、垂直中心在碰撞框中段（影格第 ~34 列），微微上下浮
  out.blit(r, Math.round((AV_FW - w) / 2) - bb.x0, Math.round(34 - h / 2) - bb.y0 + Math.round(Math.sin(ph) * 0.8));
  return { body: out, head: new Bmp(AV_FW, AV_FH), meta: { dx: 0, dy: 0, arms: false } };
}

/**
 * 攀上邊緣的手臂（畫在頭的上面）：肩膀 → 手抓在牆角（hx, hy：影格座標，面向右）。
 * 距離夠長就伸直（太高的台階會拉長手臂搆上去）、短了就把手肘往後彎（撐起來的樣子）；手掌蓋在台面上。
 * 回傳的點陣比影格大一圈（ARMS_PAD），畫的時候往左上偏移 ARMS_PAD。
 */
export const ARMS_PAD = 24;
export function mantleArms(l: DollLook, meta: FrameMeta, hx: number, hy: number): { arms: Bmp; hands: Bmp } {
  const W = AV_FW + ARMS_PAD * 2, H = AV_FH + ARMS_PAD * 2, o = ARMS_PAD;
  const b = new Bmp(W, H), hands = new Bmp(W, H), sleeve = armSleeve(l), sk = skinRamp(l.app.skin);
  const one = (s: { x: number; y: number }, tx: number, ty: number, dark: boolean): void => {
    const sx = s.x + meta.dx + o, sy = s.y + meta.dy + o;
    let ex = tx + o, ey = ty + o;
    const U = 5, F = 5;
    // 往上（懸掛）可以拉長手臂搆到高台；往下（撐起）最多伸直一隻手臂的長度
    const d0 = Math.hypot(ex - sx, ey - sy);
    if (ey > sy - 2 && d0 > U + F + 1) { const k = (U + F + 1) / d0; ex = Math.round(sx + (ex - sx) * k); ey = Math.round(sy + (ey - sy) * k); }
    const d = Math.hypot(ex - sx, ey - sy);
    const sl = dark ? darker(sleeve) : sleeve, kk = dark ? darker(sk) : sk;
    const layer = new Bmp(W, H);
    if (d >= U + F - 0.5) {
      // 伸直（必要時拉長）：前 55% 袖子、後面是前臂
      const mx = sx + (ex - sx) * 0.55, my = sy + (ey - sy) * 0.55;
      seg(layer, sx, sy, mx, my, 1.4, sl);
      seg(layer, mx, my, ex, ey, 1.3, kk);
    } else {
      // 兩段 IK：手肘往後（−x）、往上彎
      const a = Math.atan2(ey - sy, ex - sx), c = Math.acos(Math.max(-1, Math.min(1, (U * U + d * d - F * F) / (2 * U * d))));
      const ang = a + (Math.cos(a) >= 0 ? -c : c);
      const kx = sx + Math.cos(ang) * U, ky = sy + Math.sin(ang) * U;
      const elbow = { x: kx - Math.abs(kx - sx) * 0.4, y: ky };
      seg(layer, sx, sy, elbow.x, elbow.y, 1.4, sl);
      seg(layer, elbow.x, elbow.y, ex, ey, 1.3, kk);
    }
    layer.outline(INK);
    b.blit(layer, 0, 0);
    // 手掌（另一張，畫在頭上面）：抓在台面上、手指扣住牆角
    const hand = new Bmp(W, H);
    hand.rect(ex - 1, ey - 1, 3, 2, kk[3]); hand.set(ex - 1, ey - 1, kk[4]); hand.set(ex + 1, ey, kk[2]); hand.set(ex - 2, ey, kk[2]); hand.set(ex, ey + 1, kk[2]);
    hand.outline(INK);
    hands.blit(hand, 0, 0);
  };
  one(AV_SHOULDER_BACK, hx - 2, hy, true);
  one(AV_SHOULDER_FRONT, hx, hy, false);
  return { arms: b, hands };
}

/** 依動畫與影格畫出一格（trace：記錄側面影格的圖層合成順序，測試用） */
export function avatarFrame(l: DollLook, anim: SheetAnim, f: number, trace?: string[]): AvatarFrame {
  switch (anim) {
    case 'idle': case 'blink': {
      const p = still(anim === 'blink' ? 'blink' : 'normal');
      p.bodyDy = f === 2 || f === 3 ? 1 : 0;
      p.hair = { swing: [0, 0.15, 0.25, 0.1][f] ?? 0, lift: 0 };
      return sideFrame(l, p, f, trace);
    }
    case 'walk': {
      const ph = (f / WALK_FRAMES) * Math.PI * 2;
      const th = (q: number): LegPose => ({ thigh: 32 * Math.sin(q), shin: 32 * Math.sin(q) - (6 + 50 * Math.max(0, Math.cos(q))) });
      const p = still();
      p.near = th(ph); p.far = th(ph + Math.PI);
      p.hair = { swing: 0.55 + 0.35 * Math.cos(ph * 2), lift: 0.15 * Math.abs(Math.cos(ph)) };
      p.flap = 1 + Math.sin(ph * 2) * 0.8;
      p.headDx = 1;
      return sideFrame(l, p, f, trace);
    }
    case 'jump': {
      const p = still();
      p.near = { thigh: 55, shin: -15 }; p.far = { thigh: -10, shin: -50 }; p.snap = false;
      p.hair = { swing: 0.3, lift: 0.55 }; p.flare = 1; p.flap = 0.5;
      return sideFrame(l, p, f, trace);
    }
    case 'fall': {
      const p = still();
      p.near = { thigh: 22, shin: 8 }; p.far = { thigh: -25, shin: -18 }; p.snap = false;
      p.hair = { swing: -0.1, lift: 1 }; p.flare = 1; p.flap = -0.6;
      return sideFrame(l, p, f, trace);
    }
    case 'climb': {
      const ph = (f / CLIMB_FRAMES) * Math.PI * 2, c = Math.cos(ph);
      return backFrame(l, {
        handL: 15 - 5 * c, handR: 15 + 5 * c, liftL: Math.round(2 - 2 * c), liftR: Math.round(2 + 2 * c),
        bodyDx: 0, bodyDy: Math.round(Math.sin(ph * 2) * 0.6), swing: 0.35 * Math.sin(ph),
      }, f);
    }
    case 'hang': {
      const sway = [0, 1, 0, -1][f] ?? 0;
      return backFrame(l, { handL: 11, handR: 11, liftL: [0, 1, 2, 1][f] ?? 0, liftR: [2, 1, 0, 1][f] ?? 0, bodyDx: sway, bodyDy: 1, swing: sway * 0.5 }, f);
    }
    case 'mantle': {
      // 0 懸掛拉起（腿垂著）→ 1 撐起手肘（腿蹬）→ 2 膝蓋上台 → 3 蹲著站起；手臂由 mantleArms 畫在頭的上面
      const p = still('effort');
      p.snap = f === 3; p.sweat = f < 3;
      if (f === 0) { p.near = { thigh: 6, shin: 2 }; p.far = { thigh: -6, shin: -6 }; p.headDy = -1; p.hair = { swing: 0.3, lift: 0 }; }
      else if (f === 1) { p.near = { thigh: 28, shin: -26 }; p.far = { thigh: -14, shin: -36 }; p.bodyDx = 1; p.headDx = 1; p.hair = { swing: 0.45, lift: 0.1 }; }
      else if (f === 2) { p.near = { thigh: 92, shin: -28 }; p.far = { thigh: -20, shin: -24 }; p.bodyDx = 2; p.headDx = 1; p.bodyDy = -1; p.hair = { swing: 0.4, lift: 0.1 }; }
      else { p.near = { thigh: 55, shin: -45 }; p.far = { thigh: 35, shin: -55 }; p.bodyDx = 1; p.headDx = 1; p.hair = { swing: 0.2, lift: 0 }; p.expr = 'normal'; }
      return sideFrame(l, p, f, trace);
    }
    case 'swim': return swimFrame(l, f);
    case 'hurt': {
      const p = still('hurt');
      p.near = { thigh: 30, shin: 10 }; p.far = { thigh: -25, shin: -10 }; p.snap = false;
      p.headDx = -1; p.hair = { swing: -0.6, lift: 0.4 }; p.flare = 1;
      return sideFrame(l, p, f, trace);
    }
    case 'dead': return deadFrame(l);
  }
}

/** 整張影格表：SHEET.total 格橫排、兩列（第 0 列 = body、第 1 列 = head） */
export function avatarSheet(l: DollLook): { b: Bmp; meta: FrameMeta[] } {
  const b = new Bmp(AV_FW * SHEET.total, AV_FH * 2);
  const meta: FrameMeta[] = [];
  for (const k of SHEET_ANIMS) {
    const [s, n] = SHEET[k];
    for (let f = 0; f < n; f++) {
      const r = avatarFrame(l, k, f);
      b.blit(r.body, (s + f) * AV_FW, 0);
      b.blit(r.head, (s + f) * AV_FW, AV_FH);
      meta[s + f] = r.meta;
    }
  }
  return { b, meta };
}
/** 一格的 body + head 疊成一張（預覽 / 圖示用；手臂另外畫） */
export function flatFrame(r: AvatarFrame): Bmp {
  const o = r.body.clone();
  o.blit(r.head, 0, 0);
  return o;
}

/** 色票裡的白（測試用） */
export const AV_WHITE = hex('#ffffff');
export type { Appearance };

/** 單一件穿戴物（不含身體）的點陣：時裝 / 防具圖示、說明框用。slot = 這件畫在哪 */
export function pieceBmp(l: DollLook, slot: 'head' | 'body' | 'legs' | 'back'): Bmp {
  const b = new Bmp(AV_FW, AV_FH);
  const pose: BodyPose = { dx: 0, dy: 0, flare: 0, flap: 0, f: 0 };
  if (slot === 'body') { topSide(b, { ...l, neck: null, belt: null }, wearOf(l, l.body), false, pose); b.outline(INK); }
  else if (slot === 'legs') {
    const w = wearOf(l, l.legs), st = legStyle({ ...l, feet: null }, w);
    const skinless: LegStyle = { ...st, parts: st.parts.map(([t, r, h]) => [t, r === skinRamp(l.app.skin) ? CLOTH_RAMPS[0] : r, h]) };
    b.blit(legBmp({ thigh: -6, shin: -4 }, CX - 2, HIP_Y, skinless, true).b, 0, 0);
    b.blit(legBmp({ thigh: 6, shin: 3 }, CX + 1, HIP_Y, skinless, false).b, 0, 0);
    const low = new Bmp(AV_FW, AV_FH);
    lowerSide(low, w, pose);
    if (w.kind === 'outfit' && w.o === 'coat') { topSide(low, l, w, false, pose); }
    low.outline(INK);
    b.blit(low, 0, 0);
  } else if (slot === 'back' && l.back) backArt(b, l.back, 'side', 0.4, 0, 0, 0, 0);
  else if (slot === 'head' && l.head) {
    const h = new Bmp(AV_FW, AV_FH);
    if (armorSet(l.head)) { helmetHeadOnly(h, l.head); h.outline(INK); }
    else hatHeadOnly(h, lookId(l.head, 'hat:') ?? 'beret');
    b.blit(h, 0, 0);
  }
  return b;
}
