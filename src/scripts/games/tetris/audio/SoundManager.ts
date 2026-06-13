/**
 * 以 Web Audio 即時合成的街機 8-bit 音效（無外部音檔）。
 * 因瀏覽器自動播放限制，AudioContext 必須在使用者手勢中 ensure()/resume()。
 */
export class SoundManager {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noiseBuf: AudioBuffer | null = null;
  private sfxVolume = 1;
  enabled = true;

  constructor() {
    if (typeof window !== 'undefined') {
      const w = window as unknown as { __arcadeAudio?: { sfxVolume?: number } };
      this.sfxVolume = w.__arcadeAudio?.sfxVolume ?? 1;
      window.addEventListener('arcade-audio-change', (e) => {
        this.sfxVolume = (e as CustomEvent).detail?.sfxVolume ?? 1;
        if (this.master) this.master.gain.value = 0.22 * this.sfxVolume;
      });
    }
  }

  /** 在使用者手勢內呼叫以建立 / 恢復 AudioContext。 */
  ensure(): void {
    if (!this.ctx) {
      const w = window as unknown as { __arcadeAudio?: { sfxVolume?: number } };
      this.sfxVolume = w.__arcadeAudio?.sfxVolume ?? this.sfxVolume;
      const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.22 * this.sfxVolume;
      this.master.connect(this.ctx.destination);
      const len = Math.floor(this.ctx.sampleRate * 0.5);
      const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      this.noiseBuf = buf;
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
  }

  /** 切換靜音，回傳是否開啟。 */
  toggle(): boolean {
    this.enabled = !this.enabled;
    return this.enabled;
  }

  private get t(): number {
    return this.ctx ? this.ctx.currentTime : 0;
  }

  private blip(freq: number, dur: number, type: OscillatorType, vol: number, glideTo?: number): void {
    if (!this.ctx || !this.master || !this.enabled) return;
    const t = this.t;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (glideTo) o.frequency.exponentialRampToValueAtTime(Math.max(20, glideTo), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.master);
    o.start(t);
    o.stop(t + dur + 0.03);
  }

  private noise(dur: number, vol: number, filterFreq: number, glideFilter?: number): void {
    if (!this.ctx || !this.master || !this.enabled || !this.noiseBuf) return;
    const t = this.t;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    const f = this.ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.setValueAtTime(filterFreq, t);
    if (glideFilter) f.frequency.exponentialRampToValueAtTime(Math.max(60, glideFilter), t + dur);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(this.master);
    src.start(t);
    src.stop(t + dur);
  }

  move(): void {
    this.blip(200, 0.035, 'square', 0.14);
  }
  rotate(): void {
    this.blip(440, 0.06, 'square', 0.28, 520);
  }
  hold(): void {
    this.blip(500, 0.09, 'triangle', 0.28, 720);
  }
  lock(): void {
    this.blip(170, 0.05, 'square', 0.22, 110);
  }
  hardDrop(): void {
    this.noise(0.12, 0.45, 1200, 180);
    this.blip(130, 0.1, 'square', 0.3, 70);
  }
  lineClear(count: number, special: boolean): void {
    const base = 380 + count * 130;
    this.blip(base, 0.18 + count * 0.03, 'sawtooth', 0.34, base * (1.8 + count * 0.2));
    this.noise(0.18, 0.32, 1600, 4200);
    if (special) this.blip(880, 0.26, 'square', 0.3, 1500);
  }
  combo(n: number): void {
    const f = 500 + Math.min(n, 12) * 70;
    this.blip(f, 0.1, 'square', 0.26, f + 220);
  }
  levelUp(): void {
    [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => this.blip(f, 0.12, 'square', 0.28), i * 70));
  }
  topout(): void {
    this.blip(300, 0.6, 'sawtooth', 0.38, 60);
    this.noise(0.5, 0.28, 800, 180);
  }
  /** 送出攻擊：上升嘯聲（量越大越高）。 */
  attack(amount: number): void {
    const f = 300 + Math.min(amount, 10) * 90;
    this.blip(f, 0.16, 'sawtooth', 0.3, f * 2.2);
  }
  /** 被注入垃圾：低沉撞擊。 */
  garbageIn(amount: number): void {
    this.noise(0.16, 0.34, 700, 140);
    this.blip(110, 0.14, 'square', 0.3, 70);
    void amount;
  }
}
