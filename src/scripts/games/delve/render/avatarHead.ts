// avatarHead.ts — 角色的頭（純 Bmp，無 DOM）：日系 Q 版像素人的大頭，真正的 3/4 轉頭（面向右；面向左由繪製時鏡像）。
//   頭 26×22（區域座標 x 0..25、y 0..21）：臉只佔前面（右邊）約 6 成，後半部是一大團頭髮；
//   前眼靠在臉的前緣、後眼比較窄，靠近頭的中線；近側臉頰在下前方鼓出來、下巴尖偏前。
//   頭髮是整個剪影的主體：蓬、輪廓不規則、邊緣一撮一撮的毛尖；4–5 階明暗 + 斜的高光帶；
//   描邊是「內描邊」：剪影最外一圈換成同色系的深色，受光面（上 / 前）用中間色、背光面（下 / 後）用最深色，轉角用中間色反鋸齒。
//   眼睛用角色的瞳色（上眼瞼一道深線、虹膜上深下淺、白色高光），張開的紅嘴在臉的前下方，前眼下面一抹粉色腮紅。
//   back 圖層：畫在身體後面的頭髮（後頸的頭髮、長髮、馬尾、雙馬尾、遠側丸子、兜帽尖）；front 圖層：頭、臉、瀏海、鬢髮、飾品。
//   座標：(ox, oy) = 區域原點在畫布上的位置。光從前上方（右上）來。
import { Bmp, hex, luma, type RGB } from './pixel';
import type { Appearance } from '../engine/appearance';
import { HAIR_STYLES, ACCESSORIES } from '../engine/appearance';
import type { DollPiece } from '../engine/doll';
import { R as CR } from './combatArt';
import { BRIM, CAP, HAT_HIDES_TOP, armorSet, hatArt, helmetArt, inCap, lookId } from './avatarGear';
import { BLUSH, EYE_WHITE, GLASSES, GOLD, LASH, MOUTH, MOUTH_RED, SWEAT, TONGUE, clothRamp, darker, eyeRamp, hairRamp, skinRamp } from './avatarPalette';
export { CAP, inCap };

export type Expr = 'normal' | 'blink' | 'hurt' | 'effort' | 'dead' | 'happy' | 'up';
/** 頭髮的動態：swing = 往後甩（−1..1，往後 = 往左）、lift = 往上飄（0..1：跳 / 掉落 / 水中）、bob = 上下彈（px） */
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
  /** 臉 / 眼睛往面向的方向多偏幾格（走路 / 揮擊時更看得出朝向） */
  look?: number;
}

/** 頭的大小（區域座標） */
export const HEAD_W = 24, HEAD_H = 22;
/** 眼睛：前眼（靠臉的前緣）/ 後眼（靠頭的中線）的左上角、眼睛最上一列 */
export const EYE_Y = 12, EYE_FRONT = 19, EYE_BACK = 13;
/** 舊名（其他模組 / 測試用）：近眼 = 前眼 */
export const EYE_NEAR = EYE_FRONT, EYE_FAR = EYE_BACK;

// ── 頭型：整顆頭（頭髮 + 臉）的剪影，每列 [左, 右]；後腦（左）圓又滿、前面（右）是臉 ─────────
const SKULL: readonly [number, number][] = [
  [7, 16], [4, 19], [3, 21], [2, 22], [1, 22], [1, 23], [0, 23], [0, 23], [0, 23], [0, 23], [0, 23], [0, 23],
  [0, 23], [0, 23], [0, 23], [0, 24], [0, 24], [1, 23], [1, 22], [2, 21], [4, 20], [7, 18],
];
/** 臉（膚色）的範圍：只在前面 6 成；近側臉頰在第 15–17 列往前鼓、下巴尖在前下方 */
const FACE_F: Record<number, [number, number]> = {
  8: [14, 21], 9: [13, 22], 10: [12, 22], 11: [12, 22], 12: [11, 22], 13: [11, 23], 14: [11, 23], 15: [11, 23],
  16: [11, 24], 17: [12, 23], 18: [12, 22], 19: [13, 21], 20: [14, 20], 21: [16, 19],
};
/** 男生：臉頰不那麼鼓、下巴寬一點 */
const FACE_M: Record<number, [number, number]> = { ...FACE_F, 15: [11, 23], 16: [11, 23], 17: [12, 22], 18: [12, 22], 19: [13, 21], 20: [14, 20], 21: [15, 19] };
const faceOf = (a: Appearance): Record<number, [number, number]> => (a.body === 1 ? FACE_M : FACE_F);

