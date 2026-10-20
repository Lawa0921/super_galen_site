import { addBuff, dealDamage, hitAmount, isWeak, roll, rollHit, stat, type BattleEvent, type Combatant } from './combatant';
import type { SkillMod } from '../data/gear';
import type { Rng } from './rng';
import type { Effect, Element, SkillDef } from './types';
import { KEYSTONE_VALUES, MEMORY_KEYSTONE_VALUES, type KeystoneId } from '../data/talents';
import { credit, creditPrevented, lossOf, type Ledger } from './ledger';
import { clearAilments, inflictAilment } from './ailments';
import type { BattleState } from './battle';
import { onLandedHit } from './mechanics/index';
import { MOON } from './mechanics/moon';

/**
 * `ledger`: the sim's contribution ledger (absent in the game); it reads the fight and never draws. `redirect`: set only
 * while the ledger watches an enemy's single hit a taunt turned, with the other members it could have hit instead
 * (ledger.creditPrevented). `lastHit`: the HP the current action's latest landed hit took, and from whom (burn and bleed
 * are a share of it); each action starts without. `battle`: the fight being resolved (resolveRound sets it); an effect
 * that needs it does nothing without it (a bare test context, a cast outside battle).
 */
export interface EffectContext {
  rng: Rng; itemBoost: boolean; revealed: Record<string, Element[]>; log: BattleEvent[];
  ledger?: Ledger;
  redirect?: { pool: Combatant[] };
  battle?: BattleState;
  /** The id of the skill being cast, while its effects resolve. */
  cast?: string;
  lastHit?: { target: string; amount: number };
}

/** A power's percentage of a number, rounded half away from zero so a debuff (-37.5) rounds as deep as a buff (37.5). */
export const pctOf = (base: number, pct: number | undefined): number => {
  if (pct === undefined) return base;
  const v = (base * pct) / 100;
  return Math.sign(v) * Math.round(Math.abs(v)) || 0;   // `|| 0`: never -0
};

/**
 * A skill as one mod rewrites it; the original is never touched. `target` and `hpCost` replace the skill's own (an hpCost
 * of 0 is kept, so the skill costs no HP); `hits` and `element` go to damage; `powerPct` (plus `powerDelta` points) scales
 * damage, heal and turret power, never a buff's percent; `buffPct` scales every buff and debuff percent; `turns` (plus
 * `turnsDelta`) goes to every effect that lasts; `chance` goes to poison inflicts only; `tpDelta` is added to a TP cost
 * (floored at 1); `extra` is appended as written.
 *
 * Stacking order (engine/battle.ts `skillFor` applies it, stages 2 and 3 as progression.treeMods gives them; this is the
 * one place it is stated):
 * 1. base: SKILLS[id];
 * 2. tree rank: the active node's ACTIVE_RANK_PCT on the skill's primary effect (progression.rankMod): powerPct for a
 *    damage, heal or turret skill, buffPct for a pure buff or debuff skill; a debuff riding on damage never scales;
 * 3. tree modifiers: every mod node of the skill the member holds, folded into one mod by `stackMods` in tree order:
 *    absolute values (powerPct, buffPct, turns, chance, hpCost, hits, element, target) replace the earlier node's,
 *    relative values (tpDelta, powerDelta, turnsDelta; e.g. twin-turret's +60 points and +1 turn) add;
 * 4. legendary powers last, one after another in the order worn;
 * 5. every `extra` (from the tree or a power) appended at the very end, so no powerPct or buffPct ever rescales it.
 */
export function patchSkill(def: SkillDef, mod: SkillMod): SkillDef {
  const power = mod.powerDelta === undefined ? mod.powerPct : (mod.powerPct ?? 100) + mod.powerDelta;
  const lasting = (t: number) => (mod.turns ?? t) + (mod.turnsDelta ?? 0);
  const effects = def.effects.map((e): Effect => {
    switch (e.kind) {
      case 'damage': return {
        ...e, power: pctOf(e.power, power),
        ...(mod.element !== undefined ? { element: mod.element } : {}), ...(mod.hits !== undefined ? { hits: mod.hits } : {}),
      };
      case 'heal': return { ...e, power: pctOf(e.power, power) };
      case 'buff': return { ...e, pct: pctOf(e.pct, mod.buffPct), turns: lasting(e.turns) };
      case 'turret': return { ...e, power: pctOf(e.power, power), turns: lasting(e.turns) };
      case 'taunt': return { ...e, turns: lasting(e.turns) };
      case 'expose': return { ...e, turns: lasting(e.turns) };
      case 'veil': return { ...e, turns: lasting(e.turns) };
      case 'barrier': return { ...e, power: pctOf(e.power, power), turns: lasting(e.turns) };
      // The moon's hold counts as its rounds (moon-recall's ranks hold the phase it steps back to).
      case 'moon': return mod.turns !== undefined || mod.turnsDelta !== undefined ? { ...e, hold: lasting(e.hold ?? 0) } : { ...e };
      case 'inflict': return { ...e, chance: e.status === 'poison' ? mod.chance ?? e.chance : e.chance };
      default: return { ...e };
    }
  });
  const out: SkillDef = { ...def, effects: [...effects, ...(mod.extra ?? []).map((e) => ({ ...e }))] };
  // The hex's and the veil's words name their rounds (plan 8c): a mod that changes them changes the words too.
  def.effects.forEach((e, i) => {
    const now = effects[i];
    if ((e.kind === 'expose' || e.kind === 'veil') && now.kind === e.kind && now.turns !== e.turns) out.desc = out.desc.replace(`${e.turns} 回合`, `${now.turns} 回合`);
  });
  if (mod.target !== undefined) out.target = mod.target;
  if (mod.hpCost !== undefined) out.hpCost = mod.hpCost;
  if (mod.tpDelta !== undefined && def.tp > 0) out.tp = Math.max(1, def.tp + mod.tpDelta);
  return out;
}

