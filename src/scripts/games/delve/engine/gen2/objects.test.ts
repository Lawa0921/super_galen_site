// objects.test.ts — gen2 藍圖物件（M2a Task 2）：分層槽寬（地下 / 深層 / 小點位 170、表層 / 天空 340）與槽邊距（wholeRegion 例外，Q2）、
// UNDER / DEEP 的坑道避讓帶（Q3 / Q3b）、遺跡的地面覆寫（surfaceAt 吃 SURFACE 層藍圖的 ground，Q4）、箱子附加物品（withExtras）、
// 免挖洞箱（solid：箱內不挖噪聲洞穴、不換礦，主坑道照挖）、extrasIn；solid / ground 在外框內（M2a Task 7）。
import { describe, it, expect } from 'vitest';
import { Gen2Source } from './index';
import { slotOf, slotWidth, BP_UNDER, BP_DEEP, BP_SURFACE, emptyObjects, type Layer, type Blueprint, type BlueprintIndex } from './blueprint';
import { Filler2 } from './fill';
import { shaftX, SHAFT_HALF, SHAFT_REACH } from './caves';
import { seedInt } from '../noise';
import { worldOf, loadColumns, firstSolid } from './testUtil';
import { withExtras } from '../loot';
import { Column, li } from '../column';
import { WORLD_H } from '../constants';
import { T, isSolidTile } from '../tiles';

const src = new Gen2Source('obj');

