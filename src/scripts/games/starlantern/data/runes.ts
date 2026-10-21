import type { AilmentId } from '../engine/ailments';
import type { Element } from '../engine/types';

/**
 * Runes (spec §6, plan 8e): support gems a member sockets into a skill. This file is data only: each rune's name, group,
 * the tags it needs, its numbers a tier and its one sentence. The rules that read it live in engine/runes.ts (tags, fit,
 * applying a rune to a skill) and engine/sockets.ts (sockets and the bag).
 */

/** A rune's tier: the gear rarity strings (data/gear.ts), the legendary runes alone at `legendary`. */
export type RuneTier = 'common' | 'magic' | 'rare' | 'epic' | 'legendary';
/** The four tiers a normal rune comes in, worst first. */
export const RUNE_TIERS: readonly RuneTier[] = ['common', 'magic', 'rare', 'epic'];
const LEGENDARY_TIERS: readonly RuneTier[] = ['legendary'];

export type RuneGroup = 'shape' | 'hits' | 'element' | 'ailment' | 'trigger' | 'economy' | 'support' | 'legendary';
/** One skill holds at most one rune of each of these groups (spec §6.6 rule 2). */
export const EXCLUSIVE_GROUPS: readonly RuneGroup[] = ['shape', 'hits', 'element', 'trigger'];

/** A skill's tags (spec §6.2), in this order everywhere they are listed (engine/runes.ts skillTags). */
export type Tag = 'damage' | 'heal' | 'buff' | 'debuff' | 'ailment' | 'device' | 'single' | 'all' | 'self' | 'multi'
  | 'melee' | 'ranged' | 'attack' | 'spell' | 'phys' | 'fire' | 'ice' | 'thunder' | 'tp';
export const TAGS: readonly Tag[] = ['damage', 'heal', 'buff', 'debuff', 'ailment', 'device', 'single', 'all', 'self', 'multi',
  'melee', 'ranged', 'attack', 'spell', 'phys', 'fire', 'ice', 'thunder', 'tp'];

const RUNE_IDS = [
  'spread', 'focus', 'bounce', 'multistrike', 'heavy', 'flame', 'rime', 'thunderclap',
  'ignite', 'jolt', 'tear', 'frostbite', 'venom', 'aftermath', 'on-crit', 'on-kill', 'on-struck',
  'regain', 'thrift', 'charge', 'drain', 'extend', 'share', 'lasting', 'dispel', 'armor-break',
  'twin-cast', 'starwheel', 'blood-price', 'sync', 'spill-shield', 'reprise',
] as const;
export type RuneId = typeof RUNE_IDS[number];
export interface RuneRef { id: RuneId; tier: RuneTier }

/**
 * What a rune does to the skill it sits on (engine/runes.ts applyRunes reads it). `power` scales the power only; `effect`
 * scales the power and every buff or debuff percent; both are percent factors, 100 = unchanged. Chances are fractions,
 * as an `inflict` effect's. 常駐's mod is `lasting` alone, so the skill cast from the menu is unchanged (plan 8e Task 7).
 */
export interface RuneMod {
  shape?: 'spread' | 'focus' | 'share'; power?: number; effect?: number; hits?: 'plus1' | 'one'; element?: Element | 'wheel';
  onHit?: { status: AilmentId; chance: number }; inflict?: { status: AilmentId; chance: number }; aftermath?: true;
  trigger?: { on: 'crit' | 'kill' | 'struck'; pct: number }; tpPerHit?: number; drainPct?: number; armorBreak?: true;
  cure?: true; turns?: number; lasting?: { pct: number; reservePct: number }; bounce?: { bounces: number; dropPct: number };
  twice?: true; bloodPct?: number; sync?: number; overflowPct?: number; reprise?: number; tpPct?: number; tpFlat?: number;
}
export interface RuneDef {
  id: RuneId; name: string; group: RuneGroup;
  /** Outer list: any of; inner list: all of. Empty: any skill. */
  needs: Tag[][];
  /** The rune in one sentence, with this tier's numbers. */
  text: (tier: RuneTier) => string;
  mod: (tier: RuneTier) => RuneMod;
}

