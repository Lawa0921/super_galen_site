
import os
from playwright.sync_api import sync_playwright

def verify_xmasfun_v13():
    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page()

        # Navigate to the page
        url = "http://localhost:4325/guild/xmasfun689"
        print(f"Navigating to {url}...")
        page.goto(url)

        # Wait for loader
        print("Waiting for loader...")
        page.wait_for_timeout(1000)

        # Ensure directory exists
        if not os.path.exists("verification"):
            os.makedirs("verification")

        # 1. Capture Hero (Left Content, Right Gear)
        print("Capturing Hero (Split Layout)...")
        page.screenshot(path="verification/xmasfun_v13_1_hero.png")

        # 2. Scroll to Earth Sector
        print("Scrolling to Earth...")
        page.evaluate("window.scrollTo(0, document.body.scrollHeight * 0.3)")
        page.wait_for_timeout(1500)
        page.screenshot(path="verification/xmasfun_v13_2_earth.png")

        # 3. Scroll to Plasma/Footer
        print("Scrolling to Footer...")
        page.evaluate("window.scrollTo(0, document.body.scrollHeight)")
        page.wait_for_timeout(1000)
        page.screenshot(path="verification/xmasfun_v13_3_footer.png")

        browser.close()
        print("Verification V13 complete.")

if __name__ == "__main__":
    verify_xmasfun_v13()
