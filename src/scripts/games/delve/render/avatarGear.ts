// avatarGear.ts — 紙娃娃身上的裝備畫法（純 Bmp）：3/4 正面（面向右）的 Q 版小人用。
//   六套防具的頭盔 / 胸甲 / 護腿細節、稀有度（滾邊色、寶石、傳說以上的閃光）、強化 +N（亮點）、元素詞條點綴，
//   時裝帽子（草帽 / 魔女帽 / 貝雷帽 / 女僕頭飾 / 礦工頭燈盔 / 花冠）、背飾（披風 / 羽翼 / 輕羽小翅膀 / 大蝴蝶結 / 甲殼小盾）、
//   看得見的飾品（跳躍靴 / 疾行靴、胸前墜飾、腰間小物）。光從左上；每件自己描邊（柔和的同色系外緣）。
//   頭的區域座標：24×22（0..23, 0..21；3/4 轉頭：後腦在左、臉在右前），帽沿在臉上第 8 列、往後腦斜斜往下，眼睛在第 12..15 列。
import { Bmp, hex, type RGB } from './pixel';
import type { ArmorSetId } from '../engine/items';
import { RARITIES } from '../engine/gear';
import type { DollElem, DollPiece } from '../engine/doll';
import { ARMOR_RAMP, R as CR } from './combatArt';
import { GOLD, LEATHER, WHITE, clothRamp } from './avatarPalette';
import { defaultTint, type Tint } from '../engine/tint';

/** 時裝的顏色（物品上的 tint；沒有 = 款式原色，engine/tint.ts 的原色表 = 這裡原本寫死的色） */
const tintOf = (look: string, tint: Tint | undefined): Tint => tint ?? defaultTint(look) ?? [0, 0];

export const armorSet = (p: DollPiece | null): ArmorSetId | null => (p && p.look.startsWith('armor:') ? (p.look.slice(6) as ArmorSetId) : null);
export const lookId = (p: DollPiece | null, prefix: string): string | null => (p && p.look.startsWith(prefix) ? p.look.slice(prefix.length) : null);
/** 防具 7 階 → 布料 5 階 */
export const armor5 = (s: ArmorSetId): RGB[] => {
  const r = ARMOR_RAMP[s];
  // 銅：整體壓暗一階（紅褐的銅色），和金（亮黃）分得開
  return s === 'copper' ? [r[0], r[1], r[2], r[3], r[4]] : [r[0], r[2], r[3], r[4], r[5]];
};

/** 稀有度的滾邊色（普通 = 沒有） */
export function trimOf(p: DollPiece | null): RGB | null {
  if (!p || p.rarity <= 0) return null;
  return hex(RARITIES[Math.min(RARITIES.length - 1, p.rarity)].color);
}
const ELEM: Record<DollElem, [string, string]> = {
  fire: ['#e8701c', '#ffd86a'], ice: ['#94c8ee', '#ffffff'], poison: ['#468a34', '#93cc50'], light: ['#ffd86a', '#fff4c0'], storm: ['#9a6ee0', '#cceaf8'],
};
export function elemOf(p: DollPiece | null): [RGB, RGB] | null {
  return p?.elem ? [hex(ELEM[p.elem][0]), hex(ELEM[p.elem][1])] : null;
}
const SPARK = hex('#ffffff');

/**
 * 稀有度 / 強化 / 元素的點綴：spots = 這件裝備上可以放點綴的位置（由亮到暗的優先序），
 * gem = 寶石的位置；f = 影格（傳說以上的閃光跟著影格換位置）。
 */
export function upgrades(b: Bmp, p: DollPiece | null, spots: [number, number][], gem: [number, number] | null, f: number, base: RGB[]): void {
  if (!p) return;
  const trim = trimOf(p), el = elemOf(p);
  if (trim) for (const s of spots) b.set(s[0], s[1], trim);
  if (el) for (let i = 1; i < spots.length; i += 4) b.set(spots[i][0], spots[i][1], (i >> 2) % 2 ? el[0] : el[1]);
  for (let k = 0; k < Math.min(3, p.plus); k++) { const s = spots[(k * 5 + 3) % spots.length]; if (s) b.set(s[0], s[1], base[base.length - 1]); }
  if (gem && (p.rarity >= 3 || p.plus >= 3)) {
    const c = trim ?? hex('#5c9ce0');
    b.set(gem[0], gem[1], c);
    if (p.rarity >= 4) b.set(gem[0] - 1, gem[1], SPARK);
  }
  if (p.rarity >= 4 && spots.length) {
    const s = spots[(f * 7) % spots.length];
    b.set(s[0], s[1], SPARK);
    if (p.rarity >= 5) { const t = spots[(f * 7 + Math.floor(spots.length / 2)) % spots.length]; b.set(t[0], t[1], hex('#fff4c0')); }
  }
}

