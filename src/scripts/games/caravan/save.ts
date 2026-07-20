import type { StatBlock } from './types';
import type { JobId } from './data/jobs';
import type { ExpeditionState } from './expedition';
import { EXPEDITION_VERSION } from './expedition';

export const SAVE_KEY = 'caravan-save-v1';

export interface CompanionRecord {
  id: string;
  name: string;
  job: 'swordsman' | 'ranger' | 'mage' | 'cleric';
  level: number;
  xp: number;
  stats: StatBlock;
  maxHp: number;
  /** >0 表示重傷缺席剩餘趟數 */
  injuredForTrips: number;
  /** 旅伴特質 id（roster.ts TRAITS）；主角與 M7 前的舊成員為 null */
  trait?: string | null;
  /** 裝備三欄：itemId 或 null（M5，roster.ts equipItem/unequipItem 維護） */
  equipment: { weapon: string | null; armor: string | null; trinket: string | null };
  /** M11 職業專精 id（roster.ts SPECIALIZATIONS）；Lv4 起可選，未選＝undefined/null */
  specialization?: string | null;
  /** M11 旅伴羈絆：與主角同行完成的遠征趟數（主角自身不使用此欄） */
  bond?: number;
}

export interface SaveDataV2 {
  version: 2;
  createdAt: number;
  gold: number;
  flags: Record<string, boolean>;
  protagonist: CompanionRecord;
  companions: CompanionRecord[];
}

export interface SaveDataV3 {
  version: 3;
  createdAt: number;
  gold: number;
  flags: Record<string, boolean>;
  protagonist: CompanionRecord;
  companions: CompanionRecord[];
  /** 背包：itemId -> 持有數量 */
  inventory: Record<string, number>;
  /** 進行中的遠征快照；重整頁面靠這個接續，非遠征中為 null */
  expedition: ExpeditionState | null;
}

export interface SaveDataV4 {
  version: 4;
  createdAt: number;
  gold: number;
  flags: Record<string, boolean>;
  protagonist: CompanionRecord;
  companions: CompanionRecord[];
  /** 背包：itemId -> 持有數量 */
  inventory: Record<string, number>;
  /** 進行中的遠征快照；重整頁面靠這個接續，非遠征中為 null */
  expedition: ExpeditionState | null;
  /** 馬車升級等級：economy.ts cargoCapacity 依此計算載貨上限（M4） */
  wagonLevel: number;
  /** 酒館招募池種子；每次歸返結算後遞增以輪替名單（M4） */
  tavernSeed: number;
  /** 聲望：M4 唯一效果——達門檻時酒館池首位出現 Lv2 精英傭兵 */
  reputation: number;
  /** 已擊殺過的隱藏迷宮 boss（locationId），用於再殺遞減報酬（M4） */
  visitedBossDungeons: string[];
}

export interface SaveDataV5 {
  version: 5;
  createdAt: number;
  gold: number;
  flags: Record<string, boolean>;
  protagonist: CompanionRecord;
  companions: CompanionRecord[];
  /** 背包：itemId -> 持有數量 */
  inventory: Record<string, number>;
  /** 進行中的遠征快照；重整頁面靠這個接續，非遠征中為 null */
  expedition: ExpeditionState | null;
  /** 馬車升級等級：economy.ts cargoCapacity 依此計算載貨上限（M4） */
  wagonLevel: number;
  /** 酒館招募池種子；每次歸返結算後遞增以輪替名單（M4） */
  tavernSeed: number;
  /** 聲望：M4 唯一效果——達門檻時酒館池首位出現 Lv2 精英傭兵 */
  reputation: number;
  /** 已擊殺過的隱藏迷宮 boss（locationId），用於再殺遞減報酬（M4） */
  visitedBossDungeons: string[];
}

export interface SaveDataV6 extends Omit<SaveDataV5, 'version'> {
  version: 6;
  /** 市場行情種子；每次歸返結算後遞增，各鎮物價隨之波動（M7） */
  marketSeed: number;
}

