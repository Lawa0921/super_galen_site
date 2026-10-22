import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { SoundManager } from './SoundManager';

/**
 * A fake Web Audio context that only counts: no test ever makes a sound. It records each oscillator's start frequency and
 * each noise buffer, and how many contexts were made.
 */
let made = 0;
let oscs: number[] = [];
let noises = 0;
let starts: number[] = [];
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
    const osc = Object.assign(new FakeNode(), { type: 'sine', frequency, start: (t: number) => { oscs.push(frequency.value); starts.push(t); }, stop: () => {} });
    return osc;
  }
  createBuffer(_c: number, len: number) { return { getChannelData: () => new Float32Array(len) }; }
  createBufferSource() { noises += 1; return Object.assign(new FakeNode(), { buffer: null, start: (t: number) => { starts.push(t); }, stop: () => {} }); }
  createBiquadFilter() { return Object.assign(new FakeNode(), { type: 'lowpass', frequency: new FakeParam() }); }
  resume(): Promise<void> { return Promise.resolve(); }
}

const w = window as unknown as { AudioContext?: unknown; __arcadeAudio?: unknown };
let saved: unknown;

beforeEach(() => {
  saved = w.AudioContext;
  w.AudioContext = FakeAudioContext;
  w.__arcadeAudio = undefined;
  made = 0; oscs = []; noises = 0; starts = [];
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

  it('an epic chimes three rising notes, no shimmer', () => {
    const sm = new SoundManager();
    sm.loot('epic');
    expect(oscs).toEqual([660, 990, 1320]);
    expect(starts.map((t) => Math.round(t * 1000))).toEqual([0, 110, 220]);
    expect(noises).toBe(0);
  });

  it('a starlit legend adds a high sparkle and a second shimmer', () => {
    const sm = new SoundManager();
    for (const r of ['legendary', 'unique', 'set'] as const) {
      oscs = []; noises = 0;
      sm.loot(r, 0, true);
      expect([...oscs].sort((a, b) => a - b), r).toEqual([523, 784, 1047, 2093]);
      expect(noises, r).toBe(2);
    }
    // Without the flag the legend chime is as before.
    oscs = []; noises = 0;
    sm.loot('legendary', 0, false);
    expect([...oscs].sort((a, b) => a - b)).toEqual([523, 784, 1047]);
    expect(noises).toBe(1);
  });

  it('muted, an epic or starlit chime builds nothing either', () => {
    const sm = new SoundManager();
    sm.setVolume(0);
    sm.loot('epic');
    sm.loot('legendary', 0, true);
    expect(made).toBe(0);
    expect(oscs).toEqual([]);
    expect(noises).toBe(0);
  });

  it('a delay holds the whole chime back, so it follows the chest or vault cue instead of doubling it', () => {
    const sm = new SoundManager();
    sm.loot('rare', 150);
    expect(oscs).toEqual([660, 990]);
    expect(starts.map((t) => Math.round(t * 1000))).toEqual([150, 260]);
    starts = [];
    sm.loot('legendary', 150);
    expect(Math.min(...starts.map((t) => Math.round(t * 1000)))).toBe(150);   // nothing sounds before the delay
    starts = [];
    sm.loot('magic');
    expect(starts).toEqual([0]);   // no delay: at once
  });
});
