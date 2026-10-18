// avatarHead.ts — 角色的頭（純 Bmp，無 DOM）：日系 Q 版大頭（18×18）、大眼（睫毛 / 瞳孔漸層 / 高光）、腮紅、小嘴，
// 九種髮型（瀏海 / 鬢角 / 後髮 / 馬尾 / 雙馬尾 / 辮子 / 丸子 / 刺蝟 / 亂翹）+ 呆毛 + 天使光環高光，
// 頭飾（蝴蝶結 / 貓耳 / 髮夾 / 兜帽 / 小花）、眼鏡、頭盔（防具）；側面（面向右）與背面（爬繩時）兩種視角。
//   back 圖層：畫在身體後面的頭髮（後髮、遠側馬尾 / 丸子）；front 圖層：頭、臉、瀏海、近側馬尾、飾品。
//   座標：頭的區域座標 (0..17, 0..17)，(ox, oy) = 區域原點在畫布上的位置。光從左上。
import { Bmp, INK, hex, type RGB } from './pixel';
import type { Appearance } from '../engine/appearance';
import { HAIR_STYLES, ACCESSORIES } from '../engine/appearance';
import type { DollPiece } from '../engine/doll';
import { R as CR } from './combatArt';
import { HAT_HIDES_TOP, armorSet, hatArt, helmetArt, lookId } from './avatarGear';
import { BLUSH, EYE_WHITE, GLASSES, GOLD, MOUTH, SWEAT, TONGUE, clothRamp, darker, eyeRamp, hairRamp, skinRamp } from './avatarPalette';

export type Expr = 'normal' | 'blink' | 'hurt' | 'effort' | 'dead' | 'happy';
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
}

// ── 頭型（每列 [左, 右]） ─────────────────────────────────
const HEAD_ROWS: readonly [number, number][] = [
  [5, 12], [3, 14], [2, 15], [1, 16], [1, 16], [0, 17], [0, 17], [0, 17], [0, 17],
  [0, 17], [0, 17], [0, 17], [1, 17], [1, 17], [2, 16], [3, 16], [5, 15], [8, 13],
];
const inSkull = (x: number, y: number): boolean => { const r = HEAD_ROWS[y]; return Boolean(r) && x >= r[0] && x <= r[1]; };
/** 髮量的外框（比頭大一圈） */
const inCap = (x: number, y: number, k = 1): boolean => {
  const nx = (x + 0.5 - 8.6) / (10 * k), ny = (y + 0.5 - 7.8) / (9.4 * k);
  return nx * nx + ny * ny <= 1;
};

// ── 髮型定義 ─────────────────────────────────────────────
/** 瀏海下緣：x = 6..18 每欄「臉從第幾列開始露出」 */
const BANGS = {
  tips: [9, 8, 7, 9, 6, 7, 9, 6, 7, 8, 6, 6, 4],
  blunt: [9, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 7, 6],
  swept: [9, 9, 8, 8, 7, 8, 6, 6, 7, 5, 5, 4, 3],
  spiky: [10, 7, 9, 6, 5, 9, 6, 5, 8, 5, 5, 7, 4],
  parted: [9, 9, 8, 7, 6, 5, 4, 5, 6, 7, 8, 7, 5],
  messy: [9, 8, 9, 6, 7, 8, 6, 8, 6, 7, 6, 5, 4],
} as const;
type BangKind = keyof typeof BANGS;
interface HairDef {
  bang: BangKind;
  /** 近側鬢角下緣（0 = 沒有）、遠側鬢角下緣 */
  nearLock: number; farLock: number;
  /** 後腦勺頭髮的下緣（x ≤ 5） */
  back: number;
  /** 露出耳朵 */
  ear: boolean;
}
const HAIR: Record<string, HairDef> = {
  bob: { bang: 'tips', nearLock: 15, farLock: 13, back: 16, ear: false },
  twintails: { bang: 'tips', nearLock: 13, farLock: 11, back: 13, ear: false },
  ponytail: { bang: 'swept', nearLock: 12, farLock: 10, back: 11, ear: true },
  long: { bang: 'parted', nearLock: 17, farLock: 14, back: 17, ear: false },
  hime: { bang: 'blunt', nearLock: 14, farLock: 14, back: 17, ear: false },
  spiky: { bang: 'spiky', nearLock: 11, farLock: 9, back: 13, ear: true },
  messy: { bang: 'messy', nearLock: 12, farLock: 10, back: 14, ear: true },
  braid: { bang: 'tips', nearLock: 12, farLock: 12, back: 14, ear: false },
  odango: { bang: 'swept', nearLock: 13, farLock: 11, back: 11, ear: true },
};
const styleId = (a: Appearance): string => HAIR_STYLES[a.hair]?.id ?? 'bob';
const accId = (a: Appearance): string => ACCESSORIES[a.acc]?.id ?? 'none';

