// avatarGear.ts — 紙娃娃身上的裝備畫法（純 Bmp）：六套防具的頭盔 / 胸甲 / 護脛細節、
// 稀有度（滾邊色、寶石、傳說以上的閃光）、強化 +N（鉚釘亮點）、元素詞條點綴（熾焰餘燼 / 霜寒冰晶 / 劇毒 / 螢光 / 引雷），
// 時裝帽子（草帽 / 魔女帽 / 貝雷帽 / 女僕頭飾 / 花冠）、背飾（斗篷 / 羽翼 / 輕羽小翅膀 / 大蝴蝶結 / 甲殼小盾）、
// 看得見的飾品（跳躍靴 / 疾行靴、胸前墜飾、腰間小物）。光從左上；每件自己描邊。
import { Bmp, INK, hex, type RGB } from './pixel';
import type { ArmorSetId } from '../engine/items';
import { RARITIES } from '../engine/gear';
import type { DollElem, DollPiece } from '../engine/doll';
import { ARMOR_RAMP, R as CR } from './combatArt';
import { GOLD, LEATHER, WHITE, clothRamp } from './avatarPalette';

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
  // 滾邊：整條實線（稀有度色）；元素：每 4 格一顆點綴（兩色交替）
  if (trim) for (const s of spots) b.set(s[0], s[1], trim);
  if (el) for (let i = 1; i < spots.length; i += 4) b.set(spots[i][0], spots[i][1], (i >> 2) % 2 ? el[0] : el[1]);
  for (let k = 0; k < Math.min(3, p.plus); k++) { const s = spots[(k * 5 + 3) % spots.length]; if (s) b.set(s[0], s[1], base[base.length - 1]); }
  if (gem && (p.rarity >= 3 || p.plus >= 3)) {
    const c = trim ?? hex('#5c9ce0');
    b.set(gem[0], gem[1], c);
    if (p.rarity >= 4) b.set(gem[0] - 1, gem[1], SPARK);
  }
  if (p.rarity >= 4 && spots.length) {
    // 傳說 / 神話：一顆閃光沿著滾邊移動（每格換位置）
    const s = spots[(f * 7) % spots.length];
    b.set(s[0], s[1], SPARK);
    if (p.rarity >= 5) { const t = spots[(f * 7 + Math.floor(spots.length / 2)) % spots.length]; b.set(t[0], t[1], hex('#fff4c0')); }
  }
}

