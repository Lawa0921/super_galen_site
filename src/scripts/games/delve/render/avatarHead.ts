// avatarHead.ts — 角色的頭（純 Bmp，無 DOM）：克魯賽德戰技風的 Q 版大頭，3/4 正面（面向右）。
//   頭 24×23（全身約 38 px、約 1.6 頭身）；臉在頭的中央、往面向的方向偏 1 格（看得出朝向）。
//   眼睛 2×4 的小黑眼 + 1 格白高光（女生外眼角多一格睫毛）、張開的紅嘴、兩頰腮紅；沒有鼻子、沒有眉毛線。
//   九種髮型 = 頭頂髮量（天使光環）+ 4 束 V 字瀏海（尖端停在眼睛上方）+ 兩側鬢髮（近側長、遠側短）+ 後髮。
//   外緣是柔和的同色系描邊（不用近黑）。頭飾、眼鏡、頭盔 / 時裝帽（avatarGear）。
//   back 圖層：畫在身體後面的頭髮（後髮、馬尾、雙馬尾、遠側丸子、兜帽尖）；front 圖層：頭、臉、瀏海、鬢髮、飾品。
//   座標：頭的區域座標 (0..23, 0..22)，(ox, oy) = 區域原點在畫布上的位置。光從左上。
import { Bmp, hex, type RGB } from './pixel';
import type { Appearance } from '../engine/appearance';
import { HAIR_STYLES, ACCESSORIES } from '../engine/appearance';
import type { DollPiece } from '../engine/doll';
import { R as CR } from './combatArt';
import { BRIM, CAP, HAT_HIDES_TOP, armorSet, hatArt, helmetArt, inCap, lookId } from './avatarGear';
import { BLUSH, EYE_WHITE, GLASSES, GOLD, MOUTH, SWEAT, TONGUE, clothRamp, darker, eyeRamp, hairRamp, skinRamp } from './avatarPalette';
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
export const HEAD_W = 24, HEAD_H = 23;
/** 眼睛的位置（區域座標）：近眼 / 遠眼的左上角 */
export const EYE_Y = 12, EYE_NEAR = 9, EYE_FAR = 16;

// ── 頭型（每列 [左, 右]）：圓圓的大頭、下巴小 ─────────────────
const HEAD_ROWS: readonly [number, number][] = [
  [7, 16], [5, 18], [3, 20], [2, 21], [1, 22], [1, 22], [0, 23], [0, 23], [0, 23], [0, 23], [0, 23], [0, 23],
  [0, 23], [0, 23], [0, 23], [0, 23], [1, 22], [1, 22], [2, 21], [3, 21], [4, 20], [6, 18], [8, 16],
];
/** 男生：下巴寬一點 */
const HEAD_ROWS_M: readonly [number, number][] = [
  ...HEAD_ROWS.slice(0, 18), [1, 22], [2, 21], [3, 21], [5, 19], [8, 16],
];
const rowsOf = (a: Appearance): readonly [number, number][] => (a.body === 1 ? HEAD_ROWS_M : HEAD_ROWS);
const inRows = (rows: readonly [number, number][], x: number, y: number): boolean => { const r = rows[y]; return Boolean(r) && x >= r[0] && x <= r[1]; };
/** 臉從哪一列開始（再上面是頭頂的頭髮） */
const BROW = 8;

