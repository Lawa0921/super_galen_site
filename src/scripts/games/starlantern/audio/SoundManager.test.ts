import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { SoundManager } from './SoundManager';

/**
 * A fake Web Audio context that only counts: no test ever makes a sound. It records each oscillator's start frequency and
 * each noise buffer, and how many contexts were made.
 */
let made = 0;
let oscs: number[] = [];
let noises = 0;
class FakeParam { value = 1; setValueAtTime(v: number): void { this.value = v; } exponentialRampToValueAtTime(): void {} }
class FakeNode { connect(n: unknown): unknown { return n; } }
class FakeAudioContext {
  destination = {};
  currentTime = 0;
  state = 'running';
  sampleRate = 8000;
  constructor() { made += 1; }
  createGain() { return Object.assign(new FakeNode(), { gain: new FakeParam() }); }
  createOscillator() {
    const frequency = new FakeParam();
    const osc = Object.assign(new FakeNode(), { type: 'sine', frequency, start: () => { oscs.push(frequency.value); }, stop: () => {} });
    return osc;
  }
  createBuffer(_c: number, len: number) { return { getChannelData: () => new Float32Array(len) }; }
  createBufferSource() { noises += 1; return Object.assign(new FakeNode(), { buffer: null, start: () => {}, stop: () => {} }); }
  createBiquadFilter() { return Object.assign(new FakeNode(), { type: 'lowpass', frequency: new FakeParam() }); }
  resume(): Promise<void> { return Promise.resolve(); }
}

const w = window as unknown as { AudioContext?: unknown; __arcadeAudio?: unknown };
let saved: unknown;

beforeEach(() => {
  saved = w.AudioContext;
  w.AudioContext = FakeAudioContext;
  w.__arcadeAudio = undefined;
  made = 0; oscs = []; noises = 0;
});
afterEach(() => { w.AudioContext = saved; w.__arcadeAudio = undefined; });

describe('SoundManager.loot', () => {
  it('muted loot makes no audio nodes', () => {
    const sm = new SoundManager();
    sm.setVolume(0);
    for (const r of ['magic', 'rare', 'legendary', 'unique', 'set'] as const) sm.loot(r);
    expect(made).toBe(0);   // not even a context
    expect(oscs.length).toBe(0);
    expect(noises).toBe(0);
    sm.setVolume(1);
    sm.loot('magic');
    expect(oscs.length).toBeGreaterThan(0);
  });

  it('the site-wide sound volume at 0 mutes loot too, before any context exists', () => {
    w.__arcadeAudio = { sfxVolume: 0 };
    const sm = new SoundManager();
    sm.loot('legendary');
    expect(made).toBe(0);
    window.dispatchEvent(new CustomEvent('arcade-audio-change', { detail: { sfxVolume: 0.5 } }));
    sm.loot('legendary');
    expect(made).toBe(1);
  });

  it('a chime per rarity: magic one note, rare two, the legend tier a triad and a shimmer', () => {
    const sm = new SoundManager();
    sm.loot('common');
    expect(oscs).toEqual([]);
    sm.loot('magic');
    expect(oscs).toEqual([660]);
    oscs = [];
    sm.loot('rare');
    expect(oscs).toEqual([660, 990]);
    expect(noises).toBe(0);
    for (const r of ['legendary', 'unique', 'set'] as const) {
      oscs = []; noises = 0;
      sm.loot(r);
      expect([...oscs].sort((a, b) => a - b)).toEqual([523, 784, 1047]);
      expect(noises).toBe(1);
    }
  });
});
