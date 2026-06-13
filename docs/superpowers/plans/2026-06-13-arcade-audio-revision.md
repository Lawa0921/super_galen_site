# Arcade Audio — Revision R1（開關 → 雙 slider 音量面板 + 音效接線 + 修音量 bug）

> 範圍：只 /games 與三款遊戲頁。把原本的 on/off 開關改成「音樂 + 音效」雙 slider 音量面板，
> 接進三款遊戲的 Web Audio 音效，並修掉「開了沒聲音」的 RAF 負音量 bug。
> 不改檔名（沿用 `ArcadeBgm.astro` 與 4 頁的 `<ArcadeBgm track=…/>`，零頁面改動）。

## 共用契約（所有消費端依此）
- localStorage：`arcade-music-vol`、`arcade-sfx-vol`（字串 "0".."1"）。預設：music **0.4**、sfx **0.6**。
- 全域：`window.__arcadeAudio = { musicVolume:number(0-1), sfxVolume:number(0-1) }`，面板於 init 與每次變更時更新。
- 事件：面板於 init 與每次變更 `window.dispatchEvent(new CustomEvent('arcade-audio-change', { detail:{ musicVolume, sfxVolume } }))`。
- 音樂音量：`audio.volume = clamp01(musicVolume)`（**直接設、clamp**，不得用會 throw 的 RAF 淡入）。
- 音效音量：各遊戲 `SoundManager` 輸出 master gain = `BASE * sfxVolume`（tetris BASE 0.22；bomber/witchrun BASE 1.0）。

---

## Part A — 重建 `src/components/ArcadeBgm.astro`（整檔覆蓋成以下內容）

