
import os
from playwright.sync_api import sync_playwright

def verify_xmasfun_v12():
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

        # 1. Capture Initial State (Should show Hero Panel & Gear 1)
        print("Capturing Initial State...")
        page.screenshot(path="verification/xmasfun_v12_1_init.png")

        # 2. Scroll to Plasma Links
        print("Scrolling to Plasma Links...")
        page.evaluate("window.scrollTo(0, document.body.scrollHeight * 0.4)")
        page.wait_for_timeout(1500)
        page.screenshot(path="verification/xmasfun_v12_2_plasma.png")

        # 3. Scroll to Footer
        print("Scrolling to Footer...")
        page.evaluate("window.scrollTo(0, document.body.scrollHeight)")
        page.wait_for_timeout(1000)
        page.screenshot(path="verification/xmasfun_v12_3_footer.png")

        browser.close()
        print("Verification V12 complete.")

if __name__ == "__main__":
    verify_xmasfun_v12()
