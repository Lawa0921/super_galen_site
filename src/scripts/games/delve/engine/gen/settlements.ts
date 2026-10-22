// gen/settlements.ts — 世界生成：NPC 地表村落與矮人地底大廳（確定性、只用整數 / 基本四則運算）。
//   · 村落（2～4 座，世界 ≥ 3000 欄）：平坦的森林地表、離出生點 / 地城 / 彼此夠遠、不和其他結構重疊。
//     整平地面 → 2～3 棟木骨灰泥 + 茅草屋頂的小屋（門、窗、床、桌椅、光源、木板背景牆）→ 中央廣場（委託板、燈柱、木桶）
//     → 村子兩端的高旗桿（遠遠就看得到）+ 短圍欄。
//   · 矮人地廳（1～2 座）：洞穴層深處鑿出的拱頂石廳（鑿石磚外殼、鑿刻石牆背景）、矮人熔爐 + 鐵砧、火盆、旗幟與吊燈、
//     長桌、橫貫大廳的礦車軌道與兩側鑿出的軌道隧道（通往附近洞穴）、軌道上一台滿載的礦車（一次性發現物）。
//   回傳結構矩形 + NPC 要站的位置（engine/folk.ts 用來安排村民 / 矮人）。
import type { GenGrid } from './grid';
import { BIOME } from '../world';
import { subSeed, type Rng } from '../rng';
import { T, W, SOLID_LUT } from '../tiles';

export interface GenRect { x: number; y: number; w: number; h: number; }
export interface VillageHouse {
  /** 外牆左右欄（含）、地板列（站立的那一列 = floorY - 1） */
  x0: number; x1: number; floorY: number;
  /** 門所在欄 */
  door: number;
  /** 用途：elder = 村長家（書架）、shop = 商店（櫃台 + 木桶）、home = 一般住家 */
  role: 'elder' | 'shop' | 'home';
}
export interface VillageInfo {
  /** 村子範圍（含兩端旗桿）x0..x1（含）、地面列 ground（第一個實心列） */
  x0: number; x1: number; ground: number;
  houses: VillageHouse[];
  /** 委託板（站立列） */
  board: { x: number; y: number };
  /** 旗色（0..2；渲染端可依此換色） */
  style: number;
}
export interface HallInfo {
  x0: number; x1: number;
  /** 天花板最高的內部列 / 地板（第一個實心列） */
  y0: number; floorY: number;
  forge: { x: number; y: number };
  cart: { x: number; y: number };
  /** 兩側鑿出的軌道隧道（欄範圍，含；列 = floorY-5 .. floorY） */
  tunnels: { x0: number; x1: number }[];
}

export interface SettleGenCtx {
  world: GenGrid;
  seed: string | number;
  surface: Int16Array;
  colBiome: Uint8Array;
  deepLine: Int16Array;
  moltenLine: Int16Array;
  spawnX: number;
  /** 地城預留區 x 範圍 */
  dz: { x0: number; x1: number };
  beachW: number;
  /** 不能重疊的矩形（已放好的結構 / 預留區） */
  blocked: () => GenRect[];
  /** 不能放村子的欄（湖床 / 冰湖） */
  wetCols?: (x: number) => boolean;
}

const overlap = (a: GenRect, b: GenRect, m = 0): boolean =>
  a.x - m < b.x + b.w && a.x + a.w + m > b.x && a.y - m < b.y + b.h && a.y + a.h + m > b.y;