// ── 胸甲（側面 / 背面）：套裝細節 ──────────────────────────
/** rows：身體每列 [左, 右]；在已經填好防具底色的身體上加細節 */
export function chestDetail(b: Bmp, set: ArmorSetId, rows: Record<number, [number, number]>, dx: number, dy: number, view: 'side' | 'back'): void {
  const r = ARMOR_RAMP[set];
  const S = (x: number, y: number, c: RGB): void => b.set(x + dx, y + dy, c);
  const each = (fn: (x: number, y: number, x0: number, x1: number) => void): void => {
    for (const k of Object.keys(rows)) { const y = Number(k), [x0, x1] = rows[y]; for (let x = x0; x <= x1; x++) fn(x, y, x0, x1); }
  };
  switch (set) {
    case 'wood': each((x, y, x0) => { if ((x - x0) % 3 === 2 && y > 32) S(x, y, r[1]); if (y === 36) S(x, y, r[1]); }); break;
    case 'copper': each((x, y, x0, x1) => { if (y === 35 || y === 39) S(x, y, r[2]); if ((y === 33 || y === 37) && (x === x0 + 1 || x === x1 - 1)) S(x, y, r[6]); }); break;
    case 'iron': each((x, y, x0) => { if (y === 34 || y === 37 || y === 40) S(x, y, r[1]); if (x === x0 + 1 && y < 37) S(x, y, r[6]); }); break;
    case 'gold': each((x, y, x0, x1) => { if (y === 33 || y === 40) S(x, y, r[6]); if (x === (view === 'side' ? x1 - 3 : Math.round((x0 + x1) / 2)) && y > 33 && y < 40) S(x, y, r[2]); }); break;
    case 'bone': each((x, y, x0, x1) => { if ((y === 34 || y === 36 || y === 38) && x > x0 && x < x1) S(x, y, (x & 1) ? r[2] : r[1]); }); break;
    case 'molten': each((x, y) => { const h = ((x * 7 + y * 13) % 11); if (h === 0 && y > 32) S(x, y, CR.lava[3]); if (h === 5 && y > 34) S(x, y, CR.lava[2]); }); break;
  }
  // 共通的層次：胸口一道金屬高光（左上斜的亮條）、腰帶分隔（皮帶 + 金扣）、下擺的甲片（一片一片）
  const ys = Object.keys(rows).map(Number), y0 = Math.min(...ys), yb = Math.max(...ys);
  const [a0] = rows[y0 + 2] ?? rows[y0];
  for (const [x, y, c] of [[a0 + 2, y0 + 2, 6], [a0 + 3, y0 + 2, 5], [a0 + 2, y0 + 3, 5], [a0 + 3, y0 + 3, 6], [a0 + 4, y0 + 4, 5], [a0 + 2, y0 + 4, 4]] as [number, number, number][]) S(x, y, r[c]);
  const by = yb - 3, [b0, b1] = rows[by] ?? rows[yb];
  for (let x = b0; x <= b1; x++) { S(x, by, x === b0 ? CR.leather[4] : CR.leather[3]); S(x, by + 1, r[1]); }
  S(b1 - 2, by, GOLD); S(b1 - 3, by, hex('#fff4c0'));
  for (let y = by + 2; y <= yb; y++) { const [c0, c1] = rows[y] ?? rows[yb]; for (let x = c0; x <= c1; x++) S(x, y, (x - c0) % 3 === 2 ? r[1] : y === yb ? r[2] : (x - c0) % 3 === 0 ? r[4] : r[3]); }
  if (view === 'side') {
    // 後肩的護肩（往背後凸出一圈；前肩的護肩畫在前手臂上）
    const cx = a0 + 1.5, cy = y0 + 2.5;
    for (let y = y0 - 1; y <= y0 + 5; y++) for (let x = Math.floor(cx - 4); x <= Math.ceil(cx + 3); x++) {
      const d = Math.hypot(x + 0.5 - cx, (y + 0.5 - cy) * 1.15);
      if (d <= 3.3) S(x, y, d > 2.6 && y >= cy ? r[1] : d < 1.3 && x < cx ? r[6] : x < cx - 0.5 ? r[4] : r[3]);
    }
    if (set === 'bone') { S(Math.floor(cx), y0 - 2, r[5]); S(Math.floor(cx) - 1, y0 - 3, r[5]); }
    if (set === 'molten') S(Math.floor(cx), y0 + 1, CR.lava[4]);
  }
}
/** 胸甲上可以放點綴的位置（滾邊） */
export function chestSpots(rows: Record<number, [number, number]>, dx: number, dy: number): { spots: [number, number][]; gem: [number, number] } {
  const spots: [number, number][] = [];
  const top = rows[32] ?? rows[33], bot = rows[40] ?? rows[41];
  if (top) for (let x = top[0]; x <= top[1]; x++) spots.push([x + dx, 32 + dy]);
  if (bot) for (let x = bot[1]; x >= bot[0]; x--) spots.push([x + dx, 40 + dy]);
  const mid = rows[36] ?? [18, 26];
  void mid;
  // 寶石放在腰帶扣（側面不會被前手臂擋住）
  return { spots, gem: [21 + dx, 40 + dy] };
}

