import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, SETTINGS_KEY, loadSettings, saveSettings, textCps } from './settings';

const mem = (init: Record<string, string> = {}) => {
  const m = new Map(Object.entries(init));
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => { m.set(k, v); }, m } as unknown as Storage & { m: Map<string, string> };
};

describe('settings', () => {
  it('round-trips through storage', () => {
    const s = mem();
    expect(saveSettings(s, { volume: 40, textSpeed: 'fast' })).toBe(true);
    expect(loadSettings(s)).toEqual({ volume: 40, textSpeed: 'fast' });
    expect(JSON.parse(s.m.get(SETTINGS_KEY)!)).toEqual({ volume: 40, textSpeed: 'fast' });
  });

  it('falls back to defaults for missing, broken or out-of-range values', () => {
    expect(loadSettings(null)).toEqual(DEFAULT_SETTINGS);
    expect(loadSettings(mem({ [SETTINGS_KEY]: '{oops' }))).toEqual(DEFAULT_SETTINGS);
    expect(loadSettings(mem({ [SETTINGS_KEY]: JSON.stringify({ volume: 900, textSpeed: 'warp' }) }))).toEqual(DEFAULT_SETTINGS);
    expect(loadSettings(mem({ [SETTINGS_KEY]: JSON.stringify({ volume: 30 }) }))).toEqual({ ...DEFAULT_SETTINGS, volume: 30 });
    const throwing = { getItem: () => { throw new Error('denied'); }, setItem: () => { throw new Error('denied'); } } as unknown as Storage;
    expect(loadSettings(throwing)).toEqual(DEFAULT_SETTINGS);
    expect(saveSettings(throwing, DEFAULT_SETTINGS)).toBe(false);
  });

  it('turns text speed into characters per second', () => {
    expect(textCps({ settings: { get: () => ({ volume: 50, textSpeed: 'slow' }) } })).toBeLessThan(textCps({}));
    expect(textCps({ settings: { get: () => ({ volume: 50, textSpeed: 'instant' }) } })).toBe(Infinity);
    expect(textCps({})).toBe(30);
  });
});
