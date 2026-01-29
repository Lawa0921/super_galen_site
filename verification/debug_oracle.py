
import os
from playwright.sync_api import sync_playwright

def debug_oracle(page):
    page.on("console", lambda msg: print(f"CONSOLE: {msg.text}"))
    page.on("pageerror", lambda err: print(f"PAGE ERROR: {err}"))

    page.goto("http://localhost:4000/guild/fuxintang.html", wait_until="networkidle")
    page.wait_for_timeout(3000) # Wait for loader

    print("Clicking trigger...")
    page.locator("#oracle-trigger").click(force=True)
    page.wait_for_timeout(1000)

    overlay = page.locator("#oracle-overlay")
    classes = overlay.get_attribute("class")
    print(f"Overlay classes: {classes}")

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page()
    debug_oracle(page)
    browser.close()
