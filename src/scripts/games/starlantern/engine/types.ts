import type { AilmentId } from './ailments';
import type { DeviceKind } from './mech';

export type Element = 'phys' | 'fire' | 'ice' | 'thunder';
export type StatKey = 'hp' | 'tp' | 'atk' | 'def' | 'mag' | 'res' | 'spd';
export type BuffStat = Exclude<StatKey, 'hp' | 'tp'>;
export type PrimaryKey = 'str' | 'int' | 'agi' | 'wil';
/** Percent stats are stored in percentage points; armor, evasion and tpRegen are stored as points. */
export type SecondaryKey =
  | 'crit' | 'critDmg' | 'vuln' | 'eliteDmg' | 'multi'
  | 'armor' | 'evasion' | 'block' | 'meleeDR' | 'rangedDR'
  | 'fireRes' | 'iceRes' | 'thunderRes' | 'fireDmg' | 'iceDmg' | 'thunderDmg' | 'poisonRes' | 'sleepRes'
  | 'tpRegen' | 'tpCost' | 'gauge' | 'heal'
  | 'goldFind' | 'matFind' | 'expBonus';
export type AnyStat = StatKey | PrimaryKey | SecondaryKey;
export type Sheet = Record<AnyStat, number>;
export type Stats = Record<StatKey, number>;
export type Row = 'front' | 'middle' | 'back';
export type CharacterId = 'noel' | 'chizuru' | 'liz' | 'sylvie' | 'scarlet' | 'selene' | 'safira' | 'bobby' | 'rin' | 'hero';
/** Who an action hits, seen from the actor's side. */
/** `row`, `column` and `cross` are enemy area attacks shaped on the party grid around one chosen member. */
export type Target = 'enemy' | 'enemies' | 'ally' | 'allies' | 'self' | 'deadAlly' | 'row' | 'column' | 'cross';
export type Passive = 'encounterDown' | 'dropBoost' | 'itemBoost';
export interface Pos { x: number; y: number }

export type Effect =
  /**
   * `scatter`: each of its hits picks a living foe at random (battle.perform), whatever the skill's target. `aimPct`: each
   * of Sylvie's aim stacks on its foe adds this percent instead of AIM.dmgPct (her 一擊, plan 8d).
   */
  | { kind: 'damage'; power: number; element: Element; scale: 'atk' | 'mag'; melee: boolean; hits?: number; crit?: 'always'; execute?: number; wounded?: number; scatter?: true; aimPct?: number }
  | { kind: 'heal'; power: number }
  | { kind: 'restore'; hp?: number; tp?: number }
  | { kind: 'revive'; hpPct: number }
  | { kind: 'cure' }
  /** `turns`: a sleep's rounds when a variant sets them (Selene's 深眠, plan 8d); absent, the ailment's own. */
  | { kind: 'inflict'; status: AilmentId; chance: number; turns?: number }
  | { kind: 'buff'; stat: BuffStat; pct: number; turns: number }
  | { kind: 'taunt'; turns: number }
  /** Bobby sets (or upgrades) a device that runs at every round's end for `turns` rounds (engine/mechanics/devices.ts). */
  | { kind: 'device'; device: DeviceKind; power: number; turns: number }
  /** Every device of the caster runs once more at once (超頻). */
  | { kind: 'overclock' }
  /** Every device of the caster gains `levels` and `turns` rounds (全面整備). */
  | { kind: 'tune-up'; levels: number; turns: number }
  /** Fire, ice and thunder all strike the target as a weakness for `turns` rounds (Noel's hex, plan 8c). */
  | { kind: 'expose'; turns: number }
  /**
   * The caster's mark moves onto the target (Rin's mark, engine/mechanics/mark.ts). `critPct`: her crits on it hit that
   * much harder (不眨眼); `hops`: times a fight the mark jumps to the next foe when its foe falls (轉印). Plan 8d.
   */
  | { kind: 'mark'; critPct?: number; hops?: number }
  /** The caster is passed over by single attacks for `turns` round ends, and her next landed hit crits (Rin's veil). */
  | { kind: 'veil'; turns: number }
  /** A barrier over the party, replacing any other (Chizuru, engine/mechanics/barrier.ts): a guard's percent, or a purifying heal's power. */
  /** `wake`: a purifying barrier that also ends the party's sleep (Chizuru's 祓, plan 8d). */
  | { kind: 'barrier'; barrier: 'guard' | 'purify'; power: number; turns: number; wake?: true }
  /** The barrier up now is boosted `mul` times and lasts `turns` rounds longer; none up, nothing happens. */
  | { kind: 'barrier-boost'; mul: number; turns: number }
  /**
   * Selene's moon: one phase back (`step`), or else to the full moon (to the new moon with `phase`, her 新月之夜); then
   * that phase is held `hold` round ends.
   */
  | { kind: 'moon'; step?: -1; hold?: number; phase?: 'new' }
  /** The caster's coins grow by `amount` (Liz, engine/mechanics/coins.ts). */
  | { kind: 'coins'; amount: number }
  /** The target's weak points are told, and its fall doubles the caster's coins (Liz's 估價). */
  | { kind: 'appraise' }
  /** The target acts last next round (Sylvie's 釘足箭). */
  | { kind: 'delay' }
  /** The caster's aim locks on the target at full stacks for `turns` round ends (Sylvie's 獵人標記). */
  | { kind: 'aim-lock'; turns: number }
  /** The caster's aimed foe (none yet: the first foe it reaches) gains `n` stacks, up to her cap; draws nothing (Sylvie's 覆蓋). */
  | { kind: 'aim-add'; n: number }
  /** The caster takes the single attacks meant for the target ally for `turns` rounds (Scarlet's 代受). */
  | { kind: 'cover'; turns: number }
  /** For `turns` rounds each foe that lands a blow on the caster takes a fire counter of `power` (Scarlet's 贖火). */
  | { kind: 'riposte'; power: number; turns: number }
  /** The target's single attacks next round go to the caster (Scarlet's 盾擊). */
  | { kind: 'challenge' }
  /** The target's ultimate gauge grows by `amount` (Safira's 拍手). */
  | { kind: 'gauge'; amount: number };
