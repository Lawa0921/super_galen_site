// race.game.test.ts — 種族被動接進遊戲數值：挖掘、摔落、岩漿、經驗，以及中途換種族立即生效。
import { describe, it, expect } from 'vitest';
import { DelveGame } from './game';
import { T, W } from './tiles';
import { LIQ } from './world';
import { FIXED_DT } from './constants';

const HUMAN = 0, ELF = 1, DWARF = 2, CATFOLK = 3, DRAGONKIN = 4;

/** 清空 x 30..100 的場地，floorY 以下是石頭；玩家站在 (px, floorY-1)，設成指定種族 */
function arena(race: number, floorY = 80): DelveGame {
  const g = new DelveGame({ seed: 'race', width: 160, height: 100, peaceful: true });
  g.levels.locked = true;
  g.setAppearance({ ...g.appearance, race });
  const w = g.world;
  for (let y = 0; y < w.height; y++) for (let x = 0; x < w.width; x++) w.setLiquid(x, y, 0, LIQ.NONE);
  for (let y = 0; y < w.height; y++) for (let x = 30; x < 100; x++) { w.setFg(x, y, y >= floorY ? T.STONE : T.AIR); w.setWall(x, y, W.NONE); }
  for (let y = 0; y < w.height; y++) { w.setFg(29, y, T.STONE); w.setFg(100, y, T.STONE); }
  g.teleport(40, floorY - 1);
  run(g, 0.1);
  g.drainEvents();
  return g;
}
function run(g: DelveGame, seconds: number): void {
  for (let i = 0, n = Math.round(seconds / FIXED_DT); i < n; i++) g.step(FIXED_DT);
}

describe('種族被動接進遊戲數值', () => {
  it('矮人挖同一格石頭的 tick 數比人類少', () => {
    const ticks = (race: number): number => {
      const g = arena(race);
      g.give('gold_pickaxe');
      g.setAim(41, 80);
      g.setMining(true);
      let n = 0;
      while (g.world.getFg(41, 80) !== T.AIR && n < 2000) { g.step(FIXED_DT); n++; }
      return n;
    };
    const human = ticks(HUMAN), dwarf = ticks(DWARF);
    expect(human).toBeLessThan(2000);
    expect(dwarf).toBeLessThan(human);
  });

  it('貓族從 26 格高落下不受傷，人類受傷', () => {
    const fall = (race: number): number => {
      const g = arena(race);
      g.teleport(40, 80 - 1 - 26);
      const before = g.hp;
      run(g, 4);
      return before - g.hp;
    };
    expect(fall(HUMAN)).toBeGreaterThan(0);
    expect(fall(CATFOLK)).toBe(0);
  });

  it('龍裔站岩漿 1 秒受的傷比人類少', () => {
    const lava = (race: number): number => {
      const g = arena(race);
      for (let y = 78; y < 80; y++) for (let x = 38; x <= 44; x++) g.world.setLiquid(x, y, 255, LIQ.LAVA);
      const before = g.hp;
      run(g, 1);
      return before - g.hp;
    };
    const human = lava(HUMAN), drag = lava(DRAGONKIN);
    expect(human).toBeGreaterThan(0);
    expect(drag).toBeLessThan(human);
  });

  it('人類 addXp(100) 拿到的經驗比精靈多', () => {
    const xp = (race: number): number => { const g = arena(race); g.levels.locked = false; return g.addXp(100).amount; };
    expect(xp(HUMAN)).toBe(110);
    expect(xp(ELF)).toBe(100);
  });

  it('精靈的夜光比人類亮（光源 +1）', () => {
    const lights = (race: number): number => {
      const g = arena(race);
      return g.heldLights().reduce((s, l) => s + l.v, 0);
    };
    expect(lights(ELF)).toBeGreaterThan(lights(HUMAN));
  });

  it('貓族跳得比人類高（moveStats.jumpMul ×1.08）', () => {
    const jump = (race: number): number => arena(race).moveStats().jumpMul ?? 1;
    expect(jump(CATFOLK) / jump(HUMAN)).toBeCloseTo(1.08, 5);
  });

  it('遊戲中途換種族：下一次 raceMods() 立即生效', () => {
    const g = arena(HUMAN);
    expect(g.raceMods().mineMul).toBe(1);
    g.setAppearance({ ...g.appearance, race: DWARF });
    expect(g.raceMods().mineMul).toBe(1.15);
  });
});
