/**
 * Noel's heat (spec §8.1, plan 8c ruling 13): her fire and thunder spells heat her up, ice cools her down; each point is
 * more power for her spells, and a spell cast at full heat overloads: more power still, then the heat drops to 0 and the
 * backlash takes a share of her max HP (never felling her; no gauge, no wake, no ledger). Her plain attack and her
 * ultimate never run hot. Heat moves only on her skills that deal damage, by the element of the first damage effect.
 * It draws nothing.
 */
import type { Combatant } from '../combatant';
import { pctOf } from '../skills';
import type { Effect, SkillDef } from '../types';
import { T } from '../../data/text.zh-TW';
import type { MechModule } from './index';

export const HEAT = { max: 5, pctPer: 8, overloadPct: 200, backlashPct: 15, iceCool: 2 } as const;

const heatOf = (c: Combatant): number | null => (c.mech?.kind === 'heat' ? c.mech.heat : null);
const firstDamage = (def: SkillDef) => def.effects.find((e): e is Extract<Effect, { kind: 'damage' }> => e.kind === 'damage');

export const heat: MechModule = {
  castDef(_s, c, def) {
    const h = heatOf(c);
    if (h === null || !firstDamage(def)) return def;
    const pct = h >= HEAT.max ? HEAT.overloadPct : 100 + HEAT.pctPer * h;
    return { ...def, effects: def.effects.map((e) => (e.kind === 'damage' ? { ...e, power: pctOf(e.power, pct) } : e)) };
  },
  after(_s, c, act, def, ctx) {
    const m = c.mech;
    if (m?.kind !== 'heat' || act.kind !== 'skill' || !def) return;
    const dmg = firstDamage(def);
    if (!dmg) return;
    if (m.heat >= HEAT.max) {
      m.heat = 0;
      const before = c.hp;
      c.hp = Math.max(1, c.hp - Math.floor((c.max.hp * HEAT.backlashPct) / 100));
      const lost = before - c.hp;   // nothing at 1 HP: the overload shows, with no backlash to tell
      ctx.log.push({ type: 'mech', actor: c.key, cue: 'overload', ...(lost > 0 ? { amount: lost } : {}) });
      return;
    }
    const step = dmg.element === 'fire' || dmg.element === 'thunder' ? 1 : dmg.element === 'ice' ? -HEAT.iceCool : 0;
    m.heat = Math.max(0, Math.min(HEAT.max, m.heat + step));
  },
  words(_s, c) {
    const h = heatOf(c);
    return h === null ? [] : [{ tone: 'heat', text: T.mech.heat(h) }];
  },
  foeWords(_s, e) {
    return e.exposed ? [{ tone: 'expose', text: T.mech.expose(e.exposed) }] : [];
  },
  roundEnd(s) {
    // The hex's weak points count down with the round (a fallen one has already lost them).
    for (const c of [...s.party, ...s.enemies]) if (c.exposed) { if (c.exposed > 1) c.exposed -= 1; else delete c.exposed; }
  },
  cue(cue) {
    return cue === 'overload' ? { tone: 'heat', text: T.mech.cue.overload } : undefined;
  },
};