// ── 髮型定義 ─────────────────────────────────────────────
type Pt = [number, number];
/** 一束瀏海：x0..x1 欄、尖端 (tx, ty)；往兩側每欄往上縮 k 列 */
type Clump = [number, number, number, number, number];
type BangKind = 'tips' | 'blunt' | 'swept' | 'parted' | 'spiky' | 'messy';
/** 瀏海（只蓋在臉上：x ≥ 10）；尖端停在眼睛上面（眼睛在第 12 列），中間那束最長、蓋到兩眼之間 */
const BANGS: Record<BangKind, Clump[]> = {
  tips: [[10, 14, 12.5, 11, 1.4], [13, 18, 16, 12.6, 1.2], [17, 21, 19.5, 11, 1.5], [20, 23, 22.5, 12, 1.3]],
  blunt: [[10, 14, 12, 11, 0.2], [13, 17, 15.5, 11.4, 0.2], [17, 21, 19, 11, 0.2], [20, 23, 22, 11.4, 0.3]],
  swept: [[10, 15, 14.5, 11.2, 0.9], [14, 19, 18.5, 11.8, 0.8], [18, 23, 23, 12.2, 0.9]],
  parted: [[10, 14, 10.5, 11.6, 0.9], [12, 16, 13, 10.4, 0.9], [17, 21, 20.5, 10.6, 0.9], [20, 23, 23, 12, 1]],
  spiky: [[10, 13, 12, 10.6, 1.8], [12, 16, 15, 11.6, 1.9], [15, 20, 18.5, 10.4, 1.9], [19, 23, 22, 11.4, 1.8]],
  messy: [[10, 14, 11.5, 11, 1.4], [13, 17, 16, 12, 1.5], [16, 21, 18, 10.6, 1.5], [20, 23, 22.5, 11.6, 1.4]],
};
interface HairDef {
  bang: BangKind;
  /** 前鬢（臉前緣那撮）垂到第幾列；後頸的頭髮垂到第幾列（區域座標，> 21 = 垂到肩膀後面） */
  front: number; nape: number;
  /** 頭頂 / 後腦外緣的毛尖數量與長度 */
  tufts: number;
}
/** 後腦髮束分界線（二次曲線三點） */
const NAPE_LINES: readonly [Pt, Pt, Pt][] = [[[7, 6], [4, 11], [3, 17]], [[10, 8], [8.5, 13], [8, 19]], [[4, 9], [2, 13], [2, 16]]];
/** 高光短筆（區域座標） */
const SHINE: readonly (readonly Pt[])[] = [[[5, 4], [6, 4], [7, 5]], [[10, 2], [11, 2], [12, 3], [13, 3]], [[17, 3], [18, 4]]];
const HAIR: Record<string, HairDef> = {
  bob: { bang: 'tips', front: 17, nape: 24, tufts: 1 },
  twintails: { bang: 'tips', front: 15, nape: 24, tufts: 1 },
  ponytail: { bang: 'swept', front: 15, nape: 22, tufts: 1 },
  long: { bang: 'parted', front: 19, nape: 33, tufts: 1 },
  hime: { bang: 'blunt', front: 20, nape: 33, tufts: 0.5 },
  spiky: { bang: 'spiky', front: 13, nape: 22, tufts: 2 },
  messy: { bang: 'messy', front: 14, nape: 23, tufts: 1.6 },
  braid: { bang: 'tips', front: 15, nape: 24, tufts: 1 },
  odango: { bang: 'swept', front: 15, nape: 23, tufts: 0.8 },
};
const styleId = (a: Appearance): string => HAIR_STYLES[a.hair]?.id ?? 'bob';
const accId = (a: Appearance): string => ACCESSORIES[a.acc]?.id ?? 'none';

// ── 繪製用的小格子：每格記「材質 + 明暗階」，最後一起上色（描邊要看整個剪影） ────────────
const PAD = 12;
const NONE = 0, HAIR_M = 1, SKIN_M = 2, HAIR_D = 3;
class Paint {
  readonly w = HEAD_W + PAD * 2;
  readonly h = HEAD_H + PAD * 2 + 16;
  readonly mat = new Uint8Array(this.w * this.h);
  /** −1 = 還沒定（交給打光）；0..4 = 指定色階 */
  readonly lvl = new Int8Array(this.w * this.h).fill(-1);
  /** 瀏海 / 髮束的編號（同一束一起打光、束與束之間畫分界） */
  readonly clump = new Uint8Array(this.w * this.h);
  idx(x: number, y: number): number { const X = Math.round(x) + PAD, Y = Math.round(y) + PAD; return X >= 0 && Y >= 0 && X < this.w && Y < this.h ? Y * this.w + X : -1; }
  set(x: number, y: number, m: number, l = -1, c = 0): void { const i = this.idx(x, y); if (i >= 0) { this.mat[i] = m; this.lvl[i] = l; this.clump[i] = c; } }
  m(x: number, y: number): number { const i = this.idx(x, y); return i < 0 ? NONE : this.mat[i]; }
}

/** 粗細漸變的二次貝茲曲線（髮束 / 馬尾 / 刺 / 呆毛）：畫進 Paint（mat、可指定色階 shade(t, s)；s < 0 = 前 / 上 = 受光） */
function strand(p: Paint, p0: Pt, p1: Pt, p2: Pt, w0: number, w1: number, mat: number, cl: number, shade?: (t: number, s: number) => number): void {
  const len = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]) + Math.hypot(p2[0] - p1[0], p2[1] - p1[1]);
  const n = Math.max(8, Math.ceil(len * 3));
  for (let i = 0; i <= n; i++) {
    const t = i / n, u = 1 - t;
    const x = u * u * p0[0] + 2 * u * t * p1[0] + t * t * p2[0], y = u * u * p0[1] + 2 * u * t * p1[1] + t * t * p2[1];
    const dx = 2 * u * (p1[0] - p0[0]) + 2 * t * (p2[0] - p1[0]), dy = 2 * u * (p1[1] - p0[1]) + 2 * t * (p2[1] - p1[1]);
    const dl = Math.hypot(dx, dy) || 1, nx = dy / dl, ny = -dx / dl;
    const r = (w0 + (w1 - w0) * t) / 2;
    for (let yy = Math.floor(y - r - 1); yy <= Math.ceil(y + r + 1); yy++) for (let xx = Math.floor(x - r - 1); xx <= Math.ceil(x + r + 1); xx++) {
      const px = xx + 0.5 - x, py = yy + 0.5 - y;
      if (px * px + py * py > r * r + 0.12) continue;
      const s = r > 0 ? (px * nx + py * ny) / Math.max(0.5, r) : 0;
      p.set(xx, yy, mat, shade ? shade(t, s) : -1, cl);
    }
  }
}