// ── 髮型定義 ─────────────────────────────────────────────
type Pt = [number, number];
/** 一束瀏海：佔 x0..x1 欄，下緣是一個 V（尖端在 (tx, ty)，往兩側每欄往上縮 k 列）；尖端最低第 11 列（眼睛在 12） */
type Clump = [number, number, number, number, number];
type BangKind = 'tips' | 'blunt' | 'swept' | 'parted' | 'spiky' | 'messy';
const BANGS: Record<BangKind, Clump[]> = {
  tips: [[2, 8, 4.5, 11, 1.2], [7, 13, 10, 11.6, 1.2], [12, 18, 15, 11.2, 1.2], [17, 22, 19.5, 10.6, 1.2]],
  blunt: [[2, 7, 4.5, 11, 0.12], [7, 12, 9.5, 11, 0.12], [12, 17, 14.5, 11, 0.12], [17, 22, 19.5, 10.6, 0.2]],
  // 往面向的方向撥（尖端在右）
  swept: [[2, 9, 8, 11.4, 0.8], [8, 16, 15, 11.6, 0.75], [15, 22, 21.5, 10.8, 0.9]],
  // 中分：額頭中間露出來
  parted: [[2, 7, 2.5, 11.4, 0.9], [6, 11, 6.5, 10.4, 0.9], [13, 18, 17.5, 10.4, 0.9], [17, 22, 21.5, 11.4, 0.9]],
  spiky: [[2, 7, 4.5, 11.4, 2], [6, 12, 9, 11.6, 2.2], [11, 17, 14, 11.6, 2.2], [16, 22, 19, 11, 2]],
  messy: [[2, 8, 5.5, 11.2, 1.5], [7, 13, 8, 10.6, 1.6], [12, 18, 15.5, 11.6, 1.5], [17, 22, 21, 10.6, 1.5]],
};
interface HairDef {
  bang: BangKind;
  /** 近側（左）鬢髮的下緣、遠側（右）鬢髮的下緣 */
  near: number; far: number;
  /** 頭頂髮量（> 1 = 蓬） */
  vol: number;
}
const HAIR: Record<string, HairDef> = {
  bob: { bang: 'tips', near: 21, far: 19, vol: 1.05 },
  twintails: { bang: 'tips', near: 18, far: 16, vol: 1.02 },
  ponytail: { bang: 'swept', near: 16, far: 14, vol: 1.02 },
  long: { bang: 'parted', near: 22, far: 20, vol: 1.04 },
  hime: { bang: 'blunt', near: 21, far: 20, vol: 1.03 },
  spiky: { bang: 'spiky', near: 15, far: 13, vol: 1.02 },
  messy: { bang: 'messy', near: 17, far: 15, vol: 1.05 },
  braid: { bang: 'tips', near: 16, far: 15, vol: 1.02 },
  odango: { bang: 'swept', near: 16, far: 14, vol: 1.02 },
};
const styleId = (a: Appearance): string => HAIR_STYLES[a.hair]?.id ?? 'bob';
const accId = (a: Appearance): string => ACCESSORIES[a.acc]?.id ?? 'none';

// ── 小工具 ───────────────────────────────────────────────
/** 粗細漸變的二次貝茲曲線（髮束 / 馬尾 / 辮子 / 呆毛）。shade(t, s) → 色階索引（s < 0 = 左 = 受光） */
function strand(b: Bmp, p0: Pt, p1: Pt, p2: Pt, w0: number, w1: number, pal: RGB[], shade: (t: number, s: number) => number): void {
  const len = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]) + Math.hypot(p2[0] - p1[0], p2[1] - p1[1]);
  const n = Math.max(8, Math.ceil(len * 3));
  for (let i = 0; i <= n; i++) {
    const t = i / n, u = 1 - t;
    const x = u * u * p0[0] + 2 * u * t * p1[0] + t * t * p2[0], y = u * u * p0[1] + 2 * u * t * p1[1] + t * t * p2[1];
    const dx = 2 * u * (p1[0] - p0[0]) + 2 * t * (p2[0] - p1[0]), dy = 2 * u * (p1[1] - p0[1]) + 2 * t * (p2[1] - p1[1]);
    const dl = Math.hypot(dx, dy) || 1, nx = dy / dl, ny = -dx / dl;
    const r = (w0 + (w1 - w0) * t * t + Math.sin(t * Math.PI) * (w0 - w1) * 0.18) / 2;
    for (let yy = Math.floor(y - r - 1); yy <= Math.ceil(y + r + 1); yy++) {
      for (let xx = Math.floor(x - r - 1); xx <= Math.ceil(x + r + 1); xx++) {
        const px = xx + 0.5 - x, py = yy + 0.5 - y;
        if (px * px + py * py > r * r + 0.15) continue;
        const s = r > 0 ? (px * nx + py * ny) / Math.max(0.5, r) : 0;
        b.set(xx, yy, pal[Math.max(0, Math.min(pal.length - 1, shade(t, s)))]);
      }
    }
  }
}
/** 粗髮束（馬尾 / 雙馬尾）：受光側一道長高光、暗側兩階、尾端暗 */
const tailShade = (t: number, s: number): number => (t > 0.88 ? 1 : s > 0.6 ? 0 : s > 0.25 ? 1 : s < -0.55 && t < 0.35 ? 4 : s < -0.3 && t < 0.7 ? 3 : 2);
function disc(b: Bmp, cx: number, cy: number, r: number, pal: RGB[]): void {
  for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++) for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) {
    const dx = (x + 0.5 - cx) / r, dy = (y + 0.5 - cy) / r;
    const d = dx * dx + dy * dy;
    if (d > 1) continue;
    const v = -(dx * 0.6 + dy * 0.8);
    b.set(x, y, pal[v > 0.45 ? 3 : v > -0.35 ? 2 : 1]);
    if (d < 0.3 && dx < 0 && dy < -0.1) b.set(x, y, pal[4]);
  }
}
/** 字元格小圖（'.' 跳過） */
function grid(b: Bmp, rows: readonly string[], pal: Record<string, RGB>, ox: number, oy: number): void {
  for (let y = 0; y < rows.length; y++) for (let x = 0; x < rows[y].length; x++) {
    const c = pal[rows[y][x]];
    if (c) b.set(ox + x, oy + y, c);
  }
}

