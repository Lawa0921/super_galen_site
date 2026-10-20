/**
 * Safira's beat (spec §8.7, plan 8c Task 5): a move unlike the last one counts the beat up (to four), the same move twice
 * trips it back to none. Each beat is 10% more on every hit of hers (combatant.ts hitAmount: her plain attack too) and on
 * her buffs. The first skill she really casts on the fourth beat is the finale: a buff of hers reaches the whole party and
 * lasts a round longer, a strike of hers lands one more hit; then the beat starts again from one. An attack, a guard, an
 * item or an ultimate on the fourth beat keeps the finale for later; a skill she could not cast changes nothing. 拍手 adds
 * one more beat; 蜃樓步 jumps to the fourth. A move is a skill's id, or `attack`, `defend`, `item`, `ultimate`. Nothing here
 * draws.
 */
import type { Combatant } from '../combatant';
import { BEAT } from '../mech';
import { pctOf } from '../skills';
import type { Effect, SkillDef } from '../types';
import { T } from '../../data/text.zh-TW';
import type { MechModule } from './index';

export { BEAT };

const beatOf = (c: Combatant): number | null => (c.mech?.kind === 'beat' && c.defId === 'safira' ? c.mech.beat : null);

function finale(def: SkillDef): SkillDef {
  const buffs = def.effects.some((e) => e.kind === 'buff');
  const target = buffs && (def.target === 'self' || def.target === 'ally') ? 'allies' : def.target;
  const effects = def.effects.map((e): Effect => {
    if (e.kind === 'damage') return { ...e, hits: (e.hits ?? 1) + 1 };
    if ('turns' in e && typeof e.turns === 'number') return { ...e, turns: e.turns + 1 } as Effect;
    return e;
  });
  return { ...def, target, effects };
}

export const beat: MechModule = {
  castDef(_s, c, def) {
    const b = beatOf(c);
    if (b === null) return def;
    // Her damage takes the beat on each hit (hitAmount); her buffs take it here.
    const pct = 100 + BEAT.pctPer * b;
    const scaled: SkillDef = b === 0 ? def : { ...def, effects: def.effects.map((e) => (e.kind === 'buff' && e.pct > 0 ? { ...e, pct: pctOf(e.pct, pct) } : e)) };
    return b >= BEAT.max ? finale(scaled) : scaled;
  },
  pay(_s, c, _def, ctx) {
    if (beatOf(c) !== null && (beatOf(c) ?? 0) >= BEAT.max) ctx.log.push({ type: 'mech', actor: c.key, cue: 'finale' });
  },
  after(_s, c, act, def, ctx) {
    const m = c.mech;
    if (m?.kind !== 'beat' || beatOf(c) === null) return;
    // A skill she could not cast (short of TP) is no move at all.
    if (act.kind === 'skill' && !def) return;
    const code = act.kind === 'skill' ? act.skill : act.kind;
    if (m.beat >= BEAT.max && act.kind === 'skill') m.beat = 1;   // the finale is spent
    else if (code !== m.last) m.beat = Math.min(BEAT.max, m.beat + 1);
    else { m.beat = 0; ctx.log.push({ type: 'mech', actor: c.key, cue: 'misstep' }); }
    const tag = def && 'mech' in def ? def.mech : undefined;
    if (tag === 'clap') m.beat = Math.min(BEAT.max, m.beat + 1);
    if (tag === 'cue-finale') m.beat = BEAT.max;
    m.last = code;
  },
  words(_s, c) {
    const b = beatOf(c);
    return b === null ? [] : [{ tone: 'beat', text: T.mech.beat(b) }];
  },
  cue(cue) {
    return cue === 'misstep' ? { tone: 'beat', text: T.mech.cue.misstep } : cue === 'finale' ? { tone: 'beat', text: T.mech.cue.finale } : undefined;
  },
};
