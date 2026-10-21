/**
 * Sylvie's aim (spec §8.4, plan 8c ruling 17): each single shot (an attack, or a skill aimed at one foe; never an area or
 * a scatter) at her aimed foe adds a stack (up to three), at any other foe moves the aim there at one; the foe's fall
 * clears it. Each stack is more damage and more crit on that foe (combatant.hitAmount, rollHit), counted as it stood
 * before the shot. 星墜一矢 spends the stacks for power; the hunter's mark locks the aim at three on its foe for a while,
 * and shots elsewhere leave it be. Her pin (釘足箭) makes a foe act last next round (battle.turnOrder). Nothing here draws.
 */
import type { BattleState } from '../battle';
import type { Combatant } from '../combatant';
import { AIM } from '../mech';
import { pctOf } from '../skills';
import type { SkillDef } from '../types';
import { T } from '../../data/text.zh-TW';
import type { MechModule } from './index';

export { AIM };

/** Every aim on a foe that is down goes back to nothing. */
function clearFallen(s: { party: Combatant[]; enemies: Combatant[] }): void {
  for (const c of s.party) {
    const m = c.mech;
    if (m?.kind === 'aim' && m.target !== null && !s.enemies.some((e) => e.key === m.target && e.alive)) c.mech = { kind: 'aim', target: null, stacks: 0 };
  }
}

export const aim: MechModule = {
  castDef(_s, c, def) {
    const m = c.mech;
    if (m?.kind !== 'aim' || def.mech !== 'consume-aim') return def;
    return { ...def, effects: def.effects.map((e) => (e.kind === 'damage' ? { ...e, power: pctOf(e.power, 100 + AIM.consumePct * m.stacks) } : e)) };
  },
  pay(_s, c, def) {
    if (c.mech?.kind === 'aim' && def.mech === 'consume-aim') c.mech.stacks = 0;
  },
  after(s, c, act, def, ctx) {
    const m = c.mech;
    if (m?.kind !== 'aim') return;
    const skill = act.kind === 'skill' ? (def as SkillDef | null) : null;
    const single = act.kind === 'attack' || (!!skill && skill.target === 'enemy' && !skill.effects.some((e) => e.kind === 'damage' && e.scatter));
    if (!single) return;
    const t = ctx.lastHit?.target ?? ('target' in act ? act.target : undefined);
    if (!t || !s.enemies.some((e) => e.key === t)) return;
    if (m.lock && t !== m.target) return;   // the hunter's mark holds the aim where it is
    if (t === m.target) m.stacks = Math.min(AIM.cap, m.stacks + 1);
    else c.mech = { kind: 'aim', target: t, stacks: 1 };
    clearFallen(s);
  },
  onHit(_actor, target, ctx) {
    if (!target.alive && ctx.battle) clearFallen(ctx.battle);
  },
  roundEnd(s: BattleState) {
    clearFallen(s);
    for (const c of s.party) {
      const m = c.mech;
      if (m?.kind === 'aim' && m.lock) { if (m.lock > 1) m.lock -= 1; else delete m.lock; }
    }
    for (const e of s.enemies) if (e.delay !== undefined && e.delay <= s.round) delete e.delay;
  },
  foeWords(s, e) {
    const out = [];
    for (const c of s.party) {
      const m = c.mech;
      if (m?.kind === 'aim' && m.target === e.key && m.stacks > 0) out.push({ tone: 'aim' as const, text: m.lock ? T.mech.aimLocked(m.stacks) : T.mech.aim(m.stacks), setup: true as const });
    }
    if (e.delay !== undefined && e.delay > s.round) out.push({ tone: 'aim' as const, text: T.mech.last });
    return out;
  },
};