// ── 眼睛（2 寬 × 4 高；近眼 / 遠眼同大）────────────────────
// D 深（上半）、M 中（下半）、H 白高光、L 線（閉眼 / 表情）
interface EyeDef { rows: string[]; dy: number; }
const EYES: Record<string, EyeDef> = {
  round: { rows: ['DD', 'HD', 'DM', 'MM'], dy: 0 },
  // 上揚眼：上緣外側翹起來一格（外眼角在外側）
  sharp: { rows: ['.D', 'DD', 'HD', 'MM'], dy: 0 },
  // 下垂眼：上半被眼皮蓋住、瞳孔在下半
  droopy: { rows: ['DD', 'DD', 'HM', 'MM'], dy: 0 },
  blink: { rows: ['..', '..', 'LL', '..'], dy: 0 },
  happy: { rows: ['..', 'LL', 'L.', '..'], dy: 0 },
  hurt: { rows: ['L.', '.L', 'L.', '..'], dy: 0 },
  dead: { rows: ['L.L', '.L.', 'L.L'], dy: 0 },
  up: { rows: ['HD', 'DM', 'MM', '..'], dy: -1 },
  effort: { rows: ['..', 'LL', 'DD', '..'], dy: 0 },
};
function eyeKind(a: Appearance, expr: Expr): string {
  return expr === 'normal' ? (['round', 'sharp', 'droopy'][a.eyeShape] ?? 'round') : expr;
}
/** 眉毛：Q 版沒有眉毛線；用力 / 受傷時露一點點皺眉（被瀏海蓋住的地方之後由瀏海蓋過去） */
export function brows(b: Bmp, a: Appearance, expr: Expr, ox: number, oy: number): void {
  if (expr !== 'effort' && expr !== 'hurt') return;
  const c = hairRamp(a.hairColor)[0];
  b.set(ox + EYE_NEAR + 1, oy + EYE_Y - 1, c); b.set(ox + EYE_FAR, oy + EYE_Y - 1, c);
}