type Pt = [number, number];
type Rows = Record<number, [number, number]>;

// ── 胸甲（3/4 正面）：套裝細節 + 共通的層次 ─────────────────────
/** rows：身體每列 [左, 右]（已經 + dx/dy 的畫布座標）；在已經填好防具底色的身體上加細節 */
export function chestDetail(b: Bmp, set: ArmorSetId, rows: Rows): void {
  const r = ARMOR_RAMP[set];
  const S = (x: number, y: number, c: RGB): void => b.set(x, y, c);
  const ys = Object.keys(rows).map(Number), y0 = Math.min(...ys), yb = Math.max(...ys);
  const [a0, a1] = rows[y0 + 1] ?? rows[y0];
  const mid = Math.round((a0 + a1) / 2) + 1;
  // 胸口的金屬高光（左上一道斜亮條）+ 胸甲中線
  for (const [x, y, c] of [[a0 + 1, y0 + 1, 6], [a0 + 2, y0 + 1, 5], [a0 + 1, y0 + 2, 5], [a0 + 2, y0 + 2, 6], [a0 + 3, y0 + 3, 5]] as [number, number, number][]) S(x, y, r[c]);
  for (let y = y0 + 1; y <= yb - 3; y++) S(mid, y, r[2]);
  // 腰帶分隔（皮帶 + 金扣）
  const by = yb - 2, [b0, b1] = rows[by] ?? rows[yb];
  for (let x = b0; x <= b1; x++) S(x, by, x === b0 ? CR.leather[4] : CR.leather[3]);
  S(mid, by, GOLD); S(mid - 1, by, hex('#fff4c0'));
  // 下擺甲片
  for (let y = by + 1; y <= yb; y++) { const [c0, c1] = rows[y] ?? rows[yb]; for (let x = c0; x <= c1; x++) S(x, y, (x - c0) % 3 === 2 ? r[1] : (x - c0) % 3 === 0 ? r[4] : r[3]); }
  switch (set) {
    case 'wood': for (const y of [y0 + 2, y0 + 4]) for (let x = a0 + 4; x <= a1 - 1; x += 2) S(x, y, r[1]); break;
    case 'copper': for (const [x, y] of [[a0 + 1, y0 + 4], [a1 - 1, y0 + 1], [a1 - 1, y0 + 4]] as Pt[]) S(x, y, r[6]); break;
    case 'iron': for (let x = a0 + 1; x <= a1 - 1; x++) S(x, y0 + 4, r[1]); break;
    case 'gold': S(mid, y0 + 2, CR.red[4]); S(mid, y0 + 3, CR.red[3]); break;
    case 'bone': for (const y of [y0 + 2, y0 + 3, y0 + 4]) for (let x = a0 + 2; x <= a1 - 1; x += 2) S(x, y, r[1]); break;
    case 'molten': for (const [x, y] of [[a0 + 3, y0 + 2], [a1 - 2, y0 + 3], [mid + 1, y0 + 4]] as Pt[]) S(x, y, CR.lava[3]); break;
  }
}
/** 胸甲上可以放點綴的位置（領口一列 + 腰帶一列） */
export function chestSpots(rows: Rows): { spots: [number, number][]; gem: [number, number] } {
  const ys = Object.keys(rows).map(Number), y0 = Math.min(...ys), yb = Math.max(...ys);
  const spots: [number, number][] = [];
  // 領口那列被大頭的下巴蓋住：滾邊放在下一列（肩線）
  const top = rows[y0 + 1] ?? rows[y0], bot = rows[yb - 2] ?? rows[yb];
  for (let x = top[0]; x <= top[1]; x++) spots.push([x, y0 + 1]);
  for (let x = bot[1]; x >= bot[0]; x--) spots.push([x, yb - 2]);
  const mid = Math.round((bot[0] + bot[1]) / 2) + 1;
  return { spots, gem: [mid, yb - 2] };
}

// ── 護腿：膝甲 ───────────────────────────────────────────
export function greaveKnee(b: Bmp, set: ArmorSetId, kx: number, ky: number): void {
  const r = ARMOR_RAMP[set];
  const x = Math.round(kx), y = Math.round(ky);
  b.set(x - 1, y, r[5]); b.set(x, y, r[5]); b.set(x + 1, y, r[3]);
  if (set === 'molten') b.set(x, y + 1, CR.lava[3]);
  if (set === 'gold') b.set(x, y, r[6]);
  if (set === 'bone') b.set(x + 1, y - 1, r[5]);
}

