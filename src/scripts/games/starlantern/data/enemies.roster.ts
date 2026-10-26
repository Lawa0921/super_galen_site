import type { CharacterId, Effect, Element, EnemyDef, EnemySkill, StatKey, Stats, Target } from '../engine/types';
import type { RegionId } from './regions';
import { ROSTER_MATERIALS } from './materials.roster';

/**
 * The monster roster's hundred new foes (roster plan Task A2, spec §5.3–§5.6): 59 ordinary species (29 on the main road,
 * 30 regional natives), 11 wardens, 28 bosses and 2 parts. Merged into ENEMIES for lookups only: no list shows one until
 * it is in ROSTER_LIVE (data/monsters.ts).
 *
 * Every ordinary species and warden is `floor: 3` (home Lv10) on one of spec §5.1's archetypes, shaped within ±15%; a
 * boss is shaped on the lantern-eater. A warden is a plain standard or heavy shape: the elite path makes it an elite in a
 * fight (ELITE, ELITE_REWARD). The traits (spec §6) come with plan B: until then a foe has the nearest plain skill.
 * A regional foe carries its region's elements, as `scaleEnemy` gives them anyway.
 *
 * Drops (Task A3, spec §7.1): an ordinary species its signature (swarm 0.35, treasure and heavy 0.5, the rest 0.4) and spec
 * §5.3–§5.4's rare; a boss or warden its trophy or keepsake, always; a part nothing.
 */

type Arch = 'swarm' | 'std' | 'heavy' | 'caster' | 'support' | 'treasure' | 'boss';
/** Spec §5.1: [hp, atk, def, mag, res, spd, exp, gold] at Lv10 (a boss: the lantern-eater). */
const ARCH: Record<Arch, readonly number[]> = {
  swarm: [110, 32, 6, 24, 10, 18, 15, 11],
  std: [200, 48, 13, 24, 13, 13, 28, 21],
  heavy: [310, 58, 25, 14, 14, 6, 42, 31],
  caster: [170, 24, 10, 62, 22, 13, 38, 29],
  support: [165, 22, 12, 44, 22, 12, 28, 21],
  treasure: [90, 18, 60, 18, 60, 30, 90, 150],
  boss: [1200, 36, 20, 30, 20, 12, 300, 0],
};
const KEYS = ['hp', 'atk', 'def', 'mag', 'res', 'spd'] as const;
type Shape = Partial<Record<(typeof KEYS)[number], number>>;

/** An archetype's stats with each named stat multiplied (spec §5.1's 形狀: + is 1.12, ++ 1.15, - 0.88, -- 0.85). */
function shape(a: Arch, mul: Shape = {}, hp?: number): Stats {
  const b = ARCH[a];
  const out = { tp: 0 } as Stats;
  KEYS.forEach((k, i) => { out[k as StatKey] = Math.round(b[i] * (mul[k] ?? 1)); });
  if (hp !== undefined) out.hp = hp;
  return out;
}

const sk = (name: string, chance: number, target: Target, ...effects: Effect[]): EnemySkill => ({ name, chance, target, effects });
const hit = (power: number, element: Element = 'phys', o: { scale?: 'atk' | 'mag'; melee?: boolean; hits?: number; crit?: 'always' } = {}): Effect => ({
  kind: 'damage', power, element, scale: o.scale ?? (element === 'phys' ? 'atk' : 'mag'), melee: o.melee ?? element === 'phys',
  ...(o.hits ? { hits: o.hits } : {}), ...(o.crit ? { crit: o.crit } : {}),
});
const buff = (stat: 'atk' | 'def' | 'mag' | 'res' | 'spd', pct: number, turns: number): Effect => ({ kind: 'buff', stat, pct, turns });
const heal = (power: number): Effect => ({ kind: 'heal', power });
const sleep = (chance: number): Effect => ({ kind: 'inflict', status: 'sleep', chance });
/** Plan B2 (M1): the skill, wound up for a turn named `name` first. */
const windup = (s: EnemySkill, name: string): EnemySkill => ({ ...s, windup: name });
/** Plan B2 (M2): the foe guards the ally most hurt but itself for `turns` rounds (the enemy side's `cover`). */
const guard = (turns: number): Effect => ({ kind: 'cover', turns });
/** Plan B2 (M24): the foe calls its target out; next round every foe's single blow goes to her. */
const hunt: Effect = { kind: 'hunt' };
/** Plan B3 (M13): after its hit lands, it takes up to depth × `perDepth` gold from the run pack. */
const steal = (perDepth: number): Effect => ({ kind: 'steal', perDepth });
/** Plan B4 (M4): it calls a foe `id` into the fight, `max` a fight (absent: no limit but the room; B1 review item 3). */
const call = (name: string, id: string, max: number | undefined, chance = 0.25): EnemySkill =>
  sk(name, chance, 'self', { kind: 'summon', id, ...(max !== undefined ? { max } : {}) });
/** Plan B4 (M22): it folds a fallen ally back up at 30% HP, once a fight for the whole flock (B1 review item 6). */
const refold = (name: string, chance: number): EnemySkill => ({ ...sk(name, chance, 'deadAlly', { kind: 'revive', hpPct: 0.3 }), when: 'deadAlly', oncePerFight: true });
const poison = (chance: number): Effect => ({ kind: 'inflict', status: 'poison', chance });

