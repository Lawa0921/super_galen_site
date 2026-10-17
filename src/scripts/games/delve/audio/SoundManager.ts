// SoundManager.ts — DELVE 的 Web Audio 合成音效（不載入音檔）。首次使用者手勢時 ensure() 解鎖 AudioContext。
// 音量跟著遊戲廳共用的 window.__arcadeAudio.sfxVolume，並監聽 arcade-audio-change 即時更新（同其他遊戲）。
const BASE = 0.6;

export class SoundManager {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private muted = false;
  private sfxVolume = 1;
  private readonly onChange = (e: Event): void => {
    this.sfxVolume = (e as CustomEvent).detail?.sfxVolume ?? 1;
    if (this.master) this.master.gain.value = BASE * this.sfxVolume;
  };

  constructor() {
    if (typeof window !== 'undefined') {
      const w = window as unknown as { __arcadeAudio?: { sfxVolume?: number } };
      this.sfxVolume = w.__arcadeAudio?.sfxVolume ?? 1;
      window.addEventListener('arcade-audio-change', this.onChange);
    }
  }

  ensure(): void {
    if (!this.ctx) {
      const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      const w = window as unknown as { __arcadeAudio?: { sfxVolume?: number } };
      this.sfxVolume = w.__arcadeAudio?.sfxVolume ?? this.sfxVolume;
      this.master = this.ctx.createGain();
      this.master.gain.value = BASE * this.sfxVolume;
      this.master.connect(this.ctx.destination);
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
  }
  toggle(): boolean { this.muted = !this.muted; return this.muted; }
  get isMuted(): boolean { return this.muted; }

  /** 單音：freq Hz、從 at 秒後開始、dur 秒、指數衰減 */
  private tone(freq: number, at: number, dur: number, type: OscillatorType = 'triangle', gain = 0.16, slideTo?: number): void {
    if (this.muted || !this.ctx) return;
    const t = this.ctx.currentTime + at;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g).connect(this.master ?? this.ctx.destination);
    osc.start(t); osc.stop(t + dur + 0.03);
  }

  /** 發現新地區：上行琶音（C5 E5 G5 C6）+ 尾端高八度的鈴聲 */
  discover(): void {
    [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => this.tone(f, i * 0.09, 0.5, 'triangle', 0.14));
    this.tone(2093, 0.36, 0.7, 'sine', 0.05);
  }
  /** 讀古碑：兩個低沉的石頭聲 */
  lore(first: boolean): void {
    this.tone(196, 0, 0.5, 'triangle', 0.12);
    this.tone(293.66, 0.14, 0.6, 'triangle', 0.1);
    if (first) this.tone(587.33, 0.3, 0.8, 'sine', 0.05);
  }
  /** 拿到珍寶：閃亮的五聲音階下行 */
  treasure(): void {
    [1567.98, 1318.51, 1174.66, 1046.5, 1318.51].forEach((f, i) => this.tone(f, i * 0.06, 0.35, 'square', 0.04));
  }
  /** 傳送石：引導（上滑）/ 完成（亮音）/ 取消（下滑） */
  recall(phase: 'start' | 'cancel' | 'done'): void {
    if (phase === 'start') this.tone(220, 0, 1.2, 'sine', 0.08, 880);
    else if (phase === 'done') { this.tone(1318.51, 0, 0.4, 'triangle', 0.1); this.tone(1975.53, 0.05, 0.5, 'sine', 0.05); }
    else this.tone(440, 0, 0.25, 'sine', 0.06, 180);
  }
  /** 設定重生點：溫和的兩音 */
  spawn(): void { this.tone(392, 0, 0.3, 'triangle', 0.1); this.tone(523.25, 0.12, 0.45, 'triangle', 0.1); }
  /** 放繩索 / 敲碎裂紋石 */
  tick(): void { this.tone(880, 0, 0.05, 'square', 0.03); }
  crumble(): void { this.tone(140, 0, 0.18, 'sawtooth', 0.08, 60); }