// ── 頭盔 ─────────────────────────────────────────────────
/** 頭髮 / 頭盔的球心與半徑（頭的區域座標，頭 24×22；3/4 轉頭：後腦在左、臉在右前） */
export const CAP = { cx: 10.6, cy: 8.4, rx: 11.8, ry: 10 };
export const inCap = (x: number, y: number, k = 1): boolean => {
  const nx = (x + 0.5 - CAP.cx) / (CAP.rx * k), ny = (y + 0.5 - CAP.cy) / (CAP.ry * k);
  return nx * nx + ny * ny <= 1;
};
/** 帽沿在臉上的那一列（瀏海露在帽沿下面一點、眼睛完整露出） */
export const BRIM = 6;
/** 3/4 轉頭的帽沿：臉的上緣（右前）在 BRIM、往後腦（左）斜斜往下蓋到耳後 */
export const brimAt = (x: number): number => (x >= 10 ? BRIM : x >= 7 ? BRIM + Math.round((10 - x) * 1.4) : BRIM + 5);
/** 實心三角（頭盔的角 / 刺 / 冠脊）；col(x, y, side)：side > 0 = 靠 a 那半邊 */
function triS(S: (x: number, y: number, c: RGB) => void, a: Pt, b: Pt, c: Pt, col: (x: number, y: number, side: number) => RGB): void {
  const x0 = Math.floor(Math.min(a[0], b[0], c[0])), x1 = Math.ceil(Math.max(a[0], b[0], c[0])), y0 = Math.floor(Math.min(a[1], b[1], c[1])), y1 = Math.ceil(Math.max(a[1], b[1], c[1]));
  const s = (p1: Pt, p2: Pt, x: number, y: number): number => (p2[0] - p1[0]) * (y - p1[1]) - (p2[1] - p1[1]) * (x - p1[0]);
  const m: Pt = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    const px = x + 0.5, py = y + 0.5, d1 = s(a, b, px, py), d2 = s(b, c, px, py), d3 = s(c, a, px, py);
    if ((d1 < 0 || d2 < 0 || d3 < 0) && (d1 > 0 || d2 > 0 || d3 > 0)) continue;
    S(x, y, col(x, y, Math.sign(s(m, c, px, py) * s(m, c, a[0], a[1]))));
  }
}
/** 內描邊：最外一圈換成深色（上 / 前緣用中間色、下 / 後緣用最深色） */
function inline(b: Bmp, x0: number, y0: number, x1: number, y1: number, lit: RGB, dark: RGB): void {
  const src = b.clone();
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    if (!src.on(x, y)) continue;
    const up = !src.on(x, y - 1), dn = !src.on(x, y + 1), lf = !src.on(x - 1, y), rt = !src.on(x + 1, y);
    if (!(up || dn || lf || rt)) continue;
    b.set(x, y, (up && !lf) || (rt && !dn) ? lit : dark);
  }
}
/**
 * 頭盔（3/4 轉頭，面向右）：圓頂順著頭型（後腦蓋得比較低、前面停在額頭），光從前上方；帽沿斜斜一道，
 * 再依套裝加輪廓——木：皮帶箍；銅：鼻樑護條（在臉的中線）+ 鉚釘 + 前 / 後護頰；鐵：偏前的中脊 + 鼻樑護條 + 護頰；
 * 金：扇形冠脊 + 往後飄的紅羽；骸衛：前後兩支往上彎的角；熔心：頭頂三根尖刺（尖端熔岩）+ 護頰。
 */