/** 世界大小 → 村落數目標（預設 4200 欄 → 多半 3 座，有時 2 或 4 座） */
export function villageTarget(width: number, rng: Rng): number {
  if (width >= 3000) { const r = rng.next(); return r < 0.15 ? 2 : r < 0.75 ? 3 : 4; }
  return width >= 1000 ? 1 : 0;
}
/** 村落選址條件：一輪比一輪寬鬆（地面起伏上限、彼此間距、兩側緩坡也要是森林），最後一輪逐欄掃描 */
const VILLAGE_PASSES: readonly { rough: number; gap: number; edgeForest: boolean; tries: number }[] = [
  { rough: 10, gap: 0.1, edgeForest: true, tries: 260 },
  { rough: 18, gap: 0.075, edgeForest: true, tries: 260 },
  { rough: 26, gap: 0.06, edgeForest: false, tries: 260 },
  { rough: 30, gap: 0.05, edgeForest: false, tries: 0 },
];
/** 村落最少幾座（世界夠大時保證） */
export const MIN_VILLAGES = 2;
export function hallTarget(width: number, rng: Rng): number {
  if (width >= 3000) return rng.chance(3) ? 1 : 2;
  return width >= 1000 ? 1 : 0;
}

/** 放村落（直接寫 world.fg / wall / surface；回傳每座村子的配置與結構矩形） */
export function placeVillages(c: SettleGenCtx): { villages: VillageInfo[]; rects: GenRect[] } {
  const w = c.world, { width, height, fg, wall } = w, WW = width;
  const rng = subSeed(c.seed, 'villages');
  const want = villageTarget(width, rng);
  const villages: VillageInfo[] = [], rects: GenRect[] = [];
  const put = (x: number, y: number, t: number): void => { if (x >= 0 && y >= 0 && x < width && y < height) fg[y * WW + x] = t; };
  const putWall = (x: number, y: number, t: number): void => { if (x >= 0 && y >= 0 && x < width && y < height) wall[y * WW + x] = t; };
  const solid = (x: number, y: number): boolean => x < 0 || y < 0 || x >= width || y >= height || SOLID_LUT[fg[y * WW + x]] === 1;
  const minSpawn = Math.max(160, Math.floor(width * 0.07));
  const need = width >= 3000 ? Math.max(MIN_VILLAGES, want) : want;
  // 候選位置：前三輪隨機抽，最後一輪（還不夠 MIN_VILLAGES 才跑）每 9 欄掃一次
  const cands: { x0: number; vw: number; p: number }[] = [];
  let pass = 0, scanX = c.beachW + 30, tries = 0;
  const next = (): { x0: number; vw: number; p: number } | null => {
    for (;;) {
      if (villages.length >= need || pass >= VILLAGE_PASSES.length) return null;
      const P = VILLAGE_PASSES[pass];
      // 最後一輪（逐欄掃描）只用來保證最少座數
      if (pass === VILLAGE_PASSES.length - 1 && villages.length >= MIN_VILLAGES) return null;
      if (P.tries > 0) {
        if (tries++ >= P.tries) { pass++; tries = 0; continue; }
        return { x0: rng.int(c.beachW + 30, Math.max(c.beachW + 31, width - c.beachW - 30 - 74)), vw: rng.int(58, 74), p: pass };
      }
      if (scanX > width - c.beachW - 30 - 66) { pass++; continue; }
      const x0 = scanX; scanX += 9;
      return { x0, vw: 66, p: pass };
    }
  };
  void cands;
  for (let cand = next(); cand; cand = next()) {
    const P = VILLAGE_PASSES[cand.p];
    const vw = cand.vw, x0 = cand.x0, x1 = x0 + vw - 1;
    const cx = (x0 + x1) >> 1;
    if (Math.abs(cx - c.spawnX) < minSpawn + vw / 2) continue;
    if (x1 + 90 > c.dz.x0 && x0 - 90 < c.dz.x1) continue;
    if (villages.some((v) => Math.abs(((v.x0 + v.x1) >> 1) - cx) < Math.max(150, Math.floor(width * P.gap)))) continue;
    let ok = true, lo = height, hi = 0;
    for (let x = x0 - 8; x <= x1 + 8 && ok; x++) {
      const inside = x >= x0 && x <= x1;
      if (x < 0 || x >= width || c.wetCols?.(x) || ((inside || P.edgeForest) && c.colBiome[x] !== BIOME.FOREST)) { ok = false; break; }
      const s = c.surface[x];
      if (inside) { lo = Math.min(lo, s); hi = Math.max(hi, s); }
    }
    if (!ok || hi - lo > P.rough) continue;
    // 地面：取中位數（整平時削高補低）
    const col: number[] = [];
    for (let x = x0; x <= x1; x++) col.push(c.surface[x]);
    col.sort((a, b) => a - b);
    const ground = col[col.length >> 1];
    const rect: GenRect = { x: x0 - 10, y: ground - 26, w: vw + 20, h: 34 };
    if (rect.y < 4 || c.blocked().some((b) => overlap(b, rect, 2)) || rects.some((b) => overlap(b, rect, 20))) continue;
    // 地面不能有水
    let wet = false;
    for (let x = x0 - 4; x <= x1 + 4 && !wet; x++) for (let y = ground - 6; y <= ground + 2; y++) if (w.liquid[y * WW + x]) { wet = true; break; }
    if (wet) continue;

    // ── 整平（含兩側 9 欄的緩坡） ──
    const shape = (x: number, top: number): void => {
      const s0 = c.surface[x];
      for (let y = Math.max(1, Math.min(ground, top) - 28); y < top; y++) { put(x, y, T.AIR); putWall(x, y, W.NONE); w.liquid[y * WW + x] = 0; }
      // 補低：一路填到原本的地表下面（窪地整平後底下不會是空的）
      for (let y = top; y < Math.max(top + 6, s0 + 3); y++) if (!solid(x, y)) put(x, y, T.DIRT);
      put(x, top, T.GRASS);
      c.surface[x] = top; w.surface[x] = top;
    };
    for (let x = x0; x <= x1; x++) shape(x, ground);
    for (let k = 1; k <= 9; k++) {
      for (const x of [x0 - k, x1 + k]) {
        if (x < 0 || x >= width) continue;
        const s = c.surface[x];
        shape(x, ground + Math.trunc(((s - ground) * k) / 10));
      }
    }
    // ── 房子 ──
    const style = villages.length % 3;
    // 版面：兩端各留 8 欄（旗桿 + 圍欄）；[左邊的房子] 2 [廣場 12] 2 [右邊的房子]，房子之間隔 2 欄，整排置中
    const nh = vw >= 66 ? 3 : 2, left = Math.ceil(nh / 2), right = nh - left, plazaW = 12;
    const fixed = (left - 1) * 2 + (right - 1) * 2 + 4 + plazaW;
    const hw = Math.max(9, Math.min(13, Math.floor((vw - 16 - fixed) / nh)));
    const total = nh * hw + fixed;
    let cur = x0 + 8 + Math.max(0, (vw - 16 - total) >> 1);
    const roles: VillageHouse['role'][] = nh === 3 ? ['shop', 'elder', 'home'] : ['shop', 'elder'];
    const houses: VillageHouse[] = [];
    const slots: number[] = [];
    for (let i = 0; i < left; i++) { slots.push(cur); cur += hw + 2; }
    const plaza0 = cur, plaza1 = plaza0 + plazaW - 1;
    cur = plaza1 + 3;
    for (let i = 0; i < right; i++) { slots.push(cur); cur += hw + 2; }
    slots.forEach((hx0, i) => {
      const hx1 = hx0 + hw - 1, floorY = ground;
      const door = hx0 > plaza1 ? hx0 : hx1; // 門朝廣場
      const role = roles[i] ?? 'home';
      buildHouse(w, hx0, hx1, floorY, door, role, rng);
      houses.push({ x0: hx0, x1: hx1, floorY, door, role });
    });
    // ── 廣場：委託板、燈柱、木桶、長椅 ──
    const bx = (plaza0 + plaza1) >> 1;
    put(bx, ground - 1, T.QUEST_BOARD);
    put(plaza0 + 1, ground - 1, T.LANTERN_POST);
    put(plaza1 - 1, ground - 1, T.LANTERN_POST);
    put(bx + 3, ground - 1, T.BENCH);
    put(bx - 3, ground - 1, T.BARREL);
    put(bx - 4, ground - 1, T.BARREL);
    put(bx - 4, ground - 2, T.BARREL);
    // ── 旗桿（14 格高 + 桿頂燈）+ 3×3 的大村旗（往村外飄）+ 短圍欄：遠遠就看得到，晚上桿頂的燈也亮著 ──
    for (const [fx, dir] of [[x0 + 1, -1], [x1 - 1, 1]] as const) {
      for (let k = 1; k <= 13; k++) put(fx, ground - k, T.FLAGPOLE);
      put(fx, ground - 14, T.FLAG_LAMP);
      const cx = dir < 0 ? fx - 3 : fx + 1;
      for (let dy = 0; dy < 3; dy++) for (let dx = 0; dx < 3; dx++) put(cx + dx, ground - 13 + dy, T.FLAG_CLOTH);
    }
    for (const [a, b] of [[x0 + 3, x0 + 6], [x1 - 6, x1 - 3]] as const) for (let x = a; x <= b; x++) if (fg[(ground - 1) * WW + x] === T.AIR) put(x, ground - 1, T.FENCE);
    villages.push({ x0, x1, ground, houses, board: { x: bx, y: ground - 1 }, style });
    rects.push({ x: x0 - 9, y: ground - 24, w: vw + 18, h: 30 });
  }
  return { villages, rects };
}

