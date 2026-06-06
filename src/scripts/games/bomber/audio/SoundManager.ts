// SoundManager.ts
/** 以 Web Audio 合成的簡單 SFX；首次使用者手勢時 ensure() 解鎖 AudioContext。 */
export class SoundManager {
  private ctx: AudioContext | null = null;
  private muted = false;

  ensure(): void {
    if (!this.ctx) {
      const Ctor = (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext);
      this.ctx = new Ctor();
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
  }
  toggle(): boolean { this.muted = !this.muted; return this.muted; }

  private blip(freq: number, durMs: number, type: OscillatorType = 'square', gain = 0.18): void {
    if (this.muted || !this.ctx) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = type; osc.frequency.setValueAtTime(freq, t);
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + durMs / 1000);
    osc.connect(g).connect(this.ctx.destination);
    osc.start(t); osc.stop(t + durMs / 1000);
  }

  place(): void { this.blip(220, 80, 'square'); }
  explode(): void {
    if (this.muted || !this.ctx) return;
    // 噪音爆裂：短促下滑 + 低頻
    this.blip(90, 320, 'sawtooth', 0.25);
    this.blip(50, 380, 'triangle', 0.2);
  }
  pickup(): void { this.blip(660, 90, 'square'); this.blip(990, 90, 'square'); }
  hit(): void { this.blip(140, 260, 'sawtooth', 0.25); }
  descend(): void { this.blip(330, 120, 'triangle'); this.blip(220, 160, 'triangle'); }
  gameover(): void { this.blip(160, 500, 'sawtooth', 0.25); }
}
