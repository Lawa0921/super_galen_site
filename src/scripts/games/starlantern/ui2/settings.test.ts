import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, SETTINGS_KEY, loadSettings, saveSettings, textCps } from './settings';

const mem = (init: Record<string, string> = {}) => {
  const m = new Map(Object.entries(init));
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => { m.set(k, v); }, m } as unknown as Storage & { m: Map<string, string> };
};

describe('settings', () => {
  it('round-trips through storage', () => {
    const s = mem();
    expect(saveSettings(s, { volume: 40, textSpeed: 'fast', vibrate: false, story: 'major' })).toBe(true);
    expect(loadSettings(s)).toEqual({ volume: 40, textSpeed: 'fast', vibrate: false, story: 'major' });
    expect(JSON.parse(s.m.get(SETTINGS_KEY)!)).toEqual({ volume: 40, textSpeed: 'fast', vibrate: false, story: 'major' });
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

  it('story playback defaults to all and rejects junk', () => {
    expect(DEFAULT_SETTINGS.story).toBe('all');
    expect(loadSettings(null).story).toBe('all');
    expect(loadSettings(mem({ [SETTINGS_KEY]: JSON.stringify({ story: 'major' }) })).story).toBe('major');
    expect(loadSettings(mem({ [SETTINGS_KEY]: JSON.stringify({ story: 'none' }) })).story).toBe('none');
    expect(loadSettings(mem({ [SETTINGS_KEY]: JSON.stringify({ story: 'loud' }) })).story).toBe('all');
    expect(loadSettings(mem({ [SETTINGS_KEY]: JSON.stringify({ story: 3 }) })).story).toBe('all');
  });

  it('turns text speed into characters per second', () => {
    expect(textCps({ settings: { get: () => ({ volume: 50, textSpeed: 'slow', vibrate: true, story: 'all' }) } })).toBeLessThan(textCps({}));
    expect(textCps({ settings: { get: () => ({ volume: 50, textSpeed: 'instant', vibrate: true, story: 'all' }) } })).toBe(Infinity);
    expect(textCps({})).toBe(30);
  });
});
