// avatarHead.ts — 角色的頭（純 Bmp，無 DOM）：日系 Q 版像素人的大頭，真正的 3/4 轉頭（面向右；面向左由繪製時鏡像）。
//   頭 24×20（區域座標 x 0..23、y 0..19）：臉只佔前面（右邊）約 6 成，後半部是一大團頭髮；
//   前眼 3×5 靠在臉的前緣、後眼 2×4 比較窄、靠近頭的中線；近側臉頰在下前方鼓出來、下巴尖偏前。
//   頭髮是整個剪影的主體：大塊的髮束——頭頂偏前一大片亮、後腦下半一大片暗、一道斜的高光帶；毛尖至少 2 格寬、沒有孤立的單像素。
//   外框：整個剪影最外一圈是明確的深色同色系線（頭髮 = 色階最深那階、膚色 = 深紅棕），剪影裡面的線條（瀏海下緣、髮束分界）是柔和的中間色。
//   眼睛用角色的瞳色（深色上眼瞼 + 外框、虹膜兩階、2 格白高光），張開的紅嘴在臉的前下方，前眼正下方一抹粉色腮紅。
//   back 圖層：畫在身體後面的頭髮（後頸的頭髮、長髮、馬尾、雙馬尾、遠側丸子、兜帽尖）；front 圖層：頭、臉、瀏海、鬢髮、飾品。
//   座標：(ox, oy) = 區域原點在畫布上的位置。光從前上方（右上）來。
import { Bmp, hex, type RGB } from './pixel';
import type { Appearance } from '../engine/appearance';
import { HAIR_STYLES, ACCESSORIES } from '../engine/appearance';
import type { DollPiece } from '../engine/doll';
import { R as CR } from './combatArt';
import { BRIM, CAP, HAT_HIDES_TOP, armorSet, hatArt, helmetArt, inCap, lookId } from './avatarGear';
import { BLUSH, EYE_WHITE, GLASSES, GOLD, LASH, MOUTH, MOUTH_RED, SWEAT, TONGUE, clothRamp, eyeRamp, hairRamp, skinRamp } from './avatarPalette';
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
export const HEAD_W = 24, HEAD_H = 20;
/** 眼睛：前眼（靠臉的前緣，3 寬）/ 後眼（靠頭的中線，2 寬）的左上角、眼睛最上一列 */
export const EYE_Y = 10, EYE_FRONT = 18, EYE_BACK = 12;
/** 嘴的左上角（兩眼之間偏前、臉的下半） */
export const MOUTH_X = 15, MOUTH_Y = 16;
/** 舊名（其他模組 / 測試用）：近眼 = 前眼 */
export const EYE_NEAR = EYE_FRONT, EYE_FAR = EYE_BACK;
/** 毛尖 / 刺最多高出頭頂幾格（整個人約 32–34 px 高） */
export const HAIR_TOP = -2;

// ── 頭型：整顆頭（頭髮 + 臉）的剪影，每列 [左, 右]；後腦（左）圓又滿、前面（右）是臉，臉頰在第 14–15 列往前鼓 ─────────
const SKULL: readonly [number, number][] = [
  [7, 15], [4, 18], [2, 20], [1, 21], [1, 21], [0, 22], [0, 22], [0, 22], [0, 22], [0, 22], [0, 22], [0, 22],
  [0, 22], [0, 22], [0, 23], [0, 23], [1, 22], [1, 21], [3, 20], [6, 18],
];
/** 臉（膚色）的範圍：只在前面 6 成；近側臉頰在第 14–15 列往前鼓、下巴尖在前下方 */
const FACE_F: Record<number, [number, number]> = {
  7: [13, 20], 8: [12, 21], 9: [11, 21], 10: [11, 21], 11: [10, 21], 12: [10, 22], 13: [10, 22], 14: [10, 23],
  15: [10, 23], 16: [11, 22], 17: [12, 21], 18: [13, 20], 19: [15, 18],
};
/** 男生：臉頰不那麼鼓、下巴寬一點 */
const FACE_M: Record<number, [number, number]> = { ...FACE_F, 14: [10, 22], 15: [10, 22], 16: [11, 22], 17: [12, 21], 18: [13, 20], 19: [14, 19] };
const faceOf = (a: Appearance): Record<number, [number, number]> => (a.body === 1 ? FACE_M : FACE_F);

