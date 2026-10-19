// avatarHead.ts — 角色的頭（純 Bmp，無 DOM）：日系 Q 版超大頭（23×22，約 1.9 頭身）、3/4 側臉（面向右）。
//   臉是視覺焦點：瀏海收在額頭中段（眼睛完整露出）、大片膚色；眼睛 6 列高（男 5 列）——
//   上緣粗黑線（女生外眼角往外翹）、虹膜上深中淺三階、左上一顆 2×2 白高光、下緣淡下眼瞼。
//   九種髮型 = 頭頂髮量 + 少數幾束粗而有弧度的髮束（每束左亮右暗、束與束之間深一階）+ 一圈天使光環；
//   剪影圓潤（雙馬尾 / 馬尾 / 長髮都是粗的一大束，尾端分兩三個尖）。選擇性描邊（髮的線是深髮色、臉的線是暖棕）。
//   頭飾（蝴蝶結 / 貓耳 / 髮夾 / 兜帽 / 小花）、眼鏡、頭盔與時裝帽（avatarGear）。
//   back 圖層：畫在身體後面的頭髮（長髮、馬尾、雙馬尾、遠側的丸子、兜帽尖）；front 圖層：頭、臉、瀏海、近側髮束、飾品。
//   座標：頭的區域座標 (0..22, 0..21)，(ox, oy) = 區域原點在畫布上的位置。光從左上。
import { Bmp, hex, type RGB } from './pixel';
import type { Appearance } from '../engine/appearance';
import { HAIR_STYLES, ACCESSORIES } from '../engine/appearance';
import type { DollPiece } from '../engine/doll';
import { R as CR } from './combatArt';
import { CAP, HAT_HIDES_TOP, armorSet, hatArt, helmetArt, inCap, lookId } from './avatarGear';
import { BLUSH, EYE_WHITE, GLASSES, GOLD, MOUTH, SWEAT, TONGUE, clothRamp, darker, eyeRamp, hairRamp, skinRamp } from './avatarPalette';
export { CAP, inCap };

export type Expr = 'normal' | 'blink' | 'hurt' | 'effort' | 'dead' | 'happy' | 'up';
/** 頭髮的動態：swing = 馬尾往後甩（−1..1）、lift = 往上飄（0..1：跳 / 掉落 / 水中）、bob = 上下彈（px） */
export interface HairMotion { swing: number; lift: number; bob?: number; }
export interface HeadOpts {
  app: Appearance; expr: Expr; motion: HairMotion;
  /** 頭上的裝備（頭盔 / 時裝帽）；null = 用外觀的髮飾 */
  gear: DollPiece | null; view: 'side' | 'back';
  /** 影格（傳說裝備的閃光位置） */
  f?: number;
  /** 合成順序紀錄（測試用） */
  trace?: string[];
  /** 額頭冒汗（攀爬 / 攀上邊緣） */
  sweat?: boolean;
  /** 臉（沒被頭髮 / 帽子 / 飾品蓋住的膚色 + 眼睛）另外輸出一張：舉過頭的武器畫在頭髮前、臉後 */
  face?: Bmp;
}

/** 頭的大小（區域座標） */
export const HEAD_W = 23, HEAD_H = 22;

// ── 頭型（每列 [左, 右]） ─────────────────────────────────
const HEAD_ROWS: readonly [number, number][] = [
  [7, 15], [4, 18], [3, 19], [2, 20], [1, 21], [1, 21], [0, 22], [0, 22], [0, 22], [0, 22], [0, 22],
  [0, 22], [0, 22], [0, 22], [0, 22], [1, 22], [1, 22], [2, 21], [3, 21], [5, 20], [7, 19], [10, 17],
];
/** 男生的頭：下巴方（兩側到底才收） */
const HEAD_ROWS_M: readonly [number, number][] = [
  [7, 15], [4, 18], [3, 19], [2, 20], [1, 21], [1, 21], [0, 22], [0, 22], [0, 22], [0, 22], [0, 22],
  [0, 22], [0, 22], [0, 22], [0, 22], [0, 22], [1, 22], [1, 22], [2, 21], [4, 21], [6, 20], [9, 18],
];
const rowsOf = (a: Appearance): readonly [number, number][] => (a.body === 1 ? HEAD_ROWS_M : HEAD_ROWS);
const inRows = (rows: readonly [number, number][], x: number, y: number): boolean => { const r = rows[y]; return Boolean(r) && x >= r[0] && x <= r[1]; };
/** 臉從哪一列開始（再上面是頭頂的頭髮） */
const BROW = 4;

// ── 髮型定義 ─────────────────────────────────────────────
type Pt = [number, number];
/**
 * 一片瀏海（一束）：佔 x0..x1 欄，下緣是一個 V（尖端在 (tx, ty)，往兩側每欄往上縮 k 列）。
 * 一束一束由左往右疊：每束左緣一道亮、右緣一道暗、下緣暗一階 → 看得出一片一片的層次。
 * 尖端最低只到第 10 列（眼睛上緣在第 11 列）：眼睛永遠完整露出。
 */