describe('gen2 blueprint objects', () => {
  it('slotWidth 與各層槽：地下 / 深層 / 小點位 170、表層 / 天空 340；slotOf 依層反查；非 wholeRegion 的外框離槽邊 ≥ 8', () => {
    expect([0, 1, 2, 3, 4].map((l) => slotWidth(l as Layer))).toEqual([340, 170, 170, 340, 170]);
    const all = src.blueprints.overlapping(-20_000, 20_000);
    expect(all.filter((b) => b.layer === BP_UNDER).length).toBeGreaterThan(10);
    let grounds = 0;
    for (const b of all) {
      const s = slotOf(b.id, src.layout);
      expect(s.layer).toBe(b.layer);
      // 區塊切分獨立的前提（overlapping 只看外框）：solid 與 ground 都在自己的外框內
      if (b.solid) { expect(b.solid.x).toBeGreaterThanOrEqual(b.x); expect(b.solid.x + b.solid.w).toBeLessThanOrEqual(b.x + b.w);
        expect(b.solid.y).toBeGreaterThanOrEqual(b.y); expect(b.solid.y + b.solid.h).toBeLessThanOrEqual(b.y + b.h); }
      if (b.ground) { grounds++; expect(b.ground.x0).toBeGreaterThanOrEqual(b.x); expect(b.ground.x0 + b.ground.tops.length).toBeLessThanOrEqual(b.x + b.w); }
      if (b.wholeRegion) { expect(b.x).toBeGreaterThanOrEqual(s.region.x0); expect(b.x + b.w).toBeLessThanOrEqual(s.region.x1); continue; } // Q2
      expect(s.x1 - s.x0).toBeLessThan(2 * slotWidth(b.layer));
      expect(b.x).toBeGreaterThanOrEqual(s.x0 + 8); expect(b.x + b.w).toBeLessThanOrEqual(s.x1 - 8);
    }
    expect(grounds).toBeGreaterThan(0);
    // 地下層的槽真的是 170 格（不是 340 的槽換了名字）：有地下藍圖的槽起點不全是 340 的倍數
    const under = all.filter((b) => b.layer === BP_UNDER && slotOf(b.id, src.layout).region.kind !== 'sea');
    expect(under.some((b) => { const s = slotOf(b.id, src.layout); return (s.x0 - s.region.x0) % 340 !== 0; })).toBe(true);
  }, 120_000);

  it('UNDER / DEEP 外框不碰坑道避讓帶 [sx − SHAFT_HALF − 4, sx + SHAFT_HALF + 4]（shaft_cache 例外）（Q3）；DEEP 也離坑道觸及範圍 ≥ 1（Q3b）', () => {
    const ss = seedInt('obj', 'g2-shaft');
    let checked = 0;
    for (const b of src.blueprints.overlapping(-20_000, 20_000, [BP_UNDER, BP_DEEP]).filter((q) => (q.kind as string) !== 'shaft_cache')) {
      expect([BP_UNDER, BP_DEEP]).toContain(b.layer);
      const sx = shaftX(ss, slotOf(b.id, src.layout).region);
      if (!Number.isFinite(sx)) continue;
      checked++;
      expect(b.x + b.w <= sx - SHAFT_HALF - 4 || b.x > sx + SHAFT_HALF + 4, `${b.kind} ${b.x}`).toBe(true);
      // Q3b：DEEP 層用 SHAFT_REACH（坑道底的圓室碰不到深層外框）
      expect(b.x + b.w <= sx - SHAFT_REACH - 1 || b.x >= sx + SHAFT_REACH + 2, `${b.kind} ${b.x}`).toBe(true);
    }
    expect(checked).toBeGreaterThan(10);
  }, 120_000);

  it('遺跡的地面覆寫：surfaceAt = 第一個實心格（外框每一欄；遺跡自己的石磚牆 / 屋頂不算地面）', () => {
    const w = worldOf(src), ruins = src.blueprints.overlapping(-20_000, 20_000).filter((q) => q.kind === 'ruin').slice(0, 12);
    expect(ruins.length).toBe(12);
    let moved = 0;
    for (const b of ruins) {
      expect(b.ground).not.toBeNull();
      expect(b.ground!.x0).toBe(b.x); expect(b.ground!.tops.length).toBe(b.w);
      loadColumns(w, b.x, b.x + b.w);
      // 遺跡自己畫在地面以上的實心格（石磚牆、屋頂）
      const own = new Set<number>();
      for (let k = 0; k < b.cells.length; k += 5) if (isSolidTile(b.cells[k + 2]) && b.cells[k + 1] < b.ground!.tops[b.cells[k] - b.x]) own.add(b.cells[k] * 4096 + b.cells[k + 1]);
      for (let x = b.x; x < b.x + b.w; x++) {
        expect(src.surfaceAt(x), `x ${x}`).toBe(b.ground!.tops[x - b.x]);
        expect(src.surfaceAt(x), `x ${x}`).toBe(firstSolid(w, x, (y) => own.has(x * 4096 + y)));
        if (src.surfaceAt(x) !== src.profile.surfaceAt(x)) moved++;
      }
    }
    // 覆寫真的改了東西（遺跡底 = 寬度內平均地表，不會每欄都剛好等於原地表）
    expect(moved).toBeGreaterThan(0);
    // 外框外照原側寫
    const b = ruins[0];
    expect(src.surfaceAt(b.x - 1)).toBe(src.profile.surfaceAt(b.x - 1));
    expect(src.surfaceAt(b.x + b.w)).toBe(src.profile.surfaceAt(b.x + b.w));
  }, 60_000);

  it('箱子附加物品：withExtras 放第一個空格、滿了蓋最後一格', () => {
    expect(withExtras([null, { item: 'torch', count: 3 }, null], ['magnet'])).toEqual([{ item: 'magnet', count: 1 }, { item: 'torch', count: 3 }, null]);
    const full = [{ item: 'torch' as const, count: 1 }, { item: 'rope' as const, count: 1 }];
    expect(withExtras(full, ['magnet']).at(-1)).toEqual({ item: 'magnet', count: 1 });
    expect(full[1]).toEqual({ item: 'rope', count: 1 }); // 不改原陣列
    expect(withExtras([null, null], ['magnet', 'jump_boots'])).toEqual([{ item: 'magnet', count: 1 }, { item: 'jump_boots', count: 1 }]);
  });

  it('免挖洞箱（solid）：箱內不挖噪聲洞穴、不換礦（只填天然材質），箱外不變；主坑道照挖', () => {
    // 有主坑道的地區：箱子蓋住坑道入口那一段 ± 60 欄、地表下 0..400 列
    const ss = seedInt('obj', 'g2-shaft'), r = src.layout.landmass(1, 2).regions[1], sx = shaftX(ss, r);
    expect(Number.isFinite(sx)).toBe(true);
    const cx = sx >> 5, box = { x: cx * 32 - 40, y: src.profile.surfaceAt(sx) - 10, w: 112, h: 400 };
    const fake: Blueprint = { id: 1, kind: 'ruin', layer: BP_SURFACE, x: box.x, y: box.y, w: box.w, h: box.h, cells: new Int32Array(0), chests: [], ...emptyObjects(), solid: box };
    const real = src.blueprints;
    const stub = { overlapping: (a: number, z: number, l?: readonly Layer[]) => [...real.overlapping(a, z, l), ...(fake.x < z && fake.x + fake.w > a ? [fake] : [])] } as unknown as BlueprintIndex;
    const with_ = new Filler2('obj', src.layout, src.profile, stub), plain = new Filler2('obj', src.layout, src.profile, real);
    // 真的藍圖畫的格（小屋坑道的空氣等）不算
    const others = real.overlapping(box.x, box.x + box.w);
    const inOther = (x: number, y: number): boolean => others.some((o) => x >= o.x && x < o.x + o.w && y >= o.y && y < o.y + o.h);
    let dug = 0, ores = 0, shaft = 0;
    for (const c of [cx - 1, cx, cx + 1]) {
      const a = new Column(c, WORLD_H), p = new Column(c, WORLD_H);
      with_.fill(a, c * 32, c * 32 + 32); plain.fill(p, c * 32, c * 32 + 32);
      for (let x = c * 32; x < c * 32 + 32; x++) for (let y = 0; y < WORLD_H; y++) {
        const i = li(x, y), inBox = x >= box.x && x < box.x + box.w && y >= box.y && y < box.y + box.h;
        const near = Math.abs(x - sx) <= SHAFT_REACH;
        if (!inBox) { expect(a.fg[i], `${x},${y}`).toBe(p.fg[i]); continue; }
        if (y < src.profile.surfaceAt(x) || inOther(x, y)) continue;
        const t = a.fg[i];
        expect([T.COPPER_ORE, T.IRON_ORE, T.SILVER_ORE, T.GOLD_ORE], `${x},${y}`).not.toContain(t);
        if (t === T.AIR) { expect(near, `air at ${x},${y}`).toBe(true); shaft++; }
        if (p.fg[i] === T.AIR && t !== T.AIR) dug++;
        if ([T.COPPER_ORE, T.IRON_ORE, T.SILVER_ORE, T.GOLD_ORE].includes(p.fg[i] as never)) ores++;
      }
    }
    // 不是空測：原本箱內有洞穴與礦、主坑道也還在
    expect(dug).toBeGreaterThan(50); expect(ores).toBeGreaterThan(5); expect(shaft).toBeGreaterThan(50);
  }, 60_000);

  it('extrasIn / objectsIn：沒有物件的 M1 藍圖回空清單；每次回新物件', () => {
    const e = src.extrasIn(-20_000, 20_000);
    expect(e).toEqual({ pots: [], tablets: [], landmarks: [], sites: [] });
    expect(src.extrasIn(-20_000, 20_000)).not.toBe(e);
    for (const b of src.blueprints.overlapping(-20_000, 20_000)) {
      expect(b.pots).toEqual([]); expect(b.tablets).toEqual([]); expect(b.landmarks).toEqual([]); expect(b.site).toBeNull(); expect(b.wholeRegion).toBe(false);
      if (b.kind !== 'ruin') expect(b.ground).toBeNull();
      expect(b.solid).toBeNull();
    }
  }, 60_000);
});
