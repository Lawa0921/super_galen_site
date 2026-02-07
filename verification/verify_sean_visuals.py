
from playwright.sync_api import sync_playwright
import time

def verify_sean_visuals():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()

        # 1. Navigate
        print("Navigating to http://localhost:4321/guild/sean...")
        try:
            page.goto("http://localhost:4321/guild/sean", timeout=60000)
        except Exception as e:
            print(f"Error navigating: {e}")
            browser.close()
            return

        # 2. Wait for content
        page.wait_for_selector("h1.hero-title")
        time.sleep(4) # Wait for fonts to load and textures to generate

        # 3. Screenshot focusing on Zodiac Runes
        # Scroll slightly to trigger animations if needed, but initial load should show them
        page.screenshot(path="verification/sean_visual_fix.png")
        print("Screenshot: Visual fix saved.")

        browser.close()

if __name__ == "__main__":
    verify_sean_visuals()