/** 對外別名，後續版本跟著改指向最新 schema */
export type SaveData = SaveDataV6;

const CURRENT_VERSION = 6;

const defaultEquipment = (): CompanionRecord['equipment'] => ({ weapon: null, armor: null, trinket: null });

/** 創角配點池：職業起始屬性之外可額外分配的點數 */
export const CREATION_BONUS_POINTS = 3;

/** 每職業的主角起始屬性與生命上限。劍士＝舊版預設（e2e 相容鐵則）。 */
export const STARTING_PROFILE: Record<JobId, { stats: StatBlock; maxHp: number }> = {
  swordsman: { stats: { str: 12, dex: 12, int: 10, cha: 12, con: 12 }, maxHp: 22 },
  ranger: { stats: { str: 10, dex: 14, int: 10, cha: 10, con: 11 }, maxHp: 20 },
  mage: { stats: { str: 8, dex: 10, int: 14, cha: 11, con: 9 }, maxHp: 17 },
  cleric: { stats: { str: 10, dex: 9, int: 11, cha: 14, con: 12 }, maxHp: 21 },
};

export interface CharacterChoice {
  job: JobId;
  /** 額外配點（總和 ≤ CREATION_BONUS_POINTS，每項非負整數） */
  allocation?: Partial<StatBlock>;
  /** 起始特性 id（roster.ts TRAITS）；未選為 null */
  trait?: string | null;
}

/** 依創角選擇建立主角記錄。劍士＋0 配點＋無特性 === defaultProtagonist()。 */
export function createProtagonist(choice: CharacterChoice): CompanionRecord {
  const profile = STARTING_PROFILE[choice.job];
  if (!profile) throw new Error(`createProtagonist: 未知職業「${choice.job}」`);
  const alloc = choice.allocation ?? {};
  let total = 0;
  for (const value of Object.values(alloc)) {
    if (value !== undefined && (!Number.isInteger(value) || value < 0)) {
      throw new Error('創角配點每項必須為非負整數');
    }
    total += value ?? 0;
  }
  if (total > CREATION_BONUS_POINTS) {
    throw new Error(`創角配點總和不可超過 ${CREATION_BONUS_POINTS}`);
  }
  const stats: StatBlock = { ...profile.stats };
  for (const key of Object.keys(alloc) as Array<keyof StatBlock>) {
    stats[key] += alloc[key] ?? 0;
  }
  return {
    id: 'protagonist',
    name: '你',
    job: choice.job,
    level: 1,
    xp: 0,
    stats,
    maxHp: profile.maxHp,
    injuredForTrips: 0,
    trait: choice.trait ?? null,
    equipment: defaultEquipment(),
  };
}

function defaultProtagonist(): CompanionRecord {
  return {
    id: 'protagonist',
    name: '你',
    job: 'swordsman',
    level: 1,
    xp: 0,
    stats: { str: 12, dex: 12, int: 10, cha: 12, con: 12 },
    maxHp: 22,
    injuredForTrips: 0,
    trait: null,
    equipment: defaultEquipment(),
  };
}

/** 逐版遷移表：M2+ 擴充 schema 時在此補 (v) => v+1 的轉換，玩家不清檔 */
const MIGRATIONS: Record<number, (old: Record<string, unknown>) => Record<string, unknown>> = {
  1: (old) => ({ ...old, version: 2, protagonist: defaultProtagonist(), companions: [] }),
  2: (old) => ({ ...old, version: 3, inventory: {}, expedition: null }),
  3: (old) => ({
    ...old,
    version: 4,
    wagonLevel: 0,
    tavernSeed: old.createdAt,
    reputation: 0,
    visitedBossDungeons: [],
  }),
  4: (old) => {
    const protagonist = old.protagonist as Record<string, unknown>;
    const companions = (old.companions as Array<Record<string, unknown>>) ?? [];
    return {
      ...old,
      version: 5,
      protagonist: { ...protagonist, equipment: defaultEquipment() },
      companions: companions.map((c) => ({ ...c, equipment: defaultEquipment() })),
    };
  },
  5: (old) => {
    const protagonist = old.protagonist as Record<string, unknown>;
    const companions = (old.companions as Array<Record<string, unknown>>) ?? [];
    return {
      ...old,
      version: 6,
      marketSeed: (old.createdAt as number) + 1,
      protagonist: { ...protagonist, trait: null },
      companions: companions.map((c) => ({ ...c, trait: c.trait ?? null })),
    };
  },
};

