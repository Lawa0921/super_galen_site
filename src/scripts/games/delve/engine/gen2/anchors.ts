// anchors.ts — gen2 錨點（保留槽）：保證家鄉（之後也有大陸，Task 18）必要結構的 (地區, 層, 槽)。
// 錨點的槽不擲機率表：BlueprintIndex.build 先查錨點，有錨點就用登錄的建構器（沒登錄 = 該槽保留但空著），錨點也優先於大陸的保證槽（Q15）。
// 錨點只由 (seed, 地塊) 與 Profile2（主坑道的深度）算出，與查詢順序無關；BlueprintIndex.anchorsOf 依地塊快取。
// 家鄉錨點的通則：只放在家鄉的一般地區（不是沙灘、不是地城區；地城區只有 dungeon 錨點）；含出生點 ± SPAWN_CLEAR 的槽
// 不放（所有層，含 MINOR，Q16）；先找不含主坑道的槽，沒有才用含坑道的槽（外框限在避開坑道帶後較大的一側，anchorSpan；
// shaft_cache 例外——它就是要坑道底那一槽）；同一 (地區, 層, 槽) 至多一個。
// 本資料夾的非測試檔不得出現連續兩個星號、亂數與超越函數（測試會 grep），註解一律用 //。
import { hash2, seedInt } from '../noise';
import { BIOME } from '../world';
import type { RegionInfo } from '../regionInfo';
import { HOME_X0, SPAWN_X, VARIANT, homeDungeonRegion, type Landmass } from './layout';
import type { Profile2 } from './profile';
import { shaftOf, shaftX } from './caves';
import { BP_SURFACE, BP_UNDER, BP_DEEP, BP_SKY, BP_MINOR, SUB_SLOT_W, SLOT_PAD, centerAway, shaftBand, landSlot, landSlotCount, touchesSpawnClear, type Blueprint, type BpCtx, type Layer } from './bpcore';

export type AnchorKind = 'dungeon' | 'village' | 'hall' | 'mineshaft_secret' | 'sky_island' | 'mushroom_biome' | 'crystal_cave' | 'hive'
  | 'cave_lake' | 'ruin' | 'cabin' | 'alcove_snow' | 'alcove_desert' | 'molten_shrine' | 'shaft_cache' | 'spawn_tablet' | 'keep' | 'hermit_hut'
  // 只給測試注入（Q8）：homeAnchors / continentAnchors 永遠不產生、正式碼永遠不登錄建構器
  | 'test_probe';
// wholeRegion：佔滿整個地區（家鄉地城，Q2）——外框可以超出自己的槽，overlapping 對任何與地區相交的查詢都找得到它
export interface Anchor { kind: AnchorKind; region: RegionInfo; layer: Layer; slot: number; wholeRegion?: boolean }

// 錨點建構器：一律 force，不回 null
export type AnchorBuild = (c: BpCtx) => Blueprint;
const BUILDS = new Map<AnchorKind, AnchorBuild>();
// 結構 Task 各自登錄；沒登錄的錨點 = 該槽保留但空著
export function registerAnchorBuild(kind: AnchorKind, build: AnchorBuild): void { BUILDS.set(kind, build); }
export function anchorBuild(kind: AnchorKind): AnchorBuild | undefined { return BUILDS.get(kind); }

// 回傳順序（同種依選取順序）
const ORDER: readonly AnchorKind[] = ['dungeon', 'village', 'hall', 'mineshaft_secret', 'sky_island', 'mushroom_biome', 'crystal_cave', 'hive',
  'cave_lake', 'ruin', 'cabin', 'alcove_snow', 'alcove_desert', 'molten_shrine', 'shaft_cache', 'spawn_tablet'];

// 村莊離出生點至少、第 1 / 2 座的目標偏移；地廳第 2 座的目標偏移與兩座最小間距；礦坑密室 / 空島 / 熔岩祭壇離出生點至少
export const VILLAGE_MIN = 200;
const VILLAGE_AIM = 950, HALL_AIM = 1200, HALL_GAP = 840, SECRET_MIN = 160, SKY_MIN = 250, MOLTEN_MIN = 630;
// 礦坑密室彼此至少 2 槽；地下層那一組的重挑次數
const SECRET_GAP = 2 * SUB_SLOT_W, UNDER_TRIES = 8;

