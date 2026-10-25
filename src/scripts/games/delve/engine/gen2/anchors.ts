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
import { COL_LAND, type Profile2 } from './profile';
import { shaftOf, shaftX } from './caves';
import { entranceHit } from '../genPrims';
import { BP_SURFACE, BP_UNDER, BP_DEEP, BP_SKY, BP_MINOR, SUB_SLOT_W, SLOT_PAD, VILLAGE_MIN, bandFreeSpan, centerAway, type Span, landSlot, landSlotCount, touchesSpawnClear, type Blueprint, type BpCtx, type Layer } from './bpcore';
import { SLOPE, VILLAGE_VW } from './structures/village';
import { ALCOVE_MAX_W, MOLTEN_MAX_W } from './structures/shrine';

export type AnchorKind = 'dungeon' | 'village' | 'hall' | 'mineshaft_secret' | 'sky_island' | 'mushroom_biome' | 'crystal_cave' | 'hive'
  | 'cave_lake' | 'ruin' | 'cabin' | 'alcove_snow' | 'alcove_desert' | 'molten_shrine' | 'shaft_cache' | 'spawn_tablet' | 'keep' | 'hermit_hut'
  // 只給測試注入（Q8）：homeAnchors / continentAnchors 永遠不產生、正式碼永遠不登錄建構器
  | 'test_probe';
// wholeRegion：佔滿整個地區（家鄉地城，Q2）——外框可以超出自己的槽，overlapping 對任何與地區相交的查詢都找得到它。
// avoid：可用範圍（anchorSpan）另外要避開的 x 區間（家鄉空島避開下方地廳 / 礦坑密室的槽，Task 10）。理由：家鄉的天空槽不夠，
// 整槽避開地廳時 1000 個種子有 26% 放不下兩座空島；改成只避開下方那個 170 格槽，0 個失敗
export interface Anchor { kind: AnchorKind; region: RegionInfo; layer: Layer; slot: number; wholeRegion?: boolean; avoid?: readonly Span[] }

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
const VILLAGE_AIM = 950, HALL_AIM = 1200, HALL_GAP = 840, SECRET_MIN = 160, SKY_MIN = 250, MOLTEN_MIN = 630;
// 礦坑密室彼此至少 2 槽；地下層那一組的重挑次數
const SECRET_GAP = 2 * SUB_SLOT_W, UNDER_TRIES = 8;

// 各錨點種類的建構器外框最大寬（錨點建構器的契約：外框寬不得超過這個值）。選槽時可用寬度（見 anchorSpan）− 兩側 SLOT_PAD 必須 ≥ 它。
// 來源：已存在的建構器照實際亂數範圍（HRng.int 是 [lo, hi)）；還沒寫的照計畫的規格（Task 9 / 10 / 11 / 14）：
//   village 91 = vw 上限 73 + 兩側坡地各 9（外框 x0 − 9 .. x1 + 9，Task 4 延續事項）；ruin 20 = w 上限 18 + 2（structures/ruin.ts）；
//   cabin 75 = tl 30 + w 15 + tr 30（structures/cabin.ts）；cave_lake 65 = 2 × rx 上限 30 + 1 + 2 × 殼 2（structures/lakes.ts）；
//   hall 154 = Task 9「外框 ≤ 154 = 170 − 16」；mineshaft_secret 154 = Q3 總寬上限；sky_island 48 = 島寬 30–48（Task 10）；
//   mushroom_biome 145、crystal_cave 125、hive 48 = 整個外框（含接洞隧道）的寬度上限（structures/miniBiome.ts 的 MUSHROOM_MAX_W / CRYSTAL_MAX_W、
//   structures/hive.ts 的 HIVE_MAX_W；橢圓本身最寬 2 × 70 + 1 = 141 / 2 × 60 + 1 = 121 / 2 × 15 + 1 + 2 × 3 = 37，隧道只能在上限內延伸；
//   後備的直豎井只加高、不加寬。hive 在 Task 11 從 37 放寬：蜂巢的殼是封閉的，一定要挖隧道或豎井接洞穴）；
//   alcove 41 / molten_shrine 61 = 9 × 5 石室 + 兩側接洞的隧道各最多 16 欄 / 13 × 7 熔岩祭壇 + 各 24 欄（structures/shrine.ts 的 ALCOVE_MAX_W / MOLTEN_MAX_W；
//   Task 14：小室一定要走得進去，原本的 9 / 15 放不下隧道）；spawn_tablet 12：小點位的寬 ≤ 12（實際外框 7 = 石碑 ± 3）。
// dungeon（wholeRegion）與 shaft_cache（刻意在坑道底）不受這個限制
export const ANCHOR_MAX_W: Readonly<Partial<Record<AnchorKind, number>>> = {
  village: 91, ruin: 20, cabin: 75, cave_lake: 65, hall: 154, mineshaft_secret: 154, sky_island: 48,
  mushroom_biome: 145, crystal_cave: 125, hive: 48, alcove_snow: ALCOVE_MAX_W, alcove_desert: ALCOVE_MAX_W, molten_shrine: MOLTEN_MAX_W, spawn_tablet: 12,
  // 只給測試（BlueprintIndex 的執行期寬度檢查）
  test_probe: 60,
};