/**
 * A skill's part in its owner's mechanic: `release` spends Chizuru's barrier for power; `coin-power` and `coin-hits` spend
 * Liz's coins for power or for hits; `consume-aim` spends Sylvie's aim for power; `ember-power` spends Scarlet's embers
 * left after the HP cost for power; `clap` adds a beat to Safira's; `cue-finale` sets her beat to four.
 */
export type SkillMechTag = 'release' | 'coin-power' | 'coin-hits' | 'consume-aim' | 'ember-power' | 'clap' | 'cue-finale';

export interface SkillDef {
  id: string; name: string; owner: CharacterId; tp: number; hpCost?: number;
  target: Target; effects: Effect[]; passive?: Passive; desc: string;
  /** One of the hero's abyss capstone skills: grows with the depth of the fight (battle.ts). */
  abyss?: true;
  /** Castable outside battle from the labyrinth's field menu (plan 6f): heals and revives only. */
  field?: true;
  /** Its part in its owner's mechanic (plan 8c). */
  mech?: SkillMechTag;
  /** Rules a variant node writes on the whole skill (plan 8d), read by the mechanic modules. */
  rules?: Partial<SkillRules>;
}
/**
 * Rules a variant node changes on a skill as a whole (plan 8d ruling 7): each task adds its fields; `patchSkill` merges
 * them key by key and copies the ones that belong to one effect onto that effect.
 */
