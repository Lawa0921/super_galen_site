// combatArt.ts — 戰鬥系統的手繪像素圖（純 Bmp，無 DOM）：只用 pixel.ts 統一色票、光從左上、1px 描邊。
//   · 圖示：怪物素材、錠、合成站、武器、箭、防具（頭盔 / 胸甲 / 護脛 × 六套）、消耗品、戰鬥飾品、首領戰利品
//   · tile：熔爐（爐口火光）、鐵砧
//   · 共用：形狀遮罩自動打光（shadeMask）、對角線刀身（diagBlade）
import { Bmp, INK, hex, ramp, type RGB } from './pixel';
import type { ArmorSetId, ItemId } from '../engine/items';

const S = 16;
// ── 色階（由暗到亮，[0] 最暗） ───────────────────────────
export const R = {
  wood: ramp('#2a1810', '#472819', '#623924', '#7c4c2e', '#966139', '#b07a4b', '#c99660'),
  copper: ramp('#2a1810', '#6c1e14', '#a83a10', '#e8701c', '#ffa93a', '#f2b888', '#fff4c0'),
  iron: ramp('#1c1424', '#423f54', '#5e5e74', '#858aa0', '#b4b9c8', '#ffffff', '#ffffff'),
  silver: ramp('#1c1424', '#423f54', '#858aa0', '#b4b9c8', '#cceaf8', '#ffffff', '#ffffff'),
  gold: ramp('#2a1810', '#6c1e14', '#a83a10', '#ffa93a', '#ffd86a', '#fff4c0', '#ffffff'),
  bone: ramp('#2a1810', '#7c4c2e', '#b07a4b', '#d8ba76', '#f2e2b0', '#fff4c0', '#ffffff'),
  molten: ramp('#0c0a12', '#1c1424', '#2c2838', '#423f54', '#5e5e74', '#707490', '#858aa0'),
  lava: ramp('#6c1e14', '#a83a10', '#e8701c', '#ffa93a', '#ffd86a', '#fff4c0', '#ffffff'),
  stone: ramp('#1c1424', '#2c2838', '#423f54', '#5e5e74', '#707490', '#858aa0', '#b4b9c8'),
  gel: ramp('#18204a', '#1f6474', '#2c8692', '#4aaeb0', '#a2c8b0', '#cceaf8', '#ffffff'),
  cyan: ramp('#18204a', '#1f6474', '#2c8692', '#4aaeb0', '#a2c8b0', '#cceaf8', '#ffffff'),
  red: ramp('#2a1810', '#6c1e14', '#a83a10', '#e8701c', '#ffa93a', '#f2b888', '#fff4c0'),
  pink: ramp('#2c2450', '#463c78', '#7a5a8c', '#b8788e', '#f2b888', '#fff4c0', '#ffffff'),
  leather: ramp('#1c1424', '#2a1810', '#472819', '#623924', '#7c4c2e', '#966139', '#b07a4b'),
  green: ramp('#16301e', '#214528', '#2d672e', '#468a34', '#67ab3c', '#93cc50', '#c2e478'),
  purple: ramp('#0c0a12', '#1c1424', '#2c2450', '#463c78', '#7a5a8c', '#b8788e', '#f2b888'),
  yellow: ramp('#2a1810', '#623924', '#b07a4b', '#d8ba76', '#ffd86a', '#fff4c0', '#ffffff'),
};
/** 防具套裝 → 主色階 */
export const ARMOR_RAMP: Record<ArmorSetId, RGB[]> = {
  wood: R.wood, copper: R.copper, iron: R.iron, gold: R.gold, bone: R.bone, molten: R.molten,
};
/** 劍身 / 武器金屬色 */
export const WEAPON_METAL: Partial<Record<ItemId, RGB[]>> = {
  wood_sword: R.wood, copper_sword: R.copper, iron_sword: R.iron, gold_sword: R.gold,
  iron_spear: R.iron, bone_greatsword: R.bone, lumen_blade: R.cyan, throwing_knife: R.iron,
  wood_bow: R.wood, silver_bow: R.silver, wood_boomerang: R.wood, crystal_staff: R.pink,
};

