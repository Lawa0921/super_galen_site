// shrine.ts — gen2 家鄉的石碑 / 遺物錨點（M2a Task 14；spec §4.4「14 塊燈脈石碑與 4 件遺物在初始之地」）：
//   · alcove（UNDER，雪原 / 沙漠地區各一座，anchors.ts）：y ∈ [rock, deep) 的 9 × 5 石室（石磚殼、石牆、室內 7 × 3、地板兩端各一個陶罐），
//     第 10 / 11 塊石碑（lore.homeDecor 依 variant 'snow' / 'desert'）。
//   · molten_shrine（DEEP，離出生點 ≥ 630）：y ∈ [molten + 8, LAVA_Y − 12) 的 13 × 7 玄武岩小室（玄武岩殼 / 牆、室內 11 × 5），
//     地板中央 3 格黑曜石台、台上 'relic' 箱（夜視護符，lore.homeDecor）、第 8 塊石碑。室內的格全由藍圖寫（熔岩帶的額外挖空碰不到，Task 12 延續事項）。
//   · shaft_cache（DEEP，家鄉主坑道最深的地區、坑道所在那一槽）：坑道底圓室（caves.shaftRoom）最低處 3 格石地板 + 'relic' 箱（疾行靴）；
//     圓室由 fill 的主坑道挖出，箱子從地表沿主坑道走得到。外框可能伸出自己的槽 ≤ SHAFT_REACH 欄（fill / extrasIn / objectsIn 都多查 FILL_REACH）。
//   · spawn_tablet（MINOR，出生點東側第一個與 ± 80 不相交的 MINOR 槽，anchors.ts / Q16）：槽內離出生點最近的平地欄（c.groundAt 左右兩欄同高、
//     陸地欄、不是地表入口欄、外框不碰 c.surfaceBan——同地區其他層的原始藍圖）的地表上一格放第 0 塊石碑；那格與頭頂那格寫空氣（清掉草）。
//     外框 = 石碑 ± 3 欄 × 兩列（fill 的樹不長在 MINOR 外框內，樹冠碰不到石碑上方；地表裝飾不放進部件）。都不是平地時取第一個其他條件都成立的欄。
// 石室 / 熔岩祭壇一定走得進去（控制者裁決，比照 Task 9–11）：室內接上外框外的天然洞穴（miniBiome.linksToCave）；接不上就從室內地板往兩側挖
// 4 列高的隧道（digTunnel，外框寬 ≤ ALCOVE_MAX_W / MOLTEN_MAX_W）；試完 x 候選（placeX 的順序）× y 候選（雜湊起點、OPEN_TRIES 個）都不行，
// 才挖 2 格寬、掛繩梯的直豎井（planShaft / digShaft，部件 = 石室 + 豎井那兩欄）：往上接洞穴 → 往下接洞穴（只有石室，不過 deep 線）→ 往上通地表（不碰 surfaceBan）。
// 熔岩祭壇不往下挖、天然洞穴探針在 LAVA_Y 以下算不通、室內與隧道的格都清掉液體：通道不碰 LAVA_Y、沿路沒有液體。
// 本資料夾的非測試檔不得出現連續兩個星號、亂數與超越函數（測試會 grep），註解一律用 //。
import { T, W, SOLID_LUT } from '../../tiles';
import { seedInt } from '../../noise';
import { entranceHit } from '../../genPrims';
import type { ColumnLayers } from '../../column';
import { HRng } from '../hrng';
import { shaftOf, shaftRoom } from '../caves';
import { COL_LAND, LAVA_Y } from '../profile';
import { BpGrid, placeX, clearRange, emptyObjects, boxHits, BP_UNDER, BP_DEEP, BP_MINOR, KEEP, SLOT_PAD, type Blueprint, type BpBox, type BpChest, type BpCtx, type Span } from '../bpcore';
import { digShaft, digTunnel, linksToCave, naturalOpen, planShaft, shaftPart, xCandidates, type MiniOptions, type ShaftCol, type ShaftEnv } from './miniBiome';

// 外框（含接洞的隧道）寬上限 = anchors.ANCHOR_MAX_W（石室 9 寬 + 隧道每側最多 16 欄；熔岩祭壇 13 寬 + 每側 24 欄）
export const ALCOVE_MAX_W = 41, MOLTEN_MAX_W = 61;
// y 候選數
const OPEN_TRIES = 8;
// 出生點石碑的外框半寬
const TABLET_HALF = 3;

// 錨點建構器的天然洞穴可注入（測試走後備豎井）
export type ShrineOptions = MiniOptions;