// ── 小工具 ───────────────────────────────────────────────
type Pt = [number, number];
/**
 * 粗細漸變的二次貝茲曲線（馬尾 / 辮子 / 呆毛）。光從左：曲線法線往右 = 暗面。
 * shade(t, s) → 色階索引（t = 0..1 沿曲線、s = −1..1 橫向）。
 */
function strand(b: Bmp, p0: Pt, p1: Pt, p2: Pt, w0: number, w1: number, pal: RGB[], shade?: (t: number, s: number) => number): void {
  const len = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]) + Math.hypot(p2[0] - p1[0], p2[1] - p1[1]);
  const n = Math.max(8, Math.ceil(len * 3));
  const f = shade ?? ((t: number, s: number): number => (t > 0.86 ? 1 : s < -0.4 ? 3 : s > 0.35 ? 1 : 2));
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
        const s = r > 0 ? (px * nx + py * ny) / Math.max(0.5, r) : 0;
        b.set(xx, yy, pal[Math.max(0, Math.min(pal.length - 1, f(t, s)))]);
      }
    }
  }
}
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

// ── 眼睛（近眼 4 寬：第 0 欄是外眼角；遠眼 3 寬：最後一欄是外眼角）────────
// L 睫毛、D 瞳深、M 瞳中、B 瞳淺（下半漸亮）、H 高光、W 眼白
const EYES: Record<string, { near: string[]; far: string[]; y: number }> = {
  round: { y: 8, near: ['LLLL', '.HDD', 'WDMM', '.MBB'], far: ['LLL', 'HD.', 'DM.', 'MB.'] },
  sharp: { y: 7, near: ['L...', '.LLL', '.HDD', '.DMM', '..BB'], far: ['..L', 'LL.', 'HD.', 'DM.', 'B..'] },
  droopy: { y: 8, near: ['.LLL', 'LHDD', '.DMM', '.MBB'], far: ['LL.', 'HDL', 'DM.', 'MB.'] },
  blink: { y: 10, near: ['.LLL'], far: ['LL.'] },
  happy: { y: 9, near: ['..L.', '.L.L'], far: ['L.', '.L'] },
  hurt: { y: 8, near: ['.L..', '..LL', '.L..'], far: ['..L', 'LL.', '..L'] },
  dead: { y: 8, near: ['.L.L', '..L.', '.L.L'], far: ['L.L', '.L.', 'L.L'] },
};