// 錨點的可用範圍（bpcore.bandFreeSpan，BlueprintIndex 的家鄉含坑道槽礦坑共用）：槽扣掉該地區主坑道的坑道帶（bpcore.shaftBand，與 placeX 同一個；鄰槽的坑道帶也可能伸進來）與 a.avoid 的區間後
// 最寬的那一段（平手取左邊的；都碰不到槽 → 整槽）；shaft = 槽含 shaftX（選槽時排在不含坑道的槽之後）。
// wholeRegion → 整個地區；shaft_cache → 整槽（刻意蓋在坑道底）。BlueprintIndex 把它當成建構器的 slotX0 / slotX1
export function anchorSpan(seed: string, a: Anchor): { x0: number; x1: number; shaft: boolean } {
  if (a.wholeRegion) return { x0: a.region.x0, x1: a.region.x1, shaft: false };
  return bandFreeSpan(landSlot(a.region, a.slot, a.layer), a.kind === 'shaft_cache' ? NaN : shaftX(seedInt(seed, 'g2-shaft'), a.region), a.avoid);
}
// 村莊（外框最寬 ANCHOR_MAX_W.village）放得進可用範圍、中心離出生點 sp > VILLAGE_MIN（寬度越窄越好放，所以最寬的放得下就都放得下）
export function villageFits(span: { x0: number; x1: number }, sp: number): boolean {
  return centerAway(span.x0, span.x1, ANCHOR_MAX_W.village!, sp, VILLAGE_MIN) !== null;
}

interface Slot { r: RegionInfo; layer: Layer; q: number; x0: number; x1: number; mid: number }

