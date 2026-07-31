import type { StatBlock } from './types';
import type { JobId } from './data/jobs';
import type { ExpeditionState } from './expedition';
import { EXPEDITION_VERSION } from './expedition';
import { resolveCharacterGenesis } from './data/genesis';
import type { CharacterGenesis } from './data/genesis';
import { deriveGrowthProfile, latentStatBonuses, realizedGrowthBonuses } from './data/growth';
import type { GrowthProfile } from './data/growth';

export const SAVE_KEY = 'caravan-save-v1';
export type FormationRow = 'front' | 'back';
export type ExpeditionRole = 'captain' | 'scout' | 'quartermaster' | 'medic';

export interface ExpeditionPlan {
  activeIds: string[];
  positions: Record<string, FormationRow>;
  roles: Partial<Record<ExpeditionRole, string>>;
}

export interface CompanionRecord {
  id: string;
  name: string;
  job: 'swordsman' | 'ranger' | 'mage' | 'cleric';
  level: number;
  xp: number;
  stats: StatBlock;
  maxHp: number;
  injuredForTrips: number;
  trait?: string | null;
  genesis?: CharacterGenesis;
  /** M23 五維成長潛力；舊角色缺少時沿用原本成長規則。 */
  growth?: GrowthProfile;
  /** M24 已永久實現到角色基礎值的潛力等級；optional 保持 v6 舊檔相容。 */
  growthRealizedLevel?: number;
  equipment: { weapon: string | null; armor: string | null; trinket: string | null };
  specialization?: string | null;
  bond?: number;
  skills?: Record<string, number>;
  skillPoints?: number;
  equipmentPlus?: { weapon: number; armor: number; trinket: number };
  preparedMoveIds?: string[];
}

interface SaveBase {
  createdAt: number;
  gold: number;
  flags: Record<string, boolean>;
  protagonist: CompanionRecord;
  companions: CompanionRecord[];
}
export interface SaveDataV2 extends SaveBase { version: 2; }
export interface SaveDataV3 extends SaveBase {
  version: 3;
  inventory: Record<string, number>;
  expedition: ExpeditionState | null;
}
interface SaveManaged extends SaveDataV3 {
  wagonLevel: number;
  tavernSeed: number;
  reputation: number;
  visitedBossDungeons: string[];
}
export interface SaveDataV4 extends Omit<SaveManaged, 'version'> { version: 4; }
export interface SaveDataV5 extends Omit<SaveManaged, 'version'> { version: 5; }
export interface SaveDataV6 extends Omit<SaveDataV5, 'version'> {
  version: 6;
  marketSeed: number;
  endlessTier?: number;
  expeditionPlan?: ExpeditionPlan;
}
export type SaveData = SaveDataV6;

const CURRENT_VERSION = 6;
const defaultEquipment = (): CompanionRecord['equipment'] => ({ weapon: null, armor: null, trinket: null });
export const CREATION_BONUS_POINTS = 3;
export const STARTING_PROFILE: Record<JobId, { stats: StatBlock; maxHp: number }> = {
  swordsman: { stats: { str: 12, dex: 12, int: 10, cha: 12, con: 12 }, maxHp: 22 },
  ranger: { stats: { str: 10, dex: 14, int: 10, cha: 10, con: 11 }, maxHp: 20 },
  mage: { stats: { str: 8, dex: 10, int: 14, cha: 11, con: 9 }, maxHp: 17 },
  cleric: { stats: { str: 10, dex: 9, int: 11, cha: 14, con: 12 }, maxHp: 21 },
};
export const STAT_ROLL_MIN = -2;
export const STAT_ROLL_MAX = 3;

export interface CharacterChoice {
  job: JobId;
  allocation?: Partial<StatBlock>;
  trait?: string | null;
  statRoll?: StatBlock;
}