// 室內接外面的結果：新的格、外框 x 範圍 [x0, x1)、列範圍 [top, bottom)、部件（有豎井時）
interface Reach { g: BpGrid; x0: number; x1: number; top: number; bottom: number; parts?: BpBox[] }
// 一間小室要接外面需要的東西：box = 小室外框（grid 比它寬，隧道往兩側延伸用）；starts = 室內的起點；floorOf = 隧道可以從哪些地板格挖出去；
// up / down = 豎井候選欄（down 為 null = 不往下挖）
export interface RoomAccess {
  c: BpCtx; g: BpGrid; box: BpBox; starts: readonly (readonly [number, number])[]; floorOf: (x: number, y: number) => boolean;
  open: (x: number, y: number) => boolean; up: ShaftCol[]; down: ShaftCol[] | null; downLimit: (x: number) => number;
}

// 室內接上外面（Task 14；石室 / 熔岩祭壇 / 家鄉的小屋共用）：天然洞穴 → 隧道 → （force）豎井；都不行 → null
export function reachRoom(a: RoomAccess, force: boolean): Reach | null {
  const { c, g, box, open } = a, slot: Span = { x0: c.slotX0, x1: c.slotX1 };
  const pass = (x: number, y: number): boolean => { const t = g.getFg(x, y); return t === KEEP ? open(x, y) : SOLID_LUT[t] !== 1; };
  const plain = { g, x0: box.x, x1: box.x + box.w, top: box.y, bottom: box.y + box.h };
  if (linksToCave(box, slot, a.starts, pass, open)) return plain;
  const t = digTunnel(g, box, { x0: g.x, x1: g.x + g.w }, a.floorOf, pass, open, slot);
  if (t) return { ...plain, x0: t.x0, x1: t.x1 };
  if (!force) return null;
  const env: ShaftEnv = { box, slot, pass, open, surface: (x) => c.profile.surfaceAt(x), limit: a.downLimit, ban: c.surfaceBan ?? [] };
  const plan = planShaft(a.up, -1, false, env) ?? (a.down ? planShaft(a.down, 1, false, env) : null) ?? planShaft(a.up, -1, true, env);
  if (!plan) return null;
  const dug = digShaft(g, plan, (x, y) => g.getFg(x, y) === T.AIR, box.y + box.h);
  return { g: dug.g, x0: box.x, x1: box.x + box.w, top: dug.y0, bottom: dug.y1, parts: [{ x: box.x, y: box.y, w: box.w, h: box.h }, shaftPart(plan)] };
}

// 站得住的格（Blueprint.floors）：那格與頭頂那格是畫了的空氣、腳下是畫了的實心、沒有液體
export function gridFloors(g: BpGrid, x0: number, x1: number, y: number): { x: number; y: number }[] {
  const out: { x: number; y: number }[] = [];
  for (let x = x0; x < x1; x++) {
    if (g.getFg(x, y) === T.AIR && g.getFg(x, y - 1) === T.AIR && g.getLiq(x, y) <= 0 && SOLID_LUT[g.getFg(x, y + 1)] === 1 && g.getFg(x, y + 1) !== KEEP) out.push({ x, y });
  }
  return out;
}

interface RoomSpec {
  kind: 'alcove' | 'molten_shrine'; layer: typeof BP_UNDER | typeof BP_DEEP; w: number; h: number; maxW: number;
  // 第 x 欄（層線 I）小室頂 y 的 [下限, 上限]（整間取各欄最緊的）
  span: (I: ColumnLayers) => [number, number];
  shell: number; wall: number; variant?: string;
  // 室內的擺設（畫在 g 上）：回傳箱子；floors 的候選欄 = 室內地板那一列扣掉 skip(x)
  furnish: (g: BpGrid, x0: number, y0: number) => BpChest[];
  skip: (x: number, x0: number) => boolean;
  down: boolean;
}

const ALCOVE = (tag: 'snow' | 'desert'): RoomSpec => ({
  kind: 'alcove', layer: BP_UNDER, w: 9, h: 5, maxW: ALCOVE_MAX_W, variant: tag, shell: T.STONE_BRICK, wall: W.STONE_WALL,
  // 頂 ≥ rock、底（頂 + 4）< deep
  span: (I) => [I.rock, I.deep - 5],
  furnish: (g, x0, y0) => { g.fg(x0 + 1, y0 + 3, T.POT); g.fg(x0 + 7, y0 + 3, T.POT); return []; },
  skip: (x, x0) => x === x0 + 1 || x === x0 + 7, down: true,
});
const MOLTEN: RoomSpec = {
  kind: 'molten_shrine', layer: BP_DEEP, w: 13, h: 7, maxW: MOLTEN_MAX_W, shell: T.BASALT, wall: W.BASALT_WALL,
  // 頂 ≥ molten + 8、底（頂 + 6）< LAVA_Y − 12
  span: (I) => [I.molten + 8, LAVA_Y - 19],
  furnish: (g, x0, y0) => {
    for (let x = x0 + 5; x <= x0 + 7; x++) g.fg(x, y0 + 5, T.OBSIDIAN);
    g.fg(x0 + 6, y0 + 4, T.CHEST);
    return [{ x: x0 + 6, y: y0 + 4, kind: 'relic' }];
  },
  // 黑曜石台與它兩側緊鄰箱子的欄
  skip: (x, x0) => x >= x0 + 5 && x <= x0 + 7, down: false,
};

