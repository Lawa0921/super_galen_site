// underground.test.ts — gen2 礦坑、密室、空島（M2a Task 10；spec §4.4「至少 3 個密室；小屋、遺跡、礦坑、空島」）：
// 家鄉的密室錨點與空島錨點、機率表（地下層礦坑 0.15、非家鄉大陸天空層空島 0.06）、礦坑總寬上限（Q3）、空島相對 profile 地表（Q4）、
// 畫圖時依賴實心的格在成品裡真的是實心（BpCanvas 回退不知道洞穴 → solid 蓋住）、SKY 層接進 overlapping / anchorBlueprint、
// 錨點在最窄的可用範圍內也放得下（不靠 placeX 的夾位置）、新錨點不壓到地廳的後備豎井（Task 9）。
import { describe, it, expect } from 'vitest';
import { Column } from '../column';
import { T, LIGHT_LUT, isSolidTile } from '../tiles';
import { seedInt } from '../noise';
import { BP_SURFACE, BP_UNDER, BP_DEEP, BP_SKY, KEEP, crossYields, emptyObjects, landSlot, slotOf, structureId, type Blueprint, type BpChest, type BpCtx, type Layer } from './blueprint';
import { ANCHOR_MAX_W, anchorSpan, type Anchor } from './anchors';
import { SPAWN_X, type Landmass } from './layout';
import { shaftX, SHAFT_REACH } from './caves';
import { buildMineshaftBp } from './structures/mineshaft';
import { buildSkyIslandBp, ropeFallback } from './structures/skyIsland';
import { COL_LAND } from './profile';
import { entranceHit } from '../genPrims';
import { buildHallBp } from './structures/hall';
import { BpCanvas } from './draw/bpCanvas';
import { drawMineshaft, drawRamp, drawSecretRoom, rampSteps, secretRoomLayout } from './draw/mineshaft';
import type { Canvas } from './draw/canvas';
import { HRng } from './hrng';
import { Filler2 } from './fill';
import type { BlueprintIndex } from './blueprint';
import { SEEDS5, SEEDS50, bytes, fillCol, homeBlueprints, loadColumns, overlapPairs, srcOf, walkOut, worldOf } from './testUtil';
import { Gen2Source } from './index';
import type { World } from '../world';

const homeOf = (src: Gen2Source): Landmass => src.layout.landmassAt(SPAWN_X)!;
const boxesMeet = (a: { x: number; y: number; w: number; h: number }, b: { x: number; y: number; w: number; h: number }): boolean =>
  a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
// 會發光的 tile
const GLOWING = new Set<number>(Object.values(T).filter((t) => LIGHT_LUT[t] > 0));