/** The elements of a region, for its own foes (data/regions.ts REGIONS: `scaleEnemy` gives these in the region anyway). */
const REGION_ELEMENTS: Record<Exclude<RegionId, 'mainline'>, [Element[], Element[]]> = {
  blaze: [['ice'], ['fire']], frost: [['fire'], ['ice']], storm: [['phys'], ['thunder']],
  mire: [['fire'], ['phys']], shade: [['thunder'], []], iron: [['thunder'], ['phys']],
};

/** Spec §5.3 and §5.4's 稀有 column. */
const RARE: Record<string, [string, number]> = {
  'paper-moth': ['star-tear', 0.005], 'tin-soldier': ['ancient-gear', 0.01], 'dust-mimic': ['old-coin', 0.1], 'market-ghost': ['old-coin', 0.15],
  'hollow-hunter': ['king-scale', 0.005], 'moon-crow': ['star-tear', 0.01], 'old-city-sentinel': ['ancient-gear', 0.02],
  'ancestor-automaton': ['ancient-gear', 0.04], 'keeper-echo': ['star-tear', 0.03], 'sorrow-crystal': ['star-tear', 0.02],
  'returning-light': ['star-tear', 0.03], 'hoarder': ['star-tear', 0.25], 'gilded-hoarder': ['king-scale', 0.2],
  'mirage-dancer': ['king-scale', 0.01], 'frozen-pilgrim': ['old-coin', 0.1], 'star-ember': ['star-tear', 0.01], 'vault-mimic': ['old-coin', 0.2],
  'rivet-golem': ['ancient-gear', 0.02], 'fallen-knight': ['king-scale', 0.01],
};
const SIGNATURE_CHANCE: Partial<Record<Arch, number>> = { swarm: 0.35, heavy: 0.5, treasure: 0.5 };

/** What a foe drops: its own material (a signature at its chance, a trophy or keepsake always), then its rare. */
function dropsOf(id: string, arch: Arch): EnemyDef['drops'] {
  const own = ROSTER_MATERIALS.find((m) => m.owner === id);
  if (!own) return [];
  const chance = own.kind === 'monster' ? SIGNATURE_CHANCE[arch] ?? 0.4 : 1;
  return [{ mat: own.id, chance }, ...(RARE[id] ? [{ mat: RARE[id][0], chance: RARE[id][1] }] : [])];
}

/**
 * Task A4 (spec §9.1 point 4, plan Step 3): exp tuned from the archetype so the full tables pay what the legacy ones paid
 * (data/monsters.test.ts exp holds against the legacy tables). The main road's bands stay near even; the frost natives come
 * in heavy pairs, so each pays less, and the iron ones a little less.
 */
const EXP_TUNE: Record<string, number> = {
  'paper-moth': 17, 'lamp-wight': 31, 'root-hound': 31, 'tin-soldier': 46, 'dust-mimic': 31, 'market-ghost': 31,
  'tongueless-bell': 40, 'hollow-hunter': 31, 'mist-twin': 17, 'moon-crow': 31, 'bell-watcher': 31, 'sleepwalker': 44,
  'old-city-sentinel': 38, 'requiem-choir': 26, 'lantern-larva': 26, 'epitaph-golem': 38, 'ancestor-automaton': 38,
  'ash-archivist': 35, 'wick-shade': 17, 'keeper-echo': 42, 'ember-maw': 46, 'sorrow-crystal': 31, 'deep-tendril': 31,
  'frost-doll': 27, 'glacier-tortoise': 27, 'snow-caller': 25, 'ice-komainu': 27, 'frozen-pilgrim': 18, 'thunder-kite': 14,
  'storm-totem': 26, 'charge-jelly': 35, 'star-ember': 35, 'stolen-tome': 35, 'bog-mother': 38, 'rot-lily': 25,
  'leech-knight': 25, 'ashen-treant': 38, 'spore-moth': 14, 'mirror-thief': 26, 'veil-stalker': 26, 'hush-acolyte': 35,
  'vault-mimic': 39, 'debt-collector': 26, 'rivet-golem': 34, 'siege-crab': 34, 'herald-engine': 24, 'fallen-knight': 34,
  'banner-bearer': 24,
};

interface Spec {
  name: string; arch: Arch; mul?: Shape; hp?: number; weak?: Element[]; resist?: Element[]; skills?: EnemySkill[];
  band?: EnemyDef['band']; home?: Exclude<RegionId, 'mainline'>; lore?: CharacterId; remnant?: true; inscribe?: EnemyDef['inscribe'];
  rank?: EnemyDef['rank'];
  fleeAfter?: number; opener?: EnemyDef['opener'];
  decoys?: number; onFall?: EnemyDef['onFall']; rise?: EnemyDef['rise']; shareWith?: string;
  prism?: EnemyDef['prism']; adapt?: number; stages?: EnemyDef['stages']; stageEvery?: number;
}