// 各錨點種類的建構器外框最大寬（錨點建構器的契約：外框寬不得超過這個值）。選槽時可用寬度（見 anchorSpan）− 兩側 SLOT_PAD 必須 ≥ 它。
// 來源：已存在的建構器照實際亂數範圍（HRng.int 是 [lo, hi)）；還沒寫的照計畫的規格（Task 9 / 10 / 11 / 14）：
//   village 91 = vw 上限 73 + 兩側坡地各 9（外框 x0 − 9 .. x1 + 9，Task 4 延續事項）；ruin 20 = w 上限 18 + 2（structures/ruin.ts）；
//   cabin 75 = tl 30 + w 15 + tr 30（structures/cabin.ts）；cave_lake 65 = 2 × rx 上限 30 + 1 + 2 × 殼 2（structures/lakes.ts）；
//   hall 154 = Task 9「外框 ≤ 154 = 170 − 16」；mineshaft_secret 154 = Q3 總寬上限；sky_island 48 = 島寬 30–48（Task 10）；
//   mushroom_biome 145 = 2 × rx 70 + 1 + 2 × 2（殼，同 lakes 的橢圓外框）；crystal_cave 125 = 2 × 60 + 1 + 4；hive 37 = 2 × 15 + 1 + 2 × 3（2.5 格殼取整）；
//   alcove 9 = 9 × 5 石室（Task 14）；molten_shrine 15、spawn_tablet 12：Task 14 規格沒給寬度，這裡訂為契約上限（spawn_tablet 照小點位的寬 ≤ 12）。
// dungeon（wholeRegion）與 shaft_cache（刻意在坑道底）不受這個限制
export const ANCHOR_MAX_W: Readonly<Partial<Record<AnchorKind, number>>> = {
  village: 91, ruin: 20, cabin: 75, cave_lake: 65, hall: 154, mineshaft_secret: 154, sky_island: 48,
  mushroom_biome: 145, crystal_cave: 125, hive: 37, alcove_snow: 9, alcove_desert: 9, molten_shrine: 15, spawn_tablet: 12,
  // 只給測試（BlueprintIndex 的執行期寬度檢查）
  test_probe: 60,
};

// 錨點的可用範圍：槽扣掉該地區主坑道的坑道帶（bpcore.shaftBand，與 placeX 同一個；鄰槽的坑道帶也可能伸進來）後
// 較大的那一側（平手取左側；帶子碰不到槽 → 整槽）；shaft = 槽含 shaftX（選槽時排在不含坑道的槽之後）。
// wholeRegion → 整個地區；shaft_cache → 整槽（刻意蓋在坑道底）。BlueprintIndex 把它當成建構器的 slotX0 / slotX1
export function anchorSpan(seed: string, a: Anchor): { x0: number; x1: number; shaft: boolean } {
  if (a.wholeRegion) return { x0: a.region.x0, x1: a.region.x1, shaft: false };
  return spanOf(landSlot(a.region, a.slot, a.layer), a.kind === 'shaft_cache' ? NaN : shaftX(seedInt(seed, 'g2-shaft'), a.region));
}
// 村莊（外框最寬 ANCHOR_MAX_W.village）放得進可用範圍、中心離出生點 sp > VILLAGE_MIN（寬度越窄越好放，所以最寬的放得下就都放得下）
export function villageFits(span: { x0: number; x1: number }, sp: number): boolean {
  return centerAway(span.x0, span.x1, ANCHOR_MAX_W.village!, sp, VILLAGE_MIN) !== null;
}
function spanOf(sl: { x0: number; x1: number }, sx: number): { x0: number; x1: number; shaft: boolean } {
  if (!Number.isFinite(sx)) return { x0: sl.x0, x1: sl.x1, shaft: false };
  const { l, r } = shaftBand(sx), shaft = sx >= sl.x0 && sx < sl.x1;
  if (r <= sl.x0 || l >= sl.x1) return { x0: sl.x0, x1: sl.x1, shaft };
  const lw = Math.max(0, l - sl.x0), rw = Math.max(0, sl.x1 - r);
  return lw >= rw ? { x0: sl.x0, x1: sl.x0 + lw, shaft } : { x0: sl.x1 - rw, x1: sl.x1, shaft };
}

