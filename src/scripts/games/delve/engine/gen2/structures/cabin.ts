// cabin.ts — gen2 地下小屋（照舊生成器的形狀，但兩側坑道是直的、不用 tileRunner）：
// 寬 9–15、高 6–8，頂 y ∈ [地表 + 26, 熔岩層 − 30]（取屋子底下各欄最深的地表與最淺的熔岩層），
// 木板外殼 + 木板牆、兩端 3 格高門洞、兩側各一條 14–30 格長的 3 格高直坑道、工作台、箱子（'cabin'）、火把、蜘蛛網、陶罐。
// 外框 = 屋子 + 兩側坑道。
// M2a Task 14：地標（遺落的行囊 T.RELIC_PACK、site 'cabin'，舊生成器 landmarks.ts）放在屋內地板離屋子中央最近、頭頂空氣、左右不是箱子的格；
// floors = 屋內其餘站得住的地板格（給 lore.homeDecor 放石碑）。
// 家鄉的小屋（c.spawnX 有值：錨點與機率擲出的；指南針 / 深度計放在離出生點最近的兩間）一定走得進去（控制者裁決，比照 Task 9–11）：
// 屋子接上外框外的天然洞穴（shrine.reachRoom）→ 接不上就從坑道口往外延長 4 列高的隧道（外框寬 ≤ CABIN_MAX_W）→ 換 y 候選（擲出的 y 先，
// 再依雜湊步長試 OPEN_TRIES − 1 個）→ 錨點（force）才挖 2 格寬、掛繩梯的直豎井（往上接洞穴 → 往上通地表，不碰 surfaceBan）。
// 機率擲出的家鄉小屋都接不上就不放（回 null）。外圍的小屋照舊（不檢查）。
// 本資料夾的非測試檔不得出現連續兩個星號、亂數與超越函數（測試會 grep），註解一律用 //。
import { T, W } from '../../tiles';
import { HRng } from '../hrng';
import { BpGrid, placeX, clearRange, emptyObjects, BP_UNDER, type Blueprint, type BpCtx, type BpLandmark } from '../bpcore';
import { naturalOpen, type ShaftCol } from './miniBiome';
import { gridFloors, reachRoom } from './shrine';

// 外框寬上限（tl 30 + w 15 + tr 30 = anchors.ANCHOR_MAX_W.cabin）；家鄉小屋試幾個 y
const CABIN_MAX_W = 75, OPEN_TRIES = 8;

