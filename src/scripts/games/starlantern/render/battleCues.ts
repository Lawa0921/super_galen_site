import type { BattleEvent } from '../engine/combatant';
import { effectFor, type FxKey } from './artPaths';
import type { WeaponKind } from '../engine/types';
import type { MechCue } from '../engine/mechanics/index';

/** `line` shows log entry `index` in the message window at the moment its picture plays. */
export type Cue =
  | { kind: 'line'; index: number }
  | { kind: 'ultimate'; key: string; name: string }
  | { kind: 'act'; key: string }
  /** `crit` and `resist` (an element the target resists) are set only when true. */
  | { kind: 'hit'; key: string; amount: number; weak: boolean; crit?: true; resist?: true; fx: FxKey | null }
  /** An evaded attack: a MISS pop over the target. */
  | { kind: 'miss'; key: string }
  /** End-of-round TP regen on a member: a quiet pop, no line and no pause. */
  | { kind: 'tp'; key: string; amount: number }
  /** A character mechanic's moment (暴走！, 還有。): its word pops over the member. */
  | { kind: 'mech'; key: string; cue: MechCue }
  | { kind: 'fx'; key: string; fx: FxKey; amount?: number }
  | { kind: 'ko'; key: string }
  /** Roster plan B4: a foe joins the fight (a summon) and the picture takes it into the row; a fallen foe stands again. */
  | { kind: 'join'; key: string }
  | { kind: 'rise'; key: string }
  /** `keep`: held even in fast mode (a mechanic's moment must be readable). */
  | { kind: 'wait'; ms: number; keep?: true };

/** Time to read an action line, and each result line, before the next one replaces it. */
const ACT_MS = 420;
const EVENT_MS = 320;

/** `weaponOf` gives the weapon kind of a combatant key (the hero only); his physical hits show that weapon's effect. */
/** `isFoe` says which keys are foes in the picture: a foe's revive stands it up (`rise`); a member's plays as it always has. */
export function battleCues(log: BattleEvent[], defIdOf: (key: string) => string | null, weaponOf: (key: string) => WeaponKind | undefined = () => undefined,
  isFoe: (key: string) => boolean = () => false): Cue[] {
  const out: Cue[] = [];
  let actor: string | null = null;
  let actorKey = '';
  log.forEach((ev, index) => {
    if (ev.type === 'act') {
      actor = defIdOf(ev.actor);
      actorKey = ev.actor;
      if (ev.ultimate) out.push({ kind: 'ultimate', key: ev.actor, name: ev.label });
      out.push({ kind: 'line', index }, { kind: 'act', key: ev.actor }, { kind: 'wait', ms: ACT_MS });
      return;
    }
    if (ev.type === 'tp' && ev.regen) { out.push({ kind: 'tp', key: ev.target, amount: ev.amount }); return; }
    out.push({ kind: 'line', index });
    if (ev.type === 'damage') {
      out.push({
        kind: 'hit', key: ev.target, amount: ev.amount, weak: ev.mult > 1,
        ...(ev.crit ? { crit: true as const } : {}), ...(ev.mult < 1 ? { resist: true as const } : {}), fx: effectFor(ev, actor, weaponOf(actorKey)),
      });
    } else if (ev.type === 'miss') out.push({ kind: 'miss', key: ev.target });
    else if (ev.type === 'ko') out.push({ kind: 'ko', key: ev.target });
    // A foe revived stands up in the picture as a rise does (B1 review item 5); only a foe's, so a member's revive keeps
    // the timing it had (confirmation review item 4).
    else if (ev.type === 'revive' && isFoe(ev.target)) { out.push({ kind: 'fx', key: ev.target, fx: 'heal' }, { kind: 'rise', key: ev.target }, { kind: 'wait', ms: EVENT_MS }); return; }
    else if (ev.type === 'mech') { out.push({ kind: 'mech', key: ev.actor, cue: ev.cue }, { kind: 'wait', ms: EVENT_MS, keep: true }); return; }
    // A foe mechanic's moment (roster plan B3–B4): a summon joins the row and a risen foe stands again; the rest are lines.
    else if (ev.type === 'foe') {
      if (ev.cue === 'summon' && ev.target) out.push({ kind: 'join', key: ev.target });
      else if (ev.cue === 'rise') out.push({ kind: 'rise', key: ev.actor });
    }
    else if ('target' in ev) {
      const fx = effectFor(ev, actor, weaponOf(actorKey));
      if (fx) out.push(ev.type === 'heal' ? { kind: 'fx', key: ev.target, fx, amount: ev.amount } : { kind: 'fx', key: ev.target, fx });
    }
    out.push({ kind: 'wait', ms: EVENT_MS });
  });
  return out;
}
