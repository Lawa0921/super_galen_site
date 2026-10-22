// decorSeason.ts — 裝飾 tile 的圖集欄位美術（純資料 Bmp，無 DOM）：
//   · 季節植物（灌木、蕨、仙人掌、枯枝、藤蔓）× 春 / 夏 / 秋 / 冬：
//     春 = 新綠 + 花苞 / 嫩芽、夏 = 原圖、秋 = 橙紅黃褐、冬 = 枯色 + 積雪 / 結霜。
//   · 其他裝飾照舊（decorBmp）；蜘蛛網的欄位 = 角落 + 4 × 變體（decor.ts 的 cobweb 直接吃欄位）。
// 只用統一色票；積雪 / 結霜都是不透明像素（沒有半透明）。
import { T } from '../engine/tiles';
import { DECOR_STYLES } from './autotile';
import { PAL2, decorBmp } from './decor';
import { Bmp, h01, hex, ramp, type RGB } from './pixel';
import { SEASONAL_DECOR } from './decorPick';

const S = 16;
const SEASONAL = new Set(SEASONAL_DECOR);

// 色階（[0] = 描邊 → [6] 最亮），與原圖的 PAL2.leaf / jungleGrass 同長度，依索引換色
const SPRING = ramp('#16301e', '#2d672e', '#468a34', '#67ab3c', '#93cc50', '#c2e478', '#fff4c0');
const AUTUMN = [
  ramp('#2a1810', '#6c1e14', '#a83a10', '#e8701c', '#ffa93a', '#ffd86a', '#fff4c0'), // 橙
  ramp('#1c1424', '#2a1810', '#6c1e14', '#a83a10', '#e8701c', '#ffa93a', '#ffd86a'), // 紅
  ramp('#472819', '#7c4c2e', '#b07a4b', '#c99660', '#d8ba76', '#ffd86a', '#fff4c0'), // 黃
];
const WITHERED = ramp('#1c1424', '#2a1810', '#472819', '#623924', '#7c4c2e', '#966139', '#b07a4b');
const SNOW = hex('#ffffff'), SNOW2 = hex('#cceaf8'), SNOW3 = hex('#94c8ee');

const key = (c: RGB): number => (c[0] << 16) | (c[1] << 8) | c[2];
/** 依色階索引換色：from[i] → to[i]（不在 from 裡的顏色不動） */
function recolor(b: Bmp, from: readonly RGB[], to: readonly RGB[]): Bmp {
  const m = new Map<number, RGB>();
  from.forEach((c, i) => { if (!m.has(key(c))) m.set(key(c), to[Math.min(i, to.length - 1)]); });
  b.map((c) => m.get(key(c)) ?? c);
  return b;
}
/** 雪蓋：每個「上方透明」的不透明像素往下 depth 格換成雪（白 → 淡藍 → 陰影藍）；cover = 機率 */
function snowCap(b: Bmp, depth: number, seed: number, cover = 1): Bmp {
  const src = b.clone();
  // y = 0 的像素不算頂面（仙人掌中段這種往上接到另一格的圖）
  for (let x = 0; x < S; x++) for (let y = 1; y < S; y++) {
    if (!src.on(x, y) || src.on(x, y - 1)) continue;
    if (cover < 1 && h01(x >> 1, y, seed) > cover) continue;
    const d = depth + (h01(x, 3, seed) > 0.6 ? 1 : 0);
    for (let k = 0; k < d && src.on(x, y + k); k++) b.set(x, y + k, k === 0 ? SNOW : k === d - 1 ? SNOW3 : SNOW2);
  }
  return b;
}
/** 細枝上的積雪：上方透明的枝像素「上面」加一格雪（枝條本身不變） */
function snowOnTwigs(b: Bmp, seed: number, cover: number): Bmp {
  const src = b.clone();
  for (let x = 0; x < S; x++) for (let y = 1; y < S; y++) {
    if (!src.on(x, y) || src.on(x, y - 1) || h01(x, y, seed) > cover) continue;
    b.set(x, y - 1, h01(x, y, seed + 1) > 0.35 ? SNOW : SNOW2);
  }
  return b;
}
/** 尖端（4 鄰只有 ≤ 1 個不透明）結霜 */
function frostTips(b: Bmp, seed: number): Bmp {
  const src = b.clone();
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    if (!src.on(x, y)) continue;
    const n = (src.on(x - 1, y) ? 1 : 0) + (src.on(x + 1, y) ? 1 : 0) + (src.on(x, y - 1) ? 1 : 0) + (src.on(x, y + 1) ? 1 : 0);
    if (n <= 1 && h01(x, y, seed) > 0.2) b.set(x, y, h01(x, y, seed + 2) > 0.5 ? SNOW : SNOW2);
  }
  return b;
}
/** 在不透明且非描邊的像素上點一簇花 / 果（2–3 px） */
function dots(b: Bmp, pts: readonly [number, number][], c1: RGB, c2: RGB): Bmp {
  for (const [x, y] of pts) if (b.on(x, y)) { b.set(x, y, c1); if (b.on(x + 1, y)) b.set(x + 1, y, c2); if (b.on(x, y + 1)) b.set(x, y + 1, c2); }
  return b;
}