type Clump = [number, number, number, number, number];
type BangKind = 'tips' | 'blunt' | 'swept' | 'parted' | 'spiky' | 'messy';
const BANGS: Record<BangKind, Clump[]> = {
  // 參差的瀏海：額角一束、中間兩束、前面一束短（額頭中段露出來）
  tips: [[6, 11, 7.5, 9.6, 1.3], [10, 15, 12, 8.6, 1.2], [14, 19, 16, 9.4, 1.3], [18, 23, 20.5, 7.6, 1.3]],
  // 姬髮型的齊瀏海：平平切在眉毛上
  blunt: [[6, 10, 8, 8, 0.15], [10, 14, 12, 8, 0.15], [14, 18, 16, 8, 0.15], [18, 23, 20, 7.6, 0.3]],
  // 往前撥（馬尾 / 丸子）：一大束斜斜往前掃、露出另一邊額頭
  swept: [[6, 10, 8, 9.4, 1.1], [9, 17, 16, 8.4, 0.75], [16, 23, 22, 7, 0.9]],
  // 中分：兩邊往外撥、額頭中間大片露出來
  parted: [[6, 10, 6.5, 9.8, 1], [9, 13, 9.5, 8, 0.9], [15, 19, 18.5, 7.4, 0.9], [18, 23, 22.5, 6.8, 1]],
  // 刺刺的瀏海：尖端銳利、不多
  spiky: [[6, 11, 8, 9.6, 2], [10, 15, 12.5, 9, 2.2], [14, 19, 17, 9.6, 2.2], [18, 23, 21.5, 7.4, 2]],
  // 亂翹短髮：方向不一的四束
  messy: [[6, 11, 9, 9.4, 1.5], [10, 15, 11, 8.4, 1.6], [14, 19, 17.5, 9.6, 1.5], [18, 23, 22, 7.4, 1.5]],
};
interface HairDef {
  bang: BangKind;
  /** 近側鬢角（耳朵前面那束）的下緣（0 = 沒有） */
  nearLock: number;
  /** 後腦勺頭髮的下緣（x < 4） */
  back: number;
  /** 露出耳朵 */
  ear: boolean;
  /** 頭頂髮量（> 1 = 蓬） */
  vol: number;
}
const HAIR: Record<string, HairDef> = {
  bob: { bang: 'tips', nearLock: 19, back: 20, ear: false, vol: 1.05 },
  twintails: { bang: 'tips', nearLock: 16, back: 15, ear: false, vol: 1.02 },
  ponytail: { bang: 'swept', nearLock: 15, back: 13, ear: true, vol: 1.02 },
  long: { bang: 'parted', nearLock: 21, back: 21, ear: false, vol: 1.04 },
  hime: { bang: 'blunt', nearLock: 20, back: 21, ear: false, vol: 1.03 },
  spiky: { bang: 'spiky', nearLock: 14, back: 15, ear: true, vol: 1.02 },
  messy: { bang: 'messy', nearLock: 15, back: 17, ear: true, vol: 1.04 },
  braid: { bang: 'tips', nearLock: 14, back: 16, ear: false, vol: 1.02 },
  odango: { bang: 'swept', nearLock: 15, back: 13, ear: true, vol: 1.02 },
};
const styleId = (a: Appearance): string => HAIR_STYLES[a.hair]?.id ?? 'bob';
const accId = (a: Appearance): string => ACCESSORIES[a.acc]?.id ?? 'none';

// ── 小工具 ───────────────────────────────────────────────
/**
 * 粗細漸變的二次貝茲曲線（髮束 / 馬尾 / 辮子 / 呆毛）。光從左：曲線法線往右 = 暗面。
 * shade(t, s) → 色階索引（t = 0..1 沿曲線、s = −1..1 橫向）。
 */
function strand(b: Bmp, p0: Pt, p1: Pt, p2: Pt, w0: number, w1: number, pal: RGB[], shade?: (t: number, s: number) => number): void {
  const len = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]) + Math.hypot(p2[0] - p1[0], p2[1] - p1[1]);
  const n = Math.max(8, Math.ceil(len * 3));
  const f = shade ?? lockShade;
  for (let i = 0; i <= n; i++) {
    const t = i / n, u = 1 - t;
    const x = u * u * p0[0] + 2 * u * t * p1[0] + t * t * p2[0], y = u * u * p0[1] + 2 * u * t * p1[1] + t * t * p2[1];
    const dx = 2 * u * (p1[0] - p0[0]) + 2 * t * (p2[0] - p1[0]), dy = 2 * u * (p1[1] - p0[1]) + 2 * t * (p2[1] - p1[1]);
    const dl = Math.hypot(dx, dy) || 1, nx = dy / dl, ny = -dx / dl;
    // 粗細：根部到中段飽滿（微微鼓起）、尾端收尖
    const r = (w0 + (w1 - w0) * t * t + Math.sin(t * Math.PI) * (w0 - w1) * 0.18) / 2;
    for (let yy = Math.floor(y - r - 1); yy <= Math.ceil(y + r + 1); yy++) {
      for (let xx = Math.floor(x - r - 1); xx <= Math.ceil(x + r + 1); xx++) {
        const px = xx + 0.5 - x, py = yy + 0.5 - y;
        if (px * px + py * py > r * r + 0.15) continue;
        // 往下垂的束：s < 0 = 畫面左邊（受光）、s > 0 = 右邊（暗面）
        const s = r > 0 ? (px * nx + py * ny) / Math.max(0.5, r) : 0;
        b.set(xx, yy, pal[Math.max(0, Math.min(pal.length - 1, f(t, s)))]);
      }
    }
  }
}
/** 髮束的預設打光：左緣亮、右緣暗、尖端暗一階 */
const lockShade = (t: number, s: number): number => (t > 0.8 ? 1 : s > 0.38 ? 1 : s < -0.5 && t < 0.6 ? 3 : 2);
/** 粗髮束（馬尾 / 雙馬尾）：受光側一道長高光（上段更亮）、暗側兩階、尾端暗 */
const tailShade = (t: number, s: number): number => (t > 0.88 ? 1 : s > 0.62 ? 0 : s > 0.25 ? 1 : s < -0.55 && t < 0.35 ? 4 : s < -0.3 && t < 0.7 ? 3 : 2);
function disc(b: Bmp, cx: number, cy: number, r: number, pal: RGB[]): void {
  for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++) for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) {
    const dx = (x + 0.5 - cx) / r, dy = (y + 0.5 - cy) / r;
    const d = dx * dx + dy * dy;
    if (d > 1) continue;
    const v = -(dx * 0.6 + dy * 0.8);
    b.set(x, y, pal[v > 0.45 ? 3 : v > -0.35 ? 2 : 1]);
    if (d < 0.3 && dx < 0 && dy < -0.1) b.set(x, y, pal[4]);
    if (d > 0.62 && v < -0.5) b.set(x, y, pal[0]);
  }
}
/** 字元格小圖（'.' 跳過） */
function grid(b: Bmp, rows: readonly string[], pal: Record<string, RGB>, ox: number, oy: number): void {
  for (let y = 0; y < rows.length; y++) for (let x = 0; x < rows[y].length; x++) {
    const c = pal[rows[y][x]];
    if (c) b.set(ox + x, oy + y, c);
  }
}

