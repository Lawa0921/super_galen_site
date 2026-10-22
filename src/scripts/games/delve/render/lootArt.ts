// lootArt.ts — 裝備系統的像素美術（全部程式繪製、只用統一色票、沒有半透明像素）：
//   碎晶 / 星塵圖示、地上掉落物的稀有度底框、史詩以上的光柱與閃光、傳說 / 神話的流光色。
import { Bmp, INK, hex, type RGB } from './pixel';
import { RARITIES } from '../engine/gear';

const S = 16;

/** 碎晶：三根青色晶柱插在暗色碎石上 */
export function iconGearShard(): Bmp {
  const b = new Bmp(S, S);
  b.grid([
    '................',
    '................',
    '.......a........',
    '......abc.......',
    '......abc...a...',
    '.....abbc..abc..',
    '..a..abbc..abc..',
    '.abc.abbc.abbc..',
    '.abc.abbbcabbc..',
    '.abbcabbbcabbc..',
    '..abbabbbbbbc...',
    '..dddddddddddd..',
    '...dedddeddd....',
    '................',
  ], { a: hex('#cceaf8'), b: hex('#4aaeb0'), c: hex('#1f6474'), d: hex('#2c2838'), e: hex('#423f54') }, 0, 1);
  return b.outline(INK);
}

/** 轉生之藥：圓肚小瓶，裡面是粉紫色的藥水，瓶口塞著木塞，肩上飄著一顆金色火花 */
export function iconRebirth(): Bmp {
  const b = new Bmp(S, S);
  b.grid([
    '...........y....',
    '.....kk...yWy...',
    '.....kk....y....',
    '......gg........',
    '......gg........',
    '.....gGGg.......',
    '....gGGGGg......',
    '...gGppppGg.....',
    '...gGpqqpGg.....',
    '...gGpqrpGg.....',
    '...gGpppppGg....',
    '....gGpppGg.....',
    '.....gGGGg......',
    '......ggg.......',
    '................',
    '................',
  ], { g: hex('#4aaeb0'), G: hex('#cceaf8'), p: hex('#7a5a8c'), q: hex('#b8788e'), r: hex('#f2b888'), k: hex('#7c4c2e'), y: hex('#ffd86a'), W: hex('#fff4c0') }, 0, 1);
  return b.outline(INK);
}

/** 星塵：一小堆紫色星砂，上面閃著金色星光 */
export function iconStardust(): Bmp {
  const b = new Bmp(S, S);
  b.grid([
    '................',
    '.....y..........',
    '....yWy.....y...',
    '.....y.....yWy..',
    '............y...',
    '.......p........',
    '......ppq.......',
    '....pppqqpp.....',
    '...pqqppqWqp....',
    '..pqqWqppqqqp...',
    '..ppqqqqqqqpp...',
    '...rrrrrrrrr....',
  ], { p: hex('#7a5a8c'), q: hex('#b8788e'), W: hex('#fff4c0'), y: hex('#ffd86a'), r: hex('#463c78') }, 0, 2);
  return b.outline(INK);
}

/** 稀有度的 [亮, 暗] 色（RGB） */
export function rarityRGB(r: number): [RGB, RGB] {
  const d = RARITIES[Math.max(0, Math.min(RARITIES.length - 1, r))];
  return [hex(d.color), hex(d.dark)];
}

/** 神話流光：依時間在幾個色票色之間階梯切換 */
const MYTHIC_CYCLE = ['#fff4c0', '#ffd86a', '#ffa93a', '#9a6ee0', '#5c9ce0', '#93cc50'];
export function mythicColor(t: number, offset = 0): string {
  return MYTHIC_CYCLE[(Math.floor(t * 8) + offset) % MYTHIC_CYCLE.length];
}
/** 掉落物 / 光柱用的色（神話隨時間流轉） */
export function rarityColor(r: number, t: number, offset = 0): string {
  return r >= 5 ? mythicColor(t, offset) : RARITIES[Math.max(0, r)].color;
}