  // ── 戰鬥 ───────────────────────────────────────────────
  private noiseBuf: AudioBuffer | null = null;
  private lastPickup = 0;
  /** 短促噪音（打擊 / 揮風），經帶通濾波；freq 由 f0 滑到 f1 */
  private noise(at: number, dur: number, f0: number, f1: number, gain = 0.2, q = 1.2): void {
    if (this.muted || !this.ctx) return;
    const ctx = this.ctx;
    if (!this.noiseBuf) {
      this.noiseBuf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 0.5), ctx.sampleRate);
      const d = this.noiseBuf.getChannelData(0);
      let s = 1234567;
      for (let i = 0; i < d.length; i++) { s = (s * 16807) % 2147483647; d[i] = (s / 2147483647) * 2 - 1; }
    }
    const t = ctx.currentTime + at;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass'; bp.Q.value = q;
    bp.frequency.setValueAtTime(f0, t);
    bp.frequency.exponentialRampToValueAtTime(Math.max(40, f1), t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(bp).connect(g).connect(this.master ?? ctx.destination);
    src.start(t); src.stop(t + dur + 0.02);
  }
  /** 揮劍 / 刺矛：一陣由高往低的風聲 */
  swing(heavy = false): void { this.noise(0, heavy ? 0.22 : 0.14, heavy ? 1400 : 2400, heavy ? 300 : 600, 0.12, 0.9); }
  /** 拉弓放箭：弦的低音 + 短風聲 */
  bow(): void { this.tone(180, 0, 0.12, 'triangle', 0.12, 90); this.noise(0.01, 0.1, 3000, 1200, 0.06); }
  /** 投擲 / 迴旋 */
  throwSfx(): void { this.noise(0, 0.12, 1800, 900, 0.08, 2); }
  /** 法術：上滑的亮音 + 高頻閃爍 */
  magic(): void { this.tone(520, 0, 0.22, 'sine', 0.08, 1320); this.tone(1760, 0.04, 0.12, 'square', 0.025); }
  /** 打中怪物（暴擊更亮） */
  enemyHit(crit: boolean): void {
    this.noise(0, 0.07, 900, 300, 0.22, 1.5);
    this.tone(crit ? 660 : 220, 0, 0.08, 'square', crit ? 0.07 : 0.05, crit ? 330 : 110);
  }
  /** 怪物死亡：下滑的悶響 + 噗 */
  enemyDeath(): void { this.tone(300, 0, 0.25, 'triangle', 0.12, 70); this.noise(0.02, 0.2, 600, 120, 0.15); }
  /** 玩家受傷：低沉的兩下 */
  hurt(): void { this.tone(160, 0, 0.16, 'sawtooth', 0.12, 80); this.noise(0, 0.12, 500, 200, 0.14); }
  /** 玩家倒下：長的下行 */
  death(): void { [392, 330, 262, 196].forEach((f, i) => this.tone(f, i * 0.16, 0.4, 'triangle', 0.1)); }
  /** 撿東西：短促上揚（節流） */
  pickup(): void {
    const now = this.ctx?.currentTime ?? 0;
    if (now - this.lastPickup < 0.06) return;
    this.lastPickup = now;
    this.tone(880, 0, 0.06, 'square', 0.035, 1320);
  }
  /** 喝藥 / 生命上限提升 */
  heal(): void { [523.25, 659.25, 783.99].forEach((f, i) => this.tone(f, i * 0.05, 0.25, 'sine', 0.08)); }
  /** 首領咆哮：低頻鋸齒波 + 濾波噪音的長吼 */
  roar(): void {
    this.tone(70, 0, 1.2, 'sawtooth', 0.18, 45);
    this.tone(105, 0.05, 1.0, 'sawtooth', 0.1, 60);
    this.noise(0, 1.1, 400, 90, 0.2, 0.7);
  }
  /** 首領擊敗：凱旋琶音 */
  victory(): void { [523.25, 659.25, 783.99, 1046.5, 1318.51].forEach((f, i) => this.tone(f, i * 0.12, 0.6, 'triangle', 0.12)); }
  /** 怪物射擊（刺 / 火球） */
  enemyShot(fire: boolean): void { if (fire) this.noise(0, 0.25, 700, 200, 0.08, 0.8); else this.tone(1200, 0, 0.06, 'square', 0.03, 600); }

  destroy(): void {
    if (typeof window !== 'undefined') window.removeEventListener('arcade-audio-change', this.onChange);
    void this.ctx?.close?.();
    this.ctx = null; this.master = null;
  }
}