/** Mod nodes of one skill folded into one mod: absolute values replace (the later node wins), deltas add, extra appends. */
export function stackMods(mods: SkillMod[]): SkillMod {
  const out: SkillMod = {};
  for (const m of mods) {
    const { tpDelta, powerDelta, turnsDelta, extra, ...abs } = m;
    Object.assign(out, Object.fromEntries(Object.entries(abs).filter(([, v]) => v !== undefined)));
    for (const [k, v] of [['tpDelta', tpDelta], ['powerDelta', powerDelta], ['turnsDelta', turnsDelta]] as const) {
      if (v !== undefined) out[k] = (out[k] ?? 0) + v;
    }
    if (extra?.length) out.extra = [...(out.extra ?? []), ...extra];
  }
  return out;
}

function reveal(revealed: Record<string, Element[]>, defId: string, el: Element): void {
  const list = revealed[defId] ?? (revealed[defId] = []);
  if (!list.includes(el)) list.push(el);
}

/** A keystone's TP refill on one hit: only when held, held to the maximum, logged when anything was gained. */
function keystoneTp(actor: Combatant, id: KeystoneId, n: number, ctx: EffectContext): void {
  if (!actor.keystones.includes(id) || actor.tp >= actor.max.tp) return;
  const before = actor.tp;
  actor.tp = Math.min(actor.max.tp, actor.tp + n);
  ctx.log.push({ type: 'tp', target: actor.key, amount: actor.tp - before });
}

function gainHp(t: Combatant, amount: number): number {
  const before = t.hp;
  t.hp = Math.min(t.max.hp, t.hp + amount);
  return t.hp - before;
}