export function helmetArt(head: Bmp, p: DollPiece, ox: number, oy: number, f: number, _view: 'side' | 'back' = 'side'): void {
  const set = armorSet(p)!;
  const r = ARMOR_RAMP[set], m = armor5(set);
  const g = new Bmp(head.w, head.h);
  const S = (x: number, y: number, c: RGB): void => g.set(ox + x, oy + y, c);
  for (let y = -3; y <= BRIM + 5; y++) for (let x = -2; x <= 23; x++) {
    if (!inCap(x, y, 1.05) || y > brimAt(x)) continue;
    const nx = (x + 0.5 - 11) / 12, ny = (y + 0.5 - 7) / 10, L = 0.45 * nx - 0.9 * ny;
    S(x, y, L > 0.95 ? m[4] : L > 0.45 ? m[3] : L > -0.1 ? m[2] : m[1]);
  }
  // 金屬高光：頭頂偏前一道斜的短筆
  for (const [x, y] of [[12, -1], [13, -1], [14, 0], [15, 0], [16, 1]] as Pt[]) S(x, y, r[6]);
  const rimC = set === 'gold' ? CR.leather[3] : m[1];
  for (let x = -1; x <= 22; x++) { const y = brimAt(x); if (inCap(x, y, 1.05)) { S(x, y, rimC); S(x, y - 1, set === 'gold' ? r[5] : m[3]); } }
  const cheek = set === 'copper' || set === 'iron' || set === 'molten';
  if (cheek) {
    // 前護頰：貼著臉的前緣（第 20–21 欄，不蓋到前眼）；後護頰：蓋住耳後（第 6–8 欄）
    for (const [xa, xb, yb] of [[20, 21, 11], [6, 8, 14]] as [number, number, number][]) for (let x = xa; x <= xb; x++) for (let y = brimAt(x) + 1; y <= yb; y++) S(x, y, y === yb ? m[1] : x === xa ? m[3] : m[2]);
  }
  const NOSE = 14;
  switch (set) {
    case 'wood':
      for (let x = 0; x <= 21; x++) { const y = 2 + (x < 5 ? 1 : 0); if (inCap(x, y, 1.05)) S(x, y, CR.leather[x & 1 ? 3 : 4]); }
      S(15, 2, GOLD);
      for (const [x, y] of [[5, 1], [10, 0], [8, 3], [2, 4], [18, 1]] as Pt[]) S(x, y, m[1]);
      break;
    case 'copper':
      for (let y = BRIM; y <= 8; y++) { S(NOSE, y, m[3]); S(NOSE + 1, y, m[2]); }
      for (const [x, y] of [[4, 2], [10, -1], [18, 1], [1, 7], [20, 5]] as Pt[]) { S(x, y, r[6]); S(x + 1, y + 1, m[1]); }
      break;
    case 'iron':
      // 中脊偏前（3/4 轉頭：頭頂的中線在前面）
      for (let y = -2; y <= BRIM; y++) S(13 + Math.round(y * 0.25), y, y < 2 ? r[6] : m[4]);
      for (let y = BRIM; y <= 8; y++) { S(NOSE, y, m[4]); S(NOSE + 1, y, m[2]); }
      break;
    case 'gold': {
      const red = CR.red;
      // 扇形冠脊（壓低：最高頭頂上 4 格）+ 往後垂的紅羽
      triS(S, [5, -1], [15, -1], [8, -4], (_x, _y, sd) => (sd > 0 ? m[4] : m[3]));
      S(9, -3, r[6]); S(NOSE, BRIM - 1, red[4]); S(NOSE, BRIM, red[3]);
      for (let k = 0; k < 8; k++) { S(5 - k, -1 + Math.round(k * 0.8), red[k < 3 ? 5 : 4]); S(5 - k, Math.round(k * 0.8), red[3]); if (k > 2) S(5 - k, 1 + Math.round(k * 0.8), red[2]); }
      break;
    }
    case 'bone': {
      // 後角（大，往後上彎）+ 前角（小，往前上）
      triS(S, [0, 4], [4, 1], [-3, -3], (_x, _y, sd) => (sd > 0 ? m[4] : m[3]));
      triS(S, [17, 1], [20.5, 4], [22.5, -2], (_x, _y, sd) => (sd > 0 ? m[4] : m[3]));
      S(-2, -3, hex('#ffffff')); S(21, -1, hex('#ffffff'));
      for (const [x, y] of [[8, 4], [14, 4], [11, 5]] as Pt[]) S(x, y, r[1]);
      break;
    }
    case 'molten':
      for (const x of [4, 9, 14]) triS(S, [x - 1, 1], [x + 2, 0], [x + 0.5, -4], (_x, yy) => (yy <= -3 ? CR.lava[3] : yy <= -2 ? CR.lava[2] : m[2]));
      for (const [x, y, k] of [[7, 1, 3], [15, 2, 4], [18, 0, 2], [2, 5, 3]] as [number, number, number][]) S(x, y, CR.lava[k]);
      break;
  }
  inline(g, ox - 4, oy - 5, ox + 27, oy + 20, m[1], m[0]);
  const spots: Pt[] = [];
  for (let x = 0; x <= 21; x++) spots.push([ox + x, oy + brimAt(x)]);
  upgrades(g, p, spots, [ox + NOSE, oy + 3], f, r);
  head.blit(g, 0, 0);
}