function face(b: Bmp, a: Appearance, expr: Expr, ox: number, oy: number): void {
  const e = eyeRamp(a.eyes), sk = skinRamp(a.skin);
  const kind = expr === 'blink' ? 'blink' : expr === 'happy' ? 'happy' : expr === 'hurt' ? 'hurt' : expr === 'effort' ? 'sharp' : expr === 'dead' ? 'dead' : (['round', 'sharp', 'droopy'][a.eyeShape] ?? 'round');
  const g = EYES[kind];
  const pal = { L: INK, D: e[0], M: e[1], B: e[2], H: EYE_WHITE, W: EYE_WHITE };
  grid(b, g.near, pal, ox + 8, oy + g.y);
  grid(b, g.far, pal, ox + 14, oy + g.y);
  // 腮紅（每邊兩格，閉眼開心時多一點）
  const bl = BLUSH[a.skin] ?? BLUSH[1];
  b.set(ox + 9, oy + 12, bl); b.set(ox + 10, oy + 12, bl);
  b.set(ox + 15, oy + 12, bl); b.set(ox + 16, oy + 12, bl);
  // 嘴
  if (expr === 'hurt' || expr === 'effort') {
    b.set(ox + 13, oy + 13, MOUTH); b.set(ox + 14, oy + 13, MOUTH); b.set(ox + 13, oy + 14, TONGUE); b.set(ox + 14, oy + 14, MOUTH);
  } else if (expr === 'happy') {
    b.set(ox + 13, oy + 13, MOUTH); b.set(ox + 14, oy + 13, MOUTH); b.set(ox + 14, oy + 14, TONGUE);
  } else if (expr === 'dead') {
    b.set(ox + 13, oy + 14, sk[0]); b.set(ox + 14, oy + 14, sk[0]);
  } else {
    // 嘴：比膚色深一階的短線（不用最暗那階，淺膚色上不會像髒點）
    b.set(ox + 14, oy + 14, sk[1]); b.set(ox + 13, oy + 14, sk[2]);
  }
}

// ── 側面：頭髮遮罩 ───────────────────────────────────────
/** 側面髮型的主體（cap + 瀏海 + 鬢角 + 後腦勺），回傳區域座標的判斷式 */
function sideHairMask(st: string): (x: number, y: number) => number {
  const d = HAIR[st] ?? HAIR.bob;
  const bang = BANGS[d.bang];
  // 0 = 沒有、1 = 頂髮 / 瀏海、2 = 鬢角、3 = 後腦勺
  return (x, y) => {
    if (y < -3 || y > 18 || x < -3 || x > 19) return 0;
    if (d.ear && x >= 4 && x <= 6 && y >= 9 && y <= 11) return 0;
    const cap = inCap(x, y);
    if (x >= 6 && x <= 18) {
      const by = bang[x - 6];
      if (y < by) return cap || (y >= 0 && inSkull(x, y)) ? 1 : 0;
      // 近側鬢角（x 6..7）、遠側鬢角（x 17..18）
      if (x <= 7 && y < d.nearLock && (x === 6 || y < d.nearLock - 1) && !(d.ear && x === 6 && y <= 11)) return 2;
      if (x >= 17 && y < d.farLock && (x === 18 || y >= d.farLock - 3) && y > 4) return 2;
      return 0;
    }
    // 後腦勺（x ≤ 5）：頭頂到 back；下緣後角修圓
    if (y >= d.back - 3 && x <= -1 + (y - (d.back - 4))) return 0;
    if (!cap && !(y >= 0 && inSkull(x + 1, y))) {
      // 下緣往內收的鮑伯髮尾
      return y < d.back && y >= 10 && x >= -1 && inCap(x, Math.min(y, 12), 1.08) ? 3 : 0;
    }
    if (y >= d.back) return 0;
    // 鮑伯：最下兩列往內收
    if (y >= d.back - 1 && (x <= -1 || x >= 5)) return 0;
    return y >= 10 ? 3 : 1;
  };
}

