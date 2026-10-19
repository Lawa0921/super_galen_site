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
import { CLIMB_FRAMES, CLIMBDOWN_FRAMES, HANG_FRAMES, MANTLE_FRAMES, SWIM_FRAMES } from './playerAnim';

export const AV_FW = 44;
export const AV_FH = 54;
const CX = 22;
/** 站立時腳踝的列（鞋底 = 最下一列） */
const ANKLE = AV_FH - 2;
const HIP_Y = 43;
const THIGH = 4.5, SHIN = 4.5;
/** 頭的區域原點（側面 / 背面） */
const HEAD_X = 12, HEAD_Y = 12;
/** 肩膀軸心（影格座標，未加每格位移）：女生（預設）；男生肩膀寬一格 */
export const AV_SHOULDER_FRONT = { x: 24, y: 33 };
export const AV_SHOULDER_BACK = { x: 20, y: 33 };
const SHOULDERS = [
  { front: AV_SHOULDER_FRONT, back: AV_SHOULDER_BACK },
  { front: { x: 25, y: 32 }, back: { x: 19, y: 32 } },
];
export function shoulderOf(body: number, back: boolean): { x: number; y: number } {
  const s = SHOULDERS[body] ?? SHOULDERS[0];
  return back ? s.back : s.front;
}
/** 爬繩時繩子在影格裡的 x（角色在繩子左邊、面向繩子；畫的時候整格往左偏 ROPE_X − 中心） */
export const ROPE_X = 37;
/** 手臂圖：26×34、軸心 (13,3)；手心距軸心 HAND_REACH px */
export const ARM_W = 26, ARM_H = 34, ARM_PIV = { x: 13, y: 3 };
export const HAND_REACH = 7;

/** 影格表的排列：動畫 → [起始索引, 格數] */
export const SHEET = (() => {
  const order: [string, number][] = [
    ['idle', IDLE_FRAMES], ['blink', IDLE_FRAMES], ['walk', WALK_FRAMES], ['jump', 1], ['fall', 1],
    ['climb', CLIMB_FRAMES], ['climbdown', CLIMBDOWN_FRAMES], ['hang', HANG_FRAMES * 2], ['mantle', MANTLE_FRAMES], ['swim', SWIM_FRAMES], ['hurt', 1], ['dead', 1],
  ];
  const out: Record<string, [number, number]> = {};
  let i = 0;
  for (const [k, n] of order) { out[k] = [i, n]; i += n; }
  return { ...out, total: i } as Record<SheetAnim, [number, number]> & { total: number };
})();
export type SheetAnim = 'idle' | 'blink' | 'walk' | 'jump' | 'fall' | 'climb' | 'climbdown' | 'hang' | 'mantle' | 'swim' | 'hurt' | 'dead';
export const SHEET_ANIMS: readonly SheetAnim[] = ['idle', 'blink', 'walk', 'jump', 'fall', 'climb', 'climbdown', 'hang', 'mantle', 'swim', 'hurt', 'dead'];
/**
 * 每格：身體相對站立的位移（肩膀跟著動）、要不要由渲染器畫可旋轉的手臂；
 * ox = 整格畫的時候往左右偏多少（爬繩：讓繩子對準碰撞框中心）
 */