// ── 髮型定義 ─────────────────────────────────────────────
type Pt = [number, number];
/** 一束瀏海：x0..x1 欄、尖端 (tx, ty)；往兩側每欄往上縮 k 列 */
type Clump = [number, number, number, number, number];
type BangKind = 'tips' | 'blunt' | 'swept' | 'parted' | 'spiky' | 'messy';
/** 瀏海（只蓋在臉上：x ≥ 9）；尖端停在眼睛上面（眼睛在第 10 列），中間那束最長、蓋到兩眼之間 */
const BANGS: Record<BangKind, Clump[]> = {
  tips: [[9, 13, 11.5, 9.4, 1.3], [12, 17, 15, 10.6, 1.1], [16, 20, 18, 9.2, 1.4], [19, 22, 21.5, 9.8, 1.2]],
  blunt: [[9, 13, 11, 9.2, 0.2], [12, 16, 14.5, 9.4, 0.2], [16, 20, 18, 9.2, 0.2], [19, 22, 21, 9.4, 0.3]],
  swept: [[9, 14, 13.5, 9.2, 0.9], [13, 18, 17.5, 9.8, 0.8], [17, 22, 21.5, 10, 0.9]],
  parted: [[9, 13, 9.5, 9.6, 0.9], [11, 15, 12, 8.6, 0.9], [16, 20, 19.5, 8.8, 0.9], [19, 22, 22, 10, 1]],
  spiky: [[9, 12, 11, 8.8, 1.6], [11, 15, 14, 9.8, 1.6], [14, 19, 17.5, 8.6, 1.6], [18, 22, 21, 9.4, 1.6]],
  messy: [[9, 13, 10.5, 9.2, 1.4], [12, 16, 15, 10.2, 1.4], [15, 20, 17, 8.8, 1.4], [19, 22, 21.5, 9.6, 1.4]],
};
interface HairDef {
  bang: BangKind;
  /** 前鬢（臉前緣那撮）垂到第幾列；後頸的頭髮垂到第幾列（區域座標，> 19 = 垂到肩膀後面） */
  front: number; nape: number;
  /** 後腦外緣的毛尖多不多（0 = 沒有） */
  tufts: number;
}
const HAIR: Record<string, HairDef> = {
  bob: { bang: 'tips', front: 15, nape: 21, tufts: 1 },
  twintails: { bang: 'tips', front: 13, nape: 21, tufts: 1 },
  ponytail: { bang: 'swept', front: 13, nape: 20, tufts: 1 },
  long: { bang: 'parted', front: 17, nape: 30, tufts: 0 },
  hime: { bang: 'blunt', front: 18, nape: 30, tufts: 0 },
  spiky: { bang: 'spiky', front: 11, nape: 20, tufts: 0 },
  messy: { bang: 'messy', front: 12, nape: 21, tufts: 1 },
  braid: { bang: 'tips', front: 13, nape: 21, tufts: 1 },
  odango: { bang: 'swept', front: 13, nape: 21, tufts: 1 },
};
const styleId = (a: Appearance): string => HAIR_STYLES[a.hair]?.id ?? 'bob';
const accId = (a: Appearance): string => ACCESSORIES[a.acc]?.id ?? 'none';

// ── 繪製用的小格子：每格記「材質 + 明暗階」，最後一起上色（外框要看整個剪影） ────────────
const PAD = 12;
const NONE = 0, HAIR_M = 1, SKIN_M = 2, HAIR_D = 3;
class Paint {
  readonly w = HEAD_W + PAD * 2;
  readonly h = HEAD_H + PAD * 2 + 16;
  readonly mat = new Uint8Array(this.w * this.h);
  /** −1 = 還沒定（交給打光）；0..4 = 指定色階 */
  readonly lvl = new Int8Array(this.w * this.h).fill(-1);
  /** 瀏海的編號（束與束之間畫分界） */
  readonly clump = new Uint8Array(this.w * this.h);
  idx(x: number, y: number): number { const X = Math.round(x) + PAD, Y = Math.round(y) + PAD; return X >= 0 && Y >= 0 && X < this.w && Y < this.h ? Y * this.w + X : -1; }
  set(x: number, y: number, m: number, l = -1, c = 0): void { const i = this.idx(x, y); if (i >= 0) { this.mat[i] = m; this.lvl[i] = l; this.clump[i] = c; } }
  m(x: number, y: number): number { const i = this.idx(x, y); return i < 0 ? NONE : this.mat[i]; }
}

/** 粗細漸變的二次貝茲曲線（馬尾 / 呆毛）：畫進 Paint（mat、可指定色階 shade(t, s)；s < 0 = 前 / 上 = 受光） */
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

/** 實心三角形（像素中心在裡面就塗）：毛尖 / 刺用乾淨的直邊；lit = 靠 a 那半邊亮一階 */
function tri(p: Paint, a: Pt, b: Pt, c: Pt, mat: number, lit = false): void {
  const x0 = Math.floor(Math.min(a[0], b[0], c[0])), x1 = Math.ceil(Math.max(a[0], b[0], c[0]));
  const y0 = Math.floor(Math.min(a[1], b[1], c[1])), y1 = Math.ceil(Math.max(a[1], b[1], c[1]));
  const s = (p1: Pt, p2: Pt, x: number, y: number): number => (p2[0] - p1[0]) * (y - p1[1]) - (p2[1] - p1[1]) * (x - p1[0]);
  const mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2;
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    const px = x + 0.5, py = y + 0.5, d1 = s(a, b, px, py), d2 = s(b, c, px, py), d3 = s(c, a, px, py);
    if ((d1 < 0 || d2 < 0 || d3 < 0) && (d1 > 0 || d2 > 0 || d3 > 0)) continue;
    const side = s([mx, my], c, px, py) * s([mx, my], c, a[0], a[1]);
    p.set(x, y, mat, lit && side > 0 ? 3 : -1, 1);
  }
}

