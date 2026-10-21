// game.season.test.ts — 遊戲層的曆法 / 天氣：日期、季節日出、床睡到天亮、天氣讓天空變暗、閃電、冬天湖面可走、敲冰、雨水
import { describe, it, expect } from 'vitest';
import { DelveGame, type DelveEvent } from './game';
import { T, W } from './tiles';
import { LIQ } from './world';
import { DAY_LENGTH, FIXED_DT, TILE_SIZE as S } from './constants';
import { DAYS_PER_SEASON, SEASON, SEASON_TRANSITION_DAYS, sunTimes } from './calendar';

const SMALL = { width: 160, height: 100 };
function run(g: DelveGame, seconds: number): DelveEvent[] {
  const out: DelveEvent[] = [];
  for (let i = 0, n = Math.round(seconds / FIXED_DT); i < n; i++) { g.step(FIXED_DT); out.push(...g.drainEvents()); }
  return out;
}
/** 平地：x 30..130 清空，floorY 以下石頭；可選一個湖（x lake0..lake1、深 3 格，湖面 floorY） */
function arena(opts: { lake?: boolean; floorY?: number } = {}): DelveGame {
  const floorY = opts.floorY ?? 60;
  const g = new DelveGame({ seed: 'season', ...SMALL, peaceful: true });
  const w = g.world;
  for (let y = 0; y < w.height; y++) for (let x = 0; x < w.width; x++) w.setLiquid(x, y, 0, LIQ.NONE);
  for (let y = 0; y < w.height; y++) for (let x = 0; x < w.width; x++) { w.setFg(x, y, y >= floorY ? T.STONE : T.AIR); w.setWall(x, y, W.NONE); }
  for (let x = 0; x < w.width; x++) { w.surface[x] = floorY; w.biome[x] = 0; }
  if (opts.lake) {
    for (let x = 70; x < 90; x++) for (let y = floorY; y < floorY + 3; y++) { w.setFg(x, y, T.AIR); w.setLiquid(x, y, 255, LIQ.WATER); }
    for (let x = 70; x < 90; x++) w.surface[x] = floorY + 3;
  }
  g.liquids.settle(200);
  g.teleport(40, floorY - 1);
  run(g, 0.1);
  return g;
}
const winterDay = SEASON.WINTER * DAYS_PER_SEASON + SEASON_TRANSITION_DAYS + 1;

describe('日期 / 季節', () => {
  it('新世界是第 1 年春 1 日早上；date() 與 formatDate 一致', () => {
    const g = new DelveGame({ seed: 'cal', ...SMALL, peaceful: true });
    const d = g.date();
    expect(d).toMatchObject({ year: 1, season: SEASON.SPRING, dayOfSeason: 1 });
    expect(g.isNight()).toBe(false);
    expect(g.skyLevel()).toBe(1);
    expect(g.dateText()).toMatch(/^第1年 春 1日 0[78]:\d\d$/);
  });
  it('setDate 跳到某季某日某時；夏天 06:00 已全亮、冬天 06:00 還是夜', () => {
    const g = arena();
    g.setDate({ season: SEASON.SUMMER, day: 4, hour: 6 });
    expect(g.date()).toMatchObject({ season: SEASON.SUMMER, dayOfSeason: 4, hour: 6 });
    const summer = g.skyLevel();
    g.setDate({ season: SEASON.WINTER, day: 4, hour: 6 });
    expect(g.isNight()).toBe(true);
    expect(g.skyLevel()).toBeLessThan(summer);
    expect(summer).toBeGreaterThan(0.9);
  });
});

