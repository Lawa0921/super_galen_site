/** Web Audio 合成 SFX；首次手勢 ensure() 解鎖。射擊聲節流。 */
export class SoundManager {
  private ctx: AudioContext | null = null;
  private muted = false;
  private lastShootAt = 0;

  ensure(): void {
    if (!this.ctx) {
      const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
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
    osc.connect(g).connect(this.ctx.destination);
    osc.start(t); osc.stop(t + durMs / 1000 + 0.03);
  }

  shoot(): void {
    const now = performance.now();
    if (now - this.lastShootAt < 90) return;
    this.lastShootAt = now;
    this.blip(880, 40, 'square', 0.05);
  }
  graze(): void { this.blip(1320, 30, 'sine', 0.08); }
  overdrive(): void { this.blip(220, 500, 'sawtooth', 0.22, 880); this.blip(110, 400, 'triangle', 0.18); }
  inferno(): void { this.blip(90, 420, 'sawtooth', 0.25); this.blip(45, 500, 'triangle', 0.2); }
  kill(): void { this.blip(440, 80, 'square', 0.1, 110); }
  hit(): void { this.blip(140, 300, 'sawtooth', 0.25, 60); }
  coin(): void { this.blip(990, 60, 'square', 0.08); this.blip(1320, 70, 'square', 0.08); }
  alarm(): void { this.blip(660, 180, 'square', 0.15); this.blip(660, 180, 'square', 0.15); }
  bell(): void { this.blip(523, 900, 'sine', 0.2, 392); this.blip(1046, 600, 'sine', 0.08); }
  /** 亡鐘鐘響：低沉 196Hz 正弦 1.2s + 392Hz 衰減泛音 */
  toll(): void { this.blip(196, 1200, 'sine', 0.25, 98); this.blip(392, 900, 'sine', 0.12, 196); }
  /** 道具拾取：上行三音 */
  drop(): void { this.blip(660, 80, 'sine', 0.12); this.blip(880, 80, 'sine', 0.12); this.blip(1100, 120, 'sine', 0.10); }
  pickup(): void { this.blip(660, 120, 'sine', 0.15); this.blip(880, 180, 'sine', 0.15); this.blip(1100, 240, 'sine', 0.12); }
  gameover(): void { this.blip(160, 600, 'sawtooth', 0.22, 50); }
  clear(): void { this.blip(523, 150, 'square', 0.15); this.blip(659, 150, 'square', 0.15); this.blip(784, 300, 'square', 0.15); }
}
