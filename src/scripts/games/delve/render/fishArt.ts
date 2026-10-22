// fishArt.ts — 釣魚相關的 16×16 圖示（純 Bmp，無 DOM）：釣竿 ×4、魚餌 ×5、魚 ×21（參數化的魚身產生器 +
// 幾種特殊外形：蝦、魷、魟、鮟鱇、鰻）、泡爛的靴子、木箱 ×3、料理 ×3、營火。全部統一色票、1px 描邊、光從左上。
import { Bmp, INK, h01, ramp, type RGB } from './pixel';
import type { ItemId } from '../engine/items';

const S = 16;
type Ramp = RGB[];
const R = {
  silver: ramp('#2c2838', '#5e5e74', '#858aa0', '#b4b9c8', '#ffffff'),
  olive: ramp('#16301e', '#214528', '#468a34', '#93cc50', '#c2e478'),
  trout: ramp('#2c2450', '#463c78', '#7a5a8c', '#b8788e', '#f2b888'),
  mud: ramp('#2a1810', '#472819', '#623924', '#7c4c2e', '#b07a4b'),
  sun: ramp('#6c1e14', '#a83a10', '#e8701c', '#ffa93a', '#ffd86a'),
  frost: ramp('#18204a', '#2c4486', '#5c9ce0', '#94c8ee', '#cceaf8'),
  koi: ramp('#6c1e14', '#a83a10', '#e8701c', '#f2e2b0', '#ffffff'),
  eel: ramp('#0c0a12', '#18204a', '#2c4486', '#7f9cc4', '#cceaf8'),
  storm: ramp('#1c1424', '#2c2838', '#423f54', '#ffd86a', '#fff4c0'),
  mist: ramp('#423f54', '#707490', '#a2c8b0', '#cceaf8', '#ffffff'),
  salmon: ramp('#6c1e14', '#a83a10', '#e8701c', '#f2b888', '#fff4c0'),
  petal: ramp('#7a5a8c', '#b8788e', '#f2b888', '#fff4c0', '#ffffff'),
  pale: ramp('#5e5e74', '#858aa0', '#b4b9c8', '#f2e2b0', '#ffffff'),
  prism: ramp('#1f6474', '#2c8692', '#4aaeb0', '#b8788e', '#fff4c0'),
  squid: ramp('#18204a', '#2c8692', '#4aaeb0', '#cceaf8', '#ffffff'),
  gloom: ramp('#0c0a12', '#1c1424', '#2c2450', '#463c78', '#4aaeb0'),
  amber: ramp('#472819', '#a83a10', '#ffa93a', '#ffd86a', '#fff4c0'),
  sting: ramp('#2a1810', '#472819', '#ffa93a', '#ffd86a', '#fff4c0'),
  cinder: ramp('#1c1424', '#6c1e14', '#a83a10', '#e8701c', '#ffd86a'),
  obsid: ramp('#0c0a12', '#1c1424', '#2c2450', '#463c78', '#b8788e'),
  whisker: ramp('#16301e', '#3f7468', '#6a9c88', '#d8ba76', '#f2e2b0'),
  wood: ramp('#2a1810', '#623924', '#966139', '#c99660', '#d8ba76'),
  iron: ramp('#1c1424', '#423f54', '#858aa0', '#b4b9c8', '#ffffff'),
  gold: ramp('#472819', '#a83a10', '#ffa93a', '#ffd86a', '#fff4c0'),
  ember: ramp('#0c0a12', '#2c2450', '#a83a10', '#e8701c', '#ffd86a'),
};
const LINE: RGB = ramp('#cceaf8')[0];
const RED: RGB = ramp('#a83a10')[0];
const WHITE: RGB = ramp('#ffffff')[0];

/** 描邊：透明格旁邊有不透明格 → INK */
function outline(b: Bmp, c: RGB = INK): Bmp {
  const o = new Bmp(b.w, b.h);
  for (let y = 0; y < b.h; y++) for (let x = 0; x < b.w; x++) {
    if (b.on(x, y)) { o.setRaw(x, y, b.raw(x, y)); continue; }
    if (b.on(x - 1, y) || b.on(x + 1, y) || b.on(x, y - 1) || b.on(x, y + 1)) o.set(x, y, c);
  }
  return o;
}

