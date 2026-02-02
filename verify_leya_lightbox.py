import asyncio
import os
import sys
import time
from http.server import SimpleHTTPRequestHandler
from socketserver import TCPServer
from threading import Thread
from playwright.async_api import async_playwright

PORT = 8101

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
        page = await browser.new_page(viewport={"width": 1280, "height": 800})

        url = f"http://localhost:{PORT}/src/content/guild/leya.html"
        print(f"Navigating to {url}")

        response = await page.goto(url)
        if response.status != 200:
            print(f"Failed: {response.status}")
            sys.exit(1)

        # Force hide loader
        await page.evaluate("document.getElementById('loader').style.display = 'none'")

        # 1. Assemble
        print("Clicking Assemble button...")
        await page.evaluate("document.getElementById('start-btn').click()")
        await page.wait_for_timeout(3500)

        # 2. Scroll to Drifting (Section 1)
        await page.evaluate("window.scrollTo(0, document.body.scrollHeight * 0.1)")
        await page.wait_for_timeout(1000)

        # 3. Click Image
        print("Clicking image...")
        await page.click("#sec-drifting img")
        await page.wait_for_timeout(1000)

        # 4. Check Lightbox
        opacity = await page.locator("#lightbox").evaluate("el => getComputedStyle(el).opacity")
        print(f"Lightbox Opacity: {opacity}") # Should be 1

        os.makedirs("verification", exist_ok=True)
        await page.screenshot(path="verification/leya_lightbox_open.png")

        print("Screenshots saved.")
        await browser.close()

if __name__ == "__main__":
    asyncio.run(run())