// ── 形狀工具 ─────────────────────────────────────────────
/** 依遮罩自動打光：上 / 左外露 = 亮、下 / 右外露 = 暗、內部上半較亮 */
export function shadeMask(b: Bmp, mask: (x: number, y: number) => boolean, pal: RGB[], box = { x0: 0, y0: 0, x1: S - 1, y1: S - 1 }): void {
  const on = (x: number, y: number): boolean => x >= box.x0 && y >= box.y0 && x <= box.x1 && y <= box.y1 && mask(x, y);
  const midY = (box.y0 + box.y1) / 2;
  for (let y = box.y0; y <= box.y1; y++) {
    for (let x = box.x0; x <= box.x1; x++) {
      if (!on(x, y)) continue;
      let k: number;
      if (!on(x, y - 1) || !on(x - 1, y)) k = 5;
      else if (!on(x, y + 1) || !on(x + 1, y)) k = 2;
      else k = y < midY ? 4 : 3;
      b.set(x, y, pal[k]);
    }
  }
}
/** 對角線刀身（往右上）：從 (x0,y0) 往右上 len 格，寬 3（亮 / 中 / 暗三條對角線），尖端收窄 */
function diagBlade(b: Bmp, x0: number, y0: number, len: number, pal: RGB[], wide = false): void {
  for (let i = 0; i < len; i++) {
    const x = x0 + i, y = y0 - i;
    const tip = i >= len - 1;
    b.set(x, y, pal[4]);
    if (!tip) { b.set(x - 1, y, pal[5]); b.set(x, y + 1, pal[2]); }
    if (wide && i < len - 2) { b.set(x - 1, y - 1, pal[6]); b.set(x + 1, y + 1, pal[1]); }
  }
  b.set(x0 + len, y0 - len, pal[5]);
}
function done(b: Bmp): Bmp { return b.outline(INK); }
/** 沿二次曲線 p0→c→p1 的筆刷遮罩：t 處半寬 = width(t) */
function strokeMask(p0: [number, number], c: [number, number], p1: [number, number], width: (t: number) => number): (x: number, y: number) => boolean {
  const pts: [number, number, number][] = [];
  for (let i = 0; i <= 40; i++) {
    const t = i / 40, u = 1 - t;
    pts.push([u * u * p0[0] + 2 * u * t * c[0] + t * t * p1[0], u * u * p0[1] + 2 * u * t * c[1] + t * t * p1[1], width(t)]);
  }
  return (x, y) => pts.some(([px, py, w]) => Math.hypot(x + 0.5 - px, y + 0.5 - py) <= w);
}
/** 心形遮罩（中心 cx,cy、半寬 r） */
function heartMask(cx: number, cy: number, r: number): (x: number, y: number) => boolean {
  return (x, y) => {
    const nx = (x + 0.5 - cx) / r, ny = (cy - (y + 0.5)) / r + 0.15;
    const a = nx * nx + ny * ny - 1;
    return a * a * a - nx * nx * ny * ny * ny <= 0;
  };
}