// ── 眼睛（近眼 5 寬：第 0 欄是外眼角；遠眼 4 寬：最後一欄是外眼角）────────
// L 粗黑上眼線 / 睫毛、D 瞳深、M 瞳中、B 瞳淺（下半漸亮）、H 白高光、W 眼白、l 下眼瞼（膚色深）
interface EyeDef { near: string[]; far: string[]; y: number; }
const EYES: Record<string, EyeDef> = {
  // 女：大圓眼（7 列 × 近 6 / 遠 4 欄）：上緣兩列粗黑（外眼角往外下翹）、虹膜三階、左上 2×2 白高光 + 下方一格小反光
  round: { y: 10, near: ['.LLLLL', 'LLDDDD', 'LHHDDD', '.HHMMD', '.DMMBD', '.MBBhM', '..lll.'], far: ['LLL.', 'DDDL', 'HHDW', 'HMDW', 'MBBW', 'Bh..', 'l...'] },
  // 女：上揚眼（貓眼）：外眼角高、睫毛往上挑、眼睛稍扁
  sharp: { y: 9, near: ['L.....', 'LLLLLL', '.LDDDD', '.HHDDD', '.HHMMD', '.DMBBl', '..BBl.'], far: ['...L', 'LLLL', 'DDDW', 'HHD.', 'HMD.', 'MBl.', 'l...'] },
  // 女：下垂眼：外眼角往下、上眼皮蓋住一點瞳孔（溫柔）
  droopy: { y: 10, near: ['...LLL', '.LLLLL', 'LLDDDD', 'LHHDMD', '.HHMBD', '.MBBhM', '..lll.'], far: ['LLL.', 'DDDL', 'HHDL', 'HMDL', 'MBB.', 'Bh..', 'l...'] },
  blink: { y: 14, near: ['L....L', '.LLLL.'], far: ['L..L', '.LL.'] },
  happy: { y: 13, near: ['.LLLL.', 'L....L'], far: ['.LL.', 'L..L'] },
  hurt: { y: 12, near: ['LLL...', '...LLL', '.LLL..', 'L.....'], far: ['..LL', 'LL..', '.LL.', '...L'] },
  dead: { y: 11, near: ['L....L', '.L..L.', '..LL..', '.L..L.', 'L....L'], far: ['L..L', '.LL.', '.LL.', 'L..L'] },
  // 往上看（爬繩）：瞳孔在上半、下面露出眼白
  up: { y: 9, near: ['.LLLLL', 'LLLLLL', 'LHHDDD', 'WHHDMD', 'WDMBBW', '.WWWW.', '..lll.'], far: ['LLL.', 'LLLL', 'HHDW', 'HMDW', 'MBW.', 'WW..', 'l...'] },
  // 用力（攀爬）：瞇起來
  effort: { y: 12, near: ['LL....', 'LLLLLL', '.HHDDD', '..MBBl'], far: ['..LL', 'LLLL', 'HHD.', 'Bl..'] },
  // 男：6 列、上緣一道平直粗線（不翹睫毛）、虹膜三階、一顆 2×2 高光
  round_m: { y: 10, near: ['.LLLLL', '.LDDDD', '.HHDDD', '.HHMMD', '.DMMBD', '.MBBBM'], far: ['LLL.', 'DDDL', 'HHD.', 'HMD.', 'MBB.', 'BB..'] },
  sharp_m: { y: 9, near: ['LL....', '.LLLLL', '.LDDDD', '.HHDDD', '.HMMBD', '..BBBl'], far: ['..LL', 'LLL.', 'DDD.', 'HHD.', 'MBB.', 'B...'] },
  droopy_m: { y: 10, near: ['...LLL', '.LLLLL', '.LDDDD', '.HHDMD', '.HMMBD', '.MBBB.'], far: ['LL..', 'LLLL', 'DDDL', 'HHD.', 'MBB.', 'B...'] },
  up_m: { y: 10, near: ['.LLLLL', 'LLLLLL', 'LHHDDD', 'WHDMBW', 'WWBWWW', '.WWWW.'], far: ['LLL.', 'LLLL', 'HHDW', 'DMBW', 'WW..', 'W...'] },
  effort_m: { y: 13, near: ['LLL...', '.LLLLL', '..HHDD'], far: ['.LLL', 'LLL.', 'HD..'] },
  blink_m: { y: 14, near: ['L....L', '.LLLL.'], far: ['L..L', '.LL.'] },
};
function eyeKind(a: Appearance, expr: Expr): string {
  const shape = (['round', 'sharp', 'droopy'][a.eyeShape] ?? 'round');
  const k = expr === 'normal' ? shape : expr;
  return a.body === 1 && EYES[`${k}_m`] ? `${k}_m` : k;
}
/** 眉毛（男生粗、女生細短）：眼睛上方兩列 */
export function brows(b: Bmp, a: Appearance, expr: Expr, ox: number, oy: number): void {
  if (expr === 'dead') return;
  const c = hairRamp(a.hairColor)[a.body === 1 ? 0 : 1];
  const angry = expr === 'effort' || expr === 'hurt', sad = a.eyeShape === 2 && expr === 'normal';
  const y = oy + (a.body === 1 ? 7 : 8);
  if (a.body === 1) {
    // 男：直眉（近側 5 格、遠側 3 格），內側一格加粗；上揚眼的眉尾往上、下垂眼的眉尾往下；用力時內側往下壓
    const tail = a.eyeShape === 1 ? -1 : a.eyeShape === 2 ? 1 : 0;
    for (let x = 8; x <= 13; x++) b.set(ox + x, y + (x <= 9 ? tail : 0) + (angry && x >= 12 ? 1 : 0), c);
    b.set(ox + 13, y - 1 + (angry ? 1 : 0), c);
    for (let x = 17; x <= 19; x++) b.set(ox + x, y + (x === 19 ? tail : 0) + (angry && x === 17 ? 1 : 0), c);
  } else {
    for (let x = 10; x <= 12; x++) b.set(ox + x, y + (angry && x === 12 ? 1 : 0) + (sad && x === 10 ? 1 : 0), c);
    b.set(ox + 18, y + (angry ? 1 : 0), c); b.set(ox + 19, y, c);
  }
}