/** 一棟村屋：木骨灰泥外牆、茅草三角屋頂、門朝廣場、另一側開窗；屋內木板背景牆 + 床 / 桌 / 椅 / 光源 */
function buildHouse(w: GenGrid, x0: number, x1: number, floorY: number, door: number, role: VillageHouse['role'], rng: Rng): void {
  const { width, fg, wall } = w, WW = width;
  const put = (x: number, y: number, t: number): void => { if (x >= 0 && x < width && y >= 0) fg[y * WW + x] = t; };
  const putWall = (x: number, y: number, t: number): void => { if (x >= 0 && x < width && y >= 0) wall[y * WW + x] = t; };
  const ceil = floorY - 6; // 室內 5 格高
  for (let x = x0; x <= x1; x++) {
    put(x, floorY, T.PLANKS);
    for (let y = ceil; y < floorY; y++) {
      const edge = x === x0 || x === x1 || y === ceil;
      put(x, y, edge ? T.TIMBER : T.AIR);
      putWall(x, y, W.PLANK_WALL);
    }
  }
  // 門（3 格）、窗
  for (let k = 1; k <= 3; k++) put(door, floorY - k, T.DOOR_CLOSED);
  const winX = door === x0 ? x1 : x0;
  put(winX, floorY - 3, T.GLASS);
  put(winX, floorY - 4, T.GLASS);
  // 茅草屋頂：每列往內收一格（兩側各突出一格屋簷）
  for (let r = 0; ; r++) {
    const a = x0 - 1 + r, b = x1 + 1 - r, y = ceil - 1 - r;
    if (b - a < 1 || y < 2) break;
    for (let x = a; x <= b; x++) put(x, y, T.THATCH);
  }
  // 家具（i = 從門口往裡數第幾格）：門口留空、椅子、桌子、（書架 / 盆栽）、最裡面是床；牆上火把
  const inner0 = x0 + 1, inner1 = x1 - 1, y = floorY - 1, n = inner1 - inner0 + 1;
  const at = (i: number): number => (door === x0 ? inner0 + i : inner1 - i);
  const bedX = Math.min(at(n - 1), at(n - 2));
  put(bedX, y, T.BED_HEAD); put(bedX + 1, y, T.BED_FOOT);
  put(at(1), y, T.CHAIR);
  put(at(2), y, T.TABLE);
  put(at(3), floorY - 4, T.TORCH);
  if (role === 'elder') { const sx = at(4); put(sx, y, T.BOOKSHELF); put(sx, y - 1, T.BOOKSHELF); put(sx, y - 2, T.CANDLE); }
  if (role === 'shop') {
    // 門外的木桶 + 屋簷下的布旗
    const out = door === x0 ? x0 - 2 : x1 + 2;
    put(out, floorY - 1, T.BARREL);
    put(door === x0 ? x0 - 1 : x1 + 1, ceil, T.BANNER);
  }
  if (role === 'home' && rng.chance(2)) put(at(4), y, T.POTTED_PLANT);
}

