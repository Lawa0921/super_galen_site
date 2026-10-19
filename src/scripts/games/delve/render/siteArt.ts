// siteArt.ts — NPC 聚落 / 地標的像素圖（純 Bmp，無 DOM）：
//   · 實心方塊：茅草屋頂（金黃斜草稈 + 每層下緣流蘇）、木骨灰泥牆（奶油色灰泥 + 深棕木骨交叉）、鑿石磚（深灰大塊 + 金色符文線）
//   · 背景牆：鑿刻石牆（暗色鑿石 + 直向符文柱浮雕，柱上暗金符文點）
//   · 裝飾：礦車軌道、滿載的礦車、委託板、旗桿（桿身 / 桿頂三角旗）、矮人熔爐、火盆、木桶
//   · 地標：旅人石堆（疊石 + 紅布旗）、遺落的行囊（背包 + 睡捲 + 小提燈）、守望石像（貓頭鷹形 + 青色眼光）、
//     巨晶之心（青 + 紫晶簇）、菇之圖騰（雕刻木柱 + 藍色發光菇傘）、蜂王蜜罐（琥珀蜜罐 + 蠟封 + 滴蜜）
//   · 道具圖示：軌道 / 火盆 / 木桶（方塊 / 牆圖示由 buildArt 的 blockIcon / wallIcon 處理）
//   全部色票色、不透明（透明 = 完全不畫）；光從左上，1px 描邊（INK）。buildArt.ts 的 default 分支會轉到這裡。
import { Bmp, INK, bayer, h01, ramp, type RGB } from './pixel';
import { T, W } from '../engine/tiles';
import type { ItemId } from '../engine/items';

const S = 16;
// ── 色階（[0] 最暗 → 亮） ──
const STRAW = ramp('#472819', '#7c4c2e', '#b07a4b', '#c99660', '#d8ba76', '#f2e2b0', '#fff4c0');
const PLASTER = ramp('#2a1810', '#472819', '#b07a4b', '#d8ba76', '#f2e2b0', '#fff4c0', '#ffffff');
const BEAM = ramp('#1c1424', '#2a1810', '#472819', '#623924', '#7c4c2e');
const DSTONE = ramp('#0c0a12', '#1c1424', '#2c2838', '#423f54', '#5e5e74', '#707490', '#858aa0');
const RUNE = ramp('#6c1e14', '#a83a10', '#e8701c', '#ffa93a', '#ffd86a', '#fff4c0');
const W_DWARF = ramp('#0c0a12', '#0c0a12', '#1c1424', '#2c2838', '#2c2838', '#423f54', '#5e5e74');
const WOOD = ramp('#2a1810', '#472819', '#623924', '#7c4c2e', '#966139', '#b07a4b', '#c99660');
const IRON = ramp('#1c1424', '#2c2838', '#423f54', '#5e5e74', '#858aa0', '#b4b9c8', '#ffffff');
const STONE = ramp('#1c1424', '#2c2838', '#423f54', '#5e5e74', '#707490', '#858aa0', '#b4b9c8');
const FIRE = ramp('#6c1e14', '#a83a10', '#e8701c', '#ffa93a', '#ffd86a', '#fff4c0', '#ffffff');
const CLOTH = ramp('#6c1e14', '#8c2038', '#c8344c', '#e890b0');
const GOLD = ramp('#472819', '#a83a10', '#e8701c', '#ffa93a', '#ffd86a', '#fff4c0');
const CREAM = ramp('#b07a4b', '#d8ba76', '#f2e2b0', '#fff4c0');
const LEAF = ramp('#16301e', '#214528', '#2d672e', '#468a34', '#67ab3c');
const TEAL = ramp('#18204a', '#1f6474', '#2c8692', '#4aaeb0', '#cceaf8', '#ffffff');
const ICE = ramp('#18204a', '#2c4486', '#3e74c4', '#5c9ce0', '#94c8ee', '#cceaf8', '#ffffff');
const VIOLET = ramp('#2c2450', '#463c78', '#7a5a8c', '#9a6ee0', '#c4a0f0');
const AMBER = ramp('#2a1810', '#6c1e14', '#a83a10', '#e8701c', '#ffa93a', '#ffd86a', '#fff4c0');
const MOSS = ramp('#214528', '#468a34');

