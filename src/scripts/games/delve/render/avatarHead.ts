// avatarHead.ts — 角色的頭（純 Bmp，無 DOM）：日系 Q 版大頭（20×19，男生 20×20）、3/4 側臉（面向右）。
//   大眼：上睫毛（女生外眼角往外翹）、瞳孔上深下淺三階、大小兩顆高光、下眼瞼；男生眼睛矮一列、眼型銳利、粗眉。
//   九種髮型都是「頭頂髮量 + 一束一束的瀏海 / 鬢角 / 後髮」：每束左亮右暗、束與束之間有暗縫、
//   頭頂一圈斷續的天使光環高光；選擇性描邊（髮的線是深髮色、臉的線是暖棕，不是一律純黑）。
//   頭飾（蝴蝶結 / 貓耳 / 髮夾 / 兜帽 / 小花）、眼鏡、頭盔與時裝帽（avatarGear）。
//   back 圖層：畫在身體後面的頭髮（長髮、馬尾、遠側的雙馬尾 / 丸子、兜帽尖）；front 圖層：頭、臉、瀏海、近側髮束、飾品。
//   座標：頭的區域座標 (0..19, 0..18)，(ox, oy) = 區域原點在畫布上的位置。光從左上。
import { Bmp, hex, type RGB } from './pixel';
import type { Appearance } from '../engine/appearance';
import { HAIR_STYLES, ACCESSORIES } from '../engine/appearance';
import type { DollPiece } from '../engine/doll';
import { R as CR } from './combatArt';
import { CAP, HAT_HIDES_TOP, armorSet, hatArt, helmetArt, inCap, lookId } from './avatarGear';
export { CAP, inCap };
import { BLUSH, EYE_WHITE, GLASSES, GOLD, MOUTH, SWEAT, TONGUE, clothRamp, darker, eyeRamp, hairRamp, skinRamp } from './avatarPalette';

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
export const HEAD_W = 20, HEAD_H = 19;
// ── 頭型（每列 [左, 右]） ─────────────────────────────────
const HEAD_ROWS: readonly [number, number][] = [
  [6, 13], [4, 15], [2, 17], [1, 18], [1, 18], [0, 19], [0, 19], [0, 19], [0, 19], [0, 19],
  [0, 19], [0, 19], [0, 19], [1, 19], [1, 19], [2, 18], [3, 18], [5, 17], [8, 15],
];
/** 男生的頭：下巴方（兩側到底才收）、比女生長一列 */
const HEAD_ROWS_M: readonly [number, number][] = [
  [6, 13], [4, 15], [2, 17], [1, 18], [1, 18], [0, 19], [0, 19], [0, 19], [0, 19], [0, 19],
  [0, 19], [0, 19], [0, 19], [0, 19], [1, 19], [1, 19], [2, 19], [3, 18], [5, 17], [8, 16],
];
const rowsOf = (a: Appearance): readonly [number, number][] => (a.body === 1 ? HEAD_ROWS_M : HEAD_ROWS);
const inRows = (rows: readonly [number, number][], x: number, y: number): boolean => { const r = rows[y]; return Boolean(r) && x >= r[0] && x <= r[1]; };

// ── 髮型定義 ─────────────────────────────────────────────
type Pt = [number, number];
/**
 * 一片瀏海（一束）：佔 x0..x1 欄，下緣是一個 V（尖端在 (tx, ty)，往兩側每欄往上縮 k 列）。
 * 一束一束由左往右疊：每束左緣一道亮、右緣一道暗、下緣暗一階 → 看得出一片一片的層次。
 */