function foe(id: string, s: Spec): EnemyDef {
  const [weak, resist] = s.home ? REGION_ELEMENTS[s.home] : [s.weak ?? [], s.resist ?? []];
  const part = s.rank === 'part';
  return {
    id, name: s.name, floor: 3, ...(s.arch === 'boss' ? { boss: true } : {}),
    stats: shape(s.arch, s.mul, s.hp), weak: [...weak], resist: [...resist],
    exp: part ? 30 : EXP_TUNE[id] ?? ARCH[s.arch][6], gold: part ? 0 : ARCH[s.arch][7], drops: dropsOf(id, s.arch), skills: s.skills ?? [],
    ...(s.rank ? { rank: s.rank } : {}), ...(s.lore ? { lore: s.lore } : {}), ...(s.remnant ? { remnant: true } : {}),
    ...(s.band ? { band: s.band } : {}), ...(s.home ? { home: s.home } : {}), ...(s.inscribe ? { inscribe: s.inscribe } : {}),
    ...(s.fleeAfter ? { fleeAfter: s.fleeAfter } : {}), ...(s.opener ? { opener: s.opener } : {}),
    ...(s.decoys ? { decoys: s.decoys } : {}), ...(s.onFall ? { onFall: s.onFall } : {}), ...(s.rise ? { rise: s.rise } : {}),
    ...(s.shareWith ? { shareWith: s.shareWith } : {}),
    ...(s.prism ? { prism: s.prism } : {}), ...(s.adapt ? { adapt: s.adapt } : {}),
    ...(s.stages ? { stages: s.stages } : {}), ...(s.stageEvery ? { stageEvery: s.stageEvery } : {}),
  };
}

const UP = 1.12, UPUP = 1.15, DOWN = 0.88, DOWNDOWN = 0.85;