/**
 * Every rune's numbers (spec §6.7): `tier`, the benefit at each of its tiers (worst first; one value for a legendary);
 * `fixed`, what it always costs or always does. The sentences and the mods read them from here, never from a literal.
 */
export const RUNE_NUMBERS: Record<RuneId, { tier: Record<string, readonly number[]>; fixed: Record<string, number> }> = {
  spread: { tier: { power: [55, 60, 65, 70] }, fixed: {} },
  focus: { tier: { power: [160, 170, 180, 190] }, fixed: {} },
  bounce: { tier: { dropPct: [35, 30, 25, 20] }, fixed: { bounces: 2 } },
  multistrike: { tier: { power: [70, 75, 80, 85] }, fixed: { hits: 1 } },
  heavy: { tier: { power: [110, 115, 120, 125] }, fixed: {} },
  flame: { tier: { effect: [100, 105, 110, 115] }, fixed: { tpFlat: 1 } },
  rime: { tier: { effect: [100, 105, 110, 115] }, fixed: { tpFlat: 1 } },
  thunderclap: { tier: { effect: [100, 105, 110, 115] }, fixed: { tpFlat: 1 } },
  ignite: { tier: { chance: [30, 35, 40, 45] }, fixed: {} },
  jolt: { tier: { chance: [30, 35, 40, 45] }, fixed: {} },
  tear: { tier: { chance: [30, 35, 40, 45] }, fixed: {} },
  frostbite: { tier: { chance: [20, 25, 30, 35] }, fixed: {} },
  venom: { tier: { chance: [25, 30, 35, 40] }, fixed: {} },
  aftermath: { tier: { effect: [100, 105, 110, 115] }, fixed: { tpFlat: 1 } },
  'on-crit': { tier: { pct: [50, 60, 70, 80] }, fixed: {} },
  'on-kill': { tier: { pct: [50, 60, 70, 80] }, fixed: {} },
  'on-struck': { tier: { pct: [50, 60, 70, 80] }, fixed: {} },
  regain: { tier: { tpPerHit: [1, 1, 1, 2], power: [80, 85, 90, 90] }, fixed: {} },
  thrift: { tier: { effect: [75, 80, 85, 90] }, fixed: { tpPct: -35 } },
  charge: { tier: { effect: [130, 140, 150, 160] }, fixed: { tpPct: 60 } },
  drain: { tier: { drainPct: [6, 8, 10, 12] }, fixed: { tpFlat: 1 } },
  extend: { tier: { turns: [1, 2, 3, 4] }, fixed: { tpFlat: 2 } },
  share: { tier: { effect: [40, 50, 60, 70] }, fixed: {} },
  lasting: { tier: { pct: [50, 60, 70, 80] }, fixed: { reservePct: 30 } },
  dispel: { tier: { effect: [100, 105, 110, 115] }, fixed: { tpFlat: 2 } },
  'armor-break': { tier: { effect: [100, 105, 110, 115] }, fixed: { tpPct: 20 } },
  'twin-cast': { tier: {}, fixed: { tpPct: 100 } },
  starwheel: { tier: {}, fixed: { tpFlat: 1 } },
  'blood-price': { tier: { bloodPct: [3] }, fixed: {} },
  sync: { tier: { sync: [30] }, fixed: {} },
  'spill-shield': { tier: { overflowPct: [30] }, fixed: {} },
  reprise: { tier: { reprise: [50] }, fixed: {} },
};

export const RUNE_STACK = 99;
/** Member levels at which every active skill opens its first, second and third socket (spec §6.5). */
export const RUNE_SLOT_LEVELS = [5, 20, 35] as const;
/** The most of a member's max TP her 常駐 runes may hold back, in percent (spec §6.6 rule 6). */
export const RESERVE_CAP = 90;

/** The tiers a rune comes in: the four, or a legendary rune's one. */
export const tiersOf = (id: RuneId): readonly RuneTier[] => (RUNES[id].group === 'legendary' ? LEGENDARY_TIERS : RUNE_TIERS);