// ── 護脛：膝甲 + 腿上的套裝細節 ───────────────────────────
export function greaveKnee(b: Bmp, set: ArmorSetId, kx: number, ky: number): void {
  const r = ARMOR_RAMP[set];
  const x = Math.round(kx), y = Math.round(ky);
  b.set(x - 1, y, r[5]); b.set(x, y, r[5]); b.set(x + 1, y, r[3]); b.set(x, y - 1, r[4]);
  if (set === 'molten') b.set(x, y + 1, CR.lava[3]);
  if (set === 'bone') b.set(x + 1, y - 1, r[5]);
  if (set === 'gold') b.set(x, y, r[6]);
}

/// ── 頭盔 ─────────────────────────────────────────────────
type Pt = [number, number];
/** 頭髮 / 頭盔的球心與半徑（頭的區域座標，頭 23×22） */
export const CAP = { cx: 11.2, cy: 9.8, rx: 12.4, ry: 11.6 };
/**
 * 帽子 / 頭盔的細節是照 20 寬的頭設計的：每個設計格放大成 1.15 倍的一塊（最近鄰，不留縫），
 * 圓頂與帽沿則直接用新頭型（CAP / BRIM）畫，輪廓保持單像素乾淨。
 */
const UP = 1.15;
const T = (v: number): number => Math.round(v * UP);
type Plot = (x: number, y: number, c: RGB) => void;
export function up(S: Plot): Plot {
  return (x, y, c) => {
    const x0 = T(x), x1 = Math.max(x0 + 1, T(x + 1)), y0 = T(y), y1 = Math.max(y0 + 1, T(y + 1));
    for (let yy = y0; yy < y1; yy++) for (let xx = x0; xx < x1; xx++) S(xx, yy, c);
  };
}
export const inCap = (x: number, y: number, k = 1): boolean => {
  const nx = (x + 0.5 - CAP.cx) / (CAP.rx * k), ny = (y + 0.5 - CAP.cy) / (CAP.ry * k);
  return nx * nx + ny * ny <= 1;
};
/** 帽沿那一列（眼睛在第 9 列起；瀏海尖露在帽沿下面） */
const BRIM = 6;
/**
 * 頭盔（側面 / 背面）：圓頂（四階打光 + 左上一道高光）+ 往前突出的帽沿 + 後頸護片，再依套裝加輪廓——
 * 木：皮帶箍 + 木紋；銅：護鼻條 + 鉚釘 + 護頰；鐵：前面的面甲（一道眼縫）+ 中脊 + 護頰；
 * 金：高高的冠脊 + 往後飄的紅羽 + 深色帽沿（不會被看成金髮）；骸衛：大彎角 + 眼窩點；熔心：三根尖刺（尖端熔岩）+ 護頰。
 */
