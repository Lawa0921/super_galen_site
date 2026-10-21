// expectSameGame 本身：同一份存檔讀兩次 → 相等；動到任何一個會存檔的欄位 → 抓得到。
import { describe, expect, it } from 'vitest';
import type { DelveGame } from '../engine/game';
import { restoreGame } from './serialize';
import { readLegacyFixture } from './legacyFixture';
import { expectSameGame } from './expectSameGame';

const fixtureGame = (): DelveGame => { const r = restoreGame(readLegacyFixture()); if (!r.ok) throw new Error(r.message); return r.game; };

describe('expectSameGame', () => {
  it('同一份存檔讀兩次 → 相等', () => {
    expectSameGame(fixtureGame(), fixtureGame());
  });

  it('世界組：結冰格 / 強制天氣 / 種子不同 → 失敗（visit: false 也一樣）', () => {
    const a = fixtureGame();
    const frozen = fixtureGame(); frozen.world.setFrozen(0, 0, !frozen.world.isFrozen(0, 0));
    expect(() => expectSameGame(a, frozen, { visit: false })).toThrow();
    const weather = fixtureGame(); weather.weatherOverride = { kind: 'storm', until: weather.time + 100 };
    expect(() => expectSameGame(a, weather, { visit: false })).toThrow();
    const seeded = fixtureGame(); (seeded as { seed: string }).seed = 'not-the-same';
    expect(() => expectSameGame(a, seeded, { visit: false })).toThrow();
  });

  it('掉落物的位置不同 → 失敗', () => {
    const a = fixtureGame(), b = fixtureGame();
    a.drops.spawn('torch', 3, 400, 300, 0, 0); b.drops.spawn('torch', 3, 420, 300, 0, 0);
    expect(() => expectSameGame(a, b, { visit: false })).toThrow();
  });

  it('visit 組：速度不同 → 失敗；visit: false 時不比', () => {
    const a = fixtureGame(), b = fixtureGame(); b.player.vx = 37;
    expect(() => expectSameGame(a, b)).toThrow();
    expectSameGame(a, b, { visit: false });
    const c = fixtureGame(); c.player.vy = -12;
    expect(() => expectSameGame(a, c)).toThrow();
  });
});
