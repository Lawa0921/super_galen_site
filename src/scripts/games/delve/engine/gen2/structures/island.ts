// island.ts — gen2 有建物的島（M2a Task 20，spec §8「島：有建物的島（燈塔 / 隱士 / 沉船島）」）：島槽的表層藍圖，kind 'island'、variant = 島的種類。
// 島的地形、表層與樹照舊（Profile2 的島欄 + fill.ts），建物蓋在上面（表層藍圖的外框內不長樹）。c.region = 島本身的 RegionInfo（BlueprintIndex 傳；
// slotOf 反查照舊回海），c.slotX0 / slotX1 = 海槽。SURFACE 層：只讀 c.profile、不讀 groundAt（Q4）。
//   · lighthouse：石磚塔寬 TOWER_W（5）、高 18–24（地板到屋頂），一樓兩側牆底各一個 3 格高的門洞（兩端島灘都走得進來）；塔內每 4 格一層木平台（從下往上跳得穿、
//     站得住，可以一路爬到頂）、頂層的燈室掛吊燈（光源）+ 玻璃背牆 + 兩側窗、頂層平台上 'ruin' 箱；一樓中央守望石像（地標 T.GUARDIAN_STATUE、site 'lighthouse'）。
//     塔址 = 島灘以內、塔連兩側整平帶（hermitHut.levelSite，各 LEVEL_SIDE 欄緩坡）起伏最小的位置；地面 = 塔下地表中位數；外框整片 solid、ground 覆寫整平的欄。
//   · hermit：隱士木屋 = Task 18 的 buildHermitHutBp（drawHermitHut，寬 9–11），可用範圍 = 島灘以內；site = { kind: 'hermit', key: 's' + id, rot: 0, at }。
//   · wreck：擱淺在島灘上的船殼（shipwreck.drawHull，M1 沉船的同一個形狀函式）+ 'ruin' 箱：船從島的一端離水 1 欄起（端點依雜湊），
//     龍骨 = 船寬內地表平均 + 2（半埋），龍骨以下到天然地面之間補沙（低的那側船底不懸空）；全部在島欄上（水面以上、沒有液體）。
//   · plain：null（只有地形與樹）。
// 本資料夾的非測試檔不得出現連續兩個星號、亂數與超越函數（測試會 grep），註解一律用 //。
import { T, W, isSolidTile } from '../../tiles';
import { HRng } from '../hrng';
import { BpCanvas } from '../draw/bpCanvas';
import { BpGrid, emptyObjects, BP_SURFACE, KEEP, SLOT_PAD, type Blueprint, type BpCtx } from '../bpcore';
import type { IslandType } from '../layout';
import { buildHermitHutBp, flattestX, levelRows, levelSite, medianFloor, LEVEL_SIDE } from './hermitHut';
import { drawHull } from './shipwreck';

// 島灘（fill.ts 的 ISLAND_BEACH：離水這麼多格內是沙灘）：燈塔 / 隱士屋的外框在它以內
const SHORE = 4;
// 燈塔：寬、高 [lo, hi)、平台間距、地基列數
export const TOWER_W = 5;
const TOWER_H: readonly [number, number] = [18, 25], FLOOR_GAP = 4, FOUNDATION = 2;

export function buildIslandBp(c: BpCtx, type: IslandType): Blueprint | null {
  // ctx.ver 0 的規則
  if (type === 'plain') return null;
  if (c.region.kind !== 'island') throw new RangeError(`gen2: island blueprint ${c.id} needs the island region`);
  if (type === 'hermit') return hermitIsle(c);
  return type === 'lighthouse' ? lighthouse(c) : wreckIsle(c);
}

// 隱士島：同一個建構器，可用範圍換成島灘以內（buildHermitHutBp 的外框在 [slotX0 + SLOT_PAD, slotX1 − SLOT_PAD) 內）
function hermitIsle(c: BpCtx): Blueprint {
  const r = c.region, b = buildHermitHutBp({ ...c, slotX0: r.x0 + SHORE - SLOT_PAD, slotX1: r.x1 - SHORE + SLOT_PAD });
  return { ...b, kind: 'island', variant: 'hermit' };
}