/** 頂髮的打光：左上亮、右下暗，天使光環一圈斷續的高光 */
function capShade(x: number, y: number, h: RGB[]): RGB {
  const nx = (x + 0.5 - 8.6) / 10, ny = (y + 0.5 - 7.8) / 9.4;
  const d = Math.hypot(nx, ny);
  if (ny < -0.15 && d > 0.5 && d < 0.68) {
    const ang = Math.atan2(ny, nx);
    const seg = Math.floor((ang + Math.PI) / 0.32);
    if (seg % 3 !== 2) return ang < -1.9 ? h[4] : h[3];
  }
  const v = 0.55 - 0.5 * (nx * 0.55 + ny * 0.85);
  return v > 0.92 ? h[3] : v > 0.38 ? h[2] : h[1];
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
  const head = new Bmp(front.w, front.h);
  // 臉：頭型 + 遠側臉頰 / 下巴陰影
  for (let y = 0; y < HEAD_ROWS.length; y++) {
    const [x0, x1] = HEAD_ROWS[y];
    for (let x = x0; x <= x1; x++) {
      const sh = (x === x1 && y >= 5 && y <= 14) || y >= 16 || (y === 15 && x >= 14);
      head.set(ox + x, oy + y, sh ? sk[2] : sk[3]);
    }
  }
  // 脖子
  head.rect(ox + 8, oy + 18, 4, 2, sk[2]);
  // 耳朵
  const def = HAIR[st] ?? HAIR.bob;
  // 頭髮主體
  const mask = sideHairMask(st);
  const hair = new Bmp(front.w, front.h);
  const hairOn = (x: number, y: number): number => mask(x, y);
  for (let y = -3; y <= 18; y++) for (let x = -3; x <= 19; x++) {
    const k = hairOn(x, y);
    if (!k) continue;
    let c: RGB;
    if (k === 1) {
      c = capShade(x, y, h);
      // 瀏海尖端暗一階、髮束分線
      if (x >= 6 && x <= 18) {
        const by = BANGS[def.bang][x - 6];
        if (y === by - 1) c = h[1];
        const l = BANGS[def.bang][x - 7] ?? 99, r = BANGS[def.bang][x - 5] ?? 99;
        if (y >= by - 3 && y < by - 1 && by < l && by < r && y >= 3) c = h[1];
      }
    } else if (k === 2) c = y >= (x <= 7 ? def.nearLock : def.farLock) - 2 ? h[1] : x === 6 || x === 17 ? h[3] : h[2];
    else c = x <= 0 ? h[2] : h[1];
    hair.set(ox + x, oy + y, c);
  }
  // 瀏海下緣在額頭投下的陰影
  for (let x = 6; x <= 17; x++) {
    const by = BANGS[def.bang][x - 6];
    if (inSkull(x, by) && !hairOn(x, by)) head.set(ox + x, oy + by, sk[2]);
  }
  if (def.ear) {
    head.set(ox + 5, oy + 9, sk[3]); head.set(ox + 6, oy + 9, sk[3]);
    head.set(ox + 4, oy + 10, sk[3]); head.set(ox + 5, oy + 10, sk[2]); head.set(ox + 6, oy + 10, sk[3]);
    head.set(ox + 5, oy + 11, sk[2]); head.set(ox + 6, oy + 11, sk[2]);
  }
  face(head, a, o.expr, ox, oy);
  o.trace?.push('face');

  // ── 髮型特色 ──
  const behind = new Bmp(back.w, back.h);
  const P = (x: number, y: number): Pt => [ox + x, oy + y];
  const tie = clothRamp(a.color2);
  if (st === 'long' || st === 'hime') {
    // 直長髮：垂在背後到腰，尾端分幾束尖
    for (let y = 9; y <= 33; y++) {
      const t = (y - 9) / 24, wave = Math.round(Math.sin(y * 0.45) * 0.4 + sw * t * 2.2 - lift * t * 3);
      const x0 = -2 + Math.round(t * 1.2) + wave, x1 = 7 - Math.round(t * 2) + Math.round(sw * t);
      for (let x = x0; x <= x1; x++) {
        if (y >= 31 && (x - x0) % 3 === 2) continue;
        if (y === 33 && (x - x0) % 3 !== 1) continue;
        const c = x === x0 ? h[3] : x >= x1 - 1 ? h[0] : y > 26 ? h[1] : (x === x0 + 1 && y > 12 && y < 16) ? h[4] : h[2];
        behind.set(ox + x, oy + y - Math.round(lift * t * 4), c);
      }
    }
  }
  if (st === 'ponytail') {
    const end: Pt = P(-5 - sw * 4 - lift * 2, 21 - lift * 9);
    strand(behind, P(0, 2), P(-8 - sw * 2, 2 - lift * 2), end, 5, 1.2, h);
    strand(hair, P(1, 2), P(-1, 2), P(-1.5, 3), 3, 2, tie, (_t, s) => (s < 0 ? 4 : 3));
  }
  if (st === 'twintails') {
    // 遠側（較暗、在後面）+ 近側
    strand(behind, P(4, 0), P(-4 - sw * 2, -1 - lift * 2), P(-2 - sw * 4 - lift, 19 - lift * 8), 4.5, 1.2, darker(h));
    strand(behind, P(2, 3), P(-7 - sw * 2, 2 - lift * 2), P(-5 - sw * 5 - lift * 2, 22 - lift * 9), 5, 1.2, h);
    strand(hair, P(2.5, 2.5), P(1.5, 2.5), P(1, 3.5), 3, 2, tie, (_t, s) => (s < 0 ? 4 : 3));
  }
  if (st === 'braid') {
    // 從近側鬢角垂到胸前的麻花辮
    const bx = ox + 6, by = oy + 12;
    const swing = Math.round(sw * 1.5);
    for (let k = 0; k < 13; k++) {
      const y = by + k, x = bx + Math.round((k / 13) * (1 + swing)) - Math.round(lift * k * 0.25);
      const odd = (k & 1) === 1;
      hair.set(x - 1, y - Math.round(lift * k * 0.4), odd ? h[2] : h[3]);
      hair.set(x, y - Math.round(lift * k * 0.4), odd ? h[1] : h[2]);
      hair.set(x + 1, y - Math.round(lift * k * 0.4), odd ? h[2] : h[1]);
    }
    const ty = by + 13 - Math.round(lift * 5), tx = bx + 1 + swing - Math.round(lift * 3);
    hair.set(tx - 1, ty, tie[3]); hair.set(tx, ty, tie[3]); hair.set(tx + 1, ty, tie[2]);
    hair.set(tx - 1, ty + 1, h[2]); hair.set(tx, ty + 1, h[2]); hair.set(tx, ty + 2, h[1]); hair.set(tx + 1, ty + 1, h[1]);
  }
  if (st === 'odango' && !cov.top) {
    disc(behind, ox + 9.5, oy - 1.2, 3.3, darker(h));
    disc(hair, ox + 3, oy + 1, 3.6, h);
    hair.set(ox + 5, oy + 3, tie[3]); hair.set(ox + 6, oy + 2, tie[3]); hair.set(ox + 4, oy + 4, tie[2]);
  }
  if (st === 'spiky') {
    const sp: [Pt, Pt, number][] = [[[2, 1], [-3, -3], 4.5], [[6, -1], [4, -5], 4], [[11, -1], [12, -5], 3.5], [[0, 6], [-5, 4], 4], [[0, 10], [-4, 13], 3.2], [[15, 1], [18, -2], 3]];
    for (const [s, t, w] of sp.filter(([q]) => !cov.top || q[1] >= 6)) strand(hair, P(s[0], s[1]), P((s[0] + t[0]) / 2, (s[1] + t[1]) / 2 - 0.5), P(t[0] - sw, t[1] - lift), w, 0.6, h, (tt, ss) => (tt > 0.7 ? 1 : ss < -0.2 ? 3 : 2));
  }
  if (st === 'messy') {
    const sp: [Pt, Pt][] = [[[2, 0], [0, -2]], [[7, -1], [7, -3]], [[12, 0], [14, -2]], [[-1, 5], [-3, 4]], [[0, 11], [-2, 14]], [[3, 13], [2, 16]]];
    for (const [s, t] of sp.filter(([q]) => !cov.top || q[1] >= 5)) strand(hair, P(s[0], s[1]), P((s[0] + t[0]) / 2, (s[1] + t[1]) / 2), P(t[0] - sw * 0.5, t[1] - lift * 0.5), 2.6, 0.6, h, (tt, ss) => (tt > 0.6 ? 1 : ss < 0 ? 3 : 2));
  }
  // 呆毛
  if (a.ahoge && acc !== 'hood' && !cov.top) {
    strand(hair, P(9, 0), P(9 + sw * 0.5, -5 - lift), P(12.5, -3.5 - lift), 1.8, 1, h, () => 2);
    hair.set(ox + 9, oy - 1, h[3]);
  }
  head.blit(hair, 0, 0);
  o.trace?.push('frontHair');
  // 頭盔 / 兜帽 蓋在頭髮上（帽子另外描邊）
  headGear(head, o, ox, oy);
  if (!o.gear && acc === 'hood') hood(head, behind, a, ox, oy, 'side');
  head.outline(INK);
  if (o.sweat) sweat(head, ox - 1, oy + 2);
  front.blit(head, 0, 0);
  if (cov.hat) hatArt(front, cov.hat, ox, oy, 'side', m.swing);
  if (o.gear) o.trace?.push('headgear');
  // 飾品（各自描邊）
  sideAcc(front, a, st, acc, ox, oy);
  if (a.glasses) glasses(front, ox, oy);
  o.trace?.push('frontAcc');
  behind.outline(INK);
  back.blit(behind, 0, 0);
}