interface FishLook {
  pal: Ramp;
  /** 身長（不含尾）、身高（半徑） */
  len?: number; hr?: number;
  pattern?: 'none' | 'stripes' | 'spots' | 'bands' | 'zig';
  tail?: 'fork' | 'round' | 'fan';
  fin?: RGB;
  belly?: RGB;
  whiskers?: boolean;
  /** 傳說：金色描邊 */
  crown?: boolean;
}
/** 參數化的魚：橢圓身（頭在右）、尾、背鰭、眼、花紋；最後描邊 */
function fishBody(L: FishLook, seed: number): Bmp {
  const b = new Bmp(S, S), p = L.pal;
  const len = L.len ?? 10, hr = L.hr ?? 3.2;
  const cx = 8.5, cy = 8, x0 = cx - len / 2, x1 = cx + len / 2;
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const u = (x + 0.5 - cx) / (len / 2), v = (y + 0.5 - cy) / hr;
    // 頭端（右）圓、尾端（左）收窄
    const taper = u < 0 ? 1 + u * 0.45 : 1;
    if (u * u + (v / taper) * (v / taper) > 1) continue;
    let c = v < -0.35 ? p[1] : v < 0.25 ? p[2] : p[3];
    if (v > 0.55) c = L.belly ?? p[3];
    if (v < -0.7) c = p[0];
    if (L.pattern === 'stripes' && Math.abs(v) < 0.35 && ((x + 1) & 1) === 0 && u < 0.6) c = p[3];
    if (L.pattern === 'bands' && ((x + seed) % 4) === 0 && u < 0.6) c = p[0];
    if (L.pattern === 'spots' && h01(x, y, seed) > 0.78 && v < 0.4) c = p[4];
    if (L.pattern === 'zig' && Math.abs(v + Math.sin(x * 1.3) * 0.3) < 0.18) c = p[4];
    b.set(x, y, c);
  }
  // 亮點（左上受光）
  b.set(Math.round(cx + len * 0.15), Math.round(cy - hr * 0.55), p[4]);
  // 尾
  const tx = Math.floor(x0) - 1, tail = L.tail ?? 'fork', fin = L.fin ?? p[1];
  for (let k = 0; k < 3; k++) {
    const sp = tail === 'round' ? 1 + k * 0.5 : tail === 'fan' ? 1.5 + k : 1 + k;
    for (let dy = -Math.round(sp); dy <= Math.round(sp); dy++) {
      if (tail === 'fork' && k === 2 && Math.abs(dy) < 2) continue;
      b.set(tx - k, Math.round(cy - 0.5) + dy, k === 0 ? p[2] : fin);
    }
  }
  // 背鰭 / 腹鰭
  for (let k = 0; k < 3; k++) b.set(Math.round(cx - 1 + k), Math.round(cy - hr) - 1 + (k === 2 ? 1 : 0), fin);
  b.set(Math.round(cx), Math.round(cy + hr), fin);
  // 眼
  const ex = Math.round(x1 - 2), ey = Math.round(cy - 1);
  b.set(ex, ey, WHITE); b.set(ex, ey + 1 > cy + hr - 1 ? ey : ey, WHITE);
  b.set(ex + 1 > x1 ? ex : ex, ey, INK);
  b.set(ex, ey, INK); b.set(ex - 1, ey, WHITE);
  // 嘴
  b.set(Math.round(x1), Math.round(cy + 1), p[0]);
  if (L.whiskers) { b.set(Math.round(x1) + 1, Math.round(cy + 2), p[3]); b.set(Math.round(x1) + 2, Math.round(cy + 3), p[3]); b.set(Math.round(x1), Math.round(cy + 3), p[3]); }
  const o = outline(b, L.crown ? ramp('#a83a10')[0] : INK);
  if (L.crown) { for (const [x, y] of [[8, 3], [10, 2], [12, 3], [9, 3], [11, 3]] as const) o.set(x, y, R.gold[3]); o.set(10, 1, R.gold[4]); }
  return o;
}

