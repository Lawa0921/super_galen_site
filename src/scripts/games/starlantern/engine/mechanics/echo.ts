/**
 * The hero's echo (spec §8.10, plan 8c ruling 20): the last skill a companion cast, this round or the last, recorded as she
 * cast it (her mechanic's rewrite included) with the TP she paid. Only a plain skill is kept: effects of damage, heal,
 * buff, inflict, cure, revive and taunt, and no mechanic tag (no barrier, device, moon or coins). The hero repeats it at
 * 70% power for the same TP (battle.ts perform). The sim never echoes. Nothing here draws.
 *
 * A variant may add a mechanic extra to a plain skill (挑釁・高喊's embers, 箭雨・覆蓋's aim): the skill stays echoable, the
 * record keeps its plain effects only and is marked `dropped`, and the menu says the extras are not copied (8d final
 * review). Whether a skill is plain is judged on the skill as written (SKILLS), so 8c's choice of what is echoable holds.
 */
import type { BattleState } from '../battle';
import { SKILLS } from '../../data/skills';
import { patchSkill } from '../skills';
import type { Effect, SkillDef } from '../types';
import type { MechModule } from './index';

export const ECHO = { powerPct: 70 } as const;

export type EchoRecord = NonNullable<BattleState['echo']>;

const PLAIN: ReadonlySet<Effect['kind']> = new Set(['damage', 'heal', 'buff', 'inflict', 'cure', 'revive', 'taunt']);

/** The record the hero can echo in `round` (by default the one being played): this round's or the last round's. */
export function echoOf(s: BattleState, round = s.round): EchoRecord | null {
  const rec = s.echo;
  return rec && rec.round >= round - 1 ? rec : null;
}

/** The skill as the hero echoes it: the record at 70% power. */
export function echoDef(rec: EchoRecord): SkillDef {
  return patchSkill(rec.def, { powerPct: ECHO.powerPct });
}

/**
 * The skill as the echo keeps it (plan 8e ruling 17): her per-hit runes and their rewrites stay (shape, hits, element,
 * power, ailments, drain, TP back, armor break, cure, shield, rounds); every rule a cast of hers runs is dropped (twin
 * cast, bounce, reprise, sync, blood price, trigger, lasting, wheel). With 雙重詠唱 or 血之代價 working, the TP and HP
 * cost are the skill's without them, and the price is that TP after her discount, at least 1 (her mechanic's discount
 * is not counted again); else the price is what she paid.
 */
function withoutCastRunes(cast: SkillDef, paid: number, tpCost: number): { skill: SkillDef; cost: number } {
  if (!cast.runeRules) return { skill: cast, cost: paid };
  const { runeRules: { plain }, ...skill } = cast;
  if (!plain) return { skill, cost: paid };
  delete skill.hpCost;
  const kept: SkillDef = { ...skill, tp: plain.tp, ...(plain.hpCost !== undefined ? { hpCost: plain.hpCost } : {}) };
  return { skill: kept, cost: Math.max(1, Math.ceil((plain.tp * (100 - tpCost)) / 100 - 1e-9)) };
}

export const echo: MechModule = {
  after(s, c, act, def, ctx) {
    if (c.defId === 'hero' || act.kind !== 'skill' || !def || ctx.paid === undefined) return;
    const cast = def as SkillDef;
    const base = SKILLS[cast.id] ?? cast;
    if (cast.mech || cast.passive || !base.effects.length || !base.effects.every((e) => PLAIN.has(e.kind))) return;
    const { skill, cost } = withoutCastRunes(cast, ctx.paid, c.x.tpCost ?? 0);
    const plain = skill.effects.filter((e) => PLAIN.has(e.kind));
    if (plain.length === skill.effects.length) s.echo = { by: c.key, round: s.round, def: skill, cost };
    else s.echo = { by: c.key, round: s.round, def: { ...skill, effects: plain }, cost, dropped: true };
  },
};
