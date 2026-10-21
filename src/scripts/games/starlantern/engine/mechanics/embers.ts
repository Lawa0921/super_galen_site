/**
 * Scarlet's embers (spec §8.5, plan 8c Task 5): half of the HP she really loses (ticks too) is kept as embers, up to half
 * her max HP (combatant.ts dealDamage keeps them). Her fire skills pay their HP cost from the embers first; 紅蓮終焉 then
 * burns every ember left for power, 1% a point of max HP. 代受 (cover) and 贖火 (riposte) count down here at the round's
 * end, and 盾擊's challenge ends once its round is over. 贖火 answers each foe action that landed a blow on her with one
 * fire counter, which sets off nothing more. Plan 8d: 熾心 raises her cap (written on her state at a fight's start); 高喊
 * keeps embers on the spot (skills.ts `embers`); 赤心 makes a blow whose whole HP cost the embers pay stronger; 回禮 keeps
 * more for a blow she took for the one she covers; 雙肩 keeps a second cover (skills.ts `cover`). Nothing here draws.
 */
import { covers, type BattleState } from '../battle';
import type { Combatant } from '../combatant';
import { EMBER } from '../mech';
import { knobOf } from '../progression';
import { applyEffect, pctOf } from '../skills';
import type { SkillDef } from '../types';
import { T } from '../../data/text.zh-TW';
import type { MechModule } from './index';

export { EMBER };

const embersOf = (c: Combatant): number | null => (c.mech?.kind === 'embers' ? c.mech.embers : null);
const costOf = (c: Combatant, def: SkillDef): number => (def.hpCost ? Math.floor(c.max.hp * def.hpCost) : 0);

/** Embers kept on the spot (高喊, 回禮), up to her cap; nothing for anyone without them. */
export function addEmbers(c: Combatant, n: number): void {
  const m = c.mech;
  if (m?.kind !== 'embers' || !c.alive || n <= 0) return;
  m.embers = Math.min(Math.floor((c.max.hp * (m.capPct ?? EMBER.capPct)) / 100), m.embers + n);
}

/** A cover's countdown: a round less, gone at none. */
const tick = (c: { ally: string; turns: number } | undefined) => (c && c.turns > 1 ? { ...c, turns: c.turns - 1 } : undefined);

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
  init(_s, c) {
    // 熾心 (plan 8d): a higher cap, for the whole fight.
    const cap = c.mech?.kind === 'embers' ? knobOf(c, 'emberCap') : undefined;
    if (c.mech?.kind === 'embers' && cap !== undefined) c.mech.capPct = cap;
  },
  castDef(_s, c, def) {
    const n = embersOf(c);
    if (n === null) return def;
    // 赤心 (plan 8d): the embers pay the whole HP cost, so the blow is stronger.
    const paid = def.rules?.emberPaidPct;
    if (paid && costOf(c, def) > 0 && n >= costOf(c, def)) {
      return { ...def, effects: def.effects.map((e) => (e.kind === 'damage' ? { ...e, power: pctOf(e.power, 100 + paid) } : e)) };
    }
    if (def.mech !== 'ember-power') return def;
    const left = n - Math.min(n, costOf(c, def));
    const pct = 100 + Math.floor((100 * left) / c.max.hp);
    return { ...def, effects: def.effects.map((e) => (e.kind === 'damage' ? { ...e, power: pctOf(e.power, pct) } : e)) };
  },
  pay(_s, c, def) {
    if (c.mech?.kind === 'embers' && def.mech === 'ember-power') c.mech.embers = 0;
  },
  afterFoe(s, foe, ctx, from, idle) {
    // 回禮 (plan 8d): a blow she took for the one she covers keeps more embers, once an action.
    const by = ctx.coverBlow ? s.party.find((c) => c.key === ctx.coverBlow) : undefined;
    const thanks = by ? knobOf(by, 'coverEmbers') : undefined;
    if (by && thanks && s.log.slice(from).some((e) => (e.type === 'damage' || e.type === 'shield') && e.target === by.key)) {
      addEmbers(by, Math.floor((by.max.hp * thanks) / 100));
    }
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
      // Each cover counts down its own rounds (雙肩 keeps two); the one left becomes her cover.
      const left = [tick(c.cover), tick(c.coverAlso)].filter((x) => x !== undefined);
      if (left[0]) c.cover = left[0]; else delete c.cover;
      if (left[1]) c.coverAlso = left[1]; else delete c.coverAlso;
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
    if (c.alive && s.party.some((x) => x !== c && x.alive && covers(x, c.key))) out.push({ tone: 'embers', text: T.mech.guarded });
    return out;
  },
  cue(cue) {
    return cue === 'counter' ? { tone: 'embers', text: T.mech.cue.counter } : undefined;
  },
};