// 從密室的 secret 箱子那格做 4 鄰洪水填充（走不是實心的格）：走到的格都在密室室內的可能範圍內
// （室內 6 列、地板列 = 箱子那列；寬 ≤ 12、箱子離室內兩端 2–3 格 → 箱子 ± 10 欄），碰到的實心邊上有裂紋石塞，走到的格都不發光
function secretRoomSealed(w: World, c: BpChest): boolean {
  const seen = new Set<string>([`${c.x},${c.y}`]), st: [number, number][] = [[c.x, c.y]];
  let cracked = false;
  while (st.length) {
    const [x, y] = st.pop()!;
    if (Math.abs(x - c.x) > 10 || y > c.y || y < c.y - 5) return false;
    if (GLOWING.has(w.getFg(x, y))) return false;
    for (const [nx, ny] of [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]]) {
      const t = w.getFg(nx, ny);
      if (t === T.CRACKED_STONE) cracked = true;
      if (isSolidTile(t) || seen.has(`${nx},${ny}`)) continue;
      seen.add(`${nx},${ny}`); st.push([nx, ny]);
    }
  }
  return cracked;
}
// 藍圖裡 T.ROPE 格的 x 與最低的 y
function ropeOf(b: Blueprint): { x: number; y1: number } | null {
  let out: { x: number; y1: number } | null = null;
  for (let i = 0; i < b.cells.length; i += 5) if (b.cells[i + 2] === T.ROPE && (!out || b.cells[i + 1] > out.y1)) out = { x: b.cells[i], y1: b.cells[i + 1] };
  return out;
}
// 依序找種子（SEEDS5）家鄉裡第一份跨欄（外框跨兩個 32 格欄、而且 b.x + 1 還在第一欄裡）的 kind 藍圖
function firstCrossing(kind: string): { src: Gen2Source; b: Blueprint } {
  for (const seed of SEEDS5) for (const b of homeBlueprints(seed)) {
    if (b.kind === kind && (b.x >> 5) !== ((b.x + b.w - 1) >> 5) && (b.x & 31) < 31) return { src: srcOf(seed), b };
  }
  throw new Error(`no crossing ${kind}`);
}
// 錨點 a 的 BpCtx（照 BlueprintIndex：structureId、anchorSpan），可另給可用範圍
function anchorCtx(seed: string, a: Anchor, span?: { x0: number; x1: number }): BpCtx {
  const src = srcOf(seed), m = homeOf(src), sp = span ?? anchorSpan(seed, a);
  return { seed, s: seedInt(seed, 'g2-bp'), id: structureId(m.side, m.i, a.region.index, a.slot, a.layer), slotX0: sp.x0, slotX1: sp.x1,
    region: a.region, profile: src.profile, ver: m.ver, groundAt: (x) => src.surfaceAt(x), rank: 0, spawnX: SPAWN_X };
}
// "x,y" → fg（只收畫了 fg 的格）
function cellMap(b: Blueprint): Map<string, number> {
  const m = new Map<string, number>();
  for (let i = 0; i < b.cells.length; i += 5) if (b.cells[i + 2] !== KEEP) m.set(`${b.cells[i]},${b.cells[i + 1]}`, b.cells[i + 2]);
  return m;
}
// 礦坑的幾何（從藍圖還原）：礦車地標在地板上一列（yTop + 3）；軌道 / 礦車那一列的最左到最右 = 坑道 [x0, x1]
function shaftOf(b: Blueprint): { x0: number; x1: number; yTop: number } {
  const cart = b.landmarks[0], yTop = cart.y - 3, at = cellMap(b);
  let x0 = Infinity, x1 = -Infinity;
  // 家鄉礦坑的石碑（Task 14）蓋掉坑道站立列的一格軌道（密室裡的石碑不算：密室地板與站立列同一列）
  const inSecret = (x: number): boolean => !!b.secret && x >= b.secret.x && x < b.secret.x + b.secret.w;
  for (let x = b.x; x < b.x + b.w; x++) { const t = at.get(`${x},${yTop + 3}`); if (t === T.RAIL || t === T.ORE_CART || (t === T.LORE_TABLET && !inSecret(x))) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); } }
  return { x0, x1, yTop };
}
// 斜坡（坑道左端外、藍圖畫了空氣的欄）每欄最低的空氣格；左側有密室 = 沒有斜坡
function rampFeet(b: Blueprint, shaftX0: number): { x: number; y: number }[] {
  if (b.chests.some((c) => c.kind === 'secret' && c.x < shaftX0)) return [];
  // 後備豎井（Task 10 修正 1）那兩欄不算（繩梯在左欄）
  const shaftCols = new Set<number>();
  for (let i = 0; i < b.cells.length; i += 5) if (b.cells[i + 2] === T.ROPE) { shaftCols.add(b.cells[i]); shaftCols.add(b.cells[i] + 1); }
  const low = new Map<number, number>();
  for (let i = 0; i < b.cells.length; i += 5) {
    const x = b.cells[i], y = b.cells[i + 1];
    if (x < shaftX0 && !shaftCols.has(x) && b.cells[i + 2] === T.AIR) low.set(x, Math.max(low.get(x) ?? -1, y));
  }
  return [...low].map(([x, y]) => ({ x, y }));
}
// 外圍：東西兩側前幾片地塊裡的某種藍圖
function outerOf(seed: string, kind: string, layers: readonly Layer[]): Blueprint[] {
  const src = srcOf(seed), h = src.layout.origin.home!;
  return src.blueprints.overlapping(-30_000, 30_000, layers).filter((b) => b.kind === kind && (b.x + b.w <= h.x0 || b.x >= h.x1));
}
// 只記 fg 的畫布（測 drawRamp：讀不到的格一律空氣、不是實心）
function mapCanvas(): Canvas & { cells: Map<string, number> } {
  const cells = new Map<string, number>();
  const fg = (x: number, y: number): number => cells.get(`${x},${y}`) ?? T.AIR;
  return {
    cells, inBounds: () => true, fg, wall: () => 0, isSolid: (x, y) => isSolidTile(fg(x, y)), setFg: (x, y, t) => { cells.set(`${x},${y}`, t); },
    setWall: () => {}, clearLiquid: () => {}, setSurface: () => {}, surfaceAt: () => 0, chest: () => {}, addItem: () => {}, potDrop: () => {}, fillNatural: () => {},
  };
}