function eel(p: Ramp, seed: number, spark = false): Bmp {
  const b = new Bmp(S, S);
  for (let x = 1; x < 15; x++) {
    const yc = 8 + Math.round(Math.sin(x * 0.7 + seed) * 2.2), th = x > 12 ? 1 : 2;
    for (let k = 0; k < th; k++) b.set(x, yc + k, k === 0 ? p[2] : p[1]);
    if (x % 3 === 0) b.set(x, yc, p[3]);
    if (spark && x % 4 === 1) b.set(x, yc + 1, p[4]);
  }
  const hx = 14, hy = 8 + Math.round(Math.sin(14 * 0.7 + seed) * 2.2);
  b.set(hx, hy, p[3]); b.set(hx + 1, hy, p[2]); b.set(hx, hy - 1, WHITE);
  const o = outline(b);
  o.set(hx, hy - 1, INK);
  return o;
}
function shrimp(p: Ramp): Bmp {
  const b = new Bmp(S, S);
  // 彎曲的身體：一串由大到小的圓節
  const segs: [number, number, number][] = [[11, 6, 2.4], [9, 8, 2.3], [7, 10, 2], [5, 11, 1.7], [3, 10.5, 1.3]];
  for (const [sx, sy, r] of segs) b.disc(sx, sy, r, r, p[2]);
  for (const [sx, sy] of segs) b.set(Math.round(sx), Math.round(sy) - 1, p[4]);
  for (let k = 0; k < 3; k++) b.set(2 - k, 11 + k, p[1]);
  b.set(2, 9, p[1]);
  // 觸鬚
  for (let k = 0; k < 4; k++) { b.set(12 + k, 4 - k, p[3]); b.set(13 + k > 15 ? 15 : 13 + k, 5 - Math.floor(k / 2), p[4]); }
  const o = outline(b);
  o.set(12, 5, INK);
  return o;
}
function squid(p: Ramp): Bmp {
  const b = new Bmp(S, S);
  b.disc(8, 5.5, 3.6, 4.2, p[2]);
  for (let y = 2; y < 6; y++) b.set(6, y, p[3]);
  for (let k = 0; k < 4; k++) for (let y = 9; y < 14 + (k & 1); y++) b.set(5 + k * 2, y, y > 12 ? p[1] : p[2]);
  b.set(8, 4, p[4]); b.set(7, 7, WHITE); b.set(10, 7, WHITE);
  const o = outline(b);
  o.set(7, 7, INK); o.set(10, 7, INK);
  o.set(8, 2, p[4]); // 提燈
  return o;
}
function ray(p: Ramp): Bmp {
  const b = new Bmp(S, S);
  for (let y = 3; y < 13; y++) {
    const half = 6.5 - Math.abs(y - 7.5) * 1.1;
    for (let x = Math.round(8 - half); x <= Math.round(8 + half); x++) b.set(x, y, y < 6 ? p[1] : y < 9 ? p[2] : p[1]);
  }
  // 雷紋
  for (const [x, y] of [[6, 5], [7, 6], [6, 7], [7, 8], [9, 5], [10, 6], [9, 7], [10, 8]] as const) b.set(x, y, p[3]);
  for (let k = 0; k < 4; k++) b.set(8, 13 + k > 15 ? 15 : 13 + k, p[2]);
  b.set(8, 15, p[4]);
  return outline(b);
}
function angler(p: Ramp): Bmp {
  const b = fishBody({ pal: p, len: 10, hr: 4, tail: 'round', pattern: 'spots', belly: p[2] }, 9);
  // 頭上的發光誘餌
  b.set(12, 2, p[2]); b.set(13, 1, p[2]); b.set(14, 1, p[4]); b.set(14, 2, p[4]);
  // 牙
  b.set(13, 9, WHITE); b.set(12, 10, WHITE);
  return b;
}
function boot(): Bmp {
  const b = new Bmp(S, S), p = R.mud;
  for (let y = 2; y < 11; y++) for (let x = 4; x < 9; x++) b.set(x, y, x === 4 ? p[3] : y < 4 ? p[1] : p[2]);
  for (let y = 10; y < 14; y++) for (let x = 4; x < 13; x++) b.set(x, y, y === 13 ? p[0] : x > 10 ? p[1] : p[2]);
  b.set(12, 11, p[3]);
  // 水滴 + 破洞
  b.set(6, 6, p[0]); b.set(9, 12, p[0]);
  b.set(13, 14, R.frost[3]); b.set(2, 8, R.frost[3]); b.set(2, 9, R.frost[2]);
  // 一條水草
  b.set(7, 1, R.olive[2]); b.set(8, 0, R.olive[3]);
  return outline(b);
}
function crate(p: Ramp, trim: Ramp): Bmp {
  const b = new Bmp(S, S);
  for (let y = 3; y < 14; y++) for (let x = 2; x < 14; x++) {
    let c = (y - 3) % 4 === 0 ? p[1] : p[2];
    if (x === 2 || y === 3) c = p[3];
    if (x === 13 || y === 13) c = p[0];
    b.set(x, y, c);
  }
  // 斜撐
  for (let k = 0; k < 10; k++) b.set(3 + k, 12 - Math.round(k * 0.9), p[3]);
  // 金屬包角 + 鎖扣
  for (const [x, y] of [[2, 3], [13, 3], [2, 13], [13, 13], [3, 3], [2, 4], [12, 3], [13, 4]] as const) b.set(x, y, trim[3]);
  b.set(7, 8, trim[3]); b.set(8, 8, trim[2]); b.set(7, 9, trim[2]); b.set(8, 9, trim[1]);
  return outline(b);
}
function rod(shaft: Ramp, tip: RGB): Bmp {
  const b = new Bmp(S, S);
  // 竿身：左下 → 右上
  for (let k = 0; k < 13; k++) {
    const x = 2 + k, y = 13 - k;
    b.set(x, y, k < 4 ? shaft[1] : shaft[2]);
    if (k < 9) b.set(x, y + 1, shaft[0]);
  }
  b.set(14, 1, tip); b.set(15, 0, tip);
  // 捲線器
  b.disc(5, 12, 1.6, 1.6, R.iron[2]); b.set(5, 12, R.iron[4]); b.set(6, 13, R.iron[1]);
  // 握把
  b.set(2, 14, shaft[3]); b.set(1, 15, shaft[3]);
  // 釣線 + 小浮標
  for (let y = 2; y < 10; y++) b.set(15, y, LINE);
  b.set(15, 10, RED); b.set(15, 11, WHITE);
  return b;
}
function worm(): Bmp {
  const b = new Bmp(S, S), p = ramp('#6c1e14', '#a83a10', '#b8788e', '#f2b888');
  for (let k = 0; k < 11; k++) {
    const x = 3 + k, y = 9 + Math.round(Math.sin(k * 0.8) * 2);
    b.set(x, y, k % 3 === 0 ? p[1] : p[2]); b.set(x, y - 1, p[3]);
  }
  return outline(b);
}
function grub(): Bmp {
  const b = new Bmp(S, S), p = R.pale;
  for (let k = 0; k < 4; k++) b.disc(5 + k * 2, 9 - (k === 3 ? 1 : 0), 2.3, 2.3, k === 3 ? p[3] : p[2]);
  for (let k = 0; k < 4; k++) b.set(5 + k * 2, 7, p[4]);
  b.set(12, 8, R.mud[1]);
  return outline(b);
}
function bug(body: Ramp, wing: RGB, glow: RGB | null): Bmp {
  const b = new Bmp(S, S);
  b.disc(8, 9, 3.2, 2.2, body[2]);
  b.disc(11.5, 8.5, 1.5, 1.5, body[1]);
  for (let x = 6; x < 10; x++) b.set(x, 8, body[3]);
  // 翅
  b.set(7, 5, wing); b.set(8, 5, wing); b.set(9, 6, wing); b.set(6, 6, wing);
  // 腳
  for (const x of [6, 8, 10]) b.set(x, 12, body[0]);
  if (glow) { b.set(4, 9, glow); b.set(5, 10, glow); b.set(5, 9, glow); }
  const o = outline(b);
  o.set(13, 7, body[1]); o.set(14, 6, body[1]);
  return o;
}
function grilled(p: Ramp): Bmp {
  const b = fishBody({ pal: p, len: 10, hr: 3 }, 3);
  // 烤痕
  for (const x of [6, 9]) for (let y = 6; y < 11; y++) if (b.on(x, y)) b.set(x, y, R.mud[0]);
  // 盤子
  for (let x = 2; x < 15; x++) b.set(x, 13, R.iron[3]);
  for (let x = 3; x < 14; x++) b.set(x, 14, R.iron[2]);
  return b;
}
function smoked(): Bmp {
  const b = eel(R.mud, 1);
  b.set(3, 3, R.iron[3]); b.set(4, 2, R.iron[2]); b.set(5, 3, R.iron[3]); // 煙
  return b;
}
function stew(): Bmp {
  const b = new Bmp(S, S);
  // 碗
  for (let y = 8; y < 14; y++) {
    const half = 6 - Math.max(0, y - 11) * 1.5;
    for (let x = Math.round(8 - half); x <= Math.round(8 + half); x++) b.set(x, y, y === 8 ? R.salmon[3] : x < 6 ? R.wood[3] : R.wood[2]);
  }
  for (let x = 3; x < 13; x++) b.set(x, 8, x % 3 ? R.salmon[3] : R.olive[3]);
  b.set(6, 7, R.sun[3]); b.set(10, 7, R.salmon[2]);
  // 熱氣
  for (const [x, y] of [[6, 4], [7, 3], [9, 5], [10, 4], [8, 2]] as const) b.set(x, y, R.mist[3]);
  return outline(b);
}
/** 營火（圖示與 tile 共用）：交叉的木柴 + 石圈 + 火焰（frame 0..2 給 tile 動畫用） */
export function campfireBmp(frame = 0): Bmp {
  const b = new Bmp(S, S);
  for (let k = 0; k < 10; k++) { b.set(3 + k, 14 - Math.floor(k / 3), R.wood[2]); b.set(12 - k, 14 - Math.floor(k / 3), R.wood[1]); }
  for (const x of [2, 4, 11, 13]) { b.set(x, 15, R.iron[2]); b.set(x + 1, 15, R.iron[1]); }
  const fl = [[8, 4], [7, 6], [9, 6], [6, 8], [10, 8], [8, 7]] as const;
  const sway = [0, 1, -1][frame % 3];
  for (let y = 3 + (frame & 1); y < 13; y++) {
    const half = Math.max(0, 3.5 - Math.abs(y - 10) * 0.55) * (y < 8 ? 0.6 : 1);
    for (let x = Math.round(8 - half + (y < 8 ? sway : 0)); x <= Math.round(8 + half + (y < 8 ? sway : 0)); x++) {
      b.set(x, y, y > 10 ? R.sun[1] : y > 8 ? R.sun[2] : Math.abs(x - 8) < 1 ? R.sun[4] : R.sun[3]);
    }
  }
  void fl;
  b.set(8, 11, R.sun[4]); b.set(8, 10, R.sun[4]);
  return outline(b);
}

