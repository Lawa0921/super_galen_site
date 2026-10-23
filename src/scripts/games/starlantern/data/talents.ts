import type { AnyStat, CharacterId } from '../engine/types';
import { CHARACTER_IDS, DEFAULT_RULES, rulesOf } from './characters';

/**
 * Talent boards: a BOARD_ROWS x rulesOf(c).boardCols grid of normal nodes (rank 0-5) plus the character's keystones (rank 0-1):
 * a companion has 6x4 and 3 keystones, the hero 6x6 and 5.
 * Rules (written here once; Task 5/9's canRaiseTalent calls `talentBlocker`):
 *  - a normal node on row 0 is always open; on row r, column c it needs at least 1 rank on row r - 1 in column c - 1, c or c + 1;
 *  - keystones are NOT subject to adjacency. They need KEYSTONE_GATE ranks on the same board's normal nodes, and fewer than
 *    rulesOf(owner).maxKeystones keystones already held.
 */
export type BoardKeystoneId = 'crit-tp' | 'kill-tp' | 'weak-tp' | 'last-stand' | 'opening-gauge' | 'regen' | 'taunt-guard';
/** A companion's memory keystone: awake when she has every piece of her chain (Rin: when she has sworn her oath). Never on a board. */
export type MemoryKeystoneId = 'moon-promise' | 'small-shrine' | 'troupe-step' | 'carried-out' | 'teachers-gift' | 'blueprint' | 'fathers-face' | 'not-a-shield' | 'unrung-bell';
export type KeystoneId = BoardKeystoneId | MemoryKeystoneId;

/** Knobs; tuned later. Descriptions below are built from these. */
export const KEYSTONE_VALUES = {
  critTp: 3, killTp: 4, weakTp: 2, lastStandHp: 0.3, lastStandPct: 40, openingGauge: 50, regenPct: 12, tauntGuardPct: 30,
};
const V = KEYSTONE_VALUES;

/** Knobs of the memory keystones (6b Task 12); tuned in 20b. KEYSTONE_VALUES above stays as 6a froze it. */
export const MEMORY_KEYSTONE_VALUES = {
  moonHealPct: 20, shrineDefPct: 15, shrineTurns: 3, troupeTurns: 1, fullHpPct: 30, tpCostPct: 20, devicePct: 30, matFind: 20,
  friendGuardPct: 20, bellAtkPct: 50, bellTurns: 2,
};
const M = MEMORY_KEYSTONE_VALUES;