export function helmetArt(head: Bmp, p: DollPiece, ox: number, oy: number, f: number, view: 'side' | 'back'): void {
  const set = armorSet(p)!;
  const r = ARMOR_RAMP[set], m = armor5(set);
  const S0 = (x: number, y: number, c: RGB): void => head.set(ox + x, oy + y, c);
  const S = up(S0);
  const brim = BRIM, side = view === 'side';
  for (let y = -4; y <= 16; y++) for (let x = -4; x <= 25; x++) {
    const dome = inCap(x, y, 1.07) && y <= brim;
    // 後頸護片：只蓋後腦勺（耳朵後面），下緣往後收成圓角
    const nape = side ? x <= 4 && y <= 14 - Math.max(0, 1 - x) && inCap(x, Math.min(y, 12), 1.07) : y <= 14 && inCap(x, Math.min(y, 11), 1.07);
    if (!dome && !nape) continue;
    const nx = (x + 0.5 - CAP.cx) / CAP.rx, ny = (y + 0.5 - CAP.cy) / CAP.ry;
    const v = -(nx * 0.55 + ny * 0.85);
    S0(x, y, v > 0.8 ? m[4] : v > 0.3 ? m[3] : v > -0.25 ? m[2] : m[1]);
  }
  // 高光：左上一道（金屬亮點）
  for (const [x, y] of [[4, -1], [5, -1], [3, 0], [6, -2]] as Pt[]) S(x, y, r[6]);
  // 帽沿：深一階的一道邊（上面一列亮邊），側面往前突出 2 格
  const rimC = set === 'gold' ? CR.leather[3] : m[1];
  for (let x = -2; x <= (side ? 25 : 24); x++) { S0(x, brim, rimC); if (x > -2 && x < 24) S0(x, brim - 1, set === 'gold' ? r[5] : m[3]); }
  if (side) { S0(24, brim + 1, m[0]); S0(25, brim + 1, m[0]); }
  // 後頸護片下緣
  if (side) for (let x = -2; x <= 4; x++) S0(x, 14 - Math.max(0, 1 - x) + 1, m[1]);
  const cheek = set === 'copper' || set === 'iron' || set === 'molten';
  if (cheek) {
    // 護頰：耳朵前面一片（側面）／兩側（背面）
    const xs = side ? [4, 5, 6] : [-1, 0, 19, 20];
    for (const x of xs) for (let y = 6; y <= 12; y++) S(x, y, x === xs[0] || x === 19 ? m[3] : x === xs[xs.length - 1] ? m[1] : m[2]);
    for (const x of xs) S(x, 13, m[1]);
    if (side) S(4, 8, r[6]);
  }
  switch (set) {
    case 'wood':
      for (let x = -1; x <= 20; x++) S(x, 3, CR.leather[x & 1 ? 3 : 4]);
      S(11, 3, GOLD);
      for (const [x, y] of [[7, 0], [12, 0], [9, 1], [15, 1], [3, 1]] as Pt[]) S(x, y, m[1]);
      break;
    case 'copper':
      if (side) { for (let y = 5; y <= 10; y++) { S(18, y, m[3]); S(19, y, m[2]); } S(18, 11, m[1]); }
      for (const [x, y] of [[3, 2], [10, -1], [15, 2], [1, 7]] as Pt[]) { S(x, y, r[6]); S(x + 1, y + 1, m[1]); }
      break;
    case 'iron':
      if (side) {
        // 面甲：額頭前方一片，一道眼縫
        for (let y = 1; y <= 5; y++) for (let x = 16; x <= 21; x++) if (y > 1 || x < 20) S(x, y, y === 3 ? r[0] : x === 21 ? m[1] : y === 1 ? m[4] : m[3]);
        S(21, 3, r[1]); S(17, 2, r[6]);
      }
      for (let y = -3; y <= 4; y++) S(side ? 10 : 9, y, y < 0 ? r[6] : m[4]);
      S(side ? 11 : 10, -2, m[2]);
      break;
    case 'gold': {
      // 冠脊 + 紅羽
      const red = CR.red;
      for (let x = 5; x <= 14; x++) { const hgt = x < 7 || x > 12 ? 1 : 2; for (let k = 1; k <= hgt; k++) S(x, -2 - k, k === hgt ? m[4] : m[3]); }
      S(9, -5, r[6]);
      if (side) {
        for (let k = 0; k < 9; k++) { S(5 - k, -3 + Math.round(k * 0.6), red[k < 3 ? 5 : 4]); S(5 - k, -2 + Math.round(k * 0.6), red[3]); if (k > 2) S(5 - k, -1 + Math.round(k * 0.6), red[2]); }
        S(16, 3, red[4]); S(16, 2, hex('#ffffff'));
      } else {
        for (let k = 0; k < 9; k++) { S(9, -4 + k * 1.5, red[4]); S(10, -4 + k * 1.5, red[3]); }
      }
      break;
    }
    case 'bone': {
      const horn: Pt[] = side ? [[3, 0], [2, -1], [1, -2], [1, -3], [2, -4], [3, -5], [15, 0], [16, -1], [17, -2], [17, -3], [16, -4], [15, -5]]
        : [[0, 1], [-1, 0], [-2, -1], [-2, -2], [-1, -3], [0, -4], [19, 1], [20, 0], [21, -1], [21, -2], [20, -3], [19, -4]];
      horn.forEach(([x, y], i) => { S(x, y, i % 6 < 2 ? m[3] : m[4]); if (i % 6 === 5) S(x, y, hex('#ffffff')); });
      if (side) { S(13, 2, r[1]); S(17, 2, r[1]); S(15, 4, r[1]); S(14, 2, r[1]); }
      break;
    }
    case 'molten':
      for (const x of side ? [5, 9, 13] : [4, 9, 14]) {
        S(x, -2, m[2]); S(x + 1, -2, m[1]); S(x, -3, m[2]); S(x + 1, -3, m[1]); S(x, -4, CR.lava[3]); S(x, -5, CR.lava[4]);
      }
      S(7, 1, CR.lava[3]); S(12, 2, CR.lava[4]); S(14, 0, CR.lava[2]); S(3, 4, CR.lava[3]);
      break;
  }
  const spots: Pt[] = [];
  for (let x = side ? 0 : -2; x <= (side ? 23 : 24); x++) spots.push([ox + x, oy + brim]);
  upgrades(head, p, spots, side ? [ox + 16, oy + 3] : null, f, r);
}