export interface FrameMeta { dx: number; dy: number; arms: boolean; ox?: number; }
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
function legBmp(pose: LegPose, hipX: number, hipY: number, st: LegStyle, far: boolean, len = THIGH, big = false): { b: Bmp; ankleY: number; knee: [number, number] } {
  const b = new Bmp(AV_FW, AV_FH);
  const rad = (d: number): number => (d * Math.PI) / 180;
  const kx = hipX + Math.sin(rad(pose.thigh)) * len, ky = hipY + Math.cos(rad(pose.thigh)) * len;
  const ax = kx + Math.sin(rad(pose.shin)) * len, ay = ky + Math.cos(rad(pose.shin)) * len;
  const at = (t: number): [number, number] => t <= 0.5 ? [hipX + (kx - hipX) * t * 2, hipY + (ky - hipY) * t * 2] : [kx + (ax - kx) * (t - 0.5) * 2, ky + (ay - ky) * (t - 0.5) * 2];
  paintLeg(b, st, at, far);
  if (st.greave && !far) greaveKnee(b, st.greave, kx, ky);
  shoe(b, st, Math.round(ax - 2), Math.round(ay), far, big);
  b.selOutline();
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
function shoe(b: Bmp, st: LegStyle, x: number, y: number, far: boolean, big = false): void {
  const s = st.shoe, r = far ? darker(s.r) : s.r;
  // 鞋子比腿寬：腳掌 7 格（男生 8 格）、圓鞋頭、鞋底一道暗、鞋面左上一點亮
  const toe = big ? 1 : 0;
  const foot = (y0: number, top: RGB, mid: RGB): void => {
    b.rect(x - 1, y0, 7 + toe, 1, mid); b.set(x - 1, y0, top); b.set(x + 5 + toe, y0, r[2]);
    b.rect(x - 1, y0 + 1, 7 + toe, 1, r[1]); b.set(x + 5 + toe, y0 + 1, r[0]);
    b.set(x + 3 + toe, y0, r[4]);
  };
  switch (s.kind) {
    case 'boot': case 'armor':
      b.rect(x, y - 3, 5, 3, r[3]); b.rect(x, y - 3, 1, 3, r[4]); b.rect(x + 4, y - 3, 1, 3, r[2]);
      b.rect(x, y - 3, 5, 1, s.kind === 'armor' ? r[4] : r[2]); b.set(x + 1, y - 2, r[4]);
      foot(y, r[4], r[3]);
      if (s.kind === 'armor') { b.set(x + 1, y, r[4]); b.set(x + 2, y - 1, r[2]); }
      break;
    case 'tall':
      b.rect(x, y - 4, 5, 4, r[3]); b.rect(x, y - 4, 1, 4, r[4]); b.rect(x + 4, y - 4, 1, 4, r[2]);
      b.rect(x - 1, y - 4, 6, 1, r[2]); b.set(x - 1, y - 4, r[3]); b.set(x + 1, y - 3, r[4]);
      foot(y, r[4], r[3]);
      b.set(x + 2, y - 1, GOLD);
      break;
    case 'loafer': case 'mary':
      foot(y, r[4], r[3]);
      b.set(x, y - 1, r[3]); b.set(x + 1, y - 1, r[3]);
      if (s.kind === 'mary') { b.set(x + 2, y - 1, r[3]); b.set(x + 3, y - 1, r[3]); b.set(x + 2, y, r[4]); }
      break;
    case 'sneaker':
      b.rect(x, y - 1, 5, 1, r[3]); b.set(x, y - 1, r[4]);
      foot(y, r[4], r[3]);
      b.set(x + 1, y, s.accent ?? r[2]); b.set(x + 2, y, s.accent ?? r[2]); b.set(x + 3, y - 1, s.accent ?? r[2]);
      b.rect(x - 1, y + 1, 7 + toe, 1, r[2]);
      break;
    case 'zori':
      b.rect(x, y - 1, 5, 2, r[3]); b.set(x, y - 1, r[4]); b.set(x + 4, y - 1, r[2]); b.set(x + 4, y, r[2]);
      b.rect(x - 1, y + 1, 7 + toe, 1, LEATHER[3]); b.set(x + 2, y, CLOTH_RAMPS[3][3]);
      break;
  }
  if (s.extra && !far) bootExtra(b, s.extra, x, y);
}

// ── 身體（側面） ─────────────────────────────────────────
/** 女：肩窄、胸前微微往前一格的弧度、收腰、臀稍寬 */
const TORSO_F: Record<number, [number, number]> = {
  31: [20, 24], 32: [18, 26], 33: [17, 27], 34: [17, 28], 35: [17, 28], 36: [17, 27], 37: [17, 27],
  38: [18, 26], 39: [18, 26], 40: [18, 26], 41: [17, 27], 42: [17, 27],
};
/** 男：肩膀寬（前後各多一格）、胸口平、腰臀窄直 */
const TORSO_M: Record<number, [number, number]> = {
  31: [19, 25], 32: [16, 28], 33: [15, 29], 34: [15, 29], 35: [15, 28], 36: [16, 28], 37: [17, 27],
  38: [18, 26], 39: [18, 26], 40: [18, 26], 41: [18, 26], 42: [18, 26],
};
/** 某個體型的身體列（連帽衫寬鬆：後背多一格） */
function torsoRows(body: number, hoodie: boolean): Record<number, [number, number]> {
  const base = body === 1 ? TORSO_M : TORSO_F;
  if (!hoodie) return base;
  const out: Record<number, [number, number]> = {};
  for (const k of Object.keys(base)) { const y = Number(k), [x0, x1] = base[y]; out[y] = y >= 33 ? [x0 - 1, x1] : [x0, x1]; }
  return out;
}
function fillRows(b: Bmp, rows: Record<number, [number, number]>, r: RGB[], dx: number, dy: number, from = 0, to = 99): void {
  const ys = Object.keys(rows).map(Number).filter((y) => y >= from && y <= to);
  const top = Math.min(...ys), bot = Math.max(...ys);
  for (const y of ys) {
    const [x0, x1] = rows[y];
    for (let x = x0; x <= x1; x++) {
      // 光從左上：背側兩欄亮、胸前兩欄暗、最前一欄最暗；肩線亮；下緣暗；脖子下方被大頭擋住的陰影
      let c = x === x0 ? r[4] : x === x0 + 1 ? (y < top + 6 ? r[4] : r[3]) : x === x1 ? r[1] : x >= x1 - 2 ? r[2] : r[3];
      if (y === top && x < x1 - 1) c = r[4];
      if (y === bot) c = x <= x0 + 1 ? r[3] : r[2];
      if (y <= top + 1 && x >= x0 + 3 && x <= x1 - 1) c = y === top ? r[2] : x >= x1 - 2 ? r[1] : r[2];
      b.set(x + dx, y + dy, c);
    }
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
  const rows = torsoRows(l.app.body, o === 'hoodie');
  fillRows(b, rows, top, dx, dy, 31, o === 'miko' && lowerMiko ? 38 : 42);
  if (w.kind === 'armor') {
    chestDetail(b, w.set, rows, dx, dy, 'side');
    const sp = chestSpots(rows, dx, dy);
    upgrades(b, w.p, sp.spots, sp.gem, f, ARMOR_RAMP[w.set]);
  } else {
    const { c1, c2 } = w;
    const ys = Object.keys(rows).map(Number), y0 = Math.min(...ys), yb = Math.max(...ys);
    const E = (y: number): [number, number] => rows[y] ?? rows[y0];
    /** 某列從 xa 到 xb 塗一段（夾在身體裡） */
    const run = (y: number, xa: number, xb: number, c: RGB | ((x: number) => RGB)): void => {
      const [a, z] = E(y);
      for (let x = Math.max(a, xa); x <= Math.min(z, xb); x++) S(x, y, typeof c === 'function' ? c(x) : c);
    };
    /** 腰帶：一列皮革 + 前面的金扣（扣環亮點） */
    const belt = (y: number, r: RGB[] = LEATHER): void => {
      const [a, z] = E(y);
      run(y, a, z, (x) => (x === a ? r[4] : x >= z - 1 ? r[2] : r[3]));
      S(z - 2, y, GOLD); S(z - 3, y, hex('#fff4c0'));
    };
    if (o === 'explorer') {
      // 背心（主色）敞開在前面、露出副色的襯衫；斜背帶（皮）、腰帶、後腰的小包
      for (let y = y0 + 1; y <= yb - 2; y++) {
        const [a, z] = E(y);
        run(y, a, z - 3, (x) => (x === a ? c1[4] : x === a + 1 ? c1[3] : x === z - 3 ? c1[1] : c1[3]));
      }
      run(y0, E(y0)[0] + 2, E(y0)[1] - 1, c2[4]);
      run(y0 + 1, E(y0)[1] - 3, E(y0)[1], c2[3]);
      // 背心口袋
      S(E(y0 + 5)[0] + 2, y0 + 5, c1[1]); S(E(y0 + 5)[0] + 3, y0 + 5, c1[1]); S(E(y0 + 6)[0] + 2, y0 + 6, c1[2]); S(E(y0 + 6)[0] + 3, y0 + 6, c1[2]);
      for (let k = 0; k <= 8; k++) { S(E(y0)[0] + 1 + k, y0 + 1 + k, LEATHER[3]); S(E(y0)[0] + 1 + k, y0 + k, LEATHER[4]); }
      belt(yb - 1);
      for (let y = yb - 4; y <= yb; y++) for (let x = 13; x <= 17; x++) S(x, y, y === yb - 4 ? LEATHER[4] : x === 13 ? LEATHER[4] : x === 17 ? LEATHER[2] : y === yb ? LEATHER[2] : LEATHER[3]);
      S(15, yb - 3, GOLD); S(14, yb - 4, LEATHER[3]);
    } else if (o === 'sailor') {
      // 水手領：背後一大片（主色、一道白線）+ 前面 V 領 + 副色領巾打結垂下
      for (let y = y0; y <= y0 + 5; y++) for (let x = E(y)[0] - 1; x <= E(y)[0] + 4 - Math.max(0, y - y0 - 3); x++) S(x, y, y === y0 + 4 && x > E(y)[0] - 1 ? WHITE[3] : x === E(y)[0] - 1 ? c1[4] : y === y0 + 5 ? c1[2] : c1[3]);
      const zx = E(y0)[1];
      line([[zx - 5, y0], [zx - 4, y0 + 1], [zx - 3, y0 + 2], [zx - 2, y0 + 3]], c1[3]);
      line([[zx - 6, y0], [zx - 5, y0 + 1], [zx - 4, y0 + 2]], c1[2]);
      // 領巾結 + 兩條尾巴
      line([[zx - 2, y0 + 3], [zx - 1, y0 + 3], [zx - 2, y0 + 4], [zx - 1, y0 + 4]], c2[3]); S(zx - 2, y0 + 3, c2[4]); S(zx, y0 + 4, c2[2]);
      line([[zx - 1, y0 + 5], [zx - 2, y0 + 6], [zx - 1, y0 + 6], [zx - 1, y0 + 7], [zx, y0 + 7]], c2[2]); S(zx - 2, y0 + 5, c2[3]);
      run(yb - 2, 0, 99, WHITE[2]);
    } else if (o === 'miko') {
      // 白衣：交叉的紅衿（從後頸斜到前胸）+ 白色內衿；胸前一道副色的帶子
      const zx = E(y0)[1];
      line([[zx - 6, y0], [zx - 5, y0 + 1], [zx - 4, y0 + 2], [zx - 3, y0 + 3], [zx - 2, y0 + 4], [zx - 1, y0 + 5]], c1[3]);
      line([[zx - 5, y0], [zx - 4, y0 + 1], [zx - 3, y0 + 2]], c1[4]);
      line([[zx - 7, y0], [zx - 6, y0 + 1], [zx - 5, y0 + 2], [zx - 4, y0 + 3]], WHITE[2]);
      // 腰間的白色細帶（袴的帶子）
      if (lowerMiko) run(yb - 4 > y0 ? Math.min(yb, 38) : yb, 0, 99, (x) => (x & 1 ? WHITE[3] : WHITE[2]));
    } else if (o === 'hoodie') {
      // 帽兜堆在後頸（暗的內側）、兩條副色抽繩、袋鼠口袋、下擺羅紋
      for (let y = y0 - 3; y <= y0 + 3; y++) for (let x = E(y0)[0] - 4; x <= E(y0)[0] + 4; x++) {
        const nx = (x + 0.5 - (E(y0)[0] + 0.4)) / 3.8, ny = (y + 0.5 - (y0 + 0.2)) / 3.1, d = nx * nx + ny * ny;
        if (d > 1) continue;
        S(x, y, d < 0.22 ? c1[0] : d < 0.4 ? c1[1] : nx < -0.3 && ny < 0.3 ? c1[4] : ny > 0.5 ? c1[2] : c1[3]);
      }
      const zx = E(y0)[1];
      line([[zx - 3, y0 + 1], [zx - 3, y0 + 2], [zx - 3, y0 + 3], [zx - 3, y0 + 4]], c2[3]); S(zx - 3, y0 + 5, c2[4]);
      line([[zx - 1, y0 + 1], [zx - 1, y0 + 2], [zx - 1, y0 + 3]], c2[2]); S(zx - 1, y0 + 4, c2[4]);
      run(y0 + 6, zx - 6, zx, c1[2]); S(zx - 6, y0 + 7, c1[2]); S(zx - 6, y0 + 8, c1[2]); S(zx - 6, y0 + 9, c1[2]);
      run(yb, 0, 99, (x) => (x & 1 ? c1[2] : c1[1]));
    } else if (o === 'coat') {
      // 大衣（主色）：前襟敞開露出白襯衫 V 領、翻領（副色）、前緣一排扣子、腰帶
      const zx = E(y0)[1];
      for (let y = y0; y <= y0 + 4; y++) for (let x = zx - 4 + (y - y0); x <= zx - 1; x++) S(x, y, x === zx - 1 ? WHITE[2] : WHITE[3]);
      line([[zx - 5, y0], [zx - 4, y0 + 1], [zx - 3, y0 + 2], [zx - 2, y0 + 3], [zx - 1, y0 + 4], [zx, y0 + 5]], c2[3]);
      line([[zx - 6, y0], [zx - 5, y0 + 1], [zx - 4, y0 + 2], [zx - 3, y0 + 3]], c2[4]);
      line([[zx - 6, y0 + 1], [zx - 5, y0 + 2], [zx - 4, y0 + 3], [zx - 3, y0 + 4]], c2[2]);
      for (const y of [y0 + 6, y0 + 8]) { S(zx - 1, y, GOLD); S(zx - 1, y + 1, c1[1]); }
      for (let y = y0 + 5; y <= yb; y++) S(zx, y, c2[2]);
      belt(yb - 1);
    } else if (o === 'maid') {
      // 黑洋裝 + 白領 + 白圍裙（胸前圍兜、肩帶）+ 後腰的大蝴蝶結
      run(y0, E(y0)[0] + 3, E(y0)[1] - 2, (x) => (x & 1 ? c2[4] : c2[3]));
      const zx = E(y0)[1];
      for (let y = y0 + 2; y <= yb - 2; y++) for (let x = zx - 4; x <= zx; x++) S(x, y, x === zx - 4 ? c2[2] : x === zx ? c2[1] : (y === y0 + 2 && (x & 1)) ? c2[4] : c2[3]);
      line([[zx - 5, y0 + 1], [zx - 6, y0 + 2], [zx - 5, y0 + 3]], c2[3]);
      run(yb - 2, 0, 99, c2[2]);
      for (const [x, y] of [[13, 38], [14, 38], [13, 39], [14, 39], [15, 39], [16, 39], [13, 40], [14, 40], [12, 41], [13, 41]] as [number, number][]) S(x, y + yb - 42, x <= 13 ? c2[4] : c2[3]);
      S(15, yb - 2, c2[2]); S(16, yb - 2, c2[2]); S(16, yb - 3, c2[1]);
    }
  }
  if (l.neck) neckArt(b, l.neck, dx, dy);
  if (l.belt) beltArt(b, l.belt, dx, dy);
}

// ── 手臂 ─────────────────────────────────────────────────
/** 手臂朝下（軸心 = 肩）；袖子依上衣：短袖 / 長袖 + 袖口 / 泡泡袖 / 巫女大袖 / 防具（套裝細節 + 稀有度滾邊） */
export function avatarArm(l: DollLook, back: boolean, f = 0): Bmp {
  const w = wearOf(l, l.body), sk0 = skinRamp(l.app.skin);
  const dk = (r: RGB[]): RGB[] => (back ? darker(r) : r);
  const sk = dk(sk0);
  const arm = new Bmp(ARM_W, ARM_H);
  // 男生手臂粗一格；袖子三階（後緣亮、前緣暗）、肩頭圓
  const col = (y0: number, y1: number, r: RGB[], x0 = l.app.body === 1 ? 11 : 12, x1 = 14): void => {
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) arm.set(x, y, x === x0 ? r[4] : x === x1 ? r[2] : y === y0 && y0 <= 1 ? r[4] : r[3]);
  };
  const big = l.app.body === 1;
  // 手：圓拳頭（左上亮、右下暗）+ 前面一格拇指
  const hand = (): void => {
    const x0 = big ? 11 : 12, w = big ? 4 : 3;
    arm.rect(x0, 8, w, 3, sk[3]); arm.set(x0, 8, sk[4]); arm.set(x0 + 1, 8, sk[4]);
    arm.set(x0 + w - 1, 9, sk[2]); arm.set(x0 + w - 1, 10, sk[1]); arm.set(x0 + 1, 10, sk[2]); arm.set(x0 + 2, 10, sk[2]); arm.clear(x0, 10);
    arm.set(x0 + w, 8, sk[3]); arm.set(x0 + w, 9, sk[2]);
  };
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
  arm.selOutline();
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
  /** 不畫頭（倒地：身體轉 90°、頭另外正著畫） */
  noHead?: boolean;
}

function sideFrame(l: DollLook, p: SidePose, f: number, trace?: string[]): AvatarFrame {
  const top = wearOf(l, l.body), low = wearOf(l, l.legs), male = l.app.body === 1;
  const st0 = legStyle(l, low);
  // 男生腿粗一點、兩腿分開一點
  const st: LegStyle = male ? { ...st0, parts: st0.parts.map(([t, r, h]) => [t, r, h + 0.25] as [number, RGB[], number]) } : st0;
  // 男生：髖高一格、腿長 5（比女生高 2 格）、兩腿分得開；女生腿細、併得比較攏
  const hipY = male ? HIP_Y - 1 : HIP_Y, legLen = male ? 5 : THIGH, up = male ? -1 : 0;
  const far = legBmp(p.far, CX - (male ? 2.5 : 1.5), hipY, st, true, legLen, male), near = legBmp(p.near, CX + (male ? 2 : 1), hipY, st, false, legLen, male);
  const dy = p.snap ? Math.round(ANKLE - Math.max(far.ankleY, near.ankleY)) : 0;
  const body = new Bmp(AV_FW, AV_FH), head = new Bmp(AV_FW, AV_FH), hairBack = new Bmp(AV_FW, AV_FH);
  const headTrace: string[] = [];
  if (!p.noHead) drawHead(hairBack, head, HEAD_X + p.headDx + p.bodyDx, HEAD_Y + dy + p.bodyDy + p.headDy + (male ? -2 : 0), {
    app: l.app, expr: p.expr, motion: p.hair, gear: l.head, view: 'side', sweat: p.sweat, f, trace: headTrace,
  });
  // 背飾（身體後面）
  if (l.back) { backArt(body, l.back, 'side', p.flap * 0.5 + (p.flare ? 0.6 : 0), p.flare ? (p.hair.lift > 0.7 ? 1 : 0.4) : 0, p.bodyDx, dy + p.bodyDy, f); trace?.push('back'); }
  body.blit(hairBack, 0, 0); trace?.push('backHair');
  // 脖子
  const neck = new Bmp(AV_FW, AV_FH), sk = skinRamp(l.app.skin);
  neck.rect((male ? 20 : 21) + p.bodyDx, 29 + dy + p.bodyDy + up, male ? 4 : 3, 2, sk[2]);
  body.blit(neck, 0, 0); trace?.push('body');
  body.blit(far.b, p.bodyDx, dy);
  body.blit(near.b, p.bodyDx, dy);
  if (st.greave) upgrades(body, low.kind === 'armor' ? low.p : null, [[Math.round(near.knee[0]) + p.bodyDx, Math.round(near.knee[1]) + dy - 1], [Math.round(near.knee[0]) + p.bodyDx + 1, Math.round(near.knee[1]) + dy - 1]], null, f, ARMOR_RAMP[st.greave]);
  trace?.push('legs');
  const chest = new Bmp(AV_FW, AV_FH), bp: BodyPose = { dx: p.bodyDx, dy: dy + p.bodyDy + up, flare: p.flare, flap: p.flap, f };
  const lowerMiko = low.kind === 'outfit' && low.o === 'miko';
  lowerSide(chest, low, bp);
  topSide(chest, l, top, lowerMiko, bp);
  chest.selOutline();
  body.blit(chest, 0, 0); trace?.push('chest');
  trace?.push(...headTrace);
  return { body, head, meta: { dx: p.bodyDx, dy: dy + p.bodyDy, arms: true } };
}

const still = (expr: Expr = 'normal'): SidePose => ({
  near: { thigh: 4, shin: 2 }, far: { thigh: -4, shin: -3 }, snap: true, expr, hair: { swing: 0, lift: 0 },
  bodyDx: 0, bodyDy: 0, headDx: 0, headDy: 0, flare: 0, flap: 0,
});

/** 把點陣逆時針轉 90°（倒地用；精確轉置，不失真） */
function rot90ccw(src: Bmp): Bmp {
  const o = new Bmp(src.h, src.w);
  for (let y = 0; y < src.h; y++) for (let x = 0; x < src.w; x++) {
    const v = src.raw(x, y);
    if (v >>> 24) o.setRaw(y, src.w - 1 - x, v);
  }
  return o;
}

/**
 * 倒地（KO）：仰躺、一邊膝蓋立起來、一隻手擱在肚子上、頭髮散在地上、× × 眼，頭上轉著兩顆小星星。
 * 先畫成「站姿但姿勢是躺著的樣子」（膝蓋往前抬 = 躺下後朝上、
 * 頭髮往後甩 = 躺下後鋪在地上），再精確轉 90°（像素不變形），最後貼地。
 */
function deadFrame(l: DollLook): AvatarFrame {
  // 身體（不含頭）擺成「躺著」的姿勢：一邊膝蓋立起來、一隻手擱在肚子上；轉 90° 後背貼地
  const p = still('dead');
  p.snap = false; p.noHead = true;
  p.near = { thigh: 75, shin: -55 }; p.far = { thigh: 50, shin: -45 }; p.flap = -1;
  const fr = sideFrame(l, p, 0);
  const meta: FrameMeta = { dx: 0, dy: 0, arms: false };
  const arms = armsTo(l, meta, [28, 37], [17, 41]);
  const stand = new Bmp(AV_FW, AV_FH);
  stand.blit(arms.back, -ARMS_PAD, -ARMS_PAD);
  stand.blit(fr.body, 0, 0);
  stand.blit(arms.front, -ARMS_PAD, -ARMS_PAD);
  stand.blit(arms.hands, -ARMS_PAD, -ARMS_PAD);
  const r = rot90ccw(stand), bb = bbox(r);
  const out = new Bmp(AV_FW, AV_FH);
  // 貼地；鏡像之後脖子那一端接在頭的左邊（頭佔右邊 18 格）
  out.blit(r, 19 - bb.x0, AV_FH - 1 - bb.y1);
  const flip = new Bmp(AV_FW, AV_FH);
  flip.blit(out, 0, 0, true);
  // 頭：正著畫在身體的右端（臉朝我們、× × 眼），下巴貼地——躺著也認得出是誰
  const hb = new Bmp(AV_FW, AV_FH), hf = new Bmp(AV_FW, AV_FH);
  const hx = AV_FW - 21, hy = AV_FH - 1 - 18 - (l.app.body === 1 ? 1 : 0);
  drawHead(hb, hf, hx, hy, { app: l.app, expr: 'dead', motion: { swing: 0.5, lift: -0.4 }, gear: l.head, view: 'side' });
  flip.blit(hb, 0, 0);
  flip.blit(hf, 0, 0);
  // 頭上的暈眩小星星
  const star = (cx: number, cy: number): void => {
    const st = new Bmp(AV_FW, AV_FH), y = GOLD, w = hex('#fff4c0');
    st.set(cx, cy - 1, y); st.set(cx - 1, cy, y); st.set(cx, cy, w); st.set(cx + 1, cy, y); st.set(cx, cy + 1, y);
    st.selOutline();
    flip.blit(st, 0, 0);
  };
  star(hx + 4, hy - 4); star(hx + 13, hy - 2);
  return { body: flip, head: new Bmp(AV_FW, AV_FH), meta };
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
    b.selOutline();
    return b;
  };
  stand.blit(armLayer(back, shoulderOf(l.app.body, true), true), 0, 0);
  stand.blit(fr.body, 0, 0);
  // 前手：伸過頭頂時在頭後面、划回胸前時在頭前面（不會整條蓋住臉）
  const fa = armLayer(front, shoulderOf(l.app.body, false), false);
  if (front > 150) { stand.blit(fa, 0, 0); stand.blit(fr.head, 0, 0); } else { stand.blit(fr.head, 0, 0); stand.blit(fa, 0, 0); }
  const r = rotate(rotPrep(stand), CX, 33, (SWIM_TILT * Math.PI) / 180, 72), bb = bbox(r);
  const out = new Bmp(AV_FW, AV_FH);
  const w = bb.x1 - bb.x0 + 1, h = bb.y1 - bb.y0 + 1;
  // 水平置中、垂直中心在碰撞框中段（影格第 ~34 列），微微上下浮
  out.blit(r, Math.round((AV_FW - w) / 2) - bb.x0, Math.round(34 - h / 2) - bb.y0 + Math.round(Math.sin(ph) * 0.8));
  return { body: out, head: new Bmp(AV_FW, AV_FH), meta: { dx: 0, dy: 0, arms: false } };
}

