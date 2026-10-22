/**
 * The sim player's per-character policies (spec §12.5, plan 8a Task 4): a short priority list of fixed rule kinds, read
 * top-down; the first that holds is the member's action this round. Every rule is pure and draws nothing, and each one
 * reads only the new mechanics (`Combatant.mech`, `BattleState.barriers`), so on the old roster none of them holds.
 */
import type { Action, BattleState } from './battle';
import type { Combatant } from './combatant';
import { mechGauge, type MechGauge, type MoonPhase } from './mech';
import { echoDef, echoOf } from './mechanics/echo';
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
  /** `of: 'maxHp'`: the gauge is read as a percent of her max HP (Scarlet's embers). */
  | { kind: 'spend-at'; gauge: MechGauge; min: number; skill: string; of?: 'maxHp' }
  | { kind: 'heal-below'; pct: number }
  /** `aoe`: rank by power x the foes the cast meets (`reach`), not by power alone (plan 8h ruling 6). */
  | { kind: 'strongest-damage'; aoe?: true }
  // The rules below are for the suggested builds (plan 8h Task 1); no default policy uses them.
  /** Her taunt is down to its last round (or gone): cast `skill`. */
  | { kind: 'ensure-taunt'; skill: string }
  /** She covers no one: cast `skill` on the other living ally with the lowest share of HP (ties in party order). */
  | { kind: 'ensure-cover'; skill: string }
  /** A barrier of hers is lasting or has at least `min` rounds left: release it with `skill` on the first foe. */
  | { kind: 'release-at'; min: number; skill: string }
  /** The moon is at `phase`: cast `skill`. */
  | { kind: 'at-phase'; phase: MoonPhase; skill: string }
  /** A foe is under `pct`% of its HP: cast `skill` on it, a marked one first. */
  | { kind: 'execute-below'; pct: number; skill: string }
  /** She keeps a beat and her last move was not `skill`: cast it. */
  | { kind: 'cast-unless-last'; skill: string }
  /**
   * Cast `skill` whenever it can be cast; `big`: only while a boss or an elite stands; `whileAbsent`: not while an
   * effect she gave with it still holds (`holding`).
   */
  | { kind: 'cast-when'; skill: string; big?: true; whileAbsent?: true }
  /** The hero: echo the coming round's record when it is worth at least his strongest damage skill (power x reach). */
  | { kind: 'echo' };

export type PolicyTable = Readonly<Partial<Record<CharacterId, readonly PolicyRule[]>>>;

const isDamage = (d: SkillDef) => d.effects.some((e) => e.kind === 'damage');
const isHeal = (d: SkillDef) => d.effects.some((e) => e.kind === 'heal');

/**
 * How many foes a cast of `def` meets, for ranking (plan 8h ruling 6): an all-foes skill every living foe; a bounce
 * (彈射) the first foe plus each bounce the living foes allow, at its dropped power; anything else 1.
 */
export function reach(s: BattleState, def: SkillDef): number {
  const foes = s.enemies.filter((e) => e.alive).length;
  if (def.target === 'enemies') return foes;
  const b = def.runeRules?.bounce;
  if (!b) return 1;
  let n = 1;
  for (let i = 1; i <= Math.min(b.bounces, foes - 1); i++) n += (100 - b.dropPct * i) / 100;
  return n;
}

const shareOf = (c: Combatant) => c.hp / c.max.hp;

/**
 * Whether an effect `c` gave with `def` still holds (plan 8h Task 1 ruling): a moon hold while the moon is held; a buff
 * while someone wears one of that stat and sign from her; a barrier while hers from this skill stands; a riposte while
 * hers lasts. A skill with none of these leaves nothing to wait for.
 */