function sweat(b: Bmp, x: number, y: number): void {
  b.set(x, y, SWEAT[2]); b.set(x, y + 1, SWEAT[1]); b.set(x - 1, y + 1, SWEAT[1]); b.set(x, y + 2, SWEAT[0]); b.set(x - 1, y + 2, SWEAT[1]);
}

function glasses(b: Bmp, ox: number, oy: number): void {
  const g = GLASSES;
  for (let x = 8; x <= 12; x++) { b.set(ox + x, oy + 7, g); }
  for (let x = 9; x <= 11; x++) b.set(ox + x, oy + 12, g);
  for (let y = 8; y <= 11; y++) { b.set(ox + 8, oy + y, g); b.set(ox + 12, oy + y, g); }
  for (let x = 13; x <= 16; x++) b.set(ox + x, oy + 7, g);
  b.set(ox + 13, oy + 8, g); b.set(ox + 13, oy + 9, g); b.set(ox + 13, oy + 10, g);
  b.set(ox + 14, oy + 12, g); b.set(ox + 15, oy + 12, g); b.set(ox + 16, oy + 11, g);
  b.set(ox + 7, oy + 9, g);
  // 鏡片反光
  b.set(ox + 12, oy + 8, hex('#ffffff'));
}

function bow(b: Bmp, x: number, y: number, r: RGB[], big = false): void {
  const s = new Bmp(b.w, b.h);
  if (big) {
    grid(s, ['bb...bb', 'bBbkbBb', 'bbbkbbb', '.b...b.'], { b: r[3], B: r[4], k: r[2] }, x - 3, y - 2);
  } else {
    grid(s, ['bb.bb', 'bBkBb', 'b...b'], { b: r[3], B: r[4], k: r[2] }, x - 2, y - 1);
  }
  s.outline(INK);
  b.blit(s, 0, 0);
}