describe('gen2 礦坑、密室、空島', () => {
  // 礦坑的硬性保證 ≥ 3（= 3 個密室礦坑錨點；控制者裁決 D）；平均 ≥ 4 由下面 1500 個種子的測試驗
  it('§4.4：家鄉 ≥ 3 間密室（裂紋石塞、secret 箱、洪水填充不出密室、不發光）、≥ 3 條礦坑、≥ 2 座空島', () => { for (const seed of SEEDS5) { const bp = homeBlueprints(seed);
    const shafts = bp.filter((b) => b.kind === 'mineshaft'), secrets = shafts.flatMap((b) => b.chests.filter((c) => c.kind === 'secret'));
    expect(secrets.length).toBeGreaterThanOrEqual(3); expect(shafts.length, seed).toBeGreaterThanOrEqual(3); expect(bp.filter((b) => b.kind === 'sky_island').length).toBeGreaterThanOrEqual(2);
    const w = worldOf(srcOf(seed)); for (const c of secrets) { loadColumns(w, c.x - 20, c.x + 20); expect(secretRoomSealed(w, c), `${seed} ${c.x},${c.y}`).toBe(true); } } }, 120_000);

  it('空島：箱子 sky、島身（繩梯以外的格）底部在地表上方 > 20、繩梯下端離地 ≤ 3、外框往下包到繩梯下端', () => { let n = 0; for (const seed of SEEDS5) for (const b of homeBlueprints(seed).filter((q) => q.kind === 'sky_island')) {
    const src = srcOf(seed), rope = ropeOf(b)!; expect(b.chests[0].kind).toBe('sky'); n++;
    // 量島身、不量外框（理由：外框要往下包到繩梯下端，Task 6 延續事項，所以 b.y + b.h 一定在地表附近）
    let body = -1;
    for (let i = 0; i < b.cells.length; i += 5) if (b.cells[i + 2] !== KEEP && b.cells[i + 2] !== T.ROPE && b.cells[i + 2] !== T.AIR) body = Math.max(body, b.cells[i + 1]);
    expect(body).toBeLessThan(src.surfaceAt(b.x) - 20);
    expect(src.surfaceAt(rope.x) - rope.y1).toBeLessThanOrEqual(4); expect(rope.y1).toBeLessThan(b.y + b.h);
    expect(b.landmarks).toEqual([expect.objectContaining({ tile: T.GUARDIAN_STATUE, site: 'sky_island' })]);
    expect(cellMap(b).get(`${b.landmarks[0].x},${b.landmarks[0].y}`)).toBe(T.GUARDIAN_STATUE);
  } expect(n).toBe(2 * SEEDS5.length); }, 120_000);

  it('空島的繩梯在成品裡：下端離正下方第一個實心格 ≤ 3 格、中間沒有液體（不掛在地表入口坑 / 水面上；家鄉 40 個種子 + 外圍）', () => {
    let n = 0;
    const check = (seed: string, b: Blueprint, w: World): void => {
      const rope = ropeOf(b)!;
      loadColumns(w, rope.x, rope.x + 1);
      let y = rope.y1 + 1;
      while (y < w.height && !isSolidTile(w.getFg(rope.x, y))) { expect(w.getLiquid(rope.x, y), `${seed} ${b.x} water at ${y}`).toBe(0); y++; }
      expect(y - rope.y1, `${seed} sky_island ${b.x}`).toBeLessThanOrEqual(3);
      n++;
    };
    for (const seed of [...SEEDS5, ...SEEDS50.slice(0, 35)]) { const w = worldOf(srcOf(seed)); for (const b of homeBlueprints(seed).filter((q) => q.kind === 'sky_island')) check(seed, b, w); }
    // 外圍：SEEDS5 + SEEDS50 的前 3 個（Task 21：大陸錨點的種類換了之後，SEEDS5 外圍只剩 5 座機率空島——空島讓位給表層藍圖，加種子保持 > 5 座）
    let outer = 0;
    for (const seed of [...SEEDS5, ...SEEDS50.slice(0, 3)]) { const w = worldOf(srcOf(seed)); for (const b of outerOf(seed, 'sky_island', [BP_SKY])) { check(seed, b, w); outer++; } }
    expect(n).toBe(80 + outer); expect(outer).toBeGreaterThan(5);
  }, 240_000);

  // Task 21 延後事項 6：家鄉空島錨點的繩梯要有構造保證（原本 4 個候選繩梯欄在可用範圍內處處接不到地面時，force 照放、沒有繩梯）
  it('空島錨點一定有繩梯（Task 21）：ropeFallback 在島下任一欄找得到就用；整個可用範圍都接不到地面（海上）→ RangeError；家鄉選的天空槽都有掛得了繩梯的欄', () => {
    // 只有第 130 欄接得到地面：4 個候選欄（x0 + iw − 5 / + 4 / + iw − 8 / + 7）碰不到它的位置也找得到
    const one = (x: number): boolean => x === 130;
    const f = ropeFallback(100, 200, 40, 130, one)!;
    expect(f.rx).toBe(130); expect(f.x0).toBeGreaterThanOrEqual(108); expect(f.x0 + 40).toBeLessThanOrEqual(192);
    expect(f.rx).toBeGreaterThanOrEqual(f.x0 + 4); expect(f.rx).toBeLessThan(f.x0 + 40 - 4);
    // 可用範圍 [lo + 12, hi − 12) 的每一欄都找得到；範圍外的找不到
    for (let x = 112; x < 188; x++) expect(ropeFallback(100, 200, 48, 150, (q) => q === x)?.rx, `col ${x}`).toBe(x);
    expect(ropeFallback(100, 200, 40, 130, (q) => q < 112 || q >= 188)).toBeNull();
    // 海上（每欄都是海）的錨點：丟 RangeError，不默默放一座沒有繩梯的空島
    const src = srcOf(SEEDS5[0]), sea = src.layout.landmass(1, 1), sl = sea.slots[0];
    const c: BpCtx = { seed: SEEDS5[0], s: seedInt(SEEDS5[0], 'g2-bp'), id: structureId(1, 1, 0, 0, BP_SKY), slotX0: sl.x0, slotX1: sl.x1, region: sea.regions[0], profile: src.profile, ver: 0, groundAt: (x) => src.surfaceAt(x) };
    expect(() => buildSkyIslandBp(c)).toThrow(RangeError);
    // 家鄉：每座空島錨點的可用範圍 [x0 + 12, x1 − 12) 都有陸地、非地表入口的欄（anchors 的 ropeable，ropeFallback 一定找得到），藍圖都有繩梯
    let n = 0;
    for (const seed of [...SEEDS5, ...SEEDS50.slice(0, 35)]) {
      const g = srcOf(seed), m = homeOf(g), sEnt = seedInt(seed, 'g2-entrance');
      for (const a of g.blueprints.anchorsOf(m).filter((q) => q.kind === 'sky_island')) {
        const sp = anchorSpan(seed, a);
        let ok = false;
        for (let x = sp.x0 + 12; x < sp.x1 - 12 && !ok; x++) ok = g.profile.info(x).kind === COL_LAND && !entranceHit(x, sEnt);
        expect(ok, `${seed} sky ${sp.x0}`).toBe(true);
        expect(ropeOf(g.blueprints.anchorBlueprint(m, a)!), `${seed} sky ${sp.x0}`).not.toBeNull();
        n++;
      }
    }
    expect(n).toBe(80);
  }, 120_000);

  it('分段填 = 整欄填（礦坑、空島各一份跨欄的）', () => { for (const k of ['mineshaft', 'sky_island']) { const { src, b } = firstCrossing(k), cx = b.x >> 5;
    const parts = new Column(cx, 1200); src.fill(parts, cx * 32, b.x + 1); src.fill(parts, b.x + 1, cx * 32 + 32); expect(bytes(parts)).toEqual(bytes(fillCol(src, cx))); } }, 60_000);

  it('礦坑總寬 ≤ 154（長 + 斜坡 + 密室，Q3）、50 個種子的 secret 錨點都建得出來', () => { for (const seed of SEEDS50) {
    const src = srcOf(seed), m = homeOf(src), anchors = src.blueprints.anchorsOf(m).filter((a) => a.kind === 'mineshaft_secret');
    expect(anchors.length).toBe(3);
    for (const a of anchors) { const b = src.blueprints.anchorBlueprint(m, a); expect(b?.kind, seed).toBe('mineshaft'); expect(b!.chests.some((c) => c.kind === 'secret')).toBe(true); }
    for (const b of homeBlueprints(seed).filter((q) => q.kind === 'mineshaft')) {
      expect(b.w, `${seed} ${b.x}`).toBeLessThanOrEqual(154); const s = slotOf(b.id, src.layout); expect(b.x).toBeGreaterThanOrEqual(s.x0 + 8); expect(b.x + b.w).toBeLessThanOrEqual(s.x1 - 8); } } }, 300_000);

  it('礦坑：礦車地標（site mineshaft）停在軌道上、坑道 4 列；坑道頂板 / 地板、斜坡每階腳下那格在成品裡是實心（solid = 整個外框），4 列都有背景牆', () => {
    const cases: { seed: string; b: Blueprint }[] = [];
    for (const seed of SEEDS5.slice(0, 3)) for (const b of homeBlueprints(seed).filter((q) => q.kind === 'mineshaft')) cases.push({ seed, b });
    // 外圍的機率礦坑：取有斜坡的（斜坡只在機率擲出的礦坑上）
    let ramps = 0;
    for (const b of outerOf(SEEDS5[0], 'mineshaft', [BP_UNDER])) { if (ramps >= 6) break; if (rampFeet(b, shaftOf(b).x0).length) { cases.push({ seed: SEEDS5[0], b }); ramps++; } }
    expect(ramps).toBeGreaterThanOrEqual(3);
    const holes: string[] = [], worlds = new Map<string, World>();
    for (const { seed, b } of cases) {
      const w = worlds.get(seed) ?? worldOf(srcOf(seed)); worlds.set(seed, w);
      loadColumns(w, b.x, b.x + b.w);
      expect(b.landmarks).toHaveLength(1); expect(b.landmarks[0]).toMatchObject({ tile: T.ORE_CART, site: 'mineshaft' });
      const { x0, x1, yTop } = shaftOf(b), cart = b.landmarks[0];
      expect(w.getFg(cart.x, cart.y)).toBe(T.ORE_CART); expect(x1 - x0 + 1).toBeGreaterThanOrEqual(40);
      expect(b.solid).toEqual({ x: b.x, y: b.y, w: b.w, h: b.h });
      // 後備豎井（往上 / 往下，Task 10 修正 1）那兩欄的頂板 / 地板是挖開的（繩梯在左欄）
      const rope = new Set<number>(); for (let i = 0; i < b.cells.length; i += 5) if (b.cells[i + 2] === T.ROPE) { rope.add(b.cells[i]); rope.add(b.cells[i] + 1); }
      for (let x = x0; x <= x1; x++) {
        if (rope.has(x)) continue;
        if (!isSolidTile(w.getFg(x, yTop - 1))) holes.push(`${seed} roof ${x},${yTop - 1}`);
        if (!isSolidTile(w.getFg(x, yTop + 4))) holes.push(`${seed} floor ${x},${yTop + 4}`);
        for (let y = yTop; y < yTop + 4; y++) if (w.getWall(x, y) === 0) holes.push(`${seed} wall ${x},${y}`);
      }
      for (const f of rampFeet(b, x0)) if (!isSolidTile(w.getFg(f.x, f.y + 1))) holes.push(`${seed} ramp ${f.x},${f.y + 1}`);
    }
    expect(holes.slice(0, 5), `${holes.length} holes`).toEqual([]);
  }, 180_000);

  it('家鄉的密室錨點礦坑沒有斜坡（沒有往上通地表的豎井時，外框整個在槽中心地表下 ≥ 24）；外圍的機率礦坑有斜坡、左側 / 右側密室都有', () => {
    for (const seed of SEEDS5) { const src = srcOf(seed), m = homeOf(src);
      for (const a of src.blueprints.anchorsOf(m).filter((q) => q.kind === 'mineshaft_secret')) {
        const b = src.blueprints.anchorBlueprint(m, a)!, sp = anchorSpan(seed, a);
        expect(rampFeet(b, shaftOf(b).x0), seed).toEqual([]);
        if (!ropeOf(b) || ropeOf(b)!.y1 > b.landmarks[0].y) expect(b.y, seed).toBeGreaterThanOrEqual(src.profile.surfaceAt((sp.x0 + sp.x1) >> 1) + 24);
      } }
    let ramp = 0, left = 0, right = 0, secret = 0, total = 0;
    for (const seed of SEEDS5.slice(0, 2)) for (const b of outerOf(seed, 'mineshaft', [BP_UNDER])) {
      const s = shaftOf(b), c = b.chests.find((q) => q.kind === 'secret');
      total++;
      if (rampFeet(b, s.x0).length) ramp++;
      if (c) { secret++; if (c.x < s.x0) left++; else right++; }
    }
    expect(total).toBeGreaterThan(20); expect(ramp).toBeGreaterThan(0); expect(left).toBeGreaterThan(0); expect(right).toBeGreaterThan(0);
    // 機率礦坑的密室 25%（樣本裡 10%–45%）
    expect(secret / total).toBeGreaterThan(0.1); expect(secret / total).toBeLessThan(0.45);
  }, 120_000);

  it('左側密室的幾何（drawSecretRoom right = false）：塞子在坑道左端外 2 欄、室內在塞子左邊、箱子在室內左起第 3 格、石殼外框 = secretRoomLayout', () => {
    const src = srcOf('sr'), x0 = 3000, yTop = src.profile.surfaceAt(x0) + 60, rw = 10;
    const cv = new BpCanvas({ x: x0 - 30, y: yTop - 10, w: 140, h: 24 }, src.profile);
    drawMineshaft(cv, { x0, len: 80, yTop }, new HRng(1, 2));
    const lay = { shaftX0: x0, shaftLen: 80, yTop, right: false, rw }, r = drawSecretRoom(cv, lay, new HRng(1, 3)), L = secretRoomLayout(lay);
    expect(L).toEqual({ plug0: x0 - 2, rx0: x0 - 2 - rw, ry0: yTop - 2, shell: { x: x0 - 4 - rw, y: yTop - 4, w: rw + 4, h: 11 } });
    expect(r).toMatchObject({ x: x0 - 2 - rw, y: yTop - 2, w: rw, h: 6, chest: { x: x0 - rw, y: yTop + 3 } });
    const b = cv.toBlueprint(1, 'mineshaft', 1), at = cellMap(b);
    for (let y = yTop; y < yTop + 4; y++) for (const dx of [1, 2]) expect(at.get(`${x0 - dx},${y}`)).toBe(T.CRACKED_STONE);
    for (let y = L.shell.y; y < L.shell.y + L.shell.h; y++) expect(at.get(`${L.shell.x},${y}`)).toBe(T.STONE);
    expect(b.chests.find((c) => c.x === r.chest.x)!.kind).toBe('secret');
    // 密室（塞子起往左）不放發光物
    expect([...at.entries()].filter(([k, t]) => GLOWING.has(t) && Number(k.split(',')[0]) < x0)).toEqual([]);
  });

  it('drawRamp：xMin 預設 −∞（不停在舊世界的左緣 2）、頭頂高過 surfaceAt − 1 就停；rampSteps = 畫了的欄數；腳下不是實心補木板', () => {
    const x0 = 10, yTop = 340, surf = 300, cv = mapCanvas();
    drawRamp(cv, { x0, yTop }, () => surf);
    const xs = [...cv.cells.keys()].map((k) => Number(k.split(',')[0]));
    const steps = rampSteps({ x0, yTop }, () => surf);
    // 第 s 欄頭頂 = yTop − s，yTop − s < surf − 1 → s = yTop − surf + 2
    expect(steps).toBe(yTop - surf + 2); expect(Math.min(...xs)).toBe(x0 - steps); expect(Math.min(...xs)).toBeLessThan(2); expect(Math.max(...xs)).toBe(x0 - 1);
    for (let s = 1; s <= steps; s++) { expect(cv.cells.get(`${x0 - s},${yTop - s}`)).toBe(T.AIR); expect(cv.cells.get(`${x0 - s},${yTop + 4 - s}`)).toBe(T.PLANKS); }
    // xMin：x < xMin 的欄不畫，rampSteps 一樣
    const cv2 = mapCanvas(); drawRamp(cv2, { x0, yTop, xMin: 2 }, () => surf);
    expect(Math.min(...[...cv2.cells.keys()].map((k) => Number(k.split(',')[0])))).toBe(2); expect(rampSteps({ x0, yTop, xMin: 2 }, () => surf)).toBe(8);
    // 地表高低不平：每欄照自己的 surfaceAt 判（往左越低：340 − s < 329 + 2s → s = 4）
    const hill = (x: number): number => 330 + (x0 - x) * 2;
    expect(rampSteps({ x0, yTop }, hill)).toBe(4);
  });

  it('SKY 層接進 overlapping / anchorBlueprint：家鄉恰好 2 座空島 = 兩個 sky_island 錨點的藍圖；家鄉天空層沒有機率空島、空島底下那個表層槽不擲機率', () => { for (const seed of SEEDS5) {
    const src = srcOf(seed), m = homeOf(src), anchors = src.blueprints.anchorsOf(m).filter((a) => a.kind === 'sky_island');
    const sky = src.blueprints.overlapping(m.x0, m.x1, [BP_SKY]);
    expect(sky.map((b) => b.kind)).toEqual(['sky_island', 'sky_island']); expect(sky.every((b) => b.layer === BP_SKY)).toBe(true);
    expect(anchors.map((a) => src.blueprints.anchorBlueprint(m, a)!.id).sort()).toEqual(sky.map((b) => b.id).sort());
    // 底下那個表層槽不擲機率：只可能有那一槽自己的表層錨點（Task 11 修正 1 的空島退讓鏈 ③④：空島放在村莊 / 遺跡的槽、避開它的外框），而且不相交
    for (const a of anchors) { const sl = landSlot(a.region, a.slot, BP_SURFACE), own = src.blueprints.anchorsOf(m).find((q) => q.layer === BP_SURFACE && q.region === a.region && q.slot === a.slot);
      const ownBp = own ? src.blueprints.anchorBlueprint(m, own) : null, sky = src.blueprints.anchorBlueprint(m, a)!;
      expect(src.blueprints.overlapping(sl.x0, sl.x1, [BP_SURFACE]).filter((b) => b.x >= sl.x0 && b.x < sl.x1 && b !== ownBp), seed).toEqual([]);
      if (ownBp) expect(ownBp.x + ownBp.w <= sky.x || sky.x + sky.w <= ownBp.x, `${seed} sky over ${own!.kind}`).toBe(true); }
    // 預設的 overlapping 也含 SKY（fill 才蓋得到空島）
    expect(src.blueprints.overlapping(m.x0, m.x1).filter((b) => b.layer === BP_SKY).length).toBe(2);
  } }, 120_000);

  it('非家鄉大陸的天空層空島（0.06）：有、外框在自己的 340 格槽內、繩梯接地；海上沒有', () => {
    let n = 0, slots = 0;
    for (const seed of SEEDS5) { const src = srcOf(seed);
      for (const b of outerOf(seed, 'sky_island', [BP_SKY])) {
        n++; const s = slotOf(b.id, src.layout); expect(s.layer).toBe(BP_SKY); expect(s.region.kind).not.toBe('home');
        expect(b.x).toBeGreaterThanOrEqual(s.x0 + 8); expect(b.x + b.w).toBeLessThanOrEqual(s.x1 - 8);
        const rope = ropeOf(b)!; expect(src.surfaceAt(rope.x) - rope.y1).toBe(3);
      }
      for (let i = 1; i <= 6; i++) for (const side of [1, -1] as const) { const q = src.layout.landmass(side, i); if (q.kind === 'continent') slots += q.regions.reduce((a, r) => a + Math.floor((r.x1 - r.x0) / 340), 0); }
    }
    // 機率 0.06（含坑道的槽與讓位的不放，所以樣本比例 < 0.06）
    expect(n).toBeGreaterThan(0); expect(n / slots).toBeLessThan(0.09);
  }, 120_000);

  it('跨層：SKY 一律讓位給表層（表層不看 SKY，Q4）與液體；地下 / 深層照等級', () => {
    const box = (layer: Layer, kind: Blueprint['kind'], x: number, y: number, w: number, h: number): Blueprint => ({ id: 0, kind, layer, x, y, w, h, cells: new Int32Array(0), chests: [], ...emptyObjects() });
    const K = box(BP_SKY, 'sky_island', 0, 200, 40, 100), S_ = box(BP_SURFACE, 'ruin', 10, 280, 20, 20), L = box(BP_SURFACE, 'lake', 10, 280, 20, 20), U = box(BP_UNDER, 'mineshaft', 0, 290, 60, 20);
    expect(crossYields(K, 2, S_, 0)).toBe(true); expect(crossYields(K, 0, L, 0)).toBe(true); expect(crossYields(L, 0, K, 0)).toBe(false);
    expect(crossYields(U, 0, K, 2)).toBe(true); expect(crossYields(K, 2, U, 0)).toBe(false); expect(crossYields(K, 0, U, 0)).toBe(true);
    expect(crossYields(K, 2, box(BP_SURFACE, 'ruin', 500, 280, 20, 20), 0)).toBe(false);
  });

  it('錨點建構器在最窄的可用範圍（ANCHOR_MAX_W + 2 × SLOT_PAD）內也放得進去（不靠 placeX 的夾位置），同一個 ctx 算出相同藍圖', () => {
    let built = 0;
    for (const seed of SEEDS5) for (const a of srcOf(seed).blueprints.anchorsOf(homeOf(srcOf(seed)))) {
      if (a.kind !== 'mineshaft_secret' && a.kind !== 'sky_island') continue;
      const need = ANCHOR_MAX_W[a.kind]! + 16, sp = anchorSpan(seed, a), make = (c: BpCtx): Blueprint => (a.kind === 'sky_island' ? buildSkyIslandBp(c) : buildMineshaftBp(c, { secret: true }));
      for (const span of [{ x0: sp.x0, x1: sp.x0 + need }, { x0: sp.x1 - need, x1: sp.x1 }]) {
        const c = anchorCtx(seed, a, span), b = make(c);
        expect(b.x, `${seed} ${a.kind}`).toBeGreaterThanOrEqual(c.slotX0 + 8); expect(b.x + b.w, `${seed} ${a.kind}`).toBeLessThanOrEqual(c.slotX1 - 8);
        expect(b.w).toBeLessThanOrEqual(ANCHOR_MAX_W[a.kind]!);
        built++;
      }
      expect(make(anchorCtx(seed, a))).toEqual(make(anchorCtx(seed, a)));
    }
    expect(built).toBe(5 * (3 + 2) * 2);
  }, 60_000);

  it('1500 個種子：家鄉平均 ≥ 4 條礦坑（機率礦坑 0.45、可用含坑道槽的一側，控制者裁決 ②）、0 開機失敗、0 跨層重疊、每條礦坑外框都不碰坑道帶', () => {
    const dist: Record<number, number> = {}, errors: string[] = [];
    let total = 0, inShaftSlot = 0;
    for (let k = 0; k < 1500; k++) {
      const seed = `ug-${k}`;
      try {
        // 每個種子新建一份（不進 srcOf 的快取，免得 1500 份常駐）
        const g = new Gen2Source(seed), h = g.layout.origin.home!, bps = g.blueprints.overlapping(h.x0, h.x1), ss = seedInt(seed, 'g2-shaft');
        expect(overlapPairs(bps), seed).toEqual([]);
        const shafts = bps.filter((b) => b.kind === 'mineshaft');
        for (const b of shafts) {
          const s = slotOf(b.id, g.layout), sx = shaftX(ss, s.region);
          if (!Number.isFinite(sx)) continue;
          expect(b.x + b.w <= sx - SHAFT_REACH - 1 || b.x >= sx + SHAFT_REACH + 2, `${seed} mineshaft ${b.x}`).toBe(true);
          if (sx >= s.x0 && sx < s.x1) inShaftSlot++;
        }
        dist[shafts.length] = (dist[shafts.length] ?? 0) + 1; total += shafts.length;
      } catch (e) { if (!(e instanceof RangeError)) throw e; errors.push(`${seed}: ${e.message}`); }
    }
    expect(errors.slice(0, 3)).toEqual([]);
    expect(total / 1500).toBeGreaterThanOrEqual(4);
    // 含坑道槽的放寬真的有用到（上面的坑道帶斷言不是空測）
    expect(inShaftSlot).toBeGreaterThan(0);
  }, 300_000);

  it('礦坑都走得進去（Task 10 修正 1）：200 個家鄉的每條礦坑從礦車格出發，走得到外框外 ≥ 300 格或地表', () => {
    let shafts = 0;
    for (let k = 0; k < 200; k++) {
      const seed = `walk-${k}`, g = new Gen2Source(seed), w = worldOf(g);
      const h = g.layout.origin.home!;
      for (const b of g.blueprints.overlapping(h.x0, h.x1, [BP_UNDER]).filter((q) => q.kind === 'mineshaft')) {
        loadColumns(w, b.x - 80, b.x + b.w + 80);
        expect(walkOut(w, g, b), `${seed} mineshaft ${b.x}`).toBe(true);
        shafts++;
      }
    }
    expect(shafts).toBeGreaterThanOrEqual(800);
  }, 300_000);

  it('後備豎井（延長坑道也接不到洞穴，注入「探測全部不通」）：開口端 2 格寬、掛繩梯通到地表，外框往上延伸到地表、整片 solid；從地表走得到礦車', () => {
    // 密室錨點礦坑（一端開口）；與一份沒有斜坡、沒有密室（兩端都開口）的礦坑：照錨點的可用範圍、不強制密室來建，找第一個這樣的
    const plain = SEEDS50.flatMap((seed) => srcOf(seed).blueprints.anchorsOf(homeOf(srcOf(seed))).filter((q) => q.kind === 'mineshaft_secret').map((a) => ({ seed, a })))
      .find(({ seed, a }) => { const b = buildMineshaftBp(anchorCtx(seed, a), { caveOpen: () => false }); return !b.chests.some((q) => q.kind === 'secret') && [...cellMap(b).values()].includes(T.ROPE); })!;
    expect(plain).toBeDefined();
    const first = srcOf(SEEDS5[0]).blueprints.anchorsOf(homeOf(srcOf(SEEDS5[0]))).find((q) => q.kind === 'mineshaft_secret')!;
    for (const [seed, a, secret] of [[SEEDS5[0], first, true], [plain.seed, plain.a, false]] as const) {
      const src = srcOf(seed), m = homeOf(src), real = src.blueprints.anchorBlueprint(m, a)!;
      const c = anchorCtx(seed, a), bp = secret ? buildMineshaftBp(c, { secret: true, caveOpen: () => false }) : buildMineshaftBp(c, { caveOpen: () => false });
      expect(bp.chests.some((q) => q.kind === 'secret')).toBe(secret);
      const cart = bp.landmarks[0], yTop = cart.y - 3;
      expect(bp.solid).toEqual({ x: bp.x, y: bp.y, w: bp.w, h: bp.h });
      const rope = [...cellMap(bp)].filter(([, t]) => t === T.ROPE).map(([k]) => k.split(',').map(Number));
      expect(rope.length).toBeGreaterThan(20);
      const rx = rope[0][0], top = Math.min(src.profile.surfaceAt(rx), src.profile.surfaceAt(rx + 1)) - 1;
      expect(bp.y).toBe(top); expect(Math.max(...rope.map((q) => q[1]))).toBe(yTop + 2);
      // 用這份藍圖取代真的礦坑來填欄（不是錨點的那份另外換掉同一槽的真藍圖；外框只在這一槽，換掉後沒有別的藍圖相交）
      const stub = { overlapping: (x0: number, x1: number, l?: readonly Layer[]) => src.blueprints.overlapping(x0, x1, l).map((b) => (b.id === real.id ? bp : b)).filter((b) => b.x < x1 && b.x + b.w > x0) } as unknown as BlueprintIndex;
      const filler = new Filler2(seed, src.layout, src.profile, stub);
      const w = worldOf({ version: 0, fill: (col, x0, x1) => filler.fill(col, x0, x1), surfaceAt: (x) => src.surfaceAt(x), biomeAt: (x) => src.biomeAt(x), layersAt: (x) => src.layersAt(x) });
      loadColumns(w, bp.x, bp.x + bp.w);
      // 從豎井口上方（地表上一格）走不擋身體的格（4 鄰、外框內）到礦車
      const seen = new Set<number>(), st = [rx, top];
      let found = false;
      while (st.length && !found) {
        const y = st.pop()!, x = st.pop()!;
        if (x === cart.x && y === cart.y) found = true;
        for (const [nx, ny] of [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]]) {
          const key = ny * 100_000 + nx;
          if (nx < bp.x || nx >= bp.x + bp.w || ny < bp.y || ny >= bp.y + bp.h || seen.has(key)) continue;
          const t = w.getFg(nx, ny);
          if (isSolidTile(t) && t !== T.ORE_CART) continue;
          seen.add(key); st.push(nx, ny);
        }
      }
      expect(found, `${seed} secret ${secret}`).toBe(true);
    }
  }, 120_000);

  it('新錨點不壓到地廳的後備豎井（Task 9：後備豎井的外框從地表到地廳）：礦坑密室 / 空島錨點的外框與每座地廳的後備外框都不相交', () => {
    let checked = 0;
    for (const seed of SEEDS50) { const src = srcOf(seed), m = homeOf(src), list = src.blueprints.anchorsOf(m);
      const mine = list.filter((a) => a.kind === 'mineshaft_secret' || a.kind === 'sky_island').map((a) => src.blueprints.anchorBlueprint(m, a)!);
      for (const h of list.filter((a) => a.kind === 'hall')) {
        const fb = buildHallBp(anchorCtx(seed, h), { caveOpen: () => false });
        expect(fb.y).toBeLessThan(src.profile.surfaceAt(fb.x + (fb.w >> 1)));
        for (const b of mine) { expect(boxesMeet(fb, b), `${seed} ${b.kind}@${b.x} vs hall@${fb.x}`).toBe(false); checked++; }
      }
    }
    expect(checked).toBeGreaterThan(50 * 5);
  }, 300_000);
});
