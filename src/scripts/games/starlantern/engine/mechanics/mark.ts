/**
 * Rin's mark and 還有。 (spec §8.9, plan 8c rulings 14–15): her hits on the foe she marked always crit (combatant.rollHit
 * reads `marks`); the mark goes when its foe falls. Her veil hides her from single attacks (battle.foePool) and readies a
 * sure crit for her next landed hit (`nextCrit`, gone after it). 還有。 itself is in battle.resolveRound: when she fells
 * her marked foe on her own action (Task 2 tuning: any kill moved every member's share at Lv 5–10 far past parity), once
 * a round, she repeats the command; `again` remembers the round's one, cleared at each round's end.
 * Nothing here draws.
 */
import type { BattleState } from '../battle';
import type { Combatant } from '../combatant';
import { T } from '../../data/text.zh-TW';
import type { MechModule } from './index';

/** Every member's marks lose the foes that are down. */
function pruneMarks(party: Combatant[], enemies: Combatant[]): void {
  for (const c of party) {
    const m = c.mech;
    if (m?.kind === 'mark') m.marks = m.marks.filter((k) => enemies.some((e) => e.key === k && e.alive));
  }
}

const markedBy = (s: BattleState, key: string) => s.party.some((c) => c.mech?.kind === 'mark' && c.mech.marks.includes(key));

export const mark: MechModule = {
  onHit(actor, target, ctx) {
    if (actor.nextCrit) delete actor.nextCrit;
    if (target.alive || target.side !== 'enemy') return;
    if (ctx.battle) pruneMarks(ctx.battle.party, ctx.battle.enemies);
    else if (actor.mech?.kind === 'mark') actor.mech.marks = actor.mech.marks.filter((k) => k !== target.key);
  },
  roundEnd(s) {
    pruneMarks(s.party, s.enemies);
    for (const c of s.party) if (c.mech?.kind === 'mark') delete c.mech.again;
  },
  words(_s, c) {
    return c.veil ? [{ tone: 'veil', text: T.mech.veil }] : [];
  },
  foeWords(s, e) {
    return markedBy(s, e.key) ? [{ tone: 'mark', text: T.mech.mark }] : [];
  },
};
