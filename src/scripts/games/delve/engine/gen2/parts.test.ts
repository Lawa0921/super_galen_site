// parts.test.ts — 藍圖部件（Task 11 修正 2，控制者裁決 A）：礦坑密室與小生態錨點的直豎井是 2 欄寬的部件，跨層判定用部件聯集；
// 家鄉 UNDER / DEEP 錨點收到 surfaceBan（表層錨點的部件），通地表的豎井部件不碰它。
// · 逐格優先序：外接矩形與村莊重疊、部件不重疊時，村莊外框裡的每一格和沒有那份礦坑時逐格相同（部件外藍圖不寫、solid 只算部件內）。
// · 注入 caveOpen = false（天然洞穴全部不通，只能挖豎井通地表）跑 3000 個家鄉（pf-0..999 與未調參的 qf-0..1999）：繩梯 / 豎井部件落在 surfaceBan 內 0 次、丟錯 0 次。
import { describe, it, expect } from 'vitest';
import { Column, li } from '../column';
import { T } from '../tiles';
import { seedInt } from '../noise';
import { BP_SURFACE, BP_UNDER, partsMeet, partsOf, structureId, type Blueprint, type BpBox, type BpCtx, type BlueprintIndex, type Layer } from './blueprint';
import { boxHits, solidParts } from './bpcore';
import { anchorSpan, type Anchor } from './anchors';
import { SPAWN_X, type Landmass } from './layout';
import { Filler2 } from './fill';
import { buildMineshaftBp } from './structures/mineshaft';
import { buildMushroomBp, buildCrystalBp } from './structures/miniBiome';
import { buildHiveBp } from './structures/hive';
import { Gen2Source } from './index';

const homeOf = (g: Gen2Source): Landmass => g.layout.landmassAt(SPAWN_X)!;
const BUILD: Record<string, (c: BpCtx, o: { caveOpen: (x: number, y: number) => boolean }) => Blueprint> = {
  mineshaft_secret: (c, o) => buildMineshaftBp(c, { secret: true, ...o }), mushroom_biome: buildMushroomBp, crystal_cave: buildCrystalBp, hive: buildHiveBp,
};
// 錨點 a 的 BpCtx（照 BlueprintIndex.build：structureId、anchorSpan、surfaceBan）
function anchorCtx(g: Gen2Source, seed: string, a: Anchor): BpCtx {
  const m = homeOf(g), sp = anchorSpan(seed, a);
  return { seed, s: seedInt(seed, 'g2-bp'), id: structureId(m.side, m.i, a.region.index, a.slot, a.layer), slotX0: sp.x0, slotX1: sp.x1,
    region: a.region, profile: g.profile, ver: m.ver, groundAt: (x) => g.surfaceAt(x), rank: 0, spawnX: SPAWN_X, surfaceBan: g.blueprints.surfaceBan(m, a) };
}
const ropeCells = (b: Blueprint): { x: number; y: number }[] => {
  const out: { x: number; y: number }[] = [];
  for (let i = 0; i < b.cells.length; i += 5) if (b.cells[i + 2] === T.ROPE) out.push({ x: b.cells[i], y: b.cells[i + 1] });
  return out;
};
const inBox = (x: number, y: number, q: BpBox): boolean => x >= q.x && x < q.x + q.w && y >= q.y && y < q.y + q.h;

