// avatarHead.ts — 角色的頭（純 Bmp，無 DOM）：日系 Q 版像素人的大頭，真正的 3/4 轉頭（面向右；面向左由繪製時鏡像）。
//   頭 22×18（區域座標 x 0..21、y 0..17）：臉只佔前面（右邊）約 6 成，後半部是一大團頭髮；
//   前眼 3×5 靠在臉的前緣、後眼 2×4 比較窄、靠近頭的中線；近側臉頰在下前方鼓出來、下巴尖偏前。
//   頭髮一束一束：瀏海 3–4 束（每束左亮右暗、尖端暗）、頭頂的亮部被 1–2 道髮束分線切開、每束各一筆高光；
//   後腦下半一大片暗。每束至少 2–3 格寬，毛尖至少 2 格寬、沒有孤立的單像素。
//   外框：整個剪影最外一圈是深色外框（頭髮 = 每種髮色專用的深棕 / 深紫，亮度約 2–3 成、不是純黑；膚色 = 深紅棕），
//   剪影裡面的線條（瀏海下緣、髮束分界）是柔和的中間色。
//   十三款髮型的剪影都不一樣：鮑伯（下緣往外翹）、雙馬尾、高馬尾、直長髮（前後都垂到腰）、姬髮（齊瀏海 + 切齊的鬢髮 + 平剪長髮）、
//   刺蝟頭、亂翹（頭頂和後腦四面亂翹）、側邊辮子、雙丸子、低馬尾（後頸綁起、貼背垂下）、狼尾（碎層次 + 後頸留長往後翹）、
//   大波浪捲（後腦蓬、外緣一波一波、前面一束 S 形捲髮）、側分長瀏海（頭頂一個弧、瀏海往前斜掃、後髮半長）。
//   頭飾（戴帽子 / 頭盔時不畫）：蝴蝶結、貓耳髮箍、星星髮夾、兜帽、小花、小皇冠、耳機、狐狸面具（斜掛在頭側）、髮簪（垂兩串金鍊）。
//   back 圖層：畫在身體後面的頭髮（後頸、長髮後片、馬尾、雙馬尾、遠側丸子、兜帽尖）；front 圖層：頭、臉、瀏海、鬢髮、前垂的長髮、飾品。
//   種族：精靈耳（膚色，從頭兩側的頭髮下面戳出來，眼睛到臉頰的高度、不高過帽沿：戴帽子也留著，戴兜帽時收在兜帽裡）、
//   貓耳（髮色 + 粉色內耳，頭頂兩隻）、龍角（象牙色，從頭頂往後彎）；貓耳 / 龍角戴帽子 / 頭盔 / 兜帽時收起來。
//   座標：(ox, oy) = 區域原點在畫布上的位置。光從前上方（右上）來。
import { Bmp, hex, type RGB } from './pixel';
import type { Appearance, RaceId } from '../engine/appearance';
import { HAIR_STYLES, ACCESSORIES } from '../engine/appearance';
import type { DollPiece } from '../engine/doll';
import { R as CR } from './combatArt';
import { BRIM, CAP, HAT_HIDES_TOP, armorSet, hatArt, helmetArt, inCap, lookId } from './avatarGear';
import { BLUSH, EAR_PINK, EYE_WHITE, GLASSES, GOLD, HORN, LASH, MOUTH, MOUTH_RED, SWEAT, TONGUE, clothRamp, eyeRamp, hairOutline, hairRamp, skinRamp } from './avatarPalette';
export { CAP, inCap };

export type Expr = 'normal' | 'blink' | 'hurt' | 'effort' | 'dead' | 'happy' | 'up';
/** 頭髮的動態：swing = 往後甩（−1..1，往後 = 往左）、lift = 往上飄（0..1：跳 / 掉落 / 水中）、bob = 上下彈（px） */
export interface HairMotion { swing: number; lift: number; bob?: number; }
export interface HeadOpts {
  app: Appearance; expr: Expr; motion: HairMotion;
  /** 種族（耳 / 角的畫法） */
  race: RaceId;
  /** 頭上的裝備（頭盔 / 時裝帽）；null = 用外觀的髮飾 */
  gear: DollPiece | null; view: 'side' | 'back';
  /** 影格（傳說裝備的閃光位置） */
  f?: number;
  /** 合成順序紀錄（測試用） */
  trace?: string[];
  /** 額頭冒汗（攀爬 / 攀上邊緣） */
  sweat?: boolean;
  /** 臉（沒被頭髮 / 帽子 / 飾品蓋住的膚色 + 眼睛）另外輸出一張 */
  face?: Bmp;
  /** 後眼 / 嘴往面向的方向多偏幾格（走路 / 揮擊時更看得出朝向） */
  look?: number;
}

/** 頭的大小（區域座標） */
export const HEAD_W = 22, HEAD_H = 18;
/** 眼睛：前眼（靠臉的前緣，3 寬）/ 後眼（靠頭的中線，2 寬）的左上角、眼睛最上一列 */
export const EYE_Y = 9, EYE_FRONT = 17, EYE_BACK = 11;
/** 嘴的左上角（兩眼之間偏前、臉的下半） */
export const MOUTH_X = 14, MOUTH_Y = 15;
/** 舊名（其他模組 / 測試用）：近眼 = 前眼 */
export const EYE_NEAR = EYE_FRONT, EYE_FAR = EYE_BACK;
/** 毛尖 / 刺最多高出頭頂幾格（整個人約 31–33 px 高） */
export const HAIR_TOP = -2;

// ── 頭型：整顆頭（頭髮 + 臉）的剪影，每列 [左, 右]；後腦（左）圓又滿、前面（右）是臉，臉頰在第 13–14 列往前鼓 ─────────
const SKULL: readonly [number, number][] = [
  [6, 14], [4, 17], [2, 19], [1, 20], [1, 20], [0, 21], [0, 21], [0, 21], [0, 21], [0, 21], [0, 21], [0, 21],
  [0, 21], [0, 22], [0, 22], [1, 21], [2, 20], [5, 17],
];
/** 臉（膚色）的範圍：只在前面 6 成；近側臉頰在第 13–14 列往前鼓、下巴尖在前下方 */
const FACE_F: Record<number, [number, number]> = {
  6: [12, 19], 7: [11, 20], 8: [10, 20], 9: [10, 20], 10: [9, 20], 11: [9, 21], 12: [9, 21], 13: [9, 22],
  14: [9, 22], 15: [10, 21], 16: [11, 19], 17: [13, 17],
};
/** 男生：臉頰不那麼鼓、下巴寬一點 */
const FACE_M: Record<number, [number, number]> = { ...FACE_F, 13: [9, 21], 14: [9, 21], 15: [10, 21], 16: [11, 20], 17: [12, 18] };
const faceOf = (a: Appearance): Record<number, [number, number]> => (a.body === 1 ? FACE_M : FACE_F);