describe('床：晚上睡到天亮', () => {
  function withBed(): { g: DelveGame; bx: number; by: number } {
    const g = arena();
    const bx = 42, by = 59;
    g.world.setFg(bx, by, T.BED_HEAD); g.world.setFg(bx + 1, by, T.BED_FOOT);
    return { g, bx, by };
  }
  it('附近沒有怪：淡出 → 跳到隔天日出 → 淡入；設定重生點', () => {
    const { g, bx, by } = withBed();
    g.setDate({ season: SEASON.SPRING, day: 3, hour: 22 });
    const day0 = g.date().dayIndex;
    expect(g.interact(bx, by)).toBe(true);
    const ev = run(g, 4);
    expect(ev.some((e) => e.type === 'sleep' && e.phase === 'start')).toBe(true);
    expect(ev.some((e) => e.type === 'sleep' && e.phase === 'wake')).toBe(true);
    const d = g.date();
    expect(d.dayIndex).toBe(day0 + 1);
    expect(d.frac).toBeGreaterThan(sunTimes(d.dayIndex).sunrise - 0.001);
    expect(d.frac).toBeLessThan(sunTimes(d.dayIndex).sunrise + 0.03);
    expect(g.bed).toEqual({ x: bx, y: by });
    expect(g.getState().sleep).toBe(0);
  });
  it('附近有怪：不能睡（提示），時間不跳', () => {
    const { g, bx, by } = withBed();
    g.setDate({ season: SEASON.SPRING, day: 3, hour: 22 });
    g.spawnEnemy('night_walker', 52, 59);
    const t0 = g.time;
    g.interact(bx, by);
    const ev = run(g, 3);
    expect(ev.some((e) => e.type === 'blocked' && e.reason === 'sleep')).toBe(true);
    expect(g.time).toBeCloseTo(t0 + 3, 1);
  });
  it('白天用床只設重生點、不睡', () => {
    const { g, bx, by } = withBed();
    g.setDate({ season: SEASON.SPRING, day: 3, hour: 12 });
    const t0 = g.time;
    g.interact(bx, by);
    const ev = run(g, 2);
    expect(ev.some((e) => e.type === 'sleep')).toBe(false);
    expect(g.time).toBeCloseTo(t0 + 2, 1);
  });
});

describe('天氣', () => {
  it('強制下雨：天空光變暗、getState 回報天氣；取消後恢復', () => {
    const g = arena();
    g.setDate({ season: SEASON.SPRING, day: 2, hour: 12 });
    g.forceWeather('clear');
    const clear = g.skyRGB();
    g.forceWeather('rain');
    expect(g.weather().kind).toBe('rain');
    expect(g.getState().weather).toBe('rain');
    const rain = g.skyRGB();
    expect(Math.max(...rain)).toBeLessThan(Math.max(...clear) - 0.15);
    expect(g.skyLevel()).toBeLessThan(1);
    g.forceWeather(null);
    expect(g.weather().kind).not.toBeUndefined();
  });
  it('雷雨：會打閃電（事件 + 天空瞬間變亮）', () => {
    const g = arena();
    g.setDate({ season: SEASON.SUMMER, day: 2, hour: 14 });
    g.forceWeather('storm');
    let flashMax = 0, bolts = 0;
    for (let i = 0; i < 60 * 40; i++) {
      g.step(FIXED_DT);
      for (const e of g.drainEvents()) if (e.type === 'lightning') bolts++;
      flashMax = Math.max(flashMax, g.flash());
    }
    expect(bolts).toBeGreaterThan(1);
    expect(flashMax).toBeGreaterThan(0.5);
  });
  it('下雨會讓露天的水池慢慢變多一點（有上限）', () => {
    const g = arena({ lake: true });
    g.setDate({ season: SEASON.SPRING, day: 2, hour: 12 });
    // 讓湖面不滿：抽掉最上面一列的一半
    for (let x = 70; x < 90; x++) g.world.setLiquid(x, 60, 120, LIQ.WATER);
    g.liquids.settle(300);
    g.teleport(80, 59);
    const before = g.world.liquidTotal(LIQ.WATER);
    g.forceWeather('rain');
    run(g, 60);
    const after = g.world.liquidTotal(LIQ.WATER);
    expect(after).toBeGreaterThan(before);
    expect(after - before).toBeLessThan(20 * 255);
  });
  it('雨 / 雪的風向 −1..1；季節 / 天氣 getter 給日後的釣魚用', () => {
    const g = arena();
    g.forceWeather('storm');
    expect(Math.abs(g.wind())).toBeLessThanOrEqual(1.2);
    expect(typeof g.season()).toBe('number');
  });
});