// ── 時裝帽子 ─────────────────────────────────────────────
export const HAT_HIDES_TOP = new Set(['straw', 'witch', 'beret', 'miner']);
/** 礦工頭燈盔：黃銅圓頂 + 帽緣，正面（右）一顆亮黃頭燈 */
const BRASS: RGB[] = [hex('#472819'), hex('#966139'), hex('#c99660'), hex('#d8ba76'), hex('#f2e2b0')];
function minerHelm(S: (x: number, y: number, c: RGB) => void, view: 'side' | 'back'): void {
  const r = BRASS;
  for (let y = -3; y <= 4; y++) for (let x = -2; x <= 20; x++) {
    const nx = (x + 0.5 - 9.6) / 10, ny = (y + 0.5 - 4) / 7;
    if (nx * nx + ny * ny > 1) continue;
    // 光從左上：左上亮、右下暗；中間一道鉚接線
    const c = x === 9 && view === 'back' ? r[1] : nx + ny < -0.8 ? r[4] : nx + ny < -0.2 ? r[3] : nx > 0.55 ? r[1] : r[2];
    S(x, y, c);
  }
  for (let x = -3; x <= 21; x++) S(x, 5, x < 3 ? r[3] : r[1]);
  for (let x = -2; x <= 20; x++) S(x, 4, x < 4 ? r[4] : r[2]);
  for (const x of [2, 9, 16]) { S(x, 2, r[0]); S(x, 1, r[4]); }
  if (view === 'side') {
    // 頭燈：外殼 + 鏡片（亮黃）
    const k = hex('#2c2838');
    S(17, -1, k); S(18, -1, k); S(19, 0, k); S(19, 1, k); S(19, 2, k);
    S(17, 0, hex('#ffffff')); S(18, 0, hex('#fff4c0')); S(17, 1, hex('#ffd86a')); S(18, 1, hex('#ffd86a')); S(17, 2, hex('#ffa93a')); S(18, 2, hex('#ffa93a'));
    S(17, 3, k); S(18, 3, k); S(16, 0, k); S(16, 1, k); S(16, 2, k);
  } else {
    for (let x = 1; x <= 18; x++) S(x, 3, hex('#2a1810')); // 頭燈的皮帶
  }
}
export function hatArt(b: Bmp, id: string, ox: number, oy: number, view: 'side' | 'back', sway: number): void {
  const s = new Bmp(b.w, b.h);
  const S = up((x: number, y: number, c: RGB): void => s.set(ox + x, oy + y, c));
  const g = (rows: string[], pal: Record<string, RGB>, x0: number, y0: number): void => {
    rows.forEach((row, y) => { for (let x = 0; x < row.length; x++) { const c = pal[row[x]]; if (c) S(x0 + x, y0 + y, c); } });
  };
  if (id === 'straw') {
    const st = clothRamp(8), band = clothRamp(3);
    for (let x = -4; x <= 23; x++) { S(x, 4, x < 3 ? st[4] : st[3]); if (x > -3 && x < 22) S(x, 5, st[2]); if (x > -1 && x < 20 && (x & 1)) S(x, 5, st[1]); }
    for (let y = -2; y <= 3; y++) for (let x = 1; x <= 18; x++) {
      const nx = (x + 0.5 - 9.6) / 8.8, ny = (y + 0.5 - 3.4) / 5.6;
      if (nx * nx + ny * ny <= 1) S(x, y, y === 3 ? band[3] : y === 2 ? band[2] : ((x + y) & 3) === 0 ? st[2] : nx < -0.35 ? st[4] : st[3]);
    }
    if (view === 'side') { S(0, 3, band[3]); S(-1, 4, band[2]); S(-2, 5, band[3]); }
  } else if (id === 'witch') {
    const c = clothRamp(10), band = clothRamp(11);
    for (let x = -4; x <= 22; x++) S(x, 4, x < 4 ? c[4] : c[3]);
    for (let x = -3; x <= 21; x++) S(x, 5, c[2]);
    // 尖頂往後彎
    for (let k = 0; k < 11; k++) {
      const y = 3 - k, w = Math.max(1, 6.6 - k * 0.58), cx = 9.6 - (k > 5 ? (k - 5) * (1.3 + sway * 0.4) : 0) * (view === 'side' ? 1 : 0.3);
      for (let x = Math.round(cx - w); x <= Math.round(cx + w); x++) S(x, y, x < cx - w + 1.5 ? c[4] : x > cx + w - 1.5 ? c[2] : c[3]);
    }
    for (let x = 4; x <= 15; x++) { S(x, 3, band[3]); S(x, 2, band[4]); }
    S(10, 3, GOLD); S(10, 2, hex('#fff4c0'));
  } else if (id === 'beret') {
    const c = clothRamp(3);
    for (let y = -2; y <= 3; y++) for (let x = -1; x <= 17; x++) {
      const nx = (x + 0.5 - 7.4) / 9.4, ny = (y + 0.5 - 1) / 3;
      if (nx * nx + ny * ny <= 1) S(x, y, ny > 0.45 ? c[2] : nx < -0.35 && ny < 0.2 ? c[4] : c[3]);
    }
    for (let x = 1; x <= 16; x++) S(x, 3, c[1]);
    S(8, -3, c[2]); S(8, -4, c[1]);
  } else if (id === 'maid') {
    const w = WHITE;
    g(['.w.w.w.w.w.w.', 'wWwWwWwWwWwWw', 'kkkkkkkkkkkkk'], { w: w[3], W: w[2], k: clothRamp(1)[3] }, 3, -1);
    if (view === 'back') { S(9, 3, w[3]); S(10, 4, w[2]); S(11, 3, w[3]); }
  } else if (id === 'miner') {
    minerHelm(S, view);
  } else if (id === 'flower') {
    const leaf = CR.green, cols = [hex('#ffc8dc'), hex('#ffffff'), hex('#ffd86a'), hex('#e890b0'), hex('#c4a0f0')];
    for (let x = 1; x <= 18; x++) S(x, -1 + (x > 4 && x < 15 ? -1 : 0), leaf[x & 1 ? 3 : 4]);
    for (let k = 0; k < 6; k++) {
      const x = 2 + k * 3, y = -2 + (k > 0 && k < 5 ? -1 : 0), c = cols[k % cols.length];
      S(x, y, c); S(x - 1, y, c); S(x + 1, y, c); S(x, y - 1, c); S(x, y + 1, c); S(x, y, k % 2 ? GOLD : hex('#fff4c0'));
    }
  }
  s.selOutline();
  b.blit(s, 0, 0);
}

