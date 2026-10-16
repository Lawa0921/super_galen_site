import { mulberry32, pick } from './rng';
import { encounterTable } from './scaling';
import type { Run } from './dungeon/run';
import type { BuffStat, Pos } from './types';

export interface AltarDef {
  id: string; text: string;
  /** What the party pays: a share of every living member's max HP, and/or gold. */
  cost: { hpPct?: number; gold?: number };
  /** The stat bonus (percent of max) every member keeps for the rest of the run. */
  gain: { stat: BuffStat; pct: number };
}

/**
 * Altars. Each bonus is small (8-10%, at most one altar per room and rooms hold other things too), so even a run that finds
 * several stays inside the balance bands (balance.test.ts is unchanged and still green); the price is paid at once.
 * Run-long buffs are applied as a percentage on the party's max stats at the start of every battle (createBattle `altar`).
 */
export const ALTARS: AltarDef[] = [
  { id: 'blade', text: '血色之刃：獻上隊伍兩成的生命，全隊攻擊力在本趟永久提升。', cost: { hpPct: 20 }, gain: { stat: 'atk', pct: 10 } },
  { id: 'shield', text: '守護之盾：獻上隊伍兩成的生命，全隊防禦力在本趟永久提升。', cost: { hpPct: 20 }, gain: { stat: 'def', pct: 10 } },
  { id: 'star', text: '星語之碑：獻上 60 金幣，全隊魔力在本趟永久提升。', cost: { gold: 60 }, gain: { stat: 'mag', pct: 10 } },
  { id: 'veil', text: '靜心之幕：獻上 60 金幣，全隊魔防在本趟永久提升。', cost: { gold: 60 }, gain: { stat: 'res', pct: 10 } },
  { id: 'wind', text: '疾風之羽：獻上一成的生命，全隊速度在本趟永久提升。', cost: { hpPct: 10 }, gain: { stat: 'spd', pct: 8 } },
];

/** Which altar stands at a spot: fixed by the run seed, the depth and the position. */
export function altarAt(run: Run, depth: number, at: Pos): AltarDef {
  const h = Math.imul(run.seed ^ 0x2545f491, 0x9e3779b1) + Math.imul(depth, 0x85ebca6b) + Math.imul(at.x + 1, 0xc2b2ae35) + Math.imul(at.y + 1, 0x27d4eb2f);
  return ALTARS[(h >>> 0) % ALTARS.length];
}

/** HP an HP-costing altar takes from a member with this max HP. */
export const altarHpLoss = (maxHp: number, pct: number): number => Math.max(1, Math.floor((maxHp * pct) / 100));

/** Trap damage per living member at this depth; poison hits less hard but also drains TP. */
export const trapDamage = (effect: 'hurt' | 'poison', depth: number): number => (effect === 'hurt' ? 8 + 4 * depth : 4 + 2 * depth);
export const POISON_TP_LOSS_PCT = 20;

export const FOUNTAIN_PCT = 30;

/** The group an elite tile brings on this floor (same every time); its first enemy is the elite. */
export function eliteGroup(run: Run, depth: number): string[] {
  const rng = mulberry32((run.seed ^ Math.imul(depth, 0x9e3779b1) ^ 0xe11e) >>> 0);
  return [...pick(rng, encounterTable(run.region, depth))];
}

// TODO(plan 5): rare materials. Until they exist a vault pays this stand-in on top of 3 chests' worth.
export const VAULT_CHEST_MULT = 3;
export const VAULT_PLACEHOLDER = { item: 'old-coin', qty: 5 };
