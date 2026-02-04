from playwright.sync_api import sync_playwright
import time

def run():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page(viewport={"width": 1280, "height": 800})

        # Go to the page
        print("Navigating to page...")
        page.goto("http://localhost:4321/guild/xiaoshi")

        # Wait for boot sequence (approx 2s + 1s for text reveal)
        print("Waiting for boot sequence...")
        time.sleep(4)

        # Take screenshot of the Hero section
        print("Taking screenshot...")
        page.screenshot(path="verification/xiaoshi_mk85.png", full_page=True)

        browser.close()

if __name__ == "__main__":
    run()