```astro
---
interface Props { track: string; }
const { track } = Astro.props;
---
<div class="arcade-bgm" data-open="false">
  <button class="arcade-bgm-toggle" type="button" aria-label="音訊設定 Audio settings" aria-expanded="false">
    <span class="arcade-bgm-icon" aria-hidden="true">🔊</span>
  </button>
  <div class="arcade-bgm-panel" role="group" aria-label="音量控制 Volume" hidden>
    <label class="arcade-bgm-row">
      <span class="arcade-bgm-label">🎵 音樂</span>
      <input class="arcade-bgm-slider" data-audio="music" type="range" min="0" max="100" step="1" aria-label="音樂音量 Music volume" />
    </label>
    <label class="arcade-bgm-row">
      <span class="arcade-bgm-label">🔊 音效</span>
      <input class="arcade-bgm-slider" data-audio="sfx" type="range" min="0" max="100" step="1" aria-label="音效音量 SFX volume" />
    </label>
  </div>
  <audio class="arcade-bgm-audio" loop preload="none" src={track}></audio>
</div>

<style>
  .arcade-bgm { position: fixed; right: 18px; bottom: 18px; z-index: 9000; display: flex; flex-direction: column; align-items: flex-end; gap: 10px; }
  .arcade-bgm-toggle {
    width: 46px; height: 46px; border-radius: 50%;
    border: 1px solid #36e6ff; background: rgba(8, 14, 22, 0.72);
    color: #36e6ff; cursor: pointer; display: grid; place-items: center;
    font-size: 18px; line-height: 1; opacity: 0.6;
    transition: opacity 0.2s ease, box-shadow 0.2s ease, background 0.2s ease;
  }
  .arcade-bgm-toggle:hover { opacity: 1; }
  .arcade-bgm[data-open="true"] .arcade-bgm-toggle {
    opacity: 1; background: rgba(54, 230, 255, 0.16); box-shadow: 0 0 14px rgba(54, 230, 255, 0.55);
  }
  .arcade-bgm-toggle:focus-visible { outline: 2px solid #36e6ff; outline-offset: 3px; }
  .arcade-bgm-panel {
    order: -1; display: flex; flex-direction: column; gap: 12px;
    padding: 14px 16px; min-width: 190px;
    border: 1px solid rgba(54, 230, 255, 0.5); border-radius: 10px;
    background: rgba(8, 14, 22, 0.92); backdrop-filter: blur(6px);
    box-shadow: 0 0 18px rgba(54, 230, 255, 0.25);
  }
  .arcade-bgm-panel[hidden] { display: none; }
  .arcade-bgm-row { display: flex; flex-direction: column; gap: 6px; }
  .arcade-bgm-label { font-size: 12px; letter-spacing: 0.08em; color: #cdefff; }
  .arcade-bgm-slider { width: 100%; accent-color: #36e6ff; cursor: pointer; }
  .arcade-bgm-slider:focus-visible { outline: 2px solid #36e6ff; outline-offset: 2px; }
</style>

<script>
  const MUSIC_KEY = 'arcade-music-vol';
  const SFX_KEY = 'arcade-sfx-vol';
  const DEF_MUSIC = 0.4, DEF_SFX = 0.6;
  const clamp01 = (n: number) => Math.max(0, Math.min(1, n));

  function readVol(key: string, def: number): number {
    try { const v = parseFloat(localStorage.getItem(key) ?? ''); return Number.isFinite(v) ? clamp01(v) : def; }
    catch { return def; }
  }
  function writeVol(key: string, v: number) { try { localStorage.setItem(key, String(clamp01(v))); } catch {} }

  function initArcadeAudio() {
    const root = document.querySelector('.arcade-bgm');
    if (!root) return;
    const btn = root.querySelector('.arcade-bgm-toggle') as HTMLButtonElement;
    const panel = root.querySelector('.arcade-bgm-panel') as HTMLElement;
    const audio = root.querySelector('.arcade-bgm-audio') as HTMLAudioElement;
    const icon = root.querySelector('.arcade-bgm-icon') as HTMLElement;
    const musicSlider = root.querySelector('input[data-audio="music"]') as HTMLInputElement;
    const sfxSlider = root.querySelector('input[data-audio="sfx"]') as HTMLInputElement;

    let musicVolume = readVol(MUSIC_KEY, DEF_MUSIC);
    let sfxVolume = readVol(SFX_KEY, DEF_SFX);
    let gestured = false;

    function publish() {
      (window as unknown as { __arcadeAudio?: object }).__arcadeAudio = { musicVolume, sfxVolume };
      window.dispatchEvent(new CustomEvent('arcade-audio-change', { detail: { musicVolume, sfxVolume } }));
    }

    function applyMusic() {
      audio.volume = clamp01(musicVolume);
      if (musicVolume > 0 && gestured && audio.paused) {
        const p = audio.play(); if (p && p.catch) p.catch(() => {});
      } else if (musicVolume === 0 && !audio.paused) {
        audio.pause();
      }
      icon.textContent = musicVolume > 0 ? '🔊' : '🔇';
    }

    // 初始 UI 狀態
    musicSlider.value = String(Math.round(musicVolume * 100));
    sfxSlider.value = String(Math.round(sfxVolume * 100));
    audio.volume = clamp01(musicVolume);
    icon.textContent = musicVolume > 0 ? '🔊' : '🔇';
    publish();

    // 面板開關
    function setOpen(o: boolean) {
      root.setAttribute('data-open', String(o));
      btn.setAttribute('aria-expanded', String(o));
      if (o) panel.removeAttribute('hidden'); else panel.setAttribute('hidden', '');
    }
    btn.addEventListener('click', () => setOpen(root.getAttribute('data-open') !== 'true'));
    document.addEventListener('click', (e) => { if (!root.contains(e.target as Node)) setOpen(false); });

    // slider 變更（直接設音量、clamp、持久化、廣播）
    musicSlider.addEventListener('input', () => {
      musicVolume = clamp01(parseInt(musicSlider.value, 10) / 100);
      writeVol(MUSIC_KEY, musicVolume); applyMusic(); publish();
    });
    sfxSlider.addEventListener('input', () => {
      sfxVolume = clamp01(parseInt(sfxSlider.value, 10) / 100);
      writeVol(SFX_KEY, sfxVolume); publish();
    });

    // 首次互動解鎖自動播放（瀏覽器政策）
    function onFirstGesture() { gestured = true; applyMusic(); }
    window.addEventListener('pointerdown', onFirstGesture, { once: true });
    window.addEventListener('keydown', onFirstGesture, { once: true });

    // 嘗試立即播（網域已有自動播放權限時）
    applyMusic();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initArcadeAudio);
  else initArcadeAudio();
</script>
```

---

## Part B — 三款遊戲 `SoundManager` 接 sfxVolume

通用：讀 `window.__arcadeAudio?.sfxVolume ?? 1`；在 constructor 訂閱 `arcade-audio-change` 更新；master gain = `BASE * sfxVolume`。

### B1. `src/scripts/games/tetris/audio/SoundManager.ts`（已有 master，BASE 0.22）
- 新增私有欄位 `private sfxVolume = 1;`
- constructor（若無則新增）訂閱：
  ```ts
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
  ```
