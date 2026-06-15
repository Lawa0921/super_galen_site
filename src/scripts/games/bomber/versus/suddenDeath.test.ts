import { describe, it, expect } from 'vitest';
import { VersusMatch, SUDDEN_DEATH_AT_MS, RING_INTERVAL_MS, MAX_COLLAPSE_RING } from './versusMatch';
import { GRID_COLS, GRID_ROWS } from '../engine/constants';

const P2 = [{ id: 'a', character: 'lena' as const }, { id: 'b', character: 'mira' as const }];

describe('sudden death', () => {
  it('120s 前不塌；120s 塌第 1 圈（d=1 全變牆）', () => {
    const m = new VersusMatch({ seed: 1, arenaId: 0, players: P2 });
    m.debugMovePlayer('a', 6, 5); m.debugMovePlayer('b', 6, 4); // 先撤到中央避免被塌死
    m.debugSetElapsed(SUDDEN_DEATH_AT_MS - 10);
    m.step(5);
    expect(m.getState().collapsedRings).toBe(0);
    m.step(20); // 跨過 120s
    const s = m.getState();
    expect(s.collapsedRings).toBe(1);
    for (let x = 1; x < GRID_COLS - 1; x++) {
      expect(s.grid[1][x]).toBe('wall');
      expect(s.grid[GRID_ROWS - 2][x]).toBe('wall');
    }
  });

  it('站在塌縮格上即死（無視盾）', () => {
    const m = new VersusMatch({ seed: 1, arenaId: 0, players: P2 });
    // a 留在出生點（d=1 圈上）、b 搬到中央
    m.debugMovePlayer('b', 6, 5);
    m.debugGivePowerUp('a', 'shield');
    m.debugSetElapsed(SUDDEN_DEATH_AT_MS - 1);
    m.step(10);
    const s = m.getState();
    expect(s.players[0].alive).toBe(false); // 盾擋不了塌縮
    expect(s.status).toBe('finished');
    expect(s.winnerId).toBe('b');
  });

  it('每 3 秒一圈、最多塌 MAX_COLLAPSE_RING 圈', () => {
    const m = new VersusMatch({ seed: 1, arenaId: 0, players: P2 });
    m.debugMovePlayer('a', 6, 5); m.debugMovePlayer('b', 6, 4);
    m.debugSetElapsed(SUDDEN_DEATH_AT_MS - 1);
    m.step(RING_INTERVAL_MS * 10); // 足夠塌完
    expect(m.getState().collapsedRings).toBe(MAX_COLLAPSE_RING);
  });
});