/** 實心三角形（像素中心在裡面就塗）：毛尖 / 刺用乾淨的直邊，不是筆刷的鋸齒；lit = 靠 a 那半邊亮一階 */
function tri(p: Paint, a: Pt, b: Pt, c: Pt, mat: number, lit = false): void {
  const x0 = Math.floor(Math.min(a[0], b[0], c[0])), x1 = Math.ceil(Math.max(a[0], b[0], c[0]));
  const y0 = Math.floor(Math.min(a[1], b[1], c[1])), y1 = Math.ceil(Math.max(a[1], b[1], c[1]));
  const s = (p1: Pt, p2: Pt, x: number, y: number): number => (p2[0] - p1[0]) * (y - p1[1]) - (p2[1] - p1[1]) * (x - p1[0]);
  const mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2;
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    const px = x + 0.5, py = y + 0.5, d1 = s(a, b, px, py), d2 = s(b, c, px, py), d3 = s(c, a, px, py);
    if ((d1 < 0 || d2 < 0 || d3 < 0) && (d1 > 0 || d2 > 0 || d3 > 0)) continue;
    // 亮的那半邊：在「底邊中點 → 尖端」那條線靠 a 的一側
    const side = s([mx, my], c, px, py) * s([mx, my], c, a[0], a[1]);
    p.set(x, y, mat, lit && side > 0 ? 3 : -1, 1);
  }
}

/**
 * 頭髮的打光：外框距離（d）+ 位置 → 色階。h 5 階：[最暗（背光描邊）, 陰影, 底色, 亮部, 高光]
 *   最外一圈（d = 1）：上緣 / 前緣（受光）用陰影色、下緣 / 後緣用最暗；只碰到斜角的外圈用陰影色（反鋸齒）。
 *   內部：頭頂與前面亮、後腦下半與髮尾暗；兩道斜的高光帶（左上往右下，斷斷續續）。
 */
function shadeHair(p: Paint, mat: number, band: boolean): void {
  const W = p.w, H = p.h, out = (i: number, x: number, y: number): boolean => x < 0 || y < 0 || x >= W || y >= H || p.mat[i] === NONE;
  const isMat = (m: number): boolean => m === mat;
  const lf2 = (i: number): boolean => p.mat[i - 1] === NONE || p.mat[i - 2] === NONE;
  const dn2 = (i: number): boolean => p.mat[i + W] === NONE || p.mat[i + W * 2] === NONE;
  // 4 鄰距離（最多算到 3）
  const d = new Uint8Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x;
    if (!isMat(p.mat[i])) continue;
    const o4 = out(i - W, x, y - 1) || out(i + W, x, y + 1) || out(i - 1, x - 1, y) || out(i + 1, x + 1, y);
    d[i] = o4 ? 1 : 9;
  }
  for (let pass = 2; pass <= 3; pass++) for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
    const i = y * W + x;
    if (d[i] !== 9) continue;
    if (d[i - W] === pass - 1 || d[i + W] === pass - 1 || d[i - 1] === pass - 1 || d[i + 1] === pass - 1) d[i] = pass;
  }
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x;
    if (!isMat(p.mat[i]) || p.lvl[i] >= 0) continue;
    const X = x - PAD, Y = y - PAD;
    let l: number;
    if (d[i] === 1) {
      const up = out(i - W, x, y - 1), dn = out(i + W, x, y + 1), lf = out(i - 1, x - 1, y), rt = out(i + 1, x + 1, y);
      // 受光面（上緣、前上緣）：陰影色；背光面（下緣、後緣、後腦下半）：最暗
      l = (up && !lf && Y < 12) || (rt && Y < 10 && !dn) ? 1 : 0;
      // 斜角只露一點的外圈：反鋸齒（中間色）
      if (!up && !dn && !lf && !rt) l = 1;
    } else {
      // 體積：光從前上方來（頭頂偏前最亮、後腦下半最暗）
      const nx = (X - 12) / 12, ny = (Y - 8) / 11, L = 0.45 * nx - 0.9 * ny;
      l = L > 0.55 ? 3 : L > -0.8 ? 2 : 1;
      if (d[i] === 2 && (lf2(i) || dn2(i))) l = Math.min(l, 1);
      // 瀏海：每束的分界（右緣）暗、左緣亮
      // 頭髮貼著臉的那一格：瀏海下緣（臉的上面）最暗、臉後緣的鬢髮陰影
      if (p.mat[i + W] === SKIN_M) l = 0;
      else if (p.mat[i + 1] === SKIN_M && Y >= 10) l = 1;
      const c = p.clump[i];
      if (c >= 2 && c < 9) {
        // 一束亮、一束暗交錯；每束右緣（往下的分界）暗、左緣亮
        l = Y <= 9 ? (c % 2 ? 2 : 3) : 2;
        if (p.clump[i + 1] !== c && p.mat[i + 1] !== NONE) l = 1;
        else if (p.clump[i - 1] !== c && Y <= 10) l = Math.max(l, 3);
      }
    }
    p.lvl[i] = l;
  }
}

/** 膚色的打光：底色；瀏海正下方 / 被頭髮夾住的後緣一道陰影；下巴下緣深一階、前臉頰下半陰影 */
function shadeSkin(p: Paint): void {
  const W = p.w;
  for (let y = 1; y < p.h - 1; y++) for (let x = 1; x < W - 1; x++) {
    const i = y * W + x;
    if (p.mat[i] !== SKIN_M || p.lvl[i] >= 0) continue;
    const Y = y - PAD, up = p.mat[i - W], lf = p.mat[i - 1], dn = p.mat[i + W], rt = p.mat[i + 1];
    let l = 3;
    if (up === HAIR_M || lf === HAIR_M) l = 2;
    if (dn === NONE) l = Y >= 20 ? 1 : 2;
    if (rt === NONE && Y >= 16) l = 2;
    if (dn === HAIR_M && Y >= 19) l = 2;
    p.lvl[i] = l;
  }
}