const MAINLINE: [string, Spec][] = [
  // B 4–9: the fog roots, the town's everyday memories
  ['paper-moth', { name: '遺信紙蛾', arch: 'swarm', mul: { spd: UPUP }, weak: ['fire'], band: 'B', inscribe: 'sleepRes',
    skills: [sk('撲粉', 0.25, 'row', sleep(0.25))] }],
  ['lamp-wight', { name: '提燈幽影', arch: 'support', weak: ['ice'], resist: ['fire'], band: 'B', inscribe: 'heal',
    skills: [sk('借光', 0.4, 'ally', heal(50))] }],
  ['root-hound', { name: '霧根獵犬', arch: 'std', mul: { atk: UP }, weak: ['fire'], band: 'B', inscribe: 'atk',
    skills: [windup(sk('撲咬', 0.2, 'enemy', hit(230)), '伏低')] }],
  ['tin-soldier', { name: '錫兵殘影', arch: 'heavy', mul: { def: UP }, weak: ['thunder'], resist: ['ice'], band: 'B', inscribe: 'armor',
    skills: [sk('列隊', 0.25, 'ally', guard(2))] }],
  ['dust-mimic', { name: '塵封木箱', arch: 'std', weak: ['fire'], band: 'B', inscribe: 'goldFind', opener: 'disguise',
    skills: [sk('咬合', 0.3, 'enemy', hit(140))] }],
  ['market-ghost', { name: '市集的吆喝聲', arch: 'support', mul: { spd: UP }, weak: ['thunder'], band: 'B', inscribe: 'matFind',
    skills: [sk('順手牽羊', 0.35, 'enemy', hit(90), steal(5))] }],
  // C 10–15: bells, wardens, hollow ones and paired shadows
  ['tongueless-bell', { name: '無舌鐘', arch: 'caster', mul: { spd: DOWN }, weak: ['ice'], resist: ['thunder'], band: 'C', inscribe: 'tpCost',
    skills: [sk('無聲的鐘鳴', 0.35, 'row', hit(80, 'thunder'))] }],
  ['hollow-hunter', { name: '空殼獵人', arch: 'std', weak: ['thunder'], band: 'C', inscribe: 'critDmg', remnant: true,
    skills: [sk('借來的招式', 0.3, 'enemy', hit(150))] }],
  ['mist-twin', { name: '霧雙子', arch: 'swarm', weak: ['fire'], resist: ['ice'], band: 'C', inscribe: 'multi',
    onFall: { name: '雙生之怒', target: 'allies', effects: [buff('atk', 40, 3)] },
    skills: [sk('雙影', 0.3, 'enemy', hit(100))] }],
  ['moon-crow', { name: '映月鴉', arch: 'std', mul: { spd: UP }, band: 'C', inscribe: 'crit', prism: 'cycle',
    skills: [sk('鏡羽', 0.3, 'enemy', hit(120))] }],
  ['bell-watcher', { name: '鐘樓巡守', arch: 'std', weak: ['ice'], band: 'C', inscribe: 'evasion', lore: 'rin', remnant: true,
    skills: [sk('宣告', 0.25, 'enemy', hunt), sk('巡守之杖', 0.3, 'enemy', hit(130))] }],
  ['sleepwalker', { name: '夢遊者', arch: 'heavy', mul: { atk: UP }, weak: ['fire'], resist: ['thunder'], band: 'C', inscribe: 'hp', opener: 'asleep',
    skills: [sk('夢中揮拳', 0.3, 'enemy', hit(160))] }],
  // D 16–24: the old city's statues, its requiem, the lantern-eater's young, the ancestors' machines
  ['old-city-sentinel', { name: '古城衛像', arch: 'heavy', weak: ['thunder'], resist: ['phys'], band: 'D', inscribe: 'def',
    skills: [sk('守護', 0.2, 'ally', guard(2)), windup(sk('審判之光', 0.25, 'column', hit(120, 'fire')), '舉起天秤')] }],
  ['requiem-choir', { name: '鎮魂歌隊', arch: 'support', weak: ['phys'], resist: ['ice'], band: 'D', inscribe: 'tpRegen',
    skills: [call('召來幽影', 'lamp-wight', 1), sk('鎮魂合唱', 0.35, 'allies', heal(40))] }],
  ['lantern-larva', { name: '燈喰幼體', arch: 'std', weak: ['ice'], resist: ['fire'], band: 'D', inscribe: 'vuln',
    skills: [sk('啃光', 0.3, 'enemy', hit(120, 'fire', { scale: 'atk', melee: true }))] }],
  ['epitaph-golem', { name: '碑文守', arch: 'heavy', mul: { spd: DOWNDOWN }, weak: ['fire'], resist: ['thunder'], band: 'D', inscribe: 'res',
    skills: [sk('抹消之文', 0.3, 'row', buff('def', -30, 2))] }],
  ['ancestor-automaton', { name: '古代機兵', arch: 'heavy', weak: ['thunder'], resist: ['ice'], band: 'D', inscribe: 'meleeDR', lore: 'bobby',
    skills: [sk('齒輪重拳', 0.3, 'enemy', hit(150))] }],
  ['ash-archivist', { name: '灰燼書記', arch: 'caster', weak: ['ice'], band: 'D', inscribe: 'mag',
    skills: [sk('灰燼之頁', 0.4, 'enemy', hit(130, 'fire'))] }],
  // E 25–30: wicks, the lantern-bearers, the brood under the lamp
  ['wick-shade', { name: '燭芯之影', arch: 'swarm', weak: ['ice'], resist: ['fire'], band: 'E', inscribe: 'fireRes',
    onFall: { name: '燭爆', target: 'enemies', effects: [hit(40, 'fire')] },
    skills: [sk('燭火', 0.3, 'enemy', hit(90, 'fire'))] }],
  ['keeper-echo', { name: '無名的提燈人', arch: 'caster', weak: ['phys'], band: 'E', inscribe: 'gauge', lore: 'hero', remnant: true,
    skills: [windup(sk('燈火之誓', 0.2, 'enemies', hit(120, 'fire')), '舉燈')] }],
  ['ember-maw', { name: '餘燼之口', arch: 'heavy', weak: ['thunder'], resist: ['ice'], band: 'E', inscribe: 'fireDmg',
    skills: [call('點燃燭芯', 'wick-shade', 2), sk('吞吐', 0.3, 'row', hit(90, 'fire'))] }],
  ['sorrow-crystal', { name: '悲傷結晶', arch: 'std', weak: ['phys'], band: 'E', inscribe: 'iceRes', adapt: 3,
    skills: [sk('碎晶', 0.3, 'enemy', hit(120, 'ice', { scale: 'atk' }))] }],
  ['deep-tendril', { name: '燈底之鬚', arch: 'std', weak: ['fire'], resist: ['ice'], band: 'E', inscribe: 'tp',
    skills: [sk('汲取', 0.35, 'enemy', hit(110))] }],
  // F 31+: lost things, a little brighter
  ['music-box', { name: '走音的音樂盒', arch: 'support', weak: ['phys'], resist: ['thunder'], band: 'F', inscribe: 'wil',
    skills: [sk('搖籃曲', 0.25, 'row', sleep(0.3)), sk('演奏', 0.3, 'allies', heal(30))] }],
  ['paper-cranes', { name: '千紙鶴群', arch: 'swarm', weak: ['fire'], band: 'F', inscribe: 'agi',
    skills: [refold('重摺', 0.5), sk('紙刃', 0.3, 'enemy', hit(90, 'phys', { melee: false }))] }],
  ['lost-shadow', { name: '走失的影子', arch: 'std', weak: ['phys'], band: 'F', inscribe: 'str',
    skills: [sk('影擊', 0.3, 'enemy', hit(140))] }],
  ['returning-light', { name: '歸途之光', arch: 'support', mul: { hp: DOWNDOWN }, band: 'F', inscribe: 'expBonus',
    skills: [sk('守望', 0.5, 'allies', buff('def', 30, 2))] }],
  // the treasure foes
  ['hoarder', { name: '拾憶鼠', arch: 'treasure', band: 'B', inscribe: 'matFind', fleeAfter: 3 }],
  ['gilded-hoarder', { name: '金箔拾憶鼠', arch: 'treasure', band: 'E', inscribe: 'goldFind', fleeAfter: 2 }],
];

