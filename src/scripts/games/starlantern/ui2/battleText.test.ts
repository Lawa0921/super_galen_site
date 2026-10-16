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
});