// ── 背飾 ─────────────────────────────────────────────────
/**
 * 背飾：side = 側面（身體後方，往左飄）/ back = 背面（蓋在背上）。flap = 飄動（走路 / 跳 / 掉落）、lift = 往上掀。
 * 影格座標：肩膀約在 (20, 32)。
 */
export function backArt(b: Bmp, p: DollPiece, view: 'side' | 'back', flap: number, lift: number, dx: number, dy: number, f: number): void {
  const id = p.look.slice(5);
  const s = new Bmp(b.w, b.h);
  const S = (x: number, y: number, c: RGB): void => s.set(x + dx, y + dy, c);
  if (id === 'cape') {
    // 紅披風（外）+ 金色內裡：側面時內裡在靠身體那側露出兩欄、往後飄時下襬翻起來露出一角內裡
    const c = clothRamp(3), lin = clothRamp(8);
    if (view === 'side') {
      for (let y = 31; y <= 49; y++) {
        const t = (y - 31) / 18, trail = Math.round(t * t * (3 + flap * 4 + lift * 2));
        const wave = Math.round(Math.sin(t * Math.PI * 1.6 + flap) * t * 1.2);
        const x0 = 14 - trail - Math.round(t * 2.5) + wave, x1 = 20 - Math.round(trail * 0.4);
        const yy = y - Math.round(lift * t * 6);
        for (let x = x0; x <= x1; x++) {
          let col = x === x0 ? c[4] : x >= x1 - 1 ? (y < 34 ? lin[4] : x === x1 ? lin[2] : lin[3]) : y > 47 ? c[2] : (x - x0) % 3 === 2 && y > 35 ? c[2] : x === x0 + 1 && y < 42 ? c[4] : c[3];
          // 下襬翻起來的一角（飄動時）
          if (flap > 0.3 && y >= 46 && x <= x0 + (49 - y)) col = y === 49 ? lin[2] : lin[3];
          S(x, yy, col);
        }
      }
      for (let x = 15; x <= 21; x++) S(x, 31, c[4]);
      S(21, 32, GOLD); S(21, 33, GOLD); S(20, 32, hex('#fff4c0'));
    } else {
      for (let y = 31; y <= 48; y++) {
        const t = (y - 31) / 17, w = 6 + Math.round(t * 2.5), sw = Math.round(flap * t * 2);
        for (let x = 22 - w + sw; x <= 22 + w + sw; x++) {
          const fold = (x - 22 + 30) % 4 === 0 && y > 35;
          S(x, y, x <= 22 - w + sw + 1 ? c[4] : x >= 22 + w + sw - 1 ? c[2] : fold ? c[2] : y >= 47 ? c[2] : c[3]);
        }
      }
    }
  } else if (id === 'wings' || id === 'feathers') {
    const big = id === 'wings', w = WHITE, beat = Math.sin(f * 1.7) * (lift ? 2 : 0.6);
    const rows = big ? 9 : 5, len = big ? 10 : 6;
    const sides = view === 'side' ? [-1] : [-1, 1];
    for (const side of sides) {
      const rootX = view === 'side' ? 18 : 22 + side * 3, rootY = 33;
      for (let k = 0; k < rows; k++) {
        const y = rootY - Math.round(big ? 4 - k : 2 - k * 0.8) - Math.round(beat * (1 - k / rows)) + (lift ? -1 : 0);
        const reach = Math.round(len * (1 - Math.abs(k - rows * 0.35) / rows));
        for (let i = 0; i <= reach; i++) {
          const x = rootX + side * i;
          S(x, y, i === reach ? w[1] : k === 0 ? w[4] : (i + k) % 3 === 0 ? w[2] : w[3]);
        }
      }
    }
  } else if (id === 'bow') {
    const c = clothRamp(4);
    const rows = view === 'side' ? ['bb...', 'bBb..', 'bbbk.', 'bBb..', 'bb...'] : ['bb.....bb', 'bBbb.bbBb', 'bbbbkbbbb', '.bb.k.bb.', '...b.b...'];
    const x0 = view === 'side' ? 12 : 18, y0 = view === 'side' ? 37 : 37;
    rows.forEach((row, y) => { for (let x = 0; x < row.length; x++) { const ch = row[x]; if (ch !== '.') S(x0 + x, y0 + y, ch === 'B' ? c[4] : ch === 'k' ? c[2] : c[3]); } });
    if (view === 'side') { S(13, 42, c[2]); S(12, 43, c[3]); S(14, 43, c[2]); }
  } else if (id === 'buckler') {
    const r = CR.green, rim = LEATHER;
    const cx = view === 'side' ? 16.5 : 22, cy = 37;
    for (let y = cy - 4; y <= cy + 4; y++) for (let x = Math.floor(cx - 4); x <= Math.ceil(cx + 4); x++) {
      const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
      if (d > (view === 'side' ? 3.6 : 4.4)) continue;
      S(x, y, d > 3.2 ? rim[3] : d < 1.3 ? r[5] : x < cx ? r[4] : r[3]);
    }
  }
  if (id === 'cape' || id === 'bow') upgrades(s, p, [], null, f, clothRamp(3));
  s.outline(INK);
  b.blit(s, 0, 0);
}

