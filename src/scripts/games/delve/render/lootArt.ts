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
const MYTHIC_CYCLE = ['#fff4c0', '#ffd86a', '#ffa93a', '#b8788e', '#5c9ce0', '#93cc50'];
export function mythicColor(t: number, offset = 0): string {
  return MYTHIC_CYCLE[(Math.floor(t * 8) + offset) % MYTHIC_CYCLE.length];
}
/** 掉落物 / 光柱用的色（神話隨時間流轉） */
export function rarityColor(r: number, t: number, offset = 0): string {
  return r >= 5 ? mythicColor(t, offset) : RARITIES[Math.max(0, r)].color;
}

/**
 * 光柱：從掉落物往上的一道 3px 寬像素柱，越高越細碎（以 Bayer 式間隔跳格，不用半透明）。
 * 回傳每個要畫的點（相對掉落物頂端中心，y 往上為負）與顏色索引（0 亮、1 暗）。
 */
export function beamPixels(height: number, t: number): { x: number; y: number; c: 0 | 1 }[] {
  const out: { x: number; y: number; c: 0 | 1 }[] = [];
  const phase = Math.floor(t * 20);
  for (let k = 0; k < height; k++) {
    const y = -k - 1;
    // 下半段實心、往上越來越稀疏（每格依位置雜湊決定跳過）
    const keep = (k * 7 + phase) % 11;
    const density = k < height * 0.35 ? 11 : k < height * 0.7 ? 7 : 4;
    if (keep >= density) continue;
    out.push({ x: 0, y, c: 0 });
    if (k < height * 0.45) out.push({ x: -1, y, c: 0 }, { x: 1, y, c: 0 });
    else if (k < height * 0.75) out.push({ x: -1, y, c: 1 }, { x: 1, y, c: 1 });
    if (k < height * 0.3 && (k + phase) % 2 === 0) out.push({ x: -2, y, c: 1 }, { x: 2, y, c: 1 });
  }
  return out;
}

/** 傳說 / 神話的閃光：四個方向的十字星，隨時間在掉落物周圍跳動（回傳 [dx, dy, 大小]） */
export function sparkleAt(t: number, seed: number): [number, number, number] | null {
  const f = Math.floor(t * 6 + seed * 3);
  if (f % 3 === 2) return null;
  const a = ((f * 2654435761 + seed * 97) >>> 0) % 360;
  const r = 6 + (f % 4);
  return [Math.round(Math.cos((a * Math.PI) / 180) * r), Math.round(Math.sin((a * Math.PI) / 180) * r) - 4, f % 2 === 0 ? 2 : 1];
}
