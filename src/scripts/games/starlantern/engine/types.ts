import type { AilmentId } from './ailments';

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
  | { kind: 'damage'; power: number; element: Element; scale: 'atk' | 'mag'; melee: boolean; hits?: number; crit?: 'always'; execute?: number; wounded?: number }
  | { kind: 'heal'; power: number }
  | { kind: 'restore'; hp?: number; tp?: number }
  | { kind: 'revive'; hpPct: number }
  | { kind: 'cure' }
  | { kind: 'inflict'; status: AilmentId; chance: number }
  | { kind: 'buff'; stat: BuffStat; pct: number; turns: number }
  | { kind: 'taunt'; turns: number }
  | { kind: 'turret'; power: number; turns: number }
  /** Fire, ice and thunder all strike the target as a weakness for `turns` rounds (Noel's hex, plan 8c). */
  | { kind: 'expose'; turns: number }
  /** The caster's mark moves onto the target (Rin's mark, engine/mechanics/mark.ts). */
  | { kind: 'mark' }
  /** The caster is passed over by single attacks for `turns` round ends, and her next landed hit crits (Rin's veil). */
  | { kind: 'veil'; turns: number }
  /** A barrier over the party, replacing any other (Chizuru, engine/mechanics/barrier.ts): a guard's percent, or a purifying heal's power. */
  | { kind: 'barrier'; barrier: 'guard' | 'purify'; power: number; turns: number }
  /** The barrier up now is boosted `mul` times and lasts `turns` rounds longer; none up, nothing happens. */
  | { kind: 'barrier-boost'; mul: number; turns: number }
  /** Selene's moon: one phase back (`step`), or else to the full moon; then that phase is held `hold` round ends. */
  | { kind: 'moon'; step?: -1; hold?: number };
/** A skill's part in its owner's mechanic: `release` spends Chizuru's barrier for power. */
export type SkillMechTag = 'release';

export interface SkillDef {
  id: string; name: string; owner: CharacterId; tp: number; hpCost?: number;
  target: Target; effects: Effect[]; passive?: Passive; desc: string;
  /** One of the hero's abyss capstone skills: grows with the depth of the fight (battle.ts). */
  abyss?: true;
  /** Castable outside battle from the labyrinth's field menu (plan 6f): heals and revives only. */
  field?: true;
  /** Its part in its owner's mechanic (plan 8c). */
  mech?: SkillMechTag;
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
}
export interface Party {
  /** 3x3 placement, cells 0-2 front, 3-5 middle, 6-8 back (see engine/formation.ts). */
  roster: Record<CharacterId, Member>; recruited: CharacterId[]; grid: (CharacterId | null)[];
}