// ── 怪物素材 ─────────────────────────────────────────────
export function iconGel(): Bmp {
  const b = new Bmp(S, S), p = R.gel;
  shadeMask(b, (x, y) => { const dx = (x + 0.5 - 8) / 5.5, dy = (y + 0.5 - 10) / 4.5; return dx * dx + dy * dy <= 1 || (y >= 4 && y < 7 && Math.abs(x + 0.5 - 8) < (y - 3) * 1.1); }, p);
  b.set(6, 8, p[6]); b.set(5, 9, p[6]); b.set(6, 9, p[5]);
  b.set(10, 12, p[1]); b.set(8, 11, p[2]);
  return done(b);
}
export function iconBone(): Bmp {
  const b = new Bmp(S, S), p = R.bone;
  for (let i = 0; i < 9; i++) { b.set(4 + i, 11 - i, p[4]); b.set(5 + i, 11 - i, p[2]); b.set(4 + i, 10 - i, p[5]); }
  for (const [cx, cy] of [[3, 12], [4, 13], [12, 3], [13, 4]] as const) b.disc(cx + 0.5, cy + 0.5, 1.6, 1.6, p[4]);
  b.set(2, 12, p[6]); b.set(12, 2, p[6]); b.set(14, 4, p[2]); b.set(5, 14, p[2]);
  return done(b);
}
export function iconFeather(): Bmp {
  const b = new Bmp(S, S), p = ramp('#1c1424', '#2a1810', '#472819', '#7c4c2e', '#b07a4b', '#d8ba76', '#f2e2b0');
  // 羽片：沿微彎的羽軸、中段最寬
  shadeMask(b, strokeMask([3, 13], [6, 5], [13, 2], (t) => (t < 0.18 ? 0.4 : 0.6 + Math.sin(Math.min(1, (t - 0.12) / 0.88) * Math.PI) * 2.6)), p);
  // 羽軸（亮）+ 羽枝暗紋
  const shaft = strokeMask([3, 13], [6, 5], [13, 2], () => 0.55);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) if (shaft(x, y)) b.set(x, y, p[6]);
  for (const [x, y] of [[5, 6], [7, 4], [9, 3], [8, 7], [10, 5], [6, 9]] as const) if (b.on(x, y)) b.set(x, y, p[2]);
  b.set(2, 14, p[5]); b.set(3, 14, p[4]);
  return done(b);
}
export function iconFang(): Bmp {
  const b = new Bmp(S, S), p = R.bone;
  shadeMask(b, strokeMask([5, 3], [5, 10], [11, 13], (t) => 2.8 * (1 - t) + 0.45), p);
  // 牙根（帶血色的牙齦）
  b.rect(2, 2, 7, 2, R.red[2]); b.rect(2, 2, 7, 1, R.red[3]); b.set(2, 2, R.red[4]);
  return done(b);
}
export function iconChitin(): Bmp {
  const b = new Bmp(S, S), p = ramp('#1c1424', '#2a1810', '#6c1e14', '#a83a10', '#e8701c', '#ffa93a', '#f2b888');
  // 弧形甲殼片：上半橢圓，三道橫向節紋
  shadeMask(b, (x, y) => { const dx = (x + 0.5 - 8) / 6.5, dy = (y + 0.5 - 12) / 9; return y <= 12 && dx * dx + dy * dy <= 1; }, p);
  for (const yy of [6, 9]) for (let x = 1; x < 15; x++) if (b.on(x, yy)) b.set(x, yy, p[1]);
  for (const [x, y] of [[5, 4], [6, 7], [5, 10], [8, 4]] as const) b.set(x, y, p[6]);
  b.rect(2, 13, 12, 1, p[1]);
  return done(b);
}
export function iconStinger(): Bmp {
  const b = new Bmp(S, S), y = R.yellow;
  for (let i = 0; i < 11; i++) {
    const x = 3 + i, yy = 12 - i;
    b.set(x, yy, i > 8 ? INK : y[4]);
    if (i < 8) { b.set(x - 1, yy, y[5]); b.set(x, yy + 1, i % 3 === 0 ? INK : y[2]); }
  }
  b.disc(3.5, 12.5, 2, 2, y[3]); b.set(2, 12, INK); b.set(4, 13, INK);
  return done(b);
}
export function iconSpore(): Bmp {
  const b = new Bmp(S, S), p = R.cyan;
  shadeMask(b, (x, y) => { const dx = (x + 0.5 - 8) / 5, dy = (y + 0.5 - 8.5) / 5.5; return dx * dx + dy * dy <= 1; }, p);
  for (const [x, y] of [[6, 6], [10, 7], [7, 11], [10, 11], [5, 9]] as const) b.set(x, y, p[6]);
  b.rect(7, 2, 2, 2, R.green[3]); b.set(7, 2, R.green[5]);
  return done(b);
}
export function iconEmber(): Bmp {
  const b = new Bmp(S, S), l = R.lava, c = R.molten;
  shadeMask(b, (x, y) => { const dx = (x + 0.5 - 8) / 6, dy = (y + 0.5 - 9) / 5; return dx * dx + dy * dy <= 1; }, c);
  for (const [x, y] of [[5, 8], [6, 9], [7, 10], [8, 10], [9, 9], [10, 8], [7, 7], [8, 8], [10, 11], [6, 11]] as const) b.set(x, y, l[3]);
  b.set(8, 9, l[5]); b.set(7, 9, l[4]); b.set(9, 10, l[4]);
  b.set(8, 3, l[3]); b.set(9, 2, l[4]); b.set(6, 4, l[2]);
  return done(b);
}