describe('冬天：湖面結冰可以走', () => {
  it('冬天湖面結冰（碰撞實心）→ 玩家走過湖面不會掉進水裡；春天融化', () => {
    const g = arena({ lake: true });
    g.setDate({ season: SEASON.WINTER, day: SEASON_TRANSITION_DAYS + 2, hour: 12 });
    expect(g.world.isFrozen(80, 60)).toBe(true);
    expect(g.world.isSolid(80, 60)).toBe(true);
    g.teleport(66, 59);
    g.setMoveX(1);
    run(g, 2.5);
    g.setMoveX(0);
    const ft = g.feetTile();
    expect(ft.x).toBeGreaterThan(72);
    expect(ft.y).toBe(59);
    expect(g.getState().liquid.frac).toBe(0);
    g.setDate({ season: SEASON.SPRING, day: SEASON_TRANSITION_DAYS + 2, hour: 12, year: 2 });
    expect(g.world.isFrozen(80, 60)).toBe(false);
    void winterDay;
  });
  it('可以敲破冰（挖掘結冰格）', () => {
    const g = arena({ lake: true });
    g.setDate({ season: SEASON.WINTER, day: SEASON_TRANSITION_DAYS + 2, hour: 12 });
    g.teleport(69, 59);
    g.setAim(71, 60);
    g.setMining(true);
    const ev = run(g, 3);
    g.setMining(false);
    expect(g.world.isFrozen(71, 60)).toBe(false);
    expect(ev.some((e) => e.type === 'mine' && e.tile === T.ICE)).toBe(true);
  });
  it('敲開的冰洞到下一個冬天之前不會在午夜又結冰（夏天融化後才忘掉）', () => {
    const g = arena({ lake: true });
    g.setDate({ season: SEASON.WINTER, day: SEASON_TRANSITION_DAYS + 1, hour: 12 });
    g.teleport(69, 59);
    g.setAim(71, 60);
    g.setMining(true);
    run(g, 3);
    g.setMining(false);
    expect(g.world.isFrozen(71, 60)).toBe(false);
    // 隔天午夜：別的格照樣是冰，挖開的洞還開著
    g.time = DAY_LENGTH * (winterDay + 1) - 0.5;
    run(g, 1);
    expect(g.world.isFrozen(80, 60)).toBe(true);
    expect(g.world.isFrozen(71, 60)).toBe(false);
    expect(g.minedIce.size).toBeGreaterThan(0);
    // 春天融化 → 忘掉；下一個冬天照常結冰
    g.setDate({ year: 2, season: SEASON.SPRING, day: SEASON_TRANSITION_DAYS + 2, hour: 12 });
    expect(g.minedIce.size).toBe(0);
    g.setDate({ year: 2, season: SEASON.WINTER, day: SEASON_TRANSITION_DAYS + 2, hour: 12 });
    expect(g.world.isFrozen(71, 60)).toBe(true);
  });
  it('換日時自動結冰（不用手動 refresh）', () => {
    const g = arena({ lake: true });
    g.setDate({ season: SEASON.AUTUMN, day: DAYS_PER_SEASON, hour: 12 });
    expect(g.world.isFrozen(80, 60)).toBe(false);
    // 直接改時間（不經 setDate）到深冬某天午夜前一刻，再走過午夜 → step 偵測換日
    g.time = DAY_LENGTH * winterDay - 0.5;
    run(g, 2);
    expect(g.world.isFrozen(80, 60)).toBe(true);
    void S;
  });
});
