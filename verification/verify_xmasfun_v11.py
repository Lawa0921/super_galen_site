
import os
from playwright.sync_api import sync_playwright

def verify_xmasfun_v11():
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

        # 1. Capture Hero (Earth Gear)
        print("Capturing Hero (Earth)...")
        page.screenshot(path="verification/xmasfun_v11_1_earth.png")

        # 2. Scroll to Water
        print("Scrolling to Water...")
        page.evaluate("window.scrollTo(0, document.body.scrollHeight * 0.33)")
        page.wait_for_timeout(1500)
        page.screenshot(path="verification/xmasfun_v11_2_water.png")

        # 3. Scroll to Lightning
        print("Scrolling to Lightning...")
        page.evaluate("window.scrollTo(0, document.body.scrollHeight * 0.66)")
        page.wait_for_timeout(1500)
        page.screenshot(path="verification/xmasfun_v11_3_lightning.png")

        # 4. Scroll to Footer
        print("Scrolling to Footer...")
        page.evaluate("window.scrollTo(0, document.body.scrollHeight)")
        page.wait_for_timeout(1000)
        page.screenshot(path="verification/xmasfun_v11_4_footer.png")

        browser.close()
        print("Verification V11 complete.")

if __name__ == "__main__":
    verify_xmasfun_v11()