function bushSeason(style: number, season: number): Bmp {
  const b = decorBmp(T.BUSH, style);
  switch (season) {
    case 0: // 春：新綠 + 白 / 粉小花
      recolor(b, PAL2.leaf, SPRING);
      return dots(b, style === 1 ? [[5, 8], [10, 6], [12, 10]] : [[4, 10], [9, 6], [11, 11]], hex(style === 2 ? '#f2b888' : '#ffffff'), hex(style === 2 ? '#b8788e' : '#cceaf8'));
    case 2: return recolor(b, PAL2.leaf, AUTUMN[style % 3]);
    case 3: return snowCap(recolor(b, PAL2.leaf, WITHERED), 2, 1301 + style);
    default: return b;
  }
}
function fernSeason(style: number, season: number): Bmp {
  const J = PAL2.jungleGrass, b = decorBmp(T.FERN, style);
  switch (season) {
    case 0: { // 春：新綠 + 捲曲的嫩芽（尖端一格亮黃綠）
      recolor(b, J, SPRING);
      const src = b.clone();
      for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) if (src.on(x, y) && !src.on(x, y - 1) && !src.on(x - 1, y) && h01(x, y, 1311) > 0.4) b.set(x - 1, y, SPRING[5]);
      return b;
    }
    case 2: { // 秋：外側羽葉轉黃褐、靠根部還綠
      const out = new Bmp(S, S), yel = AUTUMN[2];
      for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
        const v = b.raw(x, y);
        if (!(v >>> 24)) continue;
        const c = Bmp.unpack(v), i = J.findIndex((q) => key(q) === key(c));
        const far = y < 11 || Math.abs(x - 8) > 3;
        out.set(x, y, i >= 0 && far ? (h01(x >> 1, y >> 1, 1313 + style) > 0.4 ? yel[i] : WITHERED[i]) : c);
      }
      return out;
    }
    case 3: return frostTips(snowOnTwigs(recolor(b, J, WITHERED), 1317 + style, 0.55), 1319 + style);
    default: return b;
  }
}
function cactusSeason(style: number, season: number): Bmp {
  const b = decorBmp(T.CACTUS, style);
  const top = style === 1 || style === 5; // TOP / SINGLE
  switch (season) {
    case 0: // 春：頂端開花（粉 / 黃），手臂尖也有花苞
      if (top) { b.set(6, 0, hex('#f2b888')); b.set(7, 0, hex('#b8788e')); b.set(8, 0, hex('#f2b888')); b.set(7, 1, hex('#ffd86a')); b.set(6, 1, hex('#b8788e')); }
      if (style === 2 || style === 5) { b.set(1, 2, hex('#ffd86a')); b.set(1, 3, hex('#ffa93a')); }
      if (style === 3) { b.set(14, 0, hex('#ffd86a')); b.set(14, 1, hex('#ffa93a')); }
      return b;
    case 2: // 秋：頂端紅色果實
      if (top) { b.set(6, 1, hex('#a83a10')); b.set(7, 1, hex('#e8701c')); b.set(9, 1, hex('#a83a10')); b.set(9, 0, hex('#e8701c')); }
      return b;
    case 3: // 冬：頂面一層薄雪 + 刺結霜
      snowCap(b, 1, 1323 + style);
      b.map((c) => (key(c) === key(hex('#f2e2b0')) ? SNOW2 : c));
      return b;
    default: return b;
  }
}
function deadBushSeason(style: number, season: number): Bmp {
  const w = PAL2.wood, b = decorBmp(T.DEAD_BUSH, style);
  switch (season) {
    case 0: { // 春：枝尖冒出嫩綠芽
      const src = b.clone();
      for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) if (src.on(x, y) && !src.on(x, y - 1) && y < 9 && h01(x, y, 1331 + style) > 0.45) { b.set(x, y - 1, SPRING[4]); b.set(x + 1, y - 1, SPRING[3]); }
      return b;
    }
    case 2: return recolor(b, w, ramp('#2a1810', '#472819', '#623924', '#966139', '#b07a4b', '#c99660', '#d8ba76')); // 秋：枯枝轉成淺黃褐
    case 3: return snowOnTwigs(b, 1337 + style, 0.7);
    default: return b;
  }
}
function vineSeason(style: number, season: number): Bmp {
  const J = PAL2.jungleGrass, b = decorBmp(T.VINE, style);
  switch (season) {
    case 0: recolor(b, J, SPRING); return dots(b, [[5, 1 + (style & 1) * 4], [10, 9]], hex('#ffffff'), hex('#f2b888'));
    case 2: return recolor(b, J, AUTUMN[style === 1 ? 2 : 1]);
    case 3: return frostTips(recolor(b, J, WITHERED), 1341 + style);
    default: return b;
  }
}
/** 季節植物的圖（season 0 春 … 3 冬） */
export function seasonalDecorBmp(id: number, style: number, season: number): Bmp {
  switch (id) {
    case T.BUSH: return bushSeason(style, season);
    case T.FERN: return fernSeason(style, season);
    case T.CACTUS: return cactusSeason(style, season);
    case T.DEAD_BUSH: return deadBushSeason(style, season);
    case T.VINE: return vineSeason(style, season);
    default: return decorBmp(id, style);
  }
}

/** 圖集第 col 欄的裝飾圖（欄位意義見 decorPick） */
export function decorBmpAt(id: number, col: number): Bmp {
  if (SEASONAL.has(id)) {
    const n = DECOR_STYLES[id] ?? 1;
    return seasonalDecorBmp(id, col % n, Math.floor(col / n) & 3);
  }
  return decorBmp(id, col);
}