// ── 髮型定義 ─────────────────────────────────────────────
type Pt = [number, number];
/** 一束瀏海：x0..x1 欄、尖端 (tx, ty)；往兩側每欄往上縮 k 列 */
type Clump = [number, number, number, number, number];
type BangKind = 'tips' | 'blunt' | 'swept' | 'parted' | 'spiky' | 'messy' | 'shag' | 'side';
/** 瀏海（只蓋在臉上：x ≥ 8）；尖端停在眼睛上面（眼睛在第 9 列），中間那束最長、蓋到兩眼之間 */
const BANGS: Record<BangKind, Clump[]> = {
  tips: [[8, 12, 10.5, 8.4, 1.2], [11, 15, 13.5, 9.6, 1], [14, 18, 16.5, 8.2, 1.3], [17, 21, 20, 8.8, 1.1]],
  blunt: [[8, 12, 10, 8.2, 0.1], [11, 15, 13, 8.3, 0.1], [14, 18, 16, 8.2, 0.1], [17, 21, 19.5, 8.3, 0.15]],
  swept: [[8, 13, 12.5, 8.2, 0.85], [12, 17, 16.5, 8.8, 0.75], [16, 21, 20.5, 9, 0.85]],
  parted: [[8, 12, 8.5, 8.6, 0.9], [10, 14, 11, 7.4, 0.9], [15, 19, 18.5, 7.6, 0.9], [18, 21, 21, 9, 1]],
  spiky: [[8, 11, 10, 7.8, 1.5], [10, 14, 13, 8.8, 1.5], [13, 18, 16.5, 7.6, 1.5], [17, 21, 20, 8.4, 1.5]],
  messy: [[8, 12, 9.5, 8.2, 1.3], [11, 15, 14, 9.2, 1.3], [14, 19, 16, 7.8, 1.3], [18, 21, 20.5, 8.6, 1.3]],
  /** 狼尾：碎碎的層次，五束細尖 */
  shag: [[8, 11, 9.5, 8.6, 1.6], [10, 13, 12, 9.4, 1.6], [12, 16, 14.5, 8, 1.5], [15, 18, 17, 9.2, 1.6], [18, 21, 20, 8.4, 1.4]],
  /** 側分：分線在後眼上方，後面那側短、一大片往前（面向那側）斜掃，尖端都偏前 */
  side: [[8, 10, 8.5, 6.6, 0.9], [10, 16, 15.5, 9.4, 0.45], [14, 21, 20.5, 9.6, 0.4]],
};
interface HairDef {
  bang: BangKind;
  /** 前鬢（臉前緣那撮）垂到第幾列；後頸的頭髮垂到第幾列（區域座標，> 17 = 垂到肩膀後面） */
  front: number; nape: number;
  /** 後腦外緣的毛尖多不多（0 = 沒有） */
  tufts: number;
}
const HAIR: Record<string, HairDef> = {
  bob: { bang: 'tips', front: 13, nape: 17, tufts: 0 },
  twintails: { bang: 'tips', front: 11, nape: 19, tufts: 1 },
  ponytail: { bang: 'swept', front: 11, nape: 18, tufts: 1 },
  long: { bang: 'parted', front: 13, nape: 29, tufts: 0 },
  hime: { bang: 'blunt', front: 17, nape: 29, tufts: 0 },
  spiky: { bang: 'spiky', front: 9, nape: 18, tufts: 0 },
  messy: { bang: 'messy', front: 10, nape: 19, tufts: 1.3 },
  braid: { bang: 'tips', front: 11, nape: 19, tufts: 1 },
  odango: { bang: 'swept', front: 11, nape: 19, tufts: 0.8 },
  lowpony: { bang: 'parted', front: 12, nape: 17, tufts: 0 },
  wolf: { bang: 'shag', front: 12, nape: 19, tufts: 1.6 },
  wavy: { bang: 'swept', front: 12, nape: 28, tufts: 0 },
  sidepart: { bang: 'side', front: 14, nape: 22, tufts: 0 },
};
const styleId = (a: Appearance): string => HAIR_STYLES[a.hair]?.id ?? 'bob';
const accId = (a: Appearance): string => ACCESSORIES[a.acc]?.id ?? 'none';
/** 頭頂的髮束分線（二次曲線三點；從頭頂往前下切開亮部） */
const PARTINGS: readonly [Pt, Pt, Pt][] = [[[8, 0], [9.5, 3], [10, 6]], [[13.5, 0], [14.5, 3], [15, 5.5]]];
/** 每束頭髮的高光短筆（2–3 格；區域座標） */
const SHINE: readonly (readonly Pt[])[] = [[[5, 3], [6, 3], [7, 4]], [[10, 2], [11, 2], [12, 2]], [[16, 2], [17, 2], [17, 3]]];

// ── 繪製用的小格子：每格記「材質 + 明暗階」，最後一起上色（外框要看整個剪影） ────────────
const PAD = 12;
const NONE = 0, HAIR_M = 1, SKIN_M = 2, HAIR_D = 3, EAR_M = 4, INNER_M = 5, HORN_M = 6;
/** 色階代碼：0..4 = 色階、OUT = 剪影外框 */
const OUT = 9;
class Paint {
  readonly w = HEAD_W + PAD * 2;
  readonly h = HEAD_H + PAD * 2 + 18;
  readonly mat = new Uint8Array(this.w * this.h);
  /** −1 = 還沒定（交給打光）；0..4 = 指定色階；OUT = 外框 */
  readonly lvl = new Int8Array(this.w * this.h).fill(-1);
  /** 髮束編號（瀏海 2..8、前鬢 9、前垂長髮 10）：束與束之間畫分界、每束自己的暗面 */
  readonly clump = new Uint8Array(this.w * this.h);
  idx(x: number, y: number): number { const X = Math.round(x) + PAD, Y = Math.round(y) + PAD; return X >= 0 && Y >= 0 && X < this.w && Y < this.h ? Y * this.w + X : -1; }
  set(x: number, y: number, m: number, l = -1, c = 0): void { const i = this.idx(x, y); if (i >= 0) { this.mat[i] = m; this.lvl[i] = l; this.clump[i] = c; } }
  m(x: number, y: number): number { const i = this.idx(x, y); return i < 0 ? NONE : this.mat[i]; }
  clearBelow(mat: number, pred: (X: number, Y: number) => boolean): void {
    for (let i = 0; i < this.mat.length; i++) {
      if (this.mat[i] !== mat) continue;
      const X = (i % this.w) - PAD, Y = Math.floor(i / this.w) - PAD;
      if (pred(X, Y)) { this.mat[i] = NONE; this.lvl[i] = -1; }
    }
  }
}

