// serialize.env.test.ts — 存檔：日期 / 時間、強制天氣、結冰格（沒有 env 的舊存檔 → 依日期重算結冰）
import { describe, it, expect } from 'vitest';
import { DelveGame } from '../engine/game';
import { T, W } from '../engine/tiles';
import { LIQ } from '../engine/world';
import { serializeGame, restoreGame, snapshotGame, encodeSave } from './serialize';
import { SEASON, SEASON_TRANSITION_DAYS } from '../engine/calendar';

const SMALL = { width: 160, height: 100 };
function lake(): DelveGame {
  const g = new DelveGame({ seed: 'save-env', ...SMALL, peaceful: true });
  const w = g.world;
  for (let y = 0; y < w.height; y++) for (let x = 0; x < w.width; x++) w.setLiquidRaw(x, y, 0, 0);
  for (let y = 0; y < 100; y++) for (let x = 0; x < 160; x++) { w.setFg(x, y, y >= 60 ? T.STONE : T.AIR); w.setWall(x, y, W.NONE); }
  for (let x = 0; x < 160; x++) { w.surface[x] = 60; w.biome[x] = 0; }
  for (let x = 70; x < 90; x++) for (let y = 60; y < 63; y++) { w.setFg(x, y, T.AIR); w.setLiquid(x, y, 255, LIQ.WATER); }
  g.liquids.settle(100);
  g.teleport(40, 59);
  return g;
}

describe('存檔：曆法 / 天氣', { timeout: 120_000 }, () => {
  it('日期、強制天氣、結冰格都存得回來（敲掉的冰不會因讀檔又長回來）', () => {
    const g = lake();
    g.setDate({ year: 2, season: SEASON.WINTER, day: SEASON_TRANSITION_DAYS + 2, hour: 15 });
    g.forceWeather('snow', 5);
    const frozenBefore = g.world.flaggedTiles('frozen').length;
    expect(frozenBefore).toBeGreaterThan(10);
    g.world.setFrozen(75, 60, false); // 玩家敲掉一格
    const r = restoreGame(serializeGame(g));
    if (!r.ok) throw new Error(r.message);
    const h = r.game;
    expect(h.dateText()).toBe(g.dateText());
    expect(h.weather().kind).toBe('snow');
    expect(h.weatherOverride?.until).toBeCloseTo(g.weatherOverride!.until, 6);
    expect(h.world.isFrozen(75, 60)).toBe(false);
    expect(h.world.isFrozen(80, 60)).toBe(true);
    expect(h.world.flaggedTiles('frozen').length).toBe(frozenBefore - 1);
  });
  it('沒有 env 的存檔：讀檔後依日期重算結冰', () => {
    const g = lake();
    g.setDate({ season: SEASON.WINTER, day: SEASON_TRANSITION_DAYS + 2, hour: 12 });
    const snap = snapshotGame(g);
    delete snap.header.env;
    const r = restoreGame(encodeSave(snap));
    if (!r.ok) throw new Error(r.message);
    // 讀檔重新生成的世界用生成時的地表 → 結冰結果 = 依日期重算的結果（再算一次不變）
    const count = (gg: DelveGame): number => gg.world.flaggedTiles('frozen').length;
    const n = count(r.game);
    r.game.refreshSeason();
    expect(count(r.game)).toBe(n);
    expect(r.game.date().season).toBe(SEASON.WINTER);
  });
});