export function applyEffect(actor: Combatant, target: Combatant, eff: Effect, ctx: EffectContext): void {
  switch (eff.kind) {
    case 'damage': {
      // Multistrike adds one hit, only to a single-hit effect; a chance of 0 draws nothing (the one rule, combatant.roll).
      const extra = (eff.hits ?? 1) === 1 && roll((actor.x.multi ?? 0) / 100, ctx.rng) ? 1 : 0;
      for (let i = 0; i < (eff.hits ?? 1) + extra && target.alive; i++) {
        const rolls = rollHit(actor, target, eff, ctx.rng);
        if (!rolls) { ctx.log.push({ type: 'miss', target: target.key }); continue; }
        const { amount, mult, crit } = hitAmount(actor, target, eff, rolls);
        if (ctx.ledger) {
          if (actor.side === 'party' && target.side === 'enemy') credit(ctx.ledger, actor.key, 'damage', lossOf(target, amount));
          else if (actor.side === 'enemy' && target.side === 'party') creditPrevented(ctx.ledger, actor, target, eff, rolls, amount, ctx.redirect);
        }
        const lost = dealDamage(target, amount, { ledger: ctx.ledger, log: ctx.log });
        ctx.lastHit = { target: target.key, amount: lost };
        if (target.side === 'enemy') reveal(ctx.revealed, target.defId, eff.element);
        ctx.log.push({ type: 'damage', target: target.key, amount: lost, element: eff.element, mult, ...(crit ? { crit } : {}) });
        if (!target.alive) ctx.log.push({ type: 'ko', target: target.key });
        onLandedHit(actor, target, ctx);
        // crit-tp, weak-tp and kill-tp settle on every hit; none of them draws.
        if (crit) keystoneTp(actor, 'crit-tp', KEYSTONE_VALUES.critTp, ctx);
        if (isWeak(target, eff.element)) keystoneTp(actor, 'weak-tp', KEYSTONE_VALUES.weakTp, ctx);
        if (!target.alive) keystoneTp(actor, 'kill-tp', KEYSTONE_VALUES.killTp, ctx);
      }
      return;
    }
    case 'heal': {
      if (!target.alive) return;
      // The healer's heal bonus multiplies the amount; without it the value is unchanged to the bit.
      let bonus = 1 + (actor.x.heal ?? 0) / 100;
      if (actor.keystones.includes('moon-promise')) bonus *= 1 + MEMORY_KEYSTONE_VALUES.moonHealPct / 100;
      const amount = gainHp(target, Math.floor((eff.power / 100) * (stat(actor, 'mag') * 2 + 10) * bonus));
      if (actor.side === 'party' && target.side === 'party') credit(ctx.ledger, actor.key, 'healing', amount);
      ctx.log.push({ type: 'heal', target: target.key, amount });
      return;
    }
    case 'restore': {
      if (!target.alive) return;
      const k = ctx.itemBoost ? 2 : 1;
      if (eff.hp) {
        const amount = gainHp(target, eff.hp * k);
        if (actor.side === 'party' && target.side === 'party') credit(ctx.ledger, actor.key, 'healing', amount);
        ctx.log.push({ type: 'heal', target: target.key, amount });
      }
      if (eff.tp) {
        const before = target.tp;
        target.tp = Math.min(target.max.tp, target.tp + eff.tp * k);
        ctx.log.push({ type: 'tp', target: target.key, amount: target.tp - before });
      }
      return;
    }
    case 'revive': {
      if (target.alive) return;
      target.alive = true;
      target.hp = Math.max(1, Math.floor(target.max.hp * eff.hpPct));
      ctx.log.push({ type: 'revive', target: target.key });
      return;
    }
    case 'cure': {
      if (!target.alive) return;
      target.poison = false;
      delete target.poisonSrc;
      target.sleep = 0;
      clearAilments(target, { keepGuard: true });
      ctx.log.push({ type: 'cure', target: target.key });
      return;
    }
    case 'inflict': {
      if (!target.alive) return;
      inflictAilment(actor, target, eff.status, eff.chance, ctx);
      return;
    }
    case 'buff': {
      if (!target.alive) return;
      // troupe-step: her buffs on her own side last longer (a debuff on a foe does not).
      const more = actor.keystones.includes('troupe-step') && target.side === actor.side ? MEMORY_KEYSTONE_VALUES.troupeTurns : 0;
      addBuff(target, { stat: eff.stat, pct: eff.pct, turns: eff.turns + more, src: actor.key });
      ctx.log.push({ type: 'buff', target: target.key, stat: eff.stat, pct: eff.pct });
      return;
    }
    case 'taunt': {
      actor.taunt = eff.turns;
      ctx.log.push({ type: 'taunt', target: actor.key });
      return;
    }
    case 'turret': {
      actor.turret = { power: eff.power, turns: eff.turns };
      ctx.log.push({ type: 'turret', target: actor.key });
      return;
    }
    case 'expose': {
      if (!target.alive) return;
      target.exposed = Math.max(target.exposed ?? 0, eff.turns);
      return;
    }
    case 'mark': {
      // Her mark moves onto the target; with room for more (cap > 1) the oldest goes first.
      const m = actor.mech;
      if (m?.kind !== 'mark' || !target.alive) return;
      m.marks = [...m.marks.filter((k) => k !== target.key), target.key].slice(-m.cap);
      return;
    }
    case 'veil': {
      if (target !== actor) return;   // on the caster alone (plan 8c ruling 6)
      actor.veil = eff.turns;
      actor.nextCrit = true;
      return;
    }
    case 'barrier': {
      // Over the whole party, once (ruling 6), and only in a fight (ruling 7): it replaces any barrier up.
      const s = ctx.battle;
      if (target !== actor || !s) return;
      s.barriers = [{ skill: ctx.cast ?? '', kind: eff.barrier, power: eff.power, turns: eff.turns, src: actor.key }];
      return;
    }
    case 'barrier-boost': {
      const s = ctx.battle;
      if (target !== actor || !s) return;
      const b = s.barriers?.[0];
      if (!b) { ctx.log.push({ type: 'mech', actor: actor.key, cue: 'no-barrier' }); return; }
      s.barriers = [{ ...b, boost: eff.mul, turns: b.turns + eff.turns }];
      return;
    }
    case 'moon': {
      const m = ctx.battle?.moon;
      if (target !== actor || !m) return;
      const order = MOON.order;
      m.phase = eff.step === -1 ? order[(order.indexOf(m.phase) + order.length - 1) % order.length] : 'full';
      if (eff.hold) m.hold = { turns: eff.hold };
      else delete m.hold;
      return;
    }
  }
}