// ── 時裝帽子 ─────────────────────────────────────────────
export const HAT_HIDES_TOP = new Set(['straw', 'witch', 'beret', 'miner']);
/** 礦工頭燈盔：黃銅圓頂（順著頭型、後面蓋得低）+ 帽緣，正面（右前）一顆亮黃頭燈 */
const BRASS: RGB[] = [hex('#472819'), hex('#966139'), hex('#c99660'), hex('#d8ba76'), hex('#f2e2b0')];
function minerHelm(S: (x: number, y: number, c: RGB) => void): void {
  const r = BRASS;
  for (let y = -3; y <= BRIM + 5; y++) for (let x = -2; x <= 23; x++) {
    if (!inCap(x, y, 1.05) || y > brimAt(x) - 1) continue;
    const nx = (x + 0.5 - 11) / 12, ny = (y + 0.5 - 7) / 10, L = 0.45 * nx - 0.9 * ny;
    S(x, y, L > 0.95 ? r[4] : L > 0.45 ? r[3] : L > -0.1 ? r[2] : r[1]);
  }
  // 帽緣：前面往外伸一點（遮陽）
  for (let x = -2; x <= 24; x++) { const y = brimAt(Math.min(x, 21)); S(x, y, x > 18 ? r[3] : r[1]); }
  for (const x of [3, 8]) { S(x, 2, r[0]); S(x, 1, r[4]); }
  // 頭燈：外殼 + 鏡片（亮黃），在臉的正上方偏前
  const k = hex('#2c2838');
  for (let y = 0; y <= 4; y++) for (let x = 14; x <= 18; x++) S(x, y, x === 14 || x === 18 || y === 0 || y === 4 ? k : y === 1 && x < 17 ? hex('#ffffff') : y < 2 ? hex('#fff4c0') : y < 3 ? hex('#ffd86a') : hex('#ffa93a'));
}
export function hatArt(b: Bmp, id: string, ox: number, oy: number, _view: 'side' | 'back' = 'side', sway = 0, tint?: Tint): void {
  const s = new Bmp(b.w, b.h);
  // 主色 / 副色（礦工盔 / 花冠沒有布料：不換色）
  const [c1, c2] = tintOf(`hat:${id}`, tint);
  // 帽子的設計座標比頭的區域座標大一格（帽沿伸出頭外）：整頂往左上偏一格
  const S = (x: number, y: number, c: RGB): void => s.set(ox + x - 1, oy + y - 1, c);
  const M = (x: number, y: number, c: RGB): void => s.set(ox + x, oy + y, c);
  // 3/4 轉頭的帽沿：橢圓的中心偏前（右）、前緣比後緣低一格（看得到帽沿的上面）
  const brim = (cx: number, rx: number, y0: number, r: RGB[], top: RGB, bot: RGB): void => {
    for (let y = y0 - 3; y <= y0 + 3; y++) for (let x = Math.floor(cx - rx) - 1; x <= Math.ceil(cx + rx) + 1; x++) {
      const nx = (x + 0.5 - cx) / rx, ny = (y + 0.5 - y0 - nx * 0.6) / 1.9;
      if (nx * nx + ny * ny > 1) continue;
      S(x, y, ny < -0.35 ? top : ny > 0.45 ? bot : nx > 0.5 ? r[2] : r[3]);
    }
  };
  if (id === 'straw') {
    const st = clothRamp(c1), band = clothRamp(c2);
    brim(12.5, 16, 6.6, st, st[4], st[1]);
    for (let y = -3; y <= 5; y++) for (let x = 2; x <= 21; x++) {
      const nx = (x + 0.5 - 11.2) / 9.4, ny = (y + 0.5 - 5.2) / 8;
      if (nx * nx + ny * ny > 1) continue;
      S(x, y, y >= 3 ? band[y === 3 ? 4 : 3] : ((x + y) & 3) === 0 ? st[2] : nx > 0.35 && ny < -0.2 ? st[4] : nx < -0.5 ? st[2] : st[3]);
    }
  } else if (id === 'witch') {
    const c = clothRamp(c1), band = clothRamp(c2);
    brim(12.5, 14.5, 6.6, c, c[4], c[1]);
    // 尖頂：圓錐收得窄、往後（左）彎，帽尖再往後垂下來（頂部被裁在頭上 4 格內：尖帽輪廓靠「往後折」留住）
    let tx = 0;
    for (let k = 0; k < 10; k++) {
      // 圓錐的底蓋滿整個頭頂（前半部也蓋住：帽沿上面不會露出頭髮）
      const y = 5 - k, w = Math.max(1, 8.5 - k * 0.8), cx = 12 - (k > 1 ? (k - 1) ** 1.4 * (0.75 + sway * 0.2) : 0);
      for (let x = Math.round(cx - w); x <= Math.round(cx + w); x++) S(x, y, x > cx + w - 1.5 ? c[4] : x < cx - w + 1.5 ? c[2] : c[3]);
      tx = Math.round(cx - w);
    }
    for (let i = 1; i <= 5; i++) {
      const x = tx - i, y = -4 + Math.round(i * 0.7);
      S(x, y, i < 4 ? c[3] : c[2]); S(x, y + 1, i < 4 ? c[2] : c[1]); if (i < 3) S(x, y + 2, c[2]);
    }
    S(tx - 6, -4 + Math.round(6 * 0.7) + 1, GOLD);
    for (let x = 4; x <= 20; x++) { S(x, 4, band[3]); S(x, 3, band[4]); }
    S(16, 4, GOLD); S(16, 3, hex('#fff4c0')); S(17, 4, GOLD);
  } else if (id === 'beret') {
    // 貝雷帽：往後（左）斜戴、前面露出瀏海
    const c = clothRamp(c1);
    for (let y = -4; y <= 4; y++) for (let x = -2; x <= 21; x++) {
      const nx = (x + 0.5 - 8.6) / 11.6, ny = (y + 0.5 - 0.6 + nx * 0.8) / 3.6;
      if (nx * nx + ny * ny <= 1) S(x, y, ny > 0.5 ? c[2] : nx > 0.3 && ny < 0.1 ? c[4] : c[3]);
    }
    for (let x = 0; x <= 21; x++) S(x, 5 - Math.round((x - 10) * 0.08), c[1]);
    S(9, -5, c[2]); S(10, -5, c[3]);
  } else if (id === 'maid') {
    // 女僕頭飾：一圈白色荷葉邊（3/4：前面那段寬、後面窄）+ 黑色緞帶
    const w = clothRamp(c1), k = clothRamp(c2);
    for (let x = 6; x <= 21; x++) { const y = 2 - (x > 13 ? 1 : 0); S(x, y, (x & 1) ? w[3] : w[2]); S(x, y + 1, w[3]); S(x, y + 2, k[3]); if (!(x % 3)) S(x, y - 1, w[3]); }
  } else if (id === 'miner') {
    minerHelm(M);
  } else if (id === 'flower') {
    // 花冠：繞頭頂一圈（前面低、後面高），花朵前面大、後面小
    const leaf = CR.green, cols = [hex('#ffc8dc'), hex('#ffffff'), hex('#ffd86a'), hex('#e890b0'), hex('#c4a0f0')];
    const ring = (x: number): number => Math.round(1 - (x - 4) * 0.12 + Math.max(0, x - 16) * 0.35);
    for (let x = 3; x <= 22; x++) S(x, ring(x) + 1, leaf[x & 1 ? 3 : 4]);
    for (let k = 0; k < 7; k++) {
      const x = 4 + k * 3, y = ring(x), c = cols[k % cols.length];
      S(x, y, c); S(x - 1, y, c); S(x + 1, y, c); S(x, y - 1, c); S(x, y + 1, c); S(x, y, k % 2 ? GOLD : hex('#fff4c0'));
    }
  }
  // 帽尖最高到頭的區域座標 −4（不高過碰撞盒：站著不會插進天花板）
  for (let yy = 0; yy < Math.min(s.h, oy - 4); yy++) for (let x = 0; x < s.w; x++) s.clear(x, yy);
  s.softOutline(0.45);
  b.blit(s, 0, 0);
}

