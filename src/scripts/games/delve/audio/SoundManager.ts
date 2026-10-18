// SoundManager.ts — DELVE 的 Web Audio 合成音效（不載入音檔）。首次使用者手勢時 ensure() 解鎖 AudioContext。
// 音量跟著遊戲廳共用的 window.__arcadeAudio.sfxVolume，並監聽 arcade-audio-change 即時更新（同其他遊戲）。
import { LIVE } from '../render/live';

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

  private dead = false;

  constructor() {
    LIVE.sounds++;
    if (typeof window !== 'undefined') {
      const w = window as unknown as { __arcadeAudio?: { sfxVolume?: number } };
      this.sfxVolume = w.__arcadeAudio?.sfxVolume ?? 1;
      window.addEventListener('arcade-audio-change', this.onChange);
    }
  }

  ensure(): void {
    if (this.dead) return;
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
  // ── 釣魚 ──
  /** 拋竿：甩竿的風聲 + 捲線器嗶嗶聲 */
  cast(): void { this.noise(0, 0.14, 2200, 700, 0.05, 1.2); for (let k = 0; k < 4; k++) this.tone(1600 + k * 60, 0.05 + k * 0.03, 0.03, 'square', 0.015); }
  /** 浮標落水：小小的噗通 */
  plop(lava = false): void { this.tone(lava ? 160 : 420, 0, 0.12, 'sine', 0.07, lava ? 90 : 180); }
  /** 上鉤：兩聲急促的高音（提醒趕快按） */
  bite(): void { this.tone(988, 0, 0.07, 'square', 0.05); this.tone(1318.51, 0.09, 0.09, 'square', 0.05); }
  /** 釣到：水花 + 上行三音；稀有 / 傳說再加鈴聲 */
  catchFish(rare: boolean): void {
    this.noise(0, 0.12, 2400, 900, 0.06, 1.6);
    [659.25, 783.99, 1046.5].forEach((f, i) => this.tone(f, 0.05 + i * 0.07, 0.22, 'triangle', 0.1));
    if (rare) this.tone(2093, 0.3, 0.6, 'sine', 0.05);
  }
  /** 收竿 / 魚跑了：下滑的捲線聲 */
  reel(miss: boolean): void { this.tone(miss ? 520 : 760, 0, 0.18, 'square', 0.025, miss ? 260 : 520); }
  // ── 攀爬（輕柔：每次換手一聲繩子的沙沙 + 很小的木頭聲；兩手音高略不同） ──
  private gripAlt = false;
  climbGrip(): void {
    this.gripAlt = !this.gripAlt;
    this.noise(0, 0.07, this.gripAlt ? 1500 : 1250, 700, 0.028, 1.4);
    this.tone(this.gripAlt ? 196 : 174.61, 0, 0.05, 'triangle', 0.018, 150);
  }
  /** 抓住繩索：一聲輕拍 */
  climbGrab(): void { this.noise(0, 0.06, 900, 500, 0.05, 1.1); }
  /** 攀上邊緣：使力的悶響 + 布料摩擦；站穩時一聲小腳步 */
  mantle(): void { this.noise(0, 0.16, 700, 260, 0.06, 0.9); this.tone(130.81, 0.02, 0.12, 'triangle', 0.03, 98); }
  mantleTop(): void { this.noise(0, 0.05, 1100, 500, 0.045, 1.6); }
  /** 吃東西：兩下咀嚼 */
  munch(): void { this.noise(0, 0.05, 900, 400, 0.06, 2); this.noise(0.12, 0.05, 900, 400, 0.06, 2); }

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

  // ── 液體 ───────────────────────────────────────────────
  private lastLiquid = 0;
  /** 節流：同一類液體音效最短間隔（秒），洪水時不會吵成一片 */
  private gate(min: number): boolean {
    const now = this.ctx?.currentTime ?? 0;
    if (now - this.lastLiquid < min) return false;
    this.lastLiquid = now;
    return true;
  }
  /** 濺水：低通噪音的「噗通」+ 往下滑的水滴音；big = 跳進去 */
  splash(big: boolean, lava = false): void {
    if (!this.gate(0.08)) return;
    this.noise(0, big ? 0.35 : 0.2, lava ? 500 : 1300, lava ? 120 : 260, big ? 0.2 : 0.12, 0.8);
    if (!lava) { this.tone(big ? 520 : 760, 0.02, 0.12, 'sine', 0.05, big ? 180 : 300); this.tone(980, 0.09, 0.06, 'sine', 0.03, 620); }
  }
  /** 熔岩碰水：嘶嘶的高頻噪音（蒸氣）+ 低沉的凝固聲 */
  sizzle(): void {
    if (!this.gate(0.12)) return;
    this.noise(0, 0.45, 5200, 2600, 0.1, 0.6);
    this.tone(110, 0.05, 0.25, 'triangle', 0.07, 70);
  }
  /** 水下少一顆泡泡：短促上揚的「啵」 */
  bubble(): void { this.tone(420, 0, 0.07, 'sine', 0.05, 900); }
  /** 溺水受傷：悶住的低音 + 咕嚕 */
  drown(): void {
    this.tone(130, 0, 0.22, 'sine', 0.13, 70);
    this.tone(300, 0.06, 0.08, 'sine', 0.05, 520);
    this.tone(260, 0.15, 0.08, 'sine', 0.04, 480);
  }
  /** 燒傷：短的噼啪 */
  burn(): void { this.noise(0, 0.08, 2600, 900, 0.07, 1.4); }

  // ── 天氣 / 睡覺 ───────────────────────────────────────
  /**
   * 雷聲：近的先一聲高頻劈啪再接低沉的滾雷，遠的只有延遲後的悶雷（距離 dist 格 → 延遲、音量、濾波越低）。
   * 噪音緩衝循環播放，經低通濾波由高滑到低。
   */
  thunder(dist: number): void {
    if (this.muted || !this.ctx) return;
    const ctx = this.ctx;
    this.noise(0, 0.01, 100, 100, 0.0001); // 確保噪音緩衝已建立
    if (!this.noiseBuf) return;
    const near = Math.max(0, 1 - dist / 48);
    const delay = Math.min(1.4, dist * 0.028);
    if (near > 0.6) this.noise(delay, 0.18, 5200, 1400, 0.22 * near, 0.7);
    const t = ctx.currentTime + delay + 0.04;
    const dur = 1.8 + (1 - near) * 1.2;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf; src.loop = true;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass'; lp.Q.value = 0.9;
    lp.frequency.setValueAtTime(260 + near * 900, t);
    lp.frequency.exponentialRampToValueAtTime(55, t + dur);
    const g = ctx.createGain();
    const peak = 0.12 + 0.3 * near;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + 0.06);
    g.gain.exponentialRampToValueAtTime(peak * 0.45, t + dur * 0.35);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(lp).connect(g).connect(this.master ?? ctx.destination);
    src.start(t, Math.random() * 0.4); src.stop(t + dur + 0.05);
  }
  /** 躺下睡覺：三個下行的柔和音 */
  sleep(): void { [523.25, 440, 349.23].forEach((f, i) => this.tone(f, i * 0.28, 0.7, 'sine', 0.07)); }
  /** 天亮醒來：輕快上行 + 鳥叫似的高音 */
  wake(): void {
    [392, 523.25, 659.25].forEach((f, i) => this.tone(f, i * 0.1, 0.35, 'triangle', 0.08));
    this.tone(2600, 0.42, 0.08, 'sine', 0.03, 3200); this.tone(2800, 0.55, 0.08, 'sine', 0.03, 3400);
  }

  // ── 標題選單（輕、短，不搶畫面） ──
  /** 選單移動：一聲很短的木頭敲擊 */
  uiMove(): void { this.tone(660, 0, 0.045, 'square', 0.025); this.tone(990, 0.012, 0.03, 'triangle', 0.02); }
  /** 確認：兩音上行 */
  uiConfirm(): void { this.tone(523.25, 0, 0.09, 'square', 0.035); this.tone(783.99, 0.07, 0.16, 'triangle', 0.05); }
  /** 返回 / 關閉面板：兩音下行 */
  uiBack(): void { this.tone(587.33, 0, 0.07, 'triangle', 0.04); this.tone(392, 0.06, 0.12, 'triangle', 0.035); }
  /** 擲骰子：三下快速的喀噠 */
  uiDice(): void { [0, 0.05, 0.11].forEach((t, i) => this.tone(1200 - i * 180, t, 0.03, 'square', 0.025)); }
  /** 轉場開始：往下沉的掃頻（鑽進地底） */
  uiDelve(): void { this.tone(330, 0, 0.5, 'triangle', 0.06, 110); this.tone(880, 0.02, 0.2, 'sine', 0.025, 440); }

  // ── 裝備詞條 ───────────────────────────────────────────
  /** 史詩以上的裝備落地：鐘聲和弦（傳說多一段琶音；神話再加高音閃爍） */
  lootDrop(rarity: number): void {
    if (rarity < 3) return;
    const chord = rarity >= 5 ? [523.25, 659.25, 783.99, 1046.5, 1318.51, 1567.98] : rarity >= 4 ? [440, 554.37, 659.25, 880, 1108.73] : [392, 493.88, 587.33];
    chord.forEach((f, i) => this.tone(f, i * 0.06, 1.1, 'triangle', 0.06));
    this.tone(chord[chord.length - 1] * 2, chord.length * 0.06, 1.4, 'sine', 0.03);
    if (rarity >= 4) this.noise(0.02, 0.5, 7000, 3500, 0.02, 2);
    if (rarity >= 5) [2637, 3136, 3520, 4186].forEach((f, i) => this.tone(f, 0.45 + i * 0.05, 0.12, 'square', 0.012));
  }
  /** 撿起裝備：普通 / 優良 = 一般撿拾；稀有兩音；史詩以上一串亮音 */
  lootPickup(rarity: number): void {
    if (rarity <= 1) { this.pickup(); return; }
    if (rarity === 2) { this.tone(987.77, 0, 0.1, 'square', 0.04); this.tone(1318.51, 0.07, 0.16, 'square', 0.04); return; }
    const up = rarity >= 4 ? [1046.5, 1318.51, 1567.98, 2093] : [880, 1108.73, 1318.51];
    up.forEach((f, i) => this.tone(f, i * 0.05, 0.22, 'square', 0.035));
    this.tone(up[up.length - 1], up.length * 0.05, 0.6, 'sine', 0.04);
  }
  /** 分解：碎裂 + 低沉的兩聲 */
  salvage(): void {
    this.noise(0, 0.16, 2400, 500, 0.12, 1.4);
    this.noise(0.08, 0.2, 1200, 200, 0.08, 1);
    this.tone(220, 0.02, 0.18, 'square', 0.04, 110);
    this.tone(1760, 0.12, 0.25, 'sine', 0.03, 2640);
  }
  /** 鍛造：強化 = 打鐵兩聲、洗煉 = 上滑的光、升階 = 號角 */
  forge(action: 'reroll' | 'upgrade' | 'ascend'): void {
    if (action === 'upgrade') {
      for (const t of [0, 0.16]) { this.tone(1244.51, t, 0.25, 'square', 0.05); this.tone(1864.66, t, 0.18, 'triangle', 0.04); this.noise(t, 0.08, 5000, 2000, 0.08, 3); }
    } else if (action === 'reroll') {
      this.tone(440, 0, 0.45, 'sine', 0.07, 1760);
      [1318.51, 1567.98, 1975.53].forEach((f, i) => this.tone(f, 0.25 + i * 0.05, 0.2, 'triangle', 0.035));
    } else {
      [392, 523.25, 659.25, 783.99].forEach((f, i) => this.tone(f, i * 0.09, 0.5, 'square', 0.04));
      this.tone(1567.98, 0.36, 0.9, 'triangle', 0.06);
    }
  }
  /** 連鎖閃電：高頻劈啪 + 往下的電弧 */
  zap(): void { this.noise(0, 0.12, 6000, 1800, 0.08, 2.5); this.tone(1800, 0, 0.12, 'sawtooth', 0.03, 300); }
  /** 不滅：低沉鐘聲 + 上升 */
  undying(): void { this.tone(130.81, 0, 1.1, 'triangle', 0.14); this.tone(261.63, 0.05, 0.9, 'sine', 0.08, 523.25); this.tone(1046.5, 0.3, 0.8, 'sine', 0.04); }
  /** 空中再跳：一陣輕風 */
  airJump(): void { this.noise(0, 0.12, 2600, 900, 0.06, 1.6); }
  /** 圖鑑收錄新詞條 */
  codex(): void { this.tone(1174.66, 0, 0.18, 'triangle', 0.05); this.tone(1567.98, 0.09, 0.3, 'triangle', 0.05); }

  destroy(): void {
    if (this.dead) return;
    this.dead = true;
    LIVE.sounds--;
    if (typeof window !== 'undefined') window.removeEventListener('arcade-audio-change', this.onChange);
    void this.ctx?.close?.();
    this.ctx = null; this.master = null;
  }
}
