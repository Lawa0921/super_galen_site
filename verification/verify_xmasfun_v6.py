
import os
from playwright.sync_api import sync_playwright

def verify_xmasfun_v6():
    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page()

        # Navigate to the page
        url = "http://localhost:4325/guild/xmasfun689"
        print(f"Navigating to {url}...")
        page.goto(url)
        page.wait_for_load_state("networkidle")

        # Ensure directory exists
        if not os.path.exists("verification"):
            os.makedirs("verification")

        # 1. Capture Hero (Circuit + Typing Effect)
        print("Capturing Hero...")
        page.wait_for_timeout(2500) # Wait for typing to finish
        page.screenshot(path="verification/xmasfun_v6_1_hero.png")

        # 2. Scroll to Earth/Metal
        print("Scrolling to Earth...")
        page.evaluate("window.scrollTo(0, document.body.scrollHeight * 0.35)")
        page.wait_for_timeout(1000)
        page.screenshot(path="verification/xmasfun_v6_2_earth.png")

        # 3. Scroll to Personal (Thread Icon)
        print("Scrolling to Personal...")
        page.evaluate("window.scrollTo(0, document.body.scrollHeight)")
        page.wait_for_timeout(1000)
        page.screenshot(path="verification/xmasfun_v6_3_personal.png")

        browser.close()
        print("Verification V6 complete.")

if __name__ == "__main__":
    verify_xmasfun_v6()
