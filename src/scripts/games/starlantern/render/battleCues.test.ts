import { describe, expect, it } from 'vitest';
import type { BattleEvent } from '../engine/combatant';
import { battleCues } from './battleCues';

const defIdOf = (k: string) => ({ scarlet: 'scarlet', sylvie: 'sylvie', e0: 'slime' } as Record<string, string>)[k] ?? null;

describe('battleCues', () => {
  it('tags hits with the acting character and its effect', () => {
    const log: BattleEvent[] = [
      { type: 'act', actor: 'sylvie', label: '射擊' },
      { type: 'damage', target: 'e0', amount: 12, element: 'phys', mult: 1.5 },
      { type: 'act', actor: 'e0', label: '攻擊' },
      { type: 'damage', target: 'scarlet', amount: 4, element: 'phys', mult: 1 },
      { type: 'ko', target: 'e0' },
    ];
    expect(battleCues(log, defIdOf)).toEqual([
      { kind: 'act', key: 'sylvie' }, { kind: 'wait', ms: 260 },
      { kind: 'hit', key: 'e0', amount: 12, weak: true, fx: 'pierce' }, { kind: 'wait', ms: 160 },
      { kind: 'act', key: 'e0' }, { kind: 'wait', ms: 260 },
      { kind: 'hit', key: 'scarlet', amount: 4, weak: false, fx: 'strike' }, { kind: 'wait', ms: 160 },
      { kind: 'ko', key: 'e0' }, { kind: 'wait', ms: 160 },
    ]);
  });

  it('turns heals and buffs into effect cues and skips events without visuals', () => {
    const log: BattleEvent[] = [
      { type: 'act', actor: 'scarlet', label: '鐵壁' },
      { type: 'buff', target: 'scarlet', stat: 'def', pct: 30 },
      { type: 'resist', target: 'e0' },
    ];
    expect(battleCues(log, defIdOf)).toEqual([
      { kind: 'act', key: 'scarlet' }, { kind: 'wait', ms: 260 },
      { kind: 'fx', key: 'scarlet', fx: 'buff' }, { kind: 'wait', ms: 160 },
      { kind: 'wait', ms: 160 },
    ]);
  });
});

describe('ultimate cue', () => {
  it('announces an ultimate before its hits', () => {
    const log: BattleEvent[] = [
      { type: 'act', actor: 'scarlet', label: '紅蓮劫火', ultimate: 'ult-scarlet' },
      { type: 'damage', target: 'e0', amount: 99, element: 'fire', mult: 1 },
    ];
    expect(battleCues(log, defIdOf).slice(0, 3)).toEqual([
      { kind: 'ultimate', key: 'scarlet', name: '紅蓮劫火' }, { kind: 'act', key: 'scarlet' }, { kind: 'wait', ms: 260 },
    ]);
  });
});
