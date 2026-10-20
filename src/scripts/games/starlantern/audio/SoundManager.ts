import type { Rarity } from '../engine/types';

const BASE = 1.0;

export class SoundManager {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private sfxVolume = 1;
  /** The game's own volume setting; it scales the site-wide arcade volume instead of replacing it. */
  private playerVolume = 1;

  constructor() {
    if (typeof window !== 'undefined') {
      const w = window as unknown as { __arcadeAudio?: { sfxVolume?: number } };
      this.sfxVolume = w.__arcadeAudio?.sfxVolume ?? 1;
      window.addEventListener('arcade-audio-change', (e) => {
        this.sfxVolume = (e as CustomEvent).detail?.sfxVolume ?? 1;
        if (this.master) this.master.gain.value = BASE * this.sfxVolume * this.playerVolume;
      });
    }
  }

  ensure(): void {
    if (typeof window === 'undefined') return;
    if (!this.ctx) {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return;
      this.ctx = new Ctor();
      this.master = this.ctx.createGain();
      this.master.gain.value = BASE * this.sfxVolume * this.playerVolume;
      this.master.connect(this.ctx.destination);
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
  }

  /** Player volume, 0..1 (the settings screen). */
  setVolume(v: number): void {
    this.playerVolume = Math.max(0, Math.min(1, v));
    if (this.master) this.master.gain.value = BASE * this.sfxVolume * this.playerVolume;
  }

  private blip(freq: number, durMs: number, type: OscillatorType = 'square', gain = 0.12, freqEnd?: number, delayMs = 0): void {
    this.ensure();
    if (!this.ctx || !this.master) return;
    const t = this.ctx.currentTime + delayMs / 1000;
    const end = t + durMs / 1000;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (freqEnd) osc.frequency.exponentialRampToValueAtTime(freqEnd, end);
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, end);
    osc.connect(g);
    g.connect(this.master);
    osc.start(t);
    osc.stop(end);
  }

  /** Filtered white noise: the body of slashes, flames, cracks and whooshes. */
  private noise(durMs: number, gain: number, filter: BiquadFilterType, freq: number, freqEnd?: number, delayMs = 0): void {
    this.ensure();
    if (!this.ctx || !this.master) return;
    const t = this.ctx.currentTime + delayMs / 1000;
    const end = t + durMs / 1000;
    const len = Math.max(1, Math.floor(this.ctx.sampleRate * durMs / 1000));
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const f = this.ctx.createBiquadFilter();
    f.type = filter;
    f.frequency.setValueAtTime(freq, t);
    if (freqEnd) f.frequency.exponentialRampToValueAtTime(freqEnd, end);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, end);
    src.connect(f); f.connect(g); g.connect(this.master);
    src.start(t);
    src.stop(end);
  }

  /** Each attack effect has its own sound on impact (render/artPaths FxKey). */
  element(fx: string): void {
    switch (fx) {
      case 'slash': this.noise(120, 0.22, 'highpass', 2400, 6000); break;
      case 'pierce': this.noise(90, 0.18, 'bandpass', 3200); this.blip(1400, 70, 'square', 0.05, 500); break;
      case 'strike': this.noise(110, 0.25, 'lowpass', 700, 150); break;
      case 'fire': this.noise(380, 0.2, 'lowpass', 1600, 300); this.blip(110, 300, 'sawtooth', 0.06, 70); break;
      case 'ice': this.blip(1760, 160, 'sine', 0.07); this.blip(2350, 220, 'sine', 0.05); this.noise(160, 0.08, 'highpass', 5000); break;
      case 'thunder': this.noise(60, 0.3, 'highpass', 1800); this.noise(420, 0.22, 'lowpass', 900, 120, 40); break;
      default: break;
    }
  }

  /** The whoosh of an action cut-in sliding across the screen. */
  cutin(): void { this.noise(220, 0.16, 'bandpass', 600, 3000); this.blip(660, 90, 'square', 0.05, 1320); }

  step(): void { this.blip(180, 40, 'triangle', 0.06); }
  bump(): void { this.blip(90, 70, 'square', 0.08); }
  stairs(): void { this.blip(330, 160, 'triangle', 0.1, 660); }
  chest(): void { this.blip(660, 90, 'square', 0.1); this.blip(990, 160, 'square', 0.08); }
  encounter(): void { this.blip(220, 260, 'sawtooth', 0.12, 880); }
  menu(): void { this.blip(520, 40, 'square', 0.06); }
  hit(): void { this.blip(160, 90, 'square', 0.12, 60); }
  weak(): void { this.blip(240, 140, 'sawtooth', 0.14, 70); }
  heal(): void { this.blip(520, 220, 'sine', 0.1, 1040); }
  ko(): void { this.blip(300, 300, 'triangle', 0.12, 50); }
  win(): void { this.blip(523, 120, 'square', 0.1); this.blip(784, 260, 'square', 0.1); }
  cursor(): void { this.blip(880, 28, 'square', 0.04); }
  confirm(): void { this.blip(660, 50, 'square', 0.07, 990); }
  cancel(): void { this.blip(440, 60, 'square', 0.06, 300); }
  error(): void { this.blip(140, 140, 'sawtooth', 0.08); }
  /** Rising chord for an ultimate cut-in. */
  ultimate(): void { this.blip(392, 160, 'sawtooth', 0.12, 784); this.blip(587, 420, 'square', 0.1, 1175); }
  lose(): void { this.blip(220, 500, 'triangle', 0.12, 55); }

  /**
   * A gear drop's chime by rarity: magic one note, rare a second one after it, epic a third rising note (660/990/1320 Hz,
   * no shimmer), the legend tier (legendary, unique, set) a C-major triad (523/784/1047 Hz) rolled upward with a high
   * shimmer of noise. A `starlit` legend (plan 5g) adds a high C sparkle (2093 Hz) and a second shimmer. Common has none.
   * At an effective volume of 0 (the game's setting or the site-wide sound slider) nothing is built: no AudioContext, no
   * node. `delayMs` holds the whole chime back (lootFx: after the chest, vault or win cue).
   */
  loot(rarity: Rarity, delayMs = 0, starlit = false): void {
    if (this.sfxVolume * this.playerVolume <= 0) return;
    const d = delayMs;
    switch (rarity) {
      case 'magic': this.blip(660, 160, 'sine', 0.1, undefined, d); break;
      case 'rare': this.blip(660, 120, 'sine', 0.1, undefined, d); this.blip(990, 220, 'sine', 0.09, undefined, d + 110); break;
      case 'epic':
        this.blip(660, 120, 'sine', 0.1, undefined, d);
        this.blip(990, 160, 'sine', 0.09, undefined, d + 110);
        this.blip(1320, 280, 'sine', 0.08, undefined, d + 220);
        break;
      case 'legendary': case 'unique': case 'set':
        this.blip(523, 520, 'triangle', 0.1, undefined, d);
        this.blip(784, 480, 'triangle', 0.09, undefined, d + 70);
        this.blip(1047, 560, 'sine', 0.09, undefined, d + 140);
        this.noise(600, 0.05, 'highpass', 6000, 9000, d + 140);
        if (starlit) {
          this.blip(2093, 640, 'sine', 0.07, undefined, d + 210);
          this.noise(700, 0.04, 'highpass', 7000, 11000, d + 260);
        }
        break;
      default: break;
    }
  }
}