// ── 背飾（3/4 正面：在身體後面，左右兩邊露出來）────────────────
/**
 * 背飾：flap = 飄動（走路 / 跳 / 掉落：往後 = 往左）、lift = 往上掀。
 * (sx, sy) = 後頸（兩肩中間）在畫布上的位置；bw = 肩寬。
 */
export function backArt(b: Bmp, p: DollPiece, flap: number, lift: number, sx: number, sy: number, bw: number, f: number): void {
  const id = p.look.slice(5);
  const s = new Bmp(b.w, b.h);
  const S = (x: number, y: number, c: RGB): void => s.set(x, y, c);
  // 主色 / 副色（羽翼 / 甲殼小盾沒有布料：不換色）
  const [c1, c2] = tintOf(p.look, p.tint);
  if (id === 'cape') {
    // 紅披風（外）+ 金色內裡：從兩肩垂下、往後（左）飄；下襬左右兩角翻起來露出內裡
    const c = clothRamp(c1), lin = clothRamp(c2), len = 15;
    for (let k = 0; k <= len; k++) {
      const t = k / len, trail = Math.round(t * t * (2 + flap * 3 + lift * 2));
      const half = bw / 2 + 2 + t * 4;
      const x0 = Math.round(sx - half - trail), x1 = Math.round(sx + half - trail * 0.4), y = sy + k - Math.round(lift * t * 5);
      for (let x = x0; x <= x1; x++) {
        let col = x <= x0 + 1 ? c[4] : x >= x1 - 1 ? (k < 3 ? lin[4] : lin[3]) : (x - x0) % 3 === 2 && k > 3 ? c[2] : k === len ? c[2] : c[3];
        if (flap > 0.3 && k >= len - 2 && x <= x0 + (len - k)) col = lin[3];
        S(x, y, col);
      }
    }
    S(sx, sy, GOLD); S(sx + 1, sy, GOLD); S(sx, sy - 1, hex('#fff4c0'));
    upgrades(s, p, [], null, f, c);
  } else if (id === 'feathers') {
    // 羽毛護符：肩後兩側各插三根長羽毛（白羽軸 + 青綠羽片 + 橘色羽尖、下緣深一階），往外上方張開到頭的兩側；
    // 和白色的羽翼分得出來，也不會被白上衣吃掉
    const v = clothRamp(c1), o = clothRamp(c2), w = WHITE, sway = flap * 1.5;
    for (const side of [-1, 1]) {
      const rx = sx + side * (bw / 2 + (side < 0 ? 1 : 0)), ry = sy + 2;
      for (let k = 0; k < 3; k++) {
        const a = 0.3 + k * 0.45, len = (side < 0 ? 10 : 9) - k;
        const ex = rx + side * Math.cos(a) * len - (side < 0 ? sway : sway * 0.4), ey = ry - Math.sin(a) * len;
        const steps = Math.ceil(len * 2);
        for (let i = 0; i <= steps; i++) {
          const t = i / steps, x = Math.round(rx + (ex - rx) * t), y = Math.round(ry + (ey - ry) * t);
          if (t < 0.2) { S(x, y, w[2]); continue; }
          const tip = t > 0.78;
          S(x, y, tip ? o[3] : k === 0 ? v[4] : v[3]);
          if (t < 0.95) S(x, y + 1, tip ? o[2] : v[2]);
          // 羽片中段寬一點（像一根羽毛，不像一條棍子）
          if (t > 0.35 && t < 0.75) S(x - side, y, k === 0 ? v[4] : v[3]);
        }
      }
    }
    S(sx, sy + 1, GOLD);
  } else if (id === 'wings') {
    // 羽翼：從兩肩後方往外上方張開（一根根羽毛：上面長、下面短），3/4 正面時兩邊都露得出來
    const big = true, w = WHITE, beat = Math.sin(f * 1.7) * (lift ? 1 : 0.35);
    const n = 6, L = 12;
    for (const side of [-1, 1]) {
      const rx = sx + side * (bw / 2 - 1), ry = sy + 1;
      for (let k = 0; k < n; k++) {
        const a = -0.95 + k * 0.32 - beat * 0.2 + (side > 0 ? 0.12 : 0), len = L - k * (big ? 1.4 : 1.1) - (side > 0 ? 1 : 0);
        const ex = rx + side * Math.cos(a) * len, ey = ry + k * 0.7 + Math.sin(a) * len;
        const steps = Math.ceil(len * 2);
        for (let i = 0; i <= steps; i++) {
          const t = i / steps, x = rx + (ex - rx) * t, y = ry + k * 0.7 + (ey - ry - k * 0.7) * t;
          const c = t > 0.85 ? w[1] : k === 0 ? w[4] : (k & 1) ? w[2] : w[3];
          S(Math.round(x), Math.round(y), c); if (big && t < 0.7) S(Math.round(x), Math.round(y) + 1, k === n - 1 ? w[1] : w[2]);
        }
      }
    }
  } else if (id === 'bow') {
    // 大蝴蝶結：綁在背後正中，兩個大圈從身體左右兩邊都露出來（3/4 正面：遠側那圈小一點），緞帶尾巴垂到腰
    const c = clothRamp(c1);
    const left =['.bbbb..', 'bBbbbbb', 'bBbbbbb', 'bbbbbbb', '.bbbb..', '..bb...', '..b....', '.bb....'];
    const right = ['..bbb.', 'bbbbBb', 'bbbbbb', 'bbbbbb', '..bbb.', '...bb.', '....b.', '....bb'];
    const lx = Math.round(sx - bw / 2) - 6, rxx = Math.round(sx + bw / 2) - 1, y0 = sy + 2;
    left.forEach((row, y) => { for (let x = 0; x < row.length; x++) if (row[x] !== '.') S(lx + x, y0 + y, row[x] === 'B' ? c[4] : x < 2 || y > 4 ? c[3] : c[2]); });
    right.forEach((row, y) => { for (let x = 0; x < row.length; x++) if (row[x] !== '.') S(rxx + x, y0 + y, row[x] === 'B' ? c[4] : x > 3 || y > 4 ? c[2] : c[3]); });
    upgrades(s, p, [], null, f, c);
  } else if (id === 'buckler') {
    // 甲殼小盾：背在背上、偏後側（左）露出大半
    const r = CR.green, rim = LEATHER;
    const cx = sx - bw / 2 - 2, cy = sy + 4;
    for (let y = cy - 6; y <= cy + 6; y++) for (let x = Math.floor(cx - 6); x <= Math.ceil(cx + 6); x++) {
      const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
      if (d > 4.8) continue;
      S(x, y, d > 4 ? rim[3] : d < 1.4 ? r[5] : x < cx ? r[4] : r[3]);
    }
  }
  s.softOutline(0.45);
  b.blit(s, 0, 0);
}