/** 驗證物件是否符合 SaveDataV6 的完整 shape（含 marketSeed；v5 及更早由 MIGRATIONS 先升版再驗）*/
function isValidSaveShape(value: unknown): value is SaveData {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  if (
    typeof v.version !== 'number' ||
    typeof v.createdAt !== 'number' ||
    typeof v.gold !== 'number' ||
    typeof v.flags !== 'object' ||
    v.flags === null ||
    typeof v.protagonist !== 'object' ||
    v.protagonist === null ||
    !Array.isArray(v.companions) ||
    typeof v.inventory !== 'object' ||
    v.inventory === null ||
    (v.expedition !== null && typeof v.expedition !== 'object') ||
    typeof v.wagonLevel !== 'number' ||
    typeof v.tavernSeed !== 'number' ||
    typeof v.marketSeed !== 'number' ||
    typeof v.reputation !== 'number' ||
    !Array.isArray(v.visitedBossDungeons)
  ) {
    return false;
  }
  const protagonist = v.protagonist as Record<string, unknown>;
  if (typeof protagonist.stats !== 'object' || protagonist.stats === null) return false;
  return typeof protagonist.equipment === 'object' && protagonist.equipment !== null;
}

/** 解析任意輸入：逐版遷移到最新版本後驗證 shape；毀損或未來版本一律回 null */
function parseAndMigrate(raw: unknown): SaveData | null {
  if (typeof raw !== 'object' || raw === null) return null;
  let parsed = raw as Record<string, unknown>;
  if (typeof parsed.version !== 'number') return null;
  if ((parsed.version as number) > CURRENT_VERSION) return null;
  while ((parsed.version as number) < CURRENT_VERSION) {
    const migrate = MIGRATIONS[parsed.version as number];
    if (!migrate) return null;
    parsed = migrate(parsed);
  }
  if (!isValidSaveShape(parsed)) return null;
  // 遠征快照版本防護（M4）：舊版遠征快照（缺 expeditionVersion 或版本不符）一律丟棄，
  // 主檔（gold/inventory/roster...）完整保留——玩家不會因為引擎升級而整檔毀損，
  // 只是進行中的那趟遠征記錄作廢。
  if (parsed.expedition !== null && parsed.expedition.expeditionVersion !== EXPEDITION_VERSION) {
    parsed.expedition = null;
  }
  return parsed;
}

export function newGame(now: number = Date.now(), choice?: CharacterChoice): SaveData {
  return {
    version: 6,
    createdAt: now,
    gold: 200,
    flags: {},
    protagonist: choice ? createProtagonist(choice) : defaultProtagonist(),
    companions: [],
    inventory: {},
    expedition: null,
    wagonLevel: 0,
    tavernSeed: now,
    marketSeed: now + 1,
    reputation: 0,
    visitedBossDungeons: [],
  };
}

export function saveGame(data: SaveData, storage: Storage = localStorage): void {
  storage.setItem(SAVE_KEY, JSON.stringify(data));
}

export function loadGame(storage: Storage = localStorage): SaveData | null {
  const raw = storage.getItem(SAVE_KEY);
  if (!raw) return null;
  try {
    return parseAndMigrate(JSON.parse(raw));
  } catch {
    return null;
  }
}

export function exportSave(data: SaveData): string {
  return btoa(encodeURIComponent(JSON.stringify(data)));
}

export function importSave(encoded: string): SaveData | null {
  try {
    return parseAndMigrate(JSON.parse(decodeURIComponent(atob(encoded))));
  } catch {
    return null;
  }
}