/** 色階太黑（烏黑 / 深棕髮的最暗階）時，描邊改用陰影色：同色系的中暗色，不是一圈近黑 */
const soft0 = (r: RGB[]): RGB[] => (luma(r[0]) < 40 ? [r[1], ...r.slice(1)] : r);
function render(p: Paint, b: Bmp, ox: number, oy: number, ramps: Record<number, RGB[]>): void {
  for (let y = 0; y < p.h; y++) for (let x = 0; x < p.w; x++) {
    const i = y * p.w + x, m = p.mat[i];
    if (!m) continue;
    const r = soft0(ramps[m]);
    b.set(ox + x - PAD, oy + y - PAD, r[Math.max(0, Math.min(r.length - 1, p.lvl[i] < 0 ? 2 : p.lvl[i]))]);
  }
}

/** 字元格小圖（'.' 跳過） */
function grid(b: Bmp, rows: readonly string[], pal: Record<string, RGB>, ox: number, oy: number): void {
  for (let y = 0; y < rows.length; y++) for (let x = 0; x < rows[y].length; x++) {
    const c = pal[rows[y][x]];
    if (c) b.set(ox + x, oy + y, c);
  }
}

// ── 眼睛：前眼 2×4、後眼 2×3（男生兩眼都 2×3）──────────────
// L 上眼瞼（深線）、W 白高光、D 瞳色深、M 瞳色中、P 瞳色淺、k 閉眼 / 表情線
interface EyeDef { front: string[]; back: string[]; dy: number; }
const EYES: Record<string, EyeDef> = {
  round: { front: ['LL', 'WD', 'DM', 'MP'], back: ['LL', 'WD', 'MP'], dy: 0 },
  sharp: { front: ['.L', 'LL', 'WD', 'MP'], back: ['.L', 'LD', 'WP'], dy: 0 },
  droopy: { front: ['LL', 'LD', 'WM', 'MP'], back: ['LL', 'LD', 'WP'], dy: 0 },
  round_m: { front: ['LL', 'WD', 'MP'], back: ['LL', 'WD', 'MP'], dy: 1 },
  sharp_m: { front: ['.L', 'LD', 'WP'], back: ['.L', 'LD', 'WP'], dy: 1 },
  droopy_m: { front: ['LL', 'LD', 'WP'], back: ['LL', 'LD', 'MP'], dy: 1 },
  blink: { front: ['..', '..', 'kk', '..'], back: ['..', 'kk', '..'], dy: 0 },
  happy: { front: ['..', '.k', 'k.', '..'], back: ['.k', 'k.', '..'], dy: 0 },
  hurt: { front: ['k.', '.k', 'k.', '..'], back: ['k.', '.k', 'k.'], dy: 0 },
  dead: { front: ['k.k', '.k.', 'k.k'], back: ['k.k', '.k.', 'k.k'], dy: 0 },
  up: { front: ['WD', 'DM', 'MP', '..'], back: ['WD', 'MP', '..'], dy: -1 },
  effort: { front: ['..', 'kk', 'LL', '..'], back: ['..', 'kk', 'L.'], dy: 0 },
};
function eyeKind(a: Appearance, expr: Expr): string {
  const k = expr === 'normal' ? (['round', 'sharp', 'droopy'][a.eyeShape] ?? 'round') : expr;
  return a.body === 1 && EYES[k + '_m'] ? k + '_m' : k;
}
/** 眉毛：男生一道粗眉（深髮色），用力 / 受傷時往中間壓；女生沒有眉毛線，用力 / 受傷時露一點點 */
export function brows(b: Bmp, a: Appearance, expr: Expr, ox: number, oy: number, look = 0): void {
  if (expr === 'dead') return;
  const c = hairRamp(a.hairColor)[0];
  const angry = expr === 'effort' || expr === 'hurt';
  const y = oy + EYE_Y - 1 + (a.body === 1 ? 0 : -1);
  if (a.body === 1) {
    for (let k = 0; k < 3; k++) b.set(ox + EYE_FRONT - 1 + k + look, y + (angry && k === 0 ? 1 : 0), c);
    for (let k = 0; k < 2; k++) b.set(ox + EYE_BACK + k + look, y + (angry && k === 1 ? 1 : 0), c);
    return;
  }
  if (!angry) return;
  b.set(ox + EYE_FRONT + look, oy + EYE_Y - 1, c); b.set(ox + EYE_BACK + 1 + look, oy + EYE_Y - 1, c);
}