function face(b: Bmp, a: Appearance, expr: Expr, ox: number, oy: number): void {
  const e = eyeRamp(a.eyes), sk = skinRamp(a.skin), male = a.body === 1;
  const g = EYES[eyeKind(a, expr)];
  const pal: Record<string, RGB> = { L: hex('#1c1424'), D: e[0], M: e[1], B: e[2], H: EYE_WHITE, h: EYE_WHITE, W: EYE_WHITE, l: sk[1] };
  grid(b, g.near, pal, ox + 8, oy + g.y);
  grid(b, g.far, pal, ox + 17, oy + g.y);
  const mY = 19;
  // 鼻子：一格陰影
  b.set(ox + 21, oy + 17, sk[2]);
  // 腮紅（每邊三格）
  if ((a.blush || expr === 'happy') && expr !== 'dead') {
    const bl = BLUSH[a.skin] ?? BLUSH[1];
    for (const x of [8, 9, 10, 20, 21]) b.set(ox + x, oy + 18, bl);
  }
  // 嘴
  if (expr === 'hurt' || expr === 'effort') {
    b.set(ox + 16, oy + mY, MOUTH); b.set(ox + 17, oy + mY, MOUTH); b.set(ox + 18, oy + mY, sk[1]);
    b.set(ox + 16, oy + mY + 1, TONGUE); b.set(ox + 17, oy + mY + 1, MOUTH);
  } else if (expr === 'happy') {
    b.set(ox + 16, oy + mY, MOUTH); b.set(ox + 17, oy + mY, MOUTH); b.set(ox + 18, oy + mY, MOUTH); b.set(ox + 17, oy + mY + 1, TONGUE);
  } else if (expr === 'dead') {
    b.set(ox + 16, oy + mY, sk[0]); b.set(ox + 17, oy + mY + 1, sk[0]); b.set(ox + 18, oy + mY, sk[0]);
  } else if (expr === 'up') {
    b.set(ox + 17, oy + mY, sk[0]); b.set(ox + 17, oy + mY + 1, sk[1]);
  } else {
    // 小嘴：一道深一階的短線，嘴角往上一格（微笑）
    b.set(ox + 17, oy + mY, sk[0]); b.set(ox + 16, oy + mY, sk[1]); b.set(ox + 18, oy + mY - 1, sk[1]);
    if (male) b.set(ox + 18, oy + mY, sk[1]);
  }
}