const LOOK: Partial<Record<ItemId, FishLook>> = {
  silver_minnow: { pal: R.silver, len: 8, hr: 2.2, tail: 'fork' },
  reed_perch: { pal: R.olive, len: 10, hr: 3.4, pattern: 'bands', fin: R.sun[2] },
  brook_trout: { pal: R.trout, len: 11, hr: 3, pattern: 'spots', belly: R.salmon[3] },
  mud_whisker: { pal: R.mud, len: 11, hr: 3.3, tail: 'round', whiskers: true },
  sun_bream: { pal: R.sun, len: 9, hr: 4, tail: 'fan', pattern: 'stripes' },
  frost_char: { pal: R.frost, len: 11, hr: 3, pattern: 'spots', belly: R.mist[4] },
  oasis_koi: { pal: R.koi, len: 11, hr: 3.4, pattern: 'spots', tail: 'fan', fin: R.koi[3] },
  thunder_ray: undefined,
  mistfin: { pal: R.mist, len: 10, hr: 3, tail: 'fan', fin: R.mist[3] },
  ember_salmon: { pal: R.salmon, len: 12, hr: 3.2, pattern: 'zig', belly: R.salmon[3] },
  petal_koi: { pal: R.petal, len: 11, hr: 3.4, pattern: 'spots', tail: 'fan', fin: R.petal[3] },
  pale_blindfish: { pal: R.pale, len: 10, hr: 2.8, tail: 'round' },
  amber_carp: { pal: R.amber, len: 11, hr: 3.6, pattern: 'stripes', tail: 'round' },
  stingfin: { pal: R.sting, len: 10, hr: 3.2, pattern: 'bands', fin: R.sting[0] },
  cinder_snapper: { pal: R.cinder, len: 11, hr: 3.6, pattern: 'zig', fin: R.cinder[1] },
  old_whiskers: { pal: R.whisker, len: 12, hr: 3.8, tail: 'round', whiskers: true, pattern: 'spots', crown: true },
};

