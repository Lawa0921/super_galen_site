// lakes.ts — gen2 靜態液體藍圖（spec §4.3）：地表湖、地下湖、熔岩池。生成時就是靜止形狀（盆地 + 一條水平液面、滿格），
// 不跑 LiquidSim.settle：每個液體格的左右與下方不是同種滿格液體就是實心（殼 / 土），所以喚醒後也不會動。
// · 地表湖：寬 20–60、深 6–12；湖欄 [x0, x1)、兩岸 x0 − 1 / x1，水位 level = 兩岸地表較低者（y 大）；兩岸差 > 8 不放，
//   外框內有欄的地表比水位高 > 8（湖裡的小丘 / 外側的高地）也不放（挖掉的丘有上限，湖底不會深到碰地下層的結構）。
//   湖欄挖到 level + 盆形深度（邊 1、中央 d），水位以上的丘挖空，y ≥ level 的空格滿水；水格左右 2 格、下方 2 格強制成該生態的土
//   （蓋過洞穴；外框 = 湖欄 + 兩側各 2 欄壁）；水位以下、地表以上的空格（窪地）也補土，盆底不懸空。
// · 地下湖：橢圓 rx 12–30、ry 6–12，中心 y ∈ [rock + 20, deep − 20]（取橢圓各欄最深的 rock、最淺的 deep），下 60% 列滿水、平頂，外圍 2 格石殼；
//   水面高過最寬列，水面以下比水面寬的兩肩填成殼（見 ellipse）。
// · 熔岩池：橢圓 rx 8–20、ry 4–8，中心 y ∈ [molten + 10, LAVA_Y − 14]（取各欄最深的 molten），下半（中心列以下）滿熔岩，外圍 2 格玄武岩殼。
// 殼 = 不在橢圓內、但 2 格內（含斜角）有橢圓內格的格；橢圓內的空腔整個被殼封住。
// 放不下（槽內 3 個候選都不合條件）就回 null。後蓋的藍圖不會切開液體：同槽不同層的外框相交時由 BlueprintIndex 讓液體藍圖讓位。
// 本資料夾的非測試檔不得出現連續兩個星號、亂數與超越函數（測試會 grep），註解一律用 //。
import { T, W } from '../../tiles';
import { BIOME } from '../../world';
import { LIQ, LIQ_MAX } from '../../liquidKind';
import { HRng } from '../hrng';
import { LAVA_Y, type Profile2 } from '../profile';
import { BpGrid, placeX, BP_SURFACE, BP_UNDER, BP_DEEP, type Blueprint, type BpCtx, type BpKind } from '../bpcore';

// 湖壁 / 殼的厚度
const WALL = 2, SHELL = 2;
// 兩岸差、外框內地表高出水位的上限
const MAX_BANK = 8, MAX_HUMP = 8;

const soilOf = (biome: number): number => (biome === BIOME.DESERT ? T.SAND : biome === BIOME.JUNGLE ? T.MUD : T.DIRT);

export function buildLake(c: BpCtx): Blueprint | null {
  // ctx.ver 0 的規則
  const rng = new HRng(c.s, c.id), p = c.profile;
  const w = rng.int(20, 61), d = rng.int(6, 13), bw = w + 2 * WALL;
  // 外框 x = bx：湖欄 [bx + WALL, bx + WALL + w)、兩岸 bx + WALL − 1 / bx + WALL + w
  const levelAt = (bx: number): number | null => {
    const sl = p.surfaceAt(bx + WALL - 1), sr = p.surfaceAt(bx + WALL + w);
    if (Math.abs(sl - sr) > MAX_BANK) return null;
    const level = Math.max(sl, sr);
    for (let x = bx; x < bx + bw; x++) if (p.surfaceAt(x) < level - MAX_HUMP) return null;
    return level;
  };
  const bx = placeX(c, bw, false, (x) => levelAt(x) !== null);
  if (bx === null) return null;
  const level = levelAt(bx)!, x0 = bx + WALL, x1 = x0 + w;
  // 盆形：u = 2(x − x0) + 1 − w ∈ [−(w − 1), w − 1]，深 = d − floor((d − 1) u² / (w − 1)²)：兩邊 1、中央 d
  const depth = (x: number): number => {
    if (x < x0 || x >= x1) return 0;
    const u = 2 * (x - x0) + 1 - w;
    return d - Math.floor(((d - 1) * u * u) / ((w - 1) * (w - 1)));
  };
  let top = level, bottom = level + d + WALL;
  for (let x = bx; x < bx + bw; x++) {
    const s = p.surfaceAt(x);
    if (x >= x0 && x < x1) top = Math.min(top, s);
    bottom = Math.max(bottom, s);
  }
  const g = new BpGrid(bx, top, bw, bottom - top);
  for (let x = bx; x < bx + bw; x++) {
    const s = p.surfaceAt(x), dep = depth(x), soil = soilOf(p.biomeAt(x));
    // 2 格內最深的水（湖壁 / 盆底延伸到它下面 2 格）
    let near = 0;
    for (let k = -WALL; k <= WALL; k++) near = Math.max(near, depth(x + k));
    // 水位以上的丘挖空（只有湖欄）
    if (dep > 0) for (let y = s; y < level; y++) { g.fg(x, y, T.AIR); g.liq(x, y, 0); g.wall(x, y, W.NONE); }
    for (let y = level; y < Math.max(level + near + WALL, s); y++) {
      if (y < level + dep) { g.fg(x, y, T.AIR); g.liq(x, y, (LIQ_MAX << 8) | LIQ.WATER); } else { g.fg(x, y, soil); g.liq(x, y, 0); }
    }
  }
  return { id: c.id, kind: 'lake', layer: BP_SURFACE, x: bx, y: top, w: bw, h: bottom - top, cells: g.cells(), chests: [] };
}

