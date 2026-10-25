// lore.ts — gen2 家鄉的「裝飾」步（M2a Task 14；spec §4.4「14 塊燈脈石碑與 4 件遺物在初始之地」）：
// 讀家鄉全部的原始藍圖（BlueprintIndex.homePlans，Q9），決定 14 塊石碑（engine/lore.ts 的 LORE_SITES）與遺物 / 導航工具放在哪份藍圖的哪一格。
// 只依賴原始藍圖（沒有循環）；最終藍圖 = 原始 + 石碑格 + 箱子附加物品（applyDecor）。
// 指派（「最近」= 藍圖外框中心離出生點最近，平手取 x 小、再取 id 小的）：
//   0 spawn → spawn_tablet；1 secret → 最近的有密室的礦坑（密室裡的 floors）；2 cabin → 最近的小屋；
//   3 crystal / 4 mushroom / 5 sky / 13 ruin → 該種最近的一份；9 mineshaft → 最近的礦坑（密室外的 floors）；
//   6 / 7 / 12 → 地城（Task 8 已放）；8 molten → molten_shrine；10 / 11 → alcove 的 'snow' / 'desert'。
//   最近的那份沒有可用的地板 → 同種下一份；整種都沒有 → 任何有可用地板的家鄉藍圖（村莊除外：floors[0] 是委託板）裡最近的。
// 石碑放在該藍圖 floors 中第一個不與箱子 / 地標 / 陶罐 / 已放的石碑相鄰（含斜角）、也不是它們本身的格。
// 遺物（箱子的 extra）：jump_boots → 最近空島的 'sky' 箱；swift_boots → shaft_cache 的 'relic' 箱（「最深的裂谷」精神 = 最深的主坑道底）；
// night_amulet → molten_shrine 的 'relic' 箱；magnet → 最近有密室的礦坑的 'secret' 箱；compass / depth_meter → 最近兩間小屋的箱子。
// 本資料夾的非測試檔不得出現連續兩個星號、亂數與超越函數（測試會 grep），註解一律用 //。
import { T } from '../tiles';
import type { ItemId } from '../items';
import { LORE_SITES, type LoreSite } from '../lore';
import { KEEP, indexColumns, type Blueprint, type BpBox, type BpKind, type BpTablet } from './bpcore';

// tablets：藍圖 id（sid）→ 要加的石碑；extras：sid → 箱子座標 "x,y" → 要加的物品
export interface HomeDecor { tablets: Map<number, BpTablet[]>; extras: Map<number, Map<string, ItemId[]>> }

// 遺物：物品 → 放在哪種藍圖的哪種箱子、GenRelic.where（home.homeContent 用）
export const RELIC_WHERE: Readonly<Partial<Record<ItemId, string>>> = { jump_boots: 'sky_island', swift_boots: 'shaft', night_amulet: 'molten', magnet: 'secret_room' };

const inBox = (f: { x: number; y: number }, b: BpBox): boolean => f.x >= b.x && f.x < b.x + b.w && f.y >= b.y && f.y < b.y + b.h;