// ── 錠 / 合成站 ─────────────────────────────────────────
/** 錠：梯形頂面 + 正面 + 側面 */
export function iconBar(p: RGB[], glow = false): Bmp {
  const b = new Bmp(S, S);
  for (let y = 5; y <= 7; y++) b.rect(4 - (y - 5), y, 9 + (y - 5) * 2, 1, p[5]);
  b.rect(2, 8, 12, 4, p[3]);
  b.rect(2, 8, 12, 1, p[4]);
  b.rect(2, 11, 12, 1, p[2]);
  b.rect(4, 5, 9, 1, p[6]);
  b.set(13, 8, p[2]); b.set(13, 9, p[2]); b.set(13, 10, p[1]);
  b.set(5, 9, p[5]); b.set(6, 9, p[4]);
  if (glow) { b.set(7, 10, R.lava[3]); b.set(8, 9, R.lava[4]); b.set(10, 10, R.lava[3]); b.set(9, 6, R.lava[4]); b.set(6, 6, R.lava[3]); }
  return done(b);
}
/** 熔爐：石塊爐身 + 拱形爐口火光 + 煙囪 */
export function furnaceBmp(frame = 0): Bmp {
  const b = new Bmp(S, S), s = R.stone, l = R.lava;
  shadeMask(b, (x, y) => (y >= 3 && x >= 1 && x <= 14) || (y >= 0 && y < 3 && x >= 10 && x <= 13), s);
  // 石縫
  for (const [x, y, w] of [[2, 6, 5], [8, 6, 6], [2, 13, 4], [9, 13, 5]] as const) b.rect(x, y, w, 1, s[2]);
  for (const [x, y] of [[7, 4], [5, 7], [11, 7], [7, 14]] as const) b.set(x, y, s[2]);
  // 爐口（拱形）
  for (let y = 8; y <= 13; y++) for (let x = 4; x <= 11; x++) {
    const arch = y === 8 ? x >= 6 && x <= 9 : y === 9 ? x >= 5 && x <= 10 : true;
    if (!arch) continue;
    const hot = y >= 11 ? 3 + ((x + frame) % 3 === 0 ? 1 : 0) : y >= 10 ? 2 : 1;
    b.set(x, y, l[hot]);
  }
  b.set(7, 11, l[5]); b.set(8, 12, l[5 - (frame & 1)]); b.set(6, 12, l[4]);
  b.rect(4, 14, 8, 1, s[1]);
  return b.outline(INK);
}
/** 鐵砧：寬頂面 + 尖角 + 收腰 + 底座 */
export function anvilBmp(): Bmp {
  const b = new Bmp(S, S), m = R.iron;
  shadeMask(b, (x, y) => {
    if (y === 6) return x >= 1 && x <= 14;
    if (y === 7) return x >= 0 && x <= 14;
    if (y === 8) return x >= 2 && x <= 13;
    if (y === 9) return x >= 4 && x <= 11;
    if (y >= 10 && y <= 11) return x >= 5 && x <= 10;
    if (y >= 12 && y <= 13) return x >= 3 && x <= 12;
    if (y === 14 || y === 15) return x >= 2 && x <= 13;
    return false;
  }, ramp('#0c0a12', '#1c1424', '#2c2838', '#423f54', '#5e5e74', '#858aa0', '#b4b9c8'));
  b.rect(2, 6, 11, 1, m[4]); b.set(1, 6, m[5]); b.set(14, 7, m[2]);
  return b.outline(INK);
}

