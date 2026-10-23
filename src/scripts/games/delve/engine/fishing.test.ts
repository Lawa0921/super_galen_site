// fishing.test.ts — 釣魚：上鉤時機（等待 / 判定窗）、漁獲表（生態區 × 深度 × 液體 × 季節 × 天氣 × 時段 × 水域大小 × 釣力）、木箱戰利品
import { describe, it, expect } from 'vitest';
import {
  FISH, FISH_SPECIES, OCEAN_FISH, biteDelay, biteWindow, canFishIn, catchCandidates, crateLoot, fishingPower, rollCatch, timeSlot,
  type CatchCtx,
} from './fishing';
import { ITEMS } from './items';
import { LIQ } from './liquidKind';
import { BIOME } from './world';
import { Rng } from './rng';
import { SEASON } from './calendar';

const base: CatchCtx = {
  liquid: LIQ.WATER, biome: BIOME.FOREST, zone: 'surface', season: SEASON.SUMMER, weather: 'clear', time: 'day',
  power: 25, pool: 400, lavaRod: false,
};
const tally = (ctx: CatchCtx, n = 4000, seed = 'tally'): Map<string, number> => {
  const r = new Rng(seed), m = new Map<string, number>();
  for (let k = 0; k < n; k++) { const it = rollCatch(ctx, r.next()); if (it) m.set(it, (m.get(it) ?? 0) + 1); }
  return m;
};

describe('釣魚：上鉤時機', () => {
  it('等待時間在範圍內，釣力越高越快上鉤', () => {
    for (let k = 0; k < 50; k++) {
      const r = k / 50;
      const lo = biteDelay(10, r), hi = biteDelay(60, r);
      expect(lo).toBeGreaterThanOrEqual(1.2);
      expect(lo).toBeLessThanOrEqual(12);
      expect(hi).toBeLessThanOrEqual(lo);
    }
  });
  it('判定窗 0.5–1 秒，釣力越高越寬', () => {
    expect(biteWindow(0)).toBeGreaterThanOrEqual(0.5);
    expect(biteWindow(100)).toBeLessThanOrEqual(1);
    expect(biteWindow(50)).toBeGreaterThan(biteWindow(10));
  });
  it('釣力 = 釣竿 + 魚餌（雨天 / 黎明黃昏加成），沒有魚餌 = 0', () => {
    expect(fishingPower('wood_rod', 'worm', 'clear', 'day')).toBe(ITEMS.wood_rod.rod!.power + ITEMS.worm.bait!);
    expect(fishingPower('wood_rod', null, 'clear', 'day')).toBe(0);
    expect(fishingPower('gold_rod', 'firefly', 'rain', 'dawn')).toBeGreaterThan(fishingPower('gold_rod', 'firefly', 'clear', 'day'));
  });
  it('時段：黎明 / 白天 / 黃昏 / 夜晚', () => {
    const s = { sunrise: 0.25, sunset: 0.75, twilight: 0.05 };
    expect(timeSlot(0.25, s)).toBe('dawn');
    expect(timeSlot(0.5, s)).toBe('day');
    expect(timeSlot(0.76, s)).toBe('dusk');
    expect(timeSlot(0.02, s)).toBe('night');
  });
});

