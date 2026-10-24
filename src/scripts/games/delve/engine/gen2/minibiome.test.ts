// minibiome.test.ts — gen2 小生態（蘑菇林 / 水晶洞）與蜂巢（M2a Task 11；spec §4.4「蘑菇 / 水晶小生態」、蜂巢 = 蜂蜜的來源）：
// 家鄉各一座錨點、槽位表（地下層蘑菇林 0.05 只在森林 / 叢林、蜂巢 0.1 只在叢林；深層水晶洞 0.08）、形狀 / 材質 / 裝飾、蜂蜜靜止、
// 一定走得進去（接天然洞穴或挖隧道）、水晶洞不在地下層錨點正下方（Task 10 延續事項：礦坑密室往下的豎井）、1500 個種子 0 開機失敗 0 跨層重疊。
import { describe, it, expect } from 'vitest';
import { Column } from '../column';
import { LiquidSim } from '../liquid';
import { LIQ_MAX } from '../liquidKind';
import { T, W, isSolidTile } from '../tiles';
import { BIOME, LIQ } from '../world';
import { seedInt } from '../noise';
import { BP_UNDER, BP_DEEP, KEEP, structureId, slotOf, type Blueprint, type BpCtx } from './blueprint';
import { ANCHOR_MAX_W, anchorSpan, type Anchor } from './anchors';
import { SPAWN_X, VARIANT, type Landmass } from './layout';
import { buildMushroomBp, buildCrystalBp, MUSHROOM_MAX_W, CRYSTAL_MAX_W } from './structures/miniBiome';
import { buildHiveBp, HIVE_MAX_W } from './structures/hive';
import { Gen2Source } from './index';
import { SEEDS5, SEEDS50, bytes, countIn, fillCol, firstOf, homeBlueprints, liquidIn, liquidInvariant, loadBox, loadColumns, overlapPairs, snapshotLiquid, srcOf, walkOut, worldOf } from './testUtil';

const KINDS = ['mushroom_biome', 'crystal_cave', 'hive'] as const;
type Kind = (typeof KINDS)[number];
const BUILD: Record<Kind, (c: BpCtx, o?: { caveOpen?: (x: number, y: number) => boolean }) => Blueprint> = { mushroom_biome: buildMushroomBp, crystal_cave: buildCrystalBp, hive: buildHiveBp };
const homeOf = (src: Gen2Source): Landmass => src.layout.landmassAt(SPAWN_X)!;
// 錨點 a 的 BpCtx（照 BlueprintIndex：structureId、anchorSpan），可另給可用範圍
function anchorCtx(seed: string, a: Anchor, span?: { x0: number; x1: number }): BpCtx {
  const src = srcOf(seed), m = homeOf(src), sp = span ?? anchorSpan(seed, a);
  return { seed, s: seedInt(seed, 'g2-bp'), id: structureId(m.side, m.i, a.region.index, a.slot, a.layer), slotX0: sp.x0, slotX1: sp.x1,
    region: a.region, profile: src.profile, ver: m.ver, groundAt: (x) => src.surfaceAt(x), rank: 0, spawnX: SPAWN_X };
}
// 藍圖的格："x,y" → [fg, wall, liq]
function cellMap(b: Blueprint): Map<string, [number, number, number]> {
  const m = new Map<string, [number, number, number]>();
  for (let i = 0; i < b.cells.length; i += 5) m.set(`${b.cells[i]},${b.cells[i + 1]}`, [b.cells[i + 2], b.cells[i + 3], b.cells[i + 4]]);
  return m;
}
// 外圍：東西兩側 ±30,000 格內的某種藍圖（家鄉以外）；每個種子只查一次（外圍是 LRU 256 份，重查會整片重建）
const OUTER = new Map<string, Blueprint[]>();
function outerOf(seed: string, kind: string): Blueprint[] {
  let all = OUTER.get(seed);
  if (!all) {
    const src = srcOf(seed), h = src.layout.origin.home!;
    all = src.blueprints.overlapping(-30_000, 30_000).filter((b) => (KINDS as readonly string[]).includes(b.kind) && (b.x + b.w <= h.x0 || b.x >= h.x1));
    OUTER.set(seed, all);
  }
  return all.filter((b) => b.kind === kind);
}
// 只用藍圖的格 + 注入的天然洞穴 open 走 4 鄰（藍圖畫了的格看是否實心、KEEP / 外框外的格看 open），從 (sx, sy) 走得到 (tx, ty) 所在的欄 tx
function reachesColumn(b: Blueprint, open: (x: number, y: number) => boolean, sx: number, sy: number, tx: number): boolean {
  const at = cellMap(b), pass = (x: number, y: number): boolean => { const c = at.get(`${x},${y}`); return c && c[0] !== KEEP ? !isSolidTile(c[0]) && c[2] <= 0 : open(x, y); };
  const seen = new Set<string>([`${sx},${sy}`]), st = [sx, sy];
  while (st.length) {
    const y = st.pop()!, x = st.pop()!;
    if (x === tx) return true;
    for (const [nx, ny] of [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]]) {
      const k = `${nx},${ny}`;
      if (seen.has(k) || Math.abs(nx - sx) > 200 || Math.abs(ny - sy) > 120 || !pass(nx, ny)) continue;
      seen.add(k); st.push(nx, ny);
    }
  }
  return false;
}
// 藍圖裡的蜂蜜格都靜止：左右與下方是蜂蜜或實心（只看藍圖的格；外框邊上的格不會是蜂蜜，殼在外圍）
function honeyHeld(b: Blueprint): string[] {
  const at = cellMap(b), bad: string[] = [];
  const holds = (x: number, y: number): boolean => { const c = at.get(`${x},${y}`); return !!c && ((c[0] !== KEEP && isSolidTile(c[0])) || c[2] === ((LIQ_MAX << 8) | LIQ.HONEY)); };
  for (const [k, c] of at) {
    if (c[2] <= 0) continue;
    const [x, y] = k.split(',').map(Number);
    if (c[2] !== ((LIQ_MAX << 8) | LIQ.HONEY) || !holds(x - 1, y) || !holds(x + 1, y) || !holds(x, y + 1)) bad.push(k);
  }
  return bad;
}

