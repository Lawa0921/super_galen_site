import { describe, expect, it } from 'vitest';
import type { BattleEvent } from '../engine/combatant';
import { battleCues } from './battleCues';

const defIdOf = (k: string) => ({ scarlet: 'scarlet', sylvie: 'sylvie', e0: 'slime' } as Record<string, string>)[k] ?? null;

describe('battleCues', () => {
  it("shows the acting hero's weapon effect on his physical hits only", () => {
    const log: BattleEvent[] = [
      { type: 'act', actor: 'hero', label: '攻擊' },
      { type: 'damage', target: 'e0', amount: 9, element: 'phys', mult: 1 },
      { type: 'act', actor: 'scarlet', label: '攻擊' },
      { type: 'damage', target: 'e0', amount: 9, element: 'phys', mult: 1 },
    ];
    const hits = battleCues(log, (k) => k, (k) => (k === 'hero' ? 'spear' : undefined)).filter((c) => c.kind === 'hit');
    expect(hits.map((c) => c.kind === 'hit' && c.fx)).toEqual(['pierce', 'slash']);
  });

  it('tags hits with the acting character and its effect', () => {
    const log: BattleEvent[] = [
      { type: 'act', actor: 'sylvie', label: '射擊' },
      { type: 'damage', target: 'e0', amount: 12, element: 'phys', mult: 1.5 },
      { type: 'act', actor: 'e0', label: '攻擊' },
      { type: 'damage', target: 'scarlet', amount: 4, element: 'phys', mult: 1 },
      { type: 'ko', target: 'e0' },
    ];
    // each event's message line is cued together with its picture, so the text never runs ahead of the screen
    expect(battleCues(log, defIdOf)).toEqual([
      { kind: 'line', index: 0 }, { kind: 'act', key: 'sylvie' }, { kind: 'wait', ms: 420 },
      { kind: 'line', index: 1 }, { kind: 'hit', key: 'e0', amount: 12, weak: true, fx: 'pierce' }, { kind: 'wait', ms: 320 },
      { kind: 'line', index: 2 }, { kind: 'act', key: 'e0' }, { kind: 'wait', ms: 420 },
      { kind: 'line', index: 3 }, { kind: 'hit', key: 'scarlet', amount: 4, weak: false, fx: 'strike' }, { kind: 'wait', ms: 320 },
      { kind: 'line', index: 4 }, { kind: 'ko', key: 'e0' }, { kind: 'wait', ms: 320 },
    ]);
  });

  it('turns heals and buffs into effect cues and skips events without visuals', () => {
    const log: BattleEvent[] = [
      { type: 'act', actor: 'scarlet', label: '鐵壁' },
      { type: 'buff', target: 'scarlet', stat: 'def', pct: 30 },
      { type: 'resist', target: 'e0' },
    ];
    expect(battleCues(log, defIdOf)).toEqual([
      { kind: 'line', index: 0 }, { kind: 'act', key: 'scarlet' }, { kind: 'wait', ms: 420 },
      { kind: 'line', index: 1 }, { kind: 'fx', key: 'scarlet', fx: 'buff' }, { kind: 'wait', ms: 320 },
      { kind: 'line', index: 2 }, { kind: 'wait', ms: 320 },
    ]);
  });

  it('carries the amount of a heal so a party face can show it', () => {
    const log: BattleEvent[] = [{ type: 'act', actor: 'scarlet', label: '回復藥' }, { type: 'heal', target: 'scarlet', amount: 60 }];
    expect(battleCues(log, defIdOf)).toContainEqual({ kind: 'fx', key: 'scarlet', fx: 'heal', amount: 60 });
  });

  it('marks crits and resisted hits, and turns an evaded attack into a miss cue', () => {
    const log: BattleEvent[] = [
      { type: 'act', actor: 'sylvie', label: '射擊' },
      { type: 'damage', target: 'e0', amount: 30, element: 'phys', mult: 1, crit: true },
      { type: 'damage', target: 'e0', amount: 4, element: 'fire', mult: 0.5 },
      { type: 'miss', target: 'e0' },
    ];
    const cues = battleCues(log, defIdOf);
    expect(cues).toContainEqual({ kind: 'hit', key: 'e0', amount: 30, weak: false, crit: true, fx: 'pierce' });
    expect(cues).toContainEqual({ kind: 'hit', key: 'e0', amount: 4, weak: false, resist: true, fx: 'fire' });
    expect(cues).toContainEqual({ kind: 'miss', key: 'e0' });
    expect(cues.filter((c) => c.kind === 'line')).toHaveLength(4);   // a miss still has its line
  });

  it('TP regen is a quiet pop: no message line and no reading pause', () => {
    const log: BattleEvent[] = [{ type: 'tp', target: 'scarlet', amount: 3, regen: true }];
    expect(battleCues(log, defIdOf)).toEqual([{ kind: 'tp', key: 'scarlet', amount: 3 }]);
    // a TP potion is not regen: it keeps its line
    const potion = battleCues([{ type: 'tp', target: 'scarlet', amount: 20 }], defIdOf);
    expect(potion).toContainEqual({ kind: 'line', index: 0 });
  });
});

describe('battleCues revive (roster plan B1 confirmation review)', () => {
  it('a foe revived stands up as a rise; a member revived plays as she always has', () => {
    const log: BattleEvent[] = [{ type: 'revive', target: 'e0' }, { type: 'revive', target: 'liz' }];
    const foes = (k: string) => k === 'e0';
    expect(battleCues(log, () => null, () => undefined, foes)).toEqual([
      { kind: 'line', index: 0 }, { kind: 'fx', key: 'e0', fx: 'heal' }, { kind: 'rise', key: 'e0' }, { kind: 'wait', ms: 320 },
      { kind: 'line', index: 1 }, { kind: 'fx', key: 'liz', fx: 'heal' }, { kind: 'wait', ms: 320 },
    ]);
    // Without the check, nothing is a foe: a revive is the member's cue it was on master.
    expect(battleCues(log, () => null).some((c) => c.kind === 'rise')).toBe(false);
  });
});

describe('ultimate cue', () => {
  it('announces an ultimate before its hits', () => {
    const log: BattleEvent[] = [
      { type: 'act', actor: 'scarlet', label: '紅蓮劫火', ultimate: 'ult-scarlet' },
      { type: 'damage', target: 'e0', amount: 99, element: 'fire', mult: 1 },
    ];
    expect(battleCues(log, defIdOf).slice(0, 4)).toEqual([
      { kind: 'ultimate', key: 'scarlet', name: '紅蓮劫火' }, { kind: 'line', index: 0 }, { kind: 'act', key: 'scarlet' }, { kind: 'wait', ms: 420 },
    ]);
  });
});

describe('battleCues mechanics (plan 8c)', () => {
  it('a mechanic moment pops and holds the screen long enough to read, even in fast mode', () => {
    const log: BattleEvent[] = [{ type: 'mech', actor: 'rin', cue: 'again' }];
    expect(battleCues(log, defIdOf)).toEqual([{ kind: 'line', index: 0 }, { kind: 'mech', key: 'rin', cue: 'again' }, { kind: 'wait', ms: 320, keep: true }]);
  });
});
