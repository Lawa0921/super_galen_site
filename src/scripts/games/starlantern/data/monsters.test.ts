import { describe, expect, it } from 'vitest';
import { ENEMIES } from './enemies';
import { LEGACY_ENEMY_IDS, ROSTER_ART, ROSTER_LIVE, artEnemy, listedEnemy, liveRosterIds } from './monsters';

describe('roster switches (roster plan Task A1, spec §11.1)', () => {
  it('the live set is inside the art set', () => {
    for (const id of ROSTER_LIVE) expect(ROSTER_ART.has(id), id).toBe(true);
  });

  it('legacy ids are listed and drawn', () => {
    expect([...LEGACY_ENEMY_IDS]).toEqual(['slime', 'bat', 'wolf', 'beetle', 'wisp', 'lizard', 'golem', 'shade', 'lanterneater', 'scarlet-foe']);
    for (const id of LEGACY_ENEMY_IDS) {
      expect(ENEMIES[id], id).toBeDefined();
      expect(listedEnemy(id), id).toBe(true);
      expect(artEnemy(id), id).toBe(true);
    }
  });

  it('nothing new is listed while nothing is live', () => {
    expect(ROSTER_LIVE.size).toBe(0);
    expect(liveRosterIds()).toEqual([]);
    const fresh = Object.keys(ENEMIES).filter((id) => !LEGACY_ENEMY_IDS.includes(id));
    for (const id of fresh) {
      expect(listedEnemy(id), id).toBe(false);
      expect(artEnemy(id), id).toBe(false);
    }
    expect(listedEnemy('no-such-foe')).toBe(false);
  });
});