// ── 武器 ───────────────────────────────────────────────
/** 劍：右上刀尖、左下劍柄；guard = 護手色、grip = 握把色 */
export function iconSword(blade: RGB[], guard: RGB[] = R.gold, grip: RGB[] = R.leather, opts: { len?: number; wide?: boolean; glow?: boolean } = {}): Bmp {
  const b = new Bmp(S, S), len = opts.len ?? 9;
  diagBlade(b, 5, 10, len, blade, opts.wide);
  // 護手（垂直於刀身：左上 ↔ 右下）
  for (let k = -2; k <= 2; k++) b.set(4 + k, 11 + k, k === -2 ? guard[5] : k === 2 ? guard[2] : guard[4]);
  // 握把 + 柄頭
  b.set(3, 12, grip[4]); b.set(2, 13, grip[3]); b.set(3, 13, grip[2]);
  b.set(1, 14, guard[4]); b.set(0, 15, guard[3]); b.set(1, 15, guard[2]); b.set(0, 14, guard[5]);
  if (opts.glow) { b.set(9, 6, R.cyan[6]); b.set(12, 3, R.cyan[6]); }
  return done(b);
}
export function iconSpear(): Bmp {
  const b = new Bmp(S, S), w = R.wood, m = R.iron;
  for (let i = 0; i < 11; i++) { b.set(1 + i, 14 - i, w[4]); b.set(2 + i, 14 - i, w[2]); }
  // 矛頭：菱形
  for (let i = 0; i < 4; i++) { b.set(11 + i, 4 - i, m[5]); b.set(12 + i, 4 - i, m[3]); b.set(11 + i, 3 - i, m[6]); }
  b.set(10, 4, m[4]); b.set(12, 5, m[2]); b.set(11, 5, m[3]); b.set(10, 3, m[5]);
  b.set(11, 4, R.red[3]);
  return done(b);
}
export function iconBow(p: RGB[]): Bmp {
  const b = new Bmp(S, S);
  // 弓臂：從右上到左下的弧（往左上凸）
  for (let t = 0; t <= 24; t++) {
    const a = (t / 24) * Math.PI;
    const x = 8 - Math.sin(a) * 4.2 + (t / 24 - 0.5) * -10 + 0.5, y = 8 + (t / 24 - 0.5) * 12 - Math.sin(a) * 2.5;
    b.set(Math.round(x), Math.round(y), t > 9 && t < 15 ? R.leather[3] : p[t < 12 ? 5 : 3]);
  }
  // 弓弦（直線）
  b.line(13, 2, 3, 14, hex('#f2e2b0'));
  return done(b);
}
export function iconKnife(): Bmp {
  const b = new Bmp(S, S), m = R.iron;
  diagBlade(b, 6, 9, 6, m);
  for (let k = -1; k <= 1; k++) b.set(5 + k, 10 + k, R.gold[4]);
  b.set(4, 11, R.leather[4]); b.set(3, 12, R.leather[3]); b.set(2, 13, R.gold[3]);
  return done(b);
}
export function iconBoomerang(): Bmp {
  const b = new Bmp(S, S), w = R.wood;
  shadeMask(b, (x, y) => {
    const ax = x + 0.5, ay = y + 0.5;
    const arm1 = Math.abs(ay - 4) <= 1.6 && ax >= 3 && ax <= 13 - (ay - 4) * 0.3;
    const arm2 = Math.abs(ax - 4) <= 1.6 && ay >= 3 && ay <= 13;
    return arm1 || arm2;
  }, w);
  b.set(12, 4, R.green[4]); b.set(4, 12, R.green[4]); b.set(5, 5, w[6]);
  return done(b);
}
export function iconStaff(): Bmp {
  const b = new Bmp(S, S), w = R.wood, g = R.pink;
  for (let i = 0; i < 10; i++) { b.set(1 + i, 14 - i, w[4]); b.set(2 + i, 14 - i, w[2]); }
  // 爪座 + 水晶
  b.set(10, 4, R.gold[4]); b.set(12, 6, R.gold[3]); b.set(9, 5, R.gold[5]);
  shadeMask(b, (x, y) => { const dx = Math.abs(x + 0.5 - 12.5), dy = Math.abs(y + 0.5 - 3.5); return dx + dy * 0.8 <= 2.8; }, g, { x0: 9, y0: 0, x1: 15, y1: 7 });
  b.set(12, 2, g[6]);
  return done(b);
}
export function iconArrow(flame: boolean): Bmp {
  const b = new Bmp(S, S), w = R.wood, m = R.stone;
  for (let i = 0; i < 9; i++) b.set(3 + i, 12 - i, w[4]);
  // 箭頭
  b.set(12, 3, m[5]); b.set(13, 2, m[6]); b.set(11, 3, m[4]); b.set(12, 4, m[3]); b.set(13, 3, m[3]); b.set(12, 2, m[5]);
  // 羽
  for (const [x, y] of [[2, 12], [3, 13], [1, 12], [2, 14], [3, 11], [4, 13]] as const) b.set(x, y, hex('#f2e2b0'));
  b.set(1, 13, R.red[2]);
  if (flame) {
    const l = R.lava;
    for (const [x, y, k] of [[13, 1, 4], [14, 2, 3], [14, 0, 2], [15, 1, 2], [12, 1, 3], [13, 0, 1], [11, 2, 2]] as const) b.set(x, y, l[k]);
  }
  return done(b);
}

