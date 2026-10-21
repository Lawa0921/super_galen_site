import type { BattleState } from './battle';
import type { Combatant } from './combatant';
import { EQUIPMENT } from '../data/equipment';
import { STANDARD_LINEUP, partyWith } from './party';
import { NODES, TREES, type TreeNode } from '../data/trees';
import type { CharacterId, ItemInstance, Party } from './types';

/** A plain common instance of a base (no affixes) at the base's own level, for fixtures. */
export function plainItem(base: string, uid: number): ItemInstance {
  return { uid, base, rarity: 'common', ilvl: EQUIPMENT[base].ilvl, affixes: [], enhance: 0 };
}

export function makeCombatant(p: Partial<Combatant> & { key: string; side: Combatant['side'] }): Combatant {
  const max = { hp: 100, tp: 20, atk: 20, def: 20, mag: 20, res: 20, spd: 10, ...p.max };
  return {
    defId: p.side === 'enemy' ? 'slime' : 'scarlet', name: p.key, hp: max.hp, tp: max.tp, row: 'front', melee: true,
    weak: [], resist: [], boss: false, alive: true, poison: false, sleep: 0, buffs: [], taunt: 0, defending: false, limit: 0,
    x: {}, level: 1, powers: [], keystones: [],
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

/** A party of `ids` (default the standard five), everyone at level 1, for tests that need real members on a real grid. */
export function fullParty(ids: CharacterId[] = STANDARD_LINEUP): Party {
  return partyWith(ids);
}

/**
 * Puts `node` (and its pair, if any) in the cell of `owner`'s tree at `branch` / `tier` until the returned function puts the
 * old cell back: for tests of the tree rules (pairs, mechanic knobs) before the real trees hold such a node.
 */
export function withNode(owner: CharacterId, branch: number, tier: number, node: TreeNode): () => void {
  const nodes = TREES[owner].branches[branch].nodes;
  const old = nodes[tier];
  const index = (n: TreeNode, pair?: string) => { NODES[n.id] = { node: n, owner, branch, tier, ...(pair ? { pair } : {}) }; };
  const unindex = (n: TreeNode) => { delete NODES[n.id]; if (n.pair) delete NODES[n.pair.id]; };
  const put = (n: TreeNode) => {
    nodes[tier] = n;
    index(n, n.pair?.id);
    if (n.pair) index(n.pair, n.id);
  };
  unindex(old);
  put(node);
  return () => { unindex(node); put(old); };
}