function face(b: Bmp, a: Appearance, expr: Expr, ox: number, oy: number, look: number): void {
  const e = eyeRamp(a.eyes), sk = skinRamp(a.skin), male = a.body === 1;
  const g = EYES[eyeKind(a, expr)];
  const pal: Record<string, RGB> = { D: e[0], M: e[1], H: EYE_WHITE, L: e[0] };
  const ex = (near: boolean): number => ox + (near ? EYE_NEAR : EYE_FAR) + look;
  for (const near of [true, false]) {
    const rows = near || g.rows[0].length < 3 ? g.rows : g.rows;
    // 上揚眼：遠眼外眼角在右 → 鏡像那張字元格
    const r2 = !near && expr === 'normal' && a.eyeShape === 1 ? rows.map((r) => r.split('').reverse().join('')) : rows;
    grid(b, r2, pal, ex(near) - (g.rows[0].length === 3 ? 1 : 0), oy + EYE_Y + g.dy);
  }
  // 女生：外眼角多一格睫毛（近眼往左上、遠眼往右上）
  if (!male && (expr === 'normal' || expr === 'up')) { b.set(ex(true) - 1, oy + EYE_Y + g.dy, e[0]); b.set(ex(false) + 2, oy + EYE_Y + g.dy, e[0]); }
  // 腮紅（每邊兩格）
  if ((a.blush || expr === 'happy' || expr === 'hurt') && expr !== 'dead') {
    const bl = BLUSH[a.skin] ?? BLUSH[1];
    for (const x of [EYE_NEAR - 2, EYE_NEAR - 1, EYE_FAR + 2, EYE_FAR + 3]) b.set(ox + x + look, oy + EYE_Y + 5, bl);
  }
  // 嘴：張開的紅嘴（開心、CQ 的招牌）；表情改形狀
  const mx = ox + 13 + look, my = oy + EYE_Y + 6;
  if (expr === 'dead') { b.set(mx - 1, my, sk[0]); b.set(mx, my + 1, sk[0]); b.set(mx + 1, my, sk[0]); return; }
  if (expr === 'blink' && male) { b.set(mx, my, sk[0]); b.set(mx + 1, my, sk[0]); return; }
  if (expr === 'hurt' || expr === 'effort') {
    b.set(mx - 1, my, MOUTH); b.set(mx, my, MOUTH); b.set(mx + 1, my, MOUTH); b.set(mx - 1, my + 1, MOUTH); b.set(mx, my + 1, TONGUE); b.set(mx + 1, my + 1, MOUTH);
    return;
  }
  if (expr === 'up') { b.set(mx, my, MOUTH); b.set(mx, my + 1, TONGUE); return; }
  // 開心張嘴：上緣 3 格深紅、下面 2 格粉紅舌頭（男生嘴小一格）
  b.set(mx, my, MOUTH); b.set(mx + 1, my, MOUTH); if (!male) b.set(mx - 1, my, MOUTH);
  b.set(mx, my + 1, TONGUE); b.set(mx + 1, my + 1, male ? MOUTH : TONGUE);
}

// ── 頭頂髮量的遮罩 ───────────────────────────────────────
/** 0 = 沒有、1 = 頭頂、2 = 臉兩側的髮量（臉框外） */
function capMask(st: string, rows: readonly [number, number][], cov: boolean): (x: number, y: number) => number {
  const d = HAIR[st] ?? HAIR.bob;
  const k = cov ? 1 : d.vol;
  return (x, y) => {
    if (y < -6 || y > 24 || x < -6 || x > 29) return 0;
    const skull = inRows(rows, x, y), cap = inCap(x, y, k);
    if (y < BROW) return cap || skull ? 1 : 0;
    // 臉框外（左右兩側）的髮量，往下到鬢髮的長度
    // 只取髮量的橢圓（不用頭型）：兩側往下自然收圓，不會變成直直的一片
    if ((x < 2 && y < d.near) || (x > 21 && y < d.far)) return cap ? 2 : 0;
    return 0;
  };
}
/** 頭頂的打光：左上亮、右下暗；天使光環一圈斷續的高光 */
function capShade(x: number, y: number, h: RGB[]): RGB {
  const nx = (x + 0.5 - CAP.cx) / CAP.rx, ny = (y + 0.5 - CAP.cy) / CAP.ry;
  const d = Math.hypot(nx, ny);
  const v = 0.6 - 0.6 * (nx * 0.6 + ny * 0.8);
  if (ny < -0.3 && d > 0.52 && d < 0.64 && x !== 8 && x !== 16) return x < 11 ? h[4] : h[3];
  return h[v > 1.02 ? 3 : v > 0.42 ? 2 : v > 0.12 ? 1 : 0];
}

function headCover(o: HeadOpts): { top: boolean; helmet: boolean; hat: string | null } {
  const helmet = armorSet(o.gear) !== null, hat = lookId(o.gear, 'hat:');
  return { helmet, hat, top: helmet || (hat !== null && HAT_HIDES_TOP.has(hat)) };
}