// ── 鞋子 / 墜飾 / 腰間 ───────────────────────────────────
/** 飾品鞋：跳躍靴（綠色 + 彈簧）、疾行靴（白色 + 小翅膀） */
export function bootRamp(kind: 'jump' | 'swift'): RGB[] {
  return kind === 'jump' ? CR.green.slice(1, 6) : [hex('#5e5e74'), hex('#858aa0'), hex('#b4b9c8'), hex('#ffffff'), hex('#ffffff')];
}
export function bootExtra(b: Bmp, kind: 'jump' | 'swift', x: number, y: number): void {
  if (kind === 'jump') { b.set(x + 1, y + 2, GOLD); b.set(x + 3, y + 2, GOLD); }
  else { b.set(x - 1, y - 2, hex('#cceaf8')); b.set(x - 2, y - 3, hex('#ffffff')); b.set(x - 1, y - 3, hex('#ffffff')); }
}
export function neckArt(b: Bmp, kind: string, dx: number, dy: number): void {
  const S = (x: number, y: number, c: RGB): void => b.set(x + dx, y + dy, c);
  const chain = hex('#b4b9c8');
  S(23, 32, chain); S(24, 33, chain);
  const gem = kind === 'night' ? hex('#5c9ce0') : kind === 'fang' ? hex('#f2e2b0') : kind === 'heart' ? hex('#c8344c') : hex('#ffa93a');
  S(25, 34, gem); S(25, 35, kind === 'fang' ? hex('#b4b9c8') : gem);
  if (kind !== 'fang') S(25, 34, hex('#ffffff'));
}
export function beltArt(b: Bmp, kind: string, dx: number, dy: number): void {
  const S = (x: number, y: number, c: RGB): void => b.set(x + dx, y + dy, c);
  const x = 19, y = 41;
  if (kind === 'compass') { S(x, y, GOLD); S(x + 1, y, GOLD); S(x, y + 1, hex('#a83a10')); S(x + 1, y + 1, GOLD); }
  else if (kind === 'depth') { S(x, y, hex('#858aa0')); S(x + 1, y, hex('#b4b9c8')); S(x, y + 1, hex('#5c9ce0')); S(x + 1, y + 1, hex('#858aa0')); }
  else if (kind === 'magnet') { S(x, y, hex('#c8344c')); S(x + 1, y, hex('#c8344c')); S(x, y + 1, hex('#b4b9c8')); S(x + 1, y + 1, hex('#b4b9c8')); }
  else { S(x, y, hex('#f2e2b0')); S(x + 1, y, hex('#d8ba76')); S(x, y + 1, hex('#d8ba76')); S(x + 1, y + 1, hex('#a83a10')); }
}

/** 圖示用：只有頭盔 / 帽子（不畫頭） */
export function helmetOnly(b: Bmp, p: DollPiece): void { helmetArt(b, p, 11, 12, 0, 'side'); }
export function hatOnly(b: Bmp, id: string): void { hatArt(b, id, 11, 12, 'side', 0); }
