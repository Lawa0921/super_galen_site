
import os
from playwright.sync_api import sync_playwright

def verify_xmasfun_v5():
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

        # 1. Capture Hero (p5.js background)
        print("Capturing Hero...")
        page.wait_for_timeout(2000) # Wait for p5.js to draw a bit
        page.screenshot(path="verification/xmasfun_v5_1_hero.png")

        # 2. Scroll to Heavy Metal (FontAwesome Icons)
        print("Scrolling to Heavy Metal...")
        page.evaluate("window.scrollTo(0, document.body.scrollHeight * 0.3)")
        page.wait_for_timeout(1000)
        page.screenshot(path="verification/xmasfun_v5_2_heavy.png")

        # 3. Scroll to Flow (Water/Elec)
        print("Scrolling to Flow...")
        page.evaluate("window.scrollTo(0, document.body.scrollHeight * 0.6)")
        page.wait_for_timeout(1000)
        page.screenshot(path="verification/xmasfun_v5_3_flow.png")

        # 4. Scroll to Personal (Avatar)
        print("Scrolling to Personal...")
        page.evaluate("window.scrollTo(0, document.body.scrollHeight)")
        page.wait_for_timeout(1000)
        page.screenshot(path="verification/xmasfun_v5_4_personal.png")

        browser.close()
        print("Verification V5 complete.")

if __name__ == "__main__":
    verify_xmasfun_v5()