/** 粗細漸變的二次貝茲曲線（馬尾 / 呆毛 / 前垂的長髮）：畫進 Paint（mat、可指定色階 shade(t, s)；s < 0 = 前 / 上 = 受光） */
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
function tri(p: Paint, a: Pt, b: Pt, c: Pt, mat: number, lit = false, cl = 1): void {
  const x0 = Math.floor(Math.min(a[0], b[0], c[0])), x1 = Math.ceil(Math.max(a[0], b[0], c[0]));
  const y0 = Math.floor(Math.min(a[1], b[1], c[1])), y1 = Math.ceil(Math.max(a[1], b[1], c[1]));
  const s = (p1: Pt, p2: Pt, x: number, y: number): number => (p2[0] - p1[0]) * (y - p1[1]) - (p2[1] - p1[1]) * (x - p1[0]);
  const mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2;
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    const px = x + 0.5, py = y + 0.5, d1 = s(a, b, px, py), d2 = s(b, c, px, py), d3 = s(c, a, px, py);
    if ((d1 < 0 || d2 < 0 || d3 < 0) && (d1 > 0 || d2 > 0 || d3 > 0)) continue;
    const side = s([mx, my], c, px, py) * s([mx, my], c, a[0], a[1]);
    p.set(x, y, mat, lit ? (side > 0 ? 3 : 1) : -1, cl);
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
 * 頭髮的打光（一束一束）：h 5 階 = [深影, 陰影, 底色, 亮部, 高光]；剪影最外一圈 = 外框（OUT）
 *   內部：頭頂偏前一片亮部、被髮束分線切成 2–3 束；後腦下半一大片陰影；
 *   瀏海每一束：左邊（受光）亮、右邊 1–2 欄暗、尖端那列暗；瀏海下緣（貼著臉）陰影；
 *   最後把和四鄰都不同的孤立單像素抹掉。
 */
function shadeHair(p: Paint, mat: number, crown: boolean): void {
  const W = p.w, H = p.h;
  const outAt = (i: number, x: number, y: number): boolean => x < 0 || y < 0 || x >= W || y >= H || p.mat[i] === NONE;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x;
    if (p.mat[i] !== mat) continue;
    const up = outAt(i - W, x, y - 1), dn = outAt(i + W, x, y + 1), lf = outAt(i - 1, x - 1, y), rt = outAt(i + 1, x + 1, y);
    if (up || dn || lf || rt) { p.lvl[i] = OUT; continue; }
    if (p.lvl[i] >= 0) continue;
    const X = x - PAD, Y = y - PAD;
    let l = 2;
    if (crown) {
      // 亮部：頭頂偏前一大片（橢圓）
      const lx = (X + 0.5 - 12.5) / 9, ly = (Y + 0.5 - 3.2) / 4.2;
      if (lx * lx + ly * ly <= 1) l = 3;
      // 陰影：後腦外緣一道月牙（越往下越寬）+ 後頸；中間留底色（不是一整片暗的頭盔）
      if (Y >= 7 && X < 1.5 + (Y - 7) * 0.35) l = 1;
      if (Y >= 15 && X < 10) l = 1;
    }
    if (p.mat[i + W] === SKIN_M) l = 1;
    if (p.mat[i + 1] === SKIN_M && Y >= 9) l = 1;
    const c = p.clump[i];
    if (c >= 2 && c <= 10) {
      // 每束：左邊亮、右邊 1–2 欄暗（下一束蓋過來的影子）、尖端暗
      const nr = p.clump[i + 1] !== c && p.mat[i + 1] !== NONE, nr2 = p.clump[i + 2] !== c && p.mat[i + 2] !== NONE;
      const nl = p.clump[i - 1] !== c && p.mat[i - 1] !== NONE;
      // 束與束的分界用柔和的陰影階（不用最暗那階：淺髮色上不會變成一條條深色直線）；分界前一欄再暗一點點
      if (nr) l = 1; else if (nr2 && Y >= 6) l = Math.min(l, 2);
      else if (nl && Y <= 9) l = Math.max(l, 3);
      if (p.mat[i + W] === SKIN_M || p.mat[i + W * 2] === SKIN_M) l = Math.min(l, 1);
    }
    p.lvl[i] = l;
  }
  // 孤立的單像素（和四鄰都不同色階）→ 換成鄰居最多的那階；外框不動
  const src = Int8Array.from(p.lvl);
  for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
    const i = y * W + x;
    if (p.mat[i] !== mat || src[i] === OUT || src[i] < 0) continue;
    const ns = [i - 1, i + 1, i - W, i + W].filter((j) => p.mat[j] === mat && src[j] !== OUT).map((j) => src[j]);
    if (ns.length >= 3 && ns.every((v) => v !== src[i])) {
      const cnt = new Map<number, number>();
      for (const v of ns) cnt.set(v, (cnt.get(v) ?? 0) + 1);
      let best = src[i], bn = 0;
      for (const [v, n] of cnt) if (n > bn) { best = v; bn = n; }
      p.lvl[i] = best;
    }
  }
}

/** 後腦的髮束分線（二次曲線三點）：從頭頂往後下方順著後腦的弧，把底色那片切成兩束 */
const BACK_STRANDS: readonly [Pt, Pt, Pt][] = [[[8, 4.5], [4.8, 8], [5.2, 14]]];
/** 後腦的髮束分線：只畫在底色（不蓋亮部 / 陰影 / 瀏海），帽子 / 頭盔底下露出來的後腦也有 */
function backStrands(p: Paint, sw: number): void {
  for (const ln of BACK_STRANDS) for (let k = 0; k <= 14; k++) {
    const t = k / 14, u = 1 - t, x = u * u * ln[0][0] + 2 * u * t * ln[1][0] + t * t * ln[2][0] - sw * 0.4 * t, y = u * u * ln[0][1] + 2 * u * t * ln[1][1] + t * t * ln[2][1];
    const i = p.idx(x, y);
    if (i >= 0 && p.mat[i] === HAIR_M && p.lvl[i] === 2 && p.clump[i] < 2) p.lvl[i] = 1;
  }
}

/** 頭頂的髮束分線 + 每束一筆高光（打光之後再畫：線是連續的，不是零散的點） */
function crownDetail(p: Paint, sw: number, look: number): void {
  for (const ln of PARTINGS) for (let k = 0; k <= 12; k++) {
    const t = k / 12, u = 1 - t, x = u * u * ln[0][0] + 2 * u * t * ln[1][0] + t * t * ln[2][0] + sw * 0.3 * t, y = u * u * ln[0][1] + 2 * u * t * ln[1][1] + t * t * ln[2][1];
    const i = p.idx(x, y);
    if (i >= 0 && p.mat[i] === HAIR_M && p.lvl[i] !== OUT && p.clump[i] < 2) p.lvl[i] = 1;
  }
  for (const s of SHINE) s.forEach(([x, y]) => {
    const i = p.idx(x + Math.round(look * 0.5), y);
    if (i >= 0 && p.mat[i] === HAIR_M && p.lvl[i] >= 2 && p.lvl[i] !== OUT) p.lvl[i] = 4;
  });
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
    if (dn === HAIR_M && Y >= 15) l = 2;
    if (dn === NONE || rt === NONE || up === NONE) l = 0;
    else if (rt !== NONE && p.mat[i + 2] === NONE && Y >= 14) l = 2;
    p.lvl[i] = l;
  }
}

