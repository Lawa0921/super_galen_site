export type TextSpeed = 'slow' | 'mid' | 'fast' | 'instant';
export interface Settings { volume: number; textSpeed: TextSpeed }
export interface SettingsStore { get(): Settings; set?(s: Settings): void }

export const SETTINGS_KEY = 'starlantern-settings';
export const DEFAULT_SETTINGS: Settings = { volume: 70, textSpeed: 'mid' };
export const TEXT_SPEEDS: TextSpeed[] = ['slow', 'mid', 'fast', 'instant'];
const CPS: Record<TextSpeed, number> = { slow: 15, mid: 30, fast: 60, instant: Infinity };

/** Reads saved settings; anything missing, broken or out of range falls back to the default for that field. */
export function loadSettings(storage: Storage | null): Settings {
  let raw: Partial<Settings> = {};
  try {
    const text = storage?.getItem(SETTINGS_KEY);
    if (text) raw = JSON.parse(text) ?? {};
  } catch {
    raw = {};
  }
  const volume = typeof raw.volume === 'number' && raw.volume >= 0 && raw.volume <= 100 ? Math.round(raw.volume / 10) * 10 : DEFAULT_SETTINGS.volume;
  const textSpeed = TEXT_SPEEDS.includes(raw.textSpeed as TextSpeed) ? (raw.textSpeed as TextSpeed) : DEFAULT_SETTINGS.textSpeed;
  return { volume, textSpeed };
}

export function saveSettings(storage: Storage | null, s: Settings): boolean {
  try {
    if (!storage) return false;
    storage.setItem(SETTINGS_KEY, JSON.stringify(s));
    return true;
  } catch {
    return false;
  }
}

/** Typing speed for dialogue, from the player's text speed setting. */
export function textCps(ctx: { settings?: SettingsStore | null }): number {
  return CPS[ctx.settings?.get().textSpeed ?? DEFAULT_SETTINGS.textSpeed];
}