// ── 鞋子 / 墜飾 / 腰間 ───────────────────────────────────
/** 飾品鞋：跳躍靴（綠色 + 彈簧）、疾行靴（白色 + 小翅膀） */
/** 披風在肩上的那一片（畫在上衣上面）：紅色披肩蓋住兩肩 + 領口金扣；(x0..x1, y) = 肩線 */
export function capeShoulders(b: Bmp, x0: number, x1: number, y: number, tint?: Tint): void {
  const c = clothRamp(tintOf('back:cape', tint)[0]), s = new Bmp(b.w, b.h);
  for (let x = x0 - 1; x <= x1 + 1; x++) { s.set(x, y, x < x0 + 2 ? c[4] : c[3]); if (x <= x0 + 1 || x >= x1 - 1) s.set(x, y + 1, x <= x0 ? c[4] : c[2]); }
  const m = Math.round((x0 + x1) / 2) + 1;
  s.set(m, y, GOLD); s.set(m - 1, y, hex('#fff4c0'));
  s.softOutline();
  b.blit(s, 0, 0);
}
export function bootRamp(kind: 'jump' | 'swift'): RGB[] {
  return kind === 'jump' ? CR.green.slice(1, 6) : [hex('#5e5e74'), hex('#858aa0'), hex('#b4b9c8'), hex('#ffffff'), hex('#ffffff')];
}
export function bootExtra(b: Bmp, kind: 'jump' | 'swift', x: number, y: number): void {
  if (kind === 'jump') { b.set(x, y + 3, GOLD); b.set(x + 2, y + 3, GOLD); }
  else { b.set(x - 1, y, hex('#cceaf8')); b.set(x - 2, y - 1, hex('#ffffff')); b.set(x - 1, y - 1, hex('#ffffff')); }
}
/** 胸前墜飾：(cx, y) = 領口中間 */
export function neckArt(b: Bmp, kind: string, cx: number, y: number): void {
  const chain = hex('#b4b9c8');
  b.set(cx - 1, y, chain); b.set(cx + 2, y, chain); b.set(cx, y + 1, chain); b.set(cx + 1, y + 1, chain);
  const gem = kind === 'night' ? hex('#5c9ce0') : kind === 'fang' ? hex('#f2e2b0') : kind === 'heart' ? hex('#c8344c') : hex('#ffa93a');
  b.set(cx, y + 2, gem); b.set(cx + 1, y + 2, gem); b.set(cx, y + 3, kind === 'fang' ? hex('#b4b9c8') : gem);
  if (kind !== 'fang') b.set(cx, y + 2, hex('#ffffff'));
}
/** 腰間小物：(x, y) = 腰帶左側 */
export function beltArt(b: Bmp, kind: string, x: number, y: number): void {
  const S = (xx: number, yy: number, c: RGB): void => b.set(xx, yy, c);
  if (kind === 'compass') { S(x, y, GOLD); S(x + 1, y, GOLD); S(x, y + 1, hex('#a83a10')); S(x + 1, y + 1, GOLD); }
  else if (kind === 'depth') { S(x, y, hex('#858aa0')); S(x + 1, y, hex('#b4b9c8')); S(x, y + 1, hex('#5c9ce0')); S(x + 1, y + 1, hex('#858aa0')); }
  else if (kind === 'magnet') { S(x, y, hex('#c8344c')); S(x + 1, y, hex('#c8344c')); S(x, y + 1, hex('#b4b9c8')); S(x + 1, y + 1, hex('#b4b9c8')); }
  else { S(x, y, hex('#f2e2b0')); S(x + 1, y, hex('#d8ba76')); S(x, y + 1, hex('#d8ba76')); S(x + 1, y + 1, hex('#a83a10')); }
}

/** 圖示用：只有頭盔 / 帽子（不畫頭） */
export function helmetOnly(b: Bmp, p: DollPiece): void { helmetArt(b, p, 10, 14, 0); }
export function hatOnly(b: Bmp, id: string, tint?: Tint): void { hatArt(b, id, 10, 14, 'side', 0, tint); }