// ── 側面：頭頂髮量的遮罩 ─────────────────────────────────
/** 0 = 沒有、1 = 頭頂 / 前額上緣、2 = 鬢角（耳朵前）、3 = 後腦勺 */
function capMask(st: string, rows: readonly [number, number][], cov: boolean): (x: number, y: number) => number {
  const d = HAIR[st] ?? HAIR.bob;
  const k = cov ? 1 : d.vol;
  return (x, y) => {
    if (y < -5 || y > 24 || x < -5 || x > 25) return 0;
    const skull = inRows(rows, x, y);
    const cap = inCap(x, y, k);
    if (y < BROW) return cap || skull ? 1 : 0;
    // 臉：前額以下、x ≥ 8 的頭型裡
    if (x >= 8) return (y < BROW + 1 && (cap || skull)) ? 1 : 0;
    if (d.ear && x >= 3 && x <= 6 && y >= 12 && y <= 16) return 0;
    if (x >= 4) return y < d.nearLock - 2 && (cap || skull) ? 2 : 0;
    // 後腦勺：下緣後角修圓（鮑伯往內收）
    if (y >= d.back) return 0;
    if (y >= d.back - 2 && x <= -1 + (y - (d.back - 3))) return 0;
    return cap || skull || (y >= 10 && x >= -1 && inCap(x, Math.min(y, 13), k * 1.05)) ? 3 : 0;
  };
}

/** 頭頂的打光：左上亮、右下暗；天使光環一圈斷續的高光 */
function capShade(x: number, y: number, h: RGB[]): RGB {
  const nx = (x + 0.5 - CAP.cx) / CAP.rx, ny = (y + 0.5 - CAP.cy) / CAP.ry;
  const d = Math.hypot(nx, ny);
  const v = 0.6 - 0.6 * (nx * 0.6 + ny * 0.8);
  // 天使光環：頭頂一圈細亮帶（左邊最亮），在兩處髮束縫斷開
  if (ny < -0.3 && d > 0.52 && d < 0.64 && x !== 7 && x !== 15) return x < 10 ? h[4] : h[3];
  return h[v > 1.02 ? 3 : v > 0.42 ? 2 : v > 0.12 ? 1 : 0];
}

// ── 側面 ─────────────────────────────────────────────────
/** 頭上有東西蓋住頭頂（頭盔 / 草帽 / 魔女帽 / 貝雷帽）：呆毛、頭頂的刺、丸子都收起來；有頭上裝備時外觀的髮飾不戴 */
function headCover(o: HeadOpts): { top: boolean; helmet: boolean; hat: string | null } {
  const helmet = armorSet(o.gear) !== null, hat = lookId(o.gear, 'hat:');
  return { helmet, hat, top: helmet || (hat !== null && HAT_HIDES_TOP.has(hat)) };
}
function headGear(head: Bmp, o: HeadOpts, ox: number, oy: number): void {
  if (!o.gear) return;
  if (armorSet(o.gear)) helmetArt(head, o.gear, ox, oy, o.f ?? 0, o.view);
}

