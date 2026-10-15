const BASE = 1.0;

export class SoundManager {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private muted = false;
  private sfxVolume = 1;

  constructor() {
    if (typeof window !== 'undefined') {
      const w = window as unknown as { __arcadeAudio?: { sfxVolume?: number } };
      this.sfxVolume = w.__arcadeAudio?.sfxVolume ?? 1;
      window.addEventListener('arcade-audio-change', (e) => {
        this.sfxVolume = (e as CustomEvent).detail?.sfxVolume ?? 1;
        if (this.master) this.master.gain.value = BASE * this.sfxVolume;
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
      this.master.gain.value = BASE * this.sfxVolume;
      this.master.connect(this.ctx.destination);
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
  }

  toggle(): boolean {
    this.muted = !this.muted;
    return this.muted;
  }

  private blip(freq: number, durMs: number, type: OscillatorType = 'square', gain = 0.12, freqEnd?: number): void {
    if (this.muted) return;
    this.ensure();
    if (!this.ctx || !this.master) return;
    const t = this.ctx.currentTime;
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
}
