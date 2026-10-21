/**
 * Safira's beat (spec §8.7, plan 8c Task 5): a move unlike the last one counts the beat up (to four), the same move twice
 * trips it back to none. Each beat is 10% more on every hit of hers (combatant.ts hitAmount: her plain attack too) and on
 * her buffs. The first skill she really casts on the fourth beat is the finale: a buff of hers reaches the whole party and
 * lasts a round longer, a strike of hers lands one more hit; then the beat starts again from one. An attack, a guard, an
 * item or an ultimate on the fourth beat keeps the finale for later; a skill she could not cast changes nothing. 拍手 adds
 * one more beat; 蜃樓步 jumps to the fourth. A move is a skill's id, or `attack`, `defend`, `item`, `ultimate`. Plan 8d:
 * 即興 makes a repeat cost a few beats (or none) and no misstep; 切分音 adds more than one beat; 雙人舞: after her finale,
 * the next ally's damage skill this round is stronger (BattleState.duet). Nothing here draws.
 */
import type { Combatant } from '../combatant';
import { knobOf } from '../progression';
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
  castDef(s, c, def) {
    // 雙人舞: an ally's damage skill while the duet stands (her own never).
    const d = s.duet;
    if (d && c.side === 'party' && c.key !== d.by && def.effects.some((e) => e.kind === 'damage')) {
      def = { ...def, effects: def.effects.map((e) => (e.kind === 'damage' ? { ...e, power: pctOf(e.power, 100 + d.pct) } : e)) };
    }
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
  after(s, c, act, def, ctx) {
    // The duet goes with the first ally damage skill it lifted.
    if (s.duet && c.key !== s.duet.by && act.kind === 'skill' && def && def.effects.some((e) => e.kind === 'damage')) delete s.duet;
    const m = c.mech;
    if (m?.kind !== 'beat' || beatOf(c) === null) return;
    // A skill she could not cast (short of TP) is no move at all.
    if (act.kind === 'skill' && !def) return;
    const code = act.kind === 'skill' ? act.skill : act.kind;
    const loss = knobOf(c, 'misstepLoss');
    if (m.beat >= BEAT.max && act.kind === 'skill') {
      m.beat = 1;   // the finale is spent
      const duet = knobOf(c, 'duetPct');
      if (duet) s.duet = { pct: duet, by: c.key };
    } else if (code !== m.last) m.beat = Math.min(BEAT.max, m.beat + ((def && 'rules' in def ? def.rules?.beats : undefined) ?? 1));
    else if (loss !== undefined) m.beat = Math.max(0, m.beat - loss);   // 即興: no misstep, a few beats less (or none)
    else { m.beat = 0; ctx.log.push({ type: 'mech', actor: c.key, cue: 'misstep' }); }
    const tag = def && 'mech' in def ? def.mech : undefined;
    if (tag === 'clap') m.beat = Math.min(BEAT.max, m.beat + 1);
    if (tag === 'cue-finale') m.beat = BEAT.max;
    m.last = code;
  },
  roundEnd(s) {
    delete s.duet;   // unused by the round's end, it is gone
  },
  words(_s, c) {
    const b = beatOf(c);
    return b === null ? [] : [{ tone: 'beat', text: T.mech.beat(b) }];
  },
  cue(cue) {
    return cue === 'misstep' ? { tone: 'beat', text: T.mech.cue.misstep } : cue === 'finale' ? { tone: 'beat', text: T.mech.cue.finale } : undefined;
  },
};
