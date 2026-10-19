// avatarArt.ts — 玩家角色的 Q 版紙娃娃（純 Bmp，無 DOM；toCanvas 在 sprites.ts）：克魯賽德戰技風的 3/4 正面小人。
//   全身約 38 px（頭 24×23、約 1.6 頭身）、軀幹約 10×8、腿 3 寬的小短腿；臉 / 眼睛 / 鞋尖 / 前手都朝面向的方向（右）。
//   樣子由 engine/doll.ts 的 DollLook 決定：頭 / 身 / 腿 / 背各部位是「基本服裝（客製化）」、時裝或防具，
//   外加看得見的飾品（飾品鞋、胸前墜飾、腰間小物）。每格依圖層順序合成（engine/doll.ts DOLL_LAYERS）：
//     第一張（body）：背飾 → 後髮 → 身體 → 腿 → 胸（上衣 / 胸甲 / 墜飾 / 腰間）
//     （渲染器在中間畫：手臂 + 手持工具 / 武器）
//     第二張（head）：臉 → 前髮 → 頭飾（頭盔 / 帽子）→ 前飾品（髮飾 / 眼鏡）
//   爬繩 / 掛著 / 游泳 / 倒地的影格手臂直接畫在第一張，第二張是空的。
//   影格 44×54、腳底在最下一列、身體中心 x = 22；一律面向右（繪製時鏡像）。光從左上；外緣是柔和的同色系描邊（不用近黑）。
import { Bmp, hex, rotPrep, rotate, type RGB } from './pixel';
import { OUTFITS, type Appearance } from '../engine/appearance';
import type { DollLook, DollPiece } from '../engine/doll';
import type { ArmorSetId } from '../engine/items';
import { drawHead, type Expr, type HairMotion } from './avatarHead';
import { CLOTH_RAMPS, DARK, GOLD, LEATHER, WHITE, clothRamp, darker, skinRamp } from './avatarPalette';
import {
  armor5, armorSet, backArt, beltArt, bootExtra, bootRamp, capeShoulders, chestDetail, chestSpots, greaveKnee, lookId, neckArt, upgrades,
  helmetOnly as helmetHeadOnly, hatOnly as hatHeadOnly,
} from './avatarGear';
import { ARMOR_RAMP, R as CR } from './combatArt';
import { WALK_FRAMES, IDLE_FRAMES } from './anim';
import { CLIMB_FRAMES, CLIMBDOWN_FRAMES, HANG_FRAMES, MANTLE_FRAMES, SWIM_FRAMES } from './playerAnim';

export const AV_FW = 52;
export const AV_FH = 54;
const CX = 26;
/** 站立時腳踝的列（鞋子 3 列：腳踝..腳踝 + 2 = 最下一列） */
const ANKLE = AV_FH - 3;
/** 頭的區域原點：女 / 男（男生高 2 格） */
const HEAD_X = 14;
/** 男女同高（頭頂 + 呆毛 / 帽子都收在碰撞盒 42 px 裡）；男生靠肩寬 / 粗眉 / 方眼分辨 */
const HEAD_Y = [16, 16];
/** 體型的骨架：髖的列、大腿 / 小腿長、兩腳髖的 x、腿的半寬 */
const BODY = [
  { hip: 46, len: 2.5, legX: [CX - 2.5, CX + 2.5], legHalf: 1.5, top: 38 },
  { hip: 46, len: 2.5, legX: [CX - 3, CX + 3], legHalf: 1.9, top: 38 },
];
/** 肩膀軸心（影格座標，未加每格位移）：女（預設）/ 男 */
export const AV_SHOULDER_FRONT = { x: 32, y: 39 };
export const AV_SHOULDER_BACK = { x: 22, y: 39 };
const SHOULDERS = [
  { front: AV_SHOULDER_FRONT, back: AV_SHOULDER_BACK },
  { front: { x: 34, y: 39 }, back: { x: 20, y: 39 } },
];
export function shoulderOf(body: number, back: boolean): { x: number; y: number } {
  const s = SHOULDERS[body] ?? SHOULDERS[0];
  return back ? s.back : s.front;
}
/** 爬繩時繩子在影格裡的 x（角色在繩子左邊、面向繩子；畫的時候整格往左偏 ROPE_X − 中心） */
export const ROPE_X = 37;
/** 攀上邊緣第 2 格（膝蓋上台）手撐在身前台面上的最小 x（renderer 用） */
export const MANTLE_KNEE_X = 35;
/** 爬到繩頂（繩子到頭了）：兩手抓在胸口 / 腰的高度，不會高過繩頂 */
export const ROPE_TOP_HANDS = [41, 44] as const;
/** 手臂圖：26×34、軸心 (13,3)；手心距軸心 HAND_REACH px（Q 版的短手） */
export const ARM_W = 26, ARM_H = 34, ARM_PIV = { x: 13, y: 3 };
export const HAND_REACH = 5;

/** 影格表的排列：動畫 → [起始索引, 格數] */
export const SHEET = (() => {
  const order: [string, number][] = [
    ['idle', IDLE_FRAMES], ['blink', IDLE_FRAMES], ['walk', WALK_FRAMES], ['jump', 1], ['fall', 1],
    ['climb', CLIMB_FRAMES], ['climbdown', CLIMBDOWN_FRAMES], ['hang', HANG_FRAMES * 2], ['mantle', MANTLE_FRAMES], ['swim', SWIM_FRAMES], ['hurt', 1], ['dead', 1], ['ropetop', 2],
  ];
  const out: Record<string, [number, number]> = {};
  let i = 0;
  for (const [k, n] of order) { out[k] = [i, n]; i += n; }
  return { ...out, total: i } as Record<SheetAnim, [number, number]> & { total: number };
})();
export type SheetAnim = 'idle' | 'blink' | 'walk' | 'jump' | 'fall' | 'climb' | 'climbdown' | 'hang' | 'mantle' | 'swim' | 'hurt' | 'dead' | 'ropetop';
export const SHEET_ANIMS: readonly SheetAnim[] = ['idle', 'blink', 'walk', 'jump', 'fall', 'climb', 'climbdown', 'hang', 'mantle', 'swim', 'hurt', 'dead', 'ropetop'];
/** 影格表第 i 格是哪個動畫的第幾格 */
export function sheetCell(i: number): [SheetAnim, number] {
  for (const k of SHEET_ANIMS) { const [s, n] = SHEET[k]; if (i >= s && i < s + n) return [k, i - s]; }
  return ['idle', 0];
}
/** 每格：身體相對站立的位移（肩膀跟著動）、要不要由渲染器畫可旋轉的手臂；ox = 整格畫的時候往左右偏多少（爬繩） */
export interface FrameMeta { dx: number; dy: number; arms: boolean; ox?: number; }
export interface AvatarFrame { body: Bmp; head: Bmp; meta: FrameMeta; /** 臉那一層（head 的子集；站姿影格才有） */ face?: Bmp; }

