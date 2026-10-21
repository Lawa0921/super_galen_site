/**
 * The runes that act once a cast (spec §6.4, plan 8e Task 5): 星燈輪轉 turns the element fire, ice, thunder, each skill
 * counting on its own (Combatant.wheel); 同步 lifts the next other ally's skill this round (BattleState.sync); 回聲
 * strikes the foe the cast struck first again at the next round's end (BattleState.reprises). 雙重詠唱 and 彈射 run in
 * battle.ts perform. The trigger runes (Task 6): `noteHit` queues them, `runTriggers` casts them after each action.
 * Nothing here draws but the hits of a reprise or a triggered cast.
 */
import type { CharacterId, Element, SkillDef } from '../types';
import { applyEffect, patchSkill, pctOf, type EffectContext } from '../skills';
import { castOnce, skillFor, syncWards, type BattleState } from '../battle';
import type { Buff, Combatant } from '../combatant';
import { raiseBarrier } from './barrier';
import type { Rng } from '../rng';
import { isInnate, pctMod, skillRank, treeSkills } from '../progression';
import { RESERVE_CAP, RUNES } from '../../data/runes';
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

/**
 * Who a lasting buff lasts on (plan 8e ruling 13): the caster for a self or single-ally buff, every standing member for a
 * party buff.
 */
export function lastingTargets(def: SkillDef, c: Combatant, party: readonly Combatant[]): Combatant[] {
  return def.target === 'allies' ? party.filter((m) => m.alive) : [c];
}

/**
 * The skills of `c` she has learned (as `triggerSkill` reads it: any skill for a combatant without ranks) with a working
 * 常駐, in the order she learned them (innate first).
 */
function lastingSkills(c: Combatant): { id: string; def: SkillDef; pct: number; reservePct: number }[] {
  if (!c.runes) return [];
  return treeSkills(c.defId as CharacterId).flatMap((id) => {
    if (!c.runes?.[id]?.length || (c.ranks && skillRank(c.ranks, id) === 0 && !isInnate(c.defId, id))) return [];
    const def = skillFor(c, id);
    const l = def?.runeRules?.lasting;
    return def && l ? [{ id, def, pct: l.pct, reservePct: l.reservePct }] : [];
  });
}

/** The max TP her working 常駐 runes hold back in this fight, in percent (at most RESERVE_CAP). */
export function battleReservePct(c: Combatant): number {
  return Math.min(RESERVE_CAP, lastingSkills(c).reduce((a, x) => a + x.reservePct, 0));
}

/**
 * How many of her working lasting barriers a fight's start would put up only to see replaced (plan 8g ruling 10): each
 * raised in learned order on a field with no barrier, as `applyLasting` raises them (`raiseBarrier`, so with 重結界 two
 * kinds both stand). The workshop warns of it: a lost one still holds back its TP. Draws nothing, changes nothing on `c`.
 */
export function lastingBarrierLoss(c: Combatant): number {
  const field = { barriers: [] } as Partial<BattleState> as BattleState;
  let raised = 0;
  for (const { def, pct } of lastingSkills(c)) {
    for (const e of def.effects) {
      if (e.kind !== 'barrier') continue;
      raiseBarrier(field, c, { ...e, power: pctOf(e.power, pct) }, def.id);
      raised++;
    }
  }
  return raised - (field.barriers?.length ?? 0);
}

/**
 * 常駐 at the fight's start (plan 8e Task 7), after the mechanics' init: in party order, each member's skills with a working
 * 常駐 put their buffs on as auras (`lastingTargets`, at the rune's percent; one a stat and way, the stronger kept) and
 * raise their barriers as lasting ones (at the rune's percent); then her max TP gives up her reserve. No TP is paid, no
 * cast is logged, nothing is drawn.
 */
export function applyLasting(s: BattleState): void {
  let raised = false;
  for (const c of s.party) {
    const list = lastingSkills(c);
    if (!list.length) continue;
    // A caster down at the start raises nothing, though her TP is still held back.
    for (const { def, pct } of c.alive ? list : []) {
      for (const e of def.effects) {
        if (e.kind === 'buff' && e.pct > 0) {
          for (const t of lastingTargets(def, c, s.party)) addAura(t, { stat: e.stat, pct: pctOf(e.pct, pct), turns: 0, src: c.key });
        } else if (e.kind === 'barrier') {
          raiseBarrier(s, c, { ...e, power: pctOf(e.power, pct) }, def.id);
          const b = s.barriers![s.barriers!.length - 1];
          s.barriers![s.barriers!.length - 1] = { ...b, lasting: true };
          raised = true;
        }
      }
    }
    const reserve = battleReservePct(c);
    if (reserve > 0) {
      const tp = Math.floor((c.max.tp * (100 - reserve)) / 100);
      // What the cap cut from her TP on entry, and nothing more, is what writeBack gives back (controller ruling).
      const cut = Math.max(0, c.tp - tp);
      if (cut > 0) c.reservedTp = cut;
      c.max = { ...c.max, tp };
      c.tp = Math.min(c.tp, c.max.tp);
    }
  }
  if (raised) syncWards(s);
}

/** An aura on `t`: one a stat and way, the stronger kept. */
function addAura(t: Combatant, a: Buff): void {
  const list = t.auras ?? [];
  const i = list.findIndex((x) => x.stat === a.stat && Math.sign(x.pct) === Math.sign(a.pct));
  if (i < 0) t.auras = [...list, a];
  else if (Math.abs(a.pct) > Math.abs(list[i].pct)) t.auras = list.map((x, j) => (j === i ? a : x));
}
