
import os
from playwright.sync_api import sync_playwright

def verify_xmasfun_v7():
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

        # 1. Capture Hero (Avatar)
        print("Capturing Hero...")
        page.wait_for_timeout(1000)
        page.screenshot(path="verification/xmasfun_v7_1_hero.png")

        # 2. Scroll to Heavy Arsenal (Images)
        print("Scrolling to Arsenal...")
        page.evaluate("window.scrollTo(0, document.body.scrollHeight * 0.25)")
        page.wait_for_timeout(1500)
        page.screenshot(path="verification/xmasfun_v7_2_arsenal.png")

        # 3. Scroll to Elements
        print("Scrolling to Elements...")
        page.evaluate("window.scrollTo(0, document.body.scrollHeight * 0.55)")
        page.wait_for_timeout(1000)
        page.screenshot(path="verification/xmasfun_v7_3_elements.png")

        # 4. Scroll to Sanctuary (Plushies)
        print("Scrolling to Sanctuary...")
        page.evaluate("window.scrollTo(0, document.body.scrollHeight * 0.75)")
        page.wait_for_timeout(1500)
        page.screenshot(path="verification/xmasfun_v7_4_sanctuary.png")

        browser.close()
        print("Verification V7 complete.")

if __name__ == "__main__":
    verify_xmasfun_v7()
