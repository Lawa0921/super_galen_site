// minor.test.ts — gen2 小點位（MINOR 層，M2a Task 19）：每個陸地 MINOR 槽（170 格）都有值得停下的東西、站在地面上不在水上、
// 排除範圍（Q16：家鄉沙灘、出生點 ± 80 的槽、主坑道、湖藍圖外框）、沒有 ground、三種小點位的形狀與地標。
import { describe, it, expect } from 'vitest';
import { Gen2Source } from './index';
import { BP_SURFACE, BP_UNDER, BP_SKY, BP_MINOR, slotOf, landSlot, landSlotCount, type Blueprint } from './blueprint';
import { touchesSpawnClear, partsMeet } from './bpcore';
import { shaftX, SHAFT_HALF } from './caves';
import { SPAWN_X, VARIANT } from './layout';
import { worldOf, loadColumns, SEEDS5 } from './testUtil';
import { seedInt } from '../noise';
import { T, isSolidTile } from '../tiles';

// 每個 Gen2Source 的種子（minorSlots 要算主坑道）
const SEED = new Map<Gen2Source, string>();
const srcOf = (seed: string): Gen2Source => { const g = new Gen2Source(seed); SEED.set(g, seed); return g; };

// 範圍內（整槽在 [x0, x1) 內）所有有槽的陸地地區（非沙灘、非地城區）的 MINOR 槽，扣掉排除的槽：
// 家鄉含出生點 ± 80 的槽、含 shaftX 的槽（主坑道入口本身就是值得停下的東西）、與湖藍圖外框相交的槽
function minorSlots(g: Gen2Source, x0: number, x1: number): { x0: number; x1: number }[] {
  const ss = seedInt(SEED.get(g)!, 'g2-shaft'), out: { x0: number; x1: number }[] = [];
  const lakes = g.blueprints.overlapping(x0, x1, [BP_SURFACE]).filter((b) => b.kind === 'lake');
  for (let x = x0; x < x1;) {
    const m = g.layout.landmassAt(x)!;
    if (m.kind !== 'sea') for (const r of m.regions) {
      if (r.variant === VARIANT.BEACH || r.variant === VARIANT.DUNGEON || !['home', 'wild', 'culture'].includes(r.kind)) continue;
      const sx = shaftX(ss, r);
      for (let q = 0; q < landSlotCount(r, BP_MINOR); q++) {
        const s = landSlot(r, q, BP_MINOR);
        if (s.x0 < x0 || s.x1 > x1) continue;
        if (m.kind === 'home' && touchesSpawnClear(s.x0, s.x1, SPAWN_X)) continue;
        if (Number.isFinite(sx) && sx >= s.x0 && sx < s.x1) continue;
        if (lakes.some((l) => l.x < s.x1 && s.x0 < l.x + l.w)) continue;
        out.push(s);
      }
    }
    x = m.x1;
  }
  return out;
}

const minorsOf = (g: Gen2Source, x0: number, x1: number): Blueprint[] => g.blueprints.overlapping(x0, x1, [BP_MINOR]).filter((b) => b.kind === 'minor');