// ── 防具 ───────────────────────────────────────────────
/** 頭盔：圓頂 + 護頰 + 眼縫（各套細節不同） */
export function iconHelmet(set: ArmorSetId): Bmp {
  const b = new Bmp(S, S), p = ARMOR_RAMP[set];
  shadeMask(b, (x, y) => {
    const dx = (x + 0.5 - 8) / 6, dy = (y + 0.5 - 8) / 6;
    if (y < 8) return dx * dx + dy * dy <= 1;
    if (y <= 12) return x >= 2 && x <= 13 && !(y >= 10 && x >= 6 && x <= 9);
    return false;
  }, p);
  // 眼縫
  b.rect(4, 8, 8, 1, INK);
  if (set === 'bone') { b.rect(4, 7, 3, 2, INK); b.rect(9, 7, 3, 2, INK); b.set(8, 10, p[2]); b.set(7, 11, p[3]); }
  if (set === 'wood') for (const x of [5, 9]) for (let y = 3; y < 8; y++) b.set(x, y, p[2]);
  if (set === 'copper' || set === 'iron' || set === 'gold') { b.set(3, 10, p[6]); b.set(12, 10, p[1]); b.rect(7, 2, 2, 6, p[5]); }
  if (set === 'gold') { b.set(8, 1, R.red[3]); b.set(7, 0, R.red[4]); b.set(8, 0, R.red[2]); }
  if (set === 'molten') { for (const [x, y] of [[5, 4], [6, 5], [10, 3], [10, 5], [3, 11], [12, 10]] as const) b.set(x, y, R.lava[3]); b.rect(4, 8, 8, 1, R.lava[4]); }
  return done(b);
}
/** 胸甲：肩甲 + 身甲 + 領口缺口 */
export function iconChest(set: ArmorSetId): Bmp {
  const b = new Bmp(S, S), p = ARMOR_RAMP[set];
  shadeMask(b, (x, y) => {
    if (y < 2 || y > 14) return false;
    if (y <= 4) return (x >= 1 && x <= 5) || (x >= 10 && x <= 14) || (y >= 3 && x >= 5 && x <= 10 && !(y === 3 && x >= 6 && x <= 9));
    return x >= 3 && x <= 12;
  }, p);
  for (let x = 6; x <= 9; x++) b.clear(x, 2);
  b.rect(3, 12, 10, 1, p[1]);
  if (set === 'bone') for (const y of [6, 8, 10]) { b.rect(4, y, 3, 1, p[1]); b.rect(9, y, 3, 1, p[1]); }
  else if (set === 'wood') for (const y of [6, 9]) b.rect(3, y, 10, 1, p[2]);
  else { for (let y = 5; y < 12; y++) b.set(8, y, p[2]); b.set(5, 6, p[6]); b.set(4, 13, p[4]); b.set(11, 13, p[4]); }
  if (set === 'gold') { b.set(7, 7, R.red[3]); b.set(8, 7, R.red[2]); }
  if (set === 'molten') for (const [x, y] of [[5, 7], [6, 8], [10, 6], [9, 9], [6, 11], [11, 10], [4, 4], [12, 3]] as const) b.set(x, y, R.lava[3]);
  return done(b);
}
/** 護脛：兩條腿甲 + 護膝 + 靴頭 */
export function iconGreaves(set: ArmorSetId): Bmp {
  const b = new Bmp(S, S), p = ARMOR_RAMP[set];
  shadeMask(b, (x, y) => {
    if (y < 2 || y > 14) return false;
    if (y <= 4) return x >= 3 && x <= 12;
    const l = x >= 3 && x <= 6, r = x >= 9 && x <= 12;
    if (y >= 12) return (x >= 2 && x <= 7) || (x >= 9 && x <= 14);
    return l || r;
  }, p);
  b.rect(3, 4, 10, 1, p[1]);
  b.rect(3, 8, 4, 1, p[5]); b.rect(9, 8, 4, 1, p[4]);
  if (set === 'bone') { b.set(4, 6, p[1]); b.set(10, 6, p[1]); b.set(4, 10, p[1]); b.set(10, 10, p[1]); }
  if (set === 'molten') for (const [x, y] of [[4, 6], [11, 7], [5, 11], [10, 10], [13, 13], [3, 13]] as const) b.set(x, y, R.lava[3]);
  return done(b);
}

