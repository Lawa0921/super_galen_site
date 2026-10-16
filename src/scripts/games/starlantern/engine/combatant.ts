import { ROW_MELEE } from './formation';
import type { Rng } from './rng';
import { armorReduction, evadeChance, EVADE_MAX } from './stats';
import type { BuffStat, Element, Row, SecondaryKey, Stats } from './types';

export interface Buff { stat: BuffStat; pct: number; turns: number }

export interface Combatant {
  key: string; side: 'party' | 'enemy'; defId: string; name: string;
  max: Stats; hp: number; tp: number; row: Row; melee: boolean;
  /** Party grid cell 0-8 (engine/formation.ts); enemies have none. */
  cell?: number;
  weak: Element[]; resist: Element[]; boss: boolean; alive: boolean;
  poison: boolean; sleep: number; buffs: Buff[]; taunt: number;
  turret: { power: number; turns: number } | null; defending: boolean;
  /** Ultimate gauge, 0–100; enemies keep 0. */
  limit: number;
  /** Battle-screen colouring of a regional variant (its region's element) or an elite. */
  tint?: Element | 'elite';
  /** Derived stats in play: a member's sheet secondaries, an enemy's `sec`. A missing key is 0. */
  x: Partial<Record<SecondaryKey, number>>;
  /** A member's level; an enemy's level in this fight. Armor and evasion are rated against the attacker's. */
  level: number;
  /** Legendary powers worn (members only). */
  powers: string[];
}

export type BattleEvent =
  | { type: 'act'; actor: string; label: string; ultimate?: string }
  | { type: 'no-limit'; actor: string }
  | { type: 'damage'; target: string; amount: number; element: Element; mult: number; crit?: boolean }
  | { type: 'miss'; target: string }
  | { type: 'ko'; target: string }
  | { type: 'heal'; target: string; amount: number }
  /** `regen`: the end-of-round tpRegen, shown as a quiet pop rather than a message line. */
  | { type: 'tp'; target: string; amount: number; regen?: boolean }
  | { type: 'revive'; target: string }
  | { type: 'cure'; target: string }
  | { type: 'status'; target: string; status: 'poison' | 'sleep' }
  | { type: 'resist'; target: string }
  | { type: 'buff'; target: string; stat: BuffStat; pct: number }
  | { type: 'taunt'; target: string }
  | { type: 'turret'; target: string }
  | { type: 'asleep'; actor: string }
  | { type: 'no-tp'; actor: string }
  | { type: 'escape'; success: boolean }
  | { type: 'poison-tick'; target: string; amount: number };

export const MAX_BUFFS = 3;
export const SLEEP_TURNS = 3;

export function stat(c: Combatant, s: BuffStat): number {
  const pct = c.buffs.filter((b) => b.stat === s).reduce((sum, b) => sum + b.pct, 0);
  return Math.max(1, Math.floor(c.max[s] * Math.max(0.25, 1 + pct / 100)));
}

export function addBuff(c: Combatant, b: Buff): void {
  const i = c.buffs.findIndex((x) => x.stat === b.stat && Math.sign(x.pct) === Math.sign(b.pct));
  if (i >= 0) { c.buffs[i] = { ...b }; return; }
  if (c.buffs.length >= MAX_BUFFS) c.buffs.shift();
  c.buffs.push({ ...b });
}

export function elementMult(t: Combatant, el: Element): number {
  return t.weak.includes(el) ? 1.5 : t.resist.includes(el) ? 0.5 : 1;
}

export interface DamageSpec { power: number; element: Element; scale: 'atk' | 'mag'; melee: boolean }

/** Enemies crit for a flat 50% more, whatever critDmg they carry. */
export const ENEMY_CRIT_DMG = 50;

/** True with chance `p`; a chance of 0 or less draws nothing, so fights without these stats keep their random sequence. */
export const roll = (p: number, rng: Rng): boolean => p > 0 && rng() < p;

/**
 * One hit: evasion, then the base formula with weakness and row, element bonus and resistance, vuln (weakness hits
 * only), eliteDmg (elites and bosses), crit, armor and block (physical only), melee / ranged reduction, defending.
 * Only the variance always draws; every other roll draws only when its chance is above 0.
 */
export function calcDamage(a: Combatant, t: Combatant, spec: DamageSpec, rng: Rng): { amount: number; mult: number; crit: boolean; miss: boolean } {
  const ax = (k: SecondaryKey): number => a.x[k] ?? 0;
  const tx = (k: SecondaryKey): number => t.x[k] ?? 0;
  const el = elementMult(t, spec.element);
  // An enemy's evasion is a plain percentage, held at the same 50% as a member's rated evasion.
  const evade = t.side === 'party' ? evadeChance(tx('evasion'), a.level) : Math.min(EVADE_MAX, tx('evasion') / 100);
  if (roll(evade, rng)) return { amount: 0, mult: 1, crit: false, miss: true };   // nothing landed: no element multiplier
  const atk = stat(a, spec.scale);
  const def = stat(t, spec.scale === 'atk' ? 'def' : 'res');
  let mult = el;
  // Melee weakens with the attacker's distance; the defender's row protects by reach (formation.reachable), not by halving.
  if (spec.melee) mult *= ROW_MELEE[a.row];
  const base = ((atk * spec.power) / 100) * (60 / (40 + def));
  const variance = 0.9 + rng() * 0.2;
  // Every factor below is exactly 1 when its stat is absent, so such a hit keeps its old value to the bit.
  const hitEl = spec.element;
  // A negative resistance is a weakness, held at -100 (double damage); above 100 it is held at 100 (no damage), so the factor
  // never goes negative: a hit never heals, and a negative bonus times an over-100 resistance never multiplies back up.
  if (hitEl !== 'phys') mult *= (1 + ax(`${hitEl}Dmg`) / 100) * (1 - Math.min(100, Math.max(-100, tx(`${hitEl}Res`))) / 100);
  if (t.weak.includes(spec.element)) mult *= 1 + ax('vuln') / 100;
  if (t.boss || t.tint === 'elite') mult *= 1 + ax('eliteDmg') / 100;
  const crit = roll(ax('crit') / 100, rng);
  if (crit) mult *= 1 + (a.side === 'enemy' ? ENEMY_CRIT_DMG : ax('critDmg')) / 100;
  if (hitEl === 'phys') {
    mult *= 1 - armorReduction(tx('armor'), a.level);
    if (roll(tx('block') / 100, rng)) mult *= 0.5;
  }
  mult *= 1 - tx(spec.melee ? 'meleeDR' : 'rangedDR') / 100;
  if (t.defending) mult *= 0.5;
  return { amount: Math.max(1, Math.floor(base * mult * variance)), mult: el, crit, miss: false };
}

/** One gain of the ultimate gauge, raised by the member's gauge bonus and rounded down. */
export const gaugeGain = (c: Combatant, n: number): number => Math.floor(n * (1 + (c.x.gauge ?? 0) / 100));

export function dealDamage(t: Combatant, amount: number): void {
  if (t.side === 'party' && t.alive && amount > 0) t.limit = Math.min(100, t.limit + gaugeGain(t, Math.max(1, Math.floor((amount / t.max.hp) * 40))));
  t.hp = Math.max(0, t.hp - amount);
  t.sleep = 0;
  if (t.hp === 0) {
    t.alive = false;
    t.poison = false;
    t.buffs = [];
    t.taunt = 0;
    t.turret = null;
  }
}
