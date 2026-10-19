import { describe, it, expect } from 'vitest';
import { MEETINGS, type Meetable } from '../../data/meetings';
import { meet } from '../party';
import { newGame, type GameState } from '../state';
import { followedLeads, leadOpen, nextLead } from './leads';

/** A new game (prologue, the hero and Rin) with `ids` met. */
const withMet = (ids: Meetable[], s: GameState = newGame()): GameState => {
  for (const id of ids) s.party = meet(s.party, id, 1);
  return s;
};
/** Past the prologue: the main road's second floor reached (storyStage reads `act1`). */
const act1 = (s: GameState): GameState => {
  s.dungeon.reached.mainline = Math.max(2, s.dungeon.reached.mainline);
  return s;
};

describe('nextLead', () => {
  it('a new game points at Selene on the main road, second floor', () => {
    expect(nextLead(newGame())).toEqual({ id: 'selene', region: 'mainline', depth: 2 });
  });

  it('follows the MEETINGS order once the regions are open', () => {
    const order: Meetable[] = [];
    const s = act1(newGame());
    for (let lead = nextLead(s); lead; lead = nextLead(s)) {
      order.push(lead.id);
      s.party = meet(s.party, lead.id, 1);
    }
    expect(order).toEqual(MEETINGS.map((m) => m.id));
  });

  it('skips whoever is already met, wherever she stands in the order', () => {
    const s = act1(withMet(['selene', 'safira', 'sylvie']));
    expect(nextLead(s)).toEqual({ id: 'chizuru', region: 'frost', depth: 3 });
    s.party = meet(s.party, 'chizuru', 1);
    expect(nextLead(s)?.id).toBe('noel');   // Safira and Sylvie are met: straight on to Noel
  });

  it('returns nothing once everyone has been met', () => {
    const s = act1(withMet(MEETINGS.map((m) => m.id)));
    expect(nextLead(s)).toBeNull();
    s.story.finaleCleared = true;
    expect(nextLead(s)).toBeNull();
  });

  it('respects the stage: in the prologue only the main road has leads', () => {
    // Met in the frost before the main road's second floor: the guild still points along the main road first.
    expect(nextLead(withMet(['chizuru']))?.id).toBe('selene');
    // Selene met but the prologue not left (an odd old save): the regions wait, the main road's next one is Bobby.
    expect(nextLead(withMet(['selene']))).toEqual({ id: 'bobby', region: 'mainline', depth: 6 });
    expect(nextLead(act1(withMet(['selene'])))?.id).toBe('chizuru');
    // Act 1 by clearing its boss, too.
    const s = withMet(['selene']);
    s.story.act1Cleared = true;
    expect(nextLead(s)?.id).toBe('chizuru');
    // Nobody unmet on the main road and still the prologue: nothing to point at yet.
    expect(nextLead(withMet(['selene', 'bobby']))).toBeNull();
    expect(leadOpen(MEETINGS[0], 'prologue')).toBe(true);
    expect(leadOpen(MEETINGS.find((m) => m.id === 'chizuru')!, 'prologue')).toBe(false);
    for (const st of ['act1', 'act2', 'act3', 'act4', 'after'] as const) for (const m of MEETINGS) expect(leadOpen(m, st)).toBe(true);
  });

  it('is pure: it reads the state and leaves it alone', () => {
    const s = act1(withMet(['selene']));
    const before = JSON.stringify(s);
    nextLead(s);
    nextLead(s);
    expect(JSON.stringify(s)).toBe(before);
  });
});

describe('followedLeads', () => {
  it('lists the companions met, in lead order, with where they were', () => {
    expect(followedLeads(newGame())).toEqual([]);
    const s = withMet(['liz', 'selene', 'chizuru']);
    expect(followedLeads(s)).toEqual([
      { id: 'selene', region: 'mainline', depth: 2 },
      { id: 'chizuru', region: 'frost', depth: 3 },
      { id: 'liz', region: 'shade', depth: 6 },
    ]);
  });
});
