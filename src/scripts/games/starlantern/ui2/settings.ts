export type TextSpeed = 'slow' | 'mid' | 'fast' | 'instant';
/** Which story scenes play on their own: all of them, only the major ones, or none (the summary still reaches the handbook). */
export type StoryMode = 'all' | 'major' | 'none';
export interface Settings { volume: number; textSpeed: TextSpeed; vibrate: boolean; story: StoryMode }
export interface SettingsStore { get(): Settings; set?(s: Settings): void }

export const SETTINGS_KEY = 'starlantern-settings';
export const DEFAULT_SETTINGS: Settings = { volume: 70, textSpeed: 'mid', vibrate: true, story: 'all' };
export const TEXT_SPEEDS: TextSpeed[] = ['slow', 'mid', 'fast', 'instant'];
export const STORY_MODES: StoryMode[] = ['all', 'major', 'none'];
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
  const vibrate = typeof raw.vibrate === 'boolean' ? raw.vibrate : DEFAULT_SETTINGS.vibrate;
  const story = STORY_MODES.includes(raw.story as StoryMode) ? (raw.story as StoryMode) : DEFAULT_SETTINGS.story;
  return { volume, textSpeed, vibrate, story };
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