function lighthouse(c: BpCtx): Blueprint {
  const p = c.profile, r = c.region, rng = new HRng(c.s, c.id), H = rng.int(TOWER_H[0], TOWER_H[1]), Wd = TOWER_W + 2 * LEVEL_SIDE;
  const lo = r.x0 + SHORE, hi = r.x1 - SHORE - Wd, mid = r.x0 + ((r.x1 - r.x0 - Wd) >> 1);
  if (hi < lo) throw new RangeError(`gen2: lighthouse ${c.id} does not fit island [${r.x0}, ${r.x1})`);
  const bx = flattestX(p, lo, hi, Wd, mid), tx = bx + LEVEL_SIDE, tx1 = tx + TOWER_W - 1, floorY = medianFloor(p, tx, TOWER_W), roof = floorY - H;
  const lv = levelRows(p, bx, Wd, tx, TOWER_W, floorY), y0 = Math.min(lv.y0, roof - 1), y1 = Math.max(lv.y1, floorY + FOUNDATION);
  const cv = new BpCanvas({ x: bx, y: y0, w: Wd, h: y1 - y0 }, p);
  levelSite(cv, tx, tx1, floorY);
  // 平台：一樓地板（floorY）往上每 FLOOR_GAP 列一層，最上面一層離屋頂 ≥ FLOOR_GAP（燈室站得下：角色 3 格高）
  let top = floorY;
  while (top - FLOOR_GAP >= roof + FLOOR_GAP) top -= FLOOR_GAP;
  // 地基 + 一樓地板、屋頂上的兩個垛口
  for (let x = tx; x <= tx1; x++) for (let y = floorY; y < floorY + FOUNDATION; y++) cv.setFg(x, y, T.STONE_BRICK);
  cv.setFg(tx + 1, roof - 1, T.STONE_BRICK); cv.setFg(tx + 3, roof - 1, T.STONE_BRICK);
  for (let y = roof; y < floorY; y++) for (let x = tx; x <= tx1; x++) {
    const wallCol = x === tx || x === tx1, lamp = y < top;
    if (y === roof) { cv.setFg(x, y, T.STONE_BRICK); continue; }
    // 牆：一樓門洞（兩側）、燈室的窗（兩側，頂層平台上 1–2 列）
    if (wallCol) { const hole = y >= floorY - 3 || (y >= top - 2 && y < top); cv.setFg(x, y, hole ? T.AIR : T.STONE_BRICK); cv.setWall(x, y, W.STONE_BRICK_WALL); continue; }
    cv.setFg(x, y, (floorY - y) % FLOOR_GAP === 0 && y >= top ? T.PLATFORM : T.AIR);
    cv.setWall(x, y, lamp ? W.GLASS_WALL : W.STONE_BRICK_WALL);
  }
  // 燈室：屋頂下的吊燈、頂層平台上的箱子；一樓中央的守望石像
  cv.setFg(tx + 2, roof + 1, T.LANTERN);
  cv.chest(rng.chance(2) ? tx + 1 : tx + 3, top - 1, 'ruin');
  cv.setFg(tx + 2, floorY - 1, T.GUARDIAN_STATUE);
  // 免挖洞箱 = 整個外框
  cv.fillNatural(bx, y0); cv.fillNatural(bx + Wd - 1, y1 - 1);
  const b = cv.toBlueprint(c.id, 'island', BP_SURFACE, { landmarks: [{ x: tx + 2, y: floorY - 1, tile: T.GUARDIAN_STATUE, site: 'lighthouse' }] });
  return { ...b, variant: 'lighthouse' };
}

function wreckIsle(c: BpCtx): Blueprint {
  const p = c.profile, r = c.region, rng = new HRng(c.s, c.id);
  const w = rng.int(18, 27), hh = rng.int(6, 9), bx = rng.chance(2) ? r.x0 + 1 : r.x1 - 1 - w;
  let sum = 0;
  for (let x = bx; x < bx + w; x++) sum += p.surfaceAt(x);
  const keel = Math.round(sum / w) + 2, gunwale = keel - hh + 1;
  // 船內某欄的地板：地面或龍骨，取淺的（同 M1 沉船）
  const floorAt = (x: number): number => Math.min(p.surfaceAt(x), keel);
  const cxm = bx + (w >> 1), mx = cxm + rng.int(-2, 3), stub = rng.int(1, 5);
  let cx = rng.int(bx + 3, bx + w - 3);
  if (Math.abs(cx - mx) < 2) cx = mx + 2 <= bx + w - 4 ? mx + 2 : mx - 2;
  const chestY = floorAt(cx) - 1, top = Math.min(gunwale - stub, chestY);
  let low = keel;
  for (let x = bx; x < bx + w; x++) low = Math.max(low, p.surfaceAt(x) - 1);
  const g = new BpGrid(bx, top, w, low - top + 1);
  // 島上沒有水：實心格照 M1 清水、非實心格保留（KEEP）
  const put = (x: number, y: number, t: number): void => { g.fg(x, y, t); g.liq(x, y, isSolidTile(t) ? 0 : KEEP); };
  const wall = (x: number, y: number): void => g.wall(x, y, W.DARK_PLANK_WALL);
  // 擱淺：龍骨以下到天然地面之間補沙
  for (let x = bx; x < bx + w; x++) for (let y = keel + 1; y < p.surfaceAt(x); y++) g.fg(x, y, T.SAND);
  drawHull({ put, wall }, bx, w, keel, { hh, mast: mx, stub, floorAt }, rng);
  put(cx, chestY, T.CHEST);
  return { id: c.id, kind: 'island', layer: BP_SURFACE, x: bx, y: top, w, h: low - top + 1, cells: g.cells(), chests: [{ x: cx, y: chestY, kind: 'ruin' }], ...emptyObjects(), variant: 'wreck' };
}