/** This tier's value of one of the rune's benefit numbers. */
const at = (id: RuneId, key: string, tier: RuneTier): number => RUNE_NUMBERS[id].tier[key][tiersOf(id).indexOf(tier)];
const fixed = (id: RuneId, key: string): number => RUNE_NUMBERS[id].fixed[key];
/** 「+60」「−35」: a signed number as the sentences write it. */
const signed = (n: number): string => (n < 0 ? `−${-n}` : `+${n}`);
/** 「，威力 105%」 or nothing at 100% (plan 8e ruling 2: a rune with no number of its own grows its power and effect). */
const unlessFull = (word: string, pct: number): string => (pct === 100 ? '' : `，${word} ${pct}%`);
const tpPlus = (id: RuneId): string => `；TP ${signed(fixed(id, 'tpFlat'))}`;
const tpPctOf = (id: RuneId): string => `TP ${signed(fixed(id, 'tpPct'))}%`;

const ELEMENT_WORD: Record<Exclude<Element, 'phys'>, string> = { fire: '火', ice: '冰', thunder: '雷' };
const AILMENT_WORD: Record<'burn' | 'shock' | 'bleed', string> = { burn: '灼燒', shock: '感電', bleed: '流血' };

const element = (id: RuneId, name: string, el: Exclude<Element, 'phys'>): RuneDef => ({
  id, name, group: 'element', needs: [['damage']],
  text: (t) => `屬性改為${ELEMENT_WORD[el]}${unlessFull('威力', at(id, 'effect', t))}${tpPlus(id)}。`,
  mod: (t) => ({ element: el, effect: at(id, 'effect', t), tpFlat: fixed(id, 'tpFlat') }),
});
const perHit = (id: RuneId, name: string, need: Tag, status: 'burn' | 'shock' | 'bleed'): RuneDef => ({
  id, name, group: 'ailment', needs: [[need, 'damage']],
  text: (t) => `每段命中 ${at(id, 'chance', t)}% 機率${AILMENT_WORD[status]}。`,
  mod: (t) => ({ onHit: { status, chance: at(id, 'chance', t) / 100 } }),
});
const trigger = (id: RuneId, name: string, on: 'crit' | 'kill' | 'struck', when: string, needs: Tag[][]): RuneDef => ({
  id, name, group: 'trigger', needs,
  text: (t) => `${when}，自動施放這招（威力 ${at(id, 'pct', t)}%，不耗 TP）。`,
  mod: (t) => ({ trigger: { on, pct: at(id, 'pct', t) } }),
});

