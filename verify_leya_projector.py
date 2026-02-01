import asyncio
import os
import sys
import time
from http.server import SimpleHTTPRequestHandler
from socketserver import TCPServer
from threading import Thread
from playwright.async_api import async_playwright

PORT = 8089

def start_server():
    try:
        with TCPServer(("", PORT), SimpleHTTPRequestHandler) as httpd:
            print(f"Serving at port {PORT}")
            httpd.serve_forever()
    except OSError as e:
        print(f"Port {PORT} in use: {e}")

async def run():
    server_thread = Thread(target=start_server, daemon=True)
    server_thread.start()
    time.sleep(2)

    async with async_playwright() as p:
        browser = await p.chromium.launch()
        # Test Desktop Viewport
        page = await browser.new_page(viewport={"width": 1280, "height": 800})

        url = f"http://localhost:{PORT}/src/content/guild/leya.html"
        print(f"Navigating to {url}")

        response = await page.goto(url)
        if response.status != 200:
            print(f"Failed: {response.status}")
            sys.exit(1)

        await page.wait_for_timeout(3000)

        # 1. Screenshot Hero (Center)
        os.makedirs("verification", exist_ok=True)
        await page.screenshot(path="verification/leya_projector_0_hero.png")

        # 2. Scroll to Bio (30%) -> Bio Top Right
        await page.evaluate("window.scrollTo(0, document.body.scrollHeight * 0.3)")
        await page.wait_for_timeout(2000)

        # Verify alignment
        bio_justify = await page.locator("#sec-bio").evaluate("el => getComputedStyle(el).justifyContent")
        print(f"Bio Justify: {bio_justify}") # Should be 'flex-end'

        await page.screenshot(path="verification/leya_projector_30_bio.png")

        print("Screenshots saved.")
        await browser.close()

if __name__ == "__main__":
    asyncio.run(run())
