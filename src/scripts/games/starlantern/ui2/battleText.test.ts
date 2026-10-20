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

  it('a turn lost to a skill not learned says so, as one short of TP does', () => {
    const log: BattleEvent[] = [{ type: 'no-skill', actor: 'noel' }, { type: 'no-tp', actor: 'noel' }];
    expect(battleLines(log, () => '諾艾兒')).toEqual(['諾艾兒 還沒學會這個技能', '諾艾兒 的 TP 不足']);
  });

  it('TP regen has no line (the member panel shows it); a TP potion keeps its line', () => {
    const log: BattleEvent[] = [{ type: 'tp', target: 'p', amount: 3, regen: true }, { type: 'tp', target: 'p', amount: 20 }];
    expect(battleLines(log, () => '絲嘉蕾')).toEqual(['', '絲嘉蕾 回復 20 TP']);
  });

  it('each new ailment has its own line; poison and sleep keep theirs', () => {
    const log: BattleEvent[] = (['burn', 'freeze', 'chill', 'shock', 'bleed', 'poison', 'sleep'] as const).map((status) => ({ type: 'status', target: 'e0', status }));
    expect(battleLines(log, () => '史萊姆')).toEqual([
      '史萊姆燒起來了', '史萊姆被凍住了', '史萊姆的動作變慢了', '史萊姆觸電了', '史萊姆開始流血了', '史萊姆中毒了', '史萊姆睡著了',
    ]);
  });
});
