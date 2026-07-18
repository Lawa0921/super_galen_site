import type { StatBlock } from './types';
import type { ExpeditionState } from './expedition';

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

/** 對外別名，後續版本跟著改指向最新 schema */
export type SaveData = SaveDataV3;

const CURRENT_VERSION = 3;

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
  };
}

/** 逐版遷移表：M2+ 擴充 schema 時在此補 (v) => v+1 的轉換，玩家不清檔 */
const MIGRATIONS: Record<number, (old: Record<string, unknown>) => Record<string, unknown>> = {
  1: (old) => ({ ...old, version: 2, protagonist: defaultProtagonist(), companions: [] }),
  2: (old) => ({ ...old, version: 3, inventory: {}, expedition: null }),
};

/** 驗證物件是否符合 SaveDataV3 的完整 shape（含 protagonist/companions/inventory/expedition）*/
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
    (v.expedition !== null && typeof v.expedition !== 'object')
  ) {
    return false;
  }
  const protagonist = v.protagonist as Record<string, unknown>;
  return typeof protagonist.stats === 'object' && protagonist.stats !== null;
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
  return parsed;
}

export function newGame(now: number = Date.now()): SaveData {
  return {
    version: 3,
    createdAt: now,
    gold: 200,
    flags: {},
    protagonist: defaultProtagonist(),
    companions: [],
    inventory: {},
    expedition: null,
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