// ── 消耗品 / 飾品 / 首領 ─────────────────────────────────
export function iconLifeCore(): Bmp {
  const b = new Bmp(S, S), p = ramp('#2a1810', '#6c1e14', '#6c1e14', '#a83a10', '#e8701c', '#f2b888', '#fff4c0');
  // 心形晶體：中間一道切面
  shadeMask(b, heartMask(8, 8, 6.4), p);
  for (let y = 5; y <= 12; y++) if (b.on(8, y)) b.set(8, y, p[2]);
  b.set(4, 5, p[6]); b.set(5, 4, p[6]); b.set(4, 6, p[5]);
  b.set(10, 5, p[5]);
  return done(b);
}
export function iconPotion(): Bmp {
  const b = new Bmp(S, S), g = R.cyan, l = R.red;
  shadeMask(b, (x, y) => { const dx = (x + 0.5 - 8) / 5.5, dy = (y + 0.5 - 10) / 4.5; return dx * dx + dy * dy <= 1; }, ramp('#2c2838', '#423f54', '#5e5e74', '#94c8ee', '#cceaf8', '#ffffff', '#ffffff'));
  for (let y = 9; y <= 13; y++) for (let x = 3; x <= 12; x++) { const dx = (x + 0.5 - 8) / 4.6, dy = (y + 0.5 - 10.4) / 3.6; if (dx * dx + dy * dy <= 1) b.set(x, y, y === 9 ? l[4] : l[2 + ((x + y) % 2)]); }
  b.rect(6, 3, 4, 3, g[4]); b.rect(6, 3, 1, 3, g[5]);
  b.rect(6, 1, 4, 2, R.wood[4]); b.set(6, 1, R.wood[6]);
  b.set(5, 8, hex('#ffffff'));
  return done(b);
}
export function iconOffering(): Bmp {
  const b = new Bmp(S, S), c = R.cyan, w = R.wood;
  // 陶碗 + 燈芯 + 青色火焰
  shadeMask(b, (x, y) => y >= 10 && y <= 13 && Math.abs(x + 0.5 - 8) <= 6 - (y - 10) * 0.9, ramp('#2a1810', '#472819', '#6c1e14', '#a83a10', '#b8788e', '#d98f66', '#f2b888'));
  b.rect(3, 10, 10, 1, w[5]);
  b.rect(7, 7, 2, 3, R.bone[5]);
  for (const [x, y, k] of [[7, 6, 4], [8, 6, 5], [7, 5, 5], [8, 4, 6], [7, 3, 4], [8, 5, 6], [9, 5, 3], [6, 5, 3]] as const) b.set(x, y, c[k]);
  b.set(3, 9, R.green[4]); b.set(12, 9, R.green[4]); b.set(2, 8, R.cyan[4]); b.set(13, 8, R.cyan[4]);
  return done(b);
}
export function iconBuckler(): Bmp {
  const b = new Bmp(S, S), p = ramp('#1c1424', '#2a1810', '#6c1e14', '#a83a10', '#e8701c', '#ffa93a', '#f2b888');
  shadeMask(b, (x, y) => { const dx = (x + 0.5 - 8) / 6.5, dy = (y + 0.5 - 8) / 6.5; return dx * dx + dy * dy <= 1; }, p);
  b.disc(8, 8, 2, 2, R.iron[4]); b.set(7, 7, R.iron[6]);
  for (let a = 0; a < 6; a++) { const t = (a / 6) * Math.PI * 2; b.set(Math.round(8 + Math.cos(t) * 4.2), Math.round(8 + Math.sin(t) * 4.2), p[1]); }
  return done(b);
}
function charm(draw: (b: Bmp) => void): Bmp {
  const b = new Bmp(S, S), c = R.leather;
  for (let i = 0; i < 5; i++) { b.set(3 + i, 1 + (i >> 1), c[4]); b.set(12 - i, 1 + (i >> 1), c[4]); }
  b.set(8, 4, R.gold[4]); b.set(7, 4, R.gold[3]);
  draw(b);
  return done(b);
}
export function iconFangCharm(): Bmp {
  return charm((b) => {
    const p = R.bone;
    for (let y = 5; y <= 14; y++) { const t = (y - 5) / 9, cx = 7.5 + t * t * 2.5, h = 2.2 * (1 - t) + 0.3; for (let x = 0; x < S; x++) if (Math.abs(x + 0.5 - cx) <= h) b.set(x, y, Math.abs(x + 0.5 - cx) > h - 1 && x + 0.5 > cx ? p[2] : p[5 - (y > 10 ? 1 : 0)]); }
  });
}
export function iconFeatherCharm(): Bmp {
  return charm((b) => {
    for (let i = 0; i < 9; i++) { b.set(8 - (i > 5 ? 1 : 0), 5 + i, R.bone[5]); if (i > 0 && i < 8) { b.set(7 - (i > 5 ? 1 : 0), 5 + i, R.silver[4]); b.set(9 - (i > 5 ? 1 : 0), 5 + i, R.silver[3]); } }
    for (const y of [7, 9, 11]) { b.set(6, y, R.silver[5]); b.set(10, y + 1, R.silver[2]); }
  });
}
export function iconWardenHeart(): Bmp {
  const b = new Bmp(S, S), c = R.cyan, g = R.gold;
  shadeMask(b, heartMask(8, 9, 6), c);
  // 黃銅籠條（沿心形輪廓的三條豎條 + 吊環）
  for (const x of [5, 8, 11]) for (let y = 3; y < 15; y++) if (b.on(x, y)) b.set(x, y, g[x === 8 ? 4 : 3]);
  b.set(4, 6, c[6]); b.set(6, 6, c[6]); b.set(9, 11, c[5]);
  b.rect(7, 1, 3, 2, g[4]); b.set(8, 1, g[6]);
  return done(b);
}
export function iconTrophy(): Bmp {
  const b = new Bmp(S, S), w = R.wood, g = R.gold, c = R.cyan;
  // 木牌
  shadeMask(b, (x, y) => x >= 1 && x <= 14 && y >= 2 && y <= 14 && !((x === 1 || x === 14) && (y === 2 || y === 14)), w);
  // 燈籠徽記
  b.rect(6, 4, 4, 1, g[4]);
  shadeMask(b, (x, y) => x >= 5 && x <= 10 && y >= 5 && y <= 11 && !((x === 5 || x === 10) && (y === 5 || y === 11)), g, { x0: 5, y0: 5, x1: 10, y1: 11 });
  b.rect(6, 6, 4, 5, c[3]); b.set(7, 7, c[6]); b.set(8, 8, c[5]); b.set(7, 8, c[4]);
  b.rect(7, 12, 2, 1, g[3]);
  return done(b);
}