function render(p: Paint, b: Bmp, ox: number, oy: number, ramps: Record<number, RGB[]>, outs: Record<number, RGB>): void {
  for (let y = 0; y < p.h; y++) for (let x = 0; x < p.w; x++) {
    const i = y * p.w + x, m = p.mat[i];
    if (!m) continue;
    const r = ramps[m], l = p.lvl[i];
    b.set(ox + x - PAD, oy + y - PAD, l === OUT ? outs[m] : r[Math.max(0, Math.min(r.length - 1, l < 0 ? 2 : l))]);
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

/** 後腦外緣的毛尖（底邊貼在剪影上、尖端往外下戳）：[x, y, 往外的方向 dx, dy, 長度] */
const TUFTS: readonly [number, number, number, number, number][] = [
  [0, 8, -0.8, 0.6, 2], [0, 12, -0.6, 0.8, 2], [3, 15.5, -0.4, 1, 1.6],
];

// ── 種族：耳 / 角 ─────────────────────────────────────────
type Tri = readonly [Pt, Pt, Pt];
/** 像素中心在三角形裡面 */
function inTri([a, b, c]: Tri, x: number, y: number): boolean {
  const s = (p1: Pt, p2: Pt): number => (p2[0] - p1[0]) * (y + 0.5 - p1[1]) - (p2[1] - p1[1]) * (x + 0.5 - p1[0]);
  const d1 = s(a, b), d2 = s(b, c), d3 = s(c, a);
  return !((d1 < 0 || d2 < 0 || d3 < 0) && (d1 > 0 || d2 > 0 || d3 > 0));
}
function eachIn(t: Tri, fn: (x: number, y: number) => void): void {
  const xs = t.map((q) => q[0]), ys = t.map((q) => q[1]);
  for (let y = Math.floor(Math.min(...ys)); y <= Math.ceil(Math.max(...ys)); y++) for (let x = Math.floor(Math.min(...xs)); x <= Math.ceil(Math.max(...xs)); x++) if (inTri(t, x, y)) fn(x, y);
}
/**
 * 精靈耳（葉片形：兩個三角形拼成 [底邊上, 尖端, 下緣折點] + [底邊上, 下緣折點, 底邊下]）。
 * 後耳（左，大）從後腦的頭髮下面往後上方戳出去、前耳（右，小）從前鬢後面露出來；
 * 只長在頭髮 / 臉外面（底部藏在頭髮下）。尖端最高在第 6 列 = 帽沿（BRIM），戴帽子也不會高過帽沿。
 */
const ELF_EARS: readonly Tri[] = [
  [[0.5, 7.8], [-9, 5.8], [-5, 11.2]], [[0.5, 7.8], [-5, 11.2], [0.5, 13.6]],
  [[21.5, 7.8], [28.6, 5.8], [25.4, 10.6]], [[21.5, 7.8], [25.4, 10.6], [21.5, 12.4]],
];
function elfEars(p: Paint): void {
  for (const t of ELF_EARS) eachIn(t, (x, y) => { if (p.m(x, y) === NONE) p.set(x, y, EAR_M); });
  // 打光：外圈 = 膚色外框（和頭髮的交界也描）；上緣一道亮、下緣陰影、夠厚的地方中間一道內耳的凹（深影）
  const ear = (x: number, y: number): boolean => p.m(x, y) === EAR_M;
  const rim = (x: number, y: number): boolean => ear(x, y) && !(ear(x - 1, y) && ear(x + 1, y) && ear(x, y - 1) && ear(x, y + 1));
  const W = p.w;
  const lv: [number, number][] = [];
  for (let i = 0; i < p.mat.length; i++) {
    if (p.mat[i] !== EAR_M) continue;
    const x = (i % W) - PAD, y = Math.floor(i / W) - PAD;
    if (rim(x, y)) { lv.push([i, 0]); continue; }
    lv.push([i, rim(x, y - 1) ? 4 : rim(x, y + 1) ? 2 : ear(x, y - 2) && !rim(x, y - 2) && ear(x, y + 2) ? 1 : 3]);
  }
  for (const [i, l] of lv) p.lvl[i] = l;
}
/** 貓耳（髮色）：後面那隻在後腦上方、前面那隻在臉的上方；尖端最高到 −4（含外框，不高過碰撞盒）；內耳粉色。
 *  回傳耳朵佔的格子（區域座標；只算原本是空的、頭外面那幾格）：頭飾畫在這些格子後面 */
const CAT_EARS: readonly Tri[] = [[[1.2, 3.4], [8.8, 0.4], [2.6, -4.6]], [[10.8, 0.2], [18, 2.6], [15.6, -4.6]]];
function catEars(p: Paint): Pt[] {
  const cells: Pt[] = [];
  for (const t of CAT_EARS) {
    const cx = (t[0][0] + t[1][0] + t[2][0]) / 3, cy = (t[0][1] + t[1][1] + t[2][1]) / 3;
    // 內耳：同一個三角形往重心縮一半、往下挪一格
    const sh = ([x, y]: Pt): Pt => [cx + (x - cx) * 0.5, cy + (y - cy) * 0.5 + 0.6];
    const inner: Tri = [sh(t[0]), sh(t[1]), sh(t[2])];
    eachIn(t, (x, y) => {
      if (p.m(x, y) !== NONE) return;
      // 外側（後緣）暗一階、前緣受光
      p.set(x, y, HAIR_M, x + 0.5 < t[2][0] ? 2 : 3);
      cells.push([x, y]);
    });
    eachIn(inner, (x, y) => { if (p.m(x, y) === HAIR_M && y < 1) p.set(x, y, INNER_M, x + 0.5 < cx ? 0 : 1); });
  }
  return cells;
}
/** 龍角：[根, 彎, 尖, 根部粗細]；後面那支往後（左）上方伸出後腦外、前面那支越過頭頂往後彎；尖端最高到 −3（外框 −4） */
const HORNS: readonly [Pt, Pt, Pt, number][] = [[[4, 3], [-1.2, 2.4], [-1.8, -2.8], 4], [[15, 1.6], [13.2, -1.4], [10, -2.8], 3.4]];
function horns(b: Bmp, ox: number, oy: number): Bmp {
  const hp = new Paint();
  // 根部暗、上緣（受光）亮、下緣暗、兩道環紋；尖端最亮
  const shade = (t: number, s: number): number => (t < 0.22 ? (s < -0.3 ? 2 : 1) : (t > 0.36 && t < 0.44) || (t > 0.6 && t < 0.66) ? 1 : t > 0.84 ? 4 : s < -0.3 ? 3 : s > 0.35 ? 1 : 2);
  for (const [p0, p1, p2, w] of HORNS) strand(hp, p0, p1, p2, w, 1, HORN_M, 0, shade);
  const layer = new Bmp(b.w, b.h);
  render(hp, layer, ox, oy, { [HORN_M]: HORN }, { [HORN_M]: HORN[0] });
  layer.selOutline();
  b.blit(layer, 0, 0);
  return layer;
}

function frontHead(back: Bmp, front: Bmp, o: HeadOpts, ox: number, oy: number): void {
  const cov = headCover(o);
  const a = o.app, h = hairRamp(a.hairColor), ho = hairOutline(a.hairColor), sk = skinRamp(a.skin), st = styleId(a), acc = o.gear ? 'none' : accId(a), m = o.motion;
  const sw = m.swing, lift = m.lift, look = Math.round(o.look ?? 0);
  const def = HAIR[st] ?? HAIR.bob;
  const FACE = faceOf(a);
  const p = new Paint();
  // 1. 整顆頭：先全部是頭髮，再挖出臉
  for (let y = 0; y < SKULL.length; y++) for (let x = SKULL[y][0]; x <= SKULL[y][1]; x++) p.set(x, y, HAIR_M);
  for (const k of Object.keys(FACE)) { const y = Number(k), [x0, x1] = FACE[y]; for (let x = x0 + look; x <= x1; x++) p.set(x, y, SKIN_M); }
  // 2. 瀏海：3–4 束往下蓋住額頭，尖端停在眼睛上方（男生停在眉毛上）
  const clampY = a.body === 1 ? 8 : 9.6;
  BANGS[def.bang].forEach((c, ci) => {
    const [x0, x1, tx0, ty0, k] = c, tx = tx0 + sw * 0.4 + look * 0.5, ty = Math.min(ty0, clampY) - lift;
    for (let x = x0; x <= x1; x++) {
      const bot = ty - Math.abs(x - tx) * k;
      for (let y = 4; y <= Math.floor(bot); y++) if (p.m(x, y) !== NONE || y < 6) p.set(x, y, HAIR_M, -1, ci + 2);
    }
  });
  // 3. 前鬢：臉前緣的一撮（蓋住臉頰上半的前緣），2–3 格寬、尖端往前收
  const hime = st === 'hime';
  for (let y = 5; y <= def.front; y++) {
    const t = (y - 5) / Math.max(1, def.front - 5);
    // 姬髮：鬢髮是一片切齊的直條（3 寬、下緣平剪）；其他：往下變窄的尖
    const x0 = hime ? 19 : Math.min(20, Math.round(19.5 + t * 1.2 + sw * 0.3));
    for (let x = x0; x <= (hime ? 21 : 21); x++) p.set(x, y, HAIR_M, -1, 9);
  }
  // 鮑伯：下緣往外翹（後腦下面、下巴前面各一撮往外的翹尾）
  if (st === 'bob') {
    tri(p, [0, 12], [3, 17], [-2.5, 17], HAIR_M);
    tri(p, [19, 11], [21.5, 12], [23, 15.5], HAIR_M, false, 9);
  }
  // 直長髮：前面一束從鬢角順著垂到胸前（和鬢髮連成一束，不是另外貼一塊）
  if (st === 'long') strand(p, [20.5, 6], [23.5 - sw * 0.3, 16], [22.5 - sw * 1.2 - lift, 28 - lift * 6], 3.4, 2, HAIR_M, 10);
  if (st === 'wavy') {
    // 大波浪捲：後腦外緣一層一層蓬出去（波浪的外緣）；前面一束 S 形的捲髮垂到胸前
    for (let y = 4; y <= 16; y++) {
      const w = Math.round(1.4 + Math.sin(y * 0.95) * 1 + (y - 4) * 0.12);
      for (let x = SKULL[y][0] - w; x < SKULL[y][0]; x++) p.set(x, y, HAIR_M);
    }
    strand(p, [20.5, 6], [25 - sw * 0.3, 10], [22.2, 15], 3.6, 3, HAIR_M, 10);
    strand(p, [22.2, 15], [19.4 - sw * 0.6, 20 - lift * 2], [23.2 - sw * 1.2 - lift, 26 - lift * 5], 3, 2, HAIR_M, 10);
  }
  if (st === 'sidepart') {
    // 側分：分線那邊頭頂蓬起一個弧（往前梳的髮量）、長瀏海的尖端從前眼外側垂到臉頰旁（不蓋眼睛）
    strand(p, [10, 1.2], [14, -1.2 - lift * 0.3], [18.5, 1.8], 2.6, 2, HAIR_M, 0);
    strand(p, [11, 3], [21 + sw * 0.2, 5.5], [22.4 - sw * 0.6 - lift, 15.5 - lift * 2], 3, 1.8, HAIR_M, 9);
  }
  // 4. 毛尖（後腦外緣）
  if (!cov.top && def.tufts > 0) for (const [x, y, dx, dy, len] of TUFTS) {
    const L = len * def.tufts, nx = -dy, ny = dx;
    tri(p, [x + nx * 1.6 + 1, y + ny * 1.6], [x - nx * 1.6 + 1, y - ny * 1.6], [x + dx * L - sw * 0.6, y + dy * L - lift * 0.5], HAIR_M);
  }
  // 5. 髮型特色（前面那層）
  if (st === 'spiky' && !cov.top) {
    // 刺蝟頭：頭頂幾根大刺往後上方、後腦兩根往後；底邊埋在頭裡（高度只到頭頂上 2 格：刺往後、往旁邊長）
    const sp: [Pt, Pt, Pt][] = [[[2, 5.5], [6.5, 1.5], [-3, 0]], [[4.5, 3], [10, 0.5], [4.5, -2.5]], [[9, 0.5], [14.5, 0.5], [11.5, -2.5]], [[14, 0.5], [18.5, 3], [18.5, -2.5]], [[17.5, 3], [20.5, 6.5], [23, 2.5]], [[0, 7], [0.5, 12], [-3.5, 8]], [[0, 11], [1, 14.5], [-3, 13.5]]];
    for (const [s0, s1, t] of sp) tri(p, s0, s1, [t[0] - sw, t[1] - lift], HAIR_M, true);
  }
  if (st === 'messy' && !cov.top) {
    // 亂翹：頭頂三撮往上 / 往前後翹、前鬢一撮往前翹（四面都有翹毛，剪影一眼分得出）
    const sp: [Pt, Pt, Pt][] = [[[3, 3], [7, 1], [3, -1.5]], [[8, 0.5], [12, 0.5], [9.5, -2]], [[12.5, 0.5], [16.5, 1.5], [17, -1.5]], [[0, 4], [2, 2], [-2.5, 1.5]], [[0, 8], [0, 11], [-3, 9]], [[1, 13], [3, 16], [-1.5, 17.5]], [[19, 5], [21, 8], [23.5, 6.5]], [[4, 16], [8, 17], [6, 19.5]]];
    for (const [s0, s1, t] of sp) tri(p, s0, s1, [t[0] - sw * 0.5, t[1] - lift * 0.5], HAIR_M, true);
  }
  if (st === 'wolf' && !cov.top) {
    // 狼尾：頭頂往後一層一層的碎尖、後腦兩側往後下方的層次
    const sp: [Pt, Pt, Pt][] = [[[2.5, 3], [7.5, 0.5], [0.5, -1]], [[0, 5], [1, 9], [-3.5, 8.5]]];
    for (const [s0, s1, t] of sp) tri(p, s0, s1, [t[0] - sw * 0.6, t[1] - lift * 0.5], HAIR_M, true);
  }
  if (a.ahoge && acc !== 'hood' && !cov.top) strand(p, [10.5, 1], [10 + sw * 0.5, -2.2 - lift * 0.3], [13, -1.8], 2.6, 2, HAIR_M, 0);
  // 戴帽子 / 頭盔：帽沿以上的頭髮全部收起來（帽子蓋不到的地方也不會露出一塊頭髮）
  if (cov.top) p.clearBelow(HAIR_M, (_X, Y) => Y < BRIM - 1);
  despur(p, HAIR_M);
  // 頭頂最高到區域座標 HAIR_TOP
  p.clearBelow(HAIR_M, (_X, Y) => Y < HAIR_TOP);
  // 種族的耳朵：精靈耳戴帽子也留著（在帽沿以下）、戴兜帽時收起來；貓耳 / 龍角戴帽子 / 頭盔 / 兜帽時收起來
  const hideTop = cov.helmet || cov.hat !== null || acc === 'hood';
  // 兜帽從頭兩側包住：精靈耳收在兜帽裡（不從兜帽兩側戳出來）
  if (o.race === 'elf' && acc !== 'hood') elfEars(p);
  // 種族長在頭頂的貓耳 / 龍角（含外框）佔的格子：頭飾（皇冠 / 耳機 / 髮簪…）畫在它們後面，不蓋掉耳朵和角
  const raceTop = new Uint8Array(front.w * front.h);
  const markTop = (x: number, y: number): void => { if (x >= 0 && y >= 0 && x < front.w && y < front.h) raceTop[y * front.w + x] = 1; };
  if (o.race === 'catfolk' && !hideTop) for (const [x, y] of catEars(p)) markTop(ox + x, oy + y);
  // 6. 打光 + 外框 + 頭頂的髮束分線 / 高光
  shadeHair(p, HAIR_M, true);
  backStrands(p, sw);
  if (!cov.top) crownDetail(p, sw, look);
  shadeSkin(p);
  const head = new Bmp(front.w, front.h);
  render(p, head, ox, oy, { [HAIR_M]: h, [SKIN_M]: sk, [EAR_M]: sk, [INNER_M]: EAR_PINK }, { [HAIR_M]: ho, [SKIN_M]: sk[0], [EAR_M]: sk[0], [INNER_M]: EAR_PINK[0] });
  o.trace?.push('face');
  // 臉（眼睛 / 嘴 / 腮紅 / 眉毛）：只畫在膚色上（被瀏海蓋住的不畫）
  const fx = new Bmp(front.w, front.h);
  fx.blit(head, 0, 0);
  face(fx, a, o.expr, ox, oy, look);
  brows(fx, a, o.expr, ox, oy, look);
  for (let y = oy + 5; y <= oy + 17; y++) for (let x = ox + 7; x <= ox + 24; x++) {
    const X = x - ox, Y = y - oy, i = p.idx(X, Y);
    if (p.m(X, Y) === SKIN_M && p.lvl[i] !== 0) head.setRaw(x, y, fx.raw(x, y));
    else if (a.body === 1 && Y === EYE_Y && p.m(X, Y) !== NONE) head.setRaw(x, y, fx.raw(x, y));
  }
  o.trace?.push('frontHair');

  // ── 後面那層：後頸的頭髮 + 長髮後片 / 馬尾 / 雙馬尾（畫在身體後面）──
  const bp = new Paint();
  const tie = clothRamp(a.color2);
  const nape = def.nape - lift * (def.nape > 22 ? 7 : 2);
  const long = def.nape > 22;
  for (let y = 11; y <= Math.ceil(nape); y++) {
    const t = Math.max(0, (y - 14) / Math.max(1, nape - 14));
    const shift = Math.round((-sw * 3 - lift * 1.5) * t);
    // 直長髮：往下張開、髮尾往外翹；姬髮：直直平剪（一整片方的）；大波浪：更蓬、外緣一波一波；側分：半長、幾乎直直垂下；其他：往下收
    const wave = st === 'wavy' ? Math.sin(y * 0.8 + 1) * 1.4 : 0;
    const [out0, in1] = hime ? [0.4, 0] : st === 'wavy' ? [4, 1.5] : long ? [3, 2] : st === 'sidepart' ? [1.6, 3] : [1.2, 5];
    const x0 = Math.round(-0.4 - t * out0 + wave) + shift, x1 = Math.round(10 - t * in1 + wave * 0.5) + shift;
    for (let x = x0; x <= x1; x++) {
      // 髮尾：姬髮平剪；其他每 3 欄一撮尖（2 格寬）
      if (!hime && y > nape - 2 && ((x - x0) % 3 === 2 || y > nape - 0.5)) continue;
      // 長髮：後髮一束一束（每 4 欄一道髮束分界）、外側亮
      bp.set(x, y, HAIR_D, long ? (x === x0 + 1 && y < nape - 3 ? 3 : (x - x0) % 4 === 3 && y > 15 ? 1 : -1) : -1);
    }
  }
  if (st === 'twintails') {
    // 雙馬尾：綁在頭頂兩側；後面（左）一大束、前面（右）較細、從臉頰後面露出來（貼著頭，不會張太開）
    strand(bp, [2, 3], [-3.4 - sw * 1.2, 7 - lift * 2], [-1.5 - sw * 2.4 - lift, 25 - lift * 9], 5.8, 2.2, HAIR_D, 1, TAIL);
    strand(bp, [18.5, 3], [22.5 - sw, 7 - lift * 2], [21.5 - sw * 2 - lift, 23 - lift * 8], 4.6, 2, HAIR_D, 2, (t, s) => Math.max(1, TAIL(t, s) - 1));
  }
  if (st === 'ponytail') strand(bp, [2, 2], [-4.6 - sw * 1.2, 4 - lift * 2], [-3 - sw * 2.4 - lift * 1.2, 22 - lift * 10], 6, 2.2, HAIR_D, 1, TAIL);
  // 低馬尾：在後頸綁起來、貼著背垂下
  const lowTail: [Pt, Pt, Pt] = [[3, 13.5], [-1.6 - sw * 1.4, 19 - lift * 2], [2 - sw * 3 - lift * 1.5, 28 - lift * 9]];
  if (st === 'lowpony') strand(bp, ...lowTail, 6, 2.6, HAIR_D, 1, TAIL);
  if (st === 'wolf') {
    // 狼尾（mullet）：後頸留長、一層一層的尖往後下方翹
    const sp: [Pt, Pt, Pt][] = [[[-1, 15], [3, 17], [-4.5, 22]], [[1, 17], [5.5, 18], [0.5, 25]], [[4.5, 17], [8.5, 17.5], [5.5, 22.5]]];
    for (const [s0, s1, t] of sp) tri(bp, s0, s1, [t[0] - sw * 1.5 - lift, t[1] - lift * 3], HAIR_D, true);
  }
  if (st === 'odango' && !cov.top && acc !== 'hood') strand(bp, [17.5, 0], [18.5, -0.5], [19, 0], 5.6, 5.6, HAIR_D, 1);
  if (cov.top) bp.clearBelow(HAIR_D, (_X, Y) => Y < BRIM - 1);
  despur(bp, HAIR_D);
  shadeHair(bp, HAIR_D, false);
  const behind = new Bmp(back.w, back.h);
  render(bp, behind, ox, oy, { [HAIR_D]: h }, { [HAIR_D]: ho });
  // 髮圈（雙馬尾 / 馬尾的根部）
  if (!cov.top) {
    if (st === 'twintails') { tieBand(head, ox + 2, oy + 4, tie); tieBand(behind, ox + 18, oy + 4, tie); }
    if (st === 'ponytail') tieBand(head, ox + 1, oy + 3, tie);
  }
  if (st === 'lowpony') { const [x, y] = bez(lowTail, 0.3); tieBand(behind, ox + Math.round(x) - 1, oy + Math.round(y) - 1, tie); }
  if (st === 'braid') braid(head, a, ox, oy, sw, lift);
  if (st === 'odango' && !cov.top && acc !== 'hood') bun(head, ox + 4, oy + 0, h, ho, tie);
  if (o.race === 'dragonkin' && !hideTop) {
    const hl = horns(head, ox, oy);
    for (let i = 0; i < hl.px.length; i++) if (hl.px[i] >>> 24) raceTop[i] = 1;
  }

  const gear = new Bmp(front.w, front.h);
  if (o.gear && armorSet(o.gear)) helmetArt(gear, o.gear, ox, oy, o.f ?? 0);
  // 頭盔自己有內描邊（不再往外描一圈：外描會吃到前眼）；兜帽往外描
  if (!o.gear && acc === 'hood') { hood(gear, behind, a, ox, oy); gear.softOutline(0.45); }
  head.blit(gear, 0, 0);
  if (o.sweat) sweat(head, ox - 2, oy + 5);
  front.blit(head, 0, 0);
  if (cov.hat) hatArt(front, cov.hat, ox, oy, 'side', m.swing);
  if (o.gear) o.trace?.push('headgear');
  const accL = new Bmp(front.w, front.h);
  sideAcc(accL, a, st, acc, ox, oy, o.race);
  for (let i = 0; i < raceTop.length; i++) if (raceTop[i]) accL.px[i] = 0;
  front.blit(accL, 0, 0);
  // 頭飾 / 帽子最高到頭的區域座標 −4（含外框）：不高過碰撞盒
  for (let yy = 0; yy < Math.min(front.h, oy - 4); yy++) for (let x = 0; x < front.w; x++) front.clear(x, yy);
  if (a.glasses) glasses(front, ox + look, oy);
  o.trace?.push('frontAcc');
  if (o.face) for (let y = 0; y < front.h; y++) for (let x = 0; x < front.w; x++) {
    if (p.m(x - ox, y - oy) !== SKIN_M) continue;
    const v = front.raw(x, y);
    if (v >>> 24 && v === head.raw(x, y)) o.face.setRaw(x, y, v);
  }
  back.blit(behind, 0, 0);
}

/** 二次貝茲曲線上的一點 */
function bez([p0, p1, p2]: readonly [Pt, Pt, Pt], t: number): Pt {
  const u = 1 - t;
  return [u * u * p0[0] + 2 * u * t * p1[0] + t * t * p2[0], u * u * p0[1] + 2 * u * t * p1[1] + t * t * p2[1]];
}
/** 粗髮束（馬尾 / 雙馬尾）的打光：受光側（左上）一道亮、暗側一階、髮尾暗（大塊、不做細線） */
const TAIL = (t: number, s: number): number => (t > 0.86 ? 1 : s > 0.45 ? 1 : s < -0.4 && t < 0.7 ? 3 : 2);
function tieBand(b: Bmp, x: number, y: number, r: RGB[]): void {
  b.set(x, y, r[3]); b.set(x + 1, y, r[4]); b.set(x, y + 1, r[2]); b.set(x + 1, y + 1, r[3]);
}
function bun(b: Bmp, cx: number, cy: number, h: RGB[], out: RGB, tie: RGB[]): void {
  for (let y = cy - 3; y <= cy + 3; y++) for (let x = cx - 3; x <= cx + 3; x++) {
    const d = Math.hypot(x + 0.5 - (cx + 0.5), y + 0.5 - (cy + 0.5));
    if (d > 3.3) continue;
    b.set(x, y, d > 2.6 ? out : x < cx && y < cy ? h[3] : h[2]);
  }
  b.set(cx - 1, cy - 1, h[4]); b.set(cx, cy - 1, h[4]);
  b.set(cx + 2, cy + 3, tie[3]); b.set(cx + 3, cy + 2, tie[2]);
}
function braid(b: Bmp, a: Appearance, ox: number, oy: number, sw: number, lift: number): void {
  const h = hairRamp(a.hairColor), o = hairOutline(a.hairColor), tie = clothRamp(a.color2);
  const bx = ox + 19, by = oy + 12;
  for (let k = 0; k < 11; k++) {
    const y = by + k - Math.round(lift * k * 0.4), x = bx + Math.round((k / 11) * 1.5) - Math.round((sw + lift) * k * 0.2);
    const ph = k % 3;
    b.set(x - 1, y, o);
    b.set(x, y, ph === 0 ? h[3] : ph === 1 ? h[2] : h[1]);
    b.set(x + 1, y, ph === 2 ? h[1] : h[2]);
    b.set(x + 2, y, o);
  }
  const ty = by + 11 - Math.round(lift * 5), tx = bx + 1 - Math.round((sw + lift) * 2.4);
  b.set(tx - 1, ty, tie[3]); b.set(tx, ty, tie[4]); b.set(tx + 1, ty, tie[2]);
  b.set(tx, ty + 1, h[2]); b.set(tx - 1, ty + 1, o); b.set(tx + 1, ty + 1, o); b.set(tx, ty + 2, o);
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

/**
 * 頭頂有貓耳 / 龍角的種族：頭頂中間只剩耳 / 角之間的一道縫（耳 / 角畫在頭飾前面，見 frontHead 的 raceTop）。
 * gap = 縫的左緣（區域座標）：皇冠換成 5 格寬的小皇冠、頭頂的蝴蝶結換小的，都放進這道縫；
 * low / back = 髮簪 / 綁在後腦的蝴蝶結往下 / 往後挪幾格（插在耳 / 角的根部下面，不被蓋住）；side = 側邊的小花 / 狐狸面具往下挪幾格（龍角根部很粗）
 */
const TOP_GAP: Partial<Record<RaceId, { gap: number; low: number; back: number; side: number }>> = {
  catfolk: { gap: 7, low: 5, back: 0, side: 0 },
  dragonkin: { gap: 5, low: 8, back: -1, side: 5 },
};
function sideAcc(b: Bmp, a: Appearance, st: string, acc: string, ox: number, oy: number, race: RaceId): void {
  const r = clothRamp(a.color2), tg = TOP_GAP[race];
  if (acc === 'ribbon') {
    const [bx, by] = tg ? [tg.back, tg.low] : [0, 0];
    if (st === 'twintails') { bow(b, ox + 2 + bx, oy + 3 + by, r); return; }
    if (st === 'ponytail') { bow(b, ox + 1 + bx, oy + 2 + by, r); return; }
    if (st === 'odango') { bow(b, ox + 8, oy + 0, r); return; }
    if (tg) bow(b, ox + tg.gap + 2, oy - 1, r);
    else bow(b, ox + 6, oy - 1, r, true);
  } else if (acc === 'catears') {
    // 貓耳髮箍：箍子順著頭頂、兩隻大耳朵（前面那隻在臉的上方、後面那隻在後腦）
    const s = new Bmp(b.w, b.h), c = clothRamp(a.color2), pink = hex('#ffc8dc');
    for (let x = 3; x <= 18; x++) s.set(ox + x, oy - (x < 6 || x > 15 ? 0 : 1), c[2]);
    // 貓族自己就有貓耳：只戴箍子、不再多畫兩隻（不會變成四隻耳朵）
    if (race !== 'catfolk') {
      grid(s, ['..e..', '.eee.', 'eepee', 'epppe'], { e: c[3], p: pink }, ox + 3, oy - 4);
      grid(s, ['..e..', '.eee.', 'eepee', 'epppe'], { e: c[2], p: pink }, ox + 13, oy - 4);
    }
    s.softOutline();
    b.blit(s, 0, 0);
  } else if (acc === 'clip') {
    const s = new Bmp(b.w, b.h), y = hex('#ffd86a'), w = hex('#fff4c0'), o = hex('#e8701c');
    grid(s, ['..y..', '.yyy.', 'ywWyo', '.yoy.', '.o.o.'], { y, w, W: hex('#ffffff'), o }, ox + 17, oy + 2);
    s.softOutline();
    b.blit(s, 0, 0);
  } else if (acc === 'flower') {
    const s = new Bmp(b.w, b.h), p = hex('#ffc8dc'), pd = hex('#e890b0'), c = GOLD, lf = CR.green;
    grid(s, ['.pp.', 'pPcp', 'pccd', '.pd.', 'g..g'], { p, P: hex('#ffffff'), c, d: pd, g: lf[3] }, ox + 3, oy + 2 + (tg?.side ?? 0));
    s.softOutline();
    b.blit(s, 0, 0);
  } else if (acc === 'crown') {
    // 小皇冠：戴在頭頂正中、三個尖 + 中間一顆紅寶石、兩側藍寶石；左邊（受光）亮、右邊暗一階
    const s = new Bmp(b.w, b.h), pal = { y: GOLD, W: hex('#fff4c0'), o: hex('#ffa93a'), d: hex('#e8701c'), R: hex('#c8344c'), B: hex('#3e74c4') };
    // 有耳 / 角的種族：5 格寬的小皇冠，坐在耳 / 角之間
    if (tg) grid(s, ['y.W.y', 'yyWyo', 'WyRyo', 'oBooB'], pal, ox + tg.gap, oy - 3);
    else grid(s, ['y...W...y', 'yy.yWy.yo', 'WyyyRyyyo', 'oBoooooBd'], pal, ox + 6, oy - 3);
    s.softOutline();
    b.blit(s, 0, 0);
  } else if (acc === 'headphones') {
    // 耳機：頭帶順著頭頂繞過去（兩格粗、上緣亮），兩側耳罩（後面那個大、前面那個在臉的前緣只露一半）；耳罩外圈是副色
    const s = new Bmp(b.w, b.h), c = clothRamp(a.color2), dk = hex('#2c2838'), md = hex('#423f54'), hi = hex('#707490');
    for (let k = 0; k <= 60; k++) {
      const t = 0.42 + (Math.PI - 0.84) * (k / 60), x = 10.5 - Math.cos(t) * 11, y = 9.2 - Math.sin(t) * 10.4;
      s.set(ox + Math.round(x), oy + Math.round(y), hi);
      s.set(ox + Math.round(x + Math.cos(t) * 1.1), oy + Math.round(y + Math.sin(t) * 1.1), md);
    }
    grid(s, ['.dd.', 'dhmd', 'cmmd', 'cmmd', 'cmmd', 'cmdd', '.dd.'], { d: dk, m: md, h: hi, c: c[3] }, ox - 2, oy + 7);
    grid(s, ['md', 'mc', 'mc', 'mc', 'dd'], { d: dk, m: md, c: c[3] }, ox + 21, oy + 7);
    s.softOutline();
    b.blit(s, 0, 0);
  } else if (acc === 'foxmask') {
    // 狐狸面具：白臉、尖耳、紅色眼紋和鼻尖；斜斜地掛在頭的側邊（後腦上方），不蓋臉
    const s = new Bmp(b.w, b.h), W = hex('#ffffff'), sh = hex('#cceaf8'), sd = hex('#b4b9c8'), r = hex('#c8344c'), k = hex('#8c2038');
    const rows = ['W.....W', 'Wr...rW', 'WWWWWWW', 'WkrWrkW', 'WWWWWWs', '.WWWWs.', '..dRd..'];
    // 往後歪：上面那幾列往前（右）偏、下巴往後（左）
    rows.forEach((row, ry) => grid(s, [row], { W, s: sh, d: sd, r, k, R: r }, ox + Math.round((3 - ry) * 0.4), oy + 1 + ry + (tg?.side ?? 0)));
    s.softOutline();
    b.blit(s, 0, 0);
  } else if (acc === 'hairpin') {
    // 髮簪：一根金色的簪子斜插在後腦、外端一朵副色的花；花下面垂兩串細金鍊、鍊尾各一顆珠子（鍊子不描邊，保持細）
    // 有耳 / 角的種族：整支往下（往後）挪到耳 / 角的根部下面
    const s = new Bmp(b.w, b.h), c = clothRamp(a.color2), g = GOLD, gd = hex('#e8701c');
    const px = ox + (tg?.back ?? 0), py = oy + (tg?.low ?? 0);
    for (let k = 0; k <= 6; k++) s.set(px + 8 - k, py + 3 - Math.round(k * 0.8), k < 2 ? gd : g);
    grid(s, ['.pp.', 'pgPp', '.pd.'], { p: c[3], P: c[4], d: c[2], g }, px, py - 4);
    s.softOutline();
    grid(s, ['g.g', 'd.d', 'g.b', 'b.B', 'B..'], { g, d: gd, b: c[3], B: c[2] }, px, py);
    b.blit(s, 0, 0);
  }
}

/** 兜帽：蓋住頭頂與後腦，前面開口露出臉與瀏海；帽沿亮一階、內側一道暗影；帽尖垂在後面 */
function hood(head: Bmp, behind: Bmp, a: Appearance, ox: number, oy: number): void {
  const c = clothRamp(a.color1);
  const opening = (x: number, y: number): boolean => {
    // 開口：整張臉（兩隻眼睛、嘴）都露出來，走路往前看時也是
    const nx = (x + 0.5 - 15.6) / 8.6, ny = (y + 0.5 - 11.8) / 8.6;
    return nx * nx + ny * ny <= 1 && y >= 3;
  };
  for (let y = -3; y <= 19; y++) for (let x = -2; x <= 24; x++) {
    const nx = (x + 0.5 - 10.6) / 12.6, ny = (y + 0.5 - 8.4) / 10.6;
    if (nx * nx + ny * ny > 1 || opening(x, y)) continue;
    const rim = opening(x + 1, y) || opening(x - 1, y) || opening(x, y + 1);
    const v = nx * 0.5 - ny * 0.85;
    head.set(ox + x, oy + y, rim ? c[4] : v > 0.45 ? c[4] : v > -0.25 ? c[3] : v > -0.6 ? c[2] : c[1]);
  }
  const s = new Bmp(behind.w, behind.h);
  // 帽尖：從後腦垂下來、越往下越細（貼著後頸，不往後戳）
  for (let k = 0; k < 6; k++) { const xa = Math.round(-1 - k * 0.35), xb = Math.round(4 - k * 0.6); for (let x = xa; x <= xb; x++) s.set(ox + x, oy + 12 + k, k === 5 ? c[1] : x === xa ? c[3] : c[2]); }
  s.softOutline();
  behind.blit(s, 0, 0);
}

export function drawHead(back: Bmp, front: Bmp, ox: number, oy: number, o: HeadOpts): void {
  frontHead(back, front, o, ox, oy);
}
export { BRIM };