describe('gen2 小點位（MINOR 層）', () => {
  // 例外（Task 19 實測，報告疑慮 1）：地下層礦坑的外框從地表那幾列起、可以寬到 150 格（外框整片 solid、沒有部件），蓋住同一個 170 格槽
  // （UNDER 與 MINOR 的槽界相同）的地表後放不下小點位（小點位碰到它的外框就會被跨層規則讓掉，Q10）；那一槽有礦坑在地表的入口，也算值得停下的東西
  it('每個陸地的 MINOR 槽至少有一個值得停下的東西（小點位，或與表層 / 天空藍圖相交；或地表有礦坑入口）', () => {
    let slots = 0, minors = 0, mines = 0;
    for (const seed of SEEDS5) {
      const g = srcOf(seed);
      for (const s of minorSlots(g, -15_000, 15_000)) {
        slots++;
        const hit = g.blueprints.overlapping(s.x0, s.x1, [BP_SURFACE, BP_SKY, BP_MINOR]).filter((b) => b.x < s.x1 && b.x + b.w > s.x0);
        if (!hit.length && g.blueprints.overlapping(s.x0, s.x1, [BP_UNDER]).some((b) => b.kind === 'mineshaft' && b.x >= s.x0 && b.x + b.w <= s.x1 && b.y <= g.surfaceAt(b.x))) { mines++; continue; }
        expect(hit.length, `${seed} ${s.x0}`).toBeGreaterThanOrEqual(1);
        if (hit.some((b) => b.kind === 'minor')) minors++;
      }
    }
    // 不是空測：槽很多，大部分靠小點位；礦坑例外很少
    expect(slots).toBeGreaterThan(400); expect(minors).toBeGreaterThan(slots / 4); expect(mines).toBeLessThan(slots / 50);
  }, 240_000);

  it('小點位站在地面上、不在水上（地標 / 陶罐 / 石柱的下一格是實心，格都在地表那一格以上）', () => {
    const g = srcOf('mn'), w = worldOf(g), bs = g.blueprints.overlapping(-15_000, 15_000, [BP_MINOR]).filter((b) => b.kind === 'minor').slice(0, 40);
    expect(bs.length).toBeGreaterThanOrEqual(30);
    for (const b of bs) {
      loadColumns(w, b.x, b.x + b.w);
      for (let x = b.x; x < b.x + b.w; x++) expect(g.waterTopAt(x)).toBeNull();
      expect(b.y + b.h - 1).toBeLessThanOrEqual(g.surfaceAt(b.x + (b.w >> 1)));
      // 只畫地表以上與地表那一格（Q4：不改地面）
      for (let k = 0; k < b.cells.length; k += 5) expect(b.cells[k + 1], `${b.x} ${b.cells[k]}`).toBeLessThanOrEqual(g.surfaceAt(b.cells[k]));
      for (const l of b.landmarks) { expect(w.getFg(l.x, l.y)).toBe(l.tile); expect(isSolidTile(w.getFg(l.x, l.y + 1)), `${l.x},${l.y}`).toBe(true); }
      for (let x = b.x; x < b.x + b.w; x++) for (let y = b.y; y < b.y + b.h; y++) {
        if (w.getFg(x, y) === T.POT) expect(isSolidTile(w.getFg(x, y + 1)), `pot ${x},${y}`).toBe(true);
      }
    }
  }, 60_000);

  it('小點位的排除範圍（Q16）：不在家鄉沙灘、出生點 ± 80 的槽、坑道 ± (SHAFT_HALF + 2)、湖藍圖外框上；小點位沒有 ground', () => {
    for (const seed of SEEDS5) {
      const g = srcOf(seed), ss = seedInt(seed, 'g2-shaft');
      const lakes = g.blueprints.overlapping(-15_000, 15_000, [BP_SURFACE]).filter((b) => b.kind === 'lake');
      for (const b of minorsOf(g, -15_000, 15_000)) {
        const s = slotOf(b.id, g.layout), sx = shaftX(ss, s.region);
        expect(b.ground).toBeNull(); expect((b.x < 70 && b.x + b.w > 0) || (b.x < 4200 && b.x + b.w > 4130), `${seed} beach ${b.x}`).toBe(false);
        expect(s.x0 <= SPAWN_X + 80 && s.x1 > SPAWN_X - 80, `${seed} ${b.x}`).toBe(false);
        if (Number.isFinite(sx)) expect(b.x + b.w <= sx - SHAFT_HALF - 2 || b.x > sx + SHAFT_HALF + 2, `${seed} ${b.x}`).toBe(true);
        expect(lakes.filter((l) => l.x < b.x + b.w && b.x < l.x + l.w), `${seed} ${b.x}`).toEqual([]);
      }
    }
  }, 120_000);

  // 指揮官裁決 1：小點位不壓在通往地表的部件上（外圍地廳的繩梯豎井、礦坑入口、石室 / 熔岩祭壇的豎井……都是其他層藍圖的部件）、也不在地表入口欄上
  it('小點位不碰其他層任何藍圖的部件（Q10）、外框各欄不是地表入口', () => {
    let n = 0;
    for (const seed of SEEDS5) {
      const g = srcOf(seed);
      for (const b of minorsOf(g, -15_000, 15_000)) {
        n++;
        const hit = g.blueprints.overlapping(b.x, b.x + b.w).filter((o) => o.layer !== BP_MINOR && partsMeet(o, b)).map((o) => o.kind);
        expect(hit, `${seed} ${b.x}`).toEqual([]);
        for (let x = b.x; x < b.x + b.w; x++) expect(g.isEntrance(x), `${seed} entrance ${x}`).toBe(false);
      }
    }
    expect(n).toBeGreaterThan(150);
  }, 120_000);

  it('三種小點位：cairn（石堆 + 紅布旗 + T.CAIRN 地標）、camp（木板帳篷 + 火把 + T.RELIC_PACK 地標）、stones（3–5 根石柱 + 2 個陶罐）；寬 ≤ 12、不立地區', () => {
    const subs = new Map<string, number>();
    for (const seed of SEEDS5) {
      const g = srcOf(seed);
      for (const b of minorsOf(g, -15_000, 15_000)) {
        expect(b.layer).toBe(BP_MINOR); expect(b.w).toBeLessThanOrEqual(12); expect(b.site).toBeNull(); expect(b.solid).toBeNull();
        expect(b.floors).toEqual([]); expect(b.pots).toEqual([]); expect(b.chests).toEqual([]);
        const sub = b.sub!;
        subs.set(sub, (subs.get(sub) ?? 0) + 1);
        const n = (t: number): number => { let c = 0; for (let k = 0; k < b.cells.length; k += 5) if (b.cells[k + 2] === t) c++; return c; };
        if (sub === 'cairn') { expect(b.landmarks.map((l) => l.tile)).toEqual([T.CAIRN]); expect(n(T.FLAGPOLE)).toBeGreaterThanOrEqual(3); expect(n(T.FLAG_CLOTH)).toBeGreaterThanOrEqual(1); }
        else if (sub === 'camp') { expect(b.landmarks.map((l) => l.tile)).toEqual([T.RELIC_PACK]); expect(n(T.PLANKS)).toBeGreaterThanOrEqual(4); expect(n(T.TORCH)).toBe(1); }
        else { expect(sub).toBe('stones'); expect(b.landmarks).toEqual([]); expect(n(T.POT)).toBe(2); }
        for (const l of b.landmarks) expect(l.site).toBe('minor');
      }
    }
    const total = [...subs.values()].reduce((a, c) => a + c, 0);
    expect(total).toBeGreaterThan(150);
    // 45% / 30% / 25%（雜湊；放不下改放 cairn 的很少）
    expect(subs.get('cairn')! / total).toBeGreaterThan(0.35); expect(subs.get('cairn')! / total).toBeLessThan(0.58);
    expect(subs.get('camp')! / total).toBeGreaterThan(0.2); expect(subs.get('camp')! / total).toBeLessThan(0.4);
    expect(subs.get('stones')! / total).toBeGreaterThan(0.15); expect(subs.get('stones')! / total).toBeLessThan(0.35);
  }, 120_000);
});
