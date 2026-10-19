// gen/landmarks.ts — 世界生成最後一段：每個「發現地點」放一件看得出是什麼地方的地標物件（一次性發現物）。
//   地標 = 互動 tile（engine/sites.ts 決定獎勵與線索；領過的記在存檔，不能重刷）：
//     小屋 / 大洞窟（普通）/ 地下湖 → 遺落的行囊（暖光提燈）      礦坑 → 鋪上軌道 + 一台滿載的礦車
//     遺跡 / 浮空島 → 守望石像（青色眼睛發光）                      水晶洞 / 水晶大洞窟 → 巨晶之心（很亮）
//     蘑菇林 / 蘑菇大洞窟 → 菇之圖騰（藍光）                         蜂巢 → 蜂王蜜罐
//     地表的湖 / 綠洲 / 冰湖、裂谷、峽谷、天坑 → 旅人石堆（紅布旗，遠遠就看得到）
//   找不到合適地板的地點就不放（不硬塞進牆裡）。
import type { World } from '../world';
import type { Structure } from '../worldgen';
import { T, W, SOLID_LUT } from '../tiles';

export interface LandmarkInfo { x: number; y: number; tile: number; /** 所屬地點的結構種類（獎勵 / 文案依它挑） */ site: string; }

/** 結構種類 → 地標 tile（沒列的不放） */
export function landmarkFor(s: Pick<Structure, 'kind' | 'flavor'>): number | null {
  switch (s.kind) {
    case 'cabin': case 'underground_lake': return T.RELIC_PACK;
    case 'cavern': return s.flavor === 'crystal' ? T.GEODE : s.flavor === 'mushroom' ? T.SPORE_TOTEM : T.RELIC_PACK;
    case 'mineshaft': return T.ORE_CART;
    case 'ruin': case 'sky_island': return T.GUARDIAN_STATUE;
    case 'crystal_cave': return T.GEODE;
    case 'mushroom_biome': return T.SPORE_TOTEM;
    case 'hive': return T.HONEY_JAR;
    case 'frozen_lake': case 'lake_bed': case 'oasis': case 'chasm': case 'ravine': case 'sinkhole': return T.CAIRN;
    default: return null;
  }
}
/** 地表型（找地表那一列：石堆放在湖邊 / 裂谷邊緣） */
const RIM = new Set(['frozen_lake', 'lake_bed', 'oasis', 'chasm', 'ravine', 'sinkhole']);

