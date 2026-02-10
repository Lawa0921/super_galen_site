
import os
from playwright.sync_api import sync_playwright

def verify_xmasfun_v14():
    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page()

        # Navigate to the page
        url = "http://localhost:4325/guild/xmasfun689"
        print(f"Navigating to {url}...")
        page.goto(url)

        # Wait for loader
        print("Waiting for loader...")
        page.wait_for_timeout(2000)

        # Ensure directory exists
        if not os.path.exists("verification"):
            os.makedirs("verification")

        # 1. Capture Hero (With new text)
        print("Capturing Hero...")
        page.screenshot(path="verification/xmasfun_v14_1_hero.png")

        # 2. Scroll to Earth Sector (Excavator)
        print("Scrolling to Earth...")
        page.evaluate("window.scrollTo(0, document.body.scrollHeight * 0.3)")
        page.wait_for_timeout(1500)
        page.screenshot(path="verification/xmasfun_v14_2_earth.png")

        # 3. Scroll to Plasma Sector (Soul)
        print("Scrolling to Plasma...")
        page.evaluate("window.scrollTo(0, document.body.scrollHeight * 0.8)")
        page.wait_for_timeout(1500)
        page.screenshot(path="verification/xmasfun_v14_3_plasma.png")

        browser.close()
        print("Verification V14 complete.")

if __name__ == "__main__":
    verify_xmasfun_v14()
