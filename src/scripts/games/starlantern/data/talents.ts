import type { AnyStat, CharacterId } from '../engine/types';
import { CHARACTER_IDS } from './characters';

/**
 * Talent boards: a 6x4 grid of normal nodes (rank 0-5) plus 3 keystones per character (rank 0-1).
 * Rules (written here once; Task 5/9's canRaiseTalent calls `talentBlocker`):
 *  - a normal node on row 0 is always open; on row r, column c it needs at least 1 rank on row r - 1 in column c - 1, c or c + 1;
 *  - keystones are NOT subject to adjacency. They need KEYSTONE_GATE ranks on the same board's normal nodes, and fewer than
 *    MAX_KEYSTONES keystones already held.
 */
export type KeystoneId = 'crit-tp' | 'kill-tp' | 'weak-tp' | 'last-stand' | 'opening-gauge' | 'regen' | 'taunt-guard';

/** Knobs; tuned later. Descriptions below are built from these. */
export const KEYSTONE_VALUES = {
  critTp: 2, killTp: 3, weakTp: 1, lastStandHp: 0.3, lastStandPct: 25, openingGauge: 25, regenPct: 3, tauntGuardPct: 20,
};
const V = KEYSTONE_VALUES;

export const KEYSTONES: Record<KeystoneId, { name: string; desc: string }> = {
  'crit-tp': { name: '心眼', desc: `暴擊時回復 ${V.critTp} TP` },
  'kill-tp': { name: '乘勝', desc: `擊倒敵人時回復 ${V.killTp} TP` },
  'weak-tp': { name: '看破', desc: `打中弱點時回復 ${V.weakTp} TP` },
  'last-stand': { name: '背水', desc: `HP 低於 ${Math.round(V.lastStandHp * 100)}% 時，造成的傷害 +${V.lastStandPct}%` },
  'opening-gauge': { name: '先機', desc: `戰鬥開始時絕技量表 +${V.openingGauge}` },
  regen: { name: '再生', desc: `每回合結束時回復最大 HP 的 ${V.regenPct}%` },
  'taunt-guard': { name: '堅守', desc: `挑釁中受到的傷害 −${V.tauntGuardPct}%` },
};

/** Multiplier on every TALENT_PER value; tuned later. */
export const TALENT_SCALE = 1;
/** Bonus per rank (before TALENT_SCALE). */
export const TALENT_PER: Partial<Record<AnyStat, number>> = {
  str: 2, int: 2, agi: 2, wil: 2, atk: 2, mag: 2, def: 2, res: 2,
  hp: 10, tp: 3, spd: 1, crit: 1, critDmg: 4, vuln: 3, multi: 2,
  armor: 12, evasion: 12, block: 2, fireDmg: 3, iceDmg: 3, thunderDmg: 3,
  heal: 3, tpRegen: 0.2, gauge: 3, matFind: 5,
};

export const BOARD_ROWS = 6;
export const BOARD_COLS = 4;
/** Each cell is an index into the character's palette; every palette stat appears 4 times. */
export const TEMPLATE: number[][] = [[0, 1, 2, 3], [4, 5, 0, 1], [2, 3, 4, 5], [0, 1, 2, 3], [4, 5, 0, 1], [2, 3, 4, 5]];

export const PALETTES: Record<CharacterId, AnyStat[]> = {
  noel: ['int', 'mag', 'fireDmg', 'iceDmg', 'thunderDmg', 'tp'],
  chizuru: ['str', 'atk', 'hp', 'def', 'res', 'crit'],
  liz: ['agi', 'atk', 'crit', 'critDmg', 'evasion', 'matFind'],
  sylvie: ['agi', 'atk', 'crit', 'critDmg', 'vuln', 'spd'],
  scarlet: ['str', 'hp', 'def', 'armor', 'block', 'fireDmg'],
  selene: ['wil', 'mag', 'heal', 'tp', 'res', 'tpRegen'],
  safira: ['agi', 'atk', 'multi', 'evasion', 'spd', 'crit'],
  bobby: ['int', 'mag', 'tp', 'def', 'gauge', 'thunderDmg'],
};

