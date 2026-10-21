/**
 * The runes that act once a cast (spec §6.4, plan 8e Task 5): 星燈輪轉 turns the element fire, ice, thunder, each skill
 * counting on its own (Combatant.wheel); 同步 lifts the next other ally's skill this round (BattleState.sync); 回聲
 * strikes the foe the cast struck first again at the next round's end (BattleState.reprises). 雙重詠唱 and 彈射 run in
 * battle.ts perform. The trigger runes (Task 6): `noteHit` queues them, `runTriggers` casts them after each action.
 * Nothing here draws but the hits of a reprise or a triggered cast.
 */
import type { CharacterId, Element } from '../types';
import { applyEffect, patchSkill, pctOf, type EffectContext } from '../skills';
import { castOnce, skillFor, type BattleState } from '../battle';
import type { Combatant } from '../combatant';
import type { Rng } from '../rng';
import { isInnate, pctMod, skillRank, treeSkills } from '../progression';
import { RUNES } from '../../data/runes';
import { T } from '../../data/text.zh-TW';
import type { MechModule } from './index';

/** The starwheel's turn: fire first, then ice, then thunder. */
export const WHEEL: readonly Element[] = ['fire', 'ice', 'thunder'];

export const runes: MechModule = {
  castDef(s, c, def) {
    // 星燈輪轉: the element this cast takes (the menu shows the next one).
    if (def.runeRules?.wheel) {
      const el = WHEEL[(c.wheel?.[def.id] ?? 0) % WHEEL.length];
      def = { ...def, effects: def.effects.map((e) => (e.kind === 'damage' ? { ...e, element: el } : e)) };
    }
    // 回聲's hit is this cast's damage at its own power, before any sync lifts it (Task 5 review).
    if (def.runeRules?.reprise !== undefined) {
      const pct = def.runeRules.reprise;
      const repriseHit = def.effects.flatMap((e) => (e.kind === 'damage' ? [{ ...e, power: pctOf(e.power, pct) }] : []));
      def = { ...def, runeRules: { ...def.runeRules, repriseHit } };
    }
    // 同步: another ally's skill while the sync stands is that much stronger, its damage and its heals.
    const sync = s.sync;
    if (sync && c.side === 'party' && c.key !== sync.by) {
      def = { ...def, effects: def.effects.map((e) => (e.kind === 'damage' || e.kind === 'heal' ? { ...e, power: pctOf(e.power, 100 + sync.pct) } : e)) };
    }
    return def;
  },
  after(s, c, act, def, ctx) {
    if (act.kind !== 'skill' || !def) return;
    // The sync goes with the first other ally's skill it lifted: one with damage or a heal (a buff leaves it waiting).
    if (s.sync && c.key !== s.sync.by && def.effects.some((e) => e.kind === 'damage' || e.kind === 'heal')) delete s.sync;
    const rules = 'runeRules' in def ? def.runeRules : undefined;
    if (!rules) return;
    if (rules.wheel) c.wheel = { ...c.wheel, [def.id]: (c.wheel?.[def.id] ?? 0) + 1 };
    if (rules.sync !== undefined) s.sync = { pct: rules.sync, by: c.key };
    // 回聲: only a cast that struck a foe leaves one, aimed at the first foe it struck.
    if (rules.reprise !== undefined && rules.repriseHit && ctx.struck) {
      s.reprises = [...(s.reprises ?? []), { by: c.key, target: ctx.struck, round: s.round + 1, name: def.name, effects: rules.repriseHit }];
    }
  },
  roundEnd(s, ctx) {
    delete s.sync;   // unused by the round's end, it is gone
    const due = (s.reprises ?? []).filter((r) => r.round === s.round);
    if (!due.length) return;
    s.reprises = (s.reprises ?? []).filter((r) => r.round !== s.round);
    if (!s.reprises.length) delete s.reprises;
    for (const r of due) {
      const by = s.party.find((c) => c.key === r.by && c.alive);
      const t = s.enemies.find((c) => c.key === r.target && c.alive);
      if (!by || !t) continue;
      s.log.push({ type: 'act', actor: by.key, label: T.rune.reprise(r.name) });
      for (const e of r.effects) applyEffect(by, t, e, ctx);
    }
  },
};

type Trigger = 'crit' | 'kill' | 'struck';

/**
 * Her skill that a trigger of this kind sets off: the first she has learned (her innate skills first, then her tree's
 * order) with a working trigger rune for `on` (plan 8e ruling 11). A combatant without ranks (tests) knows every skill.
 */
