import { addBuff, calcDamage, dealDamage, stat, SLEEP_TURNS, type BattleEvent, type Combatant } from './combatant';
import type { Rng } from './rng';
import type { Effect, Element } from './types';

export interface EffectContext { rng: Rng; itemBoost: boolean; revealed: Record<string, Element[]>; log: BattleEvent[] }

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
      for (let i = 0; i < (eff.hits ?? 1) && target.alive; i++) {
        const { amount, mult } = calcDamage(actor, target, eff, ctx.rng);
        dealDamage(target, amount);
        if (target.side === 'enemy') reveal(ctx.revealed, target.defId, eff.element);
        ctx.log.push({ type: 'damage', target: target.key, amount, element: eff.element, mult });
        if (!target.alive) ctx.log.push({ type: 'ko', target: target.key });
      }
      return;
    }
    case 'heal': {
      if (!target.alive) return;
      const amount = gainHp(target, Math.floor((eff.power / 100) * (stat(actor, 'mag') * 2 + 10)));
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
      if (ctx.rng() < eff.chance * (target.boss ? 0.5 : 1)) {
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