function sideHead(back: Bmp, front: Bmp, o: HeadOpts, ox: number, oy: number): void {
  const cov = headCover(o);
  const a = o.app, h = hairRamp(a.hairColor), sk = skinRamp(a.skin), st = styleId(a), acc = o.gear ? 'none' : accId(a), m = o.motion;
  const sw = m.swing, lift = m.lift;
  const def = HAIR[st] ?? HAIR.bob;
  const P = (x: number, y: number): Pt => [ox + x, oy + y];
  // 臉：頭型 + 遠側臉頰 / 下巴陰影；近側臉頰一塊亮部
  const skin = new Bmp(front.w, front.h);
  const rows = rowsOf(a), chin = rows.length - 1;
  for (let y = 0; y < rows.length; y++) {
    const [x0, x1] = rows[y];
    for (let x = x0; x <= x1; x++) {
      const edge = (x === x1 && y >= 7 && y <= chin - 2) || y === chin || (y === chin - 1 && (x === x0 || x >= x1 - 1));
      const hi = y >= 17 && y <= 18 && x >= 12 && x <= 14;
      skin.set(ox + x, oy + y, edge ? sk[2] : hi ? sk[4] : sk[3]);
    }
  }
  // 脖子
  skin.rect(ox + 9, oy + rows.length, 5, 2, sk[1]);
  // 耳朵
  if (def.ear) grid(skin, ['.ss.', 'sSss', 'sDs.', '.ss.'], { s: sk[3], S: sk[4], D: sk[2] }, ox + 3, oy + 12);
  face(skin, a, o.expr, ox, oy);
  brows(skin, a, o.expr, ox, oy);
  o.trace?.push('face');

  // ── 頭髮 ──
  const mask = capMask(st, rows, cov.top);
  const hair = new Bmp(front.w, front.h);
  for (let y = -5; y <= 24; y++) for (let x = -5; x <= 25; x++) {
    const k = mask(x, y);
    if (!k) continue;
    let c: RGB;
    if (k === 1) c = capShade(x, y, h);
    else if (k === 2) c = y >= def.nearLock - 4 ? h[1] : x === 4 ? h[3] : h[2];
    else c = x <= 0 ? (y < 9 ? h[3] : h[2]) : y >= def.back - 2 ? h[0] : y >= def.back - 4 ? h[1] : h[2];
    hair.set(ox + x, oy + y, c);
  }
  // 瀏海：一束一束蓋在額頭上（由左往右疊）
  const clump = (c: Clump, top: number): void => {
    const [x0, x1, tx0, ty0, k] = c, tx = tx0 + sw * 0.4, ty = (top < 0 ? Math.min(ty0, 9.4) : ty0) - lift;
    for (let x = x0; x <= x1; x++) {
      const bot = ty - Math.abs(x - tx) * k;
      for (let y = top; y <= Math.floor(bot); y++) {
        if (y < BROW ? !inCap(x, y, 1.02) : x > 22 && !inCap(x, y, 1.0) && !inRows(rows, x, y)) continue;
        const last = y > bot - 1;
        const c2 = y < BROW ? capShade(x, y, h) : last ? h[1] : x === x1 ? h[1] : x === x0 && y <= BROW + 2 && y < ty - 2 ? h[3] : h[2];
        hair.set(ox + x, oy + y, c2);
      }
    }
  };
  for (const c of BANGS[def.bang]) clump(c, -2);
  // 近側鬢角（耳朵前面垂下的一束，窄：臉頰露得多）
  if (def.nearLock > 0) clump(def.ear ? [6, 7, 6.5, def.nearLock, 0.9] : [4, 7, 5.5, def.nearLock, 0.8], 3);
  // 瀏海下緣在額頭投下的陰影（額頭上、髮尖正下方那格）
  for (let y = BROW; y <= 12; y++) for (let x = 8; x <= 22; x++) {
    if (!hair.on(ox + x, oy + y - 1) || hair.on(ox + x, oy + y)) continue;
    if (inRows(rows, x, y) && skin.on(ox + x, oy + y)) {
      const cur = skin.get(ox + x, oy + y);
      if (cur.join() === sk[3].join() || cur.join() === sk[4].join()) skin.set(ox + x, oy + y, sk[2]);
    }
  }

  // ── 髮型特色 ──
  const behind = new Bmp(back.w, back.h);
  const tie = clothRamp(a.color2);
  /** 粗的一大束（馬尾 / 雙馬尾）：主束 + 尾端分出一個小尖（剪影圓潤、尾巴有層次） */
  const bigTail = (b: Bmp, root: Pt, ctrl: Pt, end: Pt, w: number, pal: RGB[]): void => {
    strand(b, root, ctrl, end, w, 1.6, pal, tailShade);
    const mid: Pt = [(ctrl[0] + end[0]) / 2 + 1.2, (ctrl[1] + end[1]) / 2 + 2];
    strand(b, mid, [mid[0] + 1.5, mid[1] + (end[1] - mid[1]) * 0.6], [end[0] + 3, end[1] - 2], w * 0.42, 1, pal, (t, s) => (t > 0.75 ? 1 : s > 0.3 ? 0 : 1));
  };
  if (st === 'long' || st === 'hime') {
    // 直長髮：垂在背後到腰，三大束（外側亮、內側暗、束縫深一階），尾端 V 字尖；走 / 跳時整束往後 / 往上飄
    const locks: [number, number, number, number][] = [[-3, 1, 27, -1], [1, 5, 28, 3], [4, 9, 25, 6.5]];
    for (const [x0, x1, tip0, tx] of locks) {
      const top = 7, tip = tip0 - lift * 8, len = tip - top;
      for (let y = top; y <= Math.ceil(tip); y++) {
        const t = Math.max(0, (y - top) / len), shift = Math.round((-sw * 3.6 - lift * 2.8) * t ** 1.4 - Math.sin(t * Math.PI) * 0.8);
        for (let x = x0; x <= x1; x++) {
          if (y > tip - Math.abs(x + 0.5 - tx) * 1.4) continue;
          const c = y > tip - 2 ? h[1] : x === x1 ? h[0] : x === x0 ? (y < 18 ? h[3] : h[2]) : (x === x0 + 1 && y >= 11 && y <= 15) ? h[3] : y > tip - 5 ? h[1] : h[2];
          behind.set(ox + x + shift, oy + y, c);
        }
      }
    }
    if (st === 'hime') {
      // 姬髮的側邊齊長髮（耳前一片直直切在下巴）
      for (let y = 7; y <= 20; y++) for (let x = 4; x <= 7; x++) hair.set(ox + x, oy + y, y === 20 ? h[1] : x === 4 ? h[3] : x === 7 ? h[1] : h[2]);
    }
  }
  if (st === 'ponytail') {
    // 高馬尾：從後腦勺頂綁起、粗粗的一大束往後甩下來
    bigTail(behind, P(1, 1), P(-9 - sw * 1.5, 0 - lift * 2), P(-5.5 - sw * 3 - lift * 1.5, 23 - lift * 10), 8.4, h);
    strand(hair, P(1.4, 1.4), P(0.4, 1.8), P(0, 3), 4.2, 3, tie, (_t, s) => (s < 0 ? 4 : 2));
  }
  if (st === 'twintails') {
    // 雙馬尾：遠側（較暗、在後面）+ 近側；綁在頭頂兩側、粗粗的兩大束垂到腰
    bigTail(behind, P(6, 0), P(-1 - sw * 1.5, -3 - lift * 2), P(1 - sw * 3 - lift, 22 - lift * 9), 6.6, darker(h));
    bigTail(behind, P(2.4, 3.4), P(-7 - sw * 1.2, 1 - lift * 2), P(-4 - sw * 2.4 - lift * 1.2, 26 - lift * 10), 8.4, h);
    strand(hair, P(2.8, 2.8), P(1.8, 3), P(1.2, 4.2), 4.2, 3, tie, (_t, s) => (s < 0 ? 4 : 2));
  }
  if (st === 'braid') {
    // 從近側鬢角垂到胸前的麻花辮：一節一節左右交錯（三格寬）
    const bx = ox + 7, by = oy + 15;
    const swing = Math.round(sw * 1.5);
    for (let k = 0; k < 14; k++) {
      const y = by + k - Math.round(lift * k * 0.4), x = bx + Math.round((k / 14) * (1 + swing)) - Math.round(lift * k * 0.25);
      const ph = k % 3;
      hair.set(x - 1, y, ph === 0 ? h[3] : ph === 1 ? h[2] : h[1]);
      hair.set(x, y, ph === 0 ? h[2] : ph === 1 ? h[3] : h[1]);
      hair.set(x + 1, y, ph === 0 ? h[1] : ph === 1 ? h[1] : h[2]);
      if (ph === 2) hair.set(x, y, h[0]);
    }
    const ty = by + 14 - Math.round(lift * 5.6), tx = bx + 1 + swing - Math.round(lift * 3.5);
    hair.set(tx - 1, ty, tie[3]); hair.set(tx, ty, tie[4]); hair.set(tx + 1, ty, tie[2]);
    hair.set(tx - 1, ty + 1, h[2]); hair.set(tx, ty + 1, h[3]); hair.set(tx + 1, ty + 1, h[1]); hair.set(tx, ty + 2, h[1]);
  }
  if (st === 'odango' && !cov.top) {
    disc(behind, ox + 13, oy - 1.8, 4.2, darker(h));
    disc(hair, ox + 3.8, oy + 0.6, 4.6, h);
    // 綁帶
    hair.set(ox + 6, oy + 4.2, tie[3]); hair.set(ox + 7, oy + 3.4, tie[4]); hair.set(ox + 8, oy + 2.4, tie[3]); hair.set(ox + 5, oy + 4.8, tie[2]);
  }
  if (st === 'spiky') {
    // 刺蝟頭：五根粗刺往後上方（乾淨的大三角，不亂）
    const sp: [Pt, Pt, number][] = [[[2, 1], [-5, -5], 6], [[7, -1], [5, -8], 5.6], [[13, -1], [15, -7], 5], [[0, 7], [-7, 5], 5.4], [[0, 12], [-6, 15], 4.4]];
    for (const [s, t, w] of sp.filter(([q]) => !cov.top || q[1] >= 6)) strand(hair, P(s[0], s[1]), P((s[0] + t[0]) / 2, (s[1] + t[1]) / 2 - 0.5), P(t[0] - sw, t[1] - lift), w, 0.6, h, (tt, ss) => (tt > 0.75 ? 1 : ss < -0.25 ? 3 : ss > 0.45 ? 1 : 2));
  }
  if (st === 'messy') {
    // 亂翹：四撮圓圓的翹髮
    const sp: [Pt, Pt][] = [[[2, 0], [-2, -3]], [[9, -1], [9.5, -4.5]], [[-1, 6], [-4, 5]], [[0, 13], [-3, 17]]];
    for (const [s, t] of sp.filter(([q]) => !cov.top || q[1] >= 5)) strand(hair, P(s[0], s[1]), P((s[0] + t[0]) / 2, (s[1] + t[1]) / 2), P(t[0] - sw * 0.5, t[1] - lift * 0.5), 4.2, 0.8, h, (tt, ss) => (tt > 0.65 ? 1 : ss < 0 ? 3 : 2));
  }
  if (st === 'bob') {
    // 鮑伯：髮尾往內捲、下緣兩個圓尖
    for (const [x, y] of [[-1, 19], [2, 20]] as Pt[]) { hair.set(ox + x, oy + y, h[1]); hair.set(ox + x + 1, oy + y, h[1]); }
  }
  // 呆毛
  if (a.ahoge && acc !== 'hood' && !cov.top) {
    strand(hair, P(11, -1), P(10 + sw * 0.5, -7 - lift), P(15, -6.5 - lift), 2.4, 0.9, h, (t) => (t < 0.45 ? 3 : t > 0.85 ? 1 : 2));
  }
  hair.selOutline();
  skin.selOutline();
  const head = new Bmp(front.w, front.h);
  head.blit(skin, 0, 0);
  head.blit(hair, 0, 0);
  o.trace?.push('frontHair');
  // 頭盔 / 兜帽 蓋在頭髮上（帽子另外描邊）
  const gear = new Bmp(front.w, front.h);
  headGear(gear, o, ox, oy);
  if (!o.gear && acc === 'hood') hood(gear, behind, a, ox, oy, 'side');
  gear.selOutline();
  head.blit(gear, 0, 0);
  if (o.sweat) sweat(head, ox - 1, oy + 3);
  front.blit(head, 0, 0);
  if (cov.hat) hatArt(front, cov.hat, ox, oy, 'side', m.swing);
  if (o.gear) o.trace?.push('headgear');
  // 飾品（各自描邊）
  sideAcc(front, a, st, acc, ox, oy);
  if (a.glasses) glasses(front, ox, oy);
  o.trace?.push('frontAcc');
  if (o.face) for (let i = 0; i < skin.px.length; i++) { const v = skin.px[i]; if (v >>> 24 && front.px[i] === v) o.face.px[i] = v; }
  behind.selOutline();
  back.blit(behind, 0, 0);
}