export function buildAlcoveBp(c: BpCtx, tag: 'snow' | 'desert', o: ShrineOptions = {}): Blueprint { return room(c, ALCOVE(tag), o); }
export function buildMoltenShrineBp(c: BpCtx, o: ShrineOptions = {}): Blueprint { return room(c, MOLTEN, o); }

// ctx.ver 0 的規則
function room(c: BpCtx, sp: RoomSpec, o: ShrineOptions): Blueprint {
  const p = c.profile, rng = new HRng(c.s, c.id), fy = rng.next(), open = naturalOpen(c, o);
  const { w, h } = sp;
  const spanAt = (bx: number): { lo: number; hi: number } => {
    let lo = -1, hi = p.height;
    for (let x = bx; x < bx + w; x++) { const [a, b] = sp.span(p.layersAt(x)); lo = Math.max(lo, a); hi = Math.min(hi, b); }
    return { lo, hi };
  };
  const ys = (bx: number): number[] => {
    const { lo, hi } = spanAt(bx);
    if (hi < lo) return [lo];
    const out: number[] = [];
    for (let t = 0; t < OPEN_TRIES; t++) { const f = fy + t * 0.381966, y = lo + Math.floor((f - Math.floor(f)) * (hi - lo + 1)); if (!out.includes(y)) out.push(y); }
    return out;
  };
  // 外框 x = bx、頂 y = y0 的小室：force = 接不上時挖豎井
  const draw = (bx: number, y0: number, force: boolean): Blueprint | null => {
    const room = clearRange(c, bx, w), gx0 = Math.max(room.x0, bx + w - sp.maxW), gx1 = Math.min(room.x1, bx + sp.maxW);
    // 格子多開小室上方一列（KEEP）：隧道 4 列高、地板在底，石室室內只有 3 列，隧道頂那列是石室的頂殼（miniBiome.digTunnel 要外框至少 TUNNEL_H + 2 列）
    const g = new BpGrid(Math.min(gx0, bx), y0 - 1, Math.max(gx1, bx + w) - Math.min(gx0, bx), h + 1);
    for (let y = y0; y < y0 + h; y++) for (let x = bx; x < bx + w; x++) {
      const shell = y === y0 || y === y0 + h - 1 || x === bx || x === bx + w - 1;
      g.fg(x, y, shell ? sp.shell : T.AIR); g.wall(x, y, sp.wall); g.liq(x, y, 0);
    }
    const chests = sp.furnish(g, bx, y0), fl = y0 + h - 2;
    const inner = (x: number): boolean => x > bx && x < bx + w - 1 && !sp.skip(x, bx);
    const up: ShaftCol[] = [], down: ShaftCol[] = [];
    for (let x = bx + 1; x + 1 < bx + w - 1; x++) if (inner(x) && inner(x + 1)) { up.push({ sx: x, start: y0 }); down.push({ sx: x, start: y0 + h - 1 }); }
    const mid = bx + (w >> 1), near = (a: ShaftCol, b: ShaftCol): number => Math.abs(a.sx - mid) - Math.abs(b.sx - mid) || a.sx - b.sx;
    up.sort(near); down.sort(near);
    const r = reachRoom({ c, g, box: { x: bx, y: y0 - 1, w, h: h + 1 }, starts: [[bx + 2, fl]], floorOf: (x, y) => y === fl && x > bx && x < bx + w - 1, open, up,
      down: sp.down ? down : null, downLimit: (x) => Math.min(p.layersAt(x).deep, LAVA_Y) }, force);
    if (!r) return null;
    const floors = gridFloors(r.g, bx + 1, bx + w - 1, fl).filter((f) => !sp.skip(f.x, bx));
    // 沒有豎井時外框從小室頂起（上方多開的那一列沒有畫任何格）
    const top = r.parts ? r.top : y0;
    const out: Blueprint = { id: c.id, kind: sp.kind, layer: sp.layer, x: r.x0, y: top, w: r.x1 - r.x0, h: r.bottom - top, cells: r.g.cells(), chests, ...emptyObjects(), floors };
    if (sp.variant) out.variant = sp.variant;
    if (r.parts) out.parts = r.parts;
    return out;
  };
  const first = placeX(c, w, true, () => true);
  if (first === null) throw new RangeError(`gen2: ${sp.kind} ${c.id} does not fit [${c.slotX0}, ${c.slotX1})`);
  const xs = xCandidates(c, w, first);
  for (const force of [false, true]) for (const x of xs) for (const y of ys(x)) { const b = draw(x, y, force); if (b) return b; }
  throw new RangeError(`gen2: ${sp.kind} ${c.id} has no reachable layout`);
}

