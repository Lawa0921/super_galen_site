/**
 * Selene's moon (spec §8.6, plan 8c ruling 16): only with her in the fight, from the first quarter, one phase on at each
 * round's end (first → full → waning → new). Each phase helps only her: the full moon her healing, the new moon her sleep
 * chances, the first quarter her TP, the waning moon her ice. Recall steps it back one; the full-moon night holds the full
 * moon three round ends. Nothing here draws.
 */
import type { BattleState } from '../battle';
import type { Combatant } from '../combatant';
import { pctOf } from '../skills';
import type { SkillDef } from '../types';
import { T } from '../../data/text.zh-TW';
import type { MechModule } from './index';

export type MoonPhase = 'first' | 'full' | 'waning' | 'new';
export const MOON = { order: ['first', 'full', 'waning', 'new'] as readonly MoonPhase[], healPct: 130, icePct: 130, sleepMul: 1.3, tpMul: 0.7 } as const;

const hers = (s: BattleState, c: Combatant) => (c.defId === 'selene' && s.moon ? s.moon.phase : null);
const next = (p: MoonPhase): MoonPhase => MOON.order[(MOON.order.indexOf(p) + 1) % MOON.order.length];

export const moon: MechModule = {
  init(s, c) {
    if (c.defId === 'selene' && !s.moon) s.moon = { phase: 'first' };
  },
  castDef(s, c, def): SkillDef {
    const p = hers(s, c);
    if (p === 'full' && def.effects.some((e) => e.kind === 'heal')) {
      return { ...def, effects: def.effects.map((e) => (e.kind === 'heal' ? { ...e, power: pctOf(e.power, MOON.healPct) } : e)) };
    }
    if (p === 'waning' && def.effects.some((e) => e.kind === 'damage' && e.element === 'ice')) {
      return { ...def, effects: def.effects.map((e) => (e.kind === 'damage' && e.element === 'ice' ? { ...e, power: pctOf(e.power, MOON.icePct) } : e)) };
    }
    if (p === 'new' && def.effects.some((e) => e.kind === 'inflict' && e.status === 'sleep')) {
      return { ...def, effects: def.effects.map((e) => (e.kind === 'inflict' && e.status === 'sleep' ? { ...e, chance: Math.min(1, e.chance * MOON.sleepMul) } : e)) };
    }
    return def;
  },
  castCost(s, c, cost) {
    return hers(s, c) === 'first' && cost > 0 ? Math.max(1, Math.ceil(cost * MOON.tpMul - 1e-9)) : cost;
  },
  roundEnd(s) {
    const m = s.moon;
    if (!m) return;
    // A held phase stays (its count runs down); any other moves on.
    if (m.hold) { if (m.hold.turns > 1) m.hold.turns -= 1; else delete m.hold; return; }
    m.phase = next(m.phase);
  },
  fieldWords(s) {
    const m = s.moon;
    if (!m) return [];
    const after = m.hold ? m.phase : next(m.phase);
    return [{ tone: 'moon', text: T.mech.moon(T.mech.phase[m.phase], T.mech.phase[after]) }];
  },
};