const LIST: RuneDef[] = [
  { id: 'spread', name: '擴散', group: 'shape', needs: [['single', 'damage'], ['single', 'heal']],
    text: (t) => `改為對全體，威力 ${at('spread', 'power', t)}%。`, mod: (t) => ({ shape: 'spread', power: at('spread', 'power', t) }) },
  { id: 'focus', name: '集中', group: 'shape', needs: [['all', 'damage'], ['all', 'heal']],
    text: (t) => `改為對單體，威力 ${at('focus', 'power', t)}%。`, mod: (t) => ({ shape: 'focus', power: at('focus', 'power', t) }) },
  { id: 'bounce', name: '彈射', group: 'shape', needs: [['single', 'damage']],
    text: (t) => `命中後彈到另一個敵人，最多彈 ${fixed('bounce', 'bounces')} 次，每彈一次威力 −${at('bounce', 'dropPct', t)}%。`,
    mod: (t) => ({ bounce: { bounces: fixed('bounce', 'bounces'), dropPct: at('bounce', 'dropPct', t) } }) },
  { id: 'multistrike', name: '連擊', group: 'hits', needs: [['damage']],
    text: (t) => `段數 ${signed(fixed('multistrike', 'hits'))}，每段威力 ${at('multistrike', 'power', t)}%。`,
    mod: (t) => ({ hits: 'plus1', power: at('multistrike', 'power', t) }) },
  { id: 'heavy', name: '重擊', group: 'hits', needs: [['multi']],
    text: (t) => `改成一段，威力是原本全部段數合計的 ${at('heavy', 'power', t)}%。`, mod: (t) => ({ hits: 'one', power: at('heavy', 'power', t) }) },
  element('flame', '灼焰', 'fire'),
  element('rime', '寒霜', 'ice'),
  element('thunderclap', '雷鳴', 'thunder'),
  perHit('ignite', '點燃', 'fire', 'burn'),
  perHit('jolt', '感電', 'thunder', 'shock'),
  perHit('tear', '撕裂', 'phys', 'bleed'),
  { id: 'frostbite', name: '凍結', group: 'ailment', needs: [['ice', 'damage']],
    text: (t) => `每次施放 ${at('frostbite', 'chance', t)}% 機率凍結目標（頭目改冰緩）。`,
    mod: (t) => ({ inflict: { status: 'freeze', chance: at('frostbite', 'chance', t) / 100 } }) },
  { id: 'venom', name: '淬毒', group: 'ailment', needs: [['damage']],
    text: (t) => `每次施放 ${at('venom', 'chance', t)}% 機率中毒。`,
    mod: (t) => ({ inflict: { status: 'poison', chance: at('venom', 'chance', t) / 100 } }) },
  { id: 'aftermath', name: '餘波', group: 'ailment', needs: [['damage']],
    text: (t) => `暴擊時附帶該屬性的異常（物理是流血，頭目減半、抗性照算）${unlessFull('威力', at('aftermath', 'effect', t))}${tpPlus('aftermath')}。`,
    mod: (t) => ({ aftermath: true, effect: at('aftermath', 'effect', t), tpFlat: fixed('aftermath', 'tpFlat') }) },
  trigger('on-crit', '暴擊觸發', 'crit', '她的任何一擊暴擊時', [['damage'], ['buff']]),
  trigger('on-kill', '擊倒觸發', 'kill', '她擊倒敵人時', [['damage'], ['buff']]),
  trigger('on-struck', '受擊觸發', 'struck', '她受到攻擊後', []),
  { id: 'regain', name: '回氣', group: 'economy', needs: [['damage']],
    text: (t) => `每段命中回復 ${at('regain', 'tpPerHit', t)} TP；威力 ${at('regain', 'power', t)}%。`,
    mod: (t) => ({ tpPerHit: at('regain', 'tpPerHit', t), power: at('regain', 'power', t) }) },
  { id: 'thrift', name: '節流', group: 'economy', needs: [['tp']],
    text: (t) => `${tpPctOf('thrift')}；威力與效果 ${at('thrift', 'effect', t)}%。`,
    mod: (t) => ({ effect: at('thrift', 'effect', t), tpPct: fixed('thrift', 'tpPct') }) },
  { id: 'charge', name: '蓄力', group: 'economy', needs: [['tp']],
    text: (t) => `${tpPctOf('charge')}；威力與效果 ${at('charge', 'effect', t)}%。`,
    mod: (t) => ({ effect: at('charge', 'effect', t), tpPct: fixed('charge', 'tpPct') }) },
  { id: 'drain', name: '吸血', group: 'economy', needs: [['damage']],
    text: (t) => `造成傷害的 ${at('drain', 'drainPct', t)}% 回復自己的 HP${tpPlus('drain')}。`,
    mod: (t) => ({ drainPct: at('drain', 'drainPct', t), tpFlat: fixed('drain', 'tpFlat') }) },
  { id: 'extend', name: '延長', group: 'support', needs: [['buff'], ['debuff'], ['device']],
    text: (t) => `持續 ${signed(at('extend', 'turns', t))} 回合${tpPlus('extend')}。`,
    mod: (t) => ({ turns: at('extend', 'turns', t), tpFlat: fixed('extend', 'tpFlat') }) },
  { id: 'share', name: '共享', group: 'support', needs: [['self', 'buff']],
    text: (t) => `改為對我方全體，效果 ${at('share', 'effect', t)}%。`, mod: (t) => ({ shape: 'share', effect: at('share', 'effect', t) }) },
  { id: 'lasting', name: '常駐', group: 'support', needs: [['buff']],
    text: (t) => `戰鬥開始時自動生效且整場不消失，效果 ${at('lasting', 'pct', t)}%；保留這名角色 ${fixed('lasting', 'reservePct')}% 的 TP 上限。`,
    mod: (t) => ({ lasting: { pct: at('lasting', 'pct', t), reservePct: fixed('lasting', 'reservePct') } }) },
  { id: 'dispel', name: '除厄', group: 'support', needs: [['heal'], ['buff']],
    text: (t) => `額外解除目標的所有異常${unlessFull('效果', at('dispel', 'effect', t))}${tpPlus('dispel')}。`,
    mod: (t) => ({ cure: true, effect: at('dispel', 'effect', t), tpFlat: fixed('dispel', 'tpFlat') }) },
  { id: 'armor-break', name: '破甲', group: 'support', needs: [['phys', 'damage']],
    text: (t) => `無視目標的護甲與格擋${unlessFull('威力', at('armor-break', 'effect', t))}；${tpPctOf('armor-break')}。`,
    mod: (t) => ({ armorBreak: true, effect: at('armor-break', 'effect', t), tpPct: fixed('armor-break', 'tpPct') }) },
  { id: 'twin-cast', name: '雙重詠唱', group: 'legendary', needs: [['tp']],
    text: () => '這招連續施放兩次；TP 兩倍。', mod: () => ({ twice: true, tpPct: fixed('twin-cast', 'tpPct') }) },
  { id: 'starwheel', name: '星燈輪轉', group: 'legendary', needs: [['damage']],
    text: () => `每次施放，屬性依${ELEMENT_WORD.fire}、${ELEMENT_WORD.ice}、${ELEMENT_WORD.thunder}輪替${tpPlus('starwheel')}。`,
    mod: () => ({ element: 'wheel', tpFlat: fixed('starwheel', 'tpFlat') }) },
  { id: 'blood-price', name: '血之代價', group: 'legendary', needs: [['tp']],
    text: (t) => `不消耗 TP，改為消耗「TP×${at('blood-price', 'bloodPct', t)}%」的最大 HP。`,
    mod: (t) => ({ bloodPct: at('blood-price', 'bloodPct', t) }) },
  { id: 'sync', name: '同步', group: 'legendary', needs: [],
    text: (t) => `施放後，下一位施放技能的隊友本回合技能威力 +${at('sync', 'sync', t)}%。`, mod: (t) => ({ sync: at('sync', 'sync', t) }) },
  { id: 'spill-shield', name: '化盾', group: 'legendary', needs: [['heal']],
    text: (t) => `超出最大 HP 的回復量變成護盾（最多最大 HP 的 ${at('spill-shield', 'overflowPct', t)}%）。`,
    mod: (t) => ({ overflowPct: at('spill-shield', 'overflowPct', t) }) },
  { id: 'reprise', name: '回聲', group: 'legendary', needs: [['single', 'damage']],
    text: (t) => `下一回合結束時，對同一目標再打一次（威力 ${at('reprise', 'reprise', t)}%）。`,
    mod: (t) => ({ reprise: at('reprise', 'reprise', t) }) },
];
export const RUNES: Record<RuneId, RuneDef> = Object.fromEntries(LIST.map((r) => [r.id, r])) as Record<RuneId, RuneDef>;

/** The group a rune excludes others of: 星燈輪轉 is legendary but counts as an element rune (plan 8e ruling 10). */
export const exclusiveGroupOf = (id: RuneId): RuneGroup | undefined => {
  const g = id === 'starwheel' ? 'element' : RUNES[id].group;
  return EXCLUSIVE_GROUPS.includes(g) ? g : undefined;
};

/** A rune's bag key: 「spread@magic」. */
export const runeKey = (r: RuneRef): string => `${r.id}@${r.tier}`;
/** A bag key back to its rune; an unknown id or a tier the rune does not come in is null. */
export function parseRuneKey(k: string): RuneRef | null {
  const parts = k.split('@');
  if (parts.length !== 2) return null;
  const [id, tier] = parts;
  if (!(RUNE_IDS as readonly string[]).includes(id)) return null;
  return tiersOf(id as RuneId).includes(tier as RuneTier) ? { id: id as RuneId, tier: tier as RuneTier } : null;
}
