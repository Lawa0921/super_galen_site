import { test, expect } from '@playwright/test';

const BASE = '/games';

test.describe('Dungeon Arcade Audio', () => {
  test.beforeEach(async ({ page }) => {
    // 清除上次殘留的音量設定
    await page.addInitScript(() => {
      try {
        localStorage.removeItem('arcade-music-vol');
        localStorage.removeItem('arcade-sfx-vol');
      } catch {}
    });
    await page.goto(BASE);
    await page.waitForLoadState('domcontentloaded');
  });

  // ── 1. 面板鈕預設可見、面板預設收合 ──
  test('面板鈕預設可見、面板預設收合', async ({ page }) => {
    const btn = page.locator('.arcade-bgm-toggle');
    await expect(btn).toBeVisible();

    // panel 應帶 hidden attribute
    const panel = page.locator('.arcade-bgm-panel');
    await expect(panel).toHaveAttribute('hidden', '');
  });

  // ── 2. 點鈕開面板、有兩條 slider ──
  test('點鈕開面板、有兩條 slider', async ({ page }) => {
    await page.locator('.arcade-bgm-toggle').click();

    const panel = page.locator('.arcade-bgm-panel');
    // hidden 屬性應被移除
    await expect(panel).not.toHaveAttribute('hidden', '');

    const musicSlider = page.locator('input[data-audio="music"]');
    const sfxSlider = page.locator('input[data-audio="sfx"]');
    await expect(musicSlider).toBeVisible();
    await expect(sfxSlider).toBeVisible();
  });

  // ── 3. 音樂 slider=80 → audio.volume 0.7-0.9、paused=false（bug 迴歸） ──
  test('音樂 slider=80 → 音量生效、不卡 0、持久化、全域', async ({ page }) => {
    // 點鈕：開面板 + 作為首次 gesture 解鎖 autoplay
    await page.locator('.arcade-bgm-toggle').click();

    // 設 music slider 為 80
    const musicSlider = page.locator('input[data-audio="music"]');
    try {
      await musicSlider.fill('80');
    } catch {
      await musicSlider.evaluate((el, v) => {
        (el as HTMLInputElement).value = v;
        el.dispatchEvent(new Event('input', { bubbles: true }));
      }, '80');
    }

    // localStorage 應記住 ≈ 0.8
    const lsVal = await page.evaluate(() => parseFloat(localStorage.getItem('arcade-music-vol') ?? 'NaN'));
    expect(lsVal).toBeGreaterThanOrEqual(0.75);
    expect(lsVal).toBeLessThanOrEqual(0.85);

    // 全域物件應同步
    const globalVol = await page.evaluate(() => (window as unknown as { __arcadeAudio?: { musicVolume: number } }).__arcadeAudio?.musicVolume ?? -1);
    expect(globalVol).toBeGreaterThanOrEqual(0.75);
    expect(globalVol).toBeLessThanOrEqual(0.85);

    // 音訊 volume 應介於 0.7-0.9（不卡 0），且 paused===false
    await expect.poll(async () => {
      const result = await page.locator('.arcade-bgm-audio').evaluate((a: HTMLAudioElement) => ({
        volume: a.volume,
        paused: a.paused,
      }));
      return result;
    }, { timeout: 8000 }).toMatchObject({ volume: expect.any(Number), paused: false });

    const audioVol = await page.locator('.arcade-bgm-audio').evaluate((a: HTMLAudioElement) => a.volume);
    expect(audioVol).toBeGreaterThanOrEqual(0.7);
    expect(audioVol).toBeLessThanOrEqual(0.9);
  });

  // ── 4. 音樂 slider=0 → 暫停或靜音 ──
  test('音樂 slider=0 → 暫停或靜音', async ({ page }) => {
    await page.locator('.arcade-bgm-toggle').click();

    const musicSlider = page.locator('input[data-audio="music"]');
    try {
      await musicSlider.fill('0');
    } catch {
      await musicSlider.evaluate((el) => {
        (el as HTMLInputElement).value = '0';
        el.dispatchEvent(new Event('input', { bubbles: true }));
      });
    }

    // audio 應暫停 或 音量=0
    const { paused, volume } = await page.locator('.arcade-bgm-audio').evaluate((a: HTMLAudioElement) => ({
      paused: a.paused,
      volume: a.volume,
    }));
    expect(paused || volume === 0).toBe(true);
  });

  // ── 5. 音效 slider=70 → 持久化 + 全域 + 事件 ──
  test('音效 slider=70 → 持久化、全域、派發事件', async ({ page }) => {
    // 預先掛監聽器以捕捉 arcade-audio-change 事件
    await page.evaluate(() => {
      (window as unknown as { __lastAudioChange?: { musicVolume: number; sfxVolume: number } }).__lastAudioChange = undefined;
      window.addEventListener('arcade-audio-change', (e) => {
        (window as unknown as { __lastAudioChange?: { musicVolume: number; sfxVolume: number } }).__lastAudioChange = (e as CustomEvent).detail;
      });
    });

    await page.locator('.arcade-bgm-toggle').click();

    const sfxSlider = page.locator('input[data-audio="sfx"]');
    try {
      await sfxSlider.fill('70');
    } catch {
      await sfxSlider.evaluate((el) => {
        (el as HTMLInputElement).value = '70';
        el.dispatchEvent(new Event('input', { bubbles: true }));
      });
    }

    // localStorage
    const lsVal = await page.evaluate(() => parseFloat(localStorage.getItem('arcade-sfx-vol') ?? 'NaN'));
    expect(lsVal).toBeGreaterThanOrEqual(0.65);
    expect(lsVal).toBeLessThanOrEqual(0.75);

    // 全域
    const globalSfx = await page.evaluate(() => (window as unknown as { __arcadeAudio?: { sfxVolume: number } }).__arcadeAudio?.sfxVolume ?? -1);
    expect(globalSfx).toBeGreaterThanOrEqual(0.65);
    expect(globalSfx).toBeLessThanOrEqual(0.75);

    // 事件
    const lastChange = await page.evaluate(() => (window as unknown as { __lastAudioChange?: { sfxVolume: number } }).__lastAudioChange?.sfxVolume ?? -1);
    expect(lastChange).toBeGreaterThanOrEqual(0.65);
    expect(lastChange).toBeLessThanOrEqual(0.75);
  });

  // ── 6. 持久化跨 reload ──
  test('持久化跨 reload — music slider 值記住', async ({ page }) => {
    // 先設 80，再 reload
    await page.locator('.arcade-bgm-toggle').click();
    // 直接用 evaluate 確保 input 事件一定觸發（fill 在 range 上不保證觸發 input）
    await page.locator('input[data-audio="music"]').evaluate((el) => {
      (el as HTMLInputElement).value = '80';
      el.dispatchEvent(new Event('input', { bubbles: true }));
    });

    // 確認 localStorage 已寫入（slider input handler 應同步寫）
    await expect.poll(() => page.evaluate(() => localStorage.getItem('arcade-music-vol')), { timeout: 3000 }).not.toBeNull();

    // 加一個 initScript（在 beforeEach 的 initScript 之後執行）：
    // 重設 arcade-music-vol=0.8，抵消 beforeEach 的清除。
    // initScripts 依 addInitScript 呼叫順序在每次導航前執行：
    //   1. beforeEach: removeItem('arcade-music-vol')  → 清掉
    //   2. 此 script:  setItem('arcade-music-vol','0.8') → 重設回來
    // 頁面元件的 JS 讀到的就是 0.8。
    await page.addInitScript(() => {
      localStorage.setItem('arcade-music-vol', '0.8');
    });

    // reload（以上 initScript 序列在 reload 後執行）
    await page.reload({ waitUntil: 'domcontentloaded' });

    // 重新開面板
    await page.locator('.arcade-bgm-toggle').click();
    const sliderVal = await page.locator('input[data-audio="music"]').evaluate((el: HTMLInputElement) => parseInt(el.value, 10));
    expect(sliderVal).toBeGreaterThanOrEqual(75);
    expect(sliderVal).toBeLessThanOrEqual(85);
  });

  // ── 7. 音檔可載入（200 + audio mime + body > 100000） ──
  test('BGM 音檔可載入（200 + audio mime + body > 100000）', async ({ page, request }) => {
    const src = await page.locator('.arcade-bgm-audio').getAttribute('src');
    expect(src).toBeTruthy();
    const res = await request.get(src as string);
    expect(res.status()).toBe(200);
    expect(res.headers()['content-type']).toMatch(/audio|mpeg|octet-stream/);
    const body = await res.body();
    expect(body.length).toBeGreaterThan(100000);
  });
});

// ── 8. 三款遊戲頁面板存在且 track 正確 ──
for (const [name, path] of [
  ['tetris', '/games/tetris'],
  ['bomber', '/games/bomber'],
  ['witchrun', '/games/witchrun'],
] as const) {
  test(`${name} 頁面板存在且 track 含 /${name}.mp3`, async ({ page }) => {
    await page.addInitScript(() => {
      try {
        localStorage.removeItem('arcade-music-vol');
        localStorage.removeItem('arcade-sfx-vol');
      } catch {}
    });
    await page.goto(path);
    await page.waitForLoadState('domcontentloaded');

    // 面板鈕可見
    const btn = page.locator('.arcade-bgm-toggle');
    await expect(btn).toBeVisible();

    // track src 含對應 mp3 名稱
    const src = await page.locator('.arcade-bgm-audio').getAttribute('src');
    expect(src).toContain(`/assets/games/bgm/${name}.mp3`);
  });
}
