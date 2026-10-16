import type { BattleEvent } from '../engine/combatant';
import { effectFor, type FxKey } from './artPaths';

/** `line` shows log entry `index` in the message window at the moment its picture plays. */
export type Cue =
  | { kind: 'line'; index: number }
  | { kind: 'ultimate'; key: string; name: string }
  | { kind: 'act'; key: string }
  | { kind: 'hit'; key: string; amount: number; weak: boolean; fx: FxKey | null }
  | { kind: 'fx'; key: string; fx: FxKey; amount?: number }
  | { kind: 'ko'; key: string }
  | { kind: 'wait'; ms: number };

/** Time to read an action line, and each result line, before the next one replaces it. */
const ACT_MS = 420;
const EVENT_MS = 320;

export function battleCues(log: BattleEvent[], defIdOf: (key: string) => string | null): Cue[] {
  const out: Cue[] = [];
  let actor: string | null = null;
  log.forEach((ev, index) => {
    if (ev.type === 'act') {
      actor = defIdOf(ev.actor);
      if (ev.ultimate) out.push({ kind: 'ultimate', key: ev.actor, name: ev.label });
      out.push({ kind: 'line', index }, { kind: 'act', key: ev.actor }, { kind: 'wait', ms: ACT_MS });
      return;
    }
    out.push({ kind: 'line', index });
    if (ev.type === 'damage') out.push({ kind: 'hit', key: ev.target, amount: ev.amount, weak: ev.mult > 1, fx: effectFor(ev, actor) });
    else if (ev.type === 'ko') out.push({ kind: 'ko', key: ev.target });
    else if ('target' in ev) {
      const fx = effectFor(ev, actor);
      if (fx) out.push(ev.type === 'heal' ? { kind: 'fx', key: ev.target, fx, amount: ev.amount } : { kind: 'fx', key: ev.target, fx });
    }
    out.push({ kind: 'wait', ms: EVENT_MS });
  });
  return out;
}