function frontHead(back: Bmp, front: Bmp, o: HeadOpts, ox: number, oy: number): void {
  const cov = headCover(o);
  const a = o.app, h = hairRamp(a.hairColor), sk = skinRamp(a.skin), st = styleId(a), acc = o.gear ? 'none' : accId(a), m = o.motion;
  const sw = m.swing, lift = m.lift, look = Math.round(o.look ?? 0);
  const def = HAIR[st] ?? HAIR.bob;
  const P = (x: number, y: number): Pt => [ox + x, oy + y];
  // 臉：大片膚色；遠側臉頰（右緣）與下巴暗一階、近側臉頰一點亮部
  const skin = new Bmp(front.w, front.h);
  const rows = rowsOf(a), chin = rows.length - 1;
  for (let y = 0; y < rows.length; y++) {
    const [x0, x1] = rows[y];
    for (let x = x0; x <= x1; x++) {
      const edge = (x >= x1 - 1 && y >= BROW) || y === chin || (y === chin - 1 && (x <= x0 || x >= x1 - 1));
      const hi = y === EYE_Y + 4 && x >= 5 && x <= 6;
      skin.set(ox + x, oy + y, edge ? sk[2] : hi ? sk[4] : sk[3]);
    }
  }
  face(skin, a, o.expr, ox, oy, look);
  brows(skin, a, o.expr, ox, oy);
  o.trace?.push('face');

  // ── 頭髮 ──
  const mask = capMask(st, rows, cov.top);
  const hair = new Bmp(front.w, front.h);
  for (let y = -6; y <= 24; y++) for (let x = -6; x <= 29; x++) {
    const k = mask(x, y);
    if (!k) continue;
    hair.set(ox + x, oy + y, k === 1 ? capShade(x, y, h) : x < 2 ? (x <= -1 ? h[3] : h[2]) : x >= 23 ? h[1] : h[2]);
  }
  const clump = (c: Clump, top: number, clamp: number): void => {
    const [x0, x1, tx0, ty0, k] = c, tx = tx0 + sw * 0.4 + look * 0.5, ty = Math.min(ty0, clamp) - lift;
    for (let x = x0; x <= x1; x++) {
      const bot = ty - Math.abs(x - tx) * k;
      for (let y = top; y <= Math.floor(bot); y++) {
        if (y < BROW && !inCap(x, y, 1.02)) continue;
        const last = y > bot - 1;
        hair.set(ox + x, oy + y, y < BROW - 2 ? capShade(x, y, h) : last ? h[1] : x === x1 ? h[1] : x === x0 && y < ty - 2 ? h[3] : h[2]);
      }
    }
  };
  for (const c of BANGS[def.bang]) clump(c, -2, 11.6);
  // 兩側鬢髮：近側（左）長、遠側（右）短（3/4 正面：兩邊都看得到）
  clump([-1, 2, 0.5 - sw * 0.6, def.near, 0.9], 6, 99);
  clump([21, 23, 22.5 - sw * 0.4, def.far, 0.9], 6, 99);
  // 瀏海下緣在額頭投下的陰影（額頭上、髮尖正下方那格）
  for (let y = BROW; y <= EYE_Y; y++) for (let x = 2; x <= 22; x++) {
    if (!hair.on(ox + x, oy + y - 1) || hair.on(ox + x, oy + y)) continue;
    if (inRows(rows, x, y) && skin.on(ox + x, oy + y)) {
      const cur = skin.get(ox + x, oy + y);
      if (cur.join() === sk[3].join() || cur.join() === sk[4].join()) skin.set(ox + x, oy + y, sk[2]);
    }
  }

  // ── 髮型特色 ──
  const behind = new Bmp(back.w, back.h);
  const tie = clothRamp(a.color2);
  const bigTail = (b: Bmp, root: Pt, ctrl: Pt, end: Pt, w: number, pal: RGB[]): void => {
    strand(b, root, ctrl, end, w, 1.6, pal, tailShade);
    const mid: Pt = [(ctrl[0] + end[0]) / 2 + 1.2, (ctrl[1] + end[1]) / 2 + 2];
    strand(b, mid, [mid[0] + 1.5, mid[1] + (end[1] - mid[1]) * 0.6], [end[0] + 2.5, end[1] - 2], w * 0.42, 1, pal, (t, s) => (t > 0.75 ? 1 : s > 0.3 ? 0 : 1));
  };
  // 後髮：頭後面一圈（從頭的兩側露出來），長度依髮型
  const longBack = st === 'long' || st === 'hime';
  const backLen = longBack ? 31 - lift * 8 : st === 'bob' ? 21 : 0;
  for (let y = 6; y <= Math.ceil(backLen); y++) {
    // 鮑伯：後髮圓圓包住下巴兩側；長髮：從頭兩側垂到腰、越往下越收
    const t = Math.max(0, (y - 10) / 20);
    const half = longBack ? 12.4 - Math.max(0, (y - 16) * 0.12) : 12.6 * Math.sqrt(Math.max(0, 1 - ((y - 9) / 13) ** 2));
    const shift = Math.round((-sw * 3 - lift * 2) * t);
    for (let x = Math.round(11.6 - half); x <= Math.round(11.6 + half); x++) {
      if (y > backLen - 2 && (x + y) % 3 === 0) continue;
      const tip = y > backLen - 3;
      behind.set(ox + x + shift, oy + y, tip ? h[1] : x < 3 ? h[2] : x > 20 ? h[0] : h[1]);
    }
  }
  if (st === 'ponytail') {
    // 高馬尾：綁在後腦勺（左上）、粗粗的一大束往後（左）甩下來
    bigTail(behind, P(2, 2), P(-8 - sw * 1.5, 2 - lift * 2), P(-5 - sw * 3 - lift * 1.5, 26 - lift * 10), 8.4, h);
    strand(hair, P(2.2, 2.6), P(1.4, 3), P(1, 4.2), 4.2, 3, tie, (_t, s) => (s < 0 ? 4 : 2));
  }
  if (st === 'twintails') {
    // 雙馬尾：綁在頭頂兩側；近側（左）一大束在前面、遠側（右）較暗在後面
    bigTail(behind, P(21, 3), P(27 - sw * 1.2, 4 - lift * 2), P(25 - sw * 2.4 - lift, 27 - lift * 9), 7, darker(h));
    bigTail(behind, P(2, 3), P(-5 - sw * 1.2, 4 - lift * 2), P(-3 - sw * 2.4 - lift * 1.2, 29 - lift * 10), 8.4, h);
    strand(hair, P(2.4, 3.4), P(1.6, 3.6), P(1.2, 4.8), 4.2, 3, tie, (_t, s) => (s < 0 ? 4 : 2));
    strand(hair, P(21, 3.4), P(21.6, 3.6), P(22, 4.8), 3.6, 2.6, tie, (_t, s) => (s < 0 ? 3 : 2));
  }
  if (st === 'braid') {
    // 近側（左）鬢髮垂到胸前的麻花辮
    const bx = ox + 1, by = oy + 16;
    for (let k = 0; k < 13; k++) {
      const y = by + k - Math.round(lift * k * 0.4), x = bx + Math.round((k / 13) * 2) - Math.round((sw + lift) * k * 0.2);
      const ph = k % 3;
      hair.set(x - 1, y, ph === 0 ? h[3] : ph === 1 ? h[2] : h[1]);
      hair.set(x, y, ph === 0 ? h[2] : ph === 1 ? h[3] : h[1]);
      hair.set(x + 1, y, ph === 0 ? h[1] : ph === 1 ? h[1] : h[2]);
      if (ph === 2) hair.set(x, y, h[0]);
    }
    const ty = by + 13 - Math.round(lift * 5), tx = bx + 2 - Math.round((sw + lift) * 2.6);
    hair.set(tx - 1, ty, tie[3]); hair.set(tx, ty, tie[4]); hair.set(tx + 1, ty, tie[2]);
    hair.set(tx, ty + 1, h[2]); hair.set(tx - 1, ty + 1, h[3]); hair.set(tx, ty + 2, h[1]);
  }
  if (st === 'odango' && !cov.top) {
    disc(hair, ox + 3.4, oy + 0.4, 4.4, h);
    disc(behind, ox + 20.4, oy + 0.4, 4, darker(h));
    hair.set(ox + 6, oy + 3, tie[3]); hair.set(ox + 7, oy + 2, tie[4]); hair.set(ox + 5, oy + 4, tie[2]);
  }
  if (st === 'hime') {
    // 姬髮：兩側齊長的一片（切在下巴）
    for (let y = 8; y <= 21; y++) for (const [x0, x1] of [[-1, 2], [21, 23]]) for (let x = x0; x <= x1; x++) hair.set(ox + x, oy + y, y === 21 ? h[1] : x === x0 ? h[3] : x === x1 ? h[1] : h[2]);
  }
  if (st === 'spiky') {
    // 刺蝟頭：五根粗刺往上 / 往後（左）
    const sp: [Pt, Pt, number][] = [[[3, 2], [-4, -4], 6], [[8, -1], [6, -8], 5.6], [[14, -1], [16, -7], 5], [[19, 1], [25, -3], 4.4], [[1, 8], [-5, 7], 4.6]];
    for (const [s, t, w] of sp.filter(([q]) => !cov.top || q[1] >= 6)) strand(hair, P(s[0], s[1]), P((s[0] + t[0]) / 2, (s[1] + t[1]) / 2 - 0.5), P(t[0] - sw, t[1] - lift), w, 0.6, h, (tt, ss) => (tt > 0.75 ? 1 : ss < -0.25 ? 3 : ss > 0.45 ? 1 : 2));
  }
  if (st === 'messy') {
    const sp: [Pt, Pt][] = [[[3, 1], [-1, -3]], [[11, -1], [11.5, -4.5]], [[20, 2], [24, -1]], [[0, 9], [-3, 9]]];
    for (const [s, t] of sp.filter(([q]) => !cov.top || q[1] >= 5)) strand(hair, P(s[0], s[1]), P((s[0] + t[0]) / 2, (s[1] + t[1]) / 2), P(t[0] - sw * 0.5, t[1] - lift * 0.5), 4.2, 0.8, h, (tt, ss) => (tt > 0.65 ? 1 : ss < 0 ? 3 : 2));
  }
  // 呆毛
  if (a.ahoge && acc !== 'hood' && !cov.top) {
    strand(hair, P(12, -1), P(11 + sw * 0.5, -7 - lift), P(16, -6.5 - lift), 2.4, 0.9, h, (t) => (t < 0.45 ? 3 : t > 0.85 ? 1 : 2));
  }
  hair.softOutline();
  skin.softOutline();
  const head = new Bmp(front.w, front.h);
  head.blit(skin, 0, 0);
  head.blit(hair, 0, 0);
  o.trace?.push('frontHair');
  const gear = new Bmp(front.w, front.h);
  if (o.gear && armorSet(o.gear)) helmetArt(gear, o.gear, ox, oy, o.f ?? 0);
  if (!o.gear && acc === 'hood') hood(gear, behind, a, ox, oy);
  gear.softOutline();
  head.blit(gear, 0, 0);
  if (o.sweat) sweat(head, ox - 2, oy + 6);
  front.blit(head, 0, 0);
  if (cov.hat) hatArt(front, cov.hat, ox, oy, 'side', m.swing);
  if (o.gear) o.trace?.push('headgear');
  sideAcc(front, a, st, acc, ox, oy);
  if (a.glasses) glasses(front, ox + look, oy);
  o.trace?.push('frontAcc');
  if (o.face) for (let i = 0; i < skin.px.length; i++) { const v = skin.px[i]; if (v >>> 24 && front.px[i] === v) o.face.px[i] = v; }
  behind.softOutline();
  back.blit(behind, 0, 0);
}