function outline(b: Bmp): Bmp { return b.outline(INK); }

// ── 實心方塊材質 ─────────────────────────────────────────
/** 茅草：每層 5px，草稈往左下斜；每層下緣一排流蘇（交錯的暗 / 亮點） */
function thatch(v: number): Bmp {
  const b = new Bmp(S, S), p = STRAW, seed = 4101 + v * 13;
  for (let y = 0; y < S; y++) {
    const layer = Math.floor((y + v) / 5), ly = (y + v) % 5;
    for (let x = 0; x < S; x++) {
      const strand = Math.floor((x + ly + layer * 3) / 2);
      const n = h01(strand, layer, seed);
      let c = n > 0.66 ? p[5] : n > 0.25 ? p[4] : p[3];
      if (ly === 0 && (x + layer) % 3 === 0) c = p[6];
      if (ly === 3) c = (x + layer) % 2 === 0 ? p[3] : p[2];
      if (ly === 4) c = (x + layer) % 2 === 0 ? p[2] : p[1];
      b.set(x, y, c);
    }
  }
  return b;
}
/** 木骨灰泥：灰泥面 + 上 / 左木骨（相鄰 tile 接成方格），變體 0 / 1 有斜撐（方向相反），2 沒有 */
function timber(v: number): Bmp {
  const b = new Bmp(S, S), p = PLASTER, w = BEAM, seed = 4201 + v * 11;
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const n = h01(x >> 1, y >> 1, seed);
    b.set(x, y, n > 0.85 ? p[5] : n < 0.1 ? p[3] : p[4]);
  }
  const beam = (x: number, y: number): void => { b.set(x, y, w[3]); };
  for (let k = 0; k < S; k++) {
    b.set(k, 0, w[4]); b.set(k, 1, w[2]); // 橫木（上緣受光）
    b.set(0, k, w[4]); b.set(1, k, w[2]); // 直木
  }
  if (v < 2) {
    for (let k = 2; k < S; k++) {
      const x = v === 0 ? k : S + 1 - k, y = S + 1 - k;
      if (y < 2 || y > 15 || x < 2 || x > 15) continue;
      beam(x, y);
      if (x + (v === 0 ? 1 : -1) >= 2 && x + (v === 0 ? 1 : -1) <= 15) b.set(x + (v === 0 ? 1 : -1), y, w[2]);
    }
  }
  b.set(1, 1, w[1]); // 榫頭
  return b;
}
/** 鑿石磚：16×8 大塊、上下兩列錯開半塊；斜切邊（左上亮、右下暗）+ 金色符文線（變體 0 符文、1 細金縫、2 無） */
function dwarfBrick(v: number): Bmp {
  const b = new Bmp(S, S), p = DSTONE, seed = 4301 + v * 7;
  for (let y = 0; y < S; y++) {
    const row = y >> 3, by = y & 7;
    for (let x = 0; x < S; x++) {
      const xx = (x + (row & 1) * 8 + v * 4) % S;
      const n = h01(x, y, seed);
      let c = n > 0.8 ? p[5] : n < 0.15 ? p[3] : p[4];
      if (by === 7 || xx === 15) c = p[1];
      else if (by === 0 || xx === 0) c = p[6];
      else if (by === 6 || xx === 14) c = p[2];
      // 鑿痕：斜向的細點
      else if ((x * 3 + y * 5 + v) % 13 === 0) c = p[3];
      b.set(x, y, c);
    }
  }
  if (v === 0) {
    // 符文：小小的「菱 + 豎」刻紋
    const g = RUNE;
    for (const [x, y, k] of [[7, 2, 4], [6, 3, 3], [8, 3, 3], [7, 4, 4], [7, 5, 2], [11, 11, 4], [11, 12, 3], [12, 12, 3], [11, 13, 2]] as const) b.set(x, y, g[k]);
  } else if (v === 1) {
    for (let x = 3; x < 13; x++) b.set(x, 11, (x & 1) ? RUNE[3] : RUNE[2]);
  }
  return b;
}