// 坑道底藏物（疾行靴）：該地區主坑道底端圓室最低處（中心欄、圓室半徑那一列）與左右各一欄寫石地板，箱子在中心欄上一格（左右兩格寫空氣）
export function buildShaftCacheBp(c: BpCtx): Blueprint {
  // ctx.ver 0 的規則
  const p = c.profile, ss = seedInt(c.seed, 'g2-shaft');
  const sh = shaftOf(ss, c.region, (x) => p.surfaceAt(x), (x) => p.layersAt(x).deep);
  if (!sh) throw new RangeError(`gen2: shaft_cache ${c.id}: region ${c.region.index} has no shaft`);
  const rm = shaftRoom(ss, c.region, sh), fy = rm.y + rm.r, g = new BpGrid(rm.x - 1, fy - 1, 3, 2);
  for (let dx = -1; dx <= 1; dx++) { g.fg(rm.x + dx, fy, T.STONE); g.liq(rm.x + dx, fy, 0); if (dx) { g.fg(rm.x + dx, fy - 1, T.AIR); g.liq(rm.x + dx, fy - 1, 0); } }
  g.fg(rm.x, fy - 1, T.CHEST); g.liq(rm.x, fy - 1, 0);
  return { id: c.id, kind: 'shaft_cache', layer: BP_DEEP, x: rm.x - 1, y: fy - 1, w: 3, h: 2, cells: g.cells(), chests: [{ x: rm.x, y: fy - 1, kind: 'relic' }], ...emptyObjects() };
}

// 出生點石碑（第 0 塊）：見檔頭
export function buildSpawnTabletBp(c: BpCtx): Blueprint {
  // ctx.ver 0 的規則
  const p = c.profile, sEnt = seedInt(c.seed, 'g2-entrance'), ban = c.surfaceBan ?? [], sp = c.spawnX ?? c.slotX0;
  const lo = c.slotX0 + SLOT_PAD + TABLET_HALF, hi = c.slotX1 - SLOT_PAD - TABLET_HALF;
  const xs: number[] = [];
  for (let x = lo; x < hi; x++) xs.push(x);
  xs.sort((a, b) => Math.abs(a - sp) - Math.abs(b - sp) || a - b);
  // 陸地欄、外框（石碑 ± 3 欄 × 地面上兩列到地面那一列）不碰 ban；entrance = 也可以是地表入口欄
  const okAt = (x: number, entrance: boolean): boolean => {
    if (p.info(x).kind !== COL_LAND || (!entrance && entranceHit(x, sEnt))) return false;
    const g = c.groundAt(x);
    return !boxHits({ x: x - TABLET_HALF, y: g - 2, w: 2 * TABLET_HALF + 1, h: 3 }, ban);
  };
  const flat = (x: number): boolean => { const g = c.groundAt(x); return c.groundAt(x - 1) === g && c.groundAt(x + 1) === g; };
  // 備案（實測很少）：都不是平地 → 非平地；連非入口欄都沒有 → 入口欄，石碑腳下那格寫泥土（入口欄的洞穴從地表挖起）
  let x = xs.find((q) => flat(q) && okAt(q, false)) ?? xs.find((q) => okAt(q, false)), patch = false;
  if (x === undefined) { x = xs.find((q) => okAt(q, true)); patch = true; }
  if (x === undefined) throw new RangeError(`gen2: spawn_tablet ${c.id} has no column in [${c.slotX0}, ${c.slotX1})`);
  const gy = c.groundAt(x), g = new BpGrid(x - TABLET_HALF, gy - 2, 2 * TABLET_HALF + 1, patch ? 3 : 2);
  for (const y of [gy - 2, gy - 1]) { g.fg(x, y, T.AIR); g.liq(x, y, 0); }
  if (patch) { g.fg(x, gy, T.DIRT); g.liq(x, gy, 0); }
  return { id: c.id, kind: 'spawn_tablet', layer: BP_MINOR, x: x - TABLET_HALF, y: gy - 2, w: 2 * TABLET_HALF + 1, h: patch ? 3 : 2, cells: g.cells(), chests: [], ...emptyObjects(), floors: [{ x, y: gy - 1 }] };
}