function face(b: Bmp, a: Appearance, expr: Expr, ox: number, oy: number, look: number): void {
  const e = eyeRamp(a.eyes), sk = skinRamp(a.skin), male = a.body === 1;
  const g = EYES[eyeKind(a, expr)];
  const pal: Record<string, RGB> = { L: LASH, W: EYE_WHITE, D: e[0], M: e[1], P: e[2], k: LASH };
  const y0 = oy + EYE_Y + g.dy;
  grid(b, g.front, pal, ox + EYE_FRONT + look - (g.front[0].length === 3 ? 1 : 0), y0);
  grid(b, g.back, pal, ox + EYE_BACK + look - (g.back[0].length === 3 ? 1 : 0), y0 + (g.front.length > g.back.length && g.back[0] !== '..' ? 0 : 0));
  // 女生：外眼角一格睫毛往外上翹（前眼往右、後眼往左）
  if (!male && (expr === 'normal' || expr === 'up')) {
    b.set(ox + EYE_FRONT + 2 + look, y0 - (g.dy < 0 ? 0 : 0), LASH);
    b.set(ox + EYE_BACK - 1 + look, y0, LASH);
  }
  // 腮紅：前眼正下方一抹（3 格）、後眼下方 2 格
  if ((a.blush || expr === 'happy' || expr === 'hurt') && expr !== 'dead') {
    const bl = BLUSH[a.skin] ?? BLUSH[1];
    const by = oy + EYE_Y + 5;
    for (const x of [EYE_FRONT - 1, EYE_FRONT, EYE_FRONT + 1, EYE_BACK - 1, EYE_BACK]) b.set(ox + x + look, by, bl);
  }
  // 嘴：前下方、兩眼之間偏前；張開的紅嘴
  const mx = ox + 16 + look, my = oy + EYE_Y + 6;
  if (expr === 'dead') { b.set(mx, my, sk[1]); b.set(mx + 1, my + 1, sk[1]); b.set(mx + 2, my, sk[1]); return; }
  if (expr === 'blink' && male) { b.set(mx, my, sk[1]); b.set(mx + 1, my, sk[1]); return; }
  if (expr === 'hurt' || expr === 'effort') {
    b.set(mx, my, MOUTH); b.set(mx + 1, my, MOUTH); b.set(mx + 2, my, MOUTH); b.set(mx, my + 1, MOUTH); b.set(mx + 1, my + 1, TONGUE); b.set(mx + 2, my + 1, MOUTH);
    return;
  }
  if (expr === 'up') { b.set(mx + 1, my, MOUTH); b.set(mx + 1, my + 1, MOUTH_RED); return; }
  // 開心張嘴：上排深紅、下排紅 + 粉紅舌頭（男生小一格）
  b.set(mx, my, MOUTH); b.set(mx + 1, my, MOUTH);
  b.set(mx, my + 1, MOUTH_RED); b.set(mx + 1, my + 1, male ? MOUTH_RED : TONGUE);
  if (!male) b.set(mx + 2, my, MOUTH_RED);
}

function headCover(o: HeadOpts): { top: boolean; helmet: boolean; hat: string | null } {
  const helmet = armorSet(o.gear) !== null, hat = lookId(o.gear, 'hat:');
  return { helmet, hat, top: helmet || (hat !== null && HAT_HIDES_TOP.has(hat)) };
}

/** 頭頂 / 後腦外緣的毛尖：沿著剪影往外戳出 1–3 格的小尖（一撮一撮的）；pts = [x, y, 往外的方向 dx, dy, 長度] */
const TUFTS: readonly [number, number, number, number, number][] = [
  [0, 11, -0.8, 0.6, 2.2], [0, 16, -0.6, 0.8, 2.2], [3, 19.5, -0.4, 1, 1.8],
];

