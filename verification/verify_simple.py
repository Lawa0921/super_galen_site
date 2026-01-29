
import os
import time
from playwright.sync_api import sync_playwright, expect

def verify_simple(page):
    page.goto("http://localhost:4000/guild/fuxintang.html", wait_until="domcontentloaded")

    # Click Enter
    try:
        page.locator("#enter-btn").click(force=True, timeout=5000)
    except:
        print("Enter btn not found or clickable")

    page.wait_for_timeout(3000)

    # Screenshot
    page.screenshot(path="/home/jules/verification/final_screenshot.png")
    print("Screenshot taken.")

if __name__ == "__main__":
    os.makedirs("/home/jules/verification", exist_ok=True)
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        page.set_viewport_size({"width": 1280, "height": 800})
        try:
            verify_simple(page)
        finally:
            browser.close()
