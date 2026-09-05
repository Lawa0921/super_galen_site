import { test, expect } from '@playwright/test';

test.describe('passer_999 滾動影片與 loader', () => {
  test('passer 初次 preload none，loader fallback 後主動載入影片', async ({ page }) => {
    const requests: string[] = [];
    await page.addInitScript(() => {
      const w = window as unknown as Record<string, any>;
      const nativeLoad = HTMLMediaElement.prototype.load;
      w.__scrollLoadCalls = 0;
      HTMLMediaElement.prototype.load = function() {
        if (this.id === 'scrollVideo') w.__scrollLoadCalls++;
        return nativeLoad.call(this);
      };
      const nativeSetTimeout = window.setTimeout.bind(window);
      window.setTimeout = ((callback: TimerHandler, delay?: number, ...args: unknown[]) => {
        if (delay === 2500) {
          (window as unknown as Record<string, unknown>).__runLoaderFallback = () => (callback as (...values: unknown[]) => void)(...args);
          return 1;
        }
        return nativeSetTimeout(callback, delay, ...args);
      }) as typeof window.setTimeout;
    });
    await page.route('**/passer_999/video_1.mp4', route => route.fulfill({
      path: 'public/assets/img/guild/letshavefun/intro-video.mp4',
      contentType: 'video/mp4'
    }));
    page.on('request', request => requests.push(request.url()));
    await page.goto('/guild/passer_999/', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('#scrollVideo')).toHaveAttribute('preload', 'none');
    // preload is a browser hint; verify that the page itself has not started loading.
    expect(await page.evaluate(() => (window as unknown as Record<string, number>).__scrollLoadCalls)).toBe(0);
    await page.evaluate(() => ((window as unknown as Record<string, () => void>).__runLoaderFallback)());
    await expect(page.locator('#loaderScreen')).toBeHidden();
    await expect(page.locator('#scrollVideo')).toHaveAttribute('preload', 'metadata');
    expect(await page.evaluate(() => (window as unknown as Record<string, number>).__scrollLoadCalls)).toBe(1);
    await expect.poll(() => requests.some(url => url.includes('/passer_999/video_1.mp4'))).toBe(true);
    expect(await page.locator('#videoSection').evaluate(section => section.getBoundingClientRect().height)).toBeGreaterThan(0);
  });

test('passer Enter 後等待 metadata 再建立 scroll video mapping', async ({ page }) => {
  await page.addInitScript(() => {
    const nativeSetTimeout = window.setTimeout.bind(window);
    window.setTimeout = ((callback: TimerHandler, delay?: number, ...args: unknown[]) => {
      if (delay === 2500) {
        (window as unknown as Record<string, unknown>).__runLoaderFallback = () => (callback as (...values: unknown[]) => void)(...args);
        return 1;
      }
      return nativeSetTimeout(callback, delay, ...args);
    }) as typeof window.setTimeout;
  });
  await page.goto('/guild/passer_999/', { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => {
    const w = window as unknown as Record<string, any>;
    const video = document.querySelector('#scrollVideo') as HTMLVideoElement;
    let metadataReady = false;
    let currentTime = 0;
    w.__passerLoadCount = 0;
    Object.defineProperty(video, 'readyState', { configurable: true, get: () => metadataReady ? 1 : 0 });
    Object.defineProperty(video, 'duration', { configurable: true, get: () => metadataReady ? 42 : 0 });
    Object.defineProperty(video, 'currentTime', {
      configurable: true,
      get: () => currentTime,
      set: (value) => { currentTime = value; }
    });
    video.load = () => {
      w.__passerLoadCount++;
      setTimeout(() => {
        metadataReady = true;
        video.dispatchEvent(new Event('loadedmetadata'));
      }, 3000);
    };
    w.__passerCurrentTime = () => currentTime;
  });

  await page.locator('#loaderEnter').evaluate(button => (button as HTMLButtonElement).click());
  expect(await page.evaluate(() => (window as unknown as { __passerLoadCount: number }).__passerLoadCount)).toBe(1);
  await page.evaluate(() => ((window as unknown as Record<string, () => void>).__runLoaderFallback)());
  await page.waitForTimeout(3400);
  await page.evaluate(() => {
    const section = document.querySelector('#videoSection') as HTMLElement;
    window.scrollTo(0, section.offsetTop + section.offsetHeight / 2 - window.innerHeight / 2);
  });
  await page.waitForTimeout(500);
  await expect.poll(() => page.evaluate(() => (window as unknown as { __passerCurrentTime: () => number }).__passerCurrentTime())).toBeGreaterThan(10);
  await page.evaluate(() => {
    const section = document.querySelector('#videoSection') as HTMLElement;
    window.scrollTo(0, section.offsetTop + section.offsetHeight - window.innerHeight);
  });
  await expect(page.locator('#content')).toHaveCSS('opacity', '1');
  expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(0);
});

for (const width of [1440, 390]) {
  test(`passer ${width}px 影片播完往回捲仍顯示影片並反向定位`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await page.goto('/guild/passer_999/', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('#loaderScreen')).toBeHidden();
    await page.waitForFunction(() => (document.querySelector('#scrollVideo') as HTMLVideoElement).readyState >= 2);
    const runway = await page.locator('#videoSection').evaluate(section => ({
      start: (section as HTMLElement).offsetTop,
      end: (section as HTMLElement).offsetTop + section.clientHeight - innerHeight
    }));
    for (let lap = 0; lap < 2; lap++) {
      await page.evaluate(y => window.scrollTo(0, y), runway.end + 844);
      await expect(page.locator('#content')).toHaveCSS('opacity', '1');
      await page.waitForTimeout(1400);
      await page.evaluate(y => window.scrollTo(0, y), (runway.start + runway.end) / 2);
      await expect(page.locator('#videoSection .video-sticky')).toBeVisible();
      await expect(page.locator('#videoSection .video-sticky')).toHaveCSS('opacity', '1');
      await expect.poll(() => page.locator('#scrollVideo').evaluate(video => {
        const media = video as HTMLVideoElement;
        return media.currentTime / media.duration;
      })).toBeCloseTo(0.5, 1);
      await expect(page.locator('#videoHint')).toHaveCSS('opacity', '1');
    }
    await page.evaluate(() => window.scrollTo(0, 0));
    await expect.poll(() => page.locator('#scrollVideo').evaluate(video => (video as HTMLVideoElement).currentTime)).toBeLessThan(0.1);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });
}

test('passer loader 在未互動時也會於三秒內解除', async ({ page }) => {
  await page.goto('/guild/passer_999/', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#loaderScreen')).toBeHidden({ timeout: 3500 });
  await expect(page.locator('body')).not.toHaveClass(/loading/);
  await expect(page.locator('#videoSection .video-sticky')).toBeVisible();
  expect(await page.locator('#videoSection').evaluate(section => section.getBoundingClientRect().height)).toBeGreaterThan(0);
});

test('passer 影片初始化後失敗會清除 pin 與黑層', async ({ page }) => {
  await page.addInitScript(() => {
    const nativeSetTimeout = window.setTimeout.bind(window);
    window.setTimeout = ((callback: TimerHandler, delay?: number, ...args: unknown[]) =>
      delay === 2500 ? 1 : nativeSetTimeout(callback, delay, ...args)) as typeof window.setTimeout;
  });
  await page.goto('/guild/passer_999/', { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => {
    const w = window as unknown as Record<string, any>;
    const video = document.querySelector('#scrollVideo') as HTMLVideoElement;
    Object.defineProperty(video, 'readyState', { configurable: true, get: () => 1 });
    Object.defineProperty(video, 'duration', { configurable: true, get: () => 15 });
    w.initScrollVideo();
    window.scrollTo(0, 500);
  });
  await page.waitForTimeout(300);
  const before = await page.evaluate(() => {
    const w = window as unknown as Record<string, any>;
    const section = document.querySelector('#videoSection');
    return {
      triggers: w.ScrollTrigger.getAll().filter((trigger: any) => trigger.trigger === section || trigger.vars.trigger === section).length,
      stickyPosition: getComputedStyle(document.querySelector('#videoSection .video-sticky') as Element).position
    };
  });
  expect(before.triggers).toBeGreaterThan(0);
  expect(before.stickyPosition).toBe('fixed');

  await page.locator('#scrollVideo').evaluate(video => video.dispatchEvent(new Event('error')));
  const after = await page.evaluate(() => {
    const w = window as unknown as Record<string, any>;
    const section = document.querySelector('#videoSection');
    return {
      triggers: w.ScrollTrigger.getAll().filter((trigger: any) => trigger.trigger === section || trigger.vars.trigger === section).length,
      stickyDisplay: getComputedStyle(document.querySelector('#videoSection .video-sticky') as Element).display
    };
  });
  expect(after.triggers).toBe(0);
  expect(after.stickyDisplay).toBe('none');
  await expect(page.locator('#videoSection')).toHaveCSS('height', '0px');
  await expect(page.locator('#content')).toHaveCSS('opacity', '1');
});

test('passer 播完後影片失敗仍清除跑道與 pin', async ({ page }) => {
  await page.addInitScript(() => {
    HTMLMediaElement.prototype.load = function() {
      Object.defineProperty(this, 'readyState', { configurable: true, value: 1 });
      Object.defineProperty(this, 'duration', { configurable: true, value: 15 });
      this.dispatchEvent(new Event('loadedmetadata'));
    };
  });
  await page.goto('/guild/passer_999/', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#loaderScreen')).toBeHidden();
  await page.waitForFunction(() => (document.querySelector('#scrollVideo') as HTMLVideoElement).readyState >= 1);
  await page.locator('#content').evaluate(el => window.scrollTo(0, (el as HTMLElement).offsetTop));
  await expect(page.locator('#content')).toHaveCSS('opacity', '1');
  await page.locator('#scrollVideo').evaluate(video => video.dispatchEvent(new Event('error')));
  await expect(page.locator('#videoSection')).toHaveCSS('height', '0px');
  await expect(page.locator('#videoSection .video-sticky')).toBeHidden();
  expect(await page.evaluate(() => {
    const w = window as unknown as Record<string, any>;
    return w.ScrollTrigger.getAll().filter((trigger: any) => trigger.trigger === document.querySelector('#videoSection')).length;
  })).toBe(0);
});

test('passer fallback 後的慢資源不會重設影片進度', async ({ page }) => {
  let releaseHero!: () => void;
  const heroGate = new Promise<void>(resolve => { releaseHero = resolve; });
  await page.addInitScript(() => {
    const nativeSetTimeout = window.setTimeout.bind(window);
    window.setTimeout = ((callback: TimerHandler, delay?: number, ...args: unknown[]) => {
      if (delay === 2500) {
        (window as unknown as Record<string, unknown>).__runLoaderFallback = () => (callback as (...values: unknown[]) => void)(...args);
        return 1;
      }
      return nativeSetTimeout(callback, delay, ...args);
    }) as typeof window.setTimeout;
  });
  await page.route('**/passer_999/post_image.webp', async route => {
    await heroGate;
    await route.fulfill({
      path: 'public/assets/img/guild/passer_999/post_image.webp',
      contentType: 'image/webp'
    });
  });
  await page.goto('/guild/passer_999/', { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => {
    const w = window as unknown as Record<string, any>;
    const video = document.querySelector('#scrollVideo') as HTMLVideoElement;
    let currentTime = 1;
    let zeroWrites = 0;
    Object.defineProperty(video, 'readyState', { configurable: true, get: () => 1 });
    Object.defineProperty(video, 'duration', { configurable: true, get: () => 10 });
    Object.defineProperty(video, 'currentTime', {
      configurable: true,
      get: () => currentTime,
      set: value => {
        if (value === 0) zeroWrites++;
        currentTime = value;
      }
    });
    video.load = () => {};
    w.__passerZeroWrites = () => zeroWrites;
  });
  await page.evaluate(() => ((window as unknown as Record<string, () => void>).__runLoaderFallback)());
  await expect(page.locator('#loaderScreen')).toBeHidden();
  const zeroWritesAfterFallback = await page.evaluate(() => (window as unknown as Record<string, () => number>).__passerZeroWrites());
  releaseHero();
  await expect.poll(() => page.locator('#heroPortrait').evaluate(image => (image as HTMLImageElement).complete)).toBe(true);
  await page.evaluate(async () => { await document.fonts.ready; });
  await page.waitForTimeout(1200);
  await expect(page.locator('#loaderScreen')).toBeHidden();
  expect(await page.evaluate(() => (window as unknown as Record<string, () => number>).__passerZeroWrites())).toBe(zeroWritesAfterFallback);
});

test('passer voice dot 可點擊切換內容', async ({ page }) => {
  await page.addInitScript(() => {
    const nativeSetInterval = window.setInterval.bind(window);
    window.setInterval = ((callback, delay, ...args) =>
      delay === 5000 ? 0 : nativeSetInterval(callback, delay, ...args)) as typeof window.setInterval;
  });
  await page.goto('/guild/passer_999/', { waitUntil: 'domcontentloaded' });
  await page.locator('#loaderEnter').click({ force: true });
  await expect(page.locator('#loaderScreen')).toBeHidden({ timeout: 10000 });
  await page.locator('#voices').evaluate((section) => {
    window.scrollTo(0, section.getBoundingClientRect().top + window.scrollY + section.clientHeight / 2 - window.innerHeight / 2);
  });

  const thirdDot = page.locator('.voice-dot').nth(2);
  await thirdDot.click();
  await expect(thirdDot).toHaveClass(/active/);
  await expect(page.locator('.voice-slide.active')).toHaveCount(1);
  await expect(page.locator('.voice-slide.active .quote-text')).toContainText('全部串聯了');
});

});
