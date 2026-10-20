/**
 * The sim player's per-character policies (spec §12.5, plan 8a Task 4): a short priority list of fixed rule kinds, read
 * top-down; the first that holds is the member's action this round. Every rule is pure and draws nothing, and each one
 * reads only the new mechanics (`Combatant.mech`, `BattleState.barriers`), so on the old roster none of them holds.
 */
import type { Action, BattleState } from './battle';
import type { Combatant } from './combatant';
import { mechGauge, type MechGauge } from './mech';
import type { CharacterId, SkillDef } from './types';

export type PolicyRule =
  | { kind: 'ensure-barrier'; skills: string[] }
  | { kind: 'ensure-device'; skills: string[] }
  | { kind: 'ensure-mark'; skill: string }
  | { kind: 'alternate' }
  | { kind: 'spend-at'; gauge: MechGauge; min: number; skill: string }
  | { kind: 'heal-below'; pct: number }
  | { kind: 'strongest-damage' };

export type PolicyTable = Readonly<Partial<Record<CharacterId, readonly PolicyRule[]>>>;

const isDamage = (d: SkillDef) => d.effects.some((e) => e.kind === 'damage');
const isHeal = (d: SkillDef) => d.effects.some((e) => e.kind === 'heal');

/** The castable damage skills, strongest first; ties keep their order (a stable sort, as `choose` sorts). */
const byPower = (castable: SkillDef[], power: (def: SkillDef) => number) =>
  castable.filter(isDamage).sort((a, b) => power(b) - power(a));

/**
 * The first rule of `rules` that holds gives `action`; `hold` lists the skills a `spend-at` rule keeps back while its
 * gauge is under the threshold (only when that gauge exists), and later rules do not cast them either. `castable` is
 * what the member has learned, is not passive and can pay for; `power` ranks damage skills.
 */
export function applyPolicy(s: BattleState, c: Combatant, castable: SkillDef[], rules: readonly PolicyRule[], power: (def: SkillDef) => number): { action: Action | null; hold: string[] } {
  const hold: string[] = [];
  const foes = s.enemies.filter((e) => e.alive);
  const first = foes[0]?.key ?? '';
  for (const rule of rules) {
    const usable = castable.filter((d) => !hold.includes(d.id));
    const has = (id: string) => usable.some((d) => d.id === id);
    const cast = (skill: string, target?: string): { action: Action; hold: string[] } =>
      ({ action: target === undefined ? { kind: 'skill', skill } : { kind: 'skill', skill, target }, hold });
    switch (rule.kind) {
      case 'ensure-barrier': {
        if (c.mech?.kind !== 'barrier' || (s.barriers ?? []).some((b) => b.turns > 1)) break;
        const skill = rule.skills.find(has);
        if (skill) return cast(skill);
        break;
      }
      case 'ensure-device': {
        const m = c.mech;
        if (m?.kind !== 'devices') break;
        const expiring = m.devices.find((d) => d.turns <= 1 && has(d.skill));
        if (expiring) return cast(expiring.skill);
        if (m.devices.length < m.cap) {
          const skill = rule.skills.find((id) => has(id) && !m.devices.some((d) => d.skill === id));
          if (skill) return cast(skill);
        }
        break;
      }
      case 'ensure-mark': {
        const m = c.mech;
        if (m?.kind !== 'mark' || !has(rule.skill)) break;
        const marked = m.marks.filter((k) => foes.some((e) => e.key === k));
        const next = foes.find((e) => !m.marks.includes(e.key));
        if (marked.length < m.cap && next) return cast(rule.skill, next.key);
        break;
      }
      case 'alternate': {
        const m = c.mech;
        if (m?.kind !== 'beat') break;
        const pick = byPower(usable, power).find((d) => d.id !== m.last);
        return { action: pick ? { kind: 'skill', skill: pick.id, target: first } : { kind: 'attack', target: first }, hold };
      }
      case 'spend-at': {
        const g = mechGauge(c, rule.gauge);
        if (g === undefined) break;
        if (g < rule.min) { if (!hold.includes(rule.skill)) hold.push(rule.skill); break; }
        if (!has(rule.skill)) break;
        const m = c.mech;
        const aimed = m?.kind === 'aim' && m.target !== null && foes.some((e) => e.key === m.target) ? m.target : null;
        return cast(rule.skill, aimed ?? first);
      }
      case 'heal-below': {
        const hurt = s.party.filter((m) => m.alive && m.hp < (m.max.hp * rule.pct) / 100).sort((a, b) => a.hp - b.hp)[0];
        const heal = usable.find(isHeal);
        if (hurt && heal) return cast(heal.id, hurt.key);
        break;
      }
      case 'strongest-damage': {
        const pick = byPower(usable, power)[0];
        return { action: pick ? { kind: 'skill', skill: pick.id, target: first } : { kind: 'attack', target: first }, hold };
      }
    }
  }
  return { action: null, hold };
}