const NATIVE: [string, Spec][] = [
  // 熾焰之地
  ['cinder-imp', { name: '灰燼小鬼', arch: 'swarm', home: 'blaze', inscribe: 'fireDmg', skills: [sk('火花', 0.3, 'enemy', hit(80, 'fire'))],
    onFall: { name: '餘燼爆開', target: 'row', effects: [hit(35, 'fire')] } }],
  ['forge-hound', { name: '熔爐犬', arch: 'std', home: 'blaze', inscribe: 'atk', skills: [windup(sk('熔吼', 0.2, 'row', hit(150, 'fire', { scale: 'atk' })), '吸氣')] }],
  ['ash-mourner', { name: '灰衣弔者', arch: 'support', home: 'blaze', inscribe: 'heal',
    skills: [sk('弔歌', 0.3, 'allies', buff('mag', 30, 3)), sk('安息', 0.3, 'ally', heal(50))] }],
  ['mirage-dancer', { name: '蜃樓舞者', arch: 'std', home: 'blaze', inscribe: 'evasion', lore: 'safira', remnant: true, opener: 'decoy',
    skills: [sk('幻舞', 0.3, 'enemy', hit(120))] }],
  ['sand-scorpion', { name: '沙海蠍', arch: 'std', home: 'blaze', inscribe: 'poisonRes', lore: 'safira',
    skills: [sk('毒針', 0.35, 'enemy', hit(100), poison(0.5))] }],
  // 霜凍之地
  ['frost-doll', { name: '霜人偶', arch: 'heavy', home: 'frost', inscribe: 'iceRes', skills: [sk('冰之守', 0.25, 'ally', guard(2))] }],
  ['glacier-tortoise', { name: '冰河龜', arch: 'heavy', home: 'frost', inscribe: 'def',
    skills: [sk('縮殼', 0.25, 'self', buff('def', 50, 3)), windup(sk('冰河崩落', 0.15, 'row', hit(140, 'ice', { scale: 'atk', melee: true })), '抬起前腳')] }],
  ['snow-caller', { name: '雪中呼喚', arch: 'caster', home: 'frost', inscribe: 'sleepRes',
    skills: [sk('雪眠', 0.25, 'cross', sleep(0.35)), sk('雪崩', 0.35, 'column', hit(100, 'ice'))] }],
  ['ice-komainu', { name: '冰狛犬', arch: 'heavy', home: 'frost', inscribe: 'block', lore: 'chizuru', shareWith: 'ice-komainu',
    skills: [sk('狛犬之牙', 0.3, 'enemy', hit(140))] }],
  ['frozen-pilgrim', { name: '凍結的參拜者', arch: 'std', home: 'frost', inscribe: 'res', lore: 'chizuru', remnant: true,
    skills: [sk('冰之祈', 0.3, 'enemy', hit(110, 'ice', { scale: 'atk', melee: true }))] }],
  // 雷鳴之地
  ['thunder-kite', { name: '雷鳶', arch: 'swarm', home: 'storm', inscribe: 'spd',
    skills: [sk('迅雷爪', 0.35, 'enemy', hit(40, 'thunder', { scale: 'atk', melee: true, hits: 3 }))] }],
  ['storm-totem', { name: '避雷石柱', arch: 'support', home: 'storm', inscribe: 'thunderRes',
    skills: [sk('引雷', 0.4, 'allies', buff('spd', 30, 3)), sk('雷鳴鼓舞', 0.3, 'allies', buff('atk', 20, 3))] }],
  ['charge-jelly', { name: '蓄電水母', arch: 'caster', home: 'storm', inscribe: 'thunderDmg', skills: [windup(sk('放電', 0.25, 'enemies', hit(90, 'thunder')), '蓄電')] }],
  ['star-ember', { name: '星屑火', arch: 'caster', home: 'storm', inscribe: 'tpRegen', lore: 'noel', skills: [sk('星火', 0.4, 'enemy', hit(120, 'fire'))] }],
  ['stolen-tome', { name: '飛舞的魔法書', arch: 'caster', home: 'storm', inscribe: 'mag', lore: 'noel',
    skills: [sk('火之頁', 0.25, 'enemy', hit(120, 'fire')), sk('冰之頁', 0.25, 'enemy', hit(120, 'ice')), sk('雷之頁', 0.25, 'enemy', hit(120, 'thunder'))] }],
  // 腐毒沼澤
  ['bog-mother', { name: '泥沼母體', arch: 'heavy', home: 'mire', inscribe: 'hp', skills: [call('冒泡', 'slime', 2), sk('泥漿', 0.3, 'row', hit(80))] }],
  ['rot-lily', { name: '腐百合', arch: 'support', home: 'mire', inscribe: 'poisonRes',
    skills: [sk('腐香', 0.3, 'cross', poison(0.5)), sk('腐蝕', 0.25, 'row', buff('res', -30, 2))] }],
  ['leech-knight', { name: '蛭甲騎士', arch: 'std', home: 'mire', inscribe: 'armor', skills: [sk('吸血突刺', 0.3, 'enemy', hit(130))] }],
  ['ashen-treant', { name: '枯灰樹人', arch: 'heavy', home: 'mire', inscribe: 'wil', lore: 'sylvie', skills: [sk('纏根', 0.3, 'row', buff('spd', -40, 2))] }],
  ['spore-moth', { name: '孢子蛾', arch: 'swarm', home: 'mire', inscribe: 'tp', skills: [sk('孢子', 0.3, 'enemy', poison(0.4))],
    onFall: { name: '孢子四散', target: 'cross', effects: [poison(0.5)] } }],
  // 暗影迴廊
  ['mirror-thief', { name: '鏡中竊影', arch: 'std', home: 'shade', inscribe: 'crit', skills: [sk('鏡擊', 0.3, 'enemy', hit(130))] }],
  ['veil-stalker', { name: '帷幕潛行者', arch: 'std', home: 'shade', inscribe: 'critDmg', skills: [sk('背刺', 0.3, 'enemy', hit(120, 'phys', { crit: 'always' }))] }],
  ['hush-acolyte', { name: '靜默侍者', arch: 'caster', home: 'shade', inscribe: 'tpCost', lore: 'rin', remnant: true,
    skills: [sk('靜默', 0.3, 'cross', hit(80, 'ice'))] }],
  ['vault-mimic', { name: '餓肚子的寶庫', arch: 'heavy', home: 'shade', inscribe: 'goldFind', lore: 'liz', opener: 'disguise',
    skills: [sk('吞金', 0.3, 'enemy', hit(150), steal(5))] }],
  ['debt-collector', { name: '敲門的影子', arch: 'std', home: 'shade', inscribe: 'vuln', lore: 'liz', remnant: true,
    skills: [sk('記下名字', 0.25, 'enemy', hunt), sk('敲門', 0.3, 'enemy', hit(120), steal(5))] }],
  // 鋼鐵要塞
  ['rivet-golem', { name: '鉚釘機兵', arch: 'heavy', home: 'iron', inscribe: 'armor', skills: [sk('鉚接', 0.25, 'ally', guard(2))] }],
  ['siege-crab', { name: '攻城蟹', arch: 'heavy', home: 'iron', inscribe: 'meleeDR', skills: [windup(sk('破城鉗', 0.2, 'row', hit(170)), '舉鉗')] }],
  ['herald-engine', { name: '號令機', arch: 'support', home: 'iron', inscribe: 'gauge',
    skills: [sk('號令', 0.4, 'allies', buff('atk', 25, 3)), sk('整隊', 0.3, 'allies', buff('def', 20, 3))] }],
  ['fallen-knight', { name: '要塞的騎士殘影', arch: 'heavy', home: 'iron', inscribe: 'block', lore: 'scarlet', remnant: true,
    skills: [sk('騎士之盾', 0.25, 'ally', guard(2)), sk('斬擊', 0.3, 'enemy', hit(140))] }],
  ['banner-bearer', { name: '紅旗旗手', arch: 'support', home: 'iron', inscribe: 'str', lore: 'scarlet', remnant: true,
    skills: [sk('揮旗', 0.4, 'allies', buff('atk', 20, 3))] }],
];