export function homeDecor(raw: readonly Blueprint[], spawnX: number): HomeDecor {
  const dist = (b: Blueprint): number => Math.abs(b.x + b.w / 2 - spawnX);
  const sorted = [...raw].sort((p, q) => dist(p) - dist(q) || p.x - q.x || p.id - q.id);
  const of = (k: BpKind, keep: (b: Blueprint) => boolean = () => true): Blueprint[] => sorted.filter((b) => b.kind === k && keep(b));
  const tablets = new Map<number, BpTablet[]>(), extras = new Map<number, Map<string, ItemId[]>>();
  // 已經有的石碑（地城的 6 / 7 / 12）
  const done = new Set<number>();
  for (const b of raw) for (const t of b.tablets) done.add(t.id);
  // b 裡擋住石碑的格：箱子、地標、陶罐、已有 / 新放的石碑
  const taken = (b: Blueprint): { x: number; y: number }[] => [...b.chests, ...b.landmarks, ...b.pots, ...b.tablets, ...(tablets.get(b.id) ?? [])];
  const spot = (b: Blueprint, ok: (f: { x: number; y: number }) => boolean): { x: number; y: number } | null => {
    const t = taken(b);
    for (const f of b.floors) if (ok(f) && t.every((q) => Math.abs(q.x - f.x) > 1 || Math.abs(q.y - f.y) > 1)) return f;
    return null;
  };
  const place = (id: number, cands: readonly Blueprint[], ok: (b: Blueprint, f: { x: number; y: number }) => boolean = () => true): boolean => {
    if (done.has(id)) return true;
    for (const b of cands) {
      const f = spot(b, (q) => ok(b, q));
      if (!f) continue;
      const l = tablets.get(b.id) ?? [];
      l.push({ x: f.x, y: f.y, id });
      tablets.set(b.id, l);
      done.add(id);
      return true;
    }
    return false;
  };
  const secretOf = (b: Blueprint): boolean => b.secret !== undefined;
  // 主題地點 → 放法（碑文 id = LORE_SITES 的索引，只有那一份事實；地城的三篇由地城藍圖自己放）
  const SITE: Readonly<Partial<Record<LoreSite, (id: number) => boolean>>> = {
    spawn: (id) => place(id, of('spawn_tablet')),
    secret: (id) => place(id, of('mineshaft', secretOf), (b, f) => inBox(f, b.secret!)),
    cabin: (id) => place(id, of('cabin')),
    crystal: (id) => place(id, of('crystal_cave')),
    mushroom: (id) => place(id, of('mushroom_biome')),
    sky: (id) => place(id, of('sky_island')),
    molten: (id) => place(id, of('molten_shrine')),
    mineshaft: (id) => place(id, of('mineshaft'), (b, f) => !b.secret || !inBox(f, b.secret)),
    snow: (id) => place(id, of('alcove', (b) => b.variant === 'snow')),
    desert: (id) => place(id, of('alcove', (b) => b.variant === 'desert')),
    ruin: (id) => place(id, of('ruin')),
  };
  LORE_SITES.forEach((site, id) => SITE[site]?.(id));
  // 找不到主題地點的碑文：任何有可用地板的家鄉藍圖（村莊除外）裡最近的
  const any = sorted.filter((b) => b.kind !== 'village');
  LORE_SITES.forEach((_, id) => { if (!place(id, any)) throw new RangeError(`gen2: home has no floor for lore tablet ${id}`); });

  // 遺物 / 導航工具
  const add = (b: Blueprint | undefined, kind: string, item: ItemId): void => {
    const c = b?.chests.find((q) => q.kind === kind);
    if (!b || !c) throw new RangeError(`gen2: home has no ${kind} chest for ${item}`);
    const m = extras.get(b.id) ?? new Map<string, ItemId[]>(), k = `${c.x},${c.y}`;
    m.set(k, [...(m.get(k) ?? []), item]);
    extras.set(b.id, m);
  };
  add(of('sky_island', (b) => b.chests.some((c) => c.kind === 'sky'))[0], 'sky', 'jump_boots');
  add(of('shaft_cache')[0], 'relic', 'swift_boots');
  add(of('molten_shrine')[0], 'relic', 'night_amulet');
  add(of('mineshaft', (b) => b.chests.some((c) => c.kind === 'secret'))[0], 'secret', 'magnet');
  const cabins = of('cabin', (b) => b.chests.length > 0);
  add(cabins[0], 'cabin', 'compass');
  add(cabins[1], 'cabin', 'depth_meter');
  return { tablets, extras };
}

// 最終藍圖 = 原始 + 這份的石碑格（fg = T.LORE_TABLET、清掉液體；原本有那一格就改它，沒有就附加）+ 箱子的附加物品；沒有裝飾 = 原物件
export function applyDecor(b: Blueprint, d: HomeDecor): Blueprint {
  const tabs = d.tablets.get(b.id), ext = d.extras.get(b.id);
  if (!tabs && !ext) return b;
  let cells = b.cells, colIndex = b.colIndex;
  if (tabs) {
    const at = new Map<number, number>();
    for (let k = 0; k < cells.length; k += 5) at.set(cells[k] * 4096 + cells[k + 1], k);
    const extra: number[] = [];
    cells = cells.slice();
    for (const t of tabs) {
      const k = at.get(t.x * 4096 + t.y);
      if (k !== undefined) { cells[k + 2] = T.LORE_TABLET; cells[k + 4] = 0; } else extra.push(t.x, t.y, T.LORE_TABLET, KEEP, 0);
    }
    if (extra.length) {
      const joined = new Int32Array(cells.length + extra.length);
      joined.set(cells); joined.set(extra, cells.length);
      cells = joined;
      if (colIndex) ({ cells, colIndex } = indexColumns(cells));
    }
  }
  const chests = ext ? b.chests.map((c) => { const add = ext.get(`${c.x},${c.y}`); return add ? { ...c, extra: [...(c.extra ?? []), ...add] } : c; }) : b.chests;
  const out: Blueprint = { ...b, cells, chests, tablets: tabs ? [...b.tablets, ...tabs] : b.tablets };
  if (colIndex) out.colIndex = colIndex;
  return out;
}
