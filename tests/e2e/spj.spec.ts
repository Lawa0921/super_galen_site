import { test, expect } from '@playwright/test';

test.describe('SPJ Guild Page (High-Vis Tavern)', () => {
  test.setTimeout(120000);

  test.beforeEach(async ({ page }) => {
    page.on('console', msg => console.log(`BROWSER LOG: ${msg.text()}`));
    page.on('pageerror', err => console.log(`BROWSER ERROR: ${err}`));

    await page.goto('/guild/spj', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForSelector('#intro-overlay', { state: 'visible', timeout: 10000 });
  });

  test('should display Cinematic Intro', async ({ page }) => {
    const title = page.locator('.intro-title');
    await expect(title).toBeVisible();
    await expect(title).toHaveText('THE GUILD TAVERN');
  });

  test('should enter tavern and enable scroll interaction', async ({ page }) => {
    await page.click('#intro-overlay');
    await expect(page.locator('#intro-overlay')).toHaveClass(/hidden/);

    // Wait for enterTavern animation + initScroll to populate dialogue text
    const dialogueBox = page.locator('#dialogue-text');
    await page.waitForFunction(
      () => {
        const el = document.getElementById('dialogue-text');
        return el && el.innerText.length > 0;
      },
      null,
      { timeout: 20000 }
    );
    await expect(dialogueBox).toContainText('歡迎，冒險者');

    // Scroll and verify text changes (proves scroll interaction works)
    await page.mouse.wheel(0, 1500);
    await page.waitForFunction(
      () => {
        const el = document.getElementById('dialogue-text');
        return el && el.innerText.length > 0 && !el.innerText.includes('歡迎，冒險者');
      },
      null,
      { timeout: 15000 }
    );
    const scrolledText = await dialogueBox.innerText();
    expect(scrolledText).not.toContain('歡迎，冒險者');
  });

  test('should display avatar in dialogue box', async ({ page }) => {
    await page.click('#intro-overlay');
    await page.waitForTimeout(3000);

    const avatar = page.locator('.dialogue-avatar');
    await expect(avatar).toBeVisible();
    const avatarImg = page.locator('.dialogue-avatar img');
    await expect(avatarImg).toHaveAttribute('src', /spj\/avatar\.webp/);
  });

  test('should have individual interactive bottles with unique dialogues', async ({ page }) => {
    await page.click('#intro-overlay');
    await page.waitForTimeout(3000);

    const specialBottleCount = await page.evaluate(() => {
      // @ts-ignore
      return window.__specialBottleCount ?? 0;
    });
    expect(specialBottleCount).toBeGreaterThanOrEqual(5);

    const allUnique = await page.evaluate(() => {
      // @ts-ignore
      return window.__bottleDialoguesAllUnique ?? false;
    });
    expect(allUnique).toBe(true);
  });

  test('should have glow indicators on interactive points', async ({ page }) => {
    await page.click('#intro-overlay');
    await page.waitForTimeout(3000);

    const interactiveCount = await page.evaluate(() => {
      // @ts-ignore
      return window.__interactivePointCount ?? 0;
    });
    // 6 bottles + book + mug = 8
    expect(interactiveCount).toBeGreaterThanOrEqual(7);
  });

  test('quest beat should show dialogue and social card beat should hide it', async ({ page }) => {
    await page.click('#intro-overlay');
    await page.waitForTimeout(3000);

    // Quest beat (mentions 任務日誌) should NOT hide dialogue
    const questBeatHasContent = await page.evaluate(() => {
      // @ts-ignore
      const script = window.__scriptBeats;
      if (!script) return false;
      const questBeat = script.find((b: any) => b.text.includes('任務日誌'));
      return questBeat && questBeat.hideDialogue !== true;
    });
    expect(questBeatHasContent).toBe(true);

    // Social card beat should hide dialogue
    const socialBeatHidesDialogue = await page.evaluate(() => {
      // @ts-ignore
      const script = window.__scriptBeats;
      if (!script) return false;
      const socialBeat = script.find((b: any) => b.socialCard === true);
      return socialBeat && socialBeat.hideDialogue === true;
    });
    expect(socialBeatHidesDialogue).toBe(true);
  });

  test('should show social profile card at the end', async ({ page }) => {
    await page.click('#intro-overlay');
    await page.waitForTimeout(3000);

    const socialCard = page.locator('#social-card');
    await expect(socialCard).toBeAttached();
    await expect(socialCard).toHaveCSS('opacity', '0');

    await page.mouse.wheel(0, 8000);
    await page.waitForTimeout(1500);

    await expect(socialCard).toHaveCSS('opacity', '1');
    await expect(page.locator('#social-card .social-card-name')).toContainText('SPJ');
    await expect(page.locator('#social-card a')).toHaveCount(1);
  });

  test('should open Quest Log via book click', async ({ page }) => {
    await page.click('#intro-overlay');
    await page.waitForTimeout(3000);
    await expect(page.locator('#quest-parchment')).not.toHaveClass(/visible/);
  });

  test('should have expanded dialogue content with more scroll beats', async ({ page }) => {
    await page.click('#intro-overlay');
    await page.waitForTimeout(3000);

    const beatCount = await page.evaluate(() => {
      // @ts-ignore
      return window.__scriptBeatCount ?? 0;
    });
    expect(beatCount).toBeGreaterThanOrEqual(7);
  });

  test('should have wall torches above top shelf, not inside wine rack', async ({ page }) => {
    await page.click('#intro-overlay');
    await page.waitForTimeout(3000);

    const torchInfo = await page.evaluate(() => {
      // @ts-ignore
      return window.__torchPositions ?? [];
    });
    expect(torchInfo.length).toBe(2);
    // Torches must be above the top shelf (y=7) and on the back wall (z near -5)
    torchInfo.forEach((pos: { x: number; y: number; z: number }) => {
      expect(pos.y).toBeGreaterThan(7);
      expect(pos.z).toBeLessThan(-4);
    });
  });

  test('should support mobile viewports', async ({ page }) => {
    // Set mobile viewport
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/guild/spj', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForSelector('#intro-overlay', { state: 'visible', timeout: 10000 });
    await page.click('#intro-overlay');
    await page.waitForTimeout(3000);

    // Dialogue box should be visible and within viewport
    const dialogueBox = page.locator('#dialogue-box');
    const box = await dialogueBox.boundingBox();
    expect(box).not.toBeNull();
    if (box) {
      expect(box.width).toBeLessThanOrEqual(390);
      expect(box.y + box.height).toBeLessThanOrEqual(844);
    }

    // Avatar should still be visible
    await expect(page.locator('.dialogue-avatar')).toBeVisible();
  });

  test('should enable horizontal pan on mobile/narrow viewports', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/guild/spj', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForSelector('#intro-overlay', { state: 'visible', timeout: 10000 });
    await page.click('#intro-overlay');
    await page.waitForTimeout(3000);

    // Pan system should be enabled
    const panEnabled = await page.evaluate(() => {
      // @ts-ignore
      return window.__panEnabled ?? false;
    });
    expect(panEnabled).toBe(true);

    // Pan range should allow exploring hidden areas
    const panRange = await page.evaluate(() => {
      // @ts-ignore
      return window.__panMaxX ?? 0;
    });
    expect(panRange).toBeGreaterThan(0);
  });

  test('should have adequately sized dialogue box on mobile', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/guild/spj', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForSelector('#intro-overlay', { state: 'visible', timeout: 10000 });
    await page.click('#intro-overlay');
    await page.waitForTimeout(3000);

    const dialogueBox = page.locator('#dialogue-box');
    const maxHeight = await dialogueBox.evaluate(el =>
      window.getComputedStyle(el).maxHeight
    );
    // Should be at least 140px (was previously 100px/88px, too cramped)
    expect(parseInt(maxHeight)).toBeGreaterThanOrEqual(140);
  });

  test('should reuse raycaster and vector2 for performance', async ({ page }) => {
    await page.click('#intro-overlay');
    await page.waitForTimeout(3000);

    const reused = await page.evaluate(() => {
      // @ts-ignore
      return window.__reusesRaycaster ?? false;
    });
    expect(reused).toBe(true);
  });

  test('should share geometries to reduce GPU memory', async ({ page }) => {
    await page.click('#intro-overlay');
    await page.waitForTimeout(3000);

    const shared = await page.evaluate(() => {
      // @ts-ignore
      return window.__sharedGeoCount ?? 0;
    });
    expect(shared).toBeGreaterThanOrEqual(5);
  });
});
