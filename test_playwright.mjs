import { chromium } from 'playwright';

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();

  // Navigate to local server
  await page.goto('http://localhost:4321/guild/ddddearth4444');

  // Wait for the p5.js canvas to initialize and render
  await page.waitForSelector('canvas.p5Canvas');
  await page.waitForTimeout(2000); // Give it some time to draw the sun and waves

  await page.screenshot({ path: '/tmp/verification.png', fullPage: true });
  await browser.close();
})();
