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
  | { kind: 'damage'; power: number; element: Element; scale: 'atk' | 'mag'; melee: boolean; hits?: number }
  | { kind: 'heal'; power: number }
  | { kind: 'restore'; hp?: number; tp?: number }
  | { kind: 'revive'; hpPct: number }
  | { kind: 'cure' }
  | { kind: 'inflict'; status: 'poison' | 'sleep'; chance: number }
  | { kind: 'buff'; stat: BuffStat; pct: number; turns: number }
  | { kind: 'taunt'; turns: number }
  | { kind: 'turret'; power: number; turns: number };

export interface SkillDef {
  id: string; name: string; owner: CharacterId; learnLevel: number; tp: number; hpCost?: number;
  target: Target; effects: Effect[]; passive?: Passive; desc: string;
}
export interface UltimateDef { id: string; name: string; owner: CharacterId; target: Target; effects: Effect[]; desc: string }
export interface CharacterDef {
  id: CharacterId; title: string; name: string; row: Row; melee: boolean; base: Stats; growth: Stats; skills: string[]; affinity: PrimaryKey;
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
export type Slot = 'weapon' | 'armor' | 'accessory';
export interface EquipDef { id: string; name: string; slot: Slot; price: number; bonus: Partial<Stats>; unlock?: { mat: string; qty: number }[] }
export interface MaterialDef { id: string; name: string; price: number }
export interface FloorDef {
  id: 1 | 2 | 3; name: string; rows: string[]; encounters: string[][]; rate: [number, number]; chestLoot: { item: string; qty: number }[];
}
/** `limit` is the ultimate gauge (0–100); older saves omit it. */
export interface Member { id: CharacterId; level: number; exp: number; hp: number; tp: number; equip: Partial<Record<Slot, string>>; limit?: number }
export interface Party {
  /** 3x3 placement, cells 0-2 front, 3-5 middle, 6-8 back (see engine/formation.ts). */
  roster: Record<CharacterId, Member>; recruited: CharacterId[]; grid: (CharacterId | null)[];
}