function frontHead(back: Bmp, front: Bmp, o: HeadOpts, ox: number, oy: number): void {
  const cov = headCover(o);
  const a = o.app, h = hairRamp(a.hairColor), sk = skinRamp(a.skin), st = styleId(a), acc = o.gear ? 'none' : accId(a), m = o.motion;
  const sw = m.swing, lift = m.lift, look = Math.round(o.look ?? 0);
  const def = HAIR[st] ?? HAIR.bob;
  const FACE = faceOf(a);
  const p = new Paint();
  // 1. 整顆頭：先全部是頭髮，再挖出臉
  for (let y = 0; y < SKULL.length; y++) for (let x = SKULL[y][0]; x <= SKULL[y][1]; x++) p.set(x, y, HAIR_M);
  for (const k of Object.keys(FACE)) { const y = Number(k), [x0, x1] = FACE[y]; for (let x = x0 + look; x <= x1; x++) p.set(x, y, SKIN_M); }
  // 2. 瀏海：一束一束往下蓋住額頭，尖端停在眼睛上方（男生停在眉毛上）
  const clampY = a.body === 1 ? 10.6 : 12.6;
  BANGS[def.bang].forEach((c, ci) => {
    const [x0, x1, tx0, ty0, k] = c, tx = tx0 + sw * 0.4 + look * 0.5, ty = Math.min(ty0, clampY) - lift;
    for (let x = x0; x <= x1; x++) {
      const bot = ty - Math.abs(x - tx) * k;
      for (let y = 6; y <= Math.floor(bot); y++) if (p.m(x, y) !== NONE || y < 8) {
        const last = y > bot - 1;
        p.set(x, y, HAIR_M, last || x === x1 ? 1 : -1, ci + 2);
      }
    }
  });
  // 3. 前鬢：臉前緣的一撮（蓋住臉頰上半的前緣），尖端往下前收
  for (let y = 7; y <= def.front; y++) {
    const t = (y - 7) / Math.max(1, def.front - 7), x0 = Math.round(21.5 + t * 1.2 + sw * 0.3), x1 = 23;
    for (let x = x0; x <= x1; x++) p.set(x, y, HAIR_M, y >= def.front - 1 ? 1 : x === x0 ? 1 : -1, 9);
  }
  // 4. 毛尖
  if (!cov.top && st !== 'spiky') for (const [x, y, dx, dy, len] of TUFTS) {
    // 後腦外緣一撮一撮的毛尖：底邊貼在剪影上（沿著外緣 3 格）、尖端往外下戳
    const L = len * Math.min(1.3, def.tufts + 0.3), nx = -dy, ny = dx;
    tri(p, [x + nx * 1.6 + 1, y + ny * 1.6], [x - nx * 1.6 + 1, y - ny * 1.6], [x + dx * L - sw * 0.6, y + dy * L - lift * 0.5], HAIR_M);
  }
  // 5. 髮型特色（前面那層）
  if (st === 'spiky' && !cov.top) {
    // 刺蝟頭：頭頂幾根粗刺往後上方躺、後腦兩根往後戳（最高不超過頭頂 3 格）
    // 頭頂四根大刺往後上方、後腦一根往後；底邊都埋在頭裡，尖端最高到頭頂上 4 格
    const sp: [Pt, Pt, Pt][] = [[[1, 8], [8, 2], [-2, -1]], [[6, 3], [13, 1], [8, -3.5]], [[12, 1], [19, 3], [18, -3]], [[18, 3], [23, 8], [24.5, 1.5]], [[0, 9], [0, 15], [-3, 11]]];
    for (const [s0, s1, t] of sp) tri(p, s0, s1, [t[0] - sw, t[1] - lift], HAIR_M, true);
  }
  if (st === 'messy' && !cov.top) {
    const sp: [Pt, Pt][] = [[[8, 1], [5.5, -2.4]], [[15, 1], [17.5, -2.2]], [[2, 5], [-2, 3.5]], [[1, 12], [-2.5, 13]]];
    for (const [s, t] of sp) strand(p, s, [(s[0] + t[0]) / 2, (s[1] + t[1]) / 2], [t[0] - sw * 0.5, t[1] - lift * 0.5], 4, 0.7, HAIR_M, 0);
  }
  if (a.ahoge && acc !== 'hood' && !cov.top) strand(p, [12, 1], [11.5 + sw * 0.5, -2.8 - lift * 0.3], [15, -2.4], 2, 0.7, HAIR_M, 0);
  // 6. 打光 + 內描邊
  shadeHair(p, HAIR_M, true);
  // 高光帶：頭頂偏前兩三道斜的短筆（2–3 格，從後上往前下），旁邊亮一階
  for (const s of SHINE) s.forEach(([x, y], k) => {
    if (cov.top || p.m(x, y) !== HAIR_M) return;
    const i = p.idx(x, y);
    if (p.lvl[i] <= 0) return;
    p.lvl[i] = 4;
    const j = p.idx(x + 1, y + 1);
    if (k === s.length - 1 && j >= 0 && p.mat[j] === HAIR_M && p.lvl[j] >= 2) p.lvl[j] = 3;
  });
  // 後腦的髮束分界：兩三道往下彎的細暗線（一撮一撮，不是一整片）
  if (!cov.top) for (const ln of NAPE_LINES) for (let k = 0; k <= 10; k++) {
    const t = k / 10, u = 1 - t, x = u * u * ln[0][0] + 2 * u * t * ln[1][0] + t * t * ln[2][0], y = u * u * ln[0][1] + 2 * u * t * ln[1][1] + t * t * ln[2][1];
    const i = p.idx(x - sw * t, y);
    if (i >= 0 && p.mat[i] === HAIR_M && p.lvl[i] >= 2) p.lvl[i] = 1;
  }
  shadeSkin(p);
  // 頭頂最高到區域座標 −4：站著跳起來撞頭時毛尖 / 刺不會插進天花板
  const head = new Bmp(front.w, front.h);
  render(p, head, ox, oy, { [HAIR_M]: h, [SKIN_M]: sk });
  clipTop(head, oy - 4);
  o.trace?.push('face');
  // 臉（眼睛 / 嘴 / 腮紅 / 眉毛）
  const fx = new Bmp(front.w, front.h);
  fx.blit(head, 0, 0);
  face(fx, a, o.expr, ox, oy, look);
  brows(fx, a, o.expr, ox, oy, look);
  // 只在膚色上的那幾格（被瀏海蓋住的不畫）
  for (let y = oy + 8; y <= oy + 21; y++) for (let x = ox + 8; x <= ox + 27; x++) {
    const X = x - ox, Y = y - oy;
    if (p.m(X, Y) === SKIN_M) head.setRaw(x, y, fx.raw(x, y));
    else if (a.body === 1 && Y === EYE_Y - 1) head.setRaw(x, y, fx.raw(x, y));
  }
  o.trace?.push('frontHair');

  // ── 後面那層：後頸的頭髮 + 長髮 / 馬尾 / 雙馬尾（畫在身體後面）──
  const bp = new Paint();
  const tie = clothRamp(a.color2);
  // 後頸：從後腦下緣一路垂到肩膀後面，下緣一撮一撮的
  const nape = def.nape - lift * (def.nape > 26 ? 7 : 2);
  for (let y = 14; y <= Math.ceil(nape); y++) {
    const t = Math.max(0, (y - 18) / Math.max(1, nape - 18));
    const shift = Math.round((-sw * 3 - lift * 1.5) * t);
    const x0 = Math.round(-0.4 - t * 1.5) + shift, x1 = Math.round(12 - t * (def.nape > 26 ? 1 : 5)) + shift;
    for (let x = x0; x <= x1; x++) {
      // 髮尾：每 3 欄一撮尖
      if (y > nape - 2.5 && ((x - x0) % 3 !== 1 || y > nape - 0.5)) continue;
      bp.set(x, y, HAIR_D);
    }
  }
  if (st === 'long' || st === 'hime') {
    // 長髮：前面也垂一片到胸前（近側臉頰後面露出來）
    for (let y = 16; y <= Math.ceil(nape) - 3; y++) for (let x = 20; x <= 23; x++) if (!(y > nape - 5 && (x & 1))) bp.set(x - Math.round(sw * (y - 16) * 0.1), y, HAIR_D);
  }
  if (st === 'twintails') {
    // 雙馬尾：綁在頭頂兩側；後面（左）一大束、前面（右）較細、從臉頰後面露出來
    strand(bp, [2, 4], [-5.5 - sw * 1.2, 9 - lift * 2], [-2.5 - sw * 2.4 - lift, 30 - lift * 9], 7.6, 1.6, HAIR_D, 1, TAIL);
    strand(bp, [20, 4], [26 - sw, 9 - lift * 2], [24.5 - sw * 2 - lift, 28 - lift * 8], 5.8, 1.4, HAIR_D, 2, (t, s) => Math.max(1, TAIL(t, s) - 1));
  }
  if (st === 'ponytail') strand(bp, [2, 3], [-7 - sw * 1.2, 5 - lift * 2], [-4 - sw * 2.4 - lift * 1.2, 27 - lift * 10], 7.6, 1.6, HAIR_D, 1, TAIL);
  if (st === 'odango' && !cov.top) strand(bp, [20, 0.5], [21, 0], [21.5, 0.5], 7, 7, HAIR_D, 1);
  shadeHair(bp, HAIR_D, false);
  const behind = new Bmp(back.w, back.h);
  render(bp, behind, ox, oy, { [HAIR_D]: h });
  // 髮圈（雙馬尾 / 馬尾的根部）
  if (st === 'twintails') { tieBand(head, ox + 2, oy + 5, tie); tieBand(behind, ox + 20, oy + 5, darker(tie)); }
  if (st === 'ponytail') tieBand(head, ox + 1, oy + 4, tie);
  if (st === 'braid') braid(head, a, ox, oy, sw, lift);
  if (st === 'odango' && !cov.top) bun(head, ox + 4, oy + 1, h, tie);
  clipTop(behind, oy - 4);

  const gear = new Bmp(front.w, front.h);
  if (o.gear && armorSet(o.gear)) helmetArt(gear, o.gear, ox, oy, o.f ?? 0);
  if (!o.gear && acc === 'hood') hood(gear, behind, a, ox, oy);
  clipTop(gear, oy - 4);
  gear.softOutline(0.45);
  head.blit(gear, 0, 0);
  if (o.sweat) sweat(head, ox - 2, oy + 6);
  front.blit(head, 0, 0);
  if (cov.hat) hatArt(front, cov.hat, ox, oy, 'side', m.swing);
  if (o.gear) o.trace?.push('headgear');
  sideAcc(front, a, st, acc, ox, oy);
  if (a.glasses) glasses(front, ox + look, oy);
  o.trace?.push('frontAcc');
  if (o.face) for (let y = 0; y < front.h; y++) for (let x = 0; x < front.w; x++) {
    if (p.m(x - ox, y - oy) !== SKIN_M) continue;
    const v = front.raw(x, y);
    if (v >>> 24 && v === head.raw(x, y)) o.face.setRaw(x, y, v);
  }
  back.blit(behind, 0, 0);
}