export interface SkillRules {
  /** Heat a fire or thunder skill adds, in place of 1 (Noel's 重星). */
  heat?: number;
  /** Copied onto the skill's mark effect as `critPct` / `hops` (Rin's 不眨眼 / 轉印). */
  markCritPct?: number;
  markHops?: number;
  /** More 還有。 a round when this skill fells her mark (Rin's 追命). */
  again?: number;
  /** A release that leaves the barrier up, this many rounds shorter (Chizuru's 連解). */
  releaseKeep?: number;
  /** Copied onto the skill's barrier effect: the purifying barrier also wakes the party (Chizuru's 祓). */
  wake?: true;
  /** Copied onto the skill's moon effect: the night holds the new moon instead (Selene's 新月之夜). */
  phase?: 'new';
  /** A coin spender spends this percent of her coins, rounded up (Liz's 分期); absent, all of them. */
  coinSpendPct?: number;
  /** +% power a coin spent, in place of COINS.coinPowerPct (Liz's 分期). */
  coinPowerPct?: number;
  /** Copied onto the skill's damage effects: each aim stack adds this percent (Sylvie's 一擊). */
  aimPct?: number;
}
export interface UltimateDef {
  id: string; name: string; owner: CharacterId; target: Target; effects: Effect[]; desc: string;
  /** After the blow lands: more effects on the living party (`allies`) or on the living hero (`hero`). */
  follow?: { who: 'allies' | 'hero'; effects: Effect[] };
  /** A single target felled by the blow gives back this share (percent) of the gauge. */
  refundOnKill?: number;
}
/** How a character grows: which point curve, how many skill branches, how many ultimates, board width and keystone cap. */
export interface GrowthRules { curve: 'companion' | 'hero'; branches: 3 | 5; capstones: number; boardCols: number; maxKeystones: number }
export interface CharacterDef {
  id: CharacterId; title: string; name: string; row: Row; melee: boolean; base: Stats; growth: Stats;
  /** The primary that converts at AFFINITY_MUL; 'all' converts every primary at AFFINITY_MUL x ALL_AFFINITY_SHARE (engine/stats.ts). */
  affinity: PrimaryKey | 'all';
  /** Wears every weapon type at full mastery (the hero). */
  weaponMaster?: true;
  /** Growth rules this character changes from DEFAULT_RULES (data/characters.ts). */
  rules?: Partial<GrowthRules>;
}
export interface EnemySkill { name: string; chance: number; target: Target; effects: Effect[] }
export interface EnemyDef {
  id: string; name: string; floor: 1 | 2 | 3; boss?: boolean; stats: Stats; weak: Element[]; resist: Element[];
  exp: number; gold: number; drops: { mat: string; chance: number }[]; skills: EnemySkill[];
  sec?: Partial<Record<SecondaryKey, number>>;
  /** A story foe: never met at random (NORMAL_ENEMIES leaves it out). */
  story?: true;
  /** Drawn as this character's standee instead of art of its own (render/artPaths enemyArt). */
  look?: CharacterId;
  /** Never drops below 1 HP in a fight (Scarlet's story fight). */
  undying?: true;
}
export interface ItemDef {
  id: string; name: string; price: number; target: Target | null; effects: Effect[]; battle: boolean; returnToTown?: boolean; desc: string;
}
/** Where a member wears gear: one place per gear slot, except rings, which have two. */
export type Slot = 'weapon' | 'offhand' | 'head' | 'body' | 'hands' | 'feet' | 'neck' | 'ring1' | 'ring2';
export type Rarity = 'common' | 'magic' | 'rare' | 'epic' | 'legendary' | 'unique' | 'set';
export type GearSlot = 'weapon' | 'offhand' | 'head' | 'body' | 'hands' | 'feet' | 'neck' | 'ring';
/** The hit and heal effects the art factory publishes (render/artPaths re-exports it). */
export type FxKey = 'slash' | 'pierce' | 'strike' | 'fire' | 'ice' | 'thunder' | 'heal' | 'buff';
/** What a weapon is; the hero's basic attack and his mastery follow it (data/equipment.ts WEAPON_KINDS). */
export type WeaponKind = 'sword' | 'spear' | 'dagger' | 'bow' | 'staff' | 'tome' | 'scimitar' | 'wrench';
export interface EquipDef { id: string; name: string; slot: GearSlot; ilvl: number; price: number; bonus: Partial<Stats>; unlock?: { mat: string; qty: number }[]; weaponKind?: WeaponKind }
/** One rolled piece of gear; enhance runs 0 to ENHANCE_MAX; locked is the affix index first reforged (only that one can be reforged after). */
export interface ItemInstance {
  uid: number; base: string; rarity: Rarity; ilvl: number; affixes: { key: AnyStat; value: number }[];
  special?: string; enhance: number; locked?: number; junk?: boolean;
  /** Plan 5g: a legendary-tier drop with every affix at its maximum and one more (engine/loot/drops.ts applyStarlit). */
  starlit?: true;
}
export type MaterialKind = 'essence' | 'monster' | 'region' | 'rare' | 'junk';
export interface MaterialDef { id: string; name: string; price: number; kind: MaterialKind }
export interface FloorDef {
  id: 1 | 2 | 3; name: string; rows: string[]; encounters: string[][]; rate: [number, number]; chestLoot: { item: string; qty: number }[];
}
/** One absorbed shard's permanent gain to a base stat (spec section 12). */
export interface AbsorbGain { stat: StatKey; amount: number }
/**
 * `limit` is the ultimate gauge (0–100); older saves omit it.
 * `tree` holds skill-tree ranks by node id (see engine/progression.ts); `talents` holds talent-board ranks by node id.
 */
export interface Member {
  id: CharacterId; level: number; exp: number; hp: number; tp: number; equip: Partial<Record<Slot, ItemInstance>>; limit?: number;
  tree: Record<string, number>; talents: Record<string, number>;
  /** Memory pieces held, 0 to chainLength(id). Read it only through `memoriesOf`. */
  memories?: number;
  /** Shards absorbed so far, at most ABSORB_CAP. */
  absorbed?: AbsorbGain[];
  /** Rin's oath: set once she holds all seven pieces. */
  oath?: true;
  /** One free respec at the inn, given by the tree rework (plan 8d, save version 9); the reset uses it up. */
  freeRespec?: true;
}
export interface Party {
  /** 3x3 placement, cells 0-2 front, 3-5 middle, 6-8 back (see engine/formation.ts). */
  roster: Record<CharacterId, Member>; recruited: CharacterId[]; grid: (CharacterId | null)[];
}
