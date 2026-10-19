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
  if (view === 'side') {
    // 護肩（前肩）
    for (let y = 30; y <= 34; y++) for (let x = 22; x <= 27; x++) {
      const d = Math.hypot(x + 0.5 - 24.6, y + 0.5 - 32.2);
      if (d <= 2.7) S(x, y, d < 1.2 && x < 25 ? r[5] : x >= 26 || y >= 34 ? r[2] : r[4]);
    }
    if (set === 'bone') { S(26, 30, r[5]); S(27, 29, r[5]); }
    if (set === 'molten') S(25, 31, CR.lava[4]);
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

// ── 頭盔 ─────────────────────────────────────────────────
type Pt = [number, number];
const inCap = (x: number, y: number, k = 1): boolean => {
  const nx = (x + 0.5 - 8.6) / (10 * k), ny = (y + 0.5 - 7.8) / (9.4 * k);
  return nx * nx + ny * ny <= 1;
};
/**
 * 頭盔（側面 / 背面）：圓頂 + 往前後突出的帽沿 + 後頸護片，再依套裝加輪廓——
 * 木：皮帶箍；銅：護鼻條 + 鉚釘 + 護頰；鐵：前面的面甲（一道眼縫）+ 中脊 + 護頰；
 * 金：高高的冠脊 + 往後飄的紅羽 + 深色帽沿（不會被看成金髮）；骸衛：大彎角 + 眼窩點；熔心：三根尖刺（尖端熔岩）+ 護頰。
 */
export function helmetArt(head: Bmp, p: DollPiece, ox: number, oy: number, f: number, view: 'side' | 'back'): void {
  const set = armorSet(p)!;
  const r = ARMOR_RAMP[set], m = armor5(set);
  const S = (x: number, y: number, c: RGB): void => head.set(ox + x, oy + y, c);
  const brim = 5, side = view === 'side';
  for (let y = -2; y <= 12; y++) for (let x = -2; x <= 19; x++) {
    const dome = inCap(x, y, 1.05) && y <= brim;
    const nape = side ? x <= 4 && y <= 12 && inCap(x, Math.min(y, 9), 1.05) : y <= 11 && inCap(x, Math.min(y, 8), 1.05);
    if (!dome && !nape) continue;
    const nx = (x + 0.5 - 8.6) / 10, ny = (y + 0.5 - 7.8) / 9.4;
    const v = -(nx * 0.55 + ny * 0.85);
    S(x, y, v > 0.78 ? m[4] : v > 0.25 ? m[3] : v > -0.3 ? m[2] : m[1]);
  }
  // 帽沿：深一階的一道邊，側面往前突出 2 格、往後 1 格
  const rimC = set === 'gold' ? CR.leather[3] : m[1];
  for (let x = side ? -2 : -2; x <= (side ? 20 : 19); x++) S(x, brim, rimC);
  if (side) { S(19, brim + 1, m[0]); S(20, brim + 1, m[0]); }
  const cheek = set === 'copper' || set === 'iron' || set === 'molten';
  if (cheek) {
    // 護頰：耳朵前面一片（側面）／兩側（背面）
    const xs = side ? [4, 5, 6] : [-1, 0, 17, 18];
    for (const x of xs) for (let y = brim + 1; y <= 11; y++) S(x, y, x === xs[0] || x === 17 ? m[3] : m[2]);
    for (const x of xs) S(x, 12, m[1]);
  }
  switch (set) {
    case 'wood':
      for (let x = -1; x <= 18; x++) S(x, 3, CR.leather[x & 1 ? 3 : 4]);
      S(6, 0, m[1]); S(11, 0, m[1]); S(8, 1, m[1]);
      break;
    case 'copper':
      if (side) { for (let y = brim; y <= 9; y++) { S(17, y, m[3]); S(18, y, m[2]); } S(17, 10, m[1]); }
      S(3, 2, r[6]); S(9, -1, r[6]); S(14, 2, r[6]);
      break;
    case 'iron':
      if (side) {
        // 面甲：額頭前方一片，一道眼縫
        for (let y = 2; y <= brim; y++) for (let x = 15; x <= 19; x++) S(x, y, y === 4 ? r[0] : x === 19 ? m[1] : m[3]);
        S(19, 4, r[1]);
      }
      for (let y = -2; y <= 4; y++) S(side ? 9 : 8, y, m[4]);
      S(side ? 9 : 8, -3, m[3]);
      break;
    case 'gold': {
      // 冠脊 + 紅羽
      const red = CR.red;
      for (let x = 4; x <= 13; x++) { const hgt = x < 6 || x > 11 ? 1 : 2; for (let k = 1; k <= hgt; k++) S(x, -2 - k, k === hgt ? m[4] : m[3]); }
      if (side) {
        for (let k = 0; k < 8; k++) { S(4 - k, -3 + Math.round(k * 0.6), red[k < 3 ? 4 : 3]); S(4 - k, -2 + Math.round(k * 0.6), red[2]); }
        S(15, 3, red[4]); S(15, 2, hex('#ffffff'));
      } else {
        for (let k = 0; k < 9; k++) { S(8, -4 + k * 1.5, red[3]); S(9, -4 + k * 1.5, red[2]); }
      }
      break;
    }
    case 'bone': {
      const horn: Pt[] = side ? [[3, 0], [2, -1], [1, -2], [1, -3], [2, -4], [14, 0], [15, -1], [16, -2], [16, -3], [15, -4]]
        : [[0, 1], [-1, 0], [-2, -1], [-2, -2], [-1, -3], [17, 1], [18, 0], [19, -1], [19, -2], [18, -3]];
      for (const [x, y] of horn) S(x, y, m[4]);
      for (const [x, y] of horn.filter((_, i) => i % 5 === 4)) S(x, y, hex('#ffffff'));
      if (side) { S(12, 2, r[1]); S(16, 2, r[1]); S(14, 4, r[1]); }
      break;
    }
    case 'molten':
      for (const x of side ? [4, 8, 12] : [3, 8, 13]) {
        S(x, -2, m[2]); S(x + 1, -2, m[1]); S(x, -3, m[2]); S(x, -4, CR.lava[4]);
      }
      S(6, 1, CR.lava[3]); S(11, 2, CR.lava[4]); S(13, 0, CR.lava[2]);
      break;
  }
  const spots: Pt[] = [];
  for (let x = side ? 0 : -2; x <= (side ? 18 : 19); x++) spots.push([ox + x, oy + brim]);
  upgrades(head, p, spots, side ? [ox + 13, oy + 3] : null, f, r);
}

// ── 時裝帽子 ─────────────────────────────────────────────
export const HAT_HIDES_TOP = new Set(['straw', 'witch', 'beret', 'miner']);
/** 礦工頭燈盔：黃銅圓頂 + 帽緣，正面（右）一顆亮黃頭燈 */
const BRASS: RGB[] = [hex('#472819'), hex('#966139'), hex('#c99660'), hex('#d8ba76'), hex('#f2e2b0')];
function minerHelm(S: (x: number, y: number, c: RGB) => void, view: 'side' | 'back'): void {
  const r = BRASS;
  for (let y = -3; y <= 3; y++) for (let x = -1; x <= 18; x++) {
    const nx = (x + 0.5 - 8.6) / 9.2, ny = (y + 0.5 - 3.4) / 6.4;
    if (nx * nx + ny * ny > 1) continue;
    // 光從左上：左上亮、右下暗；中間一道鉚接線
    const c = x === 8 && view === 'back' ? r[1] : nx + ny < -0.75 ? r[4] : nx + ny < -0.2 ? r[3] : nx > 0.55 ? r[1] : r[2];
    S(x, y, c);
  }
  for (let x = -2; x <= 19; x++) S(x, 4, x < 3 ? r[3] : r[1]);
  for (const x of [2, 8, 14]) S(x, 2, r[0]);
  if (view === 'side') {
    // 頭燈：外殼 + 鏡片（亮黃）
    S(16, -1, hex('#2c2838')); S(17, -1, hex('#2c2838')); S(18, 0, hex('#2c2838')); S(18, 1, hex('#2c2838'));
    S(16, 0, hex('#fff4c0')); S(17, 0, hex('#ffd86a')); S(16, 1, hex('#ffd86a')); S(17, 1, hex('#ffa93a'));
    S(16, 2, hex('#2c2838')); S(17, 2, hex('#2c2838'));
  } else {
    for (let x = 1; x <= 16; x++) S(x, 3, hex('#2a1810')); // 頭燈的皮帶
  }
}
export function hatArt(b: Bmp, id: string, ox: number, oy: number, view: 'side' | 'back', sway: number): void {
  const s = new Bmp(b.w, b.h);
  const S = (x: number, y: number, c: RGB): void => s.set(ox + x, oy + y, c);
  const g = (rows: string[], pal: Record<string, RGB>, x0: number, y0: number): void => {
    rows.forEach((row, y) => { for (let x = 0; x < row.length; x++) { const c = pal[row[x]]; if (c) S(x0 + x, y0 + y, c); } });
  };
  if (id === 'straw') {
    const st = clothRamp(8), band = clothRamp(3);
    for (let x = -4; x <= 21; x++) { S(x, 3, x < 2 ? st[4] : st[3]); if (x > -3 && x < 20) S(x, 4, st[2]); }
    for (let y = -2; y <= 2; y++) for (let x = 1; x <= 16; x++) {
      const nx = (x + 0.5 - 8.6) / 8, ny = (y + 0.5 - 3) / 5.2;
      if (nx * nx + ny * ny <= 1) S(x, y, y === 2 ? band[3] : ((x + y) & 3) === 0 ? st[2] : nx < -0.3 ? st[4] : st[3]);
    }
    if (view === 'side') { S(-1, 2, band[3]); S(-2, 3, band[2]); }
  } else if (id === 'witch') {
    const c = clothRamp(10), band = clothRamp(11);
    for (let x = -3; x <= 20; x++) S(x, 3, x < 3 ? c[4] : c[3]);
    for (let x = -2; x <= 19; x++) S(x, 4, c[2]);
    // 尖頂往後彎
    for (let k = 0; k < 10; k++) {
      const y = 2 - k, w = Math.max(1, 6 - k * 0.55), cx = 8.6 - (k > 5 ? (k - 5) * (1.2 + sway * 0.4) : 0) * (view === 'side' ? 1 : 0.3);
      for (let x = Math.round(cx - w); x <= Math.round(cx + w); x++) S(x, y, x < cx - w + 1.5 ? c[4] : x > cx + w - 1.5 ? c[2] : c[3]);
    }
    for (let x = 3; x <= 14; x++) S(x, 2, band[3]);
    S(9, 2, GOLD);
  } else if (id === 'beret') {
    const c = clothRamp(3);
    for (let y = -2; y <= 2; y++) for (let x = -1; x <= 15; x++) {
      const nx = (x + 0.5 - 6.6) / 8.6, ny = (y + 0.5 - 0.6) / 2.8;
      if (nx * nx + ny * ny <= 1) S(x, y, ny > 0.4 ? c[2] : nx < -0.3 ? c[4] : c[3]);
    }
    S(7, -3, c[2]); S(7, -4, c[1]);
  } else if (id === 'maid') {
    const w = WHITE;
    g(['.w.w.w.w.w.', 'wWwWwWwWwWw', 'kkkkkkkkkkk'], { w: w[3], W: w[2], k: clothRamp(1)[3] }, 3, -2);
    if (view === 'back') { S(8, 2, w[3]); S(9, 3, w[2]); S(10, 2, w[3]); }
  } else if (id === 'miner') {
    minerHelm(S, view);
  } else if (id === 'flower') {
    const leaf = CR.green, cols = [hex('#ffc8dc'), hex('#ffffff'), hex('#ffd86a'), hex('#e890b0')];
    for (let x = 1; x <= 16; x++) S(x, -1 + (x > 4 && x < 13 ? -1 : 0), leaf[3]);
    for (let k = 0; k < 5; k++) {
      const x = 2 + k * 3, y = -2 + (k > 0 && k < 4 ? -1 : 0), c = cols[k % cols.length];
      S(x, y, c); S(x - 1, y, c); S(x + 1, y, c); S(x, y - 1, c); S(x, y, k % 2 ? GOLD : hex('#fff4c0'));
    }
  }
  s.outline(INK);
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
    const c = clothRamp(3), lin = clothRamp(9);
    if (view === 'side') {
      for (let y = 31; y <= 48; y++) {
        const t = (y - 31) / 17, trail = Math.round(t * t * (3 + flap * 4 + lift * 2));
        const x0 = 15 - trail - Math.round(t * 2), x1 = 20 - Math.round(trail * 0.5);
        for (let x = x0; x <= x1; x++) S(x, y - Math.round(lift * t * 6), x === x0 ? c[4] : x === x1 ? lin[3] : y > 46 ? c[2] : c[3]);
      }
      S(21, 31, GOLD); S(21, 32, GOLD);
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
export function helmetOnly(b: Bmp, p: DollPiece): void { helmetArt(b, p, 13, 13, 0, 'side'); }
export function hatOnly(b: Bmp, id: string): void { hatArt(b, id, 13, 13, 'side', 0); }
