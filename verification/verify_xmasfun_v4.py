
import os
from playwright.sync_api import sync_playwright

def verify_xmasfun_v4():
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

        # 1. Capture Intro (Hero)
        print("Capturing Intro...")
        page.wait_for_timeout(1000)
        page.screenshot(path="verification/xmasfun_v4_1_hero.png")

        # 2. Scroll to Heavy Metal (Excavator)
        print("Scrolling to Heavy Metal...")
        page.evaluate("window.scrollTo(0, document.body.scrollHeight * 0.3)")
        page.wait_for_timeout(1500)
        page.screenshot(path="verification/xmasfun_v4_2_heavy.png")

        # 3. Scroll to Magic (Elements)
        print("Scrolling to Magic...")
        page.evaluate("window.scrollTo(0, document.body.scrollHeight * 0.6)")
        page.wait_for_timeout(1500)
        page.screenshot(path="verification/xmasfun_v4_3_magic.png")

        # 4. Scroll to Finale (Sky)
        print("Scrolling to Finale...")
        page.evaluate("window.scrollTo(0, document.body.scrollHeight)")
        page.wait_for_timeout(1500)
        page.screenshot(path="verification/xmasfun_v4_4_finale.png")

        browser.close()
        print("Verification V4 complete.")

if __name__ == "__main__":
    verify_xmasfun_v4()