/** 粗髮束（馬尾 / 雙馬尾）的打光：受光側（左上）一道亮、暗側兩階、髮尾暗；中間一道髮絲暗線 */
const TAIL = (t: number, s: number): number => (t > 0.86 ? 1 : s > 0.55 ? 1 : Math.abs(s - 0.15) < 0.12 && t > 0.25 ? 1 : s < -0.45 && t < 0.7 ? 3 : 2);
function tieBand(b: Bmp, x: number, y: number, r: RGB[]): void {
  b.set(x, y, r[3]); b.set(x + 1, y, r[4]); b.set(x, y + 1, r[2]); b.set(x + 1, y + 1, r[3]);
}
function bun(b: Bmp, cx: number, cy: number, h: RGB[], tie: RGB[]): void {
  for (let y = cy - 3; y <= cy + 3; y++) for (let x = cx - 3; x <= cx + 3; x++) {
    const d = Math.hypot(x + 0.5 - (cx + 0.5), y + 0.5 - (cy + 0.5));
    if (d > 3.3) continue;
    b.set(x, y, d > 2.6 ? (y > cy ? h[0] : h[1]) : x < cx && y < cy ? h[3] : h[2]);
  }
  b.set(cx - 1, cy - 1, h[4]);
  b.set(cx + 2, cy + 3, tie[3]); b.set(cx + 3, cy + 2, tie[2]);
}
function braid(b: Bmp, a: Appearance, ox: number, oy: number, sw: number, lift: number): void {
  const h = hairRamp(a.hairColor), tie = clothRamp(a.color2);
  const bx = ox + 23, by = oy + 15;
  for (let k = 0; k < 12; k++) {
    const y = by + k - Math.round(lift * k * 0.4), x = bx + Math.round((k / 12) * 1.5) - Math.round((sw + lift) * k * 0.2);
    const ph = k % 3;
    b.set(x - 1, y, ph === 0 ? h[3] : ph === 1 ? h[2] : h[1]);
    b.set(x, y, ph === 0 ? h[2] : ph === 1 ? h[3] : h[0]);
    b.set(x + 1, y, ph === 2 ? h[1] : h[0]);
  }
  const ty = by + 12 - Math.round(lift * 5), tx = bx + 1 - Math.round((sw + lift) * 2.4);
  b.set(tx - 1, ty, tie[3]); b.set(tx, ty, tie[4]); b.set(tx + 1, ty, tie[2]);
  b.set(tx, ty + 1, h[2]); b.set(tx - 1, ty + 1, h[1]); b.set(tx, ty + 2, h[0]);
}

/** 把 y 以上的像素清掉（美術高度收在碰撞盒裡） */
function clipTop(b: Bmp, y: number): void {
  for (let yy = 0; yy < Math.min(b.h, y); yy++) for (let x = 0; x < b.w; x++) b.clear(x, yy);
}

