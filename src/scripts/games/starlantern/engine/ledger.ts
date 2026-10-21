/**
 * The contribution ledger (spec §12.6, plan 8a Task 3): what each member did in a simulated fight — damage dealt, HP
 * restored, damage prevented, shield absorbed. Only the sim passes one; it reads the fight and never draws.
 */
import { hitAmount, type Combatant, type DamageSpec, type HitRolls } from './combatant';

export interface Contribution { damage: number; healing: number; prevented: number; shield: number }
export interface Ledger { by: Record<string, Contribution> }

export function newLedger(): Ledger {
  return { by: {} };
}

/** Adds `n` of `kind` to `key`; nothing without a ledger, without a key, or for nothing gained. */
export function credit(l: Ledger | undefined, key: string | undefined, kind: keyof Contribution, n: number): void {
  if (!l || !key || !(n > 0)) return;
  const c = l.by[key] ?? (l.by[key] = { damage: 0, healing: 0, prevented: 0, shield: 0 });
  c[kind] += n;
}

export function totalOf(c: Contribution): number {
  return c.damage + c.healing + c.prevented + c.shield;
}

/** The HP `t` would really lose to `amount` (no overkill; an undying target stops at 1). Call it before the damage lands. */
export function lossOf(t: Combatant, amount: number): number {
  return t.undying ? Math.max(0, Math.min(amount, t.hp - 1)) : Math.min(amount, t.hp);
}

/**
 * Damage prevented on one landed enemy hit on a member, credited factor by factor: each one taken away alone, the hit
 * recomputed with the same rolls (`hitAmount`), and what more the target would have lost goes to whoever set the factor.
 * The factors: the target's def / res buffs (by the hit's scale), the guard barrier's ward on it (to the barrier's
 * raiser), the attacker's matching debuff, the target's defending, taunt-guard and not-a-shield while taunting; and, for
 * a single hit a taunt (or a cover) turned onto it (`redirect`), the average of what each other living member in `pool`
 * would have lost, rounded down to whole HP, to the target. An empty pool credits nothing. A shield is not a factor: it
 * is credited apart, by what it absorbs (combatant.dealDamage). Call it before the damage lands.
 */
export function creditPrevented(l: Ledger, a: Combatant, t: Combatant, spec: DamageSpec, r: HitRolls, amount: number, redirect?: { pool: Combatant[]; cover?: true }): void {
  const actual = lossOf(t, amount);
  const spared = (who: Combatant, alt: Combatant, attacker: Combatant = a): number =>
    Math.max(0, lossOf(who, hitAmount(attacker, alt, spec, r).amount) - actual);
  const guard = spec.scale === 'atk' ? 'def' : 'res';
  t.buffs.forEach((b, i) => {
    if (b.stat === guard && b.pct > 0) credit(l, b.src, 'prevented', spared(t, { ...t, buffs: t.buffs.filter((_, j) => j !== i) }));
  });
  if (t.ward && t.ward[guard] > 0) credit(l, t.ward.src, 'prevented', spared(t, { ...t, ward: undefined }));
  a.buffs.forEach((b, i) => {
    if (b.stat === spec.scale && b.pct < 0) credit(l, b.src, 'prevented', spared(t, t, { ...a, buffs: a.buffs.filter((_, j) => j !== i) }));
  });
  if (t.defending) credit(l, t.key, 'prevented', spared(t, { ...t, defending: false }));
  if (t.taunt > 0) {
    for (const k of ['taunt-guard', 'not-a-shield'] as const) {
      if (t.keystones.includes(k)) credit(l, t.key, 'prevented', spared(t, { ...t, keystones: t.keystones.filter((x) => x !== k) }));
    }
  }
  const pool = (redirect?.pool ?? []).filter((c) => c !== t && c.alive);
  if (pool.length) {
    // A cover spares its ally only what her own shield would not have caught (plan 8c final).
    const lost = (c: Combatant) => lossOf(c, hitAmount(a, c, spec, r).amount) - (redirect?.cover ? Math.min(c.shield?.amount ?? 0, lossOf(c, hitAmount(a, c, spec, r).amount)) : 0);
    const would = pool.reduce((n, c) => n + lost(c), 0);
    credit(l, t.key, 'prevented', Math.max(0, Math.floor(would / pool.length) - actual));
  }
}