const WARDENS: [string, Spec][] = [
  // Spec §5.5 (ruling 20): two rounds of 月明 (it mends and steadies its allies), two of 月蝕 (cold on the whole party).
  ['false-moon', { name: '不存在的月亮', arch: 'std', rank: 'warden', weak: ['fire'], resist: ['ice'], lore: 'selene', stageEvery: 2,
    skills: [sk('月明之光', 0.4, 'allies', heal(40)), sk('月明之守', 0.3, 'allies', buff('def', 30, 2))],
    stages: [{ skills: [sk('月蝕', 0.5, 'enemies', hit(90, 'ice')), sk('蝕影', 0.3, 'enemy', hit(130))] }] }],
  ['bell-warden', { name: '鐘樓的守門人', arch: 'std', rank: 'warden', weak: ['ice'], lore: 'rin', remnant: true,
    skills: [sk('鐘聲', 0.3, 'row', hit(90, 'thunder')), sk('點名', 0.25, 'enemy', hunt)] }],
  ['toppled-automaton', { name: '倒下的機兵', arch: 'heavy', rank: 'warden', weak: ['thunder'], resist: ['ice'], lore: 'bobby', rise: { pct: 30 },
    skills: [sk('重拳', 0.3, 'enemy', hit(160))] }],
  ['requiem-conductor', { name: '鎮魂指揮者', arch: 'std', rank: 'warden', weak: ['phys'], resist: ['ice'],
    skills: [call('召集歌隊', 'requiem-choir', 2), sk('指揮', 0.4, 'allies', buff('spd', 40, 3)), sk('終章', 0.3, 'enemies', hit(80, 'ice'))] }],
  ['lantern-brood', { name: '燈底之巢', arch: 'heavy', rank: 'warden', weak: ['ice'], resist: ['fire'],
    // Spec §5.5: it never attacks; it hatches one a turn while there is room, and curls up when there is none (B1 review item 3).
    skills: [call('孵化', 'lantern-larva', undefined, 1), sk('蜷縮', 1, 'self', buff('def', 20, 2))] }],
  ['mirage-lead', { name: '蜃樓的領舞者', arch: 'std', rank: 'warden', home: 'blaze', lore: 'safira', remnant: true, opener: 'decoy', decoys: 2,
    skills: [sk('轉拍', 0.3, 'allies', buff('spd', 30, 3)), sk('領舞', 0.3, 'enemy', hit(130))] }],
  ['ice-shrine', { name: '冰中的拜殿', arch: 'heavy', rank: 'warden', home: 'frost', lore: 'chizuru',
    skills: [call('喚醒狛犬', 'ice-komainu', 2), sk('寒光', 0.3, 'column', hit(100, 'ice'))] }],
  ['burning-page', { name: '燃燒的那一頁', arch: 'std', rank: 'warden', home: 'storm', lore: 'noel',
    onFall: { name: '最後一頁', target: 'enemies', effects: [{ kind: 'restore', tp: 20 }] },
    skills: [sk('燃頁', 0.35, 'enemy', hit(120, 'fire', { scale: 'atk' }))] }],
  ['grey-elder', { name: '灰化的老樹', arch: 'heavy', rank: 'warden', home: 'mire', lore: 'sylvie',
    skills: [call('長出孢子', 'spore-moth', 2), sk('纏根', 0.3, 'row', buff('spd', -40, 2)), sk('枯枝', 0.3, 'enemy', hit(140))] }],
  ['locked-vault', { name: '鎖著的金庫', arch: 'heavy', rank: 'warden', mul: { def: UPUP }, home: 'shade', lore: 'liz',
    skills: [sk('金庫門', 0.3, 'enemy', hit(150), steal(5))] }],
  ['gate-breaker', { name: '撞門的巨影', arch: 'heavy', rank: 'warden', home: 'iron', lore: 'scarlet',
    skills: [call('爬上城牆', 'fallen-knight', 2), windup(sk('撞門', 0.2, 'enemies', hit(120)), '後退助跑')] }],
];