/** 神話光柱：只在飽和色之間流轉（不用米白，免得看起來像一般光） */
const MYTHIC_BEAM = ['#ffa93a', '#93cc50', '#5c9ce0', '#9a6ee0', '#e8701c'];
/** 光柱的 4 個色：[亮, 暗, 白芯, 描邊] */
export function beamColors(r: number, t: number): [string, string, string, string] {
  if (r >= 5) {
    const k = Math.floor(t * 8);
    return [MYTHIC_BEAM[k % MYTHIC_BEAM.length], MYTHIC_BEAM[(k + 2) % MYTHIC_BEAM.length], '#ffffff', '#0c0a12'];
  }
  const d = RARITIES[Math.max(0, Math.min(RARITIES.length - 1, r))];
  return [d.color, d.dark, '#ffffff', '#0c0a12'];
}

/**
 * 光柱：從掉落物往上的像素柱。下段 = 白芯 + 亮色 + 深色描邊（亮背景也看得到），往上越細、越稀疏（跳格，不用半透明）。
 * 回傳每個要畫的點（相對掉落物頂端中心，y 往上為負）與顏色索引（見 beamColors：0 亮、1 暗、2 白芯、3 描邊）。
 */
export function beamPixels(height: number, t: number): { x: number; y: number; c: 0 | 1 | 2 | 3 }[] {
  const out: { x: number; y: number; c: 0 | 1 | 2 | 3 }[] = [];
  const phase = Math.floor(t * 20);
  for (let k = 0; k < height; k++) {
    const y = -k - 1;
    const keep = (k * 7 + phase) % 11;
    const density = k < height * 0.35 ? 11 : k < height * 0.7 ? 7 : 4;
    if (keep >= density) continue;
    if (k < height * 0.45) {
      out.push({ x: 0, y, c: 2 }, { x: -1, y, c: 0 }, { x: 1, y, c: 0 }, { x: -2, y, c: 3 }, { x: 2, y, c: 3 });
    } else if (k < height * 0.75) {
      out.push({ x: 0, y, c: 0 }, { x: -1, y, c: 3 }, { x: 1, y, c: 3 });
    } else out.push({ x: 0, y, c: (k + phase) % 3 === 0 ? 2 : 1 });
  }
  return out;
}

/** 優良 / 稀有的浮動標記：掉落物上方一顆 5×5 菱形（深色描邊 + 稀有度色 + 白色亮點），每半秒上下 1px */
export function markerPixels(r: number, t: number): { x: number; y: number; c: string }[] {
  if (r < 1) return [];
  const fill = rarityColor(r, t), bob = Math.floor(t * 2) % 2;
  const rows = ['..o..', '.ofo.', 'ofwfo', '.ofo.', '..o..'];
  const out: { x: number; y: number; c: string }[] = [];
  rows.forEach((row, y) => [...row].forEach((ch, x) => {
    if (ch === '.') return;
    out.push({ x: x - 2, y: y - 4 - bob, c: ch === 'o' ? '#0c0a12' : ch === 'w' ? '#ffffff' : fill });
  }));
  return out;
}

/** 稀有度標記 / 光柱在畫面上至少要這麼多 CSS px 一個美術像素（縮小時整數倍加粗，遠看也讀得出來） */
export const LOOT_MIN_CSS_PER_PX = 2;
/**
 * 地上裝備的標記放大倍數（整數 1..4）：zoom = 目前每個美術像素佔幾 CSS px。
 * 預設縮放（≥ 2）維持 1；縮小到 1 CSS px / 美術像素時 ×2，標記與光柱仍是整數像素的實心色塊。
 */
export function lootGlyphScale(zoom: number): number {
  if (!(zoom > 0)) return 1;
  return Math.max(1, Math.min(4, Math.ceil(LOOT_MIN_CSS_PER_PX / zoom - 1e-6)));
}

/** 傳說 / 神話的閃光：四個方向的十字星，隨時間在掉落物周圍跳動（回傳 [dx, dy, 大小]） */
export function sparkleAt(t: number, seed: number): [number, number, number] | null {
  const f = Math.floor(t * 6 + seed * 3);
  if (f % 3 === 2) return null;
  const a = ((f * 2654435761 + seed * 97) >>> 0) % 360;
  const r = 6 + (f % 4);
  return [Math.round(Math.cos((a * Math.PI) / 180) * r), Math.round(Math.sin((a * Math.PI) / 180) * r) - 4, f % 2 === 0 ? 2 : 1];
}
