/**
 * Rin's mark and 還有。 (spec §8.9, plan 8c rulings 14–15): her hits on the foe she marked always crit (combatant.rollHit
 * reads `marks`); the mark goes when its foe falls. Her veil hides her from single attacks (battle.foePool) and readies a
 * sure crit for her next landed hit (`nextCrit`, gone after it). 還有。 itself is in battle.resolveRound: when she fells
 * her marked foe on her own action (Task 2 tuning: any kill moved every member's share at Lv 5–10 far past parity), once
 * a round, she repeats the command; `again` remembers the round's one, cleared at each round's end.
 * Nothing here draws.
 */
import type { Action, BattleState } from '../battle';
import type { Combatant } from '../combatant';
import { T } from '../../data/text.zh-TW';
import { castCost, type MechModule } from './index';

/** Every member's marks lose the foes that are down. */
function pruneMarks(party: Combatant[], enemies: Combatant[]): void {
  for (const c of party) {
    const m = c.mech;
    if (m?.kind === 'mark') m.marks = m.marks.filter((k) => enemies.some((e) => e.key === k && e.alive));
  }
}

const markedBy = (s: BattleState, key: string) => s.party.some((c) => c.mech?.kind === 'mark' && c.mech.marks.includes(key));

/**
 * The command 還有。 repeats: the same target while it stands, else the first living foe; the same skill while she can
 * pay for it, else (or after anything but an attack or a skill) a plain attack.
 */
function againAction(s: BattleState, c: Combatant, act: Action): Action {
  const first = s.enemies.find((e) => e.alive)?.key ?? '';
  const meant = 'target' in act && act.target && s.enemies.some((e) => e.key === act.target && e.alive) ? act.target : first;
  if (act.kind === 'skill' && castCost(s, c, act.skill) <= c.tp) return { kind: 'skill', skill: act.skill, target: meant };
  return { kind: 'attack', target: act.kind === 'attack' || act.kind === 'skill' ? meant : first };
}

export const mark: MechModule = {
  onHit(actor, target, ctx) {
    if (actor.nextCrit) delete actor.nextCrit;
    if (target.alive || target.side !== 'enemy') return;
    if (ctx.battle) pruneMarks(ctx.battle.party, ctx.battle.enemies);
    else if (actor.mech?.kind === 'mark') actor.mech.marks = actor.mech.marks.filter((k) => k !== target.key);
  },
  watch(s, c) {
    // Her living marks as she acts: a felled foe leaves them at once, so they are read before.
    return c.mech?.kind === 'mark' ? c.mech.marks.filter((k) => s.enemies.some((e) => e.key === k && e.alive)) : [];
  },
  extraAction(s, c, act, ctx, seen) {
    // 還有。: she fells her mark on her own action, once a round, while a foe still stands.
    const m = c.mech;
    const marked = seen as string[];
    if (m?.kind !== 'mark' || m.again || !c.alive || !s.enemies.some((e) => e.alive)) return null;
    if (!marked.some((k) => !s.enemies.find((e) => e.key === k)?.alive)) return null;
    m.again = true;
    ctx.log.push({ type: 'mech', actor: c.key, cue: 'again' });
    return againAction(s, c, act);
  },
  roundEnd(s) {
    // After every tick: a foe a tick felled loses its mark this round; the veil counts down; 還有。 comes back.
    pruneMarks(s.party, s.enemies);
    for (const c of s.party) {
      if (c.mech?.kind === 'mark') delete c.mech.again;
      if (c.veil) { if (c.veil > 1) c.veil -= 1; else delete c.veil; }
    }
  },
  cue(cue) {
    return cue === 'again' ? { tone: 'mark', text: T.mech.cue.again } : undefined;
  },
  words(_s, c) {
    return c.veil ? [{ tone: 'veil', text: T.mech.veil }] : [];
  },
  foeWords(s, e) {
    return markedBy(s, e.key) ? [{ tone: 'mark', text: T.mech.mark }] : [];
  },
};