/** 剪影去刺：只靠一個鄰居撐著的單像素尖（1 格寬的毛尖 / 斜線鋸齒）拿掉——毛尖至少 2 格寬 */
function despur(p: Paint, mat: number): void {
  const W = p.w;
  for (let pass = 0; pass < 2; pass++) {
    const kill: number[] = [];
    for (let y = 1; y < p.h - 1; y++) for (let x = 1; x < W - 1; x++) {
      const i = y * W + x;
      if (p.mat[i] !== mat) continue;
      const n = (p.mat[i - 1] ? 1 : 0) + (p.mat[i + 1] ? 1 : 0) + (p.mat[i - W] ? 1 : 0) + (p.mat[i + W] ? 1 : 0);
      if (n <= 1) kill.push(i);
    }
    for (const i of kill) { p.mat[i] = NONE; p.lvl[i] = -1; }
  }
}

/**
 * 頭髮的打光（大塊、乾淨）：h 5 階 = [外框, 陰影, 底色, 亮部, 高光]
 *   最外一圈（碰到透明）：外框色（只碰到斜角的那格用陰影色當反鋸齒）；
 *   內部：底色上一大片「頭頂偏前的亮部」、一大片「後腦下半的陰影」、一道斜的高光帶；瀏海下緣（貼著臉）陰影色；
 *   最後把和四鄰都不同的孤立單像素抹掉（1× 看起來才不會像雜訊）。
 */
function shadeHair(p: Paint, mat: number, band: boolean): void {
  const W = p.w, H = p.h;
  const outAt = (i: number, x: number, y: number): boolean => x < 0 || y < 0 || x >= W || y >= H || p.mat[i] === NONE;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x;
    if (p.mat[i] !== mat || p.lvl[i] >= 0) continue;
    const X = x - PAD, Y = y - PAD;
    const up = outAt(i - W, x, y - 1), dn = outAt(i + W, x, y + 1), lf = outAt(i - 1, x - 1, y), rt = outAt(i + 1, x + 1, y);
    if (up || dn || lf || rt) { p.lvl[i] = 0; continue; }
    const diag = outAt(i - W - 1, x - 1, y - 1) || outAt(i - W + 1, x + 1, y - 1) || outAt(i + W - 1, x - 1, y + 1) || outAt(i + W + 1, x + 1, y + 1);
    let l = 2;
    // 亮部：頭頂偏前一大片（橢圓）
    const lx = (X + 0.5 - 13.5) / 9.5, ly = (Y + 0.5 - 3.6) / 4.6;
    if (lx * lx + ly * ly <= 1) l = 3;
    // 陰影：後腦下半一大片（左下）+ 髮尾
    if (X + (Y - 8) * -0.55 < 5.5 && Y >= 8) l = 1;
    if (Y >= 17) l = 1;
    if (band) {
      // 高光帶：沿著頭頂的弧一道（2 格厚，中間不斷）
      const r = Math.hypot((X + 0.5 - 11.5) / 11, (Y + 0.5 - 9.6) / 9.6);
      if (Y >= 1 && Y <= 5 && X >= 7 && X <= 17 && r > 0.6 && r < 0.72) l = 4;
    }
    if (p.mat[i + W] === SKIN_M) l = 1;
    if (diag && l > 1) l = Math.min(l, 2);
    p.lvl[i] = l;
  }
  // 瀏海束與束之間：只在中間兩束的分界畫一道短的陰影（V 字縫）
  for (let y = 0; y < H; y++) for (let x = 1; x < W - 1; x++) {
    const i = y * W + x, c = p.clump[i];
    if (p.mat[i] !== mat || c < 2 || c > 8 || p.lvl[i] <= 0) continue;
    if (p.clump[i + 1] !== c && p.clump[i + 1] >= 2 && p.clump[i + 1] <= 8 && y - PAD >= 6) p.lvl[i] = 1;
  }
  // 孤立的單像素（和四鄰都不同色階）→ 換成鄰居最多的那階；外框不動
  const src = Int8Array.from(p.lvl);
  for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
    const i = y * W + x;
    if (p.mat[i] !== mat || src[i] <= 0) continue;
    const ns = [i - 1, i + 1, i - W, i + W].filter((j) => p.mat[j] === mat).map((j) => src[j]);
    if (ns.length === 4 && ns.every((v) => v !== src[i])) {
      const cnt = new Map<number, number>();
      for (const v of ns) if (v > 0) cnt.set(v, (cnt.get(v) ?? 0) + 1);
      let best = src[i], bn = 0;
      for (const [v, n] of cnt) if (n > bn) { best = v; bn = n; }
      p.lvl[i] = best;
    }
  }
}

