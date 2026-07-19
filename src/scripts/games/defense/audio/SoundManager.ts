import type { TowerType } from '../engine/engine';

/** Web Audio 合成 SFX（無音檔）；首次手勢 ensure() 解鎖；開火/命中節流防爆音。 */
export class SoundManager {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private muted = false;
  private sfxVolume = 1;
  private lastFireAt = new Map<TowerType, number>();
  private lastHitAt = 0;

  constructor() {
    if (typeof window !== 'undefined') {
      const w = window as unknown as { __arcadeAudio?: { sfxVolume?: number } };
      this.sfxVolume = w.__arcadeAudio?.sfxVolume ?? 1;
      window.addEventListener('arcade-audio-change', (e) => {
        this.sfxVolume = (e as CustomEvent).detail?.sfxVolume ?? 1;
        if (this.master) this.master.gain.value = 1.0 * this.sfxVolume;
      });
    }
  }

  ensure(): void {
    if (!this.ctx) {
      const w = window as unknown as { __arcadeAudio?: { sfxVolume?: number } };
      this.sfxVolume = w.__arcadeAudio?.sfxVolume ?? this.sfxVolume;
      const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.sfxVolume; // BASE 1.0
      this.master.connect(this.ctx.destination);
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
  }
  toggle(): boolean { this.muted = !this.muted; return this.muted; }

  private blip(freq: number, durMs: number, type: OscillatorType = 'square', gain = 0.15, freqEnd?: number): void {
    if (this.muted || !this.ctx) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (freqEnd) osc.frequency.exponentialRampToValueAtTime(freqEnd, t + durMs / 1000);
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + durMs / 1000);
    osc.connect(g).connect(this.master ?? this.ctx.destination);
    osc.start(t); osc.stop(t + durMs / 1000 + 0.03);
  }

  /** 開火（依塔種音色；每種 70ms 節流防多塔齊射爆音） */
  fire(tower: TowerType): void {
    const now = performance.now();
    if (now - (this.lastFireAt.get(tower) ?? 0) < 70) return;
    this.lastFireAt.set(tower, now);
    if (tower === 'arrow') this.blip(880, 50, 'square', 0.05, 660);
    else if (tower === 'bomb') this.blip(150, 160, 'triangle', 0.14, 70);
    else if (tower === 'frost') this.blip(1500, 90, 'sine', 0.06, 1900);
    else this.blip(520, 130, 'sawtooth', 0.06, 1040); // arcane 上滑
  }
  hit(): void {
    const now = performance.now();
    if (now - this.lastHitAt < 60) return;
    this.lastHitAt = now;
    this.blip(320, 45, 'square', 0.04, 180);
  }
  blast(): void { this.blip(90, 320, 'sawtooth', 0.18, 40); this.blip(55, 380, 'triangle', 0.14); }
  kill(): void { this.blip(990, 60, 'square', 0.07); this.blip(1320, 80, 'square', 0.06); }
  leak(): void { this.blip(660, 160, 'square', 0.16, 330); this.blip(440, 220, 'square', 0.12, 220); }
  waveStart(): void { this.blip(392, 110, 'square', 0.12); this.blip(523, 110, 'square', 0.12); this.blip(659, 200, 'square', 0.12); }
  bossRoar(): void { this.blip(70, 700, 'sawtooth', 0.24, 35); this.blip(140, 500, 'triangle', 0.16, 70); }
  build(): void { this.blip(240, 90, 'triangle', 0.14, 120); }
  upgrade(): void { this.blip(523, 90, 'sine', 0.14); this.blip(784, 140, 'sine', 0.14); }
  sell(): void { this.blip(880, 70, 'square', 0.08, 440); }
  win(): void { this.blip(523, 160, 'square', 0.14); this.blip(659, 160, 'square', 0.14); this.blip(784, 160, 'square', 0.14); this.blip(1046, 380, 'square', 0.14); }
  lose(): void { this.blip(196, 500, 'sawtooth', 0.2, 60); this.blip(98, 700, 'triangle', 0.16, 49); }
}
