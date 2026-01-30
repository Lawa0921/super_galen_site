import time
from playwright.sync_api import sync_playwright

def verify_journal():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        # Set viewport to something desktop-like
        page = browser.new_page(viewport={'width': 1280, 'height': 800})

        print("Navigating to page...")
        page.goto("http://localhost:4004/guild/pineapple.html")

        # Wait for loading screen to hide
        print("Waiting for loading screen...")
        try:
            page.wait_for_selector("#loadingScreen.hidden", timeout=10000)
        except Exception as e:
            print("Timeout waiting for loading screen. Checking console logs.")
            page.screenshot(path="journal_error.png")
            raise e

        print("Page loaded. Taking initial screenshot...")
        time.sleep(2) # Wait for initial render/fonts
        page.screenshot(path="journal_initial.png")

        # Click on right side to flip next
        print("Clicking right side...")
        page.mouse.click(1000, 400)

        # Wait for animation (gsap duration is ~1.2s)
        time.sleep(1.5)

        print("Taking flipped screenshot...")
        page.screenshot(path="journal_flipped.png")

        browser.close()

if __name__ == "__main__":
    verify_journal()