export function buildCaveLake(c: BpCtx): Blueprint | null {
  // ctx.ver 0 的規則
  const rng = new HRng(c.s, c.id);
  const rx = rng.int(12, 31), ry = rng.int(6, 13), fy = rng.next();
  return ellipse(c, { kind: 'cave_lake', layer: BP_UNDER, rx, ry, fy, type: LIQ.WATER, shell: T.STONE,
    span: (p, x) => { const l = p.layersAt(x); return [l.rock + 20, l.deep - 20]; },
    // 下 60% 列（無條件捨去）
    rows: (h) => Math.floor((h * 3) / 5) });
}

export function buildLavaPool(c: BpCtx): Blueprint | null {
  // ctx.ver 0 的規則
  const rng = new HRng(c.s, c.id);
  const rx = rng.int(8, 21), ry = rng.int(4, 9), fy = rng.next();
  return ellipse(c, { kind: 'lava_pool', layer: BP_DEEP, rx, ry, fy, type: LIQ.LAVA, shell: T.BASALT,
    span: (p, x) => [p.layersAt(x).molten + 10, LAVA_Y - 14],
    // 下半：中心列以下（含中心列）
    rows: (h) => (h + 1) >> 1 });
}

interface EllipseSpec {
  kind: BpKind; layer: 0 | 1 | 2; rx: number; ry: number; fy: number; type: number; shell: number;
  // 某欄中心 y 的 [下限, 上限]；整個橢圓取各欄最緊的
  span: (p: Profile2, x: number) => [number, number];
  // 高 h 列的橢圓裡，底下幾列是液體
  rows: (h: number) => number;
}

// 橢圓液體 + 殼；外框 = 橢圓外接矩形 + 每邊 SHELL
function ellipse(c: BpCtx, o: EllipseSpec): Blueprint | null {
  const p = c.profile, { rx, ry } = o, bw = 2 * rx + 1 + 2 * SHELL, bh = 2 * ry + 1 + 2 * SHELL;
  const span = (bx: number): { lo: number; hi: number } => {
    let lo = -1, hi = p.height;
    for (let x = bx + SHELL; x < bx + bw - SHELL; x++) { const [a, b] = o.span(p, x); lo = Math.max(lo, a); hi = Math.min(hi, b); }
    return { lo, hi };
  };
  const bx = placeX(c, bw, false, (x) => { const s = span(x); return s.hi >= s.lo; });
  if (bx === null) return null;
  const { lo, hi } = span(bx);
  const cx = bx + SHELL + rx, cy = lo + Math.floor(o.fy * (hi - lo + 1)), by = cy - ry - SHELL;
  const rx2 = rx * rx, ry2 = ry * ry, rr = rx2 * ry2;
  const inEllipse = (x: number, y: number): boolean => { const dx = x - cx, dy = y - cy; return dx * dx * ry2 + dy * dy * rx2 <= rr; };
  const liqTop = cy + ry + 1 - o.rows(2 * ry + 1), full = (LIQ_MAX << 8) | o.type;
  // 液面高過最寬列（地下湖的 60%）時，液面與最寬列之間兩側的「肩」比液面寬、上方是殼：那些格改成殼，
  // 液體只在液面那一列的 x 範圍內（每欄的液體都從液面往下連續，液面是唯一的一條水平線）
  let half = 0;
  while (inEllipse(cx + half + 1, liqTop)) half++;
  const inside = (x: number, y: number): boolean => inEllipse(x, y) && (y < liqTop || Math.abs(x - cx) <= half);
  const g = new BpGrid(bx, by, bw, bh);
  for (let y = by; y < by + bh; y++) for (let x = bx; x < bx + bw; x++) {
    if (inside(x, y)) { g.fg(x, y, T.AIR); g.liq(x, y, y >= liqTop ? full : 0); continue; }
    let shell = false;
    for (let dy = -SHELL; dy <= SHELL && !shell; dy++) for (let dx = -SHELL; dx <= SHELL; dx++) if (inside(x + dx, y + dy)) { shell = true; break; }
    if (shell) { g.fg(x, y, o.shell); g.liq(x, y, 0); }
  }
  return { id: c.id, kind: o.kind, layer: o.layer, x: bx, y: by, w: bw, h: bh, cells: g.cells(), chests: [] };
}