// 表層錨點（村莊 / 遺跡）外框可能的 x 範圍（空島退讓鏈、小生態選槽偏好、BlueprintIndex 給家鄉 UNDER / DEEP 錨點的 surfaceBan 共用）：
// 村莊 = 每個寬度 W（structures/village.ts：vw + 2 × SLOPE）用 centerAway 置中的外框聯集（sp = 出生點）；
// 遺跡 = placeX 的三個候選中心（mid、mid − q、mid + q）各 ± 遺跡最寬的一半（ANCHOR_MAX_W.ruin；遺跡只會落在其中一個）；
// 可用範圍太窄（< 3 × 最寬）時 placeX 可能夾進槽裡，直接整段
export function surfaceAnchorRanges(seed: string, a: Anchor, sp: number): Span[] {
  const span = anchorSpan(seed, a);
  if (a.kind === 'village') {
    let x0 = Infinity, x1 = -Infinity;
    for (let vw = VILLAGE_VW[0]; vw < VILLAGE_VW[1]; vw++) {
      const W = vw + 2 * SLOPE, x = centerAway(span.x0, span.x1, W, sp, VILLAGE_MIN);
      if (x !== null) { x0 = Math.min(x0, x); x1 = Math.max(x1, x + W); }
    }
    return [Number.isFinite(x0) ? { x0, x1 } : { x0: span.x0, x1: span.x1 }];
  }
  const rw = ANCHOR_MAX_W.ruin!, half = rw >> 1, sw = span.x1 - span.x0, mid = span.x0 + (sw >> 1), q = Math.floor(sw / 4);
  if (sw < 3 * rw + 2 * SLOT_PAD) return [{ x0: span.x0, x1: span.x1 }];
  return [mid - q, mid, mid + q].map((m) => ({ x0: m - half, x1: m + half }));
}

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
  const sA = seedInt(seed, 'g2-anchor'), sShaft = seedInt(seed, 'g2-shaft'), sEnt = seedInt(seed, 'g2-entrance');
  const sp = home.x0 + SPAWN_X - HOME_X0, dWest = dz.x1 <= sp;
  const u = (k: number, n: number): number => hash2(k, n, sA);
  const out: Anchor[] = [];
  const taken = new Set<string>();
  const key = (r: RegionInfo, layer: Layer, q: number): string => `${r.index}:${layer}:${q}`;
  const regions = home.regions.filter((r) => r.variant !== VARIANT.BEACH && r.variant !== VARIANT.DUNGEON);

  // 某層還空著、不碰出生點清空區、keep 成立、放得下 kind 外框的槽（依 x 序）：先回不含坑道的，沒有才回含坑道的
  // avoid(s) = 這個槽的可用範圍另外要避開的區間（Anchor.avoid）
  type Avoid = (s: Slot) => Span[];
  const free = (kind: AnchorKind, layer: Layer, keep: (s: Slot) => boolean = () => true, avoid?: Avoid): Slot[] => {
    const { plain, shafted } = split(kind, layer, keep, avoid);
    return plain.length ? plain : shafted;
  };
  const split = (kind: AnchorKind, layer: Layer, keep: (s: Slot) => boolean, avoid?: Avoid): { plain: Slot[]; shafted: Slot[] } => {
    const need = ANCHOR_MAX_W[kind];
    if (need === undefined) throw new RangeError(`gen2: anchor kind ${kind} has no max width`);
    const plain: Slot[] = [], shafted: Slot[] = [];
    for (const r of regions) {
      const sx = shaftX(sShaft, r);
      for (let q = 0; q < landSlotCount(r, layer); q++) {
        const sl = landSlot(r, q, layer), s: Slot = { r, layer, q, x0: sl.x0, x1: sl.x1, mid: (sl.x0 + sl.x1) / 2 };
        if (taken.has(key(r, layer, q)) || touchesSpawnClear(sl.x0, sl.x1, sp) || !keep(s)) continue;
        const room = bandFreeSpan(sl, sx, avoid?.(s));
        if (room.x1 - room.x0 - 2 * SLOT_PAD < need) continue;
        (room.shaft ? shafted : plain).push(s);
      }
    }
    return { plain, shafted };
  };
  const add = (kind: AnchorKind, s: Slot | undefined, avoid?: Avoid): Slot => {
    if (!s) throw new RangeError(`gen2: home has no slot for anchor ${kind}`);
    taken.add(key(s.r, s.layer, s.q));
    const av = avoid?.(s) ?? [];
    out.push(av.length ? { kind, region: s.r, layer: s.layer, slot: s.q, avoid: av } : { kind, region: s.r, layer: s.layer, slot: s.q });
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
    && villageFits(bandFreeSpan(s, shaftX(sShaft, s.r)), sp);
  const touch = (a: Slot, b: Slot): boolean => a.x0 <= b.x1 && b.x0 <= a.x1;
  // 兩槽的 x 範圍相交（半開區間）
  const overX = (a: Slot, b: Slot): boolean => a.x0 < b.x1 && b.x0 < a.x1;
  const vfree = (keep: (s: Slot) => boolean): Slot[] => free('village', BP_SURFACE, (s) => villageOk(s) && keep(s));
  // 表層槽 s（天空與表層同槽寬、同序號）上的村莊 / 遺跡錨點外框可能的 x 範圍（空島退讓鏈用）：村莊 = 每個寬度 W（structures/village.ts：
  // vw + 2 × SLOPE）用 centerAway 置中的外框聯集；遺跡 = placeX 三個候選中心 ± 遺跡最寬的一半（ANCHOR_MAX_W.ruin），聯集 = [mid − q − 10, mid + q + 10)
  const surfaceAvoid = (s: Slot): Span[] => {
    const a = out.find((q) => q.layer === BP_SURFACE && q.region === s.r && q.slot === s.q);
    return !a || a.wholeRegion ? [] : surfaceAnchorRanges(seed, a, sp);
  };
  // 第 1 座：西側最接近 sp − 950（西側沒有 → 全家鄉）；第 2 座：東側最接近 sp + 950（東側沒有 → 全家鄉、不與第 1 座相鄰；
  // 剩下的槽都與第 1 座相鄰才取相鄰的——外框各離槽邊 ≥ 8，兩座仍不相交）
  const v1 = add('village', nearest(vfree((s) => s.mid < sp), sp - VILLAGE_AIM) ?? nearest(vfree(() => true), sp - VILLAGE_AIM));
  const v2 = add('village', nearest(vfree((s) => s.mid > sp), sp + VILLAGE_AIM) ?? nearest(vfree((s) => !touch(s, v1)), sp + VILLAGE_AIM)
    ?? nearest(vfree(() => true), sp + VILLAGE_AIM));
  const villages = [v1, v2];
  // 總數 2 / 3 / 4（15% / 60% / 25%）：補到擲出的數；家鄉放得下村莊的槽（含坑道槽的備案）用完、或補了之後天空合格槽（下面空島的
  // 第一順位：離出生點 ≥ SKY_MIN、同序號的表層槽沒有錨點、放得下空島）剩不到 2 個就停在 2 或 3 座（Task 11 修正 1：村莊擲到 4 座吃光天空槽，
  // rg-74 等種子兩座空島放不下 → 開機 RangeError；spec 只要求 2–4 座）。前 2 座已保證，否則上面丟錯
  const skyLeft = (extra: Slot): number => {
    const { plain, shafted } = split('sky_island', BP_SKY, (s) => far(s, SKY_MIN) && !taken.has(key(s.r, BP_SURFACE, s.q)) && !(s.r === extra.r && s.q === extra.q));
    return plain.length + shafted.length;
  };
  const hv = u(1, 0), nVillage = hv < 0.15 ? 2 : hv < 0.75 ? 3 : 4;
  while (villages.length < nVillage) {
    // 剩下合格槽中離已選村莊最遠的（離最近一座的距離最大；平手取 x 序在前的）
    let best: Slot | undefined, bestD = -1;
    for (const s of vfree(() => true)) {
      const d = Math.min(...villages.map((v) => Math.abs(v.mid - s.mid)));
      if (d > bestD) { best = s; bestD = d; }
    }
    if (!best || skyLeft(best) < 2) break;
    villages.push(add('village', best));
  }
  add('ruin', hashed(free('ruin', BP_SURFACE, (s) => s.r.biome !== BIOME.SNOW), 2));
  // 表層錨點（村莊 / 遺跡）外框可能的 x 範圍：三種小生態錨點優先挑正上方碰不到它們的槽（接不上洞穴時的直豎井會挖到地表，Task 11 修正 1），
  // 挑不到才退讓（下面各自的退讓鏈）
  const surfRanges: Span[] = out.filter((a) => a.layer === BP_SURFACE && !a.wholeRegion).flatMap((a) => {
    const sl = landSlot(a.region, a.slot, BP_SURFACE);
    return surfaceAvoid({ r: a.region, layer: BP_SURFACE, q: a.slot, x0: sl.x0, x1: sl.x1, mid: (sl.x0 + sl.x1) / 2 });
  });
  const clearAbove = (s: Slot): boolean => surfRanges.every((v) => v.x1 <= s.x0 || v.x0 >= s.x1);

  // 深層：地廳先選（第 1 座只能在最外側那個地區，要整槽 170 格）。第 1 座 = 非地城那一端的外圍生態地區、離家鄉端點最近的槽；
  // 第 2 座（2/3 機率）= 地城側、最接近 sp ∓ 1200、與第 1 座相距 ≥ 840
  const outer = dWest ? home.regions[home.regions.length - 2] : home.regions[1];
  const h1 = add('hall', nearest(free('hall', BP_DEEP, (s) => s.r === outer), dWest ? home.x1 : home.x0)), halls = [h1];
  if (u(3, 0) < 2 / 3) {
    halls.push(add('hall', nearest(free('hall', BP_DEEP, (s) => (dWest ? s.mid < sp : s.mid > sp) && Math.abs(s.mid - h1.mid) >= HALL_GAP), dWest ? sp - HALL_AIM : sp + HALL_AIM)));
  }
  // 地廳的後備豎井（structures/hall.ts）讓地廳外框從地表一路到地廳：礦坑密室與空島不放在地廳的槽上方（Task 10；理由：後備豎井一出現，上方的錨點就跨層相交 → RangeError；礦坑密室湊不滿時才退讓，見下）
  const offHalls = (s: Slot): boolean => halls.every((h) => !overX(s, h));
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
  // 水晶洞：外框頂到 deep − 36，地下層錨點裡礦坑密室（往下接洞的豎井到 deep 線附近，Task 10）、蜂巢（外框底到 deep + 33）、小屋（頂 y 可到 molten − 30）
  // 都碰得到它（地下層與深層同槽寬 SUB_SLOT_W、同序號：(地區, q) 在兩層是同一段 x）。錨點與錨點跨層相交 = RangeError（1500 個種子實測不避開時 4 個開機失敗），
  // 所以水晶洞那一槽的正上方不放地下層錨點（那一槽的地下層只有機率藍圖，它們讓位給錨點）。兩段式（Task 11）：
  //   ① 照原本的順序選完地下層，水晶洞再挑正上方沒有地下層錨點的槽（先挑森林：生態限定錨點的地區通常只有 2–3 槽）；
  //   ② ① 沒有槽（6000 個種子約 2.7%）→ 整段重來：先挑水晶洞、把正上方的地下層槽標成已佔，再選地下層。
  // ① 優先的理由：② 少一個地下層槽，礦坑密室換位置後空島（避開密室的槽）偶爾放不下（1500 個種子 2 個），① 的地下層與空島和 Task 10 完全一樣
  const crys = (keep: (s: Slot) => boolean): Slot | undefined => hashed(free('crystal_cave', BP_DEEP, keep), 5);
  const pickCrystal = (keep: (s: Slot) => boolean): Slot | undefined =>
    crys((s) => s.r.biome === BIOME.FOREST && clearAbove(s) && keep(s)) ?? crys((s) => clearAbove(s) && keep(s))
    ?? crys((s) => s.r.biome === BIOME.FOREST && keep(s)) ?? crys(keep);
  const markPhase = out.length, takenPhase = new Set(taken);
  let secrets: Slot[] = [], minis: Slot[] = [], alcoves: Slot[] = [];
  for (const reserve of [false, true]) {
    try {
      minis = [];
      if (reserve) { const cr = add('crystal_cave', pickCrystal(() => true)); taken.add(key(cr.r, BP_UNDER, cr.q)); minis.push(cr); }
      // 地下層：小屋 = 離出生點最近的兩槽。Task 14 起小屋錨點有建構器（頂 y 可到 molten − 30，地廳的外框頂 ≥ deep + 23）：
      // 先挑不在地廳的槽上方的（錨點跨層相交 = RangeError），沒有才不避
      const cabins: Slot[] = [];
      for (let k = 0; k < 2; k++) cabins.push(add('cabin', nearest(free('cabin', BP_UNDER, offHalls), sp) ?? nearest(free('cabin', BP_UNDER), sp)));
      // 先挑要整槽的礦坑密室（寬 154 + 邊距 = 170；每一座只在「挑了之後剩下的還湊得滿 3 座」的槽裡挑），再來生態限定的小結構
      // （放得進含坑道槽的一側，沒有不含坑道的槽時退過去）、蘑菇林，最後地下湖。
      // 雜湊挑法可能把後面的種類擠到沒槽：這一組整組重挑（第 t 次用雜湊鍵 + 100t），UNDER_TRIES 次都不行才丟 RangeError。
      // 礦坑密室先不放在地廳的槽上方（strict）；整組 UNDER_TRIES 次都湊不滿才放寬（那時只有地廳走後備豎井才會相交，Task 9 實測 300 個種子 0 次）
      const mark = out.length, takenBefore = new Set(taken);
      under: for (const strict of [true, false]) for (let t = 0; t < UNDER_TRIES; t++) {
        const o = 100 * t;
        try {
          secrets = [];
          for (let k = 0; k < 3; k++) {
            const { plain, shafted } = split('mineshaft_secret', BP_UNDER, (q) => far(q, SECRET_MIN) && (!strict || offHalls(q)) && secrets.every((p) => Math.abs(p.mid - q.mid) >= SECRET_GAP));
            // 挑 q 之後，剩下的（含坑道的槽也算，之後的挑選會退到它們）還湊得滿
            const all = [...plain, ...shafted].sort((p, q) => p.mid - q.mid);
            const viable = (q: Slot): boolean => spacedCount(all.filter((p) => Math.abs(p.mid - q.mid) >= SECRET_GAP), SECRET_GAP) >= 2 - k;
            const pv = plain.filter(viable);
            secrets.push(add('mineshaft_secret', hashed(pv.length ? pv : shafted.filter(viable), 11 + k + o)));
          }
          // 石室（Task 14）接不上洞穴時的直豎井會往下挖到 deep 線：先挑不在地廳的槽上方的
          const alcove = (k: 'alcove_snow' | 'alcove_desert', b: number, h: number): Slot | undefined =>
            hashed(free(k, BP_UNDER, (s) => biome(b)(s) && offHalls(s)), h + o) ?? hashed(free(k, BP_UNDER, biome(b)), h + o);
          alcoves = [add('alcove_snow', alcove('alcove_snow', BIOME.SNOW, 6)), add('alcove_desert', alcove('alcove_desert', BIOME.DESERT, 7))];
          // 蜂巢的外框底到 deep + 33、地廳的外框頂 ≥ deep + 23：蜂巢不放在地廳的槽上方（Task 11）。蘑菇林的外框底 ≤ rock + 0.4 (deep − rock) + 69，
          // 碰不到地廳與熔岩祭壇（molten 附近）；shaft_cache（Task 14）在坑道帶內，地下層錨點的外框都避開坑道帶，碰不到它
          const hive = (keep: (s: Slot) => boolean): Slot | undefined => hashed(free('hive', BP_UNDER, (s) => s.r.biome === BIOME.JUNGLE && offHalls(s) && keep(s)), 8 + o);
          const hv = add('hive', hive(clearAbove) ?? hive(() => true));
          // 蘑菇林也不放在地廳的槽上方（地廳的後備豎井把外框拉到地表，Task 11 修正 1）；森林的地下層槽被吃光時依序退到叢林、任何地區、最後不避地廳
          const mush = (keep: (s: Slot) => boolean): Slot | undefined => hashed(free('mushroom_biome', BP_UNDER, keep), 9 + o);
          const mu = add('mushroom_biome', mush((s) => s.r.biome === BIOME.FOREST && offHalls(s) && clearAbove(s)) ?? mush((s) => s.r.biome === BIOME.FOREST && offHalls(s))
            ?? mush((s) => s.r.biome === BIOME.JUNGLE && offHalls(s)) ?? mush(offHalls) ?? mush(() => true));
          add('cave_lake', hashed(free('cave_lake', BP_UNDER), 10 + o));
          minis = [...minis.filter((q) => q.layer === BP_DEEP), hv, mu];
          break under;
        } catch (e) {
          if (!(e instanceof RangeError) || (!strict && t + 1 >= UNDER_TRIES)) throw e;
          out.length = mark; taken.clear(); for (const k of takenBefore) taken.add(k);
        }
      }
      if (!reserve) minis.push(add('crystal_cave', pickCrystal((s) => !taken.has(key(s.r, BP_UNDER, s.q)))));

      // 天空：兩座空島。空島的繩梯垂到地面（錨點跨層相交 = RangeError）：不放在表層錨點（村莊 / 遺跡）的同一槽（天空與表層同槽寬、同序號；
      // 那個表層槽也不擲機率，BlueprintIndex.build）；可用範圍避開下方地廳（後備豎井）與礦坑密室的 170 格槽（Anchor.avoid，剩下的一段要放得下）
      // 退讓鏈（Task 11 修正 1，不丟錯）：① 離出生點 ≥ SKY_MIN、表層同槽沒有錨點；② 不限 SKY_MIN；③ 允許表層同槽有村莊錨點，
      // 可用範圍另外避開村莊外框可能的 x 範圍（surfaceAvoid）；④ 遺跡錨點的槽也可以（同樣避開遺跡外框可能的範圍）
      // 也避開三種小生態錨點的槽：它們接不上洞穴時的直豎井會一路挖到地表（Task 11 修正 1；bx-3055 蜂巢的豎井撞到空島外框 → RangeError），
      // 豎井只在自己外框的欄裡，所以避開那個 170 格槽就碰不到
      // Task 14：小屋與石室錨點的直豎井也會通地表（它們的 surfaceBan 有空島的可用範圍，空島蓋住整槽時豎井無處可挖）：整條退讓鏈先連它們的槽一起避開，
      // 找不到才用只避開上面那幾種的同一條鏈（只用前者時 30,000 個種子約 0.05% 放不下空島）
      // rope = 可用範圍裡要有掛得了繩梯的欄（陸地欄、不是地表入口欄、離可用範圍兩端 ≥ SLOT_PAD + 4：空島的建構器會在整個可用範圍找接得到地面的繩梯欄；
      // 家鄉 anc-10 的可用範圍 68 欄有 58 欄是入口 → 沒有繩梯）；先挑有的，都沒有才不管
      const chain = (list: readonly Slot[], k: number, rope: boolean): { s: Slot | undefined; av: Avoid } => {
        const skyAvoid: Avoid = (s) => list.filter((b) => overX(s, b)).map((b) => ({ x0: b.x0, x1: b.x1 }));
        const skyAvoid2: Avoid = (s) => [...skyAvoid(s), ...surfaceAvoid(s)];
        const ropeable = (s: Slot, av: Avoid): boolean => {
          const sp = bandFreeSpan(s, shaftX(sShaft, s.r), av(s));
          for (let x = sp.x0 + SLOT_PAD + 4; x < sp.x1 - SLOT_PAD - 4; x++) if (profile.info(x).kind === COL_LAND && !entranceHit(x, sEnt)) return true;
          return false;
        };
        const pick = (keep: (s: Slot) => boolean, av: Avoid): Slot | undefined => hashed(free('sky_island', BP_SKY, (q) => keep(q) && (!rope || ropeable(q, av)), av), 14 + k);
        let av = skyAvoid, s = pick((q) => far(q, SKY_MIN) && !surfTaken(q), skyAvoid) ?? pick((q) => !surfTaken(q), skyAvoid);
        if (!s) { av = skyAvoid2; s = pick((q) => !surfTaken(q) || surfKind(q) === 'village', av) ?? pick((q) => !surfTaken(q) || surfKind(q) === 'village' || surfKind(q) === 'ruin', av); }
        return { s, av };
      };
      const below = [...halls, ...secrets, ...minis];
      const surfTaken = (s: Slot): boolean => taken.has(key(s.r, BP_SURFACE, s.q));
      const surfKind = (s: Slot): AnchorKind | undefined => out.find((a) => a.layer === BP_SURFACE && a.region === s.r && a.slot === s.q)?.kind;
      for (let k = 0; k < 2; k++) {
        let { s, av } = chain([...below, ...cabins, ...alcoves], k, true);
        if (!s) ({ s, av } = chain(below, k, true));
        if (!s) ({ s, av } = chain(below, k, false));
        add('sky_island', s, av);
      }
      break;
    } catch (e) {
      if (!(e instanceof RangeError) || reserve) throw e;
      out.length = markPhase; taken.clear(); for (const k of takenPhase) taken.add(k);
    }
  }
  // 小點位：出生點東側第一個槽
  add('spawn_tablet', free('spawn_tablet', BP_MINOR, (s) => s.x0 > sp)[0]);

  // Array.prototype.sort 是穩定排序：同種保持選取順序
  return out.sort((p, q) => ORDER.indexOf(p.kind) - ORDER.indexOf(q.kind));
}

// 大陸錨點：Task 18 實作（keep / hermit_hut 等）
export function continentAnchors(_seed: string, _m: Landmass, _profile: Profile2): Anchor[] {
  return [];
}