function triggerSkill(c: Combatant, on: Trigger): string | undefined {
  if (!c.runes) return undefined;
  return treeSkills(c.defId as CharacterId).find((id) => c.runes?.[id]?.length
    && (!c.ranks || skillRank(c.ranks, id) > 0 || isInnate(c.defId, id))
    && skillFor(c, id)?.runeRules?.trigger?.on === on);
}

/** Queues `c`'s trigger for `on` against `foe`, once a round. */
function queue(s: BattleState, c: Combatant, on: Trigger, foe: string): void {
  if (c.fired?.[on] === s.round) return;
  const skill = triggerSkill(c, on);
  if (!skill) return;
  c.fired = { ...c.fired, [on]: s.round };
  s.triggers = [...(s.triggers ?? []), { by: c.key, skill, on, foe }];
}

/**
 * One landed hit of an action (plan 8e Task 6), while that action's actor is `ctx.acting`: a member's crit queues her
 * crit trigger, her felling a foe her kill trigger; a foe's blow on a member queues her struck trigger. Draws nothing.
 */
export function noteHit(actor: Combatant, target: Combatant, crit: boolean, ctx: EffectContext): void {
  const s = ctx.battle;
  if (!s || ctx.acting !== actor.key) return;
  if (actor.side === 'party' && target.side === 'enemy') {
    if (crit) queue(s, actor, 'crit', target.key);
    if (!target.alive) queue(s, actor, 'kill', target.key);
  } else if (actor.side === 'enemy' && target.side === 'party') queue(s, target, 'struck', actor.key);
}

/**
 * The queued triggers, in order (plan 8e ruling 11): each the plain skill (its trigger rune off; 雙重詠唱, 彈射, 回聲 and
 * 同步 do not ride on it; 星燈輪轉 at the element now due, the wheel not turned), with the abyss bonus as a cast has it,
 * at the trigger's percent of power and effect, for free. A single foe is the one the trigger came from, or else the
 * first standing; none standing, nothing. No TP, gauge, mechanic, echo record or further trigger.
 */
export function runTriggers(s: BattleState, ctx: EffectContext, rng: Rng): void {
  while (s.triggers?.length) {
    // No foe standing (the fight is won): nothing more is cast, not even a heal or a buff.
    if (!s.enemies.some((e) => e.alive)) { delete s.triggers; return; }
    const [t, ...rest] = s.triggers;
    s.triggers = rest;
    if (!rest.length) delete s.triggers;
    const c = s.party.find((m) => m.key === t.by);
    if (!c || !c.alive || c.frozen || c.sleep > 0) continue;
    const rune = (c.runes?.[t.skill] ?? []).find((r) => RUNES[r.id].group === 'trigger');
    let def = skillFor({ ...c, runes: { ...c.runes, [t.skill]: (c.runes?.[t.skill] ?? []).filter((r) => r !== rune) } }, t.skill);
    const pct = skillFor(c, t.skill)?.runeRules?.trigger?.pct;
    if (!def || !rune || pct === undefined) continue;
    const bonus = def.abyss && s.abyss ? pctMod(def.id, 100 + s.abyss) : undefined;
    if (bonus) def = patchSkill(def, bonus);
    def = patchSkill(def, { powerPct: pct, buffPct: pct });
    if (def.runeRules) {
      const keep = { ...def.runeRules };
      for (const k of ['twice', 'bounce', 'reprise', 'sync', 'wheel'] as const) delete keep[k];
      const wheel = def.runeRules.wheel;
      if (wheel) {
        const el = WHEEL[(c.wheel?.[def.id] ?? 0) % WHEEL.length];
        def = { ...def, effects: def.effects.map((e) => (e.kind === 'damage' ? { ...e, element: el } : e)) };
      }
      def = { ...def, runeRules: keep };
      if (!Object.keys(keep).length) delete def.runeRules;
    }
    let chosen: string | undefined;
    if (def.target === 'enemy') {
      chosen = s.enemies.find((e) => e.key === t.foe && e.alive)?.key ?? s.enemies.find((e) => e.alive)?.key;
      if (!chosen) continue;
    }
    s.log.push({ type: 'trigger', actor: c.key, skill: t.skill, rune: rune.id });
    // A cast of its own: nothing of the action that set it off rides on it (its last hit, 餘波's tries).
    delete ctx.lastHit;
    delete ctx.afterTried;
    ctx.cast = def.id;
    castOnce(s, c, def, chosen, ctx, rng);
    delete ctx.cast;
  }
}