function sweat(b: Bmp, x: number, y: number): void {
  b.set(x, y, SWEAT[2]); b.set(x, y + 1, SWEAT[1]); b.set(x - 1, y + 1, SWEAT[1]); b.set(x, y + 2, SWEAT[0]); b.set(x - 1, y + 2, SWEAT[1]);
}

function glasses(b: Bmp, ox: number, oy: number): void {
  const g = GLASSES;
  for (const ex of [EYE_NEAR, EYE_FAR]) {
    for (let x = ex - 1; x <= ex + 2; x++) { b.set(ox + x, oy + EYE_Y - 1, g); b.set(ox + x, oy + EYE_Y + 4, g); }
    for (let y = EYE_Y - 1; y <= EYE_Y + 4; y++) { b.set(ox + ex - 1, oy + y, g); b.set(ox + ex + 2, oy + y, g); }
  }
  b.set(ox + EYE_NEAR + 3, oy + EYE_Y, g); b.set(ox + EYE_NEAR + 4, oy + EYE_Y, g); b.set(ox + EYE_NEAR + 5, oy + EYE_Y, g);
  b.set(ox + EYE_NEAR + 2, oy + EYE_Y, hex('#ffffff'));
}

function bow(b: Bmp, x: number, y: number, r: RGB[], big = false): void {
  const s = new Bmp(b.w, b.h);
  if (big) grid(s, ['bb...bb', 'bBb.bBb', 'bbbkbbb', 'bkb.bkb', '.b...b.'], { b: r[3], B: r[4], k: r[2] }, x - 3, y - 2);
  else grid(s, ['bb.bb', 'bBkBb', 'bk.kb'], { b: r[3], B: r[4], k: r[2] }, x - 2, y - 1);
  s.softOutline();
  b.blit(s, 0, 0);
}