describe('gen2 藍圖部件與 surfaceBan', () => {
  it('部件外藍圖不寫：每份帶部件的錨點藍圖，格都在部件聯集內；部件都在外框內（5 個種子 × 注入全部不通）', () => {
    let n = 0;
    for (const seed of ['s-a', 's-b', 's-c', 's-d', 's-e']) {
      const g = new Gen2Source(seed), m = homeOf(g);
      for (const a of g.blueprints.anchorsOf(m)) {
        const f = BUILD[a.kind];
        if (!f) continue;
        const b = f(anchorCtx(g, seed, a), { caveOpen: () => false }), ps = partsOf(b);
        expect(b.parts, `${seed} ${a.kind}`).toBeDefined(); n++;
        for (const q of ps) { expect(q.x >= b.x && q.y >= b.y && q.x + q.w <= b.x + b.w && q.y + q.h <= b.y + b.h, `${seed} ${a.kind}`).toBe(true); }
        for (let i = 0; i < b.cells.length; i += 5) if (!ps.some((q) => inBox(b.cells[i], b.cells[i + 1], q))) throw new Error(`${seed} ${a.kind} cell ${b.cells[i]},${b.cells[i + 1]} outside parts`);
        for (const l of b.landmarks) expect(ps.some((q) => inBox(l.x, l.y, q))).toBe(true);
        for (const c of b.chests) expect(ps.some((q) => inBox(c.x, c.y, q))).toBe(true);
        expect(b.ground).toBeNull();
      }
    }
    expect(n).toBe(5 * 6);
  }, 120_000);

  it('逐格優先序：外接矩形與村莊外框重疊、部件不重疊的礦坑（注入全部不通 → 豎井通地表），村莊外框裡、以及礦坑外框內部件外的每一格（fg / 牆 / 液體）和沒有那份礦坑時相同', () => {
    let cases = 0;
    for (let k = 0; k < 400 && cases < 3; k++) {
      const seed = `pt-${k}`, g = new Gen2Source(seed), m = homeOf(g), list = g.blueprints.anchorsOf(m);
      let villages: Blueprint[];
      try { villages = list.filter((a) => a.kind === 'village').map((a) => g.blueprints.anchorBlueprint(m, a)!); } catch { continue; }
      for (const a of list.filter((q) => q.kind === 'mineshaft_secret')) {
        const forced = buildMineshaftBp(anchorCtx(g, seed, a), { secret: true, caveOpen: () => false });
        const v = villages.find((q) => q.x < forced.x + forced.w && forced.x < q.x + q.w && q.y < forced.y + forced.h && forced.y < q.y + q.h);
        if (!v) continue;
        expect(partsMeet(forced, v), seed).toBe(false);
        const real = g.blueprints.anchorBlueprint(m, a)!;
        // 用這份礦坑取代真的那份來填欄，和拿掉它時比
        const with_ = { overlapping: (x0: number, x1: number, l?: readonly Layer[]) => g.blueprints.overlapping(x0, x1, l).map((b) => (b.id === real.id ? forced : b)).filter((b) => b.x < x1 && b.x + b.w > x0) } as unknown as BlueprintIndex;
        const without = { overlapping: (x0: number, x1: number, l?: readonly Layer[]) => g.blueprints.overlapping(x0, x1, l).filter((b) => b.id !== real.id) } as unknown as BlueprintIndex;
        const fa = new Filler2(seed, g.layout, g.profile, with_), fb = new Filler2(seed, g.layout, g.profile, without);
        // 比對範圍：村莊外框 ∪（礦坑外框內、部件外）——後者抓得到「部件外還寫格」與「fill 仍用整塊 solid 擋洞穴」（solidParts 退化）
        const ps = partsOf(forced), inParts = (x: number, y: number): boolean => ps.some((q) => inBox(x, y, q));
        const inV = (x: number, y: number): boolean => x >= v.x && x < v.x + v.w && y >= v.y && y < v.y + v.h;
        let diffV = 0, cellsV = 0, diffOut = 0, cellsOut = 0;
        for (let cx = forced.x >> 5; cx <= (forced.x + forced.w - 1) >> 5; cx++) {
          const ca = new Column(cx, 1200), cb = new Column(cx, 1200);
          fa.fill(ca, cx * 32, cx * 32 + 32); fb.fill(cb, cx * 32, cx * 32 + 32);
          for (let x = Math.max(forced.x, cx * 32); x < Math.min(forced.x + forced.w, cx * 32 + 32); x++) for (let y = Math.min(v.y, forced.y); y < Math.max(v.y + v.h, forced.y + forced.h); y++) {
            const i = li(x, y), d = ca.fg[i] !== cb.fg[i] || ca.wall[i] !== cb.wall[i] || ca.liquid[i] !== cb.liquid[i] || ca.liquidType[i] !== cb.liquidType[i];
            if (inV(x, y)) { cellsV++; if (d) diffV++; } else if (y >= forced.y && y < forced.y + forced.h && !inParts(x, y)) { cellsOut++; if (d) diffOut++; }
          }
        }
        expect(cellsV, seed).toBeGreaterThan(0); expect(diffV, seed).toBe(0);
        expect(cellsOut, seed).toBeGreaterThan(0); expect(diffOut, seed).toBe(0);
        cases++;
      }
    }
    expect(cases).toBeGreaterThanOrEqual(1);
  }, 300_000);

  // 修正前（建構器不看 surfaceBan）pf- 家鄉：豎井 / 繩梯落在 ban 內 > 0 次；qf-（修正第 3 輪，沒調過參的新前綴，含 qf-73、qf-1196：
  // 蜂巢槽與上方遺跡槽的可用範圍相同，placeX 的 3 個候選與遺跡的 3 段預測對齊）修正前 2 次 RangeError（RED，見報告）
  for (const [pre, part] of [['pf', 0], ['pf', 1], ['qf', 0], ['qf', 1], ['qf', 2], ['qf', 3]] as const) {
    it(`注入 caveOpen = false（只能挖豎井通地表）：${pre}-${part * 500}..${part * 500 + 499} 的礦坑密室 / 小生態錨點，豎井部件與繩梯落在 surfaceBan 內 0 次、丟錯 0 次`, () => {
      const errors: string[] = [], inBan: string[] = [];
      let n = 0;
      for (let k = part * 500; k < (part + 1) * 500; k++) {
        const seed = `${pre}-${k}`, g = new Gen2Source(seed), m = homeOf(g);
        for (const a of g.blueprints.anchorsOf(m)) {
          const f = BUILD[a.kind];
          if (!f) continue;
          let b: Blueprint;
          const c = anchorCtx(g, seed, a), ban = c.surfaceBan!;
          try { b = f(c, { caveOpen: () => false }); } catch (e) { if (!(e instanceof RangeError)) throw e; errors.push(`${seed} ${a.kind}: ${e.message}`); continue; }
          n++;
          if (ropeCells(b).some((r) => ban.some((q) => inBox(r.x, r.y, q))) || (b.parts && b.parts.slice(1).some((q) => boxHits(q, ban)))) inBan.push(`${seed} ${a.kind}@${b.x}`);
        }
      }
      expect(errors.slice(0, 5)).toEqual([]); expect(inBan.slice(0, 5)).toEqual([]);
      expect(n).toBe(500 * 6);
    }, 300_000);
  }

  it('solidParts：沒有部件 = solid 本身；有部件 = solid 與每塊部件的交集（空的不算）；沒有 solid = []', () => {
    const base = { id: 0, kind: 'mineshaft' as const, layer: BP_UNDER as Layer, x: 0, y: 0, w: 20, h: 30, cells: new Int32Array(0), chests: [], pots: [], tablets: [], landmarks: [], floors: [], ground: null, site: null, wholeRegion: false };
    const solid = { x: 0, y: 0, w: 20, h: 30 };
    expect(solidParts({ ...base, solid })).toEqual([solid]);
    expect(solidParts({ ...base, solid: null, parts: [{ x: 0, y: 20, w: 20, h: 10 }] })).toEqual([]);
    expect(solidParts({ ...base, solid, parts: [{ x: 0, y: 20, w: 20, h: 10 }, { x: 5, y: 0, w: 2, h: 20 }] })).toEqual([{ x: 0, y: 20, w: 20, h: 10 }, { x: 5, y: 0, w: 2, h: 20 }]);
    expect(solidParts({ ...base, solid: { x: 0, y: 22, w: 20, h: 8 }, parts: [{ x: 0, y: 20, w: 20, h: 10 }, { x: 5, y: 0, w: 2, h: 20 }] })).toEqual([{ x: 0, y: 22, w: 20, h: 8 }]);
  });

  it('surfaceBan = 同 x 範圍的家鄉表層錨點部件（村莊用實際藍圖；遺跡還沒有建構器、用預測範圍 × 整個世界高）；只給家鄉 UNDER / DEEP 錨點', () => {
    for (const seed of ['s-a', 's-b', 's-c']) {
      const g = new Gen2Source(seed), m = homeOf(g), list = g.blueprints.anchorsOf(m);
      const vil = list.filter((a) => a.kind === 'village').map((a) => g.blueprints.anchorBlueprint(m, a)!);
      for (const a of list.filter((q) => q.layer === BP_UNDER)) {
        const ban = g.blueprints.surfaceBan(m, a), sl = { x0: a.region.x0, x1: a.region.x1 };
        for (const v of vil) if (v.x < sl.x1 && sl.x0 < v.x + v.w) {
          const s = anchorSpan(seed, a);
          if (v.x < s.x1 && s.x0 < v.x + v.w) expect(ban).toContainEqual({ x: v.x, y: v.y, w: v.w, h: v.h });
        }
        for (const q of ban) if (q.y === 0) expect(q.h).toBe(g.profile.height);
      }
      expect(list.some((a) => a.layer === BP_SURFACE && a.kind === 'ruin')).toBe(true);
    }
  }, 60_000);
});
