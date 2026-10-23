/**
 * The plain player of the sim and the battle's 「自動」 (plan 8h final review): `choose` and the damage ranking it uses,
 * in a module of their own so the battle screen reads them without the sim (engine/sim.ts re-exports both).
 */
import { LIMIT_MAX, skillFor, type Action, type BattleState } from './battle';
import type { Combatant } from './combatant';
import { applyPolicy, type PolicyTable } from './policy';
import { castCost, castDef, whyNot } from './mechanics/index';
import { learnedSkills } from './progression';
import { DEFAULT_POLICIES } from '../data/policies';
import type { CharacterId, Party, SkillDef } from './types';

/**
 * A plain player that follows each member's policy (spec §12.5, plan 8a Task 4): the ultimate when the gauge is full, then
 * the member's policy rules (engine/policy.ts, which read only the new mechanics), then a heal when someone is under half
 * HP, else the strongest affordable damage skill by `castPower`, else attack. A skill a `spend-at` rule holds back is left
 * out of the heal and damage picks. It draws nothing.
 */
export function choose(s: BattleState, party: Party, policies: PolicyTable = DEFAULT_POLICIES): Record<string, Action> {
  const out: Record<string, Action> = {};
  const foes = s.enemies.filter((e) => e.alive);
  const hurt = s.party.filter((c) => c.alive && c.hp < c.max.hp / 2).sort((a, b) => a.hp - b.hp)[0];
  for (const c of s.party.filter((x) => x.alive)) {
    const target = foes[0]?.key ?? '';
    const id = c.key as CharacterId;
    if (c.limit >= LIMIT_MAX) { out[c.key] = { kind: 'ultimate', target }; continue; }
    // Each skill as this member casts it (worn powers) and at the TP they pay for it now (her mechanic included).
    const skills = learnedSkills(party.roster[id]).flatMap((sk) => skillFor(c, sk) ?? [])
      .filter((sk) => !sk.passive && castCost(s, c, sk.id) <= c.tp && !whyNot(s, c, sk));
    const power = (def: SkillDef) => castPower(s, c, def);
    const { action, hold } = applyPolicy(s, c, skills, policies[id] ?? [], power);
    if (action) { out[c.key] = action; continue; }
    const usable = hold.length ? skills.filter((sk) => !hold.includes(sk.id)) : skills;
    const heal = usable.find((sk) => sk.effects.some((e) => e.kind === 'heal'));
    if (hurt && heal) { out[c.key] = { kind: 'skill', skill: heal.id, target: hurt.key }; continue; }
    const dmg = usable
      .filter((sk) => sk.effects.some((e) => e.kind === 'damage'))
      .sort((a, b) => power(b) - power(a))[0];
    out[c.key] = dmg ? { kind: 'skill', skill: dmg.id, target } : { kind: 'attack', target };
  }
  return out;
}

/**
 * What `def` is worth as `c` casts it now, for ranking damage skills: the damage effects' power x hits of the skill as
 * her mechanic would cast it (mechanics.castDef: Noel's heat), so the sim never spends big at nothing.
 */
export function castPower(s: BattleState, c: Combatant, def: SkillDef): number {
  // Without the abyss capstones' depth bonus (plan 8h Task 9): ranking by it moved 殘響's 連擊 band past its 1.6 ceiling
  // (1.60 → 1.65 in bands-9), so the sim keeps ranking as before; the menu and 自動's note show the bonus (castNow).
  return castDef(s, c, def).effects.reduce((n, e) => n + (e.kind === 'damage' ? e.power * (e.hits ?? 1) : 0), 0);
}