export function siteTileBmp(id: number, v: number): Bmp | null {
  switch (id) {
    case T.THATCH: return thatch(v);
    case T.TIMBER: return timber(v);
    case T.DWARF_BRICK: return dwarfBrick(v);
    default: return null;
  }
}
/** 新方塊的外框色階（frameTile 用：[0] 外框、[1] 受光外框、[6] 受光高光） */
export const SITE_TILE_PAL: Record<number, RGB[]> = {
  [T.THATCH]: STRAW, [T.TIMBER]: ramp('#1c1424', '#2a1810', '#472819', '#623924', '#d8ba76', '#f2e2b0', '#fff4c0'), [T.DWARF_BRICK]: DSTONE,
};

// ── 背景牆 ───────────────────────────────────────────────
/** 鑿刻石牆：8px 高的石層 + 中間一根直向浮雕柱（兩側陰影、每 4px 一道刻紋、柱上暗金符文點） */
function dwarfWall(v: number): Bmp {
  const b = new Bmp(S, S), p = W_DWARF, seed = 4401 + v * 5;
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const n = h01(x >> 1, y, seed);
    let c = n > 0.8 ? p[4] : p[3];
    if ((y & 7) === 7) c = p[1];
    b.set(x, y, c);
  }
  // 浮雕柱（x 5..10）
  for (let y = 0; y < S; y++) {
    b.set(4, y, p[1]);
    b.set(5, y, p[6]);
    for (let x = 6; x <= 9; x++) b.set(x, y, p[5]);
    b.set(10, y, p[2]);
    b.set(11, y, p[1]);
    if ((y + v) % 4 === 0) for (let x = 6; x <= 9; x++) b.set(x, y, p[3]);
  }
  // 符文點（暗金；變體換位置）
  const ry = 2 + v * 4;
  b.set(7, ry, RUNE[1]); b.set(8, ry + 1, RUNE[2]); b.set(7, ry + 2, RUNE[1]);
  return b;
}
export function siteWallBmp(id: number, v: number): { b: Bmp; pal: RGB[] } | null {
  if (id === W.DWARF_WALL) return { b: dwarfWall(v), pal: W_DWARF };
  return null;
}