type Clump = [number, number, number, number, number];
type BangKind = 'tips' | 'blunt' | 'swept' | 'parted' | 'spiky' | 'messy';
const BANGS: Record<BangKind, Clump[]> = {
  // 參差的瀏海：額角一束、中間一束最長（落在兩眼之間）、前面兩束短
  tips: [[5, 9, 6, 10, 1.3], [8, 12, 10, 9, 1.2], [11, 15, 13, 12, 1.4], [14, 18, 16, 9, 1.2], [17, 21, 19, 8, 1.3]],
  // 姬髮型的齊瀏海：一排平平切在眉毛
  blunt: [[5, 9, 7, 9, 0.2], [9, 12, 10.5, 9, 0.2], [12, 15, 13.5, 9, 0.2], [15, 18, 16.5, 9, 0.2], [18, 21, 19, 8, 0.4]],
  // 往前撥的瀏海（馬尾 / 丸子）：每束的尖端在右邊（往前掃）、露出一點額頭
  swept: [[5, 9, 7, 10, 1.1], [8, 14, 13, 9, 0.9], [13, 18, 17, 8, 0.9], [17, 21, 20, 7, 1]],
  // 中分：兩邊往外撥、額頭中間露出來
  parted: [[5, 9, 5.5, 11, 1], [8, 12, 8.5, 9, 0.9], [13, 17, 16.5, 8, 0.9], [16, 21, 20, 7, 1]],
  // 刺刺的瀏海：尖端銳利
  spiky: [[5, 9, 7, 10, 2.2], [8, 12, 10.5, 9.5, 2.4], [11, 15, 13.5, 11, 2.4], [14, 18, 17, 9, 2.4], [17, 21, 20, 7.5, 2.2]],
  // 亂翹短髮：方向不一的幾束
  messy: [[5, 9, 7.5, 10, 1.6], [8, 12, 9, 8.5, 1.8], [11, 15, 14, 11, 1.6], [14, 18, 15, 8.5, 1.8], [17, 21, 20, 7.5, 1.6]],
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
  bob: { bang: 'tips', nearLock: 16, back: 17, ear: false, vol: 1.04 },
  twintails: { bang: 'tips', nearLock: 14, back: 13, ear: false, vol: 1 },
  ponytail: { bang: 'swept', nearLock: 13, back: 11, ear: true, vol: 1 },
  long: { bang: 'parted', nearLock: 18, back: 18, ear: false, vol: 1.03 },
  hime: { bang: 'blunt', nearLock: 17, back: 18, ear: false, vol: 1.02 },
  spiky: { bang: 'spiky', nearLock: 12, back: 13, ear: true, vol: 1 },
  messy: { bang: 'messy', nearLock: 13, back: 15, ear: true, vol: 1.02 },
  braid: { bang: 'tips', nearLock: 12, back: 14, ear: false, vol: 1 },
  odango: { bang: 'swept', nearLock: 13, back: 11, ear: true, vol: 1 },
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
    const r = (w0 + (w1 - w0) * t) / 2;
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
/** 髮束的預設打光：左緣亮、右緣暗、尖端暗一階、中段一點高光 */
const lockShade = (t: number, s: number): number => (t > 0.8 ? 1 : s > 0.38 ? 1 : s < -0.5 && t < 0.6 ? 3 : 2);
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
// L 睫毛、p 睫毛淡、D 瞳深、M 瞳中、B 瞳淺（下半漸亮）、H 高光、h 小高光、W 眼白、w 眼白陰影、l 下眼瞼（膚色深）
interface EyeDef { near: string[]; far: string[]; y: number; }
const EYES: Record<string, EyeDef> = {
  // 女：大圓眼，外眼角睫毛往外下翹
  round: { y: 9, near: ['.LLLL', 'LLLLL', 'LHHDD', 'wHDMD', 'WDMBM', '.MBhB', '..ll.'], far: ['LLLp', 'LLLL', 'HDDw', 'DMDW', 'MBM.', 'BhB.', 'll..'] },
  // 女：上揚眼（貓眼）：外眼角高、睫毛往上挑
  sharp: { y: 8, near: ['L....', 'pLLLL', '.LLLL', '.HHDD', 'wHDMD', '.DMBM', '..Bhl'], far: ['...L', 'LLLp', 'LLL.', 'HDD.', 'DMD.', 'MBl.', 'l...'] },
  // 女：下垂眼：睫毛往外下垂、眼皮蓋住一點瞳孔（溫柔）
  droopy: { y: 9, near: ['..LLL', '.LLLL', 'LwwDD', 'LHHDM', 'wHMBM', '.DBhB', '..ll.'], far: ['LLL.', 'LLLL', 'DwwL', 'HDML', 'MBM.', 'Bh..', 'l...'] },
  blink: { y: 12, near: ['L...L', '.LLL.'], far: ['L..L', '.LL.'] },
  happy: { y: 11, near: ['.LLL.', 'L...L'], far: ['LLL.', '...L'] },
  hurt: { y: 10, near: ['LL...', '..LLL', '.LL..', 'L....'], far: ['..LL', 'LL..', '.LL.', '...L'] },
  dead: { y: 10, near: ['L...L', '.L.L.', '..L..', '.L.L.', 'L...L'], far: ['L..L', '.LL.', '.LL.', 'L..L'] },
  // 往上看（爬繩）：瞳孔在上半、下面露出眼白
  up: { y: 8, near: ['.LLLL', 'LLLLL', 'LDHHD', 'WMHMD', 'WBMBW', '.WWW.', '..ll.'], far: ['LLLp', 'LLLL', 'DHHW', 'MDMW', 'BMW.', 'WW..', 'll..'] },
  // 用力（攀爬）：瞇起來
  effort: { y: 10, near: ['LL...', '.LLLL', '.DHDD', '..MBl'], far: ['..LL', 'LLL.', 'HDD.', 'Bl..'] },
  // 男：眼睛矮一列、上眼線平直、不翹睫毛、瞳孔比較小、高光一顆
  round_m: { y: 10, near: ['.LLLL', 'LHHDD', 'wHDMD', '.DMBM', '..ll.'], far: ['LLL.', 'HDDL', 'DMBw', 'MB..'] },
  sharp_m: { y: 10, near: ['LL...', '.LLLL', '.HHDD', '.HDMB', '..Bl.'], far: ['..LL', 'LLL.', 'HDD.', 'DMl.'] },
  droopy_m: { y: 10, near: ['..LLL', '.LLLL', 'LHHDD', '.HDMB', '..ll.'], far: ['LL..', 'LLLL', 'HDD.', 'DMB.'] },
  up_m: { y: 9, near: ['.LLLL', 'LLLLL', 'LDHHD', 'WMBMW', '.WWW.'], far: ['LLL.', 'LLLL', 'DHHW', 'MBMW'] },
  effort_m: { y: 11, near: ['LLL..', '.LLLL', '..DHD'], far: ['.LLL', 'LLL.', 'DH..'] },
  blink_m: { y: 12, near: ['L...L', '.LLL.'], far: ['L..L', '.LL.'] },
};
function eyeKind(a: Appearance, expr: Expr): string {
  const shape = (['round', 'sharp', 'droopy'][a.eyeShape] ?? 'round');
  const k = expr === 'normal' ? shape : expr;
  return a.body === 1 && EYES[`${k}_m`] ? `${k}_m` : k;
}
/** 眉毛（男生粗、女生細短；被瀏海蓋住的地方之後由瀏海蓋過去）：眼睛上方 */
export function brows(b: Bmp, a: Appearance, expr: Expr, ox: number, oy: number): void {
  if (expr === 'dead') return;
  const g = EYES[eyeKind(a, expr)], c = hairRamp(a.hairColor)[a.body === 1 ? 0 : 1];
  const angry = expr === 'effort' || expr === 'hurt', sad = a.eyeShape === 2 && expr === 'normal';
  const y = oy + Math.min(g.y, a.body === 1 ? 10 : 9) - 2;
  if (a.body === 1) {
    // 男：直眉（近側 5 格、遠側 3 格），內側一格加粗；上揚眼的眉尾往上、下垂眼的眉尾往下；用力時內側往下壓
    const tail = a.eyeShape === 1 ? -1 : a.eyeShape === 2 ? 1 : 0;
    for (let x = 8; x <= 12; x++) b.set(ox + x, y + (x <= 9 ? tail : 0) + (angry && x >= 11 ? 1 : 0), c);
    b.set(ox + 12, y - 1 + (angry ? 1 : 0), c);
    for (let x = 15; x <= 17; x++) b.set(ox + x, y + (x === 17 ? tail : 0) + (angry && x === 15 ? 1 : 0), c);
  } else {
    for (let x = 9; x <= 11; x++) b.set(ox + x, y + (angry && x === 11 ? 1 : 0) + (sad && x === 9 ? 1 : 0), c);
    b.set(ox + 16, y + (angry ? 1 : 0), c); b.set(ox + 17, y, c);
  }
}

function face(b: Bmp, a: Appearance, expr: Expr, ox: number, oy: number): void {
  const e = eyeRamp(a.eyes), sk = skinRamp(a.skin), male = a.body === 1;
  const g = EYES[eyeKind(a, expr)];
  const lash = hex('#1c1424');
  const pal: Record<string, RGB> = { L: lash, p: e[0], D: e[0], M: e[1], B: e[2], H: EYE_WHITE, h: EYE_WHITE, W: EYE_WHITE, w: hex('#b4b9c8'), l: sk[1] };
  grid(b, g.near, pal, ox + 8, oy + g.y);
  grid(b, g.far, pal, ox + 15, oy + g.y);
  const mY = male ? 17 : 16;
  // 鼻子：一格陰影
  b.set(ox + 18, oy + mY - 2, sk[2]);
  // 腮紅（每邊三格斜線點，閉眼開心時多一點）
  if ((a.blush || expr === 'happy') && expr !== 'dead') {
    const bl = BLUSH[a.skin] ?? BLUSH[1], by = male ? 15 : 15;
    b.set(ox + 8, oy + by, bl); b.set(ox + 10, oy + by, bl); b.set(ox + 9, oy + by, bl);
    b.set(ox + 17, oy + by, bl); b.set(ox + 18, oy + by, bl);
  }
  // 嘴
  if (expr === 'hurt' || expr === 'effort') {
    b.set(ox + 14, oy + mY, MOUTH); b.set(ox + 15, oy + mY, MOUTH); b.set(ox + 16, oy + mY, sk[1]);
    b.set(ox + 14, oy + mY + 1, TONGUE); b.set(ox + 15, oy + mY + 1, MOUTH);
  } else if (expr === 'happy') {
    b.set(ox + 14, oy + mY, MOUTH); b.set(ox + 15, oy + mY, MOUTH); b.set(ox + 16, oy + mY, MOUTH); b.set(ox + 15, oy + mY + 1, TONGUE);
  } else if (expr === 'dead') {
    b.set(ox + 14, oy + mY, sk[0]); b.set(ox + 15, oy + mY + 1, sk[0]); b.set(ox + 16, oy + mY, sk[0]);
  } else if (expr === 'up') {
    b.set(ox + 15, oy + mY, sk[0]); b.set(ox + 15, oy + mY + 1, sk[1]);
  } else {
    // 小嘴：一道深一階的短線，嘴角往上一格（微笑）
    b.set(ox + 15, oy + mY, sk[0]); b.set(ox + 14, oy + mY, sk[1]); b.set(ox + 16, oy + mY - 1, sk[1]);
  }
}

// ── 側面：頭頂髮量的遮罩 ─────────────────────────────────
/** 0 = 沒有、1 = 頭頂 / 前額上緣、2 = 鬢角（耳朵前）、3 = 後腦勺 */
function capMask(st: string, rows: readonly [number, number][], cov: boolean): (x: number, y: number) => number {
  const d = HAIR[st] ?? HAIR.bob;
  const k = cov ? 1 : d.vol;
  return (x, y) => {
    if (y < -4 || y > 21 || x < -4 || x > 21) return 0;
    const skull = inRows(rows, x, y);
    const cap = inCap(x, y, k);
    if (y < 3) return cap || skull ? 1 : 0;
    // 臉：前額以下、x ≥ 7 的頭型裡
    if (x >= 7) return (y < 4 && (cap || skull)) ? 1 : 0;
    if (d.ear && x >= 3 && x <= 6 && y >= 10 && y <= 13) return 0;
    if (x >= 4) return y < d.nearLock - 2 && (cap || skull) ? 2 : 0;
    // 後腦勺：下緣後角修圓（鮑伯往內收）
    if (y >= d.back) return 0;
    if (y >= d.back - 2 && x <= -1 + (y - (d.back - 3))) return 0;
    return cap || skull || (y >= 9 && x >= -1 && inCap(x, Math.min(y, 11), k * 1.05)) ? 3 : 0;
  };
}

/** 頭頂的打光：左上亮、右下暗；從頭旋（左上）放射的髮束暗縫；天使光環一圈斷續的高光 */
function capShade(x: number, y: number, h: RGB[]): RGB {
  const nx = (x + 0.5 - CAP.cx) / CAP.rx, ny = (y + 0.5 - CAP.cy) / CAP.ry;
  const d = Math.hypot(nx, ny);
  const v = 0.6 - 0.6 * (nx * 0.6 + ny * 0.8);
  // 天使光環：頭頂一圈細亮帶（左邊最亮），在兩處髮束縫斷開
  if (ny < -0.3 && d > 0.52 && d < 0.65 && x !== 6 && x !== 13) return x < 9 ? h[4] : h[3];
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
  const male = a.body === 1;
  const def = HAIR[st] ?? HAIR.bob;
  const P = (x: number, y: number): Pt => [ox + x, oy + y];
  // 臉：頭型 + 遠側臉頰 / 下巴陰影
  const skin = new Bmp(front.w, front.h);
  const rows = rowsOf(a), chin = rows.length - 1;
  for (let y = 0; y < rows.length; y++) {
    const [x0, x1] = rows[y];
    for (let x = x0; x <= x1; x++) {
      // 右緣（遠側臉頰）與下巴底下一圈陰影；臉頰鼓起處（近眼下方）一點亮部
      const edge = (x === x1 && y >= 6 && y <= chin - 2) || y === chin || (y === chin - 1 && (x === x0 || x >= x1 - 1));
      const hi = y >= 13 && y <= 14 && x >= 8 && x <= 10;
      skin.set(ox + x, oy + y, edge ? sk[2] : hi ? sk[4] : sk[3]);
    }
  }
  if (male) for (let x = rows[chin][0]; x <= rows[chin][1]; x++) skin.set(ox + x, oy + chin, sk[1]);
  // 脖子
  skin.rect(ox + (male ? 7 : 8), oy + rows.length, male ? 5 : 4, 2, sk[1]);
  // 耳朵
  if (def.ear) {
    grid(skin, ['.ss.', 'sSs.', 'sDs.', '.ss.'], { s: sk[3], S: sk[4], D: sk[2] }, ox + 3, oy + 10);
  }
  face(skin, a, o.expr, ox, oy);
  brows(skin, a, o.expr, ox, oy);
  o.trace?.push('face');

  // ── 頭髮 ──
  const mask = capMask(st, rows, cov.top);
  const hair = new Bmp(front.w, front.h);
  for (let y = -4; y <= 21; y++) for (let x = -4; x <= 21; x++) {
    const k = mask(x, y);
    if (!k) continue;
    let c: RGB;
    if (k === 1) c = capShade(x, y, h);
    else if (k === 2) c = y >= def.nearLock - 4 ? h[1] : x === 4 ? h[3] : h[2];
    else c = x <= 0 ? (y < 8 ? h[3] : h[2]) : y >= def.back - 2 ? h[0] : (x + y) % 5 === 0 ? h[1] : h[2];
    hair.set(ox + x, oy + y, c);
  }
  // 瀏海：一束一束蓋在額頭上（後面的先畫、前面的蓋上去：由左往右）
  const clump = (c: Clump, top: number): void => {
    const [x0, x1, tx0, ty0, k] = c, tx = tx0 + sw * 0.4, ty = (male && top < 0 ? Math.min(ty0, 9.6) : ty0) - lift;
    for (let x = x0; x <= x1; x++) {
      const bot = ty - Math.abs(x - tx) * k;
      for (let y = top; y <= Math.floor(bot); y++) {
        if (y < 3 ? !inCap(x, y, 1.02) : x > 19 && !inCap(x, y, 1.0) && !inRows(rows, x, y)) continue;
        const last = y > bot - 1;
        const c2 = y < 4 ? capShade(x, y, h) : last ? h[1] : x === x1 ? h[1] : x === x0 && y <= 6 && y < ty - 2 ? h[3] : h[2];
        hair.set(ox + x, oy + y, c2);
      }
    }
  };
  for (const c of BANGS[def.bang]) clump(c, -2);
  // 近側鬢角（耳朵前面垂下的一束）
  if (def.nearLock > 0) clump(def.ear ? [6, 8, 6.5, def.nearLock, 0.9] : [4, 7, 5, def.nearLock, 0.8], 2);
  // 瀏海下緣在額頭投下的陰影（額頭上、髮尖正下方那格）
  for (let y = 4; y <= 12; y++) for (let x = 7; x <= 19; x++) {
    if (!hair.on(ox + x, oy + y - 1) || hair.on(ox + x, oy + y)) continue;
    if (inRows(rows, x, y) && skin.on(ox + x, oy + y)) {
      const cur = skin.get(ox + x, oy + y);
      if (cur.join() === sk[3].join() || cur.join() === sk[4].join()) skin.set(ox + x, oy + y, sk[2]);
    }
  }

  // ── 髮型特色 ──
  const behind = new Bmp(back.w, back.h);
  const tie = clothRamp(a.color2);
  if (st === 'long' || st === 'hime') {
    // 直長髮：垂在背後到腰，四束（外側亮、內側暗、束縫深一階），尾端 V 字尖；走 / 跳時整束往後 / 往上飄
    const locks: [number, number, number, number][] = [[-3, 0, 24, -1.5], [0, 3, 26, 1.5], [2, 5, 25, 3.5], [4, 7, 22, 5.5]];
    for (const [x0, x1, tip0, tx] of locks) {
      const top = 6, tip = tip0 - lift * 7, len = tip - top;
      for (let y = top; y <= Math.ceil(tip); y++) {
        const t = Math.max(0, (y - top) / len), shift = Math.round((-sw * 3.2 - lift * 2.5) * t ** 1.4 + Math.sin(y * 0.5) * 0.4 * t);
        for (let x = x0; x <= x1; x++) {
          if (y > tip - Math.abs(x + 0.5 - tx) * 1.6) continue;
          const c = y > tip - 2 ? h[1] : x === x1 ? h[0] : x === x0 ? (y < 16 ? h[3] : h[2]) : (x === x0 + 1 && y >= 10 && y <= 13) ? h[3] : y > tip - 5 ? h[1] : h[2];
          behind.set(ox + x + shift, oy + y, c);
        }
      }
    }
    if (st === 'hime') {
      // 姬髮的側邊齊長髮（耳前一片直直切在下巴）
      for (let y = 6; y <= 17; y++) for (let x = 4; x <= 7; x++) hair.set(ox + x, oy + y, y === 17 ? h[1] : x === 4 ? h[3] : x === 7 ? h[1] : h[2]);
    }
  }
  if (st === 'ponytail') {
    // 高馬尾：從後腦勺頂綁起、往後甩下來（粗、有一個彎）
    const end: Pt = P(-6 - sw * 4 - lift * 2, 20 - lift * 9);
    strand(behind, P(1, 1), P(-9 - sw * 2, 0 - lift * 2), end, 6.4, 1.2, h, (t, s) => (t > 0.86 ? 1 : s < -0.35 ? 3 : s > 0.4 ? 0 : t < 0.2 ? 3 : 2));
    strand(behind, P(-1, 2), P(-6 - sw * 2, 4 - lift * 2), P(-4 - sw * 3 - lift, 16 - lift * 7), 3, 1, h, () => 1);
    strand(hair, P(1.4, 1.2), P(0.4, 1.6), P(0, 2.6), 3.6, 2.6, tie, (_t, s) => (s < 0 ? 4 : 2));
  }
  if (st === 'twintails') {
    // 雙馬尾：遠側（較暗、在後面）+ 近側；綁在頭頂兩側、垂到腰
    strand(behind, P(5, 0), P(-3 - sw * 2, -2 - lift * 2), P(-1 - sw * 4 - lift, 20 - lift * 8), 5, 1.2, darker(h));
    strand(behind, P(2, 3), P(-8 - sw * 2, 1 - lift * 2), P(-6 - sw * 5 - lift * 2, 23 - lift * 9), 6, 1.2, h, (t, s) => (t > 0.86 ? 1 : s < -0.35 ? 3 : s > 0.4 ? 0 : 2));
    strand(hair, P(2.6, 2.4), P(1.6, 2.6), P(1, 3.6), 3.6, 2.6, tie, (_t, s) => (s < 0 ? 4 : 2));
  }
  if (st === 'braid') {
    // 從近側鬢角垂到胸前的麻花辮：一節一節左右交錯
    const bx = ox + 6, by = oy + 12;
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
    disc(behind, ox + 11, oy - 1.6, 3.6, darker(h));
    disc(hair, ox + 3.4, oy + 0.6, 4, h);
    // 綁帶
    hair.set(ox + 5, oy + 3.6, tie[3]); hair.set(ox + 6, oy + 3, tie[4]); hair.set(ox + 7, oy + 2, tie[3]); hair.set(ox + 4, oy + 4, tie[2]);
  }
  if (st === 'spiky') {
    const sp: [Pt, Pt, number][] = [[[2, 1], [-4, -4], 5], [[6, -1], [4, -6], 4.6], [[11, -1], [12.5, -6], 4.2], [[15, 0], [19, -3], 3.6], [[0, 6], [-6, 4], 4.6], [[0, 10], [-5, 13], 3.8]];
    for (const [s, t, w] of sp.filter(([q]) => !cov.top || q[1] >= 6)) strand(hair, P(s[0], s[1]), P((s[0] + t[0]) / 2, (s[1] + t[1]) / 2 - 0.5), P(t[0] - sw, t[1] - lift), w, 0.6, h, (tt, ss) => (tt > 0.72 ? 1 : ss < -0.25 ? 3 : ss > 0.45 ? 1 : 2));
  }
  if (st === 'messy') {
    const sp: [Pt, Pt][] = [[[2, 0], [-1, -3]], [[7, -1], [7.5, -4]], [[12, -0.5], [15, -3]], [[-1, 5], [-4, 4]], [[0, 11], [-3, 15]], [[3, 14], [2, 17]]];
    for (const [s, t] of sp.filter(([q]) => !cov.top || q[1] >= 5)) strand(hair, P(s[0], s[1]), P((s[0] + t[0]) / 2, (s[1] + t[1]) / 2), P(t[0] - sw * 0.5, t[1] - lift * 0.5), 3.2, 0.6, h, (tt, ss) => (tt > 0.62 ? 1 : ss < 0 ? 3 : 2));
  }
  if (st === 'bob') {
    // 鮑伯：髮尾往內捲、下緣一排尖
    for (const [x, y] of [[-1, 16], [1, 17], [3, 16]] as Pt[]) { hair.set(ox + x, oy + y, h[1]); hair.set(ox + x, oy + y - 1, h[2]); }
  }
  // 呆毛
  if (a.ahoge && acc !== 'hood' && !cov.top) {
    strand(hair, P(9, -1), P(8 + sw * 0.5, -6 - lift), P(12.5, -5.5 - lift), 2.2, 0.8, h, (t) => (t < 0.45 ? 3 : t > 0.85 ? 1 : 2));
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
  if (a.glasses) glasses(front, a, ox, oy);
  o.trace?.push('frontAcc');
  if (o.face) for (let i = 0; i < skin.px.length; i++) { const v = skin.px[i]; if (v >>> 24 && front.px[i] === v) o.face.px[i] = v; }
  behind.selOutline();
  back.blit(behind, 0, 0);
}

function sweat(b: Bmp, x: number, y: number): void {
  b.set(x, y, SWEAT[2]); b.set(x, y + 1, SWEAT[1]); b.set(x - 1, y + 1, SWEAT[1]); b.set(x, y + 2, SWEAT[0]); b.set(x - 1, y + 2, SWEAT[1]);
}

function glasses(b: Bmp, a: Appearance, ox: number, oy: number): void {
  const g = GLASSES, y0 = a.body === 1 ? 9 : 9;
  // 近側鏡框（6×6）+ 遠側鏡框（窄）+ 鼻橋 + 鏡腳
  for (let x = 7; x <= 13; x++) { b.set(ox + x, oy + y0, g); b.set(ox + x, oy + y0 + 6, g); }
  for (let y = y0; y <= y0 + 6; y++) { b.set(ox + 7, oy + y, g); b.set(ox + 13, oy + y, g); }
  for (let x = 15; x <= 19; x++) { b.set(ox + x, oy + y0, g); b.set(ox + x, oy + y0 + 6, g); }
  for (let y = y0; y <= y0 + 6; y++) b.set(ox + 15, oy + y, g);
  b.set(ox + 14, oy + y0 + 1, g);
  for (let x = 4; x <= 6; x++) b.set(ox + x, oy + y0 + 1, g);
  // 鏡片反光
  b.set(ox + 12, oy + y0 + 1, hex('#ffffff')); b.set(ox + 11, oy + y0 + 2, hex('#cceaf8'));
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
    if (st === 'twintails') { bow(b, ox + 2, oy + 2, r); return; }
    if (st === 'ponytail') { bow(b, ox + 0, oy + 1, r); return; }
    if (st === 'odango') { bow(b, ox + 6, oy + 3, r); return; }
    bow(b, ox + 4, oy, r, true);
  } else if (acc === 'catears') {
    const s = new Bmp(b.w, b.h), c = clothRamp(a.color2), pink = hex('#ffc8dc');
    // 髮箍
    for (const [x, y] of [[3, 1], [4, 0], [5, -1], [6, -1], [7, -2], [8, -2], [9, -2], [10, -2], [11, -2], [12, -1], [13, -1]] as Pt[]) s.set(ox + x, oy + y, c[2]);
    grid(s, ['...e', '..ee', '.epe', 'eppe', 'eEee'], { e: c[3], E: c[4], p: pink }, ox + 3, oy - 6);
    grid(s, ['e...', 'ee..', 'epe.', 'eeee'], { e: c[2], p: pink }, ox + 11, oy - 5);
    s.selOutline();
    b.blit(s, 0, 0);
  } else if (acc === 'clip') {
    const s = new Bmp(b.w, b.h), y = hex('#ffd86a'), w = hex('#fff4c0'), o = hex('#e8701c');
    grid(s, ['..y..', '.yyy.', 'ywWyo', '.yoy.', '.o.o.'], { y, w, W: hex('#ffffff'), o }, ox + 5, oy + 2);
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
  const opening = (x: number, y: number): boolean => view === 'side' ? x >= 8 && y >= 4 && y <= 19 : false;
  for (let y = -3; y <= 20; y++) for (let x = -3; x <= 21; x++) {
    const nx = (x + 0.5 - CAP.cx) / 11.4, ny = (y + 0.5 - 8.8) / 11;
    if (nx * nx + ny * ny > 1 || opening(x, y)) continue;
    if (view === 'side' && y > 16 && x > 7) continue;
    const rim = view === 'side' && (opening(x + 1, y) || opening(x, y + 1) || opening(x + 1, y + 1));
    const v = -(nx * 0.55 + ny * 0.85);
    head.set(ox + x, oy + y, rim ? c[4] : v > 0.45 ? c[4] : v > -0.25 ? c[3] : v > -0.6 ? c[2] : c[1]);
  }
  // 帽沿內側陰影（開口邊緣往內一格）
  for (let y = 4; y <= 15; y++) if (head.on(ox + 7, oy + y)) head.set(ox + 8, oy + y, c[1]);
  // 帽尖垂在後面
  strand(behind, [ox - 1, oy + 6], [ox - 6, oy + 10], [ox - 5, oy + 17], 4.4, 1.5, c, (t, s) => (t > 0.8 ? 1 : s < -0.3 ? 3 : 2));
}


export function drawHead(back: Bmp, front: Bmp, ox: number, oy: number, o: HeadOpts): void {
  sideHead(back, front, o, ox, oy);
}