/**
 * 手伸到指定位置（影格座標，面向右）：肩膀 → 手。前手 / 後手分開兩張（後手在身體後、前手在身體和頭之間），手掌另一張（最上層）。
 * 往上可以拉長手臂搆到（攀高台、爬繩往上伸）；往下最多伸直一隻手臂的長度（撐起來）；短了就把手肘往後彎。
 * 回傳的點陣比影格大一圈（ARMS_PAD），畫的時候往左上偏移 ARMS_PAD。
 */
export const ARMS_PAD = 24;
export interface ArmLayers { back: Bmp; front: Bmp; hands: Bmp; }
export function armsTo(l: DollLook, meta: FrameMeta, front: [number, number], back: [number, number], grip: 'ledge' | 'rope' = 'ledge'): ArmLayers {
  const W = AV_FW + ARMS_PAD * 2, H = AV_FH + ARMS_PAD * 2, o = ARMS_PAD;
  const out: ArmLayers = { back: new Bmp(W, H), front: new Bmp(W, H), hands: new Bmp(W, H) };
  const sleeve = armSleeve(l), sk = skinRamp(l.app.skin);
  const one = (s: { x: number; y: number }, tx: number, ty: number, dark: boolean): void => {
    const sx = s.x + meta.dx + o, sy = s.y + meta.dy + o;
    let ex = tx + o, ey = ty + o;
    const U = 5.5, F = 5.5;
    const d0 = Math.hypot(ex - sx, ey - sy);
    if (grip !== 'rope' && ey > sy - 2 && d0 > U + F + 1) { const k = (U + F + 1) / d0; ex = Math.round(sx + (ex - sx) * k); ey = Math.round(sy + (ey - sy) * k); }
    const d = Math.hypot(ex - sx, ey - sy);
    const sl = dark ? darker(sleeve) : sleeve, kk = dark ? darker(sk) : sk;
    const layer = new Bmp(W, H);
    if (grip === 'rope') {
      // 握繩：手在頭頂上 → 整隻手臂伸直往上（袖子在下半、前臂在上半）；手在胸口 → 手肘往前下彎
      if (ey < sy - 6) {
        const mx = sx + (ex - sx) * 0.45, my = sy + (ey - sy) * 0.45;
        seg(layer, sx, sy, mx, my, 1.5, sl);
        seg(layer, mx, my, ex, ey, 1.4, kk);
      } else {
        const kx = Math.min(ex - 2, sx + 5), ky = Math.max(sy + 3, ey + 2);
        seg(layer, sx, sy, kx, ky, 1.5, sl);
        seg(layer, kx, ky, ex, ey, 1.4, kk);
      }
    } else if (d >= U + F - 0.5) {
      const mx = sx + (ex - sx) * 0.55, my = sy + (ey - sy) * 0.55;
      seg(layer, sx, sy, mx, my, 1.4, sl);
      seg(layer, mx, my, ex, ey, 1.3, kk);
    } else {
      // 兩段 IK：手肘往後（−x）、往下垂
      const ang0 = Math.atan2(ey - sy, ex - sx), c = Math.acos(Math.max(-1, Math.min(1, (U * U + d * d - F * F) / (2 * U * Math.max(0.5, d)))));
      const ang = ang0 + (Math.cos(ang0) >= 0 ? c : -c);
      const kx = sx + Math.cos(ang) * U, ky = sy + Math.sin(ang) * U;
      seg(layer, sx, sy, kx, ky, 1.4, sl);
      seg(layer, kx, ky, ex, ey, 1.3, kk);
    }
    layer.selOutline();
    (dark ? out.back : out.front).blit(layer, 0, 0);
    const hand = new Bmp(W, H);
    if (grip === 'rope') {
      // 握繩：拳頭包住繩子（左右各一格露在繩子兩邊）
      hand.rect(ex - 1, ey - 1, 3, 3, kk[3]); hand.set(ex - 1, ey - 1, kk[4]); hand.set(ex + 1, ey + 1, kk[2]); hand.set(ex, ey + 1, kk[2]);
    } else {
      hand.rect(ex - 1, ey - 1, 3, 2, kk[3]); hand.set(ex - 1, ey - 1, kk[4]); hand.set(ex + 1, ey, kk[2]); hand.set(ex - 2, ey, kk[2]); hand.set(ex, ey + 1, kk[2]);
    }
    hand.selOutline();
    // 爬繩時後手的拳頭跟著後手（畫在身體後面，拳頭永遠接著手臂）
    (grip === 'rope' && dark ? out.back : out.hands).blit(hand, 0, 0);
  };
  one(shoulderOf(l.app.body, true), back[0], back[1], true);
  one(shoulderOf(l.app.body, false), front[0], front[1], false);
  return out;
}
/** 攀上邊緣的手臂：兩手都抓在牆角（前後差 2 格）；arms = 手臂（畫在頭後面）、hands = 手掌（畫在頭上面） */
export function mantleArms(l: DollLook, meta: FrameMeta, hx: number, hy: number): { arms: Bmp; hands: Bmp } {
  const r = armsTo(l, meta, [hx, hy], [hx - 2, hy]);
  r.back.blit(r.front, 0, 0);
  return { arms: r.back, hands: r.hands };
}