// ── 裝飾物件 ─────────────────────────────────────────────
/** 礦車軌道：tile 最下面兩列是枕木，上面一條側視鐵軌 */
function rail(): Bmp {
  const b = new Bmp(S, S), w = WOOD, m = IRON;
  for (let x = 0; x < S; x++) { b.set(x, 12, m[5]); b.set(x, 13, m[3]); }
  for (const x0 of [1, 6, 11]) for (let x = x0; x < x0 + 3; x++) { b.set(x, 14, w[4]); b.set(x, 15, w[2]); }
  for (const x of [2, 7, 12]) b.set(x, 13, m[1]); // 道釘
  return b; // 不描邊：左右要和隔壁的軌道接起來
}
/** 滿載的礦車（自帶一段軌道：和軌道同一列放在地上）：鐵皮車身 + 鉚釘 + 兩個輪子 + 冒出車頂的銅 / 銀 / 金礦 */
function oreCart(): Bmp {
  const b = new Bmp(S, S), m = IRON;
  // 礦石堆
  const ores: [number, number, RGB[]][] = [
    [3, 3, ramp('#6c1e14', '#a83a10', '#e8701c', '#ffa93a')], [6, 2, ramp('#5e5e74', '#858aa0', '#b4b9c8', '#ffffff')],
    [9, 3, ramp('#a83a10', '#ffa93a', '#ffd86a', '#fff4c0')], [12, 3, ramp('#6c1e14', '#a83a10', '#e8701c', '#ffa93a')],
    [7, 4, ramp('#a83a10', '#ffa93a', '#ffd86a', '#fff4c0')],
  ];
  for (const [cx, cy, r] of ores) {
    for (let y = cy - 1; y <= cy + 1; y++) for (let x = cx - 1; x <= cx + 1; x++) {
      if (Math.abs(x - cx) + Math.abs(y - cy) > 1 && y < cy) continue;
      b.set(x, y, x < cx || y < cy ? r[2] : r[1]);
    }
    b.set(cx - 1, cy - 1, r[3]);
  }
  // 車身（梯形：上寬下窄）
  for (let y = 5; y <= 11; y++) {
    const inset = y > 9 ? 1 : 0;
    for (let x = 1 + inset; x <= 14 - inset; x++) b.set(x, y, y === 5 ? m[5] : x === 1 + inset ? m[4] : x === 14 - inset ? m[1] : y === 8 ? m[2] : m[3]);
  }
  for (const x of [3, 7, 11]) b.set(x, 7, m[5]);
  for (const x of [4, 8, 12]) b.set(x, 10, m[1]);
  // 軌道
  for (let x = 0; x < S; x++) { b.set(x, 14, m[5]); b.set(x, 15, m[3]); }
  // 輪子
  for (const wx of [4, 11]) {
    for (let y = 11; y <= 14; y++) for (let x = wx - 1; x <= wx + 1; x++) b.set(x, y, m[1]);
    b.set(wx, 12, m[4]); b.set(wx - 1, 11, m[2]);
  }
  return outline(b);
}
/** 委託板：兩根柱子 + 小屋簷 + 木板，上面釘著奶油色紙條（紅圖釘） */
function questBoard(): Bmp {
  const b = new Bmp(S, S), w = WOOD;
  for (let y = 4; y < S; y++) { b.set(3, y, w[4]); b.set(4, y, w[2]); b.set(11, y, w[4]); b.set(12, y, w[2]); }
  // 屋簷
  for (let x = 0; x < S; x++) { b.set(x, 1, x < 4 ? w[6] : w[5]); b.set(x, 2, w[2]); }
  for (let x = 2; x < 14; x++) b.set(x, 0, w[4]);
  // 板子
  for (let y = 3; y <= 11; y++) for (let x = 1; x <= 14; x++) {
    const edge = x === 1 || x === 14 || y === 3 || y === 11;
    b.set(x, y, edge ? (x === 1 || y === 3 ? w[5] : w[1]) : (y & 1 ? w[3] : w[4]));
  }
  // 紙條 + 圖釘
  const notes: [number, number, number, number][] = [[3, 5, 4, 4], [8, 4, 4, 3], [9, 8, 4, 3]];
  for (const [x0, y0, nw, nh] of notes) {
    for (let y = y0; y < y0 + nh; y++) for (let x = x0; x < x0 + nw; x++) b.set(x, y, y === y0 ? CREAM[3] : x === x0 + nw - 1 ? CREAM[1] : CREAM[2]);
    for (let x = x0 + 1; x < x0 + nw - 1; x++) if (nh > 2) b.set(x, y0 + 2, CREAM[0]);
    b.set(x0 + 1, y0, CLOTH[2]);
  }
  return outline(b);
}
/** 旗桿：style 0 = 桿身、1 = 桿頂（金色桿頭 + 往右飄的紅金三角旗） */
function flagpole(style: number): Bmp {
  const b = new Bmp(S, S), w = WOOD;
  const top = style === 1 ? 2 : 0;
  for (let y = top; y < S; y++) { b.set(7, y, w[6]); b.set(8, y, w[3]); }
  if (style === 1) {
    b.set(7, 0, GOLD[5]); b.set(8, 0, GOLD[4]); b.set(7, 1, GOLD[4]); b.set(8, 1, GOLD[2]);
    // 三角旗：x 9..15，下緣波浪
    for (let x = 9; x <= 15; x++) {
      const k = x - 9, h = Math.max(1, 7 - k), wave = (k & 2) ? 1 : 0;
      for (let y = 2 + wave; y < 2 + wave + h; y++) {
        const c = y === 2 + wave + Math.floor(h / 2) && h > 2 ? GOLD[4] : y === 2 + wave ? CLOTH[3] : CLOTH[2];
        b.set(x, y, k > 4 && y > 3 + wave ? CLOTH[1] : c);
      }
    }
  }
  return outline(b);
}
/** 矮人熔爐：石砌爐身 + 煙囪 + 大片發光爐口（flick 換火形） */
function dwarfForge(flick: number): Bmp {
  const b = new Bmp(S, S), s = STONE, f = FIRE;
  for (let y = 0; y < 4; y++) for (let x = 5; x <= 10; x++) b.set(x, y, x === 5 ? s[5] : x === 10 ? s[2] : s[3]);
  for (let y = 3; y < S; y++) for (let x = 1; x <= 14; x++) {
    const row = Math.floor((y - 3) / 3), by = (y - 3) % 3, xx = (x + (row & 1) * 2) % 5;
    b.set(x, y, by === 2 || xx === 4 ? s[1] : x < 3 ? s[5] : x > 12 ? s[2] : s[4]);
  }
  for (let x = 1; x <= 14; x++) b.set(x, 3, s[6]);
  // 爐口（拱形）
  for (let y = 7; y <= 14; y++) for (let x = 4; x <= 11; x++) {
    const dx = x + 0.5 - 8, top = 7 + (Math.abs(dx) > 2.5 ? 1 : 0);
    if (y < top) continue;
    const core = Math.abs(dx) < 2 && y > 10;
    b.set(x, y, core ? f[6] : Math.abs(dx) < 3 && y > 8 ? f[5] : y > 12 ? f[4] : f[3]);
  }
  // 火舌（從爐口上緣竄出）
  for (let k = 0; k < 3; k++) {
    const x = 5 + k * 3 + ((flick + k) % 2), h = 1 + ((flick + k * 2) % 3);
    for (let y = 7 - h; y < 7; y++) b.set(x, y, y === 7 - h ? f[3] : f[4]);
  }
  for (let x = 3; x <= 12; x++) b.set(x, 15, s[1]);
  return outline(b);
}
/** 火盆：三腳鐵架 + 淺鐵盆 + 火焰（flick 換火形） */
function brazier(flick: number): Bmp {
  const b = new Bmp(S, S), m = IRON, f = FIRE;
  for (let y = 11; y < S; y++) { b.set(4 - (y > 13 ? 1 : 0), y, m[3]); b.set(11 + (y > 13 ? 1 : 0), y, m[2]); b.set(8, y, m[3]); }
  for (let x = 3; x <= 12; x++) { b.set(x, 9, m[5]); b.set(x, 10, x < 5 ? m[4] : m[2]); }
  for (let x = 4; x <= 11; x++) b.set(x, 11, m[1]);
  for (let i = 0; i < 8; i++) {
    const y = 8 - i, w0 = Math.max(0, Math.round((8 - i) / 2.2));
    const sway = ((i + flick) % 4 === 0 ? 1 : 0) - ((i + flick) % 3 === 0 ? 1 : 0);
    for (let dx = -w0; dx <= w0; dx++) b.set(8 + dx + sway, y, i > 5 ? f[2] : Math.abs(dx) < w0 - 1 ? f[5] : Math.abs(dx) < w0 ? f[4] : f[3]);
  }
  b.set(8, 7, f[6]);
  return outline(b);
}
/** 木桶：鼓肚木板 + 上 / 下兩道鐵箍 + 桶蓋 */
function barrel(): Bmp {
  const b = new Bmp(S, S), w = WOOD, m = IRON;
  for (let y = 2; y < S; y++) {
    const bulge = y > 4 && y < 13 ? 1 : 0;
    const x0 = 3 - bulge, x1 = 12 + bulge;
    for (let x = x0; x <= x1; x++) {
      const stave = (x - x0) % 3 === 2;
      let c = x <= x0 + 1 ? w[5] : x >= x1 - 1 ? w[2] : stave ? w[3] : w[4];
      if (y === 4 || y === 12) c = x <= x0 + 1 ? m[5] : m[3];
      if (y === 2) c = w[2];
      b.set(x, y, c);
    }
  }
  for (let x = 4; x <= 11; x++) b.set(x, 3, w[1]);
  b.set(6, 2, w[4]);
  return outline(b);
}