function sideAcc(b: Bmp, a: Appearance, st: string, acc: string, ox: number, oy: number): void {
  const r = clothRamp(a.color2);
  if (acc === 'ribbon') {
    if (st === 'twintails') { bow(b, ox + 2, oy + 3, r); return; }
    if (st === 'ponytail') { bow(b, ox + 2, oy + 2, r); return; }
    if (st === 'odango') { bow(b, ox + 7, oy + 2, r); return; }
    bow(b, ox + 5, oy, r, true);
  } else if (acc === 'catears') {
    const s = new Bmp(b.w, b.h), c = clothRamp(a.color2), pink = hex('#ffc8dc');
    for (let x = 2; x <= 21; x++) s.set(ox + x, oy - 1 + (x < 5 || x > 18 ? 1 : 0), c[2]);
    grid(s, ['..e.', '.ee.', 'epee', 'eppe', 'eEee'], { e: c[3], E: c[4], p: pink }, ox + 2, oy - 6);
    grid(s, ['.e..', '.ee.', 'eepe', 'eppe', 'eeee'], { e: c[2], p: pink }, ox + 17, oy - 6);
    s.softOutline();
    b.blit(s, 0, 0);
  } else if (acc === 'clip') {
    const s = new Bmp(b.w, b.h), y = hex('#ffd86a'), w = hex('#fff4c0'), o = hex('#e8701c');
    grid(s, ['..y..', '.yyy.', 'ywWyo', '.yoy.', '.o.o.'], { y, w, W: hex('#ffffff'), o }, ox + 3, oy + 5);
    s.softOutline();
    b.blit(s, 0, 0);
  } else if (acc === 'flower') {
    const s = new Bmp(b.w, b.h), p = hex('#ffc8dc'), pd = hex('#e890b0'), c = GOLD, lf = CR.green;
    grid(s, ['.pp.', 'pPcp', 'pccd', '.pd.', 'g..g'], { p, P: hex('#ffffff'), c, d: pd, g: lf[3] }, ox, oy + 4);
    s.softOutline();
    b.blit(s, 0, 0);
  }
}