describe('釣魚：漁獲表', () => {
  it('有 20 種以上的魚 / 漁獲，每種都是道具、有中英文名', () => {
    expect(FISH_SPECIES.length).toBeGreaterThanOrEqual(20);
    for (const f of FISH) {
      expect(ITEMS[f.item]).toBeDefined();
      expect(ITEMS[f.item].name.en.length).toBeGreaterThan(2);
    }
  });
  it('一般釣竿不能在熔岩釣（熔岩要專用釣竿）；蜂蜜 / 熔岩各有專屬魚', () => {
    expect(canFishIn(LIQ.LAVA, false)).toBe(false);
    expect(canFishIn(LIQ.LAVA, true)).toBe(true);
    expect(rollCatch({ ...base, liquid: LIQ.LAVA, zone: 'molten' }, 0.5)).toBeNull();
    const lava = tally({ ...base, liquid: LIQ.LAVA, zone: 'molten', lavaRod: true, power: 40 });
    expect(lava.has('cinder_snapper')).toBe(true);
    expect(lava.has('silver_minnow')).toBe(false);
    const honey = tally({ ...base, liquid: LIQ.HONEY, biome: BIOME.JUNGLE, zone: 'underground' });
    expect(honey.has('amber_carp')).toBe(true);
    expect(honey.has('silver_minnow')).toBe(false);
  });
  it('生態區：雪原釣得到霜鱒、沙漠綠洲釣得到綠洲錦鯉、叢林釣得到泥鬚鯰', () => {
    expect(tally({ ...base, biome: BIOME.SNOW }).has('frost_char')).toBe(true);
    expect(tally({ ...base, biome: BIOME.FOREST }).has('frost_char')).toBe(false);
    expect(tally({ ...base, biome: BIOME.DESERT }).has('oasis_koi')).toBe(true);
    expect(tally({ ...base, biome: BIOME.JUNGLE }).has('mud_whisker')).toBe(true);
  });
  it('深度：洞穴層釣得到盲眼魚 / 稜光蝦，地表釣不到', () => {
    const cave = tally({ ...base, zone: 'cavern', power: 45 });
    expect(cave.has('pale_blindfish')).toBe(true);
    expect(cave.has('prism_shrimp')).toBe(true);
    expect(tally(base).has('pale_blindfish')).toBe(false);
  });
  it('季節 × 天氣 × 時段：雷雨才有雷紋魟、霧天才有霧鰭、夜晚才有月光鰻、秋天才有餘燼鮭', () => {
    expect(tally({ ...base, weather: 'storm', power: 45 }).has('thunder_ray')).toBe(true);
    expect(tally({ ...base, weather: 'clear', power: 45 }).has('thunder_ray')).toBe(false);
    expect(tally({ ...base, weather: 'fog' }).has('mistfin')).toBe(true);
    expect(tally({ ...base, time: 'night' }).has('moonlit_eel')).toBe(true);
    expect(tally({ ...base, time: 'day' }).has('moonlit_eel')).toBe(false);
    expect(tally({ ...base, season: SEASON.AUTUMN }).has('ember_salmon')).toBe(true);
    expect(tally({ ...base, season: SEASON.SPRING }).has('ember_salmon')).toBe(false);
  });
  it('傳說級（老鬚王）：森林地表、雨天黎明、釣力夠才會出現，而且很稀有', () => {
    const ok = { ...base, weather: 'rain' as const, time: 'dawn' as const, power: 60 };
    const cands = catchCandidates(ok).map((c) => c.item);
    expect(cands).toContain('old_whiskers');
    expect(catchCandidates({ ...ok, power: 20 }).map((c) => c.item)).not.toContain('old_whiskers');
    expect(catchCandidates({ ...ok, time: 'day' }).map((c) => c.item)).not.toContain('old_whiskers');
    const n = tally(ok, 20000).get('old_whiskers') ?? 0;
    expect(n).toBeGreaterThan(0);
    expect(n / 20000).toBeLessThan(0.02);
  });
  it('小水窪大多是垃圾 / 小魚；木箱依釣力解鎖（鐵箱、金箱）', () => {
    const puddle = tally({ ...base, pool: 12 });
    const junk = (puddle.get('soggy_boot') ?? 0) + (puddle.get('wood') ?? 0) + (puddle.get('silver_minnow') ?? 0);
    expect(junk / 4000).toBeGreaterThan(0.8);
    expect(tally({ ...base, power: 15 }).has('iron_crate')).toBe(false);
    expect(tally({ ...base, power: 50 }, 20000).has('iron_crate')).toBe(true);
    expect(tally({ ...base, power: 70 }, 20000).has('golden_crate')).toBe(true);
  });
  it('確定性：同一個亂數值 → 同一個漁獲；r 跨整個 [0,1) 都有結果', () => {
    expect(rollCatch(base, 0.3)).toBe(rollCatch(base, 0.3));
    for (let k = 0; k < 100; k++) expect(rollCatch(base, k / 100)).not.toBeNull();
  });
});

describe('釣魚：木箱', () => {
  it('木箱開出錢幣 + 素材，金箱比木箱好（必有金錠 / 銀幣）', () => {
    const r = new Rng('crate');
    for (let k = 0; k < 30; k++) {
      const w = crateLoot('wooden_crate', r);
      expect(w.length).toBeGreaterThan(1);
      expect(w.some((d) => d.item === 'copper_coin' || d.item === 'silver_coin')).toBe(true);
      const g = crateLoot('golden_crate', r);
      expect(g.some((d) => d.item === 'gold_bar' || d.item === 'silver_coin')).toBe(true);
      for (const d of [...w, ...g]) { expect(ITEMS[d.item]).toBeDefined(); expect(d.n).toBeGreaterThan(0); }
    }
  });
});

describe('BIOME.OCEAN 釣魚', () => {
  const ocean = { ...base, biome: BIOME.OCEAN, zone: 'surface' as const };
  it('不出淡水 / 生態專屬魚，仍有通用小魚', () => {
    const items = catchCandidates(ocean).map((c) => c.item);
    for (const fresh of ['reed_perch', 'brook_trout', 'frost_char', 'oasis_koi', 'mud_whisker', 'sun_bream', 'ember_salmon', 'old_whiskers']) expect(items).not.toContain(fresh);
    expect(items).toContain('silver_minnow');
  });
  it('海洋表 = OCEAN_FISH ∪ 垃圾 ∪ 木箱（所有季節 × 時段 × 天氣、釣力 100、大水池）', () => {
    const seasons = [0, 1, 2, 3] as const, times = ['dawn', 'day', 'dusk', 'night'] as const;
    const weathers = ['clear', 'cloudy', 'rain', 'storm', 'snow', 'fog'] as const;
    const union = new Set<string>();
    for (const season of seasons) for (const time of times) for (const weather of weathers)
      for (const c of catchCandidates({ ...ocean, season, time, weather, power: 100, pool: 200 })) union.add(c.item);
    expect([...union].sort()).toEqual([...OCEAN_FISH, 'soggy_boot', 'wood', 'wooden_crate', 'iron_crate', 'golden_crate'].sort());
  });
});