- `ensure()` 內，將 `this.master.gain.value = 0.22;` 改為 `this.master.gain.value = 0.22 * this.sfxVolume;`（並於 ensure 開頭再讀一次 `this.sfxVolume = w.__arcadeAudio?.sfxVolume ?? this.sfxVolume;` 以防面板較晚 init）。

### B2. `src/scripts/games/bomber/audio/SoundManager.ts`（無 master，BASE 1.0）
- 新增 `private master: GainNode | null = null; private sfxVolume = 1;`
- constructor 同 B1 訂閱（master 存在時 `this.master.gain.value = 1.0 * this.sfxVolume`；其餘 0.22 改成 1.0）。
- `ensure()` 內建立 master：
  ```ts
  this.master = this.ctx.createGain();
  this.master.gain.value = this.sfxVolume; // BASE 1.0
  this.master.connect(this.ctx.destination);
  ```
  （ensure 開頭先讀 `this.sfxVolume = w.__arcadeAudio?.sfxVolume ?? this.sfxVolume;`）
- `blip()` 內 `osc.connect(g).connect(this.ctx.destination)` 改成 `osc.connect(g).connect(this.master ?? this.ctx.destination)`。

### B3. `src/scripts/games/witchrun/audio/SoundManager.ts`（無 master，BASE 1.0）
- 與 B2 完全相同做法（master + sfxVolume + blip 改接 master + constructor 訂閱）。

> 效果：slider=100% 時各遊戲音量＝原本行為（tetris 0.22 / bomber、witchrun 原樣）；預設 60%。slider=0 → 全靜音。

---

## Part C — 測試更新 `tests/e2e/games-bgm.spec.ts`（整檔改寫）

`describe('Dungeon Arcade Audio')`，beforeEach 清掉 `arcade-music-vol`/`arcade-sfx-vol` 再 goto `/games`，`domcontentloaded`：

1. **面板鈕預設可見、面板預設收合**：`.arcade-bgm-toggle` visible；`.arcade-bgm-panel` 有 `hidden`。
2. **點鈕開面板、有兩條 slider**：click 後 `.arcade-bgm-panel` 不再 hidden；`input[data-audio="music"]` 與 `input[data-audio="sfx"]` 皆 visible。
3. **音樂 slider → 音量生效 + 持久化 + 全域**（bug 迴歸）：
   - 先 `await page.locator('.arcade-bgm-toggle').click()`（這也是 gesture）。
   - 設 music slider 值 80（用 `fill('80')` 或 evaluate 設 value 後 `dispatchEvent(new Event('input'))`）。
   - 斷言 `localStorage['arcade-music-vol']` 解析後 ≈ 0.8；`window.__arcadeAudio.musicVolume` ≈ 0.8。
   - `expect.poll` 等 `.arcade-bgm-audio` 的 `paused===false` 且 `volume` 介於 0.7–0.9（**證明音量沒卡在 0**）。
4. **音樂 slider=0 → 暫停/靜音**：設 0、input 事件；`audio.paused===true` 或 `volume===0`。
5. **音效 slider → 持久化 + 全域 + 事件**：設 sfx slider 70；`localStorage['arcade-sfx-vol']`≈0.7；`window.__arcadeAudio.sfxVolume`≈0.7。可用 `page.evaluate` 預掛一個 `arcade-audio-change` listener 記錄最後 detail，斷言收到 sfxVolume≈0.7。
6. **持久化跨 reload**：設 music 80→reload→開面板→music slider value≈80。
7. **音檔可載入**：保留原本 200 + content-type + `body.length>100000`。
8. **三款遊戲頁**（tetris/bomber/witchrun）：面板鈕 visible、`.arcade-bgm-audio` src 含對應 `/<name>.mp3`。

> slider 在 Playwright 設值：`const s = page.locator('input[data-audio="music"]'); await s.fill('80');`（range input fill 會觸發 input 事件）；若某瀏覽器 fill 不觸發，改 `await s.evaluate((el,v)=>{el.value=v; el.dispatchEvent(new Event('input',{bubbles:true}));}, '80')`。

---

## 驗收（介面驗證，由控制端 Playwright 執行）
- /games 右下角喇叭鈕 → 開面板見兩 slider。
- 拉音樂 slider，`audio.volume` 跟著變且 `paused=false`、`currentTime` 前進（有聲，非卡 0）。
- 拉音效 slider，`window.__arcadeAudio.sfxVolume` 更新、`arcade-audio-change` 派發。
- reload 後 slider 記住值。
- 進某遊戲頁觸發音效（ensure 後），其 SoundManager master gain ≈ BASE×sfxVolume（可於 verify 時注入讀取）。