/** 釣魚相關道具的圖示（不是 → null） */
export function fishingIcon(item: ItemId): Bmp | null {
  const look = LOOK[item];
  if (look) return fishBody(look, item.length * 7);
  switch (item) {
    case 'moonlit_eel': return eel(R.eel, 0.5);
    case 'obsidian_eel': return eel(R.obsid, 2, true);
    case 'thunder_ray': return ray(R.storm);
    case 'prism_shrimp': return shrimp(R.prism);
    case 'lantern_squid': return squid(R.squid);
    case 'gloom_angler': return angler(R.gloom);
    case 'soggy_boot': return boot();
    case 'wooden_crate': return crate(R.wood, R.mud);
    case 'iron_crate': return crate(R.mud, R.iron);
    case 'golden_crate': return crate(R.wood, R.gold);
    case 'wood_rod': return rod(R.wood, R.wood[4]);
    case 'iron_rod': return rod(R.iron, R.iron[4]);
    case 'gold_rod': return rod(R.gold, R.gold[4]);
    case 'cinder_rod': return rod(R.ember, R.ember[4]);
    case 'worm': return worm();
    case 'grub': return grub();
    case 'grasshopper': return bug(R.olive, R.olive[4], null);
    case 'firefly': return bug(R.mud, R.mist[3], R.gold[4]);
    case 'sunbeetle': return bug(R.gold, R.gold[4], null);
    case 'grilled_fish': return grilled(R.mud);
    case 'smoked_eel': return smoked();
    case 'fish_stew': return stew();
    case 'campfire': return campfireBmp(0);
    default: return null;
  }
}

