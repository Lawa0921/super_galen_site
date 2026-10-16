import { addBuff, calcDamage, dealDamage, roll, stat, SLEEP_TURNS, type BattleEvent, type Combatant } from './combatant';
import type { SkillMod } from '../data/gear';
import type { Rng } from './rng';
import type { Effect, Element, SkillDef } from './types';

export interface EffectContext { rng: Rng; itemBoost: boolean; revealed: Record<string, Element[]>; log: BattleEvent[] }

/** A power's percentage of a number: `Math.round(base * pct / 100)`. */
const pctOf = (base: number, pct: number | undefined): number => (pct === undefined ? base : Math.round((base * pct) / 100));

/**
 * A skill as a power rewrites it; the original is never touched. `target` and `hpCost` replace the skill's own (an hpCost
 * of 0 is kept, so the skill costs no HP); `hits` and `element` go to damage; `powerPct` scales damage and heal power,
 * turret power and buff percent; `turns` goes to every effect that lasts; `chance` goes to poison inflicts only; `extra`
 * is appended as written.
 */
export function patchSkill(def: SkillDef, mod: SkillMod): SkillDef {
  const effects = def.effects.map((e): Effect => {
    switch (e.kind) {
      case 'damage': return {
        ...e, power: pctOf(e.power, mod.powerPct),
        ...(mod.element !== undefined ? { element: mod.element } : {}), ...(mod.hits !== undefined ? { hits: mod.hits } : {}),
      };
      case 'heal': return { ...e, power: pctOf(e.power, mod.powerPct) };
      case 'buff': return { ...e, pct: pctOf(e.pct, mod.powerPct), turns: mod.turns ?? e.turns };
      case 'turret': return { ...e, power: pctOf(e.power, mod.powerPct), turns: mod.turns ?? e.turns };
      case 'taunt': return { ...e, turns: mod.turns ?? e.turns };
      case 'inflict': return { ...e, chance: e.status === 'poison' ? mod.chance ?? e.chance : e.chance };
      default: return { ...e };
    }
  });
  const out: SkillDef = { ...def, effects: [...effects, ...(mod.extra ?? []).map((e) => ({ ...e }))] };
  if (mod.target !== undefined) out.target = mod.target;
  if (mod.hpCost !== undefined) out.hpCost = mod.hpCost;
  return out;
}

function reveal(revealed: Record<string, Element[]>, defId: string, el: Element): void {
  const list = revealed[defId] ?? (revealed[defId] = []);
  if (!list.includes(el)) list.push(el);
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
        const { amount, mult, crit, miss } = calcDamage(actor, target, eff, ctx.rng);
        if (miss) { ctx.log.push({ type: 'miss', target: target.key }); continue; }
        dealDamage(target, amount);
        if (target.side === 'enemy') reveal(ctx.revealed, target.defId, eff.element);
        ctx.log.push({ type: 'damage', target: target.key, amount, element: eff.element, mult, ...(crit ? { crit } : {}) });
        if (!target.alive) ctx.log.push({ type: 'ko', target: target.key });
      }
      return;
    }
    case 'heal': {
      if (!target.alive) return;
      // The healer's heal bonus multiplies the amount; without it the value is unchanged to the bit.
      const bonus = 1 + (actor.x.heal ?? 0) / 100;
      const amount = gainHp(target, Math.floor((eff.power / 100) * (stat(actor, 'mag') * 2 + 10) * bonus));
      ctx.log.push({ type: 'heal', target: target.key, amount });
      return;
    }
    case 'restore': {
      if (!target.alive) return;
      const k = ctx.itemBoost ? 2 : 1;
      if (eff.hp) ctx.log.push({ type: 'heal', target: target.key, amount: gainHp(target, eff.hp * k) });
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
      target.sleep = 0;
      ctx.log.push({ type: 'cure', target: target.key });
      return;
    }
    case 'inflict': {
      if (!target.alive) return;
      const res = (eff.status === 'poison' ? target.x.poisonRes : target.x.sleepRes) ?? 0;
      if (ctx.rng() < eff.chance * (target.boss ? 0.5 : 1) * (1 - res / 100)) {
        if (eff.status === 'poison') target.poison = true;
        else target.sleep = SLEEP_TURNS;
        ctx.log.push({ type: 'status', target: target.key, status: eff.status });
      } else {
        ctx.log.push({ type: 'resist', target: target.key });
      }
      return;
    }
    case 'buff': {
      if (!target.alive) return;
      addBuff(target, { stat: eff.stat, pct: eff.pct, turns: eff.turns });
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
  }
}
