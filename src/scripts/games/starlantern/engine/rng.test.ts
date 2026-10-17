import { describe, it, expect } from 'vitest';
import { mulberry32, randInt, pick, seedFrom } from './rng';
import { loadGame, saveGame } from './save';
import { newGame } from './state';
import { memoryStorage } from './testing';

describe('rng', () => {
  it('mulberry32 is deterministic per seed and stays in [0,1)', () => {
    const a = mulberry32(42), b = mulberry32(42), c = mulberry32(43);
    const xs = Array.from({ length: 50 }, () => a());
    expect(xs).toEqual(Array.from({ length: 50 }, () => b()));
    expect(xs).not.toEqual(Array.from({ length: 50 }, () => c()));
    for (const x of xs) { expect(x).toBeGreaterThanOrEqual(0); expect(x).toBeLessThan(1); }
  });
  it('randInt covers both ends inclusively', () => {
    expect(randInt(() => 0, 3, 7)).toBe(3);
    expect(randInt(() => 0.9999, 3, 7)).toBe(7);
  });
  it('pick indexes by rng', () => {
    expect(pick(() => 0, ['a', 'b', 'c'])).toBe('a');
    expect(pick(() => 0.5, ['a', 'b', 'c'])).toBe('b');
  });
});

describe('seedFrom', () => {
  it('turns any ?seed= text into a whole 32-bit seed that drives the same rng as before', () => {
    for (const raw of ['7', '123456789', '4294967295']) expect(seedFrom(raw, 99)).toBe(Number(raw));
    for (const raw of ['1.5', '1e30', '-3', '9007199254740993', '0x10']) {
      const s = seedFrom(raw, 99);
      expect(Number.isSafeInteger(s) && s >= 0 && s <= 0xffffffff, raw).toBe(true);
      // 1e30 is a multiple of 2^32 as a double, so its 32-bit value is 0 and it falls back like '0'.
      if (Number(raw) >>> 0) expect(mulberry32(s)(), raw).toBe(mulberry32(Number(raw))());
      else expect(s, raw).toBe(99);
    }
  });
  it('falls back to the given seed for a missing, empty, zero or non-numeric value', () => {
    for (const raw of [null, '', '0', 'abc', 'NaN', 'Infinity']) expect(seedFrom(raw, 1.5e12), String(raw)).toBe(1.5e12 >>> 0);
  });
  it('a game salted with a sanitised seed saves and reloads (a raw 1.5 or 1e30 salt would be refused)', () => {
    for (const raw of ['1.5', '1e30', '-3']) {
      const st = memoryStorage();
      expect(saveGame(st, newGame(mulberry32(1), seedFrom(raw, 99)))).toBe(true);
      expect(loadGame(st).status, raw).toBe('ok');
    }
  });
});