// ── 爬繩（側面，面向繩子；繩子在影格 x = ROPE_X）──────────────
const lerp = (a: number, b: number, t: number): number => a + (b - a) * Math.max(0, Math.min(1, t));
const easeOut = (t: number): number => 1 - (1 - t) * (1 - t);
const easeIO = (t: number): number => { const u = Math.max(0, Math.min(1, t)); return u * u * (3 - 2 * u); };
/**
 * 往上爬（8 格、兩個半輪）：
 *   拉（每半輪前半）：兩手抓著，上面那隻從頭頂上方拉到臉旁、下面那隻拉到胸口 → 身體被拉上來 4 px，膝蓋縮起來；
 *   伸（後半）：胸口那隻手放開、一口氣伸過頭頂抓住更高的地方，腿蹬直把身體撐住、身體慢慢沉回去。
 * 手的移動距離（頭頂 8 → 胸口 36）= 半輪往上爬的距離，抓著的手跟著繩子不打滑（CLIMB_STRIDE = 兩倍）。
 */
const HAND_HI = 8, HAND_MID = 21, HAND_LO = 36;
function climbPose(f: number): { front: number; back: number; dy: number; knee: number; lead: 'near' | 'far'; pulling: boolean } {
  const ph = (((f % CLIMB_FRAMES) + CLIMB_FRAMES) % CLIMB_FRAMES) / CLIMB_FRAMES, half = Math.floor(ph * 2) % 2, s = (ph * 2) % 1;
  let high: number, low: number, dy: number, knee: number;
  if (s < 0.5) {
    const t = easeIO(s / 0.5);
    high = lerp(HAND_HI, HAND_MID, t); low = lerp(HAND_MID + 2, HAND_LO, t); dy = lerp(2, -2, t); knee = t;
  } else {
    const t = (s - 0.5) / 0.5;
    high = lerp(HAND_MID, HAND_MID + 2, t); low = lerp(HAND_LO, HAND_HI, easeOut(t)); dy = lerp(-2, 2, easeIO(t)); knee = 1 - easeIO(t);
  }
  // 半輪 0：前手是剛抓高的那隻；半輪 1 換手
  return half === 0 ? { front: high, back: low, dy, knee, lead: 'near', pulling: s < 0.5 } : { front: low, back: high, dy, knee, lead: 'far', pulling: s < 0.5 };
}
/** 往下爬：手抓在手下面（上面那隻手放開、移到另一隻手下面）、身體慢慢放下；腿夾著繩子 */
function climbDownPose(f: number): { front: number; back: number; dy: number } {
  const ph = (((f % CLIMBDOWN_FRAMES) + CLIMBDOWN_FRAMES) % CLIMBDOWN_FRAMES) / CLIMBDOWN_FRAMES, half = Math.floor(ph * 2) % 2, s = (ph * 2) % 1, R = 0.6;
  const topY = s < R ? lerp(21, 17, s / R) : lerp(17, 29, easeIO((s - R) / (1 - R)));
  const botY = s < R ? lerp(28, 23, s / R) : lerp(23, 21, (s - R) / (1 - R));
  const dy = s < R ? lerp(0, 1, s / R) : lerp(1, 0, easeIO((s - R) / (1 - R)));
  return { front: half === 0 ? topY : botY, back: half === 0 ? botY : topY, dy };
}
const HANG_SWAY = [0, 1, 0, -1];
/** 掛著：兩種握法（和往上爬第 0 / 第 4 格一樣：前手在頭頂上 / 後手在頭頂上），停下來時接得上不跳格 */
export const HANG_VARIANTS = 2;