function sweat(b: Bmp, x: number, y: number): void {
  b.set(x, y, SWEAT[2]); b.set(x, y + 1, SWEAT[1]); b.set(x - 1, y + 1, SWEAT[1]); b.set(x, y + 2, SWEAT[0]); b.set(x - 1, y + 2, SWEAT[1]);
}

function glasses(b: Bmp, ox: number, oy: number): void {
  const g = GLASSES, y0 = 11;
  // 近側鏡框（7×7）+ 遠側鏡框（窄）+ 鼻橋 + 鏡腳
  for (let x = 8; x <= 14; x++) { b.set(ox + x, oy + y0 - 1, g); b.set(ox + x, oy + y0 + 6, g); }
  for (let y = y0 - 1; y <= y0 + 6; y++) { b.set(ox + 8, oy + y, g); b.set(ox + 14, oy + y, g); }
  for (let x = 16; x <= 22; x++) { b.set(ox + x, oy + y0 - 1, g); b.set(ox + x, oy + y0 + 6, g); }
  for (let y = y0 - 1; y <= y0 + 6; y++) b.set(ox + 16, oy + y, g);
  b.set(ox + 15, oy + y0, g);
  for (let x = 4; x <= 7; x++) b.set(ox + x, oy + y0, g);
  // 鏡片反光
  b.set(ox + 13, oy + y0, hex('#ffffff')); b.set(ox + 12, oy + y0 + 1, hex('#cceaf8'));
}