describe('gen2 小生態與蜂巢', () => {
  it('§4.4：家鄉 ≥ 1 蘑菇林（蘑菇草 > 150、發光蘑菇 > 40）、≥ 1 水晶洞（水晶 > 30、大理石 > 200）、叢林 ≥ 1 蜂巢（蜂蜜 > 20）', () => { for (const seed of SEEDS5) { const w = worldOf(srcOf(seed));
    const m = homeBlueprints(seed).filter((b) => b.kind === 'mushroom_biome'), c = homeBlueprints(seed).filter((b) => b.kind === 'crystal_cave'), h = homeBlueprints(seed).filter((b) => b.kind === 'hive');
    expect(m.length).toBeGreaterThanOrEqual(1); expect(c.length).toBeGreaterThanOrEqual(1); expect(h.length).toBeGreaterThanOrEqual(1);
    loadBox(w, m[0]); expect(countIn(w, m[0], T.MUSHROOM_GRASS)).toBeGreaterThan(150); expect(countIn(w, m[0], T.GLOW_MUSHROOM)).toBeGreaterThan(40);
    loadBox(w, c[0]); expect(countIn(w, c[0], T.CRYSTAL)).toBeGreaterThan(30); expect(countIn(w, c[0], T.MARBLE)).toBeGreaterThan(200);
    loadBox(w, h[0]); expect(liquidIn(w, h[0], LIQ.HONEY)).toBeGreaterThan(20); expect(srcOf(seed).biomeAt(h[0].x)).toBe(BIOME.JUNGLE); } }, 120_000);

  it('蜂蜜是靜止的：liquidInvariant 沒有違規、喚醒 300 步不變', () => { const { src, b } = firstOf('hive'), w = worldOf(src), sim = new LiquidSim(w); loadBox(w, b);
    expect(liquidInvariant(w, b.x - 2, b.x + b.w + 2)).toEqual([]); const before = snapshotLiquid(w, b); sim.wakeRect(b.x, b.y, b.x + b.w, b.y + b.h);
    for (let k = 0; k < 300; k++) sim.step(); expect(snapshotLiquid(w, b)).toEqual(before); }, 60_000);

  it('錨點：家鄉各一座（蘑菇林在森林、蜂巢在叢林），錨點藍圖就是那一種、恰好一個地標（site = 種類），地標格是對的 tile、腳下實心', () => {
    const TILE: Record<Kind, number> = { mushroom_biome: T.SPORE_TOTEM, crystal_cave: T.GEODE, hive: T.HONEY_JAR };
    for (const seed of SEEDS50) { const src = srcOf(seed), m = homeOf(src);
      for (const k of KINDS) {
        const as = src.blueprints.anchorsOf(m).filter((a) => a.kind === k);
        expect(as, `${seed} ${k}`).toHaveLength(1);
        const b = src.blueprints.anchorBlueprint(m, as[0])!;
        expect(b.kind).toBe(k); expect(b.layer).toBe(k === 'crystal_cave' ? BP_DEEP : BP_UNDER);
        expect(b.landmarks).toEqual([{ x: expect.any(Number), y: expect.any(Number), tile: TILE[k], site: k }]);
        const at = cellMap(b), l = b.landmarks[0];
        expect(at.get(`${l.x},${l.y}`)![0]).toBe(TILE[k]); expect(isSolidTile(at.get(`${l.x},${l.y + 1}`)![0]), `${seed} ${k}`).toBe(true);
        if (k === 'hive') expect(as[0].region.biome).toBe(BIOME.JUNGLE);
        if (k === 'mushroom_biome') expect(as[0].region.biome).toBe(BIOME.FOREST);
      } }
  }, 120_000);

  it('形狀與材質（家鄉 5 個種子 + 外圍）：蘑菇林 / 水晶洞外框高 2ry + 1、蜂巢 2ry + 7；寬 ≤ ANCHOR_MAX_W；中心 y 在規格範圍；只有該有的 tile / 牆；裝飾貼在殼上', () => {
    const bps: { seed: string; b: Blueprint }[] = [];
    for (const seed of SEEDS5) for (const b of homeBlueprints(seed)) if ((KINDS as readonly string[]).includes(b.kind)) bps.push({ seed, b });
    for (const k of KINDS) for (const b of outerOf(SEEDS5[0], k).slice(0, 6)) bps.push({ seed: SEEDS5[0], b });
    for (const k of KINDS) expect(bps.filter((q) => q.b.kind === k).length, k).toBeGreaterThanOrEqual(6);
    const FG: Record<Kind, number[]> = {
      mushroom_biome: [T.AIR, T.MUD, T.MUSHROOM_GRASS, T.GLOW_MUSHROOM, T.VINE, T.SPORE_TOTEM],
      crystal_cave: [T.AIR, T.MARBLE, T.CRYSTAL, T.GEODE], hive: [T.AIR, T.HIVE, T.HONEY_JAR],
    };
    const WALL: Record<Kind, number> = { mushroom_biome: W.MUD_WALL, crystal_cave: W.ICE_WALL, hive: W.HIVE_WALL };
    for (const { seed, b } of bps) {
      const k = b.kind as Kind, p = srcOf(seed).profile, at = cellMap(b), tag = `${seed} ${k}@${b.x}`;
      expect(b.w, tag).toBeLessThanOrEqual(ANCHOR_MAX_W[k]!);
      // 中心 y 的範圍是「取各欄最緊的」：只看那些欄的子集 S 時，max_S ≤ max、min_S ≥ min，所以 cy ≥ max_S(下限)、cy ≤ min_S(上限) 仍然成立。
      // S：小生態 = 畫了牆的欄（就是橢圓 E 的欄；隧道在 E 外的格不畫牆）；蜂巢 = 有蜂蜜的欄（洞腔的欄）
      const cols = new Set<number>();
      for (const [key, [fg, wall, liq]] of at) {
        const [x, y] = key.split(',').map(Number);
        expect(x >= b.x && x < b.x + b.w && y >= b.y && y < b.y + b.h, tag).toBe(true);
        if (fg !== KEEP) expect(FG[k], `${tag} fg ${fg} at ${key}`).toContain(fg);
        if (wall !== KEEP) expect(wall, tag).toBe(WALL[k]);
        if (k === 'hive' ? liq > 0 : wall !== KEEP) cols.add(x);
      }
      const layers = [...cols].map((x) => p.layersAt(x)), max = (f: (q: typeof layers[number]) => number): number => Math.max(...layers.map(f)), min = (f: (q: typeof layers[number]) => number): number => Math.min(...layers.map(f));
      expect(cols.size, tag).toBeGreaterThan(10);
      if (k === 'hive') {
        const ry = (b.h - 7) / 2, cy = b.y + ry + 3;
        expect(ry >= 7 && ry <= 10 && Number.isInteger(ry), tag).toBe(true);
        expect(cy, tag).toBeGreaterThanOrEqual(max((q) => q.rock) + ry + 4); expect(cy, tag).toBeLessThanOrEqual(min((q) => q.deep) + 20);
        // 蜂蜜面 = cy + round(0.15 ry)：每個蜂蜜格都在它以下、它那一列有蜂蜜；蜂蜜都被托住
        const honey = [...at].filter(([, c]) => c[2] > 0).map(([key]) => Number(key.split(',')[1])), level = cy + Math.round(0.15 * ry + 1e-9);
        expect(Math.min(...honey), tag).toBe(level); expect(honeyHeld(b), tag).toEqual([]);
      } else {
        const ry = (b.h - 1) / 2, cy = b.y + ry;
        expect(Number.isInteger(ry) && ry >= (k === 'mushroom_biome' ? 22 : 24) && ry <= 34, tag).toBe(true);
        if (k === 'mushroom_biome') {
          expect(cy, tag).toBeGreaterThanOrEqual(max((q) => q.rock) + ry + 10); expect(cy, tag).toBeLessThanOrEqual(min((q) => q.rock + Math.floor((2 * (q.deep - q.rock)) / 5)) + ry);
        } else {
          expect(cy, tag).toBeGreaterThanOrEqual(max((q) => q.deep)); expect(cy, tag).toBeLessThanOrEqual(min((q) => q.molten) - ry - 12);
        }
        // 裝飾貼在殼上：發光蘑菇腳下是蘑菇草、藤頭上是實心；水晶上或下是大理石；蘑菇草頭上不是實心
        for (const [key, [fg]] of at) {
          const [x, y] = key.split(',').map(Number), up = at.get(`${x},${y - 1}`)?.[0], dn = at.get(`${x},${y + 1}`)?.[0];
          if (fg === T.GLOW_MUSHROOM) expect(dn, tag).toBe(T.MUSHROOM_GRASS);
          if (fg === T.VINE) expect(up === T.MUD || up === T.MUSHROOM_GRASS, tag).toBe(true);
          if (fg === T.CRYSTAL) expect(up === T.MARBLE || dn === T.MARBLE, tag).toBe(true);
          if (fg === T.MUSHROOM_GRASS) expect(up !== undefined && !isSolidTile(up), tag).toBe(true);
        }
      }
    }
  }, 180_000);

  it('槽位表：外圍的蘑菇林只在森林 / 叢林地區、蜂巢只在叢林地區（地下層）、水晶洞在深層；機率大約是 0.05 / 0.1 / 0.08', () => {
    let mush = 0, hive = 0, crys = 0, fj = 0, jg = 0, deep = 0;
    for (const seed of SEEDS5) {
      const src = srcOf(seed), h = src.layout.origin.home!;
      for (const k of KINDS) for (const b of outerOf(seed, k)) {
        const s = slotOf(b.id, src.layout);
        if (k === 'mushroom_biome') { mush++; expect([BIOME.FOREST, BIOME.JUNGLE]).toContain(s.region.biome); expect(s.layer).toBe(BP_UNDER); }
        if (k === 'hive') { hive++; expect(s.region.biome).toBe(BIOME.JUNGLE); expect(s.layer).toBe(BP_UNDER); }
        if (k === 'crystal_cave') { crys++; expect(s.layer).toBe(BP_DEEP); }
      }
      // 分母：外圍大陸（非沙灘地區）的 170 格槽
      for (let i = 1; i <= 12; i++) for (const side of [1, -1] as const) {
        const q = src.layout.landmass(side, i);
        if (q.kind !== 'continent' || q.x1 <= -30_000 || q.x0 >= 30_000 || (q.x0 < h.x1 && q.x1 > h.x0)) continue;
        for (const r of q.regions) {
          if (r.variant === VARIANT.BEACH) continue;
          const n = Math.max(1, Math.floor((r.x1 - r.x0) / 170));
          deep += n;
          if (r.biome === BIOME.FOREST || r.biome === BIOME.JUNGLE) fj += n;
          if (r.biome === BIOME.JUNGLE) jg += n;
        }
      }
    }
    // 含坑道的槽、放不下 / 接不上洞穴的、讓位的都不放，所以比例在機率以下；樣本夠大才有意義
    expect(fj).toBeGreaterThan(200); expect(jg).toBeGreaterThan(60); expect(deep).toBeGreaterThan(400);
    expect(mush / fj).toBeGreaterThan(0.015); expect(mush / fj).toBeLessThan(0.07);
    expect(hive / jg).toBeGreaterThan(0.03); expect(hive / jg).toBeLessThan(0.14);
    expect(crys / deep).toBeGreaterThan(0.03); expect(crys / deep).toBeLessThan(0.1);
  }, 180_000);

  it('ANCHOR_MAX_W = 建構器的寬度上限；錨點建構器在最窄的可用範圍（ANCHOR_MAX_W + 2 × SLOT_PAD）內也放得進去，同一個 ctx 算出相同藍圖', () => {
    expect(ANCHOR_MAX_W.mushroom_biome).toBe(MUSHROOM_MAX_W); expect(ANCHOR_MAX_W.crystal_cave).toBe(CRYSTAL_MAX_W); expect(ANCHOR_MAX_W.hive).toBe(HIVE_MAX_W);
    let built = 0;
    for (const seed of SEEDS5) for (const a of srcOf(seed).blueprints.anchorsOf(homeOf(srcOf(seed)))) {
      if (!(KINDS as readonly string[]).includes(a.kind)) continue;
      const k = a.kind as Kind, need = ANCHOR_MAX_W[k]! + 16, sp = anchorSpan(seed, a);
      for (const span of [{ x0: sp.x0, x1: sp.x0 + need }, { x0: sp.x1 - need, x1: sp.x1 }]) {
        const c = anchorCtx(seed, a, span), b = BUILD[k](c);
        expect(b.x, `${seed} ${k}`).toBeGreaterThanOrEqual(c.slotX0 + 8); expect(b.x + b.w, `${seed} ${k}`).toBeLessThanOrEqual(c.slotX1 - 8);
        expect(b.w).toBeLessThanOrEqual(ANCHOR_MAX_W[k]!);
        built++;
      }
      expect(BUILD[k](anchorCtx(seed, a))).toEqual(BUILD[k](anchorCtx(seed, a)));
    }
    expect(built).toBe(5 * 3 * 2);
  }, 120_000);

  it('跨層：水晶洞錨點正上方那一槽沒有地下層錨點（Task 10 延續事項）；蜂巢錨點不在地廳那一槽的正上方（50 個種子）', () => {
    for (const seed of SEEDS50) { const src = srcOf(seed), list = src.blueprints.anchorsOf(homeOf(src));
      const cr = list.find((a) => a.kind === 'crystal_cave')!, hv = list.find((a) => a.kind === 'hive')!;
      expect(list.filter((a) => a.layer === BP_UNDER && a.region === cr.region && a.slot === cr.slot), seed).toEqual([]);
      expect(list.some((a) => a.kind === 'hall' && a.region === hv.region && a.slot === hv.slot), seed).toBe(false);
    }
  }, 120_000);

  it('接不上天然洞穴就挖隧道：注入「只有外框左邊一條 4 欄寬的直洞」→ 主洞室挖得到那條洞（隧道 4 列高）；注入「全部不通」→ 沒有隧道（錨點照樣建得出來）', () => {
    for (const seed of SEEDS5.slice(0, 3)) for (const a of srcOf(seed).blueprints.anchorsOf(homeOf(srcOf(seed)))) {
      if (!(KINDS as readonly string[]).includes(a.kind)) continue;
      const k = a.kind as Kind, c = anchorCtx(seed, a), sealed = BUILD[k](c, { caveOpen: () => false }), tag = `${seed} ${k}`;
      const lm = sealed.landmarks[0], none = (): boolean => false;
      expect(reachesColumn(sealed, none, lm.x, lm.y, sealed.x - 1), tag).toBe(false);
      // 直洞：外框左邊 [x − 5, x − 1)、上下各延伸 200 列（夠大）
      const x = sealed.x, open = (px: number, py: number): boolean => px >= x - 5 && px < x - 1 && Math.abs(py - sealed.y) < 200;
      const b = BUILD[k](c, { caveOpen: open });
      expect(reachesColumn(b, open, b.landmarks[0].x, b.landmarks[0].y, x - 2), tag).toBe(true);
      // 隧道往左挖到隧道口（直洞的最右欄 x − 2）的前一欄：外框左緣 = x − 1；隧道 4 列高（那一欄藍圖畫的空氣格）
      expect(b.x, tag).toBe(x - 1);
      expect([...cellMap(b)].filter(([key, c]) => key.startsWith(`${x - 1},`) && c[0] === T.AIR).length, tag).toBe(4);
      if (k === 'hive') expect(honeyHeld(b), tag).toEqual([]);
    }
  }, 120_000);

  it('都走得進去：200 個家鄉的每座蘑菇林 / 水晶洞 / 蜂巢（錨點與機率擲出的）從地標出發走得到外框外 ≥ 300 格；外圍的機率擲出的也是', () => {
    const n: Record<string, number> = {};
    const check = (g: Gen2Source, w: ReturnType<typeof worldOf>, b: Blueprint, tag: string): void => {
      loadColumns(w, b.x - 80, b.x + b.w + 80);
      expect(walkOut(w, g, b), tag).toBe(true);
      n[b.kind] = (n[b.kind] ?? 0) + 1;
    };
    for (let k = 0; k < 200; k++) {
      const seed = `mbw-${k}`, g = new Gen2Source(seed), w = worldOf(g), h = g.layout.origin.home!;
      for (const b of g.blueprints.overlapping(h.x0, h.x1, [BP_UNDER, BP_DEEP])) if ((KINDS as readonly string[]).includes(b.kind)) check(g, w, b, `${seed} ${b.kind}@${b.x}`);
    }
    for (const seed of SEEDS5) { const g = srcOf(seed), w = worldOf(g); for (const kd of KINDS) for (const b of outerOf(seed, kd)) check(g, w, b, `${seed} outer ${kd}@${b.x}`); }
    for (const kd of KINDS) expect(n[kd], kd).toBeGreaterThanOrEqual(200);
  }, 300_000);

  it('分段填 = 整欄填（三種各一份跨欄的）', () => { for (const k of KINDS) {
    let found: { src: Gen2Source; b: Blueprint } | null = null;
    for (const seed of SEEDS5) { for (const b of homeBlueprints(seed)) if (b.kind === k && (b.x >> 5) !== ((b.x + b.w - 1) >> 5) && (b.x & 31) < 31) { found = { src: srcOf(seed), b }; break; } if (found) break; }
    const { src, b } = found!, cx = b.x >> 5, parts = new Column(cx, 1200);
    src.fill(parts, cx * 32, b.x + 1); src.fill(parts, b.x + 1, cx * 32 + 32); expect(bytes(parts), k).toEqual(bytes(fillCol(src, cx)));
  } }, 60_000);

  it('1500 個種子（Task 10 延續事項）：0 開機失敗、家鄉 0 跨層重疊；三種錨點都建得出來', () => {
    const errors: string[] = [];
    for (let k = 0; k < 1500; k++) {
      const seed = `mb-${k}`;
      try {
        // 每個種子新建一份（不進 srcOf 的快取，免得 1500 份常駐）
        const g = new Gen2Source(seed), h = g.layout.origin.home!, bps = g.blueprints.overlapping(h.x0, h.x1), m = homeOf(g);
        expect(overlapPairs(bps), seed).toEqual([]);
        for (const kd of KINDS) {
          const a = g.blueprints.anchorsOf(m).find((q) => q.kind === kd)!, b = g.blueprints.anchorBlueprint(m, a);
          expect(b?.kind, `${seed} ${kd}`).toBe(kd); expect(bps).toContain(b);
        }
      } catch (e) { if (!(e instanceof RangeError)) throw e; errors.push(`${seed}: ${e.message}`); }
    }
    expect(errors.slice(0, 3)).toEqual([]);
  }, 300_000);
});