function holding(s: BattleState, c: Combatant, def: SkillDef): boolean {
  return def.effects.some((e) => {
    switch (e.kind) {
      case 'moon': return e.hold !== undefined && !!s.moon?.hold;
      case 'buff': return [...s.party, ...s.enemies].some((t) => t.alive && t.buffs.some((b) => b.src === c.key && b.stat === e.stat && Math.sign(b.pct) === Math.sign(e.pct)));
      case 'barrier': return (s.barriers ?? []).some((b) => b.src === c.key && b.skill === def.id);
      case 'riposte': return !!c.riposte;
      default: return false;
    }
  });
}

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
  const big = () => foes.some((e) => e.boss || e.tint === 'elite');
  /** The living ally with the lowest share of HP (ties in party order), leaving out `but`. */
  const lowest = (but?: string) => s.party.filter((m) => m.alive && m.key !== but).reduce<Combatant | undefined>((lo, m) => (!lo || shareOf(m) < shareOf(lo) ? m : lo), undefined);
  /** Where a rule with no target of its own casts `def`: a single foe the first standing, a single ally the lowest; else none. */
  const aim = (def: SkillDef | undefined): string | undefined =>
    def?.target === 'enemy' ? first : def?.target === 'ally' ? lowest()?.key : undefined;
  for (const rule of rules) {
    const usable = castable.filter((d) => !hold.includes(d.id));
    const has = (id: string) => usable.some((d) => d.id === id);
    const defOf = (id: string) => usable.find((d) => d.id === id);
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
        const raw = mechGauge(c, rule.gauge);
        if (raw === undefined) break;
        const g = rule.of === 'maxHp' ? (raw * 100) / c.max.hp : raw;
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
        const pick = byPower(usable, rule.aoe ? (d) => power(d) * reach(s, d) : power)[0];
        return { action: pick ? { kind: 'skill', skill: pick.id, target: first } : { kind: 'attack', target: first }, hold };
      }
      case 'ensure-taunt': {
        if (c.taunt <= 1 && has(rule.skill)) return cast(rule.skill);
        break;
      }
      case 'ensure-cover': {
        const ally = lowest(c.key);
        if (!c.cover && ally && has(rule.skill)) return cast(rule.skill, ally.key);
        break;
      }
      case 'release-at': {
        const held = (s.barriers ?? []).some((b) => b.src === c.key && (b.lasting || b.turns >= rule.min));
        if (held && foes.length && has(rule.skill)) return cast(rule.skill, first);
        break;
      }
      case 'at-phase': {
        if (s.moon?.phase === rule.phase && has(rule.skill)) return cast(rule.skill, aim(defOf(rule.skill)));
        break;
      }
      case 'execute-below': {
        if (!has(rule.skill)) break;
        const low = foes.filter((e) => e.hp * 100 < e.max.hp * rule.pct);
        const m = c.mech;
        const pick = low.find((e) => m?.kind === 'mark' && m.marks.includes(e.key)) ?? low[0];
        if (pick) return cast(rule.skill, pick.key);
        break;
      }
      case 'cast-unless-last': {
        const m = c.mech;
        if (m?.kind === 'beat' && m.last !== rule.skill && has(rule.skill)) return cast(rule.skill, aim(defOf(rule.skill)));
        break;
      }
      case 'cast-when': {
        const def = defOf(rule.skill);
        if (!def || (rule.big && !big())) break;
        if (rule.whileAbsent && holding(s, c, def)) break;
        return cast(rule.skill, aim(def));
      }
      case 'echo': {
        const rec = c.defId === 'hero' ? echoOf(s, s.round + 1) : null;
        if (!rec || c.tp < rec.cost || !rec.def.effects.some((e) => e.kind === 'damage')) break;
        const worth = (d: SkillDef) => power(d) * reach(s, d);
        const best = Math.max(0, ...usable.filter(isDamage).map(worth));
        if (worth(echoDef(rec)) >= best) return { action: { kind: 'echo', rec, target: first }, hold };
        break;
      }
    }
  }
  return { action: null, hold };
}