// ── 部位 → 畫法 ──────────────────────────────────────────
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
/** 粗線段：左側受光、右側暗 */
function seg(b: Bmp, x0: number, y0: number, x1: number, y1: number, half: number, r: RGB[]): void {
  const dx = x1 - x0, dy = y1 - y0, len = Math.hypot(dx, dy) || 1;
  const ux = dx / len, uy = dy / len, nx = uy, ny = -ux;
  for (let y = Math.floor(Math.min(y0, y1) - half - 1); y <= Math.ceil(Math.max(y0, y1) + half + 1); y++) {
    for (let x = Math.floor(Math.min(x0, x1) - half - 1); x <= Math.ceil(Math.max(x0, x1) + half + 1); x++) {
      const px = x + 0.5 - x0, py = y + 0.5 - y0;
      const t = px * ux + py * uy, s = px * nx + py * ny;
      if (t < -0.5 || t > len + 0.5 || Math.abs(s) > half) continue;
      b.set(x, y, s < -half + 1 ? r[4] : s > half - 1 ? r[2] : r[3]);
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
  if (w.kind === 'armor') { const r = armor5(w.set); st = { parts: [[1, r, 0.2]], shoe: { kind: 'armor', r }, greave: w.set }; }
  else {
    const { c1, c2 } = w;
    switch (w.o) {
      case 'sailor': st = { parts: [[0.45, sk, 0], [1, DARK, 0]], shoe: { kind: 'loafer', r: LEATHER }, greave: null }; break;
      case 'miko': st = { parts: [[1, c1, 0.8]], shoe: { kind: 'zori', r: WHITE }, greave: null }; break;
      case 'hoodie': st = { parts: [[1, CLOTH_RAMPS[2], 0]], shoe: { kind: 'sneaker', r: WHITE, accent: c2[3] }, greave: null }; break;
      case 'coat': st = { parts: [[1, CLOTH_RAMPS[1], 0]], shoe: { kind: 'tall', r: LEATHER }, greave: null }; break;
      case 'maid': st = { parts: [[1, WHITE, 0]], shoe: { kind: 'mary', r: DARK }, greave: null }; break;
      default: st = { parts: [[0.45, darker(c1), 0.2], [1, sk, 0]], shoe: { kind: 'boot', r: LEATHER }, greave: null };
    }
  }
  if (l.feet) st.shoe = { kind: 'boot', r: bootRamp(l.feet), extra: l.feet };
  return st;
}

/** 一條小短腿：大腿 / 小腿依樣式分段上色，鞋子在腳踝下（鞋尖朝右）；護腿加膝甲 */
function legBmp(pose: LegPose, hipX: number, hipY: number, st: LegStyle, far: boolean, len: number, half: number): { b: Bmp; ankleY: number; knee: [number, number] } {
  const b = new Bmp(AV_FW, AV_FH);
  const rad = (d: number): number => (d * Math.PI) / 180;
  const kx = hipX + Math.sin(rad(pose.thigh)) * len, ky = hipY + Math.cos(rad(pose.thigh)) * len;
  const ax = kx + Math.sin(rad(pose.shin)) * len, ay = ky + Math.cos(rad(pose.shin)) * len;
  const at = (t: number): [number, number] => t <= 0.5 ? [hipX + (kx - hipX) * t * 2, hipY + (ky - hipY) * t * 2] : [kx + (ax - kx) * (t - 0.5) * 2, ky + (ay - ky) * (t - 0.5) * 2];
  const dk = (r: RGB[]): RGB[] => (far ? darker(r) : r);
  let t0 = 0;
  const pieces: [number, number, RGB[], number][] = [];
  for (const [t1, r, extra] of st.parts) { pieces.push([t0, t1, r, extra]); t0 = t1; }
  for (let i = pieces.length - 1; i >= 0; i--) {
    const [a0, a1, r, extra] = pieces[i];
    const cuts = [a0, ...(a0 < 0.5 && a1 > 0.5 ? [0.5] : []), a1];
    for (let k = cuts.length - 2; k >= 0; k--) { const p = at(cuts[k]), q = at(cuts[k + 1]); seg(b, p[0], p[1], q[0], q[1], half + extra, dk(r)); }
  }
  if (st.greave && !far) greaveKnee(b, st.greave, kx, ky);
  shoe(b, st, Math.round(ax), Math.round(ay), far);
  b.softOutline();
  return { b, ankleY: ay, knee: [kx, ky] };
}
/** 鞋：4 寬 × 3 列的圓頭小鞋（鞋尖往右多一格）、鞋底一道暗、鞋面左上一點亮 */
function shoe(b: Bmp, st: LegStyle, x: number, y: number, far: boolean): void {
  const s = st.shoe, r = far ? darker(s.r) : s.r;
  const x0 = x - 2;
  const body = (top: RGB, mid: RGB): void => {
    b.rect(x0, y, 4, 1, top); b.rect(x0, y + 1, 5, 1, mid); b.rect(x0, y + 2, 5, 1, r[1]);
    b.set(x0, y, r[4]); b.set(x0 + 4, y + 1, r[2]);
  };
  switch (s.kind) {
    case 'boot': case 'armor': body(r[3], r[3]); b.set(x0 + 1, y, r[4]); if (s.kind === 'armor') b.set(x0 + 2, y + 1, r[4]); break;
    case 'tall': body(r[3], r[3]); b.rect(x0, y - 1, 4, 1, r[2]); b.set(x0 + 1, y, GOLD); break;
    case 'loafer': body(r[3], r[3]); break;
    case 'mary': body(r[3], r[3]); b.set(x0 + 1, y, r[4]); b.set(x0 + 2, y, CLOTH_RAMPS[0][3]); break;
    case 'sneaker': body(r[3], r[3]); b.set(x0 + 1, y + 1, s.accent ?? r[2]); b.set(x0 + 2, y + 1, s.accent ?? r[2]); b.rect(x0, y + 2, 5, 1, r[2]); break;
    case 'zori': b.rect(x0, y + 1, 4, 1, r[3]); b.rect(x0, y + 2, 5, 1, LEATHER[3]); b.set(x0 + 1, y + 1, CLOTH_RAMPS[3][3]); break;
  }
  if (s.extra && !far) bootExtra(b, s.extra, x0, y);
}

// ── 身體（3/4 正面） ─────────────────────────────────────
type Rows = Record<number, [number, number]>;
/**
 * 軀幹（3/4 正面，面向右）：靠前（右）的肩寬一格、靠後（左）的肩窄；8 列。
 * 女：10 寬、第 4–5 列收腰；男：13 寬的直筒、肩更寬。連帽衫寬一格。
 */
function torsoRows(body: number, wide: boolean): Rows {
  const out: Rows = {};
  const top = BODY[body]?.top ?? 38, male = body === 1;
  const w = wide ? 1 : 0;
  for (let k = 0; k < 8; k++) {
    let x0 = male ? 20 : 22, x1 = male ? 32 : 31;
    if (k === 0) { x0 += 1; x1 -= 1; }
    if (k >= 1 && k <= 2) x1 += 1;
    if (!male && (k === 4 || k === 5)) { x0 += 1; x1 -= 1; }
    out[top + k] = [x0 - w, x1 + w];
  }
  return out;
}
const shiftRows = (rows: Rows, dx: number, dy: number): Rows => {
  const o: Rows = {};
  for (const k of Object.keys(rows)) { const y = Number(k); o[y + dy] = [rows[y][0] + dx, rows[y][1] + dx]; }
  return o;
};
/** 填身體：左側（受光）亮、右側暗、肩線亮、下緣暗、領口（被大頭擋住的那列）暗一階 */
function fillRows(b: Bmp, rows: Rows, r: RGB[], to = 999): void {
  const ys = Object.keys(rows).map(Number).filter((y) => y <= to);
  const top = Math.min(...ys), bot = Math.max(...ys);
  for (const y of ys) {
    const [x0, x1] = rows[y];
    for (let x = x0; x <= x1; x++) {
      let c = x === x0 ? r[4] : x === x0 + 1 ? r[3] : x === x1 ? r[1] : x === x1 - 1 ? r[2] : r[3];
      if (y === top) c = x < x1 - 2 ? r[2] : r[1];
      if (y === bot) c = x <= x0 + 1 ? r[3] : r[2];
      b.set(x, y, c);
    }
  }
}
/** 裙襬：從 y0 往下每列往外擴；褶線每 3 欄一條；flap = 往後（左）飄 */
function skirt(b: Bmp, y0: number, x0: number, x1: number, n: number, r: RGB[], pleats: boolean, flap: number, flare: number): void {
  for (let k = 0; k < n; k++) {
    const sh = Math.round(flap * k * 0.35), ex = Math.round(k * 0.7 + flare * k * 0.4);
    const a = x0 - ex - sh, z = x1 + ex - Math.round(sh * 0.4);
    for (let x = a; x <= z; x++) {
      let c = x === a ? r[4] : x >= z - 1 ? r[2] : r[3];
      if (pleats && k > 0 && (x - a) % 3 === 2) c = r[2];
      if (k === n - 1) c = pleats && (x - a) % 3 === 2 ? r[1] : r[2];
      b.set(x, y0 + k, c);
    }
  }
}

interface BodyPose { dx: number; dy: number; flare: number; flap: number; f: number; }

/** 下身的裙 / 袴 / 大衣下擺（腿之後、上衣之前） */
function lowerFront(b: Bmp, w: Wear, rows: Rows, p: BodyPose): void {
  if (w.kind !== 'outfit') return;
  const ys = Object.keys(rows).map(Number), yb = Math.max(...ys), [x0, x1] = rows[yb];
  const { c1, c2 } = w, fl = p.flare;
  if (w.o === 'sailor') skirt(b, yb - 1, x0, x1, 5, c1, true, p.flap, fl);
  if (w.o === 'maid') {
    skirt(b, yb - 1, x0, x1, 5, c1, false, p.flap, fl);
    for (let k = 0; k < 4; k++) for (let x = x0 + 3; x <= x1 - 2; x++) b.set(x - Math.round(p.flap * k * 0.3), yb - 1 + k, x === x0 + 3 || x === x1 - 2 ? c2[2] : c2[3]);
    const hy = yb + 3;
    for (let x = x0 - 4; x <= x1 + 4; x++) if (b.on(x, hy)) b.set(x, hy + 1, (x & 1) ? WHITE[2] : WHITE[3]);
  }
  if (w.o === 'miko') skirt(b, yb - 2, x0, x1, 8, c1, true, p.flap * 0.5, fl);
  if (w.o === 'coat') {
    // 大衣下擺：兩側垂到膝蓋，前面敞開
    for (let k = 0; k < 5; k++) {
      const trail = Math.round(p.flap * k * 0.5) + (fl ? k : 0);
      for (let x = x0 - 1 - trail; x <= x0 + 2; x++) b.set(x, yb + k, x === x0 - 1 - trail ? c1[4] : k === 4 ? c1[2] : c1[3]);
      for (let x = x1 - 2; x <= x1 + 1 - Math.round(trail * 0.3); x++) b.set(x, yb + k, x === x1 - 2 ? c2[3] : k === 4 ? c1[1] : c1[2]);
    }
  }
}

/** 上衣 / 胸甲（含墜飾、腰間小物）。rows 已經是畫布座標 */
function topFront(b: Bmp, l: DollLook, w: Wear, rows: Rows, lowerMiko: boolean, p: BodyPose): void {
  const S = (x: number, y: number, c: RGB): void => b.set(x, y, c);
  const ys = Object.keys(rows).map(Number), y0 = Math.min(...ys), yb = Math.max(...ys);
  const E = (y: number): [number, number] => rows[y] ?? rows[y0];
  const run = (y: number, xa: number, xb: number, c: RGB | ((x: number) => RGB)): void => {
    const [a, z] = E(y);
    for (let x = Math.max(a, xa); x <= Math.min(z, xb); x++) S(x, y, typeof c === 'function' ? c(x) : c);
  };
  const [ma, mz] = E(y0 + 1), mid = Math.round((ma + mz) / 2) + 1;
  const belt = (y: number): void => {
    const [a, z] = E(y);
    run(y, a, z, (x) => (x === a ? LEATHER[4] : x >= z - 1 ? LEATHER[2] : LEATHER[3]));
    S(mid, y, GOLD); S(mid - 1, y, hex('#fff4c0'));
  };
  const o = outfitOf(w);
  const base = w.kind === 'armor' ? armor5(w.set) : o === 'sailor' || o === 'miko' ? WHITE : o === 'explorer' ? w.c2 : w.c1;
  fillRows(b, rows, base, o === 'miko' && lowerMiko ? yb - 2 : 999);
  if (w.kind === 'armor') {
    chestDetail(b, w.set, rows);
    const sp = chestSpots(rows);
    upgrades(b, w.p, sp.spots, sp.gem, p.f, ARMOR_RAMP[w.set]);
  } else {
    const { c1, c2 } = w;
    if (o === 'explorer') {
      // 背心（主色）兩片、中間露出副色襯衫；斜背帶；腰帶 + 金扣
      for (let y = y0; y <= yb - 1; y++) { const [a, z] = E(y); run(y, a, mid - 2, (x) => (x === a ? c1[4] : x === mid - 2 ? c1[2] : c1[3])); run(y, mid + 2, z, (x) => (x === z ? c1[1] : x === mid + 2 ? c1[4] : c1[2])); }
      for (let k = 0; k < 6; k++) { S(E(y0)[0] + 1 + k, y0 + k, LEATHER[3]); S(E(y0)[0] + 2 + k, y0 + k, LEATHER[4]); }
      belt(yb - 1);
    } else if (o === 'sailor') {
      // 水手領（主色）蓋在兩肩、V 領到胸口；副色領巾打結垂下；袖口白
      run(y0, 0, 99, c1[3]);
      for (let k = 0; k < 3; k++) { const [a, z] = E(y0 + k); run(y0 + k, a, a + 2 - k, c1[k === 0 ? 4 : 3]); run(y0 + k, z - 2 + k, z, c1[2]); S(mid - 2 + k, y0 + k, c1[2]); S(mid + 2 - k, y0 + k, c1[2]); }
      S(mid, y0 + 2, c2[4]); S(mid + 1, y0 + 2, c2[3]); S(mid, y0 + 3, c2[3]); S(mid + 1, y0 + 3, c2[2]); S(mid - 1, y0 + 4, c2[2]); S(mid + 1, y0 + 4, c2[2]);
      run(yb - 1, 0, 99, WHITE[2]);
    } else if (o === 'miko') {
      // 白衣 + 紅色交叉衣襟（V 字）；腰間白帶
      for (let k = 0; k < 4; k++) { S(mid - 2 + Math.floor(k / 2), y0 + k, c1[3]); S(mid + 2 - Math.floor(k / 2), y0 + k, c1[2]); }
      S(mid, y0 + 4, c1[2]);
      if (lowerMiko) run(yb - 2, 0, 99, (x) => (x & 1 ? WHITE[3] : WHITE[2]));
    } else if (o === 'hoodie') {
      // 帽兜堆在肩後、兩條副色抽繩、袋鼠口袋、下擺羅紋
      const [a, z] = E(y0);
      for (let x = a - 2; x <= z + 2; x++) { S(x, y0 - 1, x < a ? c1[4] : x > z ? c1[1] : c1[2]); S(x, y0, x < a ? c1[3] : x > z ? c1[1] : c1[1]); }
      S(mid - 1, y0 + 1, c2[3]); S(mid - 1, y0 + 2, c2[3]); S(mid - 1, y0 + 3, c2[4]); S(mid + 2, y0 + 1, c2[2]); S(mid + 2, y0 + 2, c2[2]); S(mid + 2, y0 + 3, c2[4]);
      run(yb - 2, mid - 3, mid + 3, c1[2]); S(mid - 3, yb - 3, c1[2]); S(mid + 3, yb - 3, c1[2]);
      run(yb, 0, 99, (x) => (x & 1 ? c1[2] : c1[1]));
    } else if (o === 'coat') {
      // 大衣：前襟敞開露出白襯衫 V、副色翻領、一排金扣、腰帶
      for (let k = 0; k < 4; k++) run(y0 + k, mid - 1 + Math.floor(k / 2), mid + 1 - Math.floor(k / 2) + 1, WHITE[3]);
      for (let k = 0; k < 4; k++) { S(mid - 2 + Math.floor(k / 2), y0 + k, c2[4]); S(mid + 3 - Math.floor(k / 2), y0 + k, c2[3]); }
      for (let y = y0 + 4; y <= yb; y++) S(mid + 1, y, c2[2]);
      S(mid + 2, y0 + 5, GOLD); S(mid + 2, y0 + 7, GOLD);
      belt(yb - 1);
    } else if (o === 'maid') {
      // 黑洋裝 + 白領 + 白圍兜 + 肩帶
      run(y0, 0, 99, (x) => (x & 1 ? c2[4] : c2[3]));
      for (let y = y0 + 2; y <= yb; y++) run(y, mid - 2, mid + 2, (x) => (x === mid - 2 ? c2[2] : x === mid + 2 ? c2[1] : (y === y0 + 2 && (x & 1)) ? c2[4] : c2[3]));
      S(mid - 3, y0 + 1, c2[3]); S(mid + 3, y0 + 1, c2[2]);
    }
  }
  if (l.neck) neckArt(b, l.neck, mid - 1, y0 + 1);
  if (l.belt) beltArt(b, l.belt, E(yb - 1)[0] + 1, yb - 1);
}

// ── 手臂 ─────────────────────────────────────────────────
/** 手臂朝下（軸心 = 肩）：短短的袖子 + 圓拳頭；袖子依上衣（短袖 / 長袖 + 袖口 / 泡泡袖 / 巫女大袖 / 防具 + 護肩） */
export function avatarArm(l: DollLook, back: boolean, f = 0): Bmp {
  const w = wearOf(l, l.body), sk0 = skinRamp(l.app.skin);
  const dk = (r: RGB[]): RGB[] => (back ? darker(r) : r);
  const sk = dk(sk0);
  const arm = new Bmp(ARM_W, ARM_H);
  const big = l.app.body === 1, X0 = big ? 11 : 12, X1 = 14;
  const col = (y0: number, y1: number, r: RGB[], x0 = X0, x1 = X1): void => {
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) arm.set(x, y, x === x0 ? r[4] : x === x1 ? r[2] : r[3]);
  };
  const hand = (): void => {
    const w2 = X1 - X0 + 1;
    arm.rect(X0, 7, w2, 3, sk[3]); arm.set(X0, 7, sk[4]); arm.set(X1, 8, sk[2]); arm.set(X1, 9, sk[1]); arm.clear(X0, 9); arm.set(X0 + 1, 9, sk[2]);
    arm.set(X1 + 1, 7, sk[3]);
  };
  if (w.kind === 'armor') {
    const r = dk(armor5(w.set)), R = ARMOR_RAMP[w.set];
    col(2, 6, r); hand();
    // 護肩：比手臂寬一圈的圓殼、左上亮點、下緣暗
    for (let y = 0; y <= 4; y++) for (let x = 9; x <= 17; x++) {
      const d = Math.hypot(x + 0.5 - 13, (y + 0.5 - 2) * 1.2);
      if (d > 3.8) continue;
      arm.set(x, y, d > 3 && y >= 2 ? r[1] : d < 1.4 && x < 13 && y < 2 ? R[6] : x < 12 ? r[4] : x > 14 ? r[2] : r[3]);
    }
    if (!back) upgrades(arm, w.p, [[10, 3], [11, 4], [12, 4], [13, 4], [14, 4], [15, 3]], null, f, R);
  } else {
    const { o, c1, c2 } = w;
    if (o === 'explorer') { col(2, 4, dk(c2)); col(5, 6, sk); hand(); }
    else if (o === 'sailor') { col(2, 5, dk(WHITE)); col(6, 6, dk(c1)); hand(); }
    else if (o === 'hoodie') { col(2, 6, dk(c1)); hand(); }
    else if (o === 'coat') { col(2, 5, dk(c1)); col(6, 6, dk(c2)); hand(); }
    else if (o === 'maid') { col(2, 3, dk(c1), X0 - 1, X1 + 1); col(4, 5, sk); col(6, 6, dk(WHITE)); hand(); }
    else if (o === 'miko') {
      const wh = dk(WHITE), r = dk(c1);
      col(2, 6, wh);
      for (let y = 3; y <= 9; y++) for (let x = X1 + 1; x <= X1 + 3; x++) arm.set(x, y, y === 9 ? r[3] : x === X1 + 3 ? wh[2] : wh[3]);
      hand();
    } else { col(2, 6, dk(c1)); hand(); }
  }
  arm.softOutline();
  return arm;
}
/** 爬繩 / 游泳 / 倒地時手臂的袖子顏色 */
function armSleeve(l: DollLook): RGB[] {
  const w = wearOf(l, l.body);
  if (w.kind === 'armor') return armor5(w.set);
  return w.o === 'sailor' || w.o === 'miko' ? WHITE : w.o === 'explorer' ? w.c2 : w.c1;
}

// ── 影格 ─────────────────────────────────────────────────
interface Pose {
  near: LegPose; far: LegPose;
  /** 腳要不要貼地（依最低的腳踝把身體往下推） */
  snap: boolean;
  expr: Expr; hair: HairMotion;
  /** 身體 / 頭相對站立的位移 */
  bodyDx: number; bodyDy: number; headDx: number; headDy: number;
  flare: number; flap: number; sweat?: boolean;
  /** 不畫頭（倒地：身體轉 90°、頭另外正著畫） */
  noHead?: boolean;
  /** 臉 / 眼睛往面向的方向多偏幾格 */
  look?: number;
}

function standFrame(l: DollLook, p: Pose, f: number, trace?: string[]): AvatarFrame {
  const top = wearOf(l, l.body), low = wearOf(l, l.legs), bt = l.app.body === 1 ? 1 : 0, sk0 = BODY[bt];
  const st = legStyle(l, low);
  const far = legBmp(p.far, sk0.legX[0], sk0.hip, st, true, sk0.len, sk0.legHalf), near = legBmp(p.near, sk0.legX[1], sk0.hip, st, false, sk0.len, sk0.legHalf);
  const dy = p.snap ? Math.round(ANKLE - Math.max(far.ankleY, near.ankleY)) : 0;
  const body = new Bmp(AV_FW, AV_FH), head = new Bmp(AV_FW, AV_FH), hairBack = new Bmp(AV_FW, AV_FH), face = new Bmp(AV_FW, AV_FH);
  const headTrace: string[] = [];
  const rows = shiftRows(torsoRows(bt, outfitOf(top) === 'hoodie'), p.bodyDx, dy + p.bodyDy);
  const ty = Math.min(...Object.keys(rows).map(Number)), [ra, rz] = rows[ty + 1];
  if (!p.noHead) drawHead(hairBack, head, HEAD_X + p.headDx + p.bodyDx, HEAD_Y[bt] + dy + p.bodyDy + p.headDy, {
    app: l.app, expr: p.expr, motion: p.hair, gear: l.head, view: 'side', sweat: p.sweat, f, trace: headTrace, face, look: p.look,
  });
  body.blit(hairBack, 0, 0); trace?.push('backHair');
  // 背飾（身體後面、後髮前面：3/4 正面時從身體兩側露出來）
  if (l.back) { backArt(body, l.back, p.flap * 0.5 + (p.flare ? 0.6 : 0), p.flare ? (p.hair.lift > 0.7 ? 1 : 0.4) : 0, Math.round((ra + rz) / 2), ty, rz - ra + 1, f); trace?.push('back'); }
  trace?.push('body');
  body.blit(far.b, p.bodyDx, dy);
  body.blit(near.b, p.bodyDx, dy);
  if (st.greave) upgrades(body, low.kind === 'armor' ? low.p : null, [[Math.round(near.knee[0]) + p.bodyDx, Math.round(near.knee[1]) + dy]], null, f, ARMOR_RAMP[st.greave]);
  trace?.push('legs');
  const chest = new Bmp(AV_FW, AV_FH), bp: BodyPose = { dx: p.bodyDx, dy: dy + p.bodyDy, flare: p.flare, flap: p.flap, f };
  const lowerMiko = low.kind === 'outfit' && low.o === 'miko';
  lowerFront(chest, low, rows, bp);
  topFront(chest, l, top, rows, lowerMiko, bp);
  chest.softOutline();
  body.blit(chest, 0, 0);
  if (l.back && l.back.look === 'back:cape') capeShoulders(body, ra, rz, ty);
  trace?.push('chest');
  trace?.push(...headTrace);
  return { body, head, face, meta: { dx: p.bodyDx, dy: dy + p.bodyDy, arms: true } };
}

const still = (expr: Expr = 'normal'): Pose => ({
  near: { thigh: 2, shin: 0 }, far: { thigh: -2, shin: 0 }, snap: true, expr, hair: { swing: 0, lift: 0 },
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
 * 倒地（KO）：整個人（連頭）往後倒、仰躺在地上——站姿畫好（膝蓋立起來、一隻手擱在肚子上、× × 眼），
 * 精確轉 90°（像素不變形）再鏡像，頭在右邊、腳在左邊；頭上兩顆暈眩星星。
 */
function deadFrame(l: DollLook): AvatarFrame {
  const p = still('dead');
  p.snap = false;
  p.near = { thigh: 60, shin: -40 }; p.far = { thigh: 30, shin: -20 }; p.flap = -1; p.hair = { swing: 0.6, lift: 0.3 };
  const fr = standFrame(l, p, 0);
  const meta: FrameMeta = { dx: 0, dy: 0, arms: false };
  const arms = armsTo(l, meta, [30, 44], [19, 45]);
  const stand = new Bmp(AV_FW, AV_FH);
  stand.blit(arms.back, -ARMS_PAD, -ARMS_PAD);
  stand.blit(fr.body, 0, 0);
  stand.blit(arms.front, -ARMS_PAD, -ARMS_PAD);
  stand.blit(fr.head, 0, 0);
  stand.blit(arms.hands, -ARMS_PAD, -ARMS_PAD);
  const r = rot90ccw(stand), bb = bbox(r);
  const out = new Bmp(AV_FW, AV_FH);
  const w = bb.x1 - bb.x0 + 1;
  // 置中、貼地（最下一列 = 地面）
  out.blit(r, Math.round((AV_FW - w) / 2) - bb.x0, AV_FH - 1 - bb.y1);
  const flip = new Bmp(AV_FW, AV_FH);
  flip.blit(out, 0, 0, true);
  const fb = bbox(flip);
  const star = (cx: number, cy: number): void => {
    const st = new Bmp(AV_FW, AV_FH), y = GOLD, wh = hex('#fff4c0');
    st.set(cx, cy - 1, y); st.set(cx - 1, cy, y); st.set(cx, cy, wh); st.set(cx + 1, cy, y); st.set(cx, cy + 1, y);
    st.softOutline();
    flip.blit(st, 0, 0);
  };
  star(fb.x1 - 14, Math.max(3, fb.y0 - 3)); star(fb.x1 - 5, Math.max(3, fb.y0 - 1));
  return { body: flip, head: new Bmp(AV_FW, AV_FH), meta };
}

/** 內容外框 */
function bbox(b: Bmp): { x0: number; y0: number; x1: number; y1: number } {
  let x0 = b.w, y0 = b.h, x1 = -1, y1 = -1;
  for (let y = 0; y < b.h; y++) for (let x = 0; x < b.w; x++) if (b.on(x, y)) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
  return { x0, y0, x1, y1 };
}

/** 游泳時身體往前傾的角度（度，順時針）：腳在後下方 */
const SWIM_TILT = 62;
/**
 * 游泳：身體（不含頭，小短腿上下打水、雙手往前交替划）往前趴 SWIM_TILT 度；
 * 頭不轉、正著畫在身體前端（臉朝前進的方向，眼睛往前偏），頭髮往後飄。整個人放在碰撞框的中段。
 */
function swimFrame(l: DollLook, f: number): AvatarFrame {
  const ph = (f / SWIM_FRAMES) * Math.PI * 2;
  const p = still();
  p.snap = false; p.noHead = true;
  p.near = { thigh: 25 * Math.sin(ph), shin: 25 * Math.sin(ph) - 10 };
  p.far = { thigh: -25 * Math.sin(ph), shin: -25 * Math.sin(ph) - 10 };
  const fr = standFrame(l, p, f);
  const stand = new Bmp(AV_FW, AV_FH);
  const SWIM_REACH = HAND_REACH + 3;
  const reach = (deg: number): { x: number; y: number } => ({ x: Math.round(Math.sin((deg * Math.PI) / 180) * SWIM_REACH), y: Math.round(Math.cos((deg * Math.PI) / 180) * SWIM_REACH) });
  const front = 140 + 40 * Math.sin(ph), back = 140 - 40 * Math.sin(ph);
  const sleeve = armSleeve(l), sk = skinRamp(l.app.skin);
  const armLayer = (deg: number, s: { x: number; y: number }, dark: boolean): Bmp => {
    const b = new Bmp(AV_FW, AV_FH), h = reach(deg), sl = dark ? darker(sleeve) : sleeve, kk = dark ? darker(sk) : sk;
    seg(b, s.x, s.y, s.x + h.x * 0.55, s.y + h.y * 0.55, 1.4, sl);
    seg(b, s.x + h.x * 0.55, s.y + h.y * 0.55, s.x + h.x, s.y + h.y, 1.4, kk);
    b.softOutline();
    return b;
  };
  stand.blit(armLayer(back, shoulderOf(l.app.body, true), true), 0, 0);
  stand.blit(fr.body, 0, 0);
  stand.blit(armLayer(front, shoulderOf(l.app.body, false), false), 0, 0);
  const PIV = { x: CX, y: 40 }, rad = (SWIM_TILT * Math.PI) / 180;
  const r = rotate(rotPrep(stand), PIV.x, PIV.y, rad, 72);
  // 頭：正著畫，脖子接在轉過去的身體前端（右上）
  const hb = new Bmp(72, 72), hf = new Bmp(72, 72);
  const neck = { x: 0, y: -3 }, nx = Math.cos(rad) * neck.x - Math.sin(rad) * neck.y, ny = Math.sin(rad) * neck.x + Math.cos(rad) * neck.y;
  // 頭在身體前端（往前 8、往下 4）：臉朝前進的方向
  const hx = Math.round(36 + nx - 13 + 8), hy = Math.round(36 + ny - 20 + 4);
  drawHead(hb, hf, hx, hy, { app: l.app, expr: 'normal', motion: { swing: 0.9 + 0.2 * Math.sin(ph), lift: 0.5 }, gear: l.head, view: 'side', f, look: 2 });
  const all = new Bmp(72, 72);
  all.blit(hb, 0, 0); all.blit(r, 0, 0); all.blit(hf, 0, 0);
  const bb = bbox(all);
  const out = new Bmp(AV_FW, AV_FH);
  const w = bb.x1 - bb.x0 + 1, h = bb.y1 - bb.y0 + 1;
  const x = w > AV_FW - 2 ? AV_FW - 2 - w : Math.round((AV_FW - w) / 2);
  out.blit(all, x - bb.x0, Math.max(1 - bb.y0, Math.round(34 - h / 2) - bb.y0 + Math.round(Math.sin(ph) * 0.8)));
  return { body: out, head: new Bmp(AV_FW, AV_FH), meta: { dx: 0, dy: 0, arms: false } };
}

/**
 * 手伸到指定位置（影格座標，面向右）：肩膀 → 手。前手 / 後手分開兩張（後手在身體後、前手在身體和頭之間），手掌另一張（最上層）。
 * 往上可以拉長手臂搆到（攀高台、爬繩往上伸）；往下最多伸直一隻手臂的長度；短了就把手肘往後彎。
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
    const U = 3.5, F = 3.5;
    const d0 = Math.hypot(ex - sx, ey - sy);
    // 抓牆角時手可以伸長（往上 16、往下撐 MANTLE_REACH_DOWN 格）：Q 版短手也搆得到台面的牆角
    const reachMax = ey < sy + 2 ? 16 : MANTLE_REACH_DOWN;
    if (grip !== 'rope' && d0 > reachMax) { const k = reachMax / d0; ex = Math.round(sx + (ex - sx) * k); ey = Math.round(sy + (ey - sy) * k); }
    const d = Math.hypot(ex - sx, ey - sy);
    const sl = dark ? darker(sleeve) : sleeve, kk = dark ? darker(sk) : sk;
    const layer = new Bmp(W, H);
    if (grip === 'rope' || d >= U + F - 0.5) {
      const mx = sx + (ex - sx) * 0.5, my = sy + (ey - sy) * 0.5;
      seg(layer, sx, sy, mx, my, 1.5, sl);
      seg(layer, mx, my, ex, ey, 1.4, kk);
    } else {
      const ang0 = Math.atan2(ey - sy, ex - sx), c = Math.acos(Math.max(-1, Math.min(1, (U * U + d * d - F * F) / (2 * U * Math.max(0.5, d)))));
      const ang = ang0 + (Math.cos(ang0) >= 0 ? c : -c);
      const kx = sx + Math.cos(ang) * U, ky = sy + Math.sin(ang) * U;
      seg(layer, sx, sy, kx, ky, 1.5, sl);
      seg(layer, kx, ky, ex, ey, 1.4, kk);
    }
    layer.softOutline();
    (dark ? out.back : out.front).blit(layer, 0, 0);
    const hand = new Bmp(W, H);
    hand.rect(ex - 1, ey - 1, 3, 3, kk[3]); hand.set(ex - 1, ey - 1, kk[4]); hand.set(ex + 1, ey + 1, kk[2]); hand.set(ex, ey + 1, kk[2]);
    hand.softOutline();
    (grip === 'rope' && dark ? out.back : out.hands).blit(hand, 0, 0);
  };
  one(shoulderOf(l.app.body, true), back[0], back[1], true);
  one(shoulderOf(l.app.body, false), front[0], front[1], false);
  return out;
}
/** 攀上邊緣的手臂：兩手都抓在牆角（前後差 2 格）；arms = 手臂（畫在頭後面）、hands = 手掌（畫在頭上面） */
/** 攀上邊緣：手往前下撐時最長伸到幾格 */
export const MANTLE_REACH_DOWN = 18;
const MANTLE_LEAN_MAX = 8;
/**
 * 攀上邊緣：牆角在胸口以下、手伸到最長還搆不到（例：繩頂旁、和腳同高的台面）→ 整個人往牆那邊傾幾格（影格座標的 x，最多 8），
 * 讓手掌正好撐在牆角上；搆得到就是 0。s = 前肩（含影格 dx）
 */
export function mantleLean(hx: number, hy: number, s: { x: number; y: number }): number {
  if (hy < s.y + 2) return 0;
  const dy = hy - s.y, dx = hx - s.x, R = MANTLE_REACH_DOWN - 0.5;
  if (dx * dx + dy * dy <= R * R) return 0;
  const need = dx - Math.sqrt(Math.max(0, R * R - dy * dy));
  return Math.max(0, Math.min(MANTLE_LEAN_MAX, Math.ceil(need)));
}
export function mantleArms(l: DollLook, meta: FrameMeta, hx: number, hy: number): { arms: Bmp; hands: Bmp } {
  const r = armsTo(l, meta, [hx, hy], [hx - 2, hy]);
  r.back.blit(r.front, 0, 0);
  return { arms: r.back, hands: r.hands };
}

// ── 爬繩（面向繩子；繩子在影格 x = ROPE_X）──────────────
const lerp = (a: number, b: number, t: number): number => a + (b - a) * Math.max(0, Math.min(1, t));
const easeOut = (t: number): number => 1 - (1 - t) * (1 - t);
const easeIO = (t: number): number => { const u = Math.max(0, Math.min(1, t)); return u * u * (3 - 2 * u); };
/** 手的高度：大頭旁邊（舉高）↔ 臉頰 ↔ 胸口；Q 版手短，搆不到頭頂 */
const HAND_HI = 26, HAND_MID = 33, HAND_LO = 41;
/** 爬繩時舉高那隻手的列（renderer 判斷繩頂用） */
export const ROPE_HAND_HI = HAND_HI;
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
  return half === 0 ? { front: high, back: low, dy, knee, lead: 'near', pulling: s < 0.5 } : { front: low, back: high, dy, knee, lead: 'far', pulling: s < 0.5 };
}
function climbDownPose(f: number): { front: number; back: number; dy: number } {
  const ph = (((f % CLIMBDOWN_FRAMES) + CLIMBDOWN_FRAMES) % CLIMBDOWN_FRAMES) / CLIMBDOWN_FRAMES, half = Math.floor(ph * 2) % 2, s = (ph * 2) % 1, R = 0.6;
  const topY = s < R ? lerp(32, 29, s / R) : lerp(29, 37, easeIO((s - R) / (1 - R)));
  const botY = s < R ? lerp(38, 34, s / R) : lerp(34, 32, (s - R) / (1 - R));
  const dy = s < R ? lerp(0, 1, s / R) : lerp(1, 0, easeIO((s - R) / (1 - R)));
  return { front: half === 0 ? topY : botY, back: half === 0 ? botY : topY, dy };
}
const HANG_SWAY = [0, 1, 0, -1];
/** 掛著：兩種握法（和往上爬第 0 / 第 4 格一樣），停下來時接得上不跳格 */
export const HANG_VARIANTS = 2;

/** 爬繩 / 往下爬 / 掛著的一格：面向繩子、臉往上看；頭髮 / 衣服比身體慢一格 */
function ropeFrame(l: DollLook, kind: 'climb' | 'climbdown' | 'hang' | 'ropetop', f: number): AvatarFrame {
  const p = still('up');
  p.snap = false;
  let hands: { front: number; back: number }, dy: number, dyPrev: number, dx = 1, dxPrev = 1;
  if (kind === 'climb') {
    const c = climbPose(f), c0 = climbPose(f - 1);
    hands = c; dy = c.dy; dyPrev = c0.dy;
    const tuck = (k: number): LegPose => ({ thigh: 20 + 60 * k, shin: 10 + 30 * k });
    const leadK = c.knee, followK = Math.max(0, c.knee - 0.25) / 0.75;
    p.near = tuck(c.lead === 'near' ? leadK : followK);
    p.far = tuck(c.lead === 'far' ? leadK : followK);
    if (c.pulling) p.expr = 'effort';
  } else if (kind === 'climbdown') {
    const c = climbDownPose(f), c0 = climbDownPose(f - 1);
    hands = c; dy = c.dy; dyPrev = c0.dy;
    const w = Math.sin((f / CLIMBDOWN_FRAMES) * Math.PI * 4);
    p.near = { thigh: 50 + w * 6, shin: 20 }; p.far = { thigh: 35 - w * 6, shin: 15 };
    p.expr = 'normal';
  } else if (kind === 'ropetop') {
    // 繩子到頭了：兩手抓在胸口 / 腰（不高過繩頂），膝蓋縮起來準備往上撐
    const v = f % 2;
    hands = { front: ROPE_TOP_HANDS[v], back: ROPE_TOP_HANDS[1 - v] }; dy = 0; dyPrev = 0;
    p.near = { thigh: 45, shin: 25 }; p.far = { thigh: 30, shin: 15 };
    p.expr = 'effort';
  } else {
    const i = ((f % HANG_FRAMES) + HANG_FRAMES) % HANG_FRAMES, variant = Math.floor(f / HANG_FRAMES) % HANG_VARIANTS;
    dx = 1 + HANG_SWAY[i]; dxPrev = 1 + HANG_SWAY[(i + HANG_FRAMES - 1) % HANG_FRAMES];
    hands = variant === 0 ? { front: HAND_HI, back: HAND_MID + 2 } : { front: HAND_MID + 2, back: HAND_HI }; dy = 2; dyPrev = 2;
    p.near = { thigh: 30 + HANG_SWAY[i] * 8, shin: 15 }; p.far = { thigh: 15 - HANG_SWAY[i] * 6, shin: 5 };
    p.expr = i === 2 ? 'blink' : 'up';
  }
  const ddy = Math.round(dy) - Math.round(dyPrev);
  p.bodyDx = dx; p.bodyDy = Math.round(dy); p.headDy = kind === 'climb' ? -1 : 0; p.look = 1;
  p.hair = { swing: 0.25 - (dx - dxPrev) * 0.45, lift: Math.max(-0.6, Math.min(0.6, ddy * 0.35 + (kind === 'climbdown' ? 0.25 : 0))) };
  p.flap = ddy * 0.6 - (dx - dxPrev) * 0.5;
  const fr = standFrame(l, p, f);
  const meta: FrameMeta = { dx, dy: Math.round(dy), arms: false, ox: CX - ROPE_X };
  const arms = armsTo(l, meta, [ROPE_X, Math.round(hands.front)], [ROPE_X - 1, Math.round(hands.back)], 'rope');
  const out = new Bmp(AV_FW, AV_FH), P = -ARMS_PAD;
  out.blit(arms.back, P, P);
  out.blit(fr.body, 0, 0);
  out.blit(arms.front, P, P);
  out.blit(fr.head, 0, 0);
  out.blit(arms.hands, P, P);
  return { body: out, head: new Bmp(AV_FW, AV_FH), meta };
}

/** 依動畫與影格畫出一格（trace：記錄站姿影格的圖層合成順序，測試用） */
export function avatarFrame(l: DollLook, anim: SheetAnim, f: number, trace?: string[]): AvatarFrame {
  switch (anim) {
    case 'idle': case 'blink': {
      const p = still(anim === 'blink' ? 'blink' : 'normal');
      // 呼吸：吸氣（0→1）不動、吐氣（2→3）身體沉一格；頭慢一拍才跟著沉、頭髮晚一拍晃
      p.bodyDy = f === 2 || f === 3 ? 1 : 0;
      p.headDy = f === 2 ? -1 : 0;
      p.hair = { swing: [0, 0.12, 0.3, 0.18][f] ?? 0, lift: [0, 0, 0.12, 0][f] ?? 0 };
      return standFrame(l, p, f, trace);
    }
    case 'walk': {
      // 前後腳交錯的小碎步；踏地那一下身體沉一格、頭慢一格；身體往前傾一格、臉往前看、頭髮往後甩
      const ph = (f / WALK_FRAMES) * Math.PI * 2;
      const th = (q: number): LegPose => ({ thigh: 34 * Math.sin(q), shin: 34 * Math.sin(q) - 30 * Math.max(0, Math.cos(q)) });
      const p = still();
      p.near = th(ph); p.far = th(ph + Math.PI);
      p.hair = { swing: 0.55 + 0.35 * Math.cos(ph * 2), lift: 0.15 * Math.abs(Math.cos(ph)) };
      p.flap = 1 + Math.sin(ph * 2) * 0.8;
      p.headDx = 1; p.look = 1;
      const down = Math.abs(Math.sin(ph)) > 0.6 ? 1 : 0, downPrev = Math.abs(Math.sin(ph - Math.PI / 4)) > 0.6 ? 1 : 0;
      p.bodyDy = down; p.headDy = downPrev - down;
      return standFrame(l, p, f, trace);
    }
    case 'jump': {
      const p = still();
      p.near = { thigh: 60, shin: -20 }; p.far = { thigh: -15, shin: -40 }; p.snap = false;
      p.hair = { swing: 0.3, lift: 0.55 }; p.flare = 1; p.flap = 0.5; p.look = 1;
      return standFrame(l, p, f, trace);
    }
    case 'fall': {
      const p = still();
      p.near = { thigh: 25, shin: 10 }; p.far = { thigh: -25, shin: -15 }; p.snap = false;
      p.hair = { swing: -0.1, lift: 1 }; p.flare = 1; p.flap = -0.6;
      return standFrame(l, p, f, trace);
    }
    case 'climb': case 'climbdown': case 'hang': case 'ropetop': return ropeFrame(l, anim, f);
    case 'mantle': {
      // 0 懸掛拉起（腿垂著）→ 1 撐起手肘（腿蹬）→ 2 膝蓋上台 → 3 站起；手臂由 mantleArms 畫
      const p = still('effort');
      p.snap = f === 3; p.sweat = f < 3; p.look = 1;
      if (f === 0) { p.near = { thigh: 30, shin: -20 }; p.far = { thigh: 15, shin: -25 }; p.headDy = -1; p.bodyDy = 1; p.hair = { swing: 0.3, lift: 0.15 }; }
      else if (f === 1) { p.near = { thigh: 25, shin: -20 }; p.far = { thigh: -15, shin: -30 }; p.bodyDx = 1; p.headDx = 1; p.hair = { swing: 0.45, lift: 0.1 }; }
      else if (f === 2) { p.near = { thigh: 85, shin: -20 }; p.far = { thigh: -20, shin: -20 }; p.bodyDx = 2; p.headDx = 1; p.bodyDy = -1; p.hair = { swing: 0.4, lift: 0.1 }; }
      else { p.near = { thigh: 45, shin: -40 }; p.far = { thigh: 30, shin: -45 }; p.bodyDx = 1; p.headDx = 2; p.bodyDy = 1; p.hair = { swing: -0.35, lift: -0.3 }; p.flap = -0.8; p.expr = 'normal'; }
      return standFrame(l, p, f, trace);
    }
    case 'swim': return swimFrame(l, f);
    case 'hurt': {
      const p = still('hurt');
      p.near = { thigh: 30, shin: 10 }; p.far = { thigh: -25, shin: -10 }; p.snap = false;
      p.headDx = -1; p.hair = { swing: -0.6, lift: 0.4 }; p.flare = 1;
      return standFrame(l, p, f, trace);
    }
    case 'dead': return deadFrame(l);
  }
}

/** 暗處的輪廓光：上緣與背側最外圈的像素換成冷灰，在洞穴裡剪影還認得出來 */
export const RIM = hex('#423f54');
export function rimOf(flat: Bmp): Bmp {
  const W = flat.w, H = flat.h, m = new Uint8Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (flat.on(x, y) && (!flat.on(x, y - 1) || !flat.on(x - 1, y))) m[y * W + x] = 1;
  const r = new Bmp(W, H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (!m[y * W + x]) continue;
    let n = 0;
    for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) if ((i || j) && x + i >= 0 && y + j >= 0 && x + i < W && y + j < H && m[(y + j) * W + x + i]) n++;
    if (n >= 1) r.set(x, y, RIM);
  }
  return r;
}
/** 整張影格表：SHEET.total 格橫排、四列（第 0 列 = body、第 1 列 = head、第 2 列 = 暗處輪廓光、第 3 列 = 臉） */
export function avatarSheet(l: DollLook): { b: Bmp; meta: FrameMeta[] } {
  const b = new Bmp(AV_FW * SHEET.total, AV_FH * 4);
  const meta: FrameMeta[] = [];
  for (const k of SHEET_ANIMS) {
    const [s, n] = SHEET[k];
    for (let f = 0; f < n; f++) {
      const r = avatarFrame(l, k, f);
      b.blit(r.body, (s + f) * AV_FW, 0);
      b.blit(r.head, (s + f) * AV_FW, AV_FH);
      b.blit(rimOf(flatFrame(r)), (s + f) * AV_FW, AV_FH * 2);
      if (r.face) b.blit(r.face, (s + f) * AV_FW, AV_FH * 3);
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
  const rows = torsoRows(0, false);
  if (slot === 'body') { topFront(b, { ...l, neck: null, belt: null }, wearOf(l, l.body), rows, false, pose); b.softOutline(); }
  else if (slot === 'legs') {
    const w = wearOf(l, l.legs), st = legStyle({ ...l, feet: null }, w);
    const skinless: LegStyle = { ...st, parts: st.parts.map(([t, r, h]) => [t, r === skinRamp(l.app.skin) ? CLOTH_RAMPS[0] : r, h]) };
    b.blit(legBmp({ thigh: -4, shin: 0 }, BODY[0].legX[0], BODY[0].hip, skinless, true, 2.5, 1.5).b, 0, 0);
    b.blit(legBmp({ thigh: 4, shin: 0 }, BODY[0].legX[1], BODY[0].hip, skinless, false, 2.5, 1.5).b, 0, 0);
    const low = new Bmp(AV_FW, AV_FH);
    lowerFront(low, w, rows, pose);
    low.softOutline();
    b.blit(low, 0, 0);
  } else if (slot === 'back' && l.back) backArt(b, l.back, 0.4, 0, CX + 1, 38, 10, 0);
  else if (slot === 'head' && l.head) {
    const h = new Bmp(AV_FW, AV_FH);
    if (armorSet(l.head)) { helmetHeadOnly(h, l.head); h.softOutline(); }
    else hatHeadOnly(h, lookId(l.head, 'hat:') ?? 'beret');
    b.blit(h, 0, 0);
  }
  void CR;
  return b;
}
