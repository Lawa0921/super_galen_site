import { test, expect } from '@playwright/test';

const pageUrl = process.env.ACTHESTAR_TEST_URL || '/guild/acthestar/';

test('casting information is visible on entry without scrolling', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  const response = await page.goto(pageUrl, { waitUntil: 'domcontentloaded' });
  expect(response?.status()).toBe(200);
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await expect(page.locator('#theater h1')).toHaveText('Albert Chang');
  await expect(page.locator('#theater')).toContainText('SAG-AFTRA');
  await expect(page.locator('#theater')).toContainText('New York');
  await expect(page.locator('#theater')).toContainText(/The Silent Frame/i);
  const navigation = page.getByRole('navigation', { name: 'Professional information' });
  await expect(navigation.getByRole('link', { name: 'Credits', exact: true })).toBeInViewport();
  await expect(navigation.getByRole('link', { name: 'Contact', exact: true })).toBeInViewport();
  await page.waitForTimeout(3000);
  expect(await page.locator('#theater h1').evaluate(el => Number(getComputedStyle(el.closest('#theaterText') || el).opacity))).toBe(1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(errors).toEqual([]);
});

test('real contact links and credits remain reachable', async ({ page }) => {
  await page.goto(pageUrl, { waitUntil: 'domcontentloaded' });
  const navigation = page.getByRole('navigation', { name: 'Professional information' });
  await navigation.getByRole('link', { name: 'Credits', exact: true }).click();
  await expect(page.locator('#filmography h2')).toBeInViewport();
  await expect(page.locator('#filmography')).toContainText('Actor + Stunt Coordinator');
  await page.evaluate(() => window.scrollTo(0, 0));
  await navigation.getByRole('link', { name: 'Contact', exact: true }).click();
  await expect(page.locator('#contact')).toBeInViewport();
  await expect(page.locator('#contact').getByRole('link', { name: /Instagram/i })).toHaveAttribute('href', 'https://www.instagram.com/acthestar/');
  await expect(page.locator('#contact')).toContainText('Curtain Call');
  await expect(page.locator('a[href^="mailto:"], a[href$=".pdf"]')).toHaveCount(0);
  await expect(page.locator('a[href="/guild/"]')).toHaveCount(1);
});

test('English and Chinese switch real content and preserve the choice', async ({ page }) => {
  await page.goto(pageUrl, { waitUntil: 'domcontentloaded' });
  const original = await page.locator('.actor-monologue').innerText();
  await page.locator('button[data-lang="zh-TW"]').click();
  await expect(page.locator('html')).toHaveAttribute('lang', 'zh-TW');
  await expect(page.locator('.actor-monologue')).toContainText('一位出生於台灣');
  await expect(page.locator('button[data-lang="zh-TW"]')).toHaveAttribute('aria-pressed', 'true');
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.locator('html')).toHaveAttribute('lang', 'zh-TW');
  await page.locator('button[data-lang="en"]').focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await expect(page.locator('.actor-monologue')).toHaveText(original);
  await expect(page.locator('button[data-lang="en"]')).toHaveAttribute('aria-pressed', 'true');
});

test('essential information survives unavailable animation scripts and storage', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('https://cdnjs.cloudflare.com/**/*.js', route => route.abort());
  await page.addInitScript(() => {
    Storage.prototype.getItem = () => { throw new Error('Storage unavailable'); };
    Storage.prototype.setItem = () => { throw new Error('Storage unavailable'); };
  });
  await page.goto(pageUrl, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3000);
  await expect(page.locator('#theater h1')).toHaveText('Albert Chang');
  await page.getByRole('navigation', { name: 'Professional information' }).getByRole('link', { name: 'Contact', exact: true }).click();
  await expect(page.locator('#contact')).toBeInViewport();
  await page.locator('button[data-lang="zh-TW"]').click();
  await expect(page.locator('html')).toHaveAttribute('lang', 'zh-TW');
  expect(errors).toEqual([]);
});

test('the theatre story, scene navigation and backstage interaction remain usable', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(pageUrl, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3000);
  for (const section of ['#actor', '#filmography', '#craft', '#backstage', '#contact']) {
    await page.locator(section).scrollIntoViewIfNeeded();
    await page.waitForTimeout(700);
    await expect(page.locator(section)).toBeInViewport();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
  await page.locator('#cooperPhoto').scrollIntoViewIfNeeded();
  await page.locator('#cooperPhoto').focus();
  await page.keyboard.press('Enter');
  await page.keyboard.press('Enter');
  await expect(page.locator('#easterEgg')).toHaveClass(/show/);
  await page.locator('.scene-dot[data-scene="0"]').focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('#theater h1')).toBeInViewport();
  expect(await page.locator('img').evaluateAll(images => images.every(image => image.complete && image.naturalWidth > 0))).toBe(true);
  expect(errors).toEqual([]);
});
