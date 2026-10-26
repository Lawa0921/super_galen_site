// home.ts — gen2 家鄉開局內容（M2a Task 9 建立、Task 14 加 homeContent，Q11）。
// homeSites：家鄉所有聚落錨點（村莊、地廳、地城）的藍圖 site，依 x 排序（村莊 / 地廳 = info.x0、地城 = bbox.x）。
// bootGen2 拿不到遊戲的 SiteRegistry，所以放進 WorldContent.sites，DelveGame 建構時逐一 sites.add（開局一次，居民開局就在）；
// 之後欄載入時 World.onGenSites 交來的同 key 被 SiteRegistry 去重。藍圖存在家鄉的釘選表（Q9），這裡建過之後載入欄不會再建一次。
// homeContent（Task 14）：讀 BlueprintIndex.homePlans() 的最終藍圖（含 lore.homeDecor 的石碑 / 遺物），不生成任何格子；結果依 src 快取。
//   tablets = 家鄉藍圖的石碑（id 序）；relics = 箱子附加物品裡的四件遺物（lore.RELIC_WHERE）；landmarks = 藍圖的地標；
//   structures = render/underground.ts 的地下背景（蘑菇林 = 菇牆畫到的範圍、地城 = DungeonInfo.bbox）；sites = homeSites；villages / halls / dungeon 取自 sites。
// 客人加入也跑同一套（只算藍圖），石碑 id 與遺物位置只由 seed 決定，與主機逐位相同。
// 本資料夾的非測試檔不得出現連續兩個星號、亂數與超越函數（測試會 grep），註解一律用 //。
import { W } from '../tiles';
import type { GenSite, VillageInfo, HallInfo, DungeonInfo, GenRelic, LandmarkInfo, Structure } from '../genTypes';
import type { AnchorKind } from './anchors';
import type { Blueprint } from './bpcore';
import { RELIC_WHERE } from './lore';
import type { Gen2Source } from './index';

const SITE_KINDS: ReadonlySet<AnchorKind> = new Set<AnchorKind>(['village', 'hall', 'dungeon']);

const siteX = (s: GenSite): number => (s.kind === 'hermit' ? s.at.x : s.kind === 'dungeon' ? s.info.bbox.x : s.info.x0);

export function homeSites(src: Gen2Source): GenSite[] {
  const h = src.layout.origin.home, m = h ? src.layout.landmassAt(h.x0) : null;
  if (!m || m.kind !== 'home') return [];
  const out: GenSite[] = [];
  for (const a of src.blueprints.anchorsOf(m)) {
    if (!SITE_KINDS.has(a.kind)) continue;
    const b = src.blueprints.anchorBlueprint(m, a);
    if (b?.site) out.push(structuredClone(b.site));
  }
  return out.sort((p, q) => siteX(p) - siteX(q));
}

export interface HomeContent {
  villages: VillageInfo[]; halls: HallInfo[]; dungeon: DungeonInfo | null; tablets: { x: number; y: number; id: number }[];
  relics: GenRelic[]; landmarks: LandmarkInfo[]; structures: Structure[]; sites: GenSite[];
}

const CACHE = new WeakMap<Gen2Source, HomeContent>();

// 蘑菇林的地下背景範圍：藍圖裡畫了菇牆的格（橢圓 E；隧道 / 豎井不畫牆）的外接矩形
function wallBox(b: Blueprint, wall: number): { x: number; y: number; w: number; h: number } {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (let k = 0; k < b.cells.length; k += 5) {
    if (b.cells[k + 3] !== wall) continue;
    const x = b.cells[k], y = b.cells[k + 1];
    x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x + 1); y1 = Math.max(y1, y + 1);
  }
  return Number.isFinite(x0) ? { x: x0, y: y0, w: x1 - x0, h: y1 - y0 } : { x: b.x, y: b.y, w: b.w, h: b.h };
}

export function homeContent(src: Gen2Source): HomeContent {
  const hit = CACHE.get(src);
  if (hit) return hit;
  const plans = src.blueprints.homePlans(), sites = homeSites(src);
  const tablets = plans.flatMap((b) => b.tablets.map((t) => ({ x: t.x, y: t.y, id: t.id }))).sort((p, q) => p.id - q.id);
  const relics: GenRelic[] = [];
  for (const b of plans) for (const c of b.chests) for (const item of c.extra ?? []) {
    const where = RELIC_WHERE[item];
    if (where) relics.push({ x: c.x, y: c.y, item, where });
  }
  const landmarks: LandmarkInfo[] = plans.flatMap((b) => b.landmarks.map((l) => ({ x: l.x, y: l.y, tile: l.tile, site: l.site })));
  const structures: Structure[] = [];
  for (const b of plans) if (b.kind === 'mushroom_biome') structures.push({ kind: 'mushroom_biome', ...wallBox(b, W.MUD_WALL) });
  const villages: VillageInfo[] = [], halls: HallInfo[] = [];
  let dungeon: DungeonInfo | null = null;
  for (const s of sites) {
    if (s.kind === 'village') villages.push(structuredClone(s.info));
    else if (s.kind === 'hall') halls.push(structuredClone(s.info));
    else if (s.kind === 'dungeon') { dungeon = structuredClone(s.info); structures.push({ kind: 'dungeon', ...s.info.bbox }); }
  }
  const out: HomeContent = { villages, halls, dungeon, tablets, relics, landmarks, structures, sites };
  CACHE.set(src, out);
  return out;
}