export const CHAR_KEYSTONES: Record<CharacterId, KeystoneId[]> = {
  noel: ['weak-tp', 'opening-gauge', 'last-stand'],
  chizuru: ['crit-tp', 'taunt-guard', 'opening-gauge'],
  liz: ['crit-tp', 'kill-tp', 'last-stand'],
  sylvie: ['weak-tp', 'crit-tp', 'kill-tp'],
  scarlet: ['taunt-guard', 'regen', 'last-stand'],
  selene: ['regen', 'opening-gauge', 'crit-tp'],
  safira: ['kill-tp', 'crit-tp', 'opening-gauge'],
  bobby: ['opening-gauge', 'weak-tp', 'regen'],
};
/** The keystones the default build takes: the first two. */
export const DEFAULT_KEYSTONES = Object.fromEntries(
  CHARACTER_IDS.map((c) => [c, CHAR_KEYSTONES[c].slice(0, 2)]),
) as Record<CharacterId, KeystoneId[]>;

export interface TalentNode { id: string; row: number; col: number; maxRank: 1 | 5; stat?: AnyStat; keystone?: KeystoneId }

export const KEYSTONE_GATE = 12;
export const MAX_KEYSTONES = 2;

export const BOARDS = Object.fromEntries(CHARACTER_IDS.map((c) => {
  const nodes: TalentNode[] = [];
  TEMPLATE.forEach((line, row) => line.forEach((p, col) => {
    nodes.push({ id: `${c}-t${row}${col}`, row, col, maxRank: 5, stat: PALETTES[c][p] });
  }));
  CHAR_KEYSTONES[c].forEach((keystone, i) => nodes.push({ id: `${c}-k${i}`, row: BOARD_ROWS, col: i, maxRank: 1, keystone }));
  return [c, nodes];
})) as Record<CharacterId, TalentNode[]>;

export const TALENT_NODES: Record<string, { node: TalentNode; owner: CharacterId }> = {};
for (const c of CHARACTER_IDS) for (const node of BOARDS[c]) TALENT_NODES[node.id] = { node, owner: c };

export type TalentBlocker = 'unknown' | 'maxed' | 'adjacency' | 'gate' | 'keystone-cap';

/** A node's rank: integers in [0, maxRank] only; anything else (string, NaN, negative, fractional, over max) counts as 0. */
export function rankOf(node: TalentNode, ranks: Record<string, number>): number {
  const r = ranks[node.id];
  return Number.isInteger(r) && r >= 0 && r <= node.maxRank ? r : 0;
}

/** Ranks held on the character's normal nodes (keystones excluded). Unknown ids and malformed values count as 0. */
export function boardPoints(owner: CharacterId, ranks: Record<string, number>): number {
  return BOARDS[owner].reduce((s, n) => s + (n.keystone ? 0 : rankOf(n, ranks)), 0);
}
/** Keystones the character holds. */
export function keystoneCount(owner: CharacterId, ranks: Record<string, number>): number {
  return BOARDS[owner].filter((n) => n.keystone && rankOf(n, ranks) > 0).length;
}

/**
 * Why one more rank on `nodeId` is refused, or null when allowed. Pure; spending the point is the caller's business.
 * Task 11 replays saved builds from `{}` by calling this one point at a time, so saved ranks are never trusted directly.
 */
export function talentBlocker(owner: CharacterId, nodeId: string, ranks: Record<string, number>): TalentBlocker | null {
  const entry = Object.hasOwn(TALENT_NODES, nodeId) ? TALENT_NODES[nodeId] : undefined;
  if (!entry || entry.owner !== owner) return 'unknown';
  const node = entry.node;
  if (rankOf(node, ranks) >= node.maxRank) return 'maxed';
  if (node.keystone) {
    if (boardPoints(owner, ranks) < KEYSTONE_GATE) return 'gate';
    if (keystoneCount(owner, ranks) >= MAX_KEYSTONES) return 'keystone-cap';
    return null;
  }
  if (node.row === 0) return null;
  const above = BOARDS[owner].some((n) => !n.keystone && n.row === node.row - 1 && Math.abs(n.col - node.col) <= 1 && rankOf(n, ranks) > 0);
  return above ? null : 'adjacency';
}
