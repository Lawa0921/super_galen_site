import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { createBattle, intentLabel, planEnemies, resolveRound, rewards, type BattleScale } from './battle';
import { autoActions } from './builds';
import { partyAt } from './sim';
import { mulberry32 } from './rng';
import { encounterTable } from './scaling';
import { withRosterOnly } from './testing';
import { activeIds } from './party';
import type { RegionId } from '../data/regions';

/**
 * Roster plan B1 review, item 10: the old roster's fights, whole, pinned before the roster's mechanics went in (the hash
 * was recorded on origin/master d2a8e0970, PR A merged and no PR B1 code, and the B1 branch gives the same). Seven regions ×
 * six depths × the first four groups of each table, each three ways (plain; a Nightmare elite with tough and swift; Hell
 * with a scorching crowd), the Hell boss every sixth depth and the story boss; six seeds each, fought to the end by the
 * builds' own policy. It hashes each fight's final state, every intent label shown on the way, its rewards, and how many
 * draws the whole run took.
 */
type Case = { ids: string[]; boss: boolean; scale?: BattleScale };

export function legacyFights(): { cases: number; fights: number; draws: number; hash: string } {
  const out: unknown[] = [];
  let draws = 0;
  const cases: Case[] = [];
  for (const region of ['mainline', 'blaze', 'mire', 'shade', 'iron', 'frost', 'storm'] as RegionId[]) for (const depth of [2, 7, 12, 18, 24, 29]) {
    const tab = encounterTable(region, depth);
    for (let g = 0; g < Math.min(tab.length, 4); g++) {
      const ids = tab[g];
      cases.push({ ids, boss: false, scale: { depth, region } });
      cases.push({ ids, boss: false, scale: { depth, region, elite: ids[0], difficulty: 'nightmare', affixes: ['tough', 'swift'] } });
      cases.push({ ids, boss: false, scale: { depth, region, difficulty: 'hell', crowdAffix: { pick: 0.4, id: 'scorch' } } });
    }
    if (depth % 6 === 0) cases.push({ ids: ['lanterneater'], boss: true, scale: { depth, region, difficulty: 'hell', affixes: ['scorch', 'tough'] } });
  }
  cases.push({ ids: ['lanterneater'], boss: true });   // the story boss: no scale
  for (const [ci, c] of cases.entries()) for (let seed = 1; seed <= 6; seed++) {
    const depth = c.scale?.depth ?? 3;
    const party = partyAt(Math.min(50, 5 + depth * 1.5), {}, depth);
    const base = mulberry32(seed * 1000 + ci);
    const rng = () => { draws++; return base(); };
    let s = createBattle({ party, enemyIds: c.ids, boss: c.boss, inventory: { potion: 3 }, revealed: {}, scale: c.scale });
    planEnemies(s, rng);
    const labels: string[] = [];
    for (let r = 0; r < 40 && s.outcome === 'ongoing'; r++) {
      for (const e of s.enemies) labels.push(intentLabel(s, e.key));
      s = resolveRound(s, autoActions(s, party, activeIds(party)), rng);
    }
    const rw = s.outcome === 'win' ? rewards(s, rng, false) : null;
    out.push([ci, seed, JSON.stringify(s), labels, rw]);
  }
  out.push(draws);
  return { cases: cases.length, fights: out.length - 1, draws, hash: createHash('sha256').update(JSON.stringify(out)).digest('hex') };
}

describe('the old roster fights as it did (roster plan B1 review, item 10)', () => {
  it('every legacy fight, whole, hashes as on origin/master', () => {
    // L1b: measures the game as it was with nothing live (the old roster on the old tables, no deep trait).
    const r = withRosterOnly([], legacyFights);
    expect([r.cases, r.fights]).toEqual([517, 3102]);
    expect(r.draws).toBe(377689);
    expect(r.hash).toBe('681458a8fb72cfa58bb485858355f4a78c6d1b47dfc4e04ab6e0b364398d80bf');
  }, 300000);
});
