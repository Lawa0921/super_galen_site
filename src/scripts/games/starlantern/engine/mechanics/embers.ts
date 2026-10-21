/**
 * Scarlet's embers (spec §8.5, plan 8c Task 5): half of the HP she really loses (ticks too) is kept as embers, up to half
 * her max HP (combatant.ts dealDamage keeps them). Her fire skills pay their HP cost from the embers first; 紅蓮終焉 then
 * burns every ember left for power, 1% a point of max HP. 代受 (cover) and 贖火 (riposte) count down here at the round's
 * end, and 盾擊's challenge ends once its round is over. 贖火 answers each foe action that landed a blow on her with one
 * fire counter, which sets off nothing more. Nothing here draws.
 */
import type { BattleState } from '../battle';
import type { Combatant } from '../combatant';
import { EMBER } from '../mech';
import { applyEffect, pctOf } from '../skills';
import type { SkillDef } from '../types';
import { T } from '../../data/text.zh-TW';
import type { MechModule } from './index';

export { EMBER };

const embersOf = (c: Combatant): number | null => (c.mech?.kind === 'embers' ? c.mech.embers : null);
const costOf = (c: Combatant, def: SkillDef): number => (def.hpCost ? Math.floor(c.max.hp * def.hpCost) : 0);

/** A skill's HP cost, from the embers first and then from HP (never below 1). */
export function payHp(c: Combatant, def: SkillDef): void {
  const cost = costOf(c, def);
  if (cost <= 0) return;
  const m = c.mech;
  const fromEmbers = m?.kind === 'embers' ? Math.min(m.embers, cost) : 0;
  if (m?.kind === 'embers') m.embers -= fromEmbers;
  if (cost > fromEmbers) c.hp = Math.max(1, c.hp - (cost - fromEmbers));
}

export const embers: MechModule = {
  castDef(_s, c, def) {
    const n = embersOf(c);
    if (n === null || def.mech !== 'ember-power') return def;
    const left = n - Math.min(n, costOf(c, def));
    const pct = 100 + Math.floor((100 * left) / c.max.hp);
    return { ...def, effects: def.effects.map((e) => (e.kind === 'damage' ? { ...e, power: pctOf(e.power, pct) } : e)) };
  },
  pay(_s, c, def) {
    if (c.mech?.kind === 'embers' && def.mech === 'ember-power') c.mech.embers = 0;
  },
  afterFoe(s, foe, ctx, from, idle) {
    if (!foe.alive) return;
    for (const c of s.party) {
      // A frozen or sleeping Scarlet answers nothing (designer ruling, plan 8c final).
      if (!c.alive || !c.riposte || idle.includes(c.key)) continue;
      const hit = s.log.slice(from).some((e) => (e.type === 'damage' || e.type === 'shield') && e.target === c.key);
      if (!hit) continue;
      ctx.log.push({ type: 'mech', actor: c.key, cue: 'counter' });
      applyEffect(c, foe, { kind: 'damage', power: c.riposte.power, element: 'fire', scale: 'atk', melee: true }, ctx);
    }
  },
  roundEnd(s: BattleState) {
    for (const c of s.party) {
      if (c.cover) { if (c.cover.turns > 1) c.cover.turns -= 1; else delete c.cover; }
      if (c.riposte) { if (c.riposte.turns > 1) c.riposte.turns -= 1; else delete c.riposte; }
    }
    for (const e of s.enemies) if (e.challenged && e.challenged.round <= s.round) delete e.challenged;
  },
  words(s, c) {
    const n = embersOf(c);
    const out: { tone: 'embers'; text: string }[] = n === null ? [] : [{ tone: 'embers', text: T.mech.embers(n) }];
    if (c.riposte) out.push({ tone: 'embers', text: T.mech.riposte(c.riposte.turns) });
    if (c.cover && c.alive) out.push({ tone: 'embers', text: T.mech.cover });
    // The one she covers wears 受護 while she stands and the cover lasts.
    if (c.alive && s.party.some((x) => x !== c && x.alive && x.cover?.ally === c.key)) out.push({ tone: 'embers', text: T.mech.guarded });
    return out;
  },
  cue(cue) {
    return cue === 'counter' ? { tone: 'embers', text: T.mech.cue.counter } : undefined;
  },
};
