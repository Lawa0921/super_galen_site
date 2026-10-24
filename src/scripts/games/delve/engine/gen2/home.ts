// home.ts — gen2 家鄉開局內容（M2a Task 9 建立、Task 14 加 homeContent，Q11）。
// homeSites：家鄉所有聚落錨點（村莊、地廳、地城）的藍圖 site，依 x 排序（村莊 / 地廳 = info.x0、地城 = bbox.x）。
// bootGen2 拿不到遊戲的 SiteRegistry，所以放進 WorldContent.sites，DelveGame 建構時逐一 sites.add（開局一次，居民開局就在）；
// 之後欄載入時 World.onGenSites 交來的同 key 被 SiteRegistry 去重。藍圖存在家鄉的釘選表（Q9），這裡建過之後載入欄不會再建一次。
// 本資料夾的非測試檔不得出現連續兩個星號、亂數與超越函數（測試會 grep），註解一律用 //。
import type { GenSite } from '../genTypes';
import type { AnchorKind } from './anchors';
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
