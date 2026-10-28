import type { BattleState } from './battle';
import type { Combatant } from './combatant';
import { EQUIPMENT } from '../data/equipment';
import { STANDARD_LINEUP, meet, partyWith } from './party';
import { memoriesOf } from './progression';
import { memScene } from '../data/story/scenes';
import { NODES, TREES, type TreeNode } from '../data/trees';
import type { CharacterId, ItemInstance, Party } from './types';
import { CHARACTER_IDS } from '../data/characters';
import { newGame, type GameState } from './state';
import { BOND_SWITCH } from './story/bond';
import { ROSTER_ART, ROSTER_LIVE } from '../data/monsters';

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
 * Bond plan ruling 5: `f` with the bond's battle bonus at `scale` (0: off), set back afterwards even when `f` throws.
 */
export function withBondScale<T>(scale: number, f: () => T): T {
  const was = BOND_SWITCH.scale;
  BOND_SWITCH.scale = scale;
  try {
    return f();
  } finally {
    BOND_SWITCH.scale = was;
  }
}

/**
 * Bond plan Task 5: `f` with field points earned (`earn` true) or not, set back afterwards even when `f` throws. For a test
 * that pins the whole party across a floor or a fight, where the field points would be the only change.
 */
export function withBondEarn<T>(earn: boolean, f: () => T): T {
  const was = BOND_SWITCH.earn;
  BOND_SWITCH.earn = earn;
  try {
    return f();
  } finally {
    BOND_SWITCH.earn = was;
  }
}

/**
 * Story L plan ruling 1: `c` holds at least `n` pieces and has told the first `n` (`mem:c:1` to `mem:c:n` in `seen`); she
 * is met first when she is not yet. Everything else is left as it was. For tests that pin a gate, not the gap between held
 * and told. Returns a new state.
 */
export function withTold(s: GameState, c: CharacterId, n: number): GameState {
  const party = s.party.recruited.includes(c) ? s.party : meet(s.party, c, 1);
  const m = party.roster[c];
  const roster = { ...party.roster, [c]: { ...m, memories: Math.max(memoriesOf(m), n) } };
  const seen = [...s.story.seen];
  for (let k = 1; k <= n; k++) if (!seen.includes(memScene(c, k))) seen.push(memScene(c, k));
  return { ...s, party: { ...party, roster }, story: { ...s.story, seen } };
}

/**
 * Roster plan Task A4: runs `f` with `ids` live (and their art published, ROSTER_LIVE ⊆ ROSTER_ART), then puts both sets back
 * as they were, even when `f` throws. For tests of what the lists do once a foe goes live, before any has.
 */
export function withRosterLive<T>(ids: string[], f: () => T): T {
  const art = ROSTER_ART as Set<string>, live = ROSTER_LIVE as Set<string>;
  const added = ids.filter((id) => !live.has(id));
  const addedArt = ids.filter((id) => !art.has(id));
  for (const id of addedArt) art.add(id);
  for (const id of added) live.add(id);
  try {
    return f();
  } finally {
    for (const id of added) live.delete(id);
    for (const id of addedArt) art.delete(id);
  }
}

/**
 * Roster plan L2b: the roster ids the first go-live wave (L1b) made live, in its order; with `withRosterOnly` it measures
 * the game as it was with only that wave live, for the pins written for that wave's state.
 */
export const WAVE_1_LIVE: readonly string[] = [
  'paper-moth', 'lamp-wight', 'root-hound', 'tin-soldier', 'dust-mimic', 'market-ghost', 'tongueless-bell', 'hollow-hunter', 'mist-twin',
  'moon-crow', 'bell-watcher', 'sleepwalker', 'hoarder', 'fog-warden', 'silent-bell', 'hollow-champion', 'false-moon', 'bell-warden',
];

/**
 * Roster plan L1b (controller ruling 2026-10-28): runs `f` with exactly `ids` live (their art published too), then puts both
 * sets back as they were, in their order, when `f` returns, throws, or (async) settles. For the pins written for the
 * game as it was with nothing live, once a wave is. Test support only: nothing in the game imports it.
 */
export function withRosterOnly<T>(ids: string[], f: () => T): T {
  const art = ROSTER_ART as Set<string>, live = ROSTER_LIVE as Set<string>;
  const was = { art: [...art], live: [...live] };
  const restore = () => {
    live.clear();
    for (const id of was.live) live.add(id);
    art.clear();
    for (const id of was.art) art.add(id);
  };
  live.clear();
  for (const id of ids) { live.add(id); art.add(id); }
  let later = false;
  try {
    const out = f();
    if (out instanceof Promise) { later = true; return out.finally(restore) as T; }
    return out;
  } finally {
    if (!later) restore();
  }
}