/** Two plain boss skills: an area spell and a heavy single blow (the lantern-eater's pattern), named per boss. */
const pair = (area: string, el: Element, blow: string): EnemySkill[] => [
  sk(area, 0.35, 'enemies', hit(110, el)), sk(blow, 0.3, 'enemy', hit(160)),
];

const BOSSES: [string, Spec][] = [
  // the main road, every fifth depth (spec §5.6)
  ['fog-warden', { name: '霧門守衛', arch: 'boss', mul: { hp: 0.95 }, weak: ['fire'], resist: ['ice'],
    skills: [windup(sk('霧門落下', 0.25, 'enemies', hit(130)), '霧門升起'), sk('霧壓', 0.3, 'row', buff('def', -25, 2))] }],
  ['silent-bell', { name: '啞鐘', arch: 'boss', mul: { hp: 1.05, spd: DOWN }, weak: ['ice'], resist: ['thunder'],
    skills: [sk('無聲的轟鳴', 0.35, 'row', hit(110, 'thunder')), sk('鐘擊', 0.3, 'enemy', hit(160))] }],
  ['hollow-champion', { name: '空殼勇者', arch: 'boss', mul: { atk: UPUP }, weak: ['thunder'], remnant: true,
    skills: [sk('一百種劍法', 0.3, 'enemy', hit(60, 'phys', { hits: 3 })), sk('勇者之擊', 0.3, 'enemy', hit(160))] }],
  ['old-city-archon', { name: '古城執政像', arch: 'boss', hp: 800, weak: ['thunder'], resist: ['fire'], skills: pair('審判', 'fire', '王權') }],
  ['gorged-beast', { name: '飽食之獸', arch: 'boss', mul: { hp: 1.08 }, weak: ['ice'], resist: ['fire'],
    skills: [call('吐出燭芯', 'wick-shade', 2), ...pair('吞光', 'fire', '啃食')] }],
  ['forgotten-festival', { name: '被遺忘的祭典', arch: 'boss', weak: ['ice'], skills: pair('祭典之火', 'fire', '狐火') }],
  ['starless-whale', { name: '無星之鯨', arch: 'boss', mul: { hp: UPUP, spd: DOWNDOWN }, weak: ['thunder'], resist: ['ice'],
    skills: [sk('吞沒', 0.25, 'enemies', hit(120, 'ice')), sk('鯨歌', 0.3, 'enemy', hit(160))] }],
  ['stopped-clock', { name: '停擺的鐘心', arch: 'boss', weak: ['phys'], resist: ['thunder'], skills: pair('齒輪風暴', 'thunder', '指針') }],
  ['first-lantern', { name: '最初的燈', arch: 'boss', mul: { hp: 1.1 }, skills: pair('初火', 'fire', '燈芯之擊') }],
  // 熾焰之地
  ['ember-tyrant', { name: '焚城之焰', arch: 'boss', home: 'blaze', skills: pair('焚城', 'fire', '烈焰之拳') }],
  ['sandstorm-maw', { name: '沙暴之口', arch: 'boss', mul: { spd: UP }, home: 'blaze', lore: 'safira',
    skills: [sk('沙暴', 0.3, 'enemies', hit(100, 'phys', { melee: false }), buff('spd', -20, 2)), sk('沙之顎', 0.3, 'enemy', hit(160))] }],
  ['mirage-city', { name: '蜃樓之城', arch: 'boss', hp: 960, home: 'blaze', lore: 'safira',
    skills: [call('舞者登場', 'mirage-dancer', 2), ...pair('幻之火', 'fire', '城門崩落')] }],
  // 霜凍之地
  ['rime-sovereign', { name: '永凍之守', arch: 'boss', hp: 820, home: 'frost', skills: pair('永凍', 'ice', '冰槌') }],
  ['white-silence', { name: '白色寂靜', arch: 'boss', home: 'frost',
    skills: [sk('寂靜', 0.3, 'enemies', buff('spd', -10, 3)), sk('雪幕', 0.35, 'cross', hit(110, 'ice'))] }],
  ['rift-maw', { name: '迷宮的裂口', arch: 'boss', home: 'frost', lore: 'chizuru',
    skills: [call('裂口湧出', 'frost-doll', 2), ...pair('裂口之息', 'ice', '撕裂')] }],
  // 雷鳴之地
  ['thunder-roc', { name: '雷鳴巨鵬', arch: 'boss', mul: { spd: UPUP }, home: 'storm',
    skills: [windup(sk('天雷俯衝', 0.2, 'enemies', hit(130, 'thunder', { scale: 'atk', melee: true })), '盤旋'), sk('雙爪', 0.3, 'enemy', hit(80, 'phys', { hits: 2 }))] }],
  ['storm-conductor', { name: '雷霆指揮者', arch: 'boss', home: 'storm',
    skills: [sk('指名', 0.25, 'enemy', hunt), sk('連鎖雷', 0.35, 'cross', hit(120, 'thunder')), sk('雷杖', 0.3, 'enemy', hit(160))] }],
  ['starfire-colossus', { name: '星火巨像', arch: 'boss', home: 'storm', lore: 'noel', skills: pair('星火', 'fire', '巨拳') }],
  // 腐毒沼澤
  ['mire-hydra', { name: '腐沼多頭蛇', arch: 'boss', mul: { hp: UP }, home: 'mire',
    skills: [sk('毒霧', 0.35, 'cross', poison(0.6)), sk('多頭撕咬', 0.3, 'enemy', hit(80, 'phys', { hits: 2 }))] }],
  ['grey-blight', { name: '灰枯', arch: 'boss', home: 'mire', lore: 'sylvie', skills: pair('枯灰', 'fire', '灰燼之觸') }],
  ['bog-leviathan', { name: '沼底巨口', arch: 'boss', mul: { hp: 1.1 }, home: 'mire',
    skills: [sk('巨口', 0.3, 'enemy', hit(170)), sk('沼氣', 0.3, 'cross', poison(0.5))] }],
  // 暗影迴廊
  ['faceless-host', { name: '無面之主', arch: 'boss', home: 'shade', skills: [call('鏡中人', 'mirror-thief', 2), ...pair('影刃', 'ice', '無面之擊')] }],
  ['vault-dragon', { name: '金庫之龍', arch: 'boss', mul: { hp: 1.1 }, home: 'shade',
    skills: [sk('金幣吐息', 0.35, 'row', hit(120, 'fire')), sk('龍爪', 0.3, 'enemy', hit(160), steal(5))] }],
  ['shadow-parade', { name: '影之行列', arch: 'boss', home: 'shade', skills: pair('夜行', 'ice', '影之鞭') }],
  // 鋼鐵要塞
  ['fortress-colossus', { name: '要塞巨像', arch: 'boss', home: 'iron',
    skills: [call('調來機兵', 'rivet-golem', 2), windup(sk('攻城砲', 0.25, 'enemies', hit(130, 'phys', { melee: false })), '裝填'), sk('鐵拳', 0.3, 'enemy', hit(160))] }],
  ['siege-titan', { name: '攻城巨獸', arch: 'boss', mul: { atk: UP }, home: 'iron', lore: 'scarlet',
    skills: [sk('破甲', 0.3, 'row', buff('def', -30, 2)), windup(sk('重擊', 0.3, 'enemy', hit(180)), '蓄勢')] }],
  ['last-commander', { name: '最後的指揮官', arch: 'boss', home: 'iron', lore: 'scarlet', remnant: true,
    skills: [sk('守護', 0.25, 'ally', guard(2)), sk('號角', 0.35, 'allies', buff('def', 30, 3)), sk('指揮刀', 0.3, 'enemy', hit(160))] }],
];

