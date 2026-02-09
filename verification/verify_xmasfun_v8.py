
import os
from playwright.sync_api import sync_playwright

def verify_xmasfun_v8():
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

        # 1. Capture Hero (Magitek Theme)
        print("Capturing Hero...")
        page.wait_for_timeout(1000)
        page.screenshot(path="verification/xmasfun_v8_1_hero.png")

        # 2. Scroll to Skill Tree
        print("Scrolling to Skill Tree...")
        page.evaluate("window.scrollTo(0, document.body.scrollHeight * 0.25)")
        page.wait_for_timeout(1000)
        page.screenshot(path="verification/xmasfun_v8_2_tree.png")

        # 3. Scroll to Arsenal (Images)
        print("Scrolling to Arsenal...")
        page.evaluate("window.scrollTo(0, document.body.scrollHeight * 0.5)")
        page.wait_for_timeout(1000)
        page.screenshot(path="verification/xmasfun_v8_3_arsenal.png")

        # 4. Scroll to Sanctuary
        print("Scrolling to Sanctuary...")
        page.evaluate("window.scrollTo(0, document.body.scrollHeight)")
        page.wait_for_timeout(1000)
        page.screenshot(path="verification/xmasfun_v8_4_sanctuary.png")

        browser.close()
        print("Verification V8 complete.")

if __name__ == "__main__":
    verify_xmasfun_v8()
