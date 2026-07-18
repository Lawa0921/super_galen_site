export const SAVE_KEY = 'caravan-save-v1';

export interface SaveDataV1 {
  version: 1;
  createdAt: number;
  gold: number;
  flags: Record<string, boolean>;
}

const CURRENT_VERSION = 1;

/** 逐版遷移表：M2+ 擴充 schema 時在此補 (v) => v+1 的轉換，玩家不清檔 */
const MIGRATIONS: Record<number, (old: Record<string, unknown>) => Record<string, unknown>> = {};

/** 驗證物件是否符合 SaveDataV1 的完整 shape（version/createdAt/gold 為 number、flags 為非 null 物件）*/
function isValidSaveShape(value: unknown): value is SaveDataV1 {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.version === 'number' &&
    typeof v.createdAt === 'number' &&
    typeof v.gold === 'number' &&
    typeof v.flags === 'object' &&
    v.flags !== null
  );
}

export function newGame(now: number = Date.now()): SaveDataV1 {
  return { version: 1, createdAt: now, gold: 200, flags: {} };
}

export function saveGame(data: SaveDataV1, storage: Storage = localStorage): void {
  storage.setItem(SAVE_KEY, JSON.stringify(data));
}

export function loadGame(storage: Storage = localStorage): SaveDataV1 | null {
  const raw = storage.getItem(SAVE_KEY);
  if (!raw) return null;
  try {
    let parsed = JSON.parse(raw) as Record<string, unknown>;
    if (typeof parsed !== 'object' || parsed === null || typeof parsed.version !== 'number') return null;
    if ((parsed.version as number) > CURRENT_VERSION) return null;
    while ((parsed.version as number) < CURRENT_VERSION) {
      const migrate = MIGRATIONS[parsed.version as number];
      if (!migrate) return null;
      parsed = migrate(parsed);
    }
    if (!isValidSaveShape(parsed)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function exportSave(data: SaveDataV1): string {
  return btoa(encodeURIComponent(JSON.stringify(data)));
}

export function importSave(encoded: string): SaveDataV1 | null {
  try {
    const parsed = JSON.parse(decodeURIComponent(atob(encoded))) as Record<string, unknown>;
    if (typeof parsed !== 'object' || parsed === null || typeof parsed.version !== 'number') return null;
    if ((parsed.version as number) > CURRENT_VERSION) return null;
    if (!isValidSaveShape(parsed)) return null;
    return parsed;
  } catch {
    return null;
  }
}
