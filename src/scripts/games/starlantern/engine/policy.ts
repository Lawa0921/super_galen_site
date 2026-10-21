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
  /** `big`: only while a boss or an elite stands; `below`: only once one of them is under this percent of its HP. */
  | { kind: 'ensure-barrier'; skills: string[]; big?: true; below?: number }
  /** `big`: only while a boss or an elite stands. */
  | { kind: 'ensure-device'; skills: string[]; big?: true }
  /** `big`: only a boss or an elite is worth a mark; `below`: only once its HP is under this percent of its max. */
  | { kind: 'ensure-mark'; skill: string; big?: true; below?: number }
  /**
   * Safira's beat: her strongest damage skill unlike her last move; failing that, with `repeat`, the strongest again (the
   * beat is missed, but a skill still lands); else an attack.
   */
  | { kind: 'alternate'; repeat?: true }
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
        if (rule.big && !foes.some((e) => (e.boss || e.tint === 'elite') && (rule.below === undefined || e.hp * 100 < e.max.hp * rule.below))) break;
        const skill = rule.skills.find(has);
        if (skill) return cast(skill);
        break;
      }
      case 'ensure-device': {
        const m = c.mech;
        if (m?.kind !== 'devices') break;
        if (rule.big && !foes.some((e) => e.boss || e.tint === 'elite')) break;
        const expiring = m.devices.find((d) => d.turns <= 1 && has(d.skill));
        if (expiring) return cast(expiring.skill);
        if (m.devices.length < m.cap) {
          // 雙砲台 (plan 8d Task 8): a skill that sets a twin keeps two of its device out.
          const wanted = (id: string) => (usable.find((d) => d.id === id)?.effects.some((e) => e.kind === 'device' && e.twin) ? 2 : 1);
          const skill = rule.skills.find((id) => has(id) && m.devices.filter((d) => d.skill === id).length < wanted(id));
          if (skill) return cast(skill);
        }
        break;
      }
      case 'ensure-mark': {
        const m = c.mech;
        if (m?.kind !== 'mark' || !has(rule.skill)) break;
        const marked = m.marks.filter((k) => foes.some((e) => e.key === k));
        const next = foes.find((e) => !m.marks.includes(e.key) && (!rule.big || e.boss || e.tint === 'elite') && (rule.below === undefined || e.hp * 100 < e.max.hp * rule.below));
        if (marked.length < m.cap && next) return cast(rule.skill, next.key);
        break;
      }
      case 'alternate': {
        const m = c.mech;
        if (m?.kind !== 'beat') break;
        const ranked = byPower(usable, power);
        const pick = ranked.find((d) => d.id !== m.last);
        if (pick) return cast(pick.id, first);
        if (rule.repeat && ranked[0]) return cast(ranked[0].id, first);
        return { action: { kind: 'attack', target: first }, hold };
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