export const KEYSTONES: Record<KeystoneId, { name: string; desc: string }> = {
  'crit-tp': { name: '心眼', desc: `暴擊時回復 ${V.critTp} TP` },
  'kill-tp': { name: '乘勝', desc: `擊倒敵人時回復 ${V.killTp} TP` },
  'weak-tp': { name: '看破', desc: `打中弱點時回復 ${V.weakTp} TP` },
  'last-stand': { name: '背水', desc: `HP 低於 ${Math.round(V.lastStandHp * 100)}% 時，造成的傷害 +${V.lastStandPct}%` },
  'opening-gauge': { name: '先機', desc: `戰鬥開始時絕技量表至少為 ${V.openingGauge}` },
  regen: { name: '再生', desc: `每回合結束時回復最大 HP 的 ${V.regenPct}%` },
  'taunt-guard': { name: '堅守', desc: `挑釁中受到的攻擊傷害 −${V.tauntGuardPct}%` },
  'moon-promise': { name: '我想看見', desc: `她還是會怕，可是她想看見明天。她施放的回復 +${M.moonHealPct}%` },
  'small-shrine': { name: '小小的祠', desc: `鈴掛在哪裡，哪裡就是她守著的神社。戰鬥開始時，全隊防禦 +${M.shrineDefPct}%，持續 ${M.shrineTurns} 回合` },
  'troupe-step': { name: '妳要繼續跳', desc: `她停下腳步，把團員一個一個想過，再替大家跳下去。她施放的增益多持續 ${M.troupeTurns} 回合` },
  'carried-out': { name: '先把人帶出去', desc: `危險還沒碰到人，她的箭就先到了。對滿血目標的傷害 +${M.fullHpPct}%` },
  'teachers-gift': { name: '平安就夠了', desc: `老師要的不是那本書，是她平安。她不再拿自己的記憶去換魔法。她的技能 TP 消耗 −${M.tpCostPct}%` },
  blueprint: { name: '我來修好', desc: `構造圖拼齊了，每一顆齒輪都找到了自己的位置。裝置效果 +${M.devicePct}%` },
  'fathers-face': { name: '父親的臉', desc: `估價是在家裡的小店學的。值得帶回家的東西，她一眼就認得。素材尋獲 +${M.matFind}` },
  'not-a-shield': { name: '不是盾，是朋友', desc: `她不再替人去死，站到了同伴旁邊。挑釁中受到的傷害再 −${M.friendGuardPct}%` },
  'unrung-bell': { name: '不再鳴響的鐘', desc: `她不再等鐘響。洛恩倒下時，凜立刻對第一個活著的敵人普通攻擊一次，並得到攻擊 +${M.bellAtkPct}%，持續 ${M.bellTurns} 回合` },
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
/** The hero's 6x6 grid over his 9-stat palette: row r, column c holds (6r + c) % 9, so every stat appears 4 times. */
const HERO_COLS = rulesOf('hero').boardCols;
const HERO_TEMPLATE: number[][] = Array.from({ length: BOARD_ROWS }, (_, r) => Array.from({ length: HERO_COLS }, (_, c) => (HERO_COLS * r + c) % 9));
/** The character's board layout: the hero's 6x6 grid, or the companions' TEMPLATE. */
export const templateOf = (c: CharacterId): number[][] => (c === 'hero' ? HERO_TEMPLATE : TEMPLATE);

export const PALETTES: Record<CharacterId, AnyStat[]> = {
  noel: ['int', 'mag', 'fireDmg', 'iceDmg', 'thunderDmg', 'tp'],
  chizuru: ['str', 'atk', 'hp', 'def', 'res', 'crit'],
  liz: ['agi', 'atk', 'crit', 'critDmg', 'evasion', 'matFind'],
  sylvie: ['agi', 'atk', 'crit', 'critDmg', 'vuln', 'spd'],
  scarlet: ['str', 'hp', 'def', 'armor', 'block', 'fireDmg'],
  selene: ['wil', 'mag', 'heal', 'tp', 'res', 'tpRegen'],
  safira: ['agi', 'atk', 'multi', 'evasion', 'spd', 'crit'],
  bobby: ['int', 'mag', 'tp', 'def', 'gauge', 'thunderDmg'],
  rin: ['agi', 'atk', 'crit', 'critDmg', 'spd', 'evasion'],
  hero: ['str', 'hp', 'atk', 'wil', 'def', 'res', 'int', 'mag', 'agi'],
};

export const CHAR_KEYSTONES: Record<CharacterId, BoardKeystoneId[]> = {
  noel: ['weak-tp', 'opening-gauge', 'last-stand'],
  chizuru: ['crit-tp', 'taunt-guard', 'opening-gauge'],
  liz: ['crit-tp', 'kill-tp', 'last-stand'],
  sylvie: ['weak-tp', 'crit-tp', 'kill-tp'],
  scarlet: ['taunt-guard', 'regen', 'last-stand'],
  selene: ['regen', 'opening-gauge', 'crit-tp'],
  safira: ['kill-tp', 'crit-tp', 'opening-gauge'],
  bobby: ['opening-gauge', 'weak-tp', 'regen'],
  rin: ['crit-tp', 'kill-tp', 'last-stand'],
  hero: ['regen', 'taunt-guard', 'last-stand', 'crit-tp', 'opening-gauge'],
};
/** The memory keystone each companion can awaken (not the hero: spec §4.6). It sits on no board and costs no point. */
export const MEMORY_KEYSTONES: Record<Exclude<CharacterId, 'hero'>, MemoryKeystoneId> = {
  selene: 'moon-promise', chizuru: 'small-shrine', safira: 'troupe-step', sylvie: 'carried-out', noel: 'teachers-gift',
  bobby: 'blueprint', liz: 'fathers-face', scarlet: 'not-a-shield', rin: 'unrung-bell',
};
/** The keystones the default build takes: the first rulesOf(c).maxKeystones (two for a companion, three for the hero). */
export const DEFAULT_KEYSTONES = Object.fromEntries(
  CHARACTER_IDS.map((c) => [c, CHAR_KEYSTONES[c].slice(0, rulesOf(c).maxKeystones)]),
) as Record<CharacterId, KeystoneId[]>;

export interface TalentNode { id: string; row: number; col: number; maxRank: 1 | 5; stat?: AnyStat; keystone?: BoardKeystoneId }

export const KEYSTONE_GATE = 12;
/** The keystone cap a character gets by default; talentBlocker reads rulesOf(owner).maxKeystones. */
export const MAX_KEYSTONES = DEFAULT_RULES.maxKeystones;

export const BOARDS = Object.fromEntries(CHARACTER_IDS.map((c) => {
  const nodes: TalentNode[] = [];
  templateOf(c).forEach((line, row) => line.forEach((p, col) => {
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
    if (keystoneCount(owner, ranks) >= rulesOf(owner).maxKeystones) return 'keystone-cap';
    return null;
  }
  if (node.row === 0) return null;
  const above = BOARDS[owner].some((n) => !n.keystone && n.row === node.row - 1 && Math.abs(n.col - node.col) <= 1 && rankOf(n, ranks) > 0);
  return above ? null : 'adjacency';
}
