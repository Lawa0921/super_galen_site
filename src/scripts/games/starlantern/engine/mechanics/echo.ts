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

export const echo: MechModule = {
  after(s, c, act, def, ctx) {
    if (c.defId === 'hero' || act.kind !== 'skill' || !def || ctx.paid === undefined) return;
    const skill = def as SkillDef;
    const base = SKILLS[skill.id] ?? skill;
    if (skill.mech || skill.passive || !base.effects.length || !base.effects.every((e) => PLAIN.has(e.kind))) return;
    const plain = skill.effects.filter((e) => PLAIN.has(e.kind));
    if (plain.length === skill.effects.length) s.echo = { by: c.key, round: s.round, def: skill, cost: ctx.paid };
    else s.echo = { by: c.key, round: s.round, def: { ...skill, effects: plain }, cost: ctx.paid, dropped: true };
  },
};