const PARTS: [string, Spec][] = [
  ['archon-hand', { name: '執政像之手', arch: 'std', rank: 'part', hp: 260, mul: { spd: 0.88 }, weak: ['fire'],
    skills: [sk('壓制', 0.35, 'row', hit(90))] }],
  ['rime-pillar', { name: '冰柱', arch: 'support', rank: 'part', hp: 240, home: 'frost',
    skills: [sk('冰之加護', 0.35, 'allies', heal(40)), sk('冰壁', 0.3, 'allies', buff('def', 20, 2))] }],
];

/** The lantern-mother: the lantern-eater's numbers and skills in her own shape (controller ruling; she is the finale's foe). */
function lanternMother(eater: EnemyDef): EnemyDef {
  return { ...eater, id: 'lantern-mother', name: '燈喰之母', stats: { ...eater.stats }, weak: [...eater.weak], resist: [...eater.resist],
    drops: dropsOf('lantern-mother', 'boss'), skills: eater.skills.map((k) => ({ ...k, effects: k.effects.map((e) => ({ ...e })) })) };
}

/** The roster's definitions, in spec order; `eater` is ENEMIES.lanterneater (the mother copies it). */
export function rosterEnemies(eater: EnemyDef): EnemyDef[] {
  const bosses = BOSSES.map(([id, s]) => foe(id, s));
  bosses.splice(5, 0, lanternMother(eater)); // the main road's sixth, depth 30 in spec §5.6
  return [...MAINLINE, ...NATIVE, ...WARDENS].map(([id, s]) => foe(id, s)).concat(bosses, PARTS.map(([id, s]) => foe(id, s)));
}