// ── 地標 ─────────────────────────────────────────────────
/** 旅人石堆：三層疊石 + 插在頂上的細木棍與紅布旗（遠看是剪影） */
function cairn(): Bmp {
  const b = new Bmp(S, S), s = STONE;
  const stone = (cx: number, cy: number, rx: number, ry: number, k: number): void => {
    for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
      const dx = (x + 0.5 - cx) / rx, dy = (y + 0.5 - cy) / ry;
      if (dx * dx + dy * dy > 1) continue;
      b.set(x, y, dx + dy < -0.7 ? s[k + 2] : dx + dy > 0.6 ? s[k - 1] : s[k]);
    }
  };
  stone(8, 13.5, 6.5, 2.5, 3);
  stone(7.5, 9.5, 4.5, 2, 4);
  stone(8, 6.3, 3, 1.6, 3);
  // 苔蘚
  b.set(4, 12, MOSS[1]); b.set(5, 12, MOSS[0]); b.set(10, 9, MOSS[1]);
  // 木棍 + 布旗
  for (let y = 0; y < 6; y++) b.set(10, y, WOOD[4]);
  for (let y = 0; y < 3; y++) for (let x = 11; x <= 14 - y; x++) b.set(x, y + 1, y === 0 ? CLOTH[3] : CLOTH[2]);
  b.set(13, 3, CLOTH[1]);
  return outline(b);
}
/** 遺落的行囊：皮背包（蓋子 + 扣環）+ 頂上的綠色睡捲 + 右邊一盞亮著的小提燈 */
function relicPack(): Bmp {
  const b = new Bmp(S, S), l = WOOD;
  for (let y = 6; y < S; y++) for (let x = 2; x <= 9; x++) b.set(x, y, x === 2 ? l[5] : x === 9 ? l[2] : y > 13 ? l[2] : l[4]);
  for (let y = 6; y <= 9; y++) for (let x = 2; x <= 9; x++) b.set(x, y, y === 6 ? l[6] : y === 9 ? l[1] : l[5]);
  b.set(5, 9, GOLD[4]); b.set(6, 9, GOLD[3]); b.set(5, 10, GOLD[2]);
  for (let y = 11; y <= 14; y++) b.set(3, y, l[1]);
  // 睡捲
  for (let y = 3; y <= 5; y++) for (let x = 1; x <= 10; x++) b.set(x, y, y === 3 ? LEAF[4] : y === 5 ? LEAF[1] : LEAF[3]);
  b.set(3, 4, l[2]); b.set(8, 4, l[2]);
  // 提燈
  b.set(13, 7, IRON[3]); b.set(12, 8, IRON[3]); b.set(14, 8, IRON[3]);
  for (let y = 9; y <= 14; y++) for (let x = 11; x <= 15; x++) {
    const frame = x === 11 || x === 15 || y === 9 || y === 14;
    b.set(x, y, frame ? IRON[2] : y < 11 ? FIRE[6] : FIRE[4]);
  }
  b.set(13, 12, FIRE[5]);
  b.set(10, 15, l[2]);
  return outline(b);
}
/** 守望石像：石磚底座上的貓頭鷹形石雕（耳羽、刻出的翅膀紋）+ 青色發光的眼、苔痕 */
function guardianStatue(): Bmp {
  const b = new Bmp(S, S), s = STONE;
  // 底座
  for (let y = 12; y < S; y++) for (let x = 2; x <= 13; x++) b.set(x, y, y === 12 ? s[6] : y === 15 ? s[1] : (x === 7 && y > 12) ? s[2] : x < 4 ? s[5] : s[4]);
  // 身體（橢圓）
  for (let y = 2; y <= 11; y++) for (let x = 3; x <= 12; x++) {
    const dx = (x + 0.5 - 8) / 5, dy = (y + 0.5 - 7) / 5.2;
    if (dx * dx + dy * dy > 1) continue;
    const d = bayer(x, y) < 0.3;
    b.set(x, y, dx + dy < -0.5 ? s[6] : dx > 0.45 ? s[2] : d ? s[3] : s[4]);
  }
  // 耳羽
  b.set(4, 1, s[5]); b.set(4, 2, s[5]); b.set(5, 2, s[4]); b.set(11, 1, s[3]); b.set(11, 2, s[3]); b.set(10, 2, s[3]);
  // 眼窩 + 發光的眼
  for (const ex of [5, 9]) {
    b.set(ex, 5, s[1]); b.set(ex + 1, 5, s[1]); b.set(ex, 6, TEAL[4]); b.set(ex + 1, 6, TEAL[3]);
    b.set(ex, 5, TEAL[5]);
  }
  b.set(7, 7, s[2]); b.set(8, 7, s[1]); b.set(7, 8, s[1]); // 喙
  // 翅膀紋
  for (let y = 8; y <= 10; y++) { b.set(4 + (y - 8), y, s[2]); b.set(11 - (y - 8), y, s[1]); }
  b.set(6, 10, MOSS[1]); b.set(3, 9, MOSS[0]); b.set(12, 13, MOSS[1]);
  return outline(b);
}
/** 巨晶之心：中間一根大晶柱（青）、左右兩根斜晶（紫 / 青），晶面亮邊 + 白色反光，底下一塊岩座 */
function geode(): Bmp {
  const b = new Bmp(S, S);
  const shard = (x0: number, x1: number, top: number, lean: number, r: RGB[]): void => {
    for (let y = top; y <= 13; y++) {
      const t = (y - top) / Math.max(1, 13 - top), off = Math.round((1 - t) * lean);
      const half = Math.max(0, Math.round(((x1 - x0) / 2) * Math.min(1, t * 1.6)));
      const cx = Math.round((x0 + x1) / 2) + off;
      for (let x = cx - half; x <= cx + half; x++) b.set(x, y, x === cx - half ? r[r.length - 2] : x === cx + half ? r[1] : x === cx ? r[r.length - 1] : r[r.length - 3]);
    }
  };
  shard(1, 6, 6, -2, VIOLET);
  shard(10, 15, 4, 2, VIOLET);
  shard(5, 11, 0, 0, ICE);
  b.set(7, 3, ICE[6]); b.set(7, 4, ICE[6]); b.set(13, 7, VIOLET[4]);
  for (let x = 1; x <= 14; x++) { b.set(x, 14, STONE[x < 4 ? 5 : 3]); b.set(x, 15, STONE[1]); }
  return outline(b);
}
/** 菇之圖騰：雕了兩張臉的木柱 + 頂上大大的藍色發光菇傘（白點）+ 腳邊兩朵小螢光菇 */
function sporeTotem(): Bmp {
  const b = new Bmp(S, S), w = WOOD, t = TEAL;
  for (let y = 6; y < S; y++) for (let x = 5; x <= 10; x++) b.set(x, y, x === 5 ? w[5] : x === 10 ? w[1] : (y % 5 === 0) ? w[2] : w[3]);
  for (const fy of [8, 12]) { b.set(6, fy, t[4]); b.set(9, fy, t[4]); b.set(7, fy + 2, w[1]); b.set(8, fy + 2, w[1]); }
  // 菇傘
  for (let y = 0; y <= 6; y++) for (let x = 0; x < S; x++) {
    const dx = (x + 0.5 - 8) / 7.6, dy = (y + 0.5 - 5.5) / 5.2;
    if (dx * dx + dy * dy > 1 || y > 5) continue;
    b.set(x, y, y === 5 ? t[1] : dx + dy < -0.6 ? t[4] : dx > 0.5 ? t[2] : t[3]);
  }
  for (const [x, y] of [[4, 2], [9, 1], [12, 3], [7, 3]] as const) b.set(x, y, t[5]);
  for (let x = 3; x <= 12; x++) if (x & 1) b.set(x, 6, t[1]); // 菌褶
  // 小螢光菇
  for (const mx of [2, 13]) { b.set(mx, 15, w[4]); b.set(mx, 14, w[4]); b.set(mx - 1, 13, t[3]); b.set(mx, 13, t[4]); b.set(mx + 1, 13, t[2]); }
  return outline(b);
}
/** 蜂王蜜罐：圓肚琥珀蜜罐 + 蠟封蓋 + 紅繩 + 沿罐身流下的蜜 */
function honeyJar(): Bmp {
  const b = new Bmp(S, S), a = AMBER;
  for (let y = 4; y < S; y++) for (let x = 2; x <= 13; x++) {
    const dx = (x + 0.5 - 8) / 6, dy = (y + 0.5 - 10.5) / 5.6;
    if (dx * dx + dy * dy > 1) continue;
    b.set(x, y, dx + dy < -0.8 ? a[6] : dx + dy < -0.3 ? a[5] : dx > 0.55 ? a[2] : bayer(x, y) < 0.25 ? a[3] : a[4]);
  }
  for (let y = 2; y <= 4; y++) for (let x = 4; x <= 11; x++) b.set(x, y, y === 2 ? CREAM[3] : x < 6 ? CREAM[2] : CREAM[1]);
  for (let x = 4; x <= 11; x++) b.set(x, 5, CLOTH[2]);
  b.set(12, 6, CLOTH[2]); b.set(13, 7, CLOTH[1]);
  // 滴蜜
  for (let y = 5; y <= 9; y++) b.set(5, y, a[5]);
  b.set(5, 10, a[6]); b.set(10, 6, a[5]); b.set(10, 7, a[5]);
  b.set(6, 9, a[6]); b.set(6, 10, a[6]); // 反光
  return outline(b);
}