export function placeLandmarks(world: World, structures: readonly Structure[], surface: Int16Array): LandmarkInfo[] {
  const { width, height, fg, wall } = world, WW = width;
  const out: LandmarkInfo[] = [];
  const inB = (x: number, y: number): boolean => x >= 1 && y >= 1 && x < width - 1 && y < height - 2;
  const used = new Set<number>();
  const standOk = (x: number, y: number, dungeonOk = false): boolean => {
    if (!inB(x, y)) return false;
    const i = y * WW + x;
    if (fg[i] !== T.AIR || fg[i - WW] !== T.AIR || world.liquid[i] || world.liquid[i - WW]) return false;
    if (SOLID_LUT[fg[i + WW]] !== 1 || fg[i + WW] === T.DOOR_CLOSED || fg[i + WW] === T.DOOR_LOCKED) return false;
    if (!dungeonOk && wall[i] >= W.DUNGEON_WALL_BLUE && wall[i] <= W.DUNGEON_WALL_PINK) return false;
    // 不擠在箱子 / 古碑旁邊
    for (const d of [-1, 1]) { const n = fg[i + d]; if (n === T.CHEST || n === T.LOCKED_CHEST || n === T.LORE_TABLET) return false; }
    for (const u of used) if (Math.abs((u % WW) - x) < 4 && Math.abs(Math.floor(u / WW) - y) < 4) return false;
    return true;
  };
  /** 由中心往外找第一個站得住的地板（確定性：只看幾何，不吃亂數） */
  const nearest = (s: Structure): { x: number; y: number } | null => {
    const cx = s.x + (s.w >> 1), cy = s.y + (s.h >> 1);
    const rx = Math.max(2, s.w >> 1), ry = Math.max(2, s.h >> 1);
    let best: { x: number; y: number } | null = null, bd = Infinity;
    for (let y = s.y; y < s.y + s.h; y++) for (let x = s.x; x < s.x + s.w; x++) {
      if (!standOk(x, y)) continue;
      const d = ((x - cx) * (x - cx)) / (rx * rx) + ((y - cy) * (y - cy)) / (ry * ry) * 0.6;
      if (d < bd) { bd = d; best = { x, y }; }
    }
    return best;
  };
  /** 邊緣：結構左右兩側（各 3..14 欄外）地表那一列 */
  const rim = (s: Structure): { x: number; y: number } | null => {
    for (let k = 3; k <= 14; k++) {
      for (const x of [s.x - k, s.x + s.w + k - 1]) {
        if (x < 2 || x >= width - 2) continue;
        for (let y = Math.max(2, surface[x] - 6); y <= Math.min(height - 3, surface[x] + 3); y++) {
          if (fg[y * WW + x] !== T.AIR && fg[y * WW + x] !== T.TALL_GRASS && fg[y * WW + x] !== T.FLOWER && fg[y * WW + x] !== T.BUSH) continue;
          const keep = fg[y * WW + x];
          fg[y * WW + x] = T.AIR;
          if (standOk(x, y)) return { x, y };
          fg[y * WW + x] = keep;
        }
      }
    }
    return null;
  };
  /** 外圍：結構矩形往外擴 pad 格再找（湖岸 / 洞窟邊） */
  const around = (s: Structure, pad: number): { x: number; y: number } | null =>
    nearest({ ...s, x: Math.max(2, s.x - pad), y: Math.max(2, s.y - pad), w: s.w + pad * 2, h: s.h + pad * 2 });
  /** 水面上鑿一塊 3 格寬的石台（地下湖找不到岸時）：水面那一列中間 3 格換成石頭、地標放在上面 */
  const islet = (s: Structure): { x: number; y: number } | null => {
    for (let y = Math.max(3, s.y); y < Math.min(height - 3, s.y + s.h); y++) {
      for (let d = 0; d < s.w >> 1; d++) for (const x of [s.x + (s.w >> 1) - d, s.x + (s.w >> 1) + d]) {
        const i = y * WW + x;
        if (x < 3 || x >= width - 3 || !world.liquid[i]) continue;
        // 水面：上面兩格是空氣、沒有水
        let ok = true;
        for (let k = -1; k <= 1 && ok; k++) for (let h = 1; h <= 3; h++) { const j = (y - h) * WW + x + k; if (fg[j] !== T.AIR || world.liquid[j]) ok = false; }
        if (!ok) continue;
        for (let k = -1; k <= 1; k++) { const j = i + k; fg[j] = T.STONE; world.liquid[j] = 0; world.liquidType[j] = 0; }
        return standOk(x, y - 1) ? { x, y: y - 1 } : null;
      }
    }
    return null;
  };
  for (const s of structures) {
    const tile = landmarkFor(s);
    if (tile === null) continue;
    let spot: { x: number; y: number } | null = null;
    if (s.kind === 'mineshaft') spot = mineCart(world, s, standOk);
    else spot = RIM.has(s.kind) ? rim(s) ?? nearest(s) : nearest(s);
    // 找不到地板：往外擴一圈（岸邊 / 洞窟邊緣），湖再找不到就在水面鑿一塊石台
    if (!spot) spot = around(s, 12);
    if (!spot && (s.kind === 'underground_lake' || s.kind === 'lake_bed' || s.kind === 'frozen_lake' || s.kind === 'oasis')) spot = islet(s);
    if (!spot) continue;
    fg[spot.y * WW + spot.x] = tile;
    used.add(spot.y * WW + spot.x);
    out.push({ x: spot.x, y: spot.y, tile, site: s.kind });
  }
  return out;
}

/** 礦坑：沿坑道地板鋪軌道（空氣格、下面實心），礦車停在中段 */
function mineCart(world: World, s: Structure, standOk: (x: number, y: number) => boolean): { x: number; y: number } | null {
  const { width, fg } = world, WW = width;
  const floor = s.y + 4; // 坑道：yTop = s.y + 1，空氣 yTop..yTop+3（站立列 = yTop + 3）
  const mid = s.x + (s.w >> 1);
  let spot: { x: number; y: number } | null = null;
  for (let x = s.x; x < s.x + s.w; x++) {
    const i = floor * WW + x;
    if (fg[i] === T.AIR && SOLID_LUT[fg[i + WW]] === 1 && !world.liquid[i]) fg[i] = T.RAIL;
  }
  for (let d = 0; d < s.w >> 1 && !spot; d++) {
    for (const x of [mid - d, mid + d]) {
      const i = floor * WW + x;
      if (fg[i] !== T.RAIL) continue;
      fg[i] = T.AIR;
      if (standOk(x, floor)) { spot = { x, y: floor }; break; }
      fg[i] = T.RAIL;
    }
  }
  return spot;
}