export function createProtagonist(choice: CharacterChoice): CompanionRecord {
  const profile = STARTING_PROFILE[choice.job];
  if (!profile) throw new Error(`createProtagonist: 未知職業「${choice.job}」`);
  const allocation = choice.allocation ?? {};
  let total = 0;
  for (const value of Object.values(allocation)) {
    if (value !== undefined && (!Number.isInteger(value) || value < 0)) throw new Error('創角配點每項必須為非負整數');
    total += value ?? 0;
  }
  if (total > CREATION_BONUS_POINTS) throw new Error(`創角配點總和不可超過 ${CREATION_BONUS_POINTS}`);
  const base = choice.statRoll ?? profile.stats;
  if (choice.statRoll) {
    for (const stat of Object.keys(profile.stats) as Array<keyof StatBlock>) {
      const offset = choice.statRoll[stat] - profile.stats[stat];
      if (offset < STAT_ROLL_MIN || offset > STAT_ROLL_MAX) throw new Error(`擲骰屬性超出允許範圍（${String(stat)} 偏離 ${offset}）`);
    }
  }
  const stats = { ...base };
  for (const stat of Object.keys(allocation) as Array<keyof StatBlock>) stats[stat] += allocation[stat] ?? 0;
  return {
    id: 'protagonist', name: '你', job: choice.job, level: 1, xp: 0, stats,
    maxHp: profile.maxHp, injuredForTrips: 0, trait: choice.trait ?? null,
    equipment: defaultEquipment(),
  };
}

function defaultProtagonist(): CompanionRecord {
  return {
    id: 'protagonist', name: '你', job: 'swordsman', level: 1, xp: 0,
    stats: { str: 12, dex: 12, int: 10, cha: 12, con: 12 }, maxHp: 22,
    injuredForTrips: 0, trait: null, equipment: defaultEquipment(),
  };
}

const MIGRATIONS: Record<number, (old: Record<string, unknown>) => Record<string, unknown>> = {
  1: (old) => ({ ...old, version: 2, protagonist: defaultProtagonist(), companions: [] }),
  2: (old) => ({ ...old, version: 3, inventory: {}, expedition: null }),
  3: (old) => ({ ...old, version: 4, wagonLevel: 0, tavernSeed: old.createdAt, reputation: 0, visitedBossDungeons: [] }),
  4: (old) => {
    const protagonist = old.protagonist as Record<string, unknown>;
    const companions = (old.companions as Array<Record<string, unknown>>) ?? [];
    return { ...old, version: 5, protagonist: { ...protagonist, equipment: defaultEquipment() }, companions: companions.map((c) => ({ ...c, equipment: defaultEquipment() })) };
  },
  5: (old) => {
    const protagonist = old.protagonist as Record<string, unknown>;
    const companions = (old.companions as Array<Record<string, unknown>>) ?? [];
    return { ...old, version: 6, marketSeed: (old.createdAt as number) + 1, protagonist: { ...protagonist, trait: null }, companions: companions.map((c) => ({ ...c, trait: c.trait ?? null })) };
  },
};

function isValidSaveShape(value: unknown): value is SaveData {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  if (typeof v.version !== 'number' || typeof v.createdAt !== 'number' || typeof v.gold !== 'number' ||
      typeof v.flags !== 'object' || v.flags === null || typeof v.protagonist !== 'object' || v.protagonist === null ||
      !Array.isArray(v.companions) || typeof v.inventory !== 'object' || v.inventory === null ||
      (v.expedition !== null && typeof v.expedition !== 'object') || typeof v.wagonLevel !== 'number' ||
      typeof v.tavernSeed !== 'number' || typeof v.marketSeed !== 'number' || typeof v.reputation !== 'number' ||
      !Array.isArray(v.visitedBossDungeons)) return false;
  const protagonist = v.protagonist as Record<string, unknown>;
  return typeof protagonist.stats === 'object' && protagonist.stats !== null && typeof protagonist.equipment === 'object' && protagonist.equipment !== null;
}

function isValidExpeditionPlan(value: unknown): value is ExpeditionPlan {
  if (typeof value !== 'object' || value === null) return false;
  const plan = value as Record<string, unknown>;
  if (!Array.isArray(plan.activeIds) || !plan.activeIds.every((id) => typeof id === 'string') ||
      typeof plan.positions !== 'object' || plan.positions === null || typeof plan.roles !== 'object' || plan.roles === null) return false;
  return Object.values(plan.positions).every((row) => row === 'front' || row === 'back') &&
    Object.values(plan.roles).every((id) => id === undefined || typeof id === 'string');
}

function isCurrentExpeditionSnapshot(value: unknown): value is ExpeditionState {
  if (typeof value !== 'object' || value === null) return false;
  const expedition = value as Record<string, unknown>;
  return expedition.expeditionVersion === EXPEDITION_VERSION && Array.isArray(expedition.partyIds) &&
    expedition.partyIds.every((id) => typeof id === 'string') && typeof expedition.positions === 'object' && expedition.positions !== null &&
    typeof expedition.roles === 'object' && expedition.roles !== null;
}

