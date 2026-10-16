import type { RegionDef } from '../data/regions';
import type { AnyStat, CharacterDef, PrimaryKey, SecondaryKey, Sheet, StatKey } from './types';

export const PRIMARY_KEYS: PrimaryKey[] = ['str', 'int', 'agi', 'wil'];
export const SECONDARY_KEYS: SecondaryKey[] = [
  'crit', 'critDmg', 'vuln', 'eliteDmg', 'multi',
  'armor', 'evasion', 'block', 'meleeDR', 'rangedDR',
  'fireRes', 'iceRes', 'thunderRes', 'fireDmg', 'iceDmg', 'thunderDmg', 'poisonRes', 'sleepRes',
  'tpRegen', 'tpCost', 'gauge', 'heal',
  'goldFind', 'matFind', 'expBonus',
];
const BASE_KEYS: AnyStat[] = ['hp', 'tp', 'atk', 'def', 'mag', 'res', 'spd'];

export type StatCategory = 'primary' | 'attack' | 'defense' | 'element' | 'resource' | 'other';
export const STAT_CATEGORIES: { id: StatCategory; keys: AnyStat[] }[] = [
  { id: 'primary', keys: ['str', 'int', 'agi', 'wil'] },
  { id: 'attack', keys: ['atk', 'mag', 'crit', 'critDmg', 'vuln', 'eliteDmg', 'multi', 'spd'] },
  { id: 'defense', keys: ['hp', 'def', 'res', 'armor', 'evasion', 'block', 'meleeDR', 'rangedDR'] },
  { id: 'element', keys: ['fireRes', 'iceRes', 'thunderRes', 'fireDmg', 'iceDmg', 'thunderDmg', 'poisonRes', 'sleepRes'] },
  { id: 'resource', keys: ['tp', 'tpRegen', 'tpCost', 'gauge', 'heal'] },
  { id: 'other', keys: ['goldFind', 'matFind', 'expBonus'] },
];

export function emptySheet(): Sheet {
  const s = {} as Sheet;
  for (const k of [...BASE_KEYS, ...PRIMARY_KEYS, ...SECONDARY_KEYS]) s[k] = 0;
  return s;
}

/** Natural primaries only mirror the old stats (shown, and used for the carry limit); they never convert. */
export function naturalPrimary(def: CharacterDef, level: number): Record<PrimaryKey, number> {
  const at = (k: keyof CharacterDef['base']) => def.base[k] + def.growth[k] * (level - 1);
  return { str: at('atk'), int: at('mag'), agi: at('spd'), wil: Math.round(at('tp') / 2) };
}

/** What one point of each primary gives; the character's affinity primary gives 1.5x. */
const CONVERT: Record<PrimaryKey, Partial<Sheet>> = {
  str: { atk: 1, armor: 2 },
  int: { mag: 1, fireRes: 0.5, iceRes: 0.5, thunderRes: 0.5 },
  agi: { crit: 0.2, spd: 0.5 },
  wil: { tp: 1, heal: 1 },
};
const AFFINITY_MUL = 1.5;
// Rounds to 1e-6 so float products such as 0.2 x 1.5 x 10 = 3.0000000000000004 come out as the plain 3 the sheet shows
// and tests compare; a gear value never carries more than a few decimals, so nothing real is lost.
const clean = (n: number): number => Math.round(n * 1e6) / 1e6;

export function convertPrimary(p: Partial<Record<PrimaryKey, number>>, affinity: PrimaryKey): Partial<Sheet> {
  const out: Partial<Sheet> = {};
  for (const k of PRIMARY_KEYS) {
    const n = p[k];
    if (!n) continue;
    const mul = k === affinity ? AFFINITY_MUL : 1;
    for (const [stat, per] of Object.entries(CONVERT[k]) as [AnyStat, number][]) out[stat] = clean((out[stat] ?? 0) + per * mul * n);
  }
  return out;
}

export const PARTY_BASE: Partial<Record<SecondaryKey, number>> = { critDmg: 50 };

export const CAPS: Partial<Record<SecondaryKey, number>> = {
  crit: 60, multi: 50, block: 50, meleeDR: 50, rangedDR: 50,
  fireRes: 75, iceRes: 75, thunderRes: 75, poisonRes: 80, sleepRes: 80,
  tpCost: 50, goldFind: 100, matFind: 100, expBonus: 100,
};

export function capSheet(s: Sheet): Sheet {
  const out = { ...s };
  for (const [k, cap] of Object.entries(CAPS) as [SecondaryKey, number][]) out[k] = Math.min(out[k], cap);
  return out;
}

const ARMOR_MAX = 0.75;
export const EVADE_MAX = 0.5;
const rating = (value: number, attackerLevel: number, max: number): number => {
  const v = Math.max(0, value);
  const denom = v + 50 * attackerLevel;
  return denom <= 0 ? 0 : Math.min(max, v / denom);
};
/** Share of damage armor removes: armor / (armor + 50 * attacker level), at most 0.75. */
export const armorReduction = (armor: number, attackerLevel: number): number => rating(armor, attackerLevel, ARMOR_MAX);
/**
 * Chance to evade: evasion / (evasion + 50 * attacker level), at most 0.5. Units: a member's evasion is rating points
 * (this curve), and the result is a 0-1 fraction; an enemy's evasion is already a percentage (enemySecondary), so
 * calcDamage divides it by 100 and holds it at the same EVADE_MAX (0.5, i.e. 50%) instead of rating it.
 */
export const evadeChance = (value: number, attackerLevel: number): number => rating(value, attackerLevel, EVADE_MAX);

/** Secondaries an enemy gains for being met deeper than the level it was made for (zero at or below home). */
export function enemySecondary(depthLv: number, homeLv: number, trait: RegionDef['trait']): Partial<Record<SecondaryKey, number>> {
  const over = Math.max(0, depthLv - homeLv);
  const evasive = trait === 'evasive' ? 5 : 0;
  const res = Math.min(30, 0.5 * over);
  return {
    crit: Math.min(15, 0.25 * over) + evasive,
    evasion: Math.min(12, 0.2 * over) + evasive,
    fireRes: res, iceRes: res, thunderRes: res,
  };
}

/**
 * Stat multipliers that pay for an enemy's secondaries, so a deep fight keeps its tuned difficulty:
 * hp x (1 - evasion%) x (1 - 0.3 x mean element res%); atk and mag / (1 + crit% x 0.5). Inputs are clamped to
 * their caps so the multipliers stay finite and positive.
 */
export function compensation(sec: Partial<Record<SecondaryKey, number>>): Partial<Record<StatKey, number>> {
  const clamp = (v: number | undefined, max: number) => Math.min(Math.max(0, v ?? 0), max);
  const evasion = clamp(sec.evasion, EVADE_MAX * 100);
  const crit = clamp(sec.crit, CAPS.crit!);
  const res = (clamp(sec.fireRes, CAPS.fireRes!) + clamp(sec.iceRes, CAPS.iceRes!) + clamp(sec.thunderRes, CAPS.thunderRes!)) / 3;
  const out: Partial<Record<StatKey, number>> = {};
  if (evasion || res) out.hp = (1 - evasion / 100) * (1 - (0.3 * res) / 100);
  if (crit) {
    const m = 1 / (1 + (crit / 100) * 0.5);
    out.atk = m;
    out.mag = m;
  }
  return out;
}