/** 膚色的打光：底色；瀏海正下方 / 被頭髮夾住的後緣一道陰影；外圈（臉頰前緣、下巴）= 深紅棕外框 */
function shadeSkin(p: Paint): void {
  const W = p.w;
  for (let y = 1; y < p.h - 1; y++) for (let x = 1; x < W - 1; x++) {
    const i = y * W + x;
    if (p.mat[i] !== SKIN_M || p.lvl[i] >= 0) continue;
    const Y = y - PAD, up = p.mat[i - W], lf = p.mat[i - 1], dn = p.mat[i + W], rt = p.mat[i + 1];
    let l = 3;
    if (up === HAIR_M || lf === HAIR_M) l = 2;
    if (dn === HAIR_M && Y >= 17) l = 2;
    if (dn === NONE || rt === NONE || up === NONE) l = 0;
    // 前臉頰下半一點陰影（臉的體積）
    else if (rt !== NONE && p.mat[i + 2] === NONE && Y >= 16) l = 2;
    p.lvl[i] = l;
  }
}

function render(p: Paint, b: Bmp, ox: number, oy: number, ramps: Record<number, RGB[]>): void {
  for (let y = 0; y < p.h; y++) for (let x = 0; x < p.w; x++) {
    const i = y * p.w + x, m = p.mat[i];
    if (!m) continue;
    const r = ramps[m];
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

// ── 眼睛：前眼 3×5（女）/ 3×4（男）、後眼 2×4 / 2×3 ──────────────
// L 上眼瞼 / 外框（深）、W 白高光、D 瞳色深、M 瞳色中、k 閉眼 / 表情線
interface EyeDef { front: string[]; back: string[]; dy: number; }
const EYES: Record<string, EyeDef> = {
  round: { front: ['LLL', 'WDL', 'WMD', 'MMD', '.M.'], back: ['LL', 'WD', 'MD', 'MM'], dy: 0 },
  sharp: { front: ['..L', 'LLL', 'WMD', 'MMD', '.M.'], back: ['.L', 'LL', 'WD', 'MM'], dy: 0 },
  droopy: { front: ['LLL', 'LLD', 'WMD', 'MMD', '.MM'], back: ['LL', 'LD', 'WD', 'MM'], dy: 0 },
  round_m: { front: ['LLL', 'WDL', 'WMD', 'MMD'], back: ['LL', 'WD', 'MM'], dy: 1 },
  sharp_m: { front: ['..L', 'LLL', 'WMD', 'MMD'], back: ['.L', 'LD', 'WM'], dy: 1 },
  droopy_m: { front: ['LLL', 'LLD', 'WMD', 'MMM'], back: ['LL', 'LD', 'WM'], dy: 1 },
  blink: { front: ['...', '...', 'kkk', '...'], back: ['..', '..', 'kk'], dy: 0 },
  happy: { front: ['...', '.k.', 'k.k', '...'], back: ['..', 'kk', '..'], dy: 0 },
  hurt: { front: ['k.k', '.k.', 'k.k', '...'], back: ['k.', '.k', 'k.'], dy: 0 },
  dead: { front: ['k.k', '.k.', 'k.k'], back: ['k.k', '.k.', 'k.k'], dy: 0 },
  up: { front: ['WDL', 'WMD', 'MMD', '.M.'], back: ['WD', 'MD', 'MM'], dy: -1 },
  effort: { front: ['...', 'kkk', 'LLL', '...'], back: ['..', 'kk', 'LL'], dy: 0 },
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
  if (a.body === 1) {
    const y = oy + EYE_Y;
    for (let k = 0; k < 3; k++) b.set(ox + EYE_FRONT + k, y + (angry && k === 0 ? 1 : 0), c);
    for (let k = 0; k < 2; k++) b.set(ox + EYE_BACK + k + look, y + (angry && k === 1 ? 1 : 0), c);
    return;
  }
  if (!angry) return;
  b.set(ox + EYE_FRONT, oy + EYE_Y - 1, c); b.set(ox + EYE_BACK + 1 + look, oy + EYE_Y - 1, c);
}

function face(b: Bmp, a: Appearance, expr: Expr, ox: number, oy: number, look: number): void {
  const e = eyeRamp(a.eyes), sk = skinRamp(a.skin), male = a.body === 1;
  const g = EYES[eyeKind(a, expr)];
  const pal: Record<string, RGB> = { L: LASH, W: EYE_WHITE, D: e[0], M: e[1], k: LASH };
  const y0 = oy + EYE_Y + g.dy;
  // 前眼已經貼在臉的前緣：往前看（look）時只動後眼和嘴（前眼再往前會被前鬢 / 外框吃掉）
  grid(b, g.front, pal, ox + EYE_FRONT, y0);
  // 後眼：比前眼低半格（3/4 轉頭：遠側的眼睛比較窄、位置靠中線）
  grid(b, g.back, pal, ox + EYE_BACK + look - (g.back[0].length === 3 ? 1 : 0), y0 + (g.front.length - g.back.length > 0 && !male ? 1 : 0));
  // 女生：外眼角一格睫毛往外翹（前眼往右）
  if (!male && (expr === 'normal' || expr === 'up')) b.set(ox + EYE_FRONT + 3, y0, LASH);
  // 腮紅：前眼正下方一抹（3 格）、後眼下方 2 格
  if ((a.blush || expr === 'happy' || expr === 'hurt') && expr !== 'dead') {
    const bl = BLUSH[a.skin] ?? BLUSH[1];
    const by = oy + EYE_Y + 5;
    for (const x of [EYE_FRONT, EYE_FRONT + 1, EYE_FRONT + 2]) b.set(ox + x, by, bl);
    for (const x of [EYE_BACK - 1, EYE_BACK]) b.set(ox + x + look, by, bl);
  }
  // 嘴：前下方、兩眼之間偏前；張開的紅嘴
  const mx = ox + MOUTH_X + look, my = oy + MOUTH_Y;
  if (expr === 'dead') { b.set(mx, my, sk[1]); b.set(mx + 1, my + 1, sk[1]); b.set(mx + 2, my, sk[1]); return; }
  if (expr === 'blink' && male) { b.set(mx, my, MOUTH); b.set(mx + 1, my, MOUTH); return; }
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

/** 後腦外緣的毛尖（底邊 3 格寬貼在剪影上、尖端往外下戳）：[x, y, 往外的方向 dx, dy, 長度] */
const TUFTS: readonly [number, number, number, number, number][] = [
  [0, 9, -0.8, 0.6, 2], [0, 14, -0.6, 0.8, 2], [3, 17.5, -0.4, 1, 1.6],
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
  const clampY = a.body === 1 ? 9.2 : 10.6;
  BANGS[def.bang].forEach((c, ci) => {
    const [x0, x1, tx0, ty0, k] = c, tx = tx0 + sw * 0.4 + look * 0.5, ty = Math.min(ty0, clampY) - lift;
    for (let x = x0; x <= x1; x++) {
      const bot = ty - Math.abs(x - tx) * k;
      for (let y = 5; y <= Math.floor(bot); y++) if (p.m(x, y) !== NONE || y < 7) p.set(x, y, HAIR_M, -1, ci + 2);
    }
  });
  // 3. 前鬢：臉前緣的一撮（蓋住臉頰上半的前緣），尖端往下前收（2 格寬）
  for (let y = 6; y <= def.front; y++) {
    const t = (y - 6) / Math.max(1, def.front - 6), x0 = Math.min(22, Math.round(20.5 + t * 1.2 + sw * 0.3)) - (y >= def.front - 1 ? 0 : 0);
    for (let x = Math.min(x0, 21); x <= 22; x++) p.set(x, y, HAIR_M, -1, 9);
  }
  // 4. 毛尖（後腦外緣）
  if (!cov.top && def.tufts > 0) for (const [x, y, dx, dy, len] of TUFTS) {
    const L = len * def.tufts, nx = -dy, ny = dx;
    tri(p, [x + nx * 1.6 + 1, y + ny * 1.6], [x - nx * 1.6 + 1, y - ny * 1.6], [x + dx * L - sw * 0.6, y + dy * L - lift * 0.5], HAIR_M);
  }
  // 5. 髮型特色（前面那層）
  if (st === 'spiky' && !cov.top) {
    // 刺蝟頭：頭頂四根大刺往後上方、後腦一根往後；底邊埋在頭裡、尖端最高到頭頂上 2 格
    // （高度只到頭頂上 2 格：刺往後、往旁邊長，剪影才看得出刺）
    const sp: [Pt, Pt, Pt][] = [[[2, 6], [7, 1.5], [-3.5, 0]], [[5, 3], [11, 0.5], [5, -2.5]], [[10, 0.5], [16, 0.5], [12.5, -2.5]], [[15, 0.5], [20, 3], [20, -2.5]], [[19, 3], [22.5, 7], [25, 2.5]], [[0, 8], [0.5, 13], [-4, 9]], [[0, 12], [1, 16], [-3.5, 15]]];
    for (const [s0, s1, t] of sp) tri(p, s0, s1, [t[0] - sw, t[1] - lift], HAIR_M);
  }
  if (st === 'messy' && !cov.top) {
    const sp: [Pt, Pt, Pt][] = [[[5, 2.5], [10, 0.5], [5.5, -2]], [[13, 0.5], [18, 2], [18, -1.5]], [[0, 5], [2, 2], [-2.5, 2.5]], [[0, 10], [0, 14], [-2.5, 12]]];
    for (const [s0, s1, t] of sp) tri(p, s0, s1, [t[0] - sw * 0.5, t[1] - lift * 0.5], HAIR_M);
  }
  if (a.ahoge && acc !== 'hood' && !cov.top) strand(p, [11.5, 1], [11 + sw * 0.5, -2.2 - lift * 0.3], [14, -1.8], 2.6, 2, HAIR_M, 0);
  // 戴帽子 / 頭盔：帽沿以上的頭髮全部收起來（帽子蓋不到的地方也不會露出一塊頭髮）
  if (cov.top) for (let i = 0; i < p.mat.length; i++) { const Y = Math.floor(i / p.w) - PAD; if (Y < BRIM - 1 && p.mat[i] === HAIR_M) { p.mat[i] = NONE; p.lvl[i] = -1; } }
  despur(p, HAIR_M);
  // 頭頂最高到區域座標 HAIR_TOP（整個人 32–34 px 高）
  for (let i = 0; i < p.mat.length; i++) if (Math.floor(i / p.w) - PAD < HAIR_TOP) { p.mat[i] = NONE; p.lvl[i] = -1; }
  // 6. 打光 + 外框
  shadeHair(p, HAIR_M, true);
  shadeSkin(p);
  const head = new Bmp(front.w, front.h);
  render(p, head, ox, oy, { [HAIR_M]: h, [SKIN_M]: sk });
  o.trace?.push('face');
  // 臉（眼睛 / 嘴 / 腮紅 / 眉毛）：只畫在膚色上（被瀏海蓋住的不畫）
  const fx = new Bmp(front.w, front.h);
  fx.blit(head, 0, 0);
  face(fx, a, o.expr, ox, oy, look);
  brows(fx, a, o.expr, ox, oy, look);
  for (let y = oy + 6; y <= oy + 19; y++) for (let x = ox + 8; x <= ox + 26; x++) {
    const X = x - ox, Y = y - oy, i = p.idx(X, Y);
    if (p.m(X, Y) === SKIN_M && p.lvl[i] !== 0) head.setRaw(x, y, fx.raw(x, y));
    else if (a.body === 1 && Y === EYE_Y && p.m(X, Y) !== NONE) head.setRaw(x, y, fx.raw(x, y));
  }
  o.trace?.push('frontHair');

  // ── 後面那層：後頸的頭髮 + 長髮 / 馬尾 / 雙馬尾（畫在身體後面）──
  const bp = new Paint();
  const tie = clothRamp(a.color2);
  const nape = def.nape - lift * (def.nape > 24 ? 7 : 2);
  const long = def.nape > 24;
  for (let y = 12; y <= Math.ceil(nape); y++) {
    const t = Math.max(0, (y - 16) / Math.max(1, nape - 16));
    const shift = Math.round((-sw * 3 - lift * 1.5) * t);
    const x0 = Math.round(-0.4 - t * 1.2) + shift, x1 = Math.round(11 - t * (long ? 1 : 5)) + shift;
    for (let x = x0; x <= x1; x++) {
      // 髮尾：每 3 欄一撮尖（2 格寬）
      if (y > nape - 2 && ((x - x0) % 3 === 2 || y > nape - 0.5)) continue;
      // 長髮：後髮中間一道髮束分界（從頭往下的陰影）、外側亮
      bp.set(x, y, HAIR_D, long ? (x === x0 + 1 && y < nape - 3 ? 3 : (x - x0) % 5 === 3 ? 1 : -1) : -1);
    }
  }
  if (long) {
    // 長髮 / 姬髮：前面也垂一片到胸前（臉頰後面露出來），外側亮、內側暗
    for (let y = 14; y <= Math.ceil(nape) - 3; y++) for (let x = 19; x <= 22; x++) {
      if (y > nape - 5 && (x & 1)) continue;
      bp.set(x - Math.round(sw * (y - 14) * 0.1), y, HAIR_D, x === 22 ? 3 : x === 19 ? 1 : -1);
    }
  }
  if (st === 'twintails') {
    // 雙馬尾：綁在頭頂兩側；後面（左）一大束、前面（右）較細、從臉頰後面露出來（貼著頭，不會張太開）
    strand(bp, [2, 3], [-3.6 - sw * 1.2, 8 - lift * 2], [-1.5 - sw * 2.4 - lift, 27 - lift * 9], 6.2, 2.2, HAIR_D, 1, TAIL);
    strand(bp, [20, 3], [24 - sw, 8 - lift * 2], [23 - sw * 2 - lift, 25 - lift * 8], 4.8, 2, HAIR_D, 2, (t, s) => Math.max(1, TAIL(t, s) - 1));
  }
  if (st === 'ponytail') strand(bp, [2, 2], [-5 - sw * 1.2, 4 - lift * 2], [-3 - sw * 2.4 - lift * 1.2, 24 - lift * 10], 6.4, 2.2, HAIR_D, 1, TAIL);
  if (st === 'odango' && !cov.top && acc !== 'hood') strand(bp, [19, 0], [20, -0.5], [20.5, 0], 6, 6, HAIR_D, 1);
  if (cov.top) for (let i = 0; i < bp.mat.length; i++) { const Y = Math.floor(i / bp.w) - PAD; if (Y < BRIM - 1 && bp.mat[i] === HAIR_D) { bp.mat[i] = NONE; bp.lvl[i] = -1; } }
  despur(bp, HAIR_D);
  shadeHair(bp, HAIR_D, false);
  const behind = new Bmp(back.w, back.h);
  render(bp, behind, ox, oy, { [HAIR_D]: h });
  // 髮圈（雙馬尾 / 馬尾的根部）
  if (!cov.top) {
    if (st === 'twintails') { tieBand(head, ox + 2, oy + 4, tie); tieBand(behind, ox + 19, oy + 4, tie); }
    if (st === 'ponytail') tieBand(head, ox + 1, oy + 3, tie);
  }
  if (st === 'braid') braid(head, a, ox, oy, sw, lift);
  if (st === 'odango' && !cov.top && acc !== 'hood') bun(head, ox + 4, oy + 0, h, tie);

  const gear = new Bmp(front.w, front.h);
  if (o.gear && armorSet(o.gear)) helmetArt(gear, o.gear, ox, oy, o.f ?? 0);
  // 頭盔自己有內描邊（不再往外描一圈：外描會吃到前眼）；兜帽往外描
  if (!o.gear && acc === 'hood') { hood(gear, behind, a, ox, oy); gear.softOutline(0.45); }
  head.blit(gear, 0, 0);
  if (o.sweat) sweat(head, ox - 2, oy + 5);
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

/** 粗髮束（馬尾 / 雙馬尾）的打光：受光側（左上）一道亮、暗側一階、髮尾暗（大塊、不做細線） */
const TAIL = (t: number, s: number): number => (t > 0.86 ? 1 : s > 0.45 ? 1 : s < -0.4 && t < 0.7 ? 3 : 2);
function tieBand(b: Bmp, x: number, y: number, r: RGB[]): void {
  b.set(x, y, r[3]); b.set(x + 1, y, r[4]); b.set(x, y + 1, r[2]); b.set(x + 1, y + 1, r[3]);
}
function bun(b: Bmp, cx: number, cy: number, h: RGB[], tie: RGB[]): void {
  for (let y = cy - 3; y <= cy + 3; y++) for (let x = cx - 3; x <= cx + 3; x++) {
    const d = Math.hypot(x + 0.5 - (cx + 0.5), y + 0.5 - (cy + 0.5));
    if (d > 3.3) continue;
    b.set(x, y, d > 2.6 ? h[0] : x < cx && y < cy ? h[3] : h[2]);
  }
  b.set(cx - 1, cy - 1, h[4]); b.set(cx, cy - 1, h[4]);
  b.set(cx + 2, cy + 3, tie[3]); b.set(cx + 3, cy + 2, tie[2]);
}
function braid(b: Bmp, a: Appearance, ox: number, oy: number, sw: number, lift: number): void {
  const h = hairRamp(a.hairColor), tie = clothRamp(a.color2);
  const bx = ox + 21, by = oy + 13;
  for (let k = 0; k < 11; k++) {
    const y = by + k - Math.round(lift * k * 0.4), x = bx + Math.round((k / 11) * 1.5) - Math.round((sw + lift) * k * 0.2);
    const ph = k % 3;
    b.set(x - 1, y, h[0]);
    b.set(x, y, ph === 0 ? h[3] : ph === 1 ? h[2] : h[1]);
    b.set(x + 1, y, ph === 2 ? h[1] : h[2]);
    b.set(x + 2, y, h[0]);
  }
  const ty = by + 11 - Math.round(lift * 5), tx = bx + 1 - Math.round((sw + lift) * 2.4);
  b.set(tx - 1, ty, tie[3]); b.set(tx, ty, tie[4]); b.set(tx + 1, ty, tie[2]);
  b.set(tx, ty + 1, h[2]); b.set(tx - 1, ty + 1, h[1]); b.set(tx + 1, ty + 1, h[0]); b.set(tx, ty + 2, h[0]);
}

function sweat(b: Bmp, x: number, y: number): void {
  b.set(x, y, SWEAT[2]); b.set(x, y + 1, SWEAT[1]); b.set(x - 1, y + 1, SWEAT[1]); b.set(x, y + 2, SWEAT[0]); b.set(x - 1, y + 2, SWEAT[1]);
}

function glasses(b: Bmp, ox: number, oy: number): void {
  const g = GLASSES;
  for (const [ex, w] of [[EYE_FRONT, 3], [EYE_BACK, 2]] as [number, number][]) {
    for (let x = ex - 1; x <= ex + w; x++) { b.set(ox + x, oy + EYE_Y - 1, g); b.set(ox + x, oy + EYE_Y + 5, g); }
    for (let y = EYE_Y - 1; y <= EYE_Y + 5; y++) { b.set(ox + ex - 1, oy + y, g); b.set(ox + ex + w, oy + y, g); }
  }
  for (let x = EYE_BACK + 3; x < EYE_FRONT - 1; x++) b.set(ox + x, oy + EYE_Y + 1, g);
}

function bow(b: Bmp, x: number, y: number, r: RGB[], big = false): void {
  const s = new Bmp(b.w, b.h);
  // 蝴蝶結：兩個圈（亮面在上）+ 中間的結（深一階）+ 兩條垂下的緞帶
  if (big) grid(s, ['BBb.bBB', 'bbbkbbb', 'dbd.dbd', '.d...d.'], { b: r[3], B: r[4], k: r[1], d: r[2] }, x - 3, y - 2);
  else grid(s, ['Bb.bB', 'bbkbb', 'd.d.d'], { b: r[3], B: r[4], k: r[1], d: r[2] }, x - 2, y - 1);
  s.softOutline();
  b.blit(s, 0, 0);
}

function sideAcc(b: Bmp, a: Appearance, st: string, acc: string, ox: number, oy: number): void {
  const r = clothRamp(a.color2);
  if (acc === 'ribbon') {
    if (st === 'twintails') { bow(b, ox + 2, oy + 3, r); return; }
    if (st === 'ponytail') { bow(b, ox + 1, oy + 2, r); return; }
    if (st === 'odango') { bow(b, ox + 8, oy + 0, r); return; }
    bow(b, ox + 7, oy - 1, r, true);
  } else if (acc === 'catears') {
    // 貓耳髮箍：箍子順著頭頂、兩隻大耳朵（前面那隻在臉的上方、後面那隻在後腦）
    const s = new Bmp(b.w, b.h), c = clothRamp(a.color2), pink = hex('#ffc8dc');
    for (let x = 4; x <= 20; x++) s.set(ox + x, oy - (x < 7 || x > 17 ? 0 : 1), c[2]);
    grid(s, ['..e..', '.eee.', 'eepee', 'epppe'], { e: c[3], p: pink }, ox + 4, oy - 4);
    grid(s, ['..e..', '.eee.', 'eepee', 'epppe'], { e: c[2], p: pink }, ox + 14, oy - 4);
    s.softOutline();
    b.blit(s, 0, 0);
  } else if (acc === 'clip') {
    const s = new Bmp(b.w, b.h), y = hex('#ffd86a'), w = hex('#fff4c0'), o = hex('#e8701c');
    grid(s, ['..y..', '.yyy.', 'ywWyo', '.yoy.', '.o.o.'], { y, w, W: hex('#ffffff'), o }, ox + 19, oy + 3);
    s.softOutline();
    b.blit(s, 0, 0);
  } else if (acc === 'flower') {
    const s = new Bmp(b.w, b.h), p = hex('#ffc8dc'), pd = hex('#e890b0'), c = GOLD, lf = CR.green;
    grid(s, ['.pp.', 'pPcp', 'pccd', '.pd.', 'g..g'], { p, P: hex('#ffffff'), c, d: pd, g: lf[3] }, ox + 4, oy + 2);
    s.softOutline();
    b.blit(s, 0, 0);
  }
}

/** 兜帽：蓋住頭頂與後腦，前面開口露出臉與瀏海；帽沿亮一階、內側一道暗影；帽尖垂在後面 */
function hood(head: Bmp, behind: Bmp, a: Appearance, ox: number, oy: number): void {
  const c = clothRamp(a.color1);
  const opening = (x: number, y: number): boolean => {
    // 開口：整張臉（兩隻眼睛、嘴）都露出來，走路往前看時也是
    const nx = (x + 0.5 - 17) / 9.4, ny = (y + 0.5 - 13) / 9.4;
    return nx * nx + ny * ny <= 1 && y >= 4;
  };
  for (let y = -3; y <= 21; y++) for (let x = -2; x <= 26; x++) {
    const nx = (x + 0.5 - 11.6) / 13.6, ny = (y + 0.5 - 9.4) / 11.6;
    if (nx * nx + ny * ny > 1 || opening(x, y)) continue;
    const rim = opening(x + 1, y) || opening(x - 1, y) || opening(x, y + 1);
    const v = nx * 0.5 - ny * 0.85;
    head.set(ox + x, oy + y, rim ? c[4] : v > 0.45 ? c[4] : v > -0.25 ? c[3] : v > -0.6 ? c[2] : c[1]);
  }
  const s = new Bmp(behind.w, behind.h);
  // 帽尖：從後腦垂下來、越往下越細（貼著後頸，不往後戳）
  for (let k = 0; k < 7; k++) { const xa = Math.round(-1 - k * 0.35), xb = Math.round(4 - k * 0.6); for (let x = xa; x <= xb; x++) s.set(ox + x, oy + 13 + k, k === 6 ? c[1] : x === xa ? c[3] : c[2]); }
  s.softOutline();
  behind.blit(s, 0, 0);
}

export function drawHead(back: Bmp, front: Bmp, ox: number, oy: number, o: HeadOpts): void {
  frontHead(back, front, o, ox, oy);
}
export { BRIM };
