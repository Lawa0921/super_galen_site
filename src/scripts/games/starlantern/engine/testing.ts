import type { BattleState } from './battle';
import type { Combatant } from './combatant';
import { EQUIPMENT } from '../data/equipment';
import { STANDARD_LINEUP, partyWith } from './party';
import { K, NODES, P, TREES, V, type TreeNode } from '../data/trees';
import type { CharacterId, ItemInstance, Party } from './types';
import { CHARACTER_IDS } from '../data/characters';
import { newGame, type GameState } from './state';

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

/**
 * A version 8 save as plan 8c's build wrote one (plan 8d Task 2): everyone recruited, the hero at Lv30 with 4 memories, Noel
 * at Lv20 wearing 群星之戒 (lg-noel, a legendary power), everyone else at Lv12; each tree holds 1 rank in tier 0 and 1 in
 * tier 1 of every branch, under the ids of `trees8b` (engine/__fixtures__/roster-8b.json `trees`, strengthening nodes and
 * since-renamed ids included). `state` is the same game as this build writes it, for comparing the fields a migration keeps.
 */
export function version8Save(trees8b: Record<string, { id: string }[][]>): { raw: string; state: GameState } {
  const g = newGame();
  g.party.recruited = [...CHARACTER_IDS];
  for (const id of CHARACTER_IDS) {
    const m = g.party.roster[id];
    m.level = id === 'hero' ? 30 : id === 'noel' ? 20 : 12;
    m.tree = Object.fromEntries(trees8b[id].flatMap((b) => [[b[0].id, 1], [b[1].id, 1]]));
  }
  g.party.roster.hero.memories = 4;
  g.party.roster.noel.equip.ring1 = { ...plainItem('star-ring', g.nextUid), rarity: 'legendary', ilvl: 20, special: 'lg-noel' };
  g.nextUid++;
  return { raw: JSON.stringify({ ...g, version: 8 }), state: g };
}

/**
 * Noel's tree with one pair and one mechanic node in place of two plan 8c nodes (plan 8d Task 4, before Task 3 writes
 * them for real): 連星 / 重星 at branch 0 tier 1 and 冷靜 at branch 1 tier 1. Returns the function that puts the old
 * nodes back. Used by the tree page's tests and its e2e (the dev server serves this module to the page).
 */
export function noelTreeFixture(): () => void {
  const twin = V('noel-star-twin', 'fire-star', '連星', [55, 60, 65].map((powerPct) => ({ hits: 2, powerPct })), (m) => `改為 2 段，每段威力 ${m.powerPct}%。`);
  const heavy = V('noel-star-heavy', 'fire-star', '重星', [130, 140, 150].map((powerPct) => ({ powerPct })), (m) => `威力 ${m.powerPct}%，每次熱度 +2。`);
  const pair = withNode('noel', 0, 1, P(twin, heavy));
  const calm = withNode('noel', 1, 1, K('noel-calm', '冷靜', 'heatMax', [6, 7, 8], (v) => `熱度上限 ${v}。`));
  return () => { calm(); pair(); };
}
