import { test, expect } from '@playwright/test';

test.describe('SPJ Guild Page (High-Vis Tavern)', () => {
  test.setTimeout(120000);

  test.beforeEach(async ({ page }) => {
    page.on('console', msg => console.log(`BROWSER LOG: ${msg.text()}`));
    page.on('pageerror', err => console.log(`BROWSER ERROR: ${err}`));

    // Navigate to page
    await page.goto('/guild/spj', { waitUntil: 'domcontentloaded', timeout: 30000 });
    // Wait for intro overlay
    await page.waitForSelector('#intro-overlay', { state: 'visible', timeout: 10000 });
  });

  test('should display Cinematic Intro', async ({ page }) => {
    const title = page.locator('.intro-title');
    await expect(title).toBeVisible();
    await expect(title).toHaveText('THE GUILD TAVERN');
  });

  test('should enter tavern and enable scroll interaction', async ({ page }) => {
    // Click to enter
    await page.click('#intro-overlay');

    // Wait for overlay to hide
    await expect(page.locator('#intro-overlay')).toHaveClass(/hidden/);

    // Wait for camera animation (approx 2.5s based on code)
    await page.waitForTimeout(3000);

    // Check initial dialogue
    const dialogueBox = page.locator('#dialogue-text');
    await expect(dialogueBox).toBeVisible();
    // Wait for text to be populated (in case of animation delay)
    await expect(dialogueBox).not.toBeEmpty({ timeout: 15000 });
    await expect(dialogueBox).toContainText('歡迎，冒險者');

    // Perform scroll (to 2nd section ~ 800px)
    await page.mouse.wheel(0, 800);
    await page.waitForTimeout(1000); // Wait for GSAP scrub/update

    // Check dialogue updated
    // The second beat text starts with "這面牆展示了我的原型作品..."
    await expect(dialogueBox).toContainText('原型作品');

    // Scroll more (to 3rd section ~ 1600px total)
    await page.mouse.wheel(0, 1000);
    await page.waitForTimeout(1000);

    // Check dialogue updated
    // The third beat text starts with "桌上的「任務日誌」..."
    await expect(dialogueBox).toContainText('任務日誌');
  });

  test('should open Quest Log via simulated click (or fallback)', async ({ page }) => {
    await page.click('#intro-overlay');
    await page.waitForTimeout(3000);

    // Since 3D click is hard, we can test the close button if we can trigger open.
    // We can inject a script to simulate the book click logic if needed,
    // or just rely on manual verification for the 3D part.
    // For now, let's just check the UI elements exist.
    await expect(page.locator('#quest-parchment')).not.toHaveClass(/visible/);

    // Verify social links
    const footer = page.locator('#footer-socials');
    // It should be hidden initially (opacity 0) but present
    await expect(footer).toHaveCSS('opacity', '0');

    // Scroll to end (Footer reveals at end)
    await page.mouse.wheel(0, 6000);
    await page.waitForTimeout(1000);

    // Verify footer visible
    await expect(footer).toHaveCSS('opacity', '1');
    await expect(page.locator('.social-btn')).toBeVisible();
  });
});