// force（P11、家鄉錨點）：不回 null（y 範圍不成立時取下限；家鄉錨點接不上洞穴時挖豎井，真的不行 = RangeError）
export function buildCabin(c: BpCtx, o: { force?: boolean } = {}): Blueprint | null {
  // ctx.ver 0 的規則
  const rng = new HRng(c.s, c.id), p = c.profile;
  const w = rng.int(9, 16), h = rng.int(6, 9), tl = rng.int(14, 31), tr = rng.int(14, 31), fy = rng.next();
  const bw = tl + w + tr;
  // 外框 x = bx 時屋頂 y 的範圍
  const span = (bx: number): { lo: number; hi: number } => {
    let sMax = -1, mMin = p.height;
    for (let x = bx + tl; x < bx + tl + w; x++) { sMax = Math.max(sMax, p.surfaceAt(x)); mMin = Math.min(mMin, p.layersAt(x).molten); }
    return { lo: sMax + 26, hi: mMin - 30 };
  };
  const bx = placeX(c, bw, o.force === true, (x) => { const s = span(x); return s.hi >= s.lo; });
  if (bx === null) return null;
  const { lo, hi } = span(bx);
  const yAt = (f: number): number => (hi >= lo ? lo + Math.floor((f - Math.floor(f)) * (hi - lo + 1)) : lo);
  const x = bx + tl;
  // 頂 y 的小屋：畫在 g（外框 [gx0, gx1)，家鄉的可以往兩側延長隧道）上；r = 擺設的亂數（每次試畫用同一條流的複本）
  const draw = (y: number, r: HRng, gx0: number, gx1: number): { g: BpGrid; chest: { x: number; y: number }; landmarks: BpLandmark[]; floorY: number } => {
    const floorY = y + h - 1, inside = floorY - 1;
    const g = new BpGrid(gx0, y, gx1 - gx0, h);
    const air = (xx: number, yy: number): void => { g.fg(xx, yy, T.AIR); g.liq(xx, yy, 0); };
    // 兩側直坑道：地板上三列
    for (let yy = floorY - 3; yy < floorY; yy++) {
      for (let xx = bx; xx < x; xx++) air(xx, yy);
      for (let xx = x + w; xx < bx + bw; xx++) air(xx, yy);
    }
    // 屋子：木板外殼、內部空氣、全部木板牆
    for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) {
      const border = yy === y || yy === floorY || xx === x || xx === x + w - 1;
      if (border) { g.fg(xx, yy, T.PLANKS); g.liq(xx, yy, 0); } else air(xx, yy);
      g.wall(xx, yy, W.PLANK_WALL);
    }
    // 兩端門洞（3 格高）
    for (const dx of [x, x + w - 1]) for (let yy = floorY - 3; yy < floorY; yy++) g.fg(dx, yy, T.AIR);
    // 年久失修：屋頂 / 側牆缺幾塊（地板保留）
    for (let xx = x + 1; xx < x + w - 1; xx++) if (r.chance(9)) g.fg(xx, y, T.AIR);
    for (let yy = y + 1; yy < floorY - 3; yy++) for (const dx of [x, x + w - 1]) if (r.chance(6)) g.fg(dx, yy, T.AIR);
    // 家具
    const bench = r.int(x + 2, x + w - 3);
    g.fg(bench, inside, T.WORKBENCH);
    let cx = r.int(x + 2, x + w - 2);
    if (Math.abs(cx - bench) < 2) cx = bench + 2 < x + w - 1 ? bench + 2 : bench - 2;
    g.fg(cx, inside, T.CHEST);
    g.fg(r.chance(2) ? x + 1 : x + w - 2, y + 1, T.TORCH);
    for (const qx of [x + 1, x + w - 2]) if (g.getFg(qx, y + 1) === T.AIR && r.chance(2)) g.fg(qx, y + 1, T.COBWEB);
    if (r.chance(2)) {
      const px = r.int(x + 1, x + w - 1);
      if (g.getFg(px, inside) === T.AIR) g.fg(px, inside, T.POT);
    }
    // 地標：屋內地板（inside 列）離屋子中央最近、頭頂空氣、腳下木板、左右不是箱子的空氣格（平手取左邊的）
    const mid = x + (w >> 1), chestAt = (xx: number): boolean => xx === cx;
    let spot: number | null = null;
    for (let d = 0; d <= w >> 1 && spot === null; d++) for (const xx of [mid - d, mid + d]) {
      if (xx <= x || xx >= x + w - 1 || g.getFg(xx, inside) !== T.AIR || g.getFg(xx, inside - 1) !== T.AIR || chestAt(xx - 1) || chestAt(xx + 1)) continue;
      spot = xx; break;
    }
    const landmarks: BpLandmark[] = [];
    if (spot !== null) { g.fg(spot, inside, T.RELIC_PACK); landmarks.push({ x: spot, y: inside, tile: T.RELIC_PACK, site: 'cabin' }); }
    return { g, chest: { x: cx, y: inside }, landmarks, floorY };
  };
  const finish = (d: ReturnType<typeof draw>, x0: number, x1: number, top: number, bottom: number, g: BpGrid, parts?: Blueprint['parts']): Blueprint => {
    const floors = gridFloors(g, x + 1, x + w - 1, d.floorY - 1);
    const bp: Blueprint = { id: c.id, kind: 'cabin', layer: BP_UNDER, x: x0, y: top, w: x1 - x0, h: bottom - top, cells: g.cells(), chests: [{ ...d.chest, kind: 'cabin' }],
      ...emptyObjects(), landmarks: d.landmarks, floors };
    if (parts) bp.parts = parts;
    return bp;
  };
  const y0 = yAt(fy);
  if (c.spawnX === undefined) { const d = draw(y0, rng, bx, bx + bw); return finish(d, bx, bx + bw, y0, y0 + h, d.g); }

  // 家鄉：一定走得進去（見檔頭）
  const room = clearRange(c, bx, bw), gx0 = Math.min(bx, Math.max(room.x0, bx + bw - CABIN_MAX_W)), gx1 = Math.max(bx + bw, Math.min(room.x1, bx + CABIN_MAX_W));
  const open = naturalOpen(c, {}), ys: number[] = [];
  for (let t = 0; t < OPEN_TRIES; t++) { const y = yAt(fy + t * 0.381966); if (!ys.includes(y)) ys.push(y); }
  for (const force of [false, true]) {
    if (force && o.force !== true) break;
    for (const y of ys) {
      const d = draw(y, rng.clone(), gx0, gx1), floorY = d.floorY;
      // 豎井候選欄：屋內兩欄都是空氣、不是箱子 / 工作台那欄（離屋子中央近的先）
      const up: ShaftCol[] = [];
      for (let sx = x + 1; sx + 1 < x + w - 1; sx++) if (d.g.getFg(sx, floorY - 1) === T.AIR && d.g.getFg(sx + 1, floorY - 1) === T.AIR) up.push({ sx, start: y });
      const mid = x + (w >> 1);
      up.sort((a, b) => Math.abs(a.sx - mid) - Math.abs(b.sx - mid) || a.sx - b.sx);
      const r = reachRoom({ c, g: d.g, box: { x: bx, y, w: bw, h }, starts: [[d.chest.x, d.chest.y]], floorOf: (xx, yy) => yy === floorY - 1 && d.g.getFg(xx, yy) === T.AIR,
        open, up, down: null, downLimit: () => 0 }, force);
      if (r) return finish(d, r.x0, r.x1, r.top, r.bottom, r.g, r.parts);
    }
  }
  if (o.force === true) throw new RangeError(`gen2: home cabin ${c.id} has no reachable layout`);
  return null;
}
