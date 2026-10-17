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
export type CharacterId = 'noel' | 'chizuru' | 'liz' | 'sylvie' | 'scarlet' | 'selene' | 'safira' | 'bobby';
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
  | { kind: 'inflict'; status: 'poison' | 'sleep'; chance: number }
  | { kind: 'buff'; stat: BuffStat; pct: number; turns: number }
  | { kind: 'taunt'; turns: number }
  | { kind: 'turret'; power: number; turns: number };

export interface SkillDef {
  id: string; name: string; owner: CharacterId; tp: number; hpCost?: number;
  target: Target; effects: Effect[]; passive?: Passive; desc: string;
}
export interface UltimateDef { id: string; name: string; owner: CharacterId; target: Target; effects: Effect[]; desc: string }
/** How a character grows: which point curve, how many skill branches, how many ultimates, board width and keystone cap. */
export interface GrowthRules { curve: 'companion' | 'hero'; branches: 3 | 5; capstones: number; boardCols: number; maxKeystones: number }
export interface CharacterDef {
  id: CharacterId; title: string; name: string; row: Row; melee: boolean; base: Stats; growth: Stats; affinity: PrimaryKey;
  /** Growth rules this character changes from DEFAULT_RULES (data/characters.ts). */
  rules?: Partial<GrowthRules>;
}
export interface EnemySkill { name: string; chance: number; target: Target; effects: Effect[] }
export interface EnemyDef {
  id: string; name: string; floor: 1 | 2 | 3; boss?: boolean; stats: Stats; weak: Element[]; resist: Element[];
  exp: number; gold: number; drops: { mat: string; chance: number }[]; skills: EnemySkill[];
  sec?: Partial<Record<SecondaryKey, number>>;
}
export interface ItemDef {
  id: string; name: string; price: number; target: Target | null; effects: Effect[]; battle: boolean; returnToTown?: boolean; desc: string;
}
/** Where a member wears gear: one place per gear slot, except rings, which have two. */
export type Slot = 'weapon' | 'offhand' | 'head' | 'body' | 'hands' | 'feet' | 'neck' | 'ring1' | 'ring2';
export type Rarity = 'common' | 'magic' | 'rare' | 'legendary' | 'unique' | 'set';
export type GearSlot = 'weapon' | 'offhand' | 'head' | 'body' | 'hands' | 'feet' | 'neck' | 'ring';
export interface EquipDef { id: string; name: string; slot: GearSlot; ilvl: number; price: number; bonus: Partial<Stats>; unlock?: { mat: string; qty: number }[] }
/** One rolled piece of gear; enhance runs 0 to ENHANCE_MAX; locked is the affix index first reforged (only that one can be reforged after). */
export interface ItemInstance {
  uid: number; base: string; rarity: Rarity; ilvl: number; affixes: { key: AnyStat; value: number }[];
  special?: string; enhance: number; locked?: number; junk?: boolean;
}
export type MaterialKind = 'essence' | 'monster' | 'region' | 'rare' | 'junk';
export interface MaterialDef { id: string; name: string; price: number; kind: MaterialKind }
export interface FloorDef {
  id: 1 | 2 | 3; name: string; rows: string[]; encounters: string[][]; rate: [number, number]; chestLoot: { item: string; qty: number }[];
}
/**
 * `limit` is the ultimate gauge (0–100); older saves omit it.
 * `tree` holds skill-tree ranks by node id (see engine/progression.ts); `talents` holds talent-board ranks by node id.
 */
export interface Member {
  id: CharacterId; level: number; exp: number; hp: number; tp: number; equip: Partial<Record<Slot, ItemInstance>>; limit?: number;
  tree: Record<string, number>; talents: Record<string, number>;
}
export interface Party {
  /** 3x3 placement, cells 0-2 front, 3-5 middle, 6-8 back (see engine/formation.ts). */
  roster: Record<CharacterId, Member>; recruited: CharacterId[]; grid: (CharacterId | null)[];
}