/** 爬繩 / 往下爬 / 掛著的一格：側面面向繩子，臉往上看；頭髮 / 衣服比身體慢一格（用上一格的位移算） */
function ropeFrame(l: DollLook, kind: 'climb' | 'climbdown' | 'hang', f: number): AvatarFrame {
  const p = still('up');
  p.snap = false;
  let hands: { front: number; back: number }, dy: number, dyPrev: number, dx = 1, dxPrev = 1;
  if (kind === 'climb') {
    const c = climbPose(f), c0 = climbPose(f - 1);
    hands = c; dy = c.dy; dyPrev = c0.dy;
    // 腿和手相反：手拉的時候膝蓋縮起來（腳勾住繩子），手伸的時候腿蹬直；帶頭的那條腿動作大、另一條慢半拍
    const tuck = (k: number): LegPose => ({ thigh: 18 + 62 * k, shin: 26 + 30 * k });
    const leadK = c.knee, followK = Math.max(0, c.knee - 0.25) / 0.75;
    p.near = tuck(c.lead === 'near' ? leadK : followK);
    p.far = tuck(c.lead === 'far' ? leadK : followK);
    p.far = { thigh: p.far.thigh - 6, shin: p.far.shin - 6 };
    if (c.pulling) p.expr = 'effort';
  } else if (kind === 'climbdown') {
    const c = climbDownPose(f), c0 = climbDownPose(f - 1);
    hands = c; dy = c.dy; dyPrev = c0.dy;
    const w = Math.sin((f / CLIMBDOWN_FRAMES) * Math.PI * 4);
    p.near = { thigh: 62 + w * 4, shin: 30 }; p.far = { thigh: 48 - w * 4, shin: 24 };
    p.expr = 'normal';
  } else {
    const i = ((f % HANG_FRAMES) + HANG_FRAMES) % HANG_FRAMES, variant = Math.floor(f / HANG_FRAMES) % HANG_VARIANTS;
    dx = 1 + HANG_SWAY[i]; dxPrev = 1 + HANG_SWAY[(i + HANG_FRAMES - 1) % HANG_FRAMES];
    // 和往上爬那一格的握法一樣（一手在頭頂上、一手在臉旁），身體掛低一點
    hands = variant === 0 ? { front: HAND_HI, back: HAND_MID + 2 } : { front: HAND_MID + 2, back: HAND_HI }; dy = 2; dyPrev = 2;
    p.near = { thigh: 40 + HANG_SWAY[i] * 5, shin: 30 }; p.far = { thigh: 24 - HANG_SWAY[i] * 4, shin: 10 };
    p.expr = i === 2 ? 'blink' : 'up';
  }
  const ddy = Math.round(dy) - Math.round(dyPrev);
  p.bodyDx = dx; p.bodyDy = Math.round(dy); p.headDy = kind === 'climb' ? -1 : 0;
  // 頭髮 / 裙襬跟著上一格的動作（身體往上 → 頭髮慢一步往下垂；往下 → 往上飄），左右晃 → 往反方向甩
  p.hair = { swing: 0.25 - (dx - dxPrev) * 0.45, lift: Math.max(-0.6, Math.min(0.6, ddy * 0.35 + (kind === 'climbdown' ? 0.25 : 0))) };
  p.flap = ddy * 0.6 - (dx - dxPrev) * 0.5;
  const fr = sideFrame(l, p, f);
  const meta: FrameMeta = { dx, dy: Math.round(dy), arms: false, ox: CX - ROPE_X };
  const arms = armsTo(l, meta, [ROPE_X, Math.round(hands.front)], [ROPE_X - 1, Math.round(hands.back)], 'rope');
  const out = new Bmp(AV_FW, AV_FH), P = -ARMS_PAD;
  // 後手（連拳頭）在身體後面；前手在身體前、頭後面（伸過頭頂時從頭後面出來，不會疊在臉上）；前手拳頭在最上面
  out.blit(arms.back, P, P);
  out.blit(fr.body, 0, 0);
  out.blit(arms.front, P, P);
  out.blit(fr.head, 0, 0);
  out.blit(arms.hands, P, P);
  return { body: out, head: new Bmp(AV_FW, AV_FH), meta };
}