/** 新道具 id → 圖示 */
export function combatIcon(item: ItemId): Bmp | null {
  switch (item) {
    case 'gel': return iconGel();
    case 'bone': return iconBone();
    case 'feather': return iconFeather();
    case 'fang': return iconFang();
    case 'chitin': return iconChitin();
    case 'stinger': return iconStinger();
    case 'spore': return iconSpore();
    case 'ember': return iconEmber();
    case 'copper_bar': return iconBar(R.copper);
    case 'iron_bar': return iconBar(R.iron);
    case 'silver_bar': return iconBar(R.silver);
    case 'gold_bar': return iconBar(R.gold);
    case 'molten_bar': return iconBar(R.molten, true);
    case 'furnace': return furnaceBmp(0);
    case 'anvil': return anvilBmp();
    case 'wood_sword': return iconSword(R.wood, R.wood, R.leather, { len: 8 });
    case 'copper_sword': return iconSword(R.copper, R.copper, R.leather);
    case 'iron_sword': return iconSword(R.iron, R.iron, R.leather);
    case 'gold_sword': return iconSword(R.gold, R.gold, R.red, { len: 10 });
    case 'bone_greatsword': return iconSword(R.bone, R.leather, R.leather, { len: 10, wide: true });
    case 'lumen_blade': return iconSword(R.cyan, R.gold, R.purple, { len: 10, glow: true });
    case 'iron_spear': return iconSpear();
    case 'wood_bow': return iconBow(R.wood);
    case 'silver_bow': return iconBow(R.silver);
    case 'throwing_knife': return iconKnife();
    case 'wood_boomerang': return iconBoomerang();
    case 'crystal_staff': return iconStaff();
    case 'wooden_arrow': return iconArrow(false);
    case 'flaming_arrow': return iconArrow(true);
    case 'life_core': return iconLifeCore();
    case 'healing_potion': return iconPotion();
    case 'wick_offering': return iconOffering();
    case 'chitin_buckler': return iconBuckler();
    case 'fang_charm': return iconFangCharm();
    case 'feather_charm': return iconFeatherCharm();
    case 'warden_heart': return iconWardenHeart();
    case 'warden_trophy': return iconTrophy();
    default: break;
  }
  const m = /^(wood|copper|iron|gold|bone|molten)_(helmet|chestplate|greaves)$/.exec(item);
  if (m) {
    const set = m[1] as ArmorSetId;
    return m[2] === 'helmet' ? iconHelmet(set) : m[2] === 'chestplate' ? iconChest(set) : iconGreaves(set);
  }
  return null;
}