function sideAcc(b: Bmp, a: Appearance, st: string, acc: string, ox: number, oy: number): void {
  const r = clothRamp(a.color2);
  if (acc === 'ribbon') {
    if (st === 'twintails') { bow(b, ox + 2, oy + 2, r); return; }
    if (st === 'ponytail') { bow(b, ox + 0, oy + 1, r); return; }
    if (st === 'odango') { bow(b, ox + 5, oy + 3, r); return; }
    bow(b, ox + 4, oy, r, true);
  } else if (acc === 'catears') {
    const s = new Bmp(b.w, b.h), c = clothRamp(a.color2), pink = hex('#ffc8dc');
    // 髮箍
    for (const [x, y] of [[3, 1], [4, 0], [5, -1], [6, -1], [7, -2], [8, -2], [9, -2], [10, -2], [11, -1], [12, -1]] as Pt[]) s.set(ox + x, oy + y, c[2]);
    grid(s, ['...e', '..ee', '.epe', 'eppe', 'eeee'], { e: c[3], p: pink }, ox + 3, oy - 6);
    grid(s, ['e...', 'ee..', 'epe.', 'eeee'], { e: c[2], p: pink }, ox + 10, oy - 5);
    s.outline(INK);
    b.blit(s, 0, 0);
  } else if (acc === 'clip') {
    const s = new Bmp(b.w, b.h), y = hex('#ffd86a'), w = hex('#fff4c0');
    grid(s, ['.y.', 'ywy', '.y.'], { y, w }, ox + 6, oy + 3);
    s.set(ox + 8, oy + 5, CR.red[3]); s.set(ox + 9, oy + 6, CR.red[3]);
    s.outline(INK);
    b.blit(s, 0, 0);
  } else if (acc === 'flower') {
    const s = new Bmp(b.w, b.h), p = hex('#ffc8dc'), w = hex('#ffffff'), c = GOLD;
    grid(s, ['.p.', 'pcp', '.p.'], { p, c }, ox + 3, oy + 4);
    s.set(ox + 6, oy + 5, w); s.set(ox + 6, oy + 4, p);
    s.outline(INK);
    b.blit(s, 0, 0);
  }
}