/** 依動畫與影格畫出一格（trace：記錄側面影格的圖層合成順序，測試用） */
export function avatarFrame(l: DollLook, anim: SheetAnim, f: number, trace?: string[]): AvatarFrame {
  switch (anim) {
    case 'idle': case 'blink': {
      const p = still(anim === 'blink' ? 'blink' : 'normal');
      // 呼吸：吸氣（0→1）肩膀不動、吐氣（2→3）身體沉一格；頭慢一拍才跟著沉、頭髮晚一拍晃
      p.bodyDy = f === 2 || f === 3 ? 1 : 0;
      p.headDy = f === 2 ? -1 : 0;
      p.hair = { swing: [0, 0.12, 0.3, 0.18][f] ?? 0, lift: [0, 0, 0.12, 0][f] ?? 0 };
      if (l.app.body === 1) { p.near = { thigh: 8, shin: 1 }; p.far = { thigh: -9, shin: -2 }; }
      else { p.near = { thigh: 1, shin: -3 }; p.far = { thigh: -2, shin: 2 }; }
      return sideFrame(l, p, f, trace);
    }
    case 'walk': {
      const ph = (f / WALK_FRAMES) * Math.PI * 2;
      const amp = l.app.body === 1 ? 38 : 28;
      const th = (q: number): LegPose => ({ thigh: amp * Math.sin(q), shin: amp * Math.sin(q) - (6 + 50 * Math.max(0, Math.cos(q))) });
      const p = still();
      p.near = th(ph); p.far = th(ph + Math.PI);
      p.hair = { swing: 0.55 + 0.35 * Math.cos(ph * 2), lift: 0.15 * Math.abs(Math.cos(ph)) };
      p.flap = 1 + Math.sin(ph * 2) * 0.8;
      p.headDx = 1;
      // 踏地那一下身體沉一格（彈跳感），頭慢一格才跟上
      const down = Math.abs(Math.sin(ph)) > 0.6 ? 1 : 0, downPrev = Math.abs(Math.sin(ph - Math.PI / 4)) > 0.6 ? 1 : 0;
      p.bodyDy = down; p.headDy = downPrev - down;
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
    case 'climb': case 'climbdown': case 'hang': return ropeFrame(l, anim, f);
    case 'mantle': {
      // 0 懸掛拉起（腿垂著）→ 1 撐起手肘（腿蹬）→ 2 膝蓋上台 → 3 蹲著站起；手臂由 mantleArms 畫在頭的上面
      const p = still('effort');
      p.snap = f === 3; p.sweat = f < 3;
      // 預備：懸掛時身體往下沉、膝蓋收起來蓄力（下一格才蹬）
      if (f === 0) { p.near = { thigh: 38, shin: -34 }; p.far = { thigh: 22, shin: -40 }; p.headDy = -1; p.bodyDy = 1; p.hair = { swing: 0.3, lift: 0.15 }; }
      else if (f === 1) { p.near = { thigh: 28, shin: -26 }; p.far = { thigh: -14, shin: -36 }; p.bodyDx = 1; p.headDx = 1; p.hair = { swing: 0.45, lift: 0.1 }; }
      else if (f === 2) { p.near = { thigh: 92, shin: -28 }; p.far = { thigh: -20, shin: -24 }; p.bodyDx = 2; p.headDx = 1; p.bodyDy = -1; p.hair = { swing: 0.4, lift: 0.1 }; }
      // 收尾：站起來時身體往前帶、頭髮慢一步往前甩下來
      else { p.near = { thigh: 55, shin: -45 }; p.far = { thigh: 35, shin: -55 }; p.bodyDx = 1; p.headDx = 2; p.bodyDy = 1; p.hair = { swing: -0.35, lift: -0.3 }; p.flap = -0.8; p.expr = 'normal'; }
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

/** 暗處的輪廓光：上緣與背側最外圈的像素換成冷灰，在洞穴裡剪影還認得出來 */
export const RIM = hex('#423f54');
export function rimOf(flat: Bmp): Bmp {
  const W = flat.w, H = flat.h, m = new Uint8Array(W * H);
  // 只描受光那一側（上緣 + 背側）：像自己身上的微光照出來的一道細邊，不是整圈貼紙描邊
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (flat.on(x, y) && (!flat.on(x, y - 1) || !flat.on(x - 1, y))) m[y * W + x] = 1;
  // 連續：孤立的點（八鄰沒有別的邊）丟掉，細腿上不會變成一段一段的虛線
  const r = new Bmp(W, H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (!m[y * W + x]) continue;
    let n = 0;
    for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) if ((i || j) && x + i >= 0 && y + j >= 0 && x + i < W && y + j < H && m[(y + j) * W + x + i]) n++;
    if (n >= 1) r.set(x, y, RIM);
  }
  return r;
}
/** 整張影格表：SHEET.total 格橫排、三列（第 0 列 = body、第 1 列 = head、第 2 列 = 暗處輪廓光） */
export function avatarSheet(l: DollLook): { b: Bmp; meta: FrameMeta[] } {
  const b = new Bmp(AV_FW * SHEET.total, AV_FH * 3);
  const meta: FrameMeta[] = [];
  for (const k of SHEET_ANIMS) {
    const [s, n] = SHEET[k];
    for (let f = 0; f < n; f++) {
      const r = avatarFrame(l, k, f);
      b.blit(r.body, (s + f) * AV_FW, 0);
      b.blit(r.head, (s + f) * AV_FW, AV_FH);
      b.blit(rimOf(flatFrame(r)), (s + f) * AV_FW, AV_FH * 2);
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
  if (slot === 'body') { topSide(b, { ...l, neck: null, belt: null }, wearOf(l, l.body), false, pose); b.selOutline(); }
  else if (slot === 'legs') {
    const w = wearOf(l, l.legs), st = legStyle({ ...l, feet: null }, w);
    const skinless: LegStyle = { ...st, parts: st.parts.map(([t, r, h]) => [t, r === skinRamp(l.app.skin) ? CLOTH_RAMPS[0] : r, h]) };
    b.blit(legBmp({ thigh: -6, shin: -4 }, CX - 2, HIP_Y, skinless, true).b, 0, 0);
    b.blit(legBmp({ thigh: 6, shin: 3 }, CX + 1, HIP_Y, skinless, false).b, 0, 0);
    const low = new Bmp(AV_FW, AV_FH);
    lowerSide(low, w, pose);
    if (w.kind === 'outfit' && w.o === 'coat') { topSide(low, l, w, false, pose); }
    low.selOutline();
    b.blit(low, 0, 0);
  } else if (slot === 'back' && l.back) backArt(b, l.back, 'side', 0.4, 0, 0, 0, 0);
  else if (slot === 'head' && l.head) {
    const h = new Bmp(AV_FW, AV_FH);
    if (armorSet(l.head)) { helmetHeadOnly(h, l.head); h.selOutline(); }
    else hatHeadOnly(h, lookId(l.head, 'hat:') ?? 'beret');
    b.blit(h, 0, 0);
  }
  return b;
}
