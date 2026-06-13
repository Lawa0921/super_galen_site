import { describe, it, expect, beforeEach } from 'vitest';
import { SoundManager as Witchrun } from './witchrun/audio/SoundManager';
import { SoundManager as Bomber } from './bomber/audio/SoundManager';
import { SoundManager as Tetris } from './tetris/audio/SoundManager';

/**
 * 驗證三款遊戲的「音效音量」接線：SoundManager 的 master gain 必須等於
 * BASE × sfxVolume，且在 arcade-audio-change 事件時即時更新。
 * 用假 AudioContext（happy-dom 無 Web Audio），直接讀 runtime 上的 master 屬性。
 */

class FakeParam {
  value = 1;
  setValueAtTime(v: number): void { this.value = v; }
  exponentialRampToValueAtTime(): void {}
}
class FakeGain {
  gain = new FakeParam();
  connect(): this { return this; }
}
class FakeOsc {
  type = 'sine';
  frequency = new FakeParam();
  connect(n: unknown): unknown { return n; }
  start(): void {}
  stop(): void {}
}
class FakeAudioContext {
  destination = {};
  currentTime = 0;
  state = 'running';
  sampleRate = 44100;
  createGain(): FakeGain { return new FakeGain(); }
  createOscillator(): FakeOsc { return new FakeOsc(); }
  createBuffer(_ch: number, len: number): { getChannelData: () => Float32Array } {
    return { getChannelData: () => new Float32Array(len) };
  }
  resume(): Promise<void> { return Promise.resolve(); }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const masterGain = (sm: any): number => sm.master.gain.value;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const setStore = (sfxVolume: number) => { (window as any).__arcadeAudio = { sfxVolume }; };

const CASES = [
  { name: 'witchrun', Cls: Witchrun, base: 1.0 },
  { name: 'bomber', Cls: Bomber, base: 1.0 },
  { name: 'tetris', Cls: Tetris, base: 0.22 },
] as const;

describe('遊戲 SFX master gain = BASE × sfxVolume', () => {
  beforeEach(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).AudioContext = FakeAudioContext;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).AudioContext = FakeAudioContext;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).__arcadeAudio = undefined;
  });

  for (const { name, Cls, base } of CASES) {
    it(`${name}: ensure() 依當下 sfxVolume 建立 master gain`, () => {
      setStore(0.5);
      const sm = new Cls();
      sm.ensure();
      expect(masterGain(sm)).toBeCloseTo(base * 0.5, 5);
    });

    it(`${name}: arcade-audio-change 事件即時更新 master gain`, () => {
      setStore(0.5);
      const sm = new Cls();
      sm.ensure();
      for (const v of [0.3, 0, 1, 0.6]) {
        window.dispatchEvent(new CustomEvent('arcade-audio-change', { detail: { sfxVolume: v } }));
        expect(masterGain(sm)).toBeCloseTo(base * v, 5);
      }
    });
  }
});
