const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({
    viewport: { width: 1920, height: 1080 },
    deviceScaleFactor: 1
  });

  // Navigate to local dev server
  await page.goto('http://localhost:4321/guild/asingingwind');

  // Wait for initial render and GSAP load
  await page.waitForTimeout(4000);

  // Ensure directory exists
  if (!fs.existsSync('/home/jules/verification')) {
    fs.mkdirSync('/home/jules/verification');
  }

  // Capture hero section
  await page.screenshot({ path: '/home/jules/verification/hero_dark.png' });

  // Scroll down to horizontal section to trigger GSAP Pinning
  await page.evaluate(() => window.scrollTo(0, window.innerHeight * 1.5));
  await page.waitForTimeout(2000); // Wait for scroll animation
  await page.screenshot({ path: '/home/jules/verification/content_dark1.png' });

  await page.evaluate(() => window.scrollTo(0, window.innerHeight * 2.5));
  await page.waitForTimeout(2000);
  await page.screenshot({ path: '/home/jules/verification/content_dark2.png' });

  await browser.close();
  console.log("Screenshots captured successfully.");
})();
