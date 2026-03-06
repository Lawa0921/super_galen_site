import asyncio
from playwright.async_api import async_playwright
import time

async def verify():
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        page = await browser.new_page()

        # Open local dev server on the correct port
        await page.goto("http://localhost:4324/guild/ddddearth4444")

        # Wait for preloader to finish and trigger entrance
        await page.wait_for_selector('#enter-btn:not(.hidden)')
        await page.click('#enter-btn')

        # Wait for the entrance animation to finish and content to be visible
        time.sleep(1)

        # Scroll down slightly to make sure content loads into view
        await page.evaluate("window.scrollBy(0, 500)")
        time.sleep(1)
        await page.screenshot(path="expanded_hero.png")

        # Scroll to strategy section
        await page.evaluate("window.scrollBy(0, 1500)")
        time.sleep(1)
        await page.screenshot(path="expanded_strategy.png")

        # Scroll to the image grid to verify duplicate image swap
        await page.evaluate("window.scrollTo(0, document.body.scrollHeight - 500)")
        time.sleep(1)
        await page.screenshot(path="image_grid.png")

        print("Verification screenshots taken.")
        await browser.close()

asyncio.run(verify())