interface Slot { r: RegionInfo; layer: Layer; q: number; x0: number; x1: number; mid: number }

// 依 x 序的槽裡，彼此中點相距 ≥ gap 最多能挑幾個（由左往右貪心，一維上是最佳解）
function spacedCount(list: readonly Slot[], gap: number): number {
  let n = 0, last = -Infinity;
  for (const s of list) if (s.mid - last >= gap) { n++; last = s.mid; }
  return n;
}

// 家鄉錨點（規則見 task 7；作者決定，凍結前可調，測試釘不變量）。每條規則先在不含主坑道的槽裡找，找不到才用含坑道的槽
// （可用範圍 = anchorSpan 的較大一側）；兩種都要放得下該種的 ANCHOR_MAX_W + 兩側 SLOT_PAD。整個家鄉都找不到 → RangeError（不默默少放）
export function homeAnchors(seed: string, home: Landmass, profile: Profile2): Anchor[] {
  const dz = homeDungeonRegion(home);
  const sA = seedInt(seed, 'g2-anchor'), sShaft = seedInt(seed, 'g2-shaft');
  const sp = home.x0 + SPAWN_X - HOME_X0, dWest = dz.x1 <= sp;
  const u = (k: number, n: number): number => hash2(k, n, sA);
  const out: Anchor[] = [];
  const taken = new Set<string>();
  const key = (r: RegionInfo, layer: Layer, q: number): string => `${r.index}:${layer}:${q}`;
  const regions = home.regions.filter((r) => r.variant !== VARIANT.BEACH && r.variant !== VARIANT.DUNGEON);

  // 某層還空著、不碰出生點清空區、keep 成立、放得下 kind 外框的槽（依 x 序）：先回不含坑道的，沒有才回含坑道的
  const free = (kind: AnchorKind, layer: Layer, keep: (s: Slot) => boolean = () => true): Slot[] => {
    const { plain, shafted } = split(kind, layer, keep);
    return plain.length ? plain : shafted;
  };
  const split = (kind: AnchorKind, layer: Layer, keep: (s: Slot) => boolean): { plain: Slot[]; shafted: Slot[] } => {
    const need = ANCHOR_MAX_W[kind];
    if (need === undefined) throw new RangeError(`gen2: anchor kind ${kind} has no max width`);
    const plain: Slot[] = [], shafted: Slot[] = [];
    for (const r of regions) {
      const sx = shaftX(sShaft, r);
      for (let q = 0; q < landSlotCount(r, layer); q++) {
        const sl = landSlot(r, q, layer), s: Slot = { r, layer, q, x0: sl.x0, x1: sl.x1, mid: (sl.x0 + sl.x1) / 2 };
        if (taken.has(key(r, layer, q)) || touchesSpawnClear(sl.x0, sl.x1, sp) || !keep(s)) continue;
        const room = spanOf(sl, sx);
        if (room.x1 - room.x0 - 2 * SLOT_PAD < need) continue;
        (room.shaft ? shafted : plain).push(s);
      }
    }
    return { plain, shafted };
  };
  const add = (kind: AnchorKind, s: Slot | undefined): Slot => {
    if (!s) throw new RangeError(`gen2: home has no slot for anchor ${kind}`);
    taken.add(key(s.r, s.layer, s.q));
    out.push({ kind, region: s.r, layer: s.layer, slot: s.q });
    return s;
  };
  // 離 x 最近的（平手取 x 序在前的）
  const nearest = (list: readonly Slot[], x: number): Slot | undefined => {
    let best: Slot | undefined;
    for (const s of list) if (!best || Math.abs(s.mid - x) < Math.abs(best.mid - x)) best = s;
    return best;
  };
  // 依雜湊挑一個（k = 這條規則的雜湊鍵）
  const hashed = (list: readonly Slot[], k: number): Slot | undefined => (list.length ? list[Math.floor(u(k, list.length) * list.length)] : undefined);
  const far = (s: Slot, d: number): boolean => Math.abs(s.mid - sp) >= d;
  const biome = (b: number) => (s: Slot): boolean => s.r.biome === b;

  // 選取順序：每層先選限制多的（回傳時再依 ORDER 排）
  // 表層
  out.push({ kind: 'dungeon', region: dz, layer: BP_SURFACE, slot: 0, wholeRegion: true });
  // 村莊的中心（structures/village.ts：bpcore.centerAway）離出生點要 > VILLAGE_MIN：含坑道的槽只給一側，置中可能太近，
  // 最寬的村莊在可用範圍內往外移也做不到的槽不放（Task 9）
  const villageOk = (s: Slot): boolean => s.r.biome === BIOME.FOREST
    && (s.r.variant === VARIANT.PLAIN || s.r.variant === VARIANT.HILLS || s.r.variant === VARIANT.SPAWN) && far(s, VILLAGE_MIN)
    && villageFits(spanOf(s, shaftX(sShaft, s.r)), sp);
  const touch = (a: Slot, b: Slot): boolean => a.x0 <= b.x1 && b.x0 <= a.x1;
  const vfree = (keep: (s: Slot) => boolean): Slot[] => free('village', BP_SURFACE, (s) => villageOk(s) && keep(s));
  // 第 1 座：西側最接近 sp − 950（西側沒有 → 全家鄉）；第 2 座：東側最接近 sp + 950（東側沒有 → 全家鄉、不與第 1 座相鄰；
  // 剩下的槽都與第 1 座相鄰才取相鄰的——外框各離槽邊 ≥ 8，兩座仍不相交）
  const v1 = add('village', nearest(vfree((s) => s.mid < sp), sp - VILLAGE_AIM) ?? nearest(vfree(() => true), sp - VILLAGE_AIM));
  const v2 = add('village', nearest(vfree((s) => s.mid > sp), sp + VILLAGE_AIM) ?? nearest(vfree((s) => !touch(s, v1)), sp + VILLAGE_AIM)
    ?? nearest(vfree(() => true), sp + VILLAGE_AIM));
  const villages = [v1, v2];
  // 總數 2 / 3 / 4（15% / 60% / 25%）：補到擲出的數；只有家鄉放得下村莊的槽（含坑道槽的備案）真的用完才停（前 2 座已保證，否則上面丟錯）
  const hv = u(1, 0), nVillage = hv < 0.15 ? 2 : hv < 0.75 ? 3 : 4;
  while (villages.length < nVillage) {
    // 剩下合格槽中離已選村莊最遠的（離最近一座的距離最大；平手取 x 序在前的）
    let best: Slot | undefined, bestD = -1;
    for (const s of vfree(() => true)) {
      const d = Math.min(...villages.map((v) => Math.abs(v.mid - s.mid)));
      if (d > bestD) { best = s; bestD = d; }
    }
    if (!best) break;
    villages.push(add('village', best));
  }
  add('ruin', hashed(free('ruin', BP_SURFACE, (s) => s.r.biome !== BIOME.SNOW), 2));

  // 深層：地廳先選（第 1 座只能在最外側那個地區，要整槽 170 格）。第 1 座 = 非地城那一端的外圍生態地區、離家鄉端點最近的槽；
  // 第 2 座（2/3 機率）= 地城側、最接近 sp ∓ 1200、與第 1 座相距 ≥ 840
  const outer = dWest ? home.regions[home.regions.length - 2] : home.regions[1];
  const h1 = add('hall', nearest(free('hall', BP_DEEP, (s) => s.r === outer), dWest ? home.x1 : home.x0));
  if (u(3, 0) < 2 / 3) {
    add('hall', nearest(free('hall', BP_DEEP, (s) => (dWest ? s.mid < sp : s.mid > sp) && Math.abs(s.mid - h1.mid) >= HALL_GAP), dWest ? sp - HALL_AIM : sp + HALL_AIM));
  }
  // shaft_cache = 家鄉主坑道最深（shaft.bottom 最大）的地區、坑道所在那一槽（深層不受「坑道槽不放藍圖」限制；不看寬度）；
  // 那一槽已被地廳佔走時取次深的
  const deepest = regions.map((r) => ({ r, sh: shaftOf(sShaft, r, (x) => profile.surfaceAt(x), (x) => profile.layersAt(x).deep) }))
    .filter((e) => e.sh !== null).sort((p, q) => q.sh!.bottom - p.sh!.bottom || p.r.x0 - q.r.x0);
  let cache: Slot | undefined;
  for (const { r, sh } of deepest) {
    const q = Math.min(landSlotCount(r, BP_DEEP) - 1, Math.floor((sh!.sx - r.x0) / SUB_SLOT_W)), sl = landSlot(r, q, BP_DEEP);
    if (!taken.has(key(r, BP_DEEP, q)) && !touchesSpawnClear(sl.x0, sl.x1, sp)) { cache = { r, layer: BP_DEEP, q, x0: sl.x0, x1: sl.x1, mid: (sl.x0 + sl.x1) / 2 }; break; }
  }
  add('shaft_cache', cache);
  add('molten_shrine', hashed(free('molten_shrine', BP_DEEP, (s) => far(s, MOLTEN_MIN)), 4));
  add('crystal_cave', hashed(free('crystal_cave', BP_DEEP), 5));

  // 地下層：小屋 = 離出生點最近的兩槽
  for (let k = 0; k < 2; k++) add('cabin', nearest(free('cabin', BP_UNDER), sp));
  // 先挑要整槽的礦坑密室（寬 154 + 邊距 = 170；每一座只在「挑了之後剩下的還湊得滿 3 座」的槽裡挑），再來生態限定的小結構
  // （放得進含坑道槽的一側，沒有不含坑道的槽時退過去）、蘑菇林，最後地下湖。
  // 雜湊挑法可能把後面的種類擠到沒槽：這一組整組重挑（第 t 次用雜湊鍵 + 100t），UNDER_TRIES 次都不行才丟 RangeError
  const mark = out.length, takenBefore = new Set(taken);
  for (let t = 0; ; t++) {
    const o = 100 * t;
    try {
      const secrets: Slot[] = [];
      for (let k = 0; k < 3; k++) {
        const { plain, shafted } = split('mineshaft_secret', BP_UNDER, (q) => far(q, SECRET_MIN) && secrets.every((p) => Math.abs(p.mid - q.mid) >= SECRET_GAP));
        // 挑 q 之後，剩下的（含坑道的槽也算，之後的挑選會退到它們）還湊得滿
        const all = [...plain, ...shafted].sort((p, q) => p.mid - q.mid);
        const viable = (q: Slot): boolean => spacedCount(all.filter((p) => Math.abs(p.mid - q.mid) >= SECRET_GAP), SECRET_GAP) >= 2 - k;
        const pv = plain.filter(viable);
        secrets.push(add('mineshaft_secret', hashed(pv.length ? pv : shafted.filter(viable), 11 + k + o)));
      }
      add('alcove_snow', hashed(free('alcove_snow', BP_UNDER, biome(BIOME.SNOW)), 6 + o));
      add('alcove_desert', hashed(free('alcove_desert', BP_UNDER, biome(BIOME.DESERT)), 7 + o));
      add('hive', hashed(free('hive', BP_UNDER, biome(BIOME.JUNGLE)), 8 + o));
      add('mushroom_biome', hashed(free('mushroom_biome', BP_UNDER, biome(BIOME.FOREST)), 9 + o));
      add('cave_lake', hashed(free('cave_lake', BP_UNDER), 10 + o));
      break;
    } catch (e) {
      if (!(e instanceof RangeError) || t + 1 >= UNDER_TRIES) throw e;
      out.length = mark; taken.clear(); for (const k of takenBefore) taken.add(k);
    }
  }

  // 天空：兩座空島
  for (let k = 0; k < 2; k++) add('sky_island', hashed(free('sky_island', BP_SKY, (s) => far(s, SKY_MIN)), 14 + k));
  // 小點位：出生點東側第一個槽
  add('spawn_tablet', free('spawn_tablet', BP_MINOR, (s) => s.x0 > sp)[0]);

  // Array.prototype.sort 是穩定排序：同種保持選取順序
  return out.sort((p, q) => ORDER.indexOf(p.kind) - ORDER.indexOf(q.kind));
}

// 大陸錨點：Task 18 實作（keep / hermit_hut 等）
export function continentAnchors(_seed: string, _m: Landmass, _profile: Profile2): Anchor[] {
  return [];
}
