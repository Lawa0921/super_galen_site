/**
 * 玩家可調操作手感（handling）設定：DAS / ARR / SDF（皆為 ms）。
 * - localStorage key `tetris-handling`，所有模式（solo/AI/1v1/FFA）開局讀取。
 * - 壞 JSON / 越界 / 隱私模式 throw 一律回退到安全值（與 skins.ts 同慣例）。
 */
export interface Handling {
  das: number;
  arr: number;
  sdf: number;
}

export const HANDLING_DEFAULT: Handling = { das: 150, arr: 35, sdf: 30 };

export const HANDLING_RANGE = {
  das: { min: 50, max: 300 },
  arr: { min: 0, max: 80 }, // 0 = 瞬移
  sdf: { min: 0, max: 60 }, // 0 = 瞬降
} as const;

const STORAGE_KEY = 'tetris-handling';

/** 非有限數字 → 該欄位預設；否則 clamp 進範圍。 */
function sanitize(key: keyof Handling, raw: unknown): number {
  if (typeof raw !== 'number' || !Number.isFinite(raw)) return HANDLING_DEFAULT[key];
  const { min, max } = HANDLING_RANGE[key];
  return Math.min(max, Math.max(min, raw));
}

/** 讀取玩家 handling 設定；任何錯誤回傳預設副本。 */
export function loadHandling(): Handling {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...HANDLING_DEFAULT };
    const parsed = JSON.parse(raw) as Partial<Record<keyof Handling, unknown>>;
    return {
      das: sanitize('das', parsed?.das),
      arr: sanitize('arr', parsed?.arr),
      sdf: sanitize('sdf', parsed?.sdf),
    };
  } catch {
    return { ...HANDLING_DEFAULT };
  }
}

/** 寫入玩家 handling 設定；隱私模式等任何錯誤靜默吸收。 */
export function saveHandling(h: Handling): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(h));
  } catch {
    // 靜默
  }
}