/** 兜帽：蓋住頭頂與後腦，前面開口露出臉與瀏海；帽沿亮一階 */
function hood(head: Bmp, behind: Bmp, a: Appearance, ox: number, oy: number, view: 'side' | 'back'): void {
  const c = clothRamp(a.color1);
  const opening = (x: number, y: number): boolean => view === 'side' ? x >= 7 && y >= 3 && y <= 17 : false;
  for (let y = -3; y <= 19; y++) for (let x = -3; x <= 20; x++) {
    const nx = (x + 0.5 - 8.2) / 10.8, ny = (y + 0.5 - 8.4) / 10.4;
    if (nx * nx + ny * ny > 1 || opening(x, y)) continue;
    if (view === 'side' && y > 15 && x > 6) continue;
    const rim = view === 'side' && (opening(x + 1, y) || opening(x, y + 1) || opening(x + 1, y + 1));
    const v = -(nx * 0.55 + ny * 0.85);
    head.set(ox + x, oy + y, rim ? c[4] : v > 0.4 ? c[4] : v > -0.3 ? c[3] : c[2]);
  }
  // 帽尖垂在後面
  strand(behind, [ox - 1, oy + 6], [ox - 5, oy + 10], [ox - 4, oy + 16], 4, 1.5, c, (t, s) => (t > 0.8 ? 1 : s < -0.3 ? 3 : 2));
}