/** 新裝飾 tile 的點陣（沒有 → null）；style = autotile.decorStyle 的欄 */
export function siteDecorBmp(id: number, style: number): Bmp | null {
  switch (id) {
    case T.RAIL: return rail();
    case T.ORE_CART: return oreCart();
    case T.QUEST_BOARD: return questBoard();
    case T.FLAGPOLE: return flagpole(style & 1);
    case T.DWARF_FORGE: return dwarfForge(style % 3);
    case T.BRAZIER: return brazier(style % 3);
    case T.BARREL: return barrel();
    case T.CAIRN: return cairn();
    case T.RELIC_PACK: return relicPack();
    case T.GUARDIAN_STATUE: return guardianStatue();
    case T.GEODE: return geode();
    case T.SPORE_TOTEM: return sporeTotem();
    case T.HONEY_JAR: return honeyJar();
    default: return null;
  }
}
/** 每種新裝飾在圖集裡的欄數 */
export const SITE_DECOR_STYLES: Record<number, number> = {
  [T.RAIL]: 1, [T.ORE_CART]: 1, [T.QUEST_BOARD]: 1, [T.FLAGPOLE]: 2, [T.DWARF_FORGE]: 3, [T.BRAZIER]: 3, [T.BARREL]: 1,
  [T.CAIRN]: 1, [T.RELIC_PACK]: 1, [T.GUARDIAN_STATUE]: 1, [T.GEODE]: 1, [T.SPORE_TOTEM]: 1, [T.HONEY_JAR]: 1,
};

// ── 道具圖示 ─────────────────────────────────────────────
/** 軌道圖示：斜放的一小段軌道（兩條鐵軌 + 三根枕木） */
function railIcon(): Bmp {
  const b = new Bmp(S, S), w = WOOD, m = IRON;
  for (const k of [3, 7, 11]) for (let i = 0; i < 4; i++) { b.set(k + i, 14 - k - i + 2, w[4]); b.set(k + i + 1, 14 - k - i + 2, w[2]); }
  for (let i = 0; i < 13; i++) { b.set(1 + i, 13 - i, m[5]); b.set(3 + i, 15 - i, m[3]); }
  return outline(b);
}
export function siteIcon(item: ItemId): Bmp | null {
  switch (item) {
    case 'rail': return railIcon();
    case 'brazier': return brazier(0);
    case 'barrel': return barrel();
    default: return null;
  }
}
/** siteIcon 畫得出來的道具（方塊 / 牆圖示另由 buildArt 畫：thatch / timber / dwarf_brick / dwarf_wall） */
export const SITE_ICONS: readonly ItemId[] = ['thatch', 'timber', 'dwarf_brick', 'dwarf_wall', 'rail', 'brazier', 'barrel'];
