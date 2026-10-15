import type { Rng } from './rng';
import type { BuffStat, Element, Row, Stats } from './types';

export interface Buff { stat: BuffStat; pct: number; turns: number }

export interface Combatant {
  key: string; side: 'party' | 'enemy'; defId: string; name: string;
  max: Stats; hp: number; tp: number; row: Row; melee: boolean;
  weak: Element[]; resist: Element[]; boss: boolean; alive: boolean;
  poison: boolean; sleep: number; buffs: Buff[]; taunt: number;
  turret: { power: number; turns: number } | null; defending: boolean;
  /** Ultimate gauge, 0–100; enemies keep 0. */
  limit: number;
}

export type BattleEvent =
  | { type: 'act'; actor: string; label: string; ultimate?: string }
  | { type: 'no-limit'; actor: string }
  | { type: 'damage'; target: string; amount: number; element: Element; mult: number }
  | { type: 'ko'; target: string }
  | { type: 'heal'; target: string; amount: number }
  | { type: 'tp'; target: string; amount: number }
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

export function calcDamage(a: Combatant, t: Combatant, spec: DamageSpec, rng: Rng): { amount: number; mult: number } {
  const atk = stat(a, spec.scale);
  const def = stat(t, spec.scale === 'atk' ? 'def' : 'res');
  const el = elementMult(t, spec.element);
  let mult = el;
  if (spec.melee && a.row === 'back') mult *= 0.5;
  if (spec.melee && t.row === 'back') mult *= 0.5;
  if (t.defending) mult *= 0.5;
  const base = ((atk * spec.power) / 100) * (60 / (40 + def));
  return { amount: Math.max(1, Math.floor(base * mult * (0.9 + rng() * 0.2))), mult: el };
}

export function dealDamage(t: Combatant, amount: number): void {
  if (t.side === 'party' && t.alive && amount > 0) t.limit = Math.min(100, t.limit + Math.max(1, Math.floor((amount / t.max.hp) * 40)));
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