function sweat(b: Bmp, x: number, y: number): void {
  b.set(x, y, SWEAT[2]); b.set(x, y + 1, SWEAT[1]); b.set(x - 1, y + 1, SWEAT[1]); b.set(x, y + 2, SWEAT[0]); b.set(x - 1, y + 2, SWEAT[1]);
}

function glasses(b: Bmp, ox: number, oy: number): void {
  const g = GLASSES;
  for (const [ex, w] of [[EYE_FRONT, 2], [EYE_BACK, 2]] as [number, number][]) {
    for (let x = ex - 1; x <= ex + w; x++) { b.set(ox + x, oy + EYE_Y - 1, g); b.set(ox + x, oy + EYE_Y + 4, g); }
    for (let y = EYE_Y - 1; y <= EYE_Y + 4; y++) { b.set(ox + ex - 1, oy + y, g); b.set(ox + ex + w, oy + y, g); }
  }
  for (let x = EYE_BACK + 3; x < EYE_FRONT - 1; x++) b.set(ox + x, oy + EYE_Y, g);
  b.set(ox + EYE_FRONT, oy + EYE_Y, hex('#ffffff'));
}

function bow(b: Bmp, x: number, y: number, r: RGB[], big = false): void {
  const s = new Bmp(b.w, b.h);
  // 蝴蝶結：兩個圈（亮面在上）+ 中間的結（深一階）+ 兩條垂下的緞帶；內描邊
  if (big) grid(s, ['BBb.bBB', 'bbbkbbb', 'dbd.dbd', '.d...d.'], { b: r[3], B: r[4], k: r[1], d: r[2] }, x - 3, y - 2);
  else grid(s, ['Bb.bB', 'bbkbb', 'd.d.d'], { b: r[3], B: r[4], k: r[1], d: r[2] }, x - 2, y - 1);
  b.blit(s, 0, 0);
}

function sideAcc(b: Bmp, a: Appearance, st: string, acc: string, ox: number, oy: number): void {
  const r = clothRamp(a.color2);
  if (acc === 'ribbon') {
    if (st === 'twintails') { bow(b, ox + 2, oy + 4, r); return; }
    if (st === 'ponytail') { bow(b, ox + 1, oy + 3, r); return; }
    if (st === 'odango') { bow(b, ox + 8, oy + 1, r); return; }
    bow(b, ox + 7, oy + 0, r, true);
  } else if (acc === 'catears') {
    const s = new Bmp(b.w, b.h), c = clothRamp(a.color2), pink = hex('#ffc8dc');
    for (let x = 4; x <= 21; x++) s.set(ox + x, oy - 1 + (x < 7 || x > 18 ? 1 : 0), c[2]);
    grid(s, ['.e..', 'eee.', 'epee', 'eppe'], { e: c[3], E: c[4], p: pink }, ox + 4, oy - 3);
    grid(s, ['..e.', '.eee', 'eepe', 'eppe'], { e: c[2], p: pink }, ox + 15, oy - 3);
    s.softOutline();
    b.blit(s, 0, 0);
  } else if (acc === 'clip') {
    const s = new Bmp(b.w, b.h), y = hex('#ffd86a'), w = hex('#fff4c0'), o = hex('#e8701c');
    grid(s, ['..y..', '.yyy.', 'ywWyo', '.yoy.', '.o.o.'], { y, w, W: hex('#ffffff'), o }, ox + 20, oy + 4);
    s.softOutline();
    b.blit(s, 0, 0);
  } else if (acc === 'flower') {
    const s = new Bmp(b.w, b.h), p = hex('#ffc8dc'), pd = hex('#e890b0'), c = GOLD, lf = CR.green;
    grid(s, ['.pp.', 'pPcp', 'pccd', '.pd.', 'g..g'], { p, P: hex('#ffffff'), c, d: pd, g: lf[3] }, ox + 4, oy + 3);
    s.softOutline();
    b.blit(s, 0, 0);
  }
}

/** 兜帽：蓋住頭頂與後腦，前面開口露出臉與瀏海；帽沿亮一階、內側一道暗影；帽尖垂在後面 */
function hood(head: Bmp, behind: Bmp, a: Appearance, ox: number, oy: number): void {
  const c = clothRamp(a.color1);
  const opening = (x: number, y: number): boolean => {
    const nx = (x + 0.5 - 18) / 8.6, ny = (y + 0.5 - 15) / 9.4;
    return nx * nx + ny * ny <= 1 && y >= 5;
  };
  for (let y = -3; y <= 23; y++) for (let x = -2; x <= 27; x++) {
    const nx = (x + 0.5 - 12.4) / 14.2, ny = (y + 0.5 - 10.6) / 12.6;
    if (nx * nx + ny * ny > 1 || opening(x, y)) continue;
    const rim = opening(x + 1, y) || opening(x - 1, y) || opening(x, y + 1);
    const v = nx * 0.5 - ny * 0.85;
    head.set(ox + x, oy + y, rim ? c[4] : v > 0.45 ? c[4] : v > -0.25 ? c[3] : v > -0.6 ? c[2] : c[1]);
  }
  const s = new Bmp(behind.w, behind.h);
  // 帽尖：從後腦垂下來、越往下越細（貼著後頸，不往後戳）
  for (let k = 0; k < 8; k++) { const xa = Math.round(-1 - k * 0.35), xb = Math.round(4 - k * 0.6); for (let x = xa; x <= xb; x++) s.set(ox + x, oy + 14 + k, k === 7 ? c[1] : x === xa ? c[3] : c[2]); }
  s.softOutline();
  behind.blit(s, 0, 0);
}

export function drawHead(back: Bmp, front: Bmp, ox: number, oy: number, o: HeadOpts): void {
  frontHead(back, front, o, ox, oy);
}
export { BRIM };
