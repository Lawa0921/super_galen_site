import type { BattleEvent } from '../engine/combatant';
import { effectFor, type FxKey } from './artPaths';

export type Cue =
  | { kind: 'act'; key: string }
  | { kind: 'hit'; key: string; amount: number; weak: boolean; fx: FxKey | null }
  | { kind: 'fx'; key: string; fx: FxKey }
  | { kind: 'ko'; key: string }
  | { kind: 'wait'; ms: number };

export function battleCues(log: BattleEvent[], defIdOf: (key: string) => string | null): Cue[] {
  const out: Cue[] = [];
  let actor: string | null = null;
  for (const ev of log) {
    if (ev.type === 'act') {
      actor = defIdOf(ev.actor);
      out.push({ kind: 'act', key: ev.actor }, { kind: 'wait', ms: 260 });
      continue;
    }
    if (ev.type === 'damage') out.push({ kind: 'hit', key: ev.target, amount: ev.amount, weak: ev.mult > 1, fx: effectFor(ev, actor) });
    else if (ev.type === 'ko') out.push({ kind: 'ko', key: ev.target });
    else if ('target' in ev) {
      const fx = effectFor(ev, actor);
      if (fx) out.push({ kind: 'fx', key: ev.target, fx });
    }
    out.push({ kind: 'wait', ms: 160 });
  }
  return out;
}