function bow(b: Bmp, x: number, y: number, r: RGB[], big = false): void {
  const s = new Bmp(b.w, b.h);
  if (big) grid(s, ['bb...bb', 'bBb.bBb', 'bbbkbbb', 'bkb.bkb', '.b...b.'], { b: r[3], B: r[4], k: r[2] }, x - 3, y - 2);
  else grid(s, ['bb.bb', 'bBkBb', 'bk.kb'], { b: r[3], B: r[4], k: r[2] }, x - 2, y - 1);
  s.selOutline();
  b.blit(s, 0, 0);
}

function sideAcc(b: Bmp, a: Appearance, st: string, acc: string, ox: number, oy: number): void {
  const r = clothRamp(a.color2);
  if (acc === 'ribbon') {
    if (st === 'twintails') { bow(b, ox + 3, oy + 3, r); return; }
    if (st === 'ponytail') { bow(b, ox + 1, oy + 1, r); return; }
    if (st === 'odango') { bow(b, ox + 7, oy + 4, r); return; }
    bow(b, ox + 5, oy, r, true);
  } else if (acc === 'catears') {
    const s = new Bmp(b.w, b.h), c = clothRamp(a.color2), pink = hex('#ffc8dc');
    // 髮箍
    for (const [x, y] of [[3, 2], [4, 1], [5, 0], [6, -1], [7, -1], [8, -2], [9, -2], [10, -2], [11, -2], [12, -2], [13, -2], [14, -1], [15, -1]] as Pt[]) s.set(ox + x, oy + y, c[2]);
    grid(s, ['...e', '..ee', '.epe', 'eppe', 'eEee'], { e: c[3], E: c[4], p: pink }, ox + 4, oy - 7);
    grid(s, ['e...', 'ee..', 'epe.', 'eeee'], { e: c[2], p: pink }, ox + 13, oy - 6);
    s.selOutline();
    b.blit(s, 0, 0);
  } else if (acc === 'clip') {
    const s = new Bmp(b.w, b.h), y = hex('#ffd86a'), w = hex('#fff4c0'), o = hex('#e8701c');
    grid(s, ['..y..', '.yyy.', 'ywWyo', '.yoy.', '.o.o.'], { y, w, W: hex('#ffffff'), o }, ox + 6, oy + 2);
    s.selOutline();
    b.blit(s, 0, 0);
  } else if (acc === 'flower') {
    const s = new Bmp(b.w, b.h), p = hex('#ffc8dc'), pd = hex('#e890b0'), c = GOLD, lf = CR.green;
    grid(s, ['.pp.', 'pPcp', 'pccd', '.pd.', 'g..g'], { p, P: hex('#ffffff'), c, d: pd, g: lf[3] }, ox + 3, oy + 3);
    s.selOutline();
    b.blit(s, 0, 0);
  }
}

/** 兜帽：蓋住頭頂與後腦，前面開口露出臉與瀏海；帽沿亮一階，帽沿內側一道暗影 */
function hood(head: Bmp, behind: Bmp, a: Appearance, ox: number, oy: number, view: 'side' | 'back'): void {
  const c = clothRamp(a.color1);
  const opening = (x: number, y: number): boolean => view === 'side' ? x >= 9 && y >= 4 && y <= 23 : false;
  for (let y = -4; y <= 23; y++) for (let x = -4; x <= 24; x++) {
    const nx = (x + 0.5 - CAP.cx) / 13.2, ny = (y + 0.5 - 10.4) / 12.6;
    if (nx * nx + ny * ny > 1 || opening(x, y)) continue;
    if (view === 'side' && y > 19 && x > 8) continue;
    const rim = view === 'side' && (opening(x + 1, y) || opening(x, y + 1) || opening(x + 1, y + 1));
    const v = -(nx * 0.55 + ny * 0.85);
    head.set(ox + x, oy + y, rim ? c[4] : v > 0.45 ? c[4] : v > -0.25 ? c[3] : v > -0.6 ? c[2] : c[1]);
  }
  for (let y = 4; y <= 18; y++) if (head.on(ox + 8, oy + y)) head.set(ox + 9, oy + y, c[1]);
  // 帽尖垂在後面
  strand(behind, [ox - 1, oy + 7], [ox - 7, oy + 12], [ox - 6, oy + 20], 5, 1.6, c, (t, s) => (t > 0.8 ? 1 : s < -0.3 ? 3 : 2));
}


export function drawHead(back: Bmp, front: Bmp, ox: number, oy: number, o: HeadOpts): void {
  sideHead(back, front, o, ox, oy);
}