// ── 背面（爬繩時）：整顆頭都是頭髮 ─────────────────────────
function backHead(back: Bmp, front: Bmp, o: HeadOpts, ox: number, oy: number): void {
  const cov = headCover(o);
  const a = o.app, h = hairRamp(a.hairColor), sk = skinRamp(a.skin), st = styleId(a), acc = o.gear ? 'none' : accId(a), sw = o.motion.swing, lift = o.motion.lift;
  const head = new Bmp(front.w, front.h), behind = new Bmp(back.w, back.h);
  const def = HAIR[st] ?? HAIR.bob;
  const P = (x: number, y: number): Pt => [ox + x, oy + y];
  // 後頸（短髮才看得到）
  head.rect(ox + 7, oy + 15, 4, 5, sk[2]);
  const len = st === 'long' || st === 'hime' ? 17 : def.back;
  for (let y = -1; y <= 17; y++) for (let x = -1; x <= 18; x++) {
    const inHead = inCap(x + 0.2, y, 0.98) || (y >= 0 && inSkull(x, y));
    if (!inHead || y >= len) continue;
    // 鮑伯 / 長髮的下緣往內收
    if (y >= len - 1 && (x <= 0 || x >= 17)) continue;
    const nx = (x + 0.5 - 8.8) / 10, ny = (y + 0.5 - 7.8) / 9.4, d = Math.hypot(nx, ny);
    let c = capShade(x + 0.2, y, h);
    if (y > 9) c = x < 4 ? h[2] : x > 13 ? h[1] : h[2];
    // 後腦的髮流：幾條暗線往下
    if (y > 4 && (x === 5 || x === 9 || x === 13) && d > 0.35) c = h[1];
    if (y >= len - 2) c = h[1];
    head.set(ox + x, oy + y, c);
  }
  if (st === 'long' || st === 'hime') {
    for (let y = 15; y <= 29; y++) {
      const t = (y - 15) / 14, w = Math.round(t * 2), dx = Math.round(sw * t * 2);
      for (let x = 2 + w + dx; x <= 15 - w + dx; x++) {
        if (y >= 28 && (x % 3) === 0) continue;
        const c = x < 4 + w + dx ? h[3] : x > 13 - w + dx ? h[1] : (x === 7 + dx || x === 11 + dx) ? h[1] : h[2];
        head.set(ox + x, oy + y - Math.round(lift * t * 3), c);
      }
    }
  }
  const tie = clothRamp(a.color2);
  if (st === 'ponytail') {
    strand(head, P(8.5, 2), P(8.5 + sw * 3, 10 - lift * 4), P(8.5 + sw * 5, 22 - lift * 8), 5, 1.2, h);
    head.rect(ox + 7, oy + 1, 4, 2, tie[3]);
  }
  if (st === 'twintails') {
    strand(head, P(1, 3), P(-4 + sw * 2, 9 - lift * 3), P(-3 + sw * 4, 21 - lift * 8), 5, 1.2, h);
    strand(head, P(16, 3), P(21 + sw * 2, 9 - lift * 3), P(20 + sw * 4, 21 - lift * 8), 5, 1.2, h);
    head.rect(ox + 0, oy + 2, 2, 2, tie[3]); head.rect(ox + 16, oy + 2, 2, 2, tie[3]);
  }
  if (st === 'braid') strand(head, P(15, 11), P(17 + sw, 15), P(16 + sw * 2, 23 - lift * 4), 3, 1.5, h, (t) => (Math.floor(t * 10) % 2 ? 1 : 3));
  if (st === 'odango' && !cov.top) { disc(head, ox + 3, oy - 0.5, 3.4, h); disc(head, ox + 14, oy - 0.5, 3.4, h); }
  if (st === 'spiky') {
    for (const [s, t] of ([[[2, 2], [-3, -2]], [[8, -1], [8, -5]], [[14, 2], [19, -2]], [[1, 9], [-4, 10]], [[16, 9], [21, 10]]] as [Pt, Pt][]).filter(([q]) => !cov.top || q[1] >= 6)) {
      strand(head, P(s[0], s[1]), P((s[0] + t[0]) / 2, (s[1] + t[1]) / 2), P(t[0] + sw, t[1] - lift), 4, 0.6, h, (tt, ss) => (tt > 0.7 ? 1 : ss < 0 ? 3 : 2));
    }
  }
  if (st === 'messy') {
    for (const [s, t] of [[[3, 0], [1, -3]], [[9, -1], [10, -3]], [[15, 1], [17, -1]], [[2, 13], [1, 16]], [[8, 14], [8, 17]], [[14, 13], [15, 16]]] as [Pt, Pt][]) {
      strand(head, P(s[0], s[1]), P((s[0] + t[0]) / 2, (s[1] + t[1]) / 2), P(t[0] + sw * 0.5, t[1] - lift * 0.5), 2.6, 0.6, h, (tt) => (tt > 0.6 ? 1 : 2));
    }
  }
  if (a.ahoge && acc !== 'hood' && !cov.top) strand(head, P(9, 0), P(9.5, -5 - lift), P(12, -4 - lift), 1.8, 1, h, () => 2);
  headGear(head, o, ox, oy);
  if (!o.gear && acc === 'hood') hood(head, behind, a, ox, oy, 'back');
  head.outline(INK);
  front.blit(head, 0, 0);
  if (cov.hat) hatArt(front, cov.hat, ox, oy, 'back', sw);
  {
    const r = clothRamp(a.color2);
    if (acc === 'ribbon') bow(front, ox + 9, oy + 3, r, true);
    if (acc === 'catears') {
      const s = new Bmp(front.w, front.h), c = clothRamp(a.color2);
      grid(s, ['..e', '.ee', 'eee'], { e: c[3] }, ox + 2, oy - 4);
      grid(s, ['e..', 'ee.', 'eee'], { e: c[3] }, ox + 13, oy - 4);
      s.outline(INK);
      front.blit(s, 0, 0);
    }
  }
  behind.outline(INK);
  back.blit(behind, 0, 0);
}

export function drawHead(back: Bmp, front: Bmp, ox: number, oy: number, o: HeadOpts): void {
  if (o.view === 'back') backHead(back, front, o, ox, oy);
  else sideHead(back, front, o, ox, oy);
}