/** 兜帽：蓋住頭頂與兩側，前面開口露出臉與瀏海；帽沿亮一階、內側一道暗影；帽尖垂在後面 */
function hood(head: Bmp, behind: Bmp, a: Appearance, ox: number, oy: number): void {
  const c = clothRamp(a.color1);
  const opening = (x: number, y: number): boolean => {
    const nx = (x + 0.5 - 12.4) / 10.6, ny = (y + 0.5 - 15) / 9.6;
    return nx * nx + ny * ny <= 1 && y >= 5;
  };
  for (let y = -4; y <= 24; y++) for (let x = -4; x <= 27; x++) {
    const nx = (x + 0.5 - CAP.cx) / 14, ny = (y + 0.5 - 11) / 13.2;
    if (nx * nx + ny * ny > 1 || opening(x, y)) continue;
    const rim = opening(x + 1, y) || opening(x - 1, y) || opening(x, y + 1);
    const v = -(nx * 0.55 + ny * 0.85);
    head.set(ox + x, oy + y, rim ? c[4] : v > 0.45 ? c[4] : v > -0.25 ? c[3] : v > -0.6 ? c[2] : c[1]);
  }
  strand(behind, [ox - 2, oy + 8], [ox - 8, oy + 13], [ox - 6, oy + 21], 5, 1.6, c, (t, s) => (t > 0.8 ? 1 : s < -0.3 ? 3 : 2));
}

export function drawHead(back: Bmp, front: Bmp, ox: number, oy: number, o: HeadOpts): void {
  frontHead(back, front, o, ox, oy);
}
export { BRIM };