/** 釣魚道具（圖示順序） */
export const FISHING_ICONS: readonly ItemId[] = [
  'wood_rod', 'iron_rod', 'gold_rod', 'cinder_rod', 'worm', 'grub', 'grasshopper', 'firefly', 'sunbeetle',
  'silver_minnow', 'reed_perch', 'brook_trout', 'mud_whisker', 'sun_bream', 'frost_char', 'oasis_koi', 'moonlit_eel', 'thunder_ray',
  'mistfin', 'ember_salmon', 'petal_koi', 'pale_blindfish', 'prism_shrimp', 'lantern_squid', 'gloom_angler', 'amber_carp', 'stingfin',
  'cinder_snapper', 'obsidian_eel', 'old_whiskers', 'soggy_boot', 'wooden_crate', 'iron_crate', 'golden_crate',
  'grilled_fish', 'smoked_eel', 'fish_stew', 'campfire',
];

/** 浮標（4×6）：紅白兩截 + 頂端天線 */
export function bobberBmp(): Bmp {
  const b = new Bmp(4, 7);
  b.set(1, 0, LINE); b.set(2, 0, LINE);
  for (let y = 1; y < 4; y++) for (let x = 0; x < 4; x++) b.set(x, y, y === 1 && (x === 0 || x === 3) ? INK : RED);
  for (let y = 4; y < 6; y++) for (let x = 0; x < 4; x++) b.set(x, y, WHITE);
  b.set(1, 2, WHITE);
  for (let x = 0; x < 4; x++) b.set(x, 6, INK);
  return b;
}