function realizeMemberGrowth(record: CompanionRecord): void {
  if (!record.growth) return;
  const targetLevel = Math.max(1, Math.min(5, Math.floor(record.level)));
  const rawCurrent = record.growthRealizedLevel;
  const currentLevel = Number.isInteger(rawCurrent) && rawCurrent! >= 1 && rawCurrent! <= 5
    ? rawCurrent!
    : 1;
  if (targetLevel <= currentLevel) {
    record.growthRealizedLevel = currentLevel;
    return;
  }

  const previous = realizedGrowthBonuses(record.growth, currentLevel);
  const next = realizedGrowthBonuses(record.growth, targetLevel);
  for (const stat of Object.keys(next.stats) as Array<keyof StatBlock>) {
    const delta = (next.stats[stat] ?? 0) - (previous.stats[stat] ?? 0);
    if (delta > 0) record.stats[stat] += delta;
  }
  const hpDelta = next.maxHp - previous.maxHp;
  if (hpDelta > 0) record.maxHp += hpDelta;
  record.growthRealizedLevel = targetLevel;
}

/** M24 成長交易：冪等地補齊所有角色尚未實現的潛力，不碰裝備、專精或手動配點。 */
export function realizeSaveGrowth(data: SaveData): SaveData {
  realizeMemberGrowth(data.protagonist);
  for (const companion of data.companions) realizeMemberGrowth(companion);
  return data;
}

function parseAndMigrate(raw: unknown): SaveData | null {
  if (typeof raw !== 'object' || raw === null) return null;
  let parsed = raw as Record<string, unknown>;
  if (typeof parsed.version !== 'number' || parsed.version > CURRENT_VERSION) return null;
  while ((parsed.version as number) < CURRENT_VERSION) {
    const migrate = MIGRATIONS[parsed.version as number];
    if (!migrate) return null;
    parsed = migrate(parsed);
  }
  if (!isValidSaveShape(parsed)) return null;
  if (parsed.expeditionPlan !== undefined && !isValidExpeditionPlan(parsed.expeditionPlan)) delete parsed.expeditionPlan;
  if (parsed.expedition !== null && !isCurrentExpeditionSnapshot(parsed.expedition)) parsed.expedition = null;
  return realizeSaveGrowth(parsed);
}

export function newGame(now: number = Date.now(), choice?: CharacterChoice): SaveData {
  const protagonist = choice ? createProtagonist(choice) : defaultProtagonist();
  const genesis = choice ? resolveCharacterGenesis(protagonist.stats, choice.trait) : null;
  const inventory: Record<string, number> = {};
  let gold = 200;
  let reputation = 0;
  if (genesis) {
    protagonist.genesis = genesis.profile;
    const growth = deriveGrowthProfile(protagonist.stats, STARTING_PROFILE[protagonist.job].stats, genesis.profile);
    protagonist.growth = growth;
    protagonist.growthRealizedLevel = 1;
    const seed = latentStatBonuses(growth, 2);
    for (const stat of Object.keys(seed) as Array<keyof StatBlock>) protagonist.stats[stat] += seed[stat] ?? 0;
    protagonist.maxHp = Math.max(8, protagonist.maxHp + genesis.effects.maxHpDelta + Math.max(0, growth.potential.con - 3));
    protagonist.skills = { ...genesis.effects.skills };
    protagonist.skillPoints = genesis.effects.skillPoints;
    gold = Math.max(50, gold + genesis.effects.goldDelta);
    reputation = Math.max(0, genesis.effects.reputationDelta);
    for (const [itemId, count] of Object.entries(genesis.effects.inventory)) if (count > 0) inventory[itemId] = count;
  }
  return {
    version: 6, createdAt: now, gold, flags: {}, protagonist, companions: [], inventory,
    expedition: null, wagonLevel: 0, tavernSeed: now, marketSeed: now + 1,
    reputation, visitedBossDungeons: [],
  };
}

export function saveGame(data: SaveData, storage: Storage = localStorage): void {
  storage.setItem(SAVE_KEY, JSON.stringify(realizeSaveGrowth(data)));
}
export function loadGame(storage: Storage = localStorage): SaveData | null {
  const raw = storage.getItem(SAVE_KEY);
  if (!raw) return null;
  try { return parseAndMigrate(JSON.parse(raw)); } catch { return null; }
}
export function exportSave(data: SaveData): string {
  return btoa(encodeURIComponent(JSON.stringify(realizeSaveGrowth(data))));
}
export function importSave(encoded: string): SaveData | null {
  try { return parseAndMigrate(JSON.parse(decodeURIComponent(atob(encoded)))); } catch { return null; }
}