/** 放矮人地廳（洞穴層深處）；回傳配置與結構矩形 */
export function placeDwarfHalls(c: SettleGenCtx): { halls: HallInfo[]; rects: GenRect[] } {
  const w = c.world, { width, height, fg, wall } = w, WW = width;
  const rng = subSeed(c.seed, 'dwarf-halls');
  const want = hallTarget(width, rng);
  const halls: HallInfo[] = [], rects: GenRect[] = [];
  const inB = (x: number, y: number): boolean => x >= 0 && y >= 0 && x < width && y < height;
  const put = (x: number, y: number, t: number): void => { if (inB(x, y)) fg[y * WW + x] = t; };
  const putWall = (x: number, y: number, t: number): void => { if (inB(x, y)) wall[y * WW + x] = t; };
  const get = (x: number, y: number): number => (inB(x, y) ? fg[y * WW + x] : T.STONE);
  for (let tries = 0; tries < 120 && halls.length < want; tries++) {
    const hw = rng.int(60, 78), ih = 11;
    const x0 = rng.int(c.beachW + 60, Math.max(c.beachW + 61, width - c.beachW - 60 - hw)), x1 = x0 + hw - 1;
    const cx = (x0 + x1) >> 1;
    if (Math.abs(cx - c.spawnX) < Math.max(150, Math.floor(width * 0.06))) continue;
    if (x1 + 60 > c.dz.x0 && x0 - 60 < c.dz.x1) continue;
    if (halls.some((h) => Math.abs(((h.x0 + h.x1) >> 1) - cx) < Math.floor(width * 0.2))) continue;
    let top = 0, bot = height;
    for (let x = x0; x <= x1; x++) { top = Math.max(top, c.deepLine[x] + 24); bot = Math.min(bot, c.moltenLine[x] - 26); }
    if (bot - top < ih + 6) continue;
    const floorY = rng.int(top + ih + 2, bot);
    const y0 = floorY - ih;
    const rect: GenRect = { x: x0 - 3, y: y0 - 4, w: hw + 6, h: ih + 8 };
    if (c.blocked().some((b) => overlap(b, rect, 6)) || rects.some((b) => overlap(b, rect, 30))) continue;
    // ── 外殼 + 拱頂室內 ──
    const half = Math.max(1, (x1 - x0) >> 1);
    const archAt = (x: number): number => { const d = x - cx; return Math.trunc((3 * d * d) / (half * half)); }; // 中間高、兩側低 3 格
    for (let x = x0 - 2; x <= x1 + 2; x++) {
      for (let y = y0 - 3; y <= floorY + 2; y++) { put(x, y, T.DWARF_BRICK); putWall(x, y, W.DWARF_WALL); w.liquid[y * WW + x] = 0; }
    }
    for (let x = x0; x <= x1; x++) for (let y = y0 + archAt(x); y < floorY; y++) put(x, y, T.AIR);
    // ── 軌道（橫貫大廳）+ 兩側鑿出的軌道隧道（碰到洞穴就停） ──
    for (let x = x0; x <= x1; x++) put(x, floorY - 1, T.RAIL);
    const tunnels: { x0: number; x1: number }[] = [];
    for (const dir of [-1, 1] as const) {
      const sx = dir < 0 ? x0 - 3 : x1 + 3;
      let open = 0, last = sx;
      for (let k = 0; k < 70; k++) {
        const x = sx + dir * k;
        if (x < 4 || x >= width - 4) break;
        last = x;
        // 已經接到天然洞穴（隧道口有一段都是空氣）→ 停
        let air = 0;
        for (let y = floorY - 4; y < floorY; y++) if (get(x, y) === T.AIR) air++;
        if (k > 6 && air >= 3) { open++; if (open > 2) break; }
        for (let y = floorY - 4; y < floorY; y++) { put(x, y, T.AIR); w.liquid[y * WW + x] = 0; }
        if (SOLID_LUT[get(x, floorY)] !== 1) put(x, floorY, T.DWARF_BRICK);
        put(x, floorY - 1, T.RAIL);
        put(x, floorY - 5, SOLID_LUT[get(x, floorY - 5)] === 1 ? get(x, floorY - 5) : T.DWARF_BRICK);
        // 隧道裡每 5 格一支火把（貼著天花板）：遠遠就看得到一條亮著的坑道
        if (k % 5 === 2) put(x, floorY - 4, T.TORCH);
      }
      tunnels.push({ x0: Math.min(sx, last), x1: Math.max(sx, last) });
      // 隧道口的門框
      for (let y = floorY - 4; y < floorY; y++) { put(dir < 0 ? x0 - 1 : x1 + 1, y, T.AIR); put(dir < 0 ? x0 - 2 : x1 + 2, y, T.AIR); }
      put(dir < 0 ? x0 - 1 : x1 + 1, floorY - 1, T.RAIL); put(dir < 0 ? x0 - 2 : x1 + 2, floorY - 1, T.RAIL);
    }
    // ── 擺設 ──
    const fy = floorY - 1;
    const forge = { x: x0 + 5, y: fy };
    put(forge.x, fy, T.DWARF_FORGE);
    put(forge.x + 2, fy, T.ANVIL);
    put(forge.x + 3, fy, T.BARREL);
    // 礦車停在軌道上（點陣自己畫了軌道，直接取代那格軌道）
    const cart = { x: x1 - 8, y: fy };
    put(cart.x, fy, T.ORE_CART);
    // 天花板：每 10 格一組旗幟（兩格長）+ 鐵鍊吊燈
    for (let x = x0 + 12; x < x1 - 10; x += 10) {
      const top = y0 + archAt(x);
      put(x, top, T.BANNER); put(x, top + 1, T.BANNER);
      const t2 = y0 + archAt(x + 5);
      put(x + 5, t2, T.CHAIN); put(x + 5, t2 + 1, T.LANTERN);
    }
    // 火盆：放在大廳兩端的石台（地板上加一層鑿石磚台階）
    for (const bx of [x0 + 1, x1 - 1]) { put(bx, fy, T.DWARF_BRICK); put(bx, fy - 1, T.BRAZIER); }
    // 後牆火把（每 6 格，鑿刻石牆上）+ 入口門框上的旗幟：大廳在預設縮放下也夠亮、入口一眼認得出來
    for (let x = x0 + 3; x < x1 - 2; x += 6) if (fg[(fy - 3) * WW + x] === T.AIR) put(x, fy - 3, T.TORCH);
    for (const dx of [x0 - 2, x1 + 2]) { put(dx, floorY - 4, T.BANNER); put(dx, floorY - 3, T.BANNER); }
    // 長桌 + 長椅（軌道之上一格高的平台當「宴會桌」：平台站得上去、不擋路）
    const tx = cx - 4;
    for (let x = tx; x < tx + 8; x++) put(x, fy - 3, T.PLATFORM);
    put(tx + 1, fy - 4, T.CANDLE); put(tx + 6, fy - 4, T.CANDLE);
    halls.push({ x0, x1, y0, floorY, forge, cart, tunnels });
    rects.push({ x: x0 - 3, y: y0 - 4, w: hw + 6, h: ih + 8 });
  }
  return { halls, rects };
}
