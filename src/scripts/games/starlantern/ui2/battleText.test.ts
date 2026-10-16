import { describe, expect, it } from 'vitest';
import type { BattleEvent } from '../engine/combatant';
import { battleLines } from './battleText';

describe('battleLines', () => {
  it('turns events into readable lines', () => {
    const names: Record<string, string> = { scarlet: '絲嘉蕾', e0: '苔蘚史萊姆' };
    const log: BattleEvent[] = [
      { type: 'act', actor: 'scarlet', label: '攻擊' },
      { type: 'damage', target: 'e0', amount: 12, element: 'fire', mult: 1.5 },
      { type: 'ko', target: 'e0' },
      { type: 'escape', success: false },
    ];
    expect(battleLines(log, (k) => names[k] ?? k)).toEqual(['絲嘉蕾：攻擊', '苔蘚史萊姆 受到 12 傷害（弱點）', '苔蘚史萊姆 倒下了', '逃跑失敗']);
  });

  it('a crit and a miss are worded', () => {
    const log: BattleEvent[] = [
      { type: 'damage', target: 'e0', amount: 30, element: 'phys', mult: 1, crit: true },
      { type: 'damage', target: 'e0', amount: 45, element: 'fire', mult: 1.5, crit: true },
      { type: 'miss', target: 'e0' },
    ];
    expect(battleLines(log, () => '苔蘚史萊姆')).toEqual(['苔蘚史萊姆 受到 30 傷害（暴擊）', '苔蘚史萊姆 受到 45 傷害（弱點）（暴擊）', '苔蘚史萊姆 閃過了攻擊']);
  });

  it('TP regen has no line (the member panel shows it); a TP potion keeps its line', () => {
    const log: BattleEvent[] = [{ type: 'tp', target: 'p', amount: 3, regen: true }, { type: 'tp', target: 'p', amount: 20 }];
    expect(battleLines(log, () => '絲嘉蕾')).toEqual(['', '絲嘉蕾 回復 20 TP']);
  });
});
