import type { BattleState } from './battle';
import type { Combatant } from './combatant';
import { EQUIPMENT } from '../data/equipment';
import type { ItemInstance } from './types';

/** A plain common instance of a base (no affixes) at the base's own level, for fixtures. */
export function plainItem(base: string, uid: number): ItemInstance {
  return { uid, base, rarity: 'common', ilvl: EQUIPMENT[base].ilvl, affixes: [], enhance: 0 };
}

export function makeCombatant(p: Partial<Combatant> & { key: string; side: Combatant['side'] }): Combatant {
  const max = { hp: 100, tp: 20, atk: 20, def: 20, mag: 20, res: 20, spd: 10, ...p.max };
  return {
    defId: p.side === 'enemy' ? 'slime' : 'scarlet', name: p.key, hp: max.hp, tp: max.tp, row: 'front', melee: true,
    weak: [], resist: [], boss: false, alive: true, poison: false, sleep: 0, buffs: [], taunt: 0, turret: null, defending: false, limit: 0,
    x: {}, level: 1, powers: [],
    ...p, max,
  };
}

export const constRng = (v: number) => () => v;

export function memoryStorage(seed: Record<string, string> = {}) {
  const map = new Map(Object.entries(seed));
  return {
    map,
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => { map.set(k, v); },
    removeItem: (k: string) => { map.delete(k); },
  };
}

export function makeBattle(party: Combatant[], enemies: Combatant[], extra: Partial<BattleState> = {}): BattleState {
  return { round: 0, party, enemies, boss: false, inventory: {}, revealed: {}, itemBoost: false, log: [], outcome: 'ongoing', ...extra };
}
