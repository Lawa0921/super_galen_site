
import os
from playwright.sync_api import sync_playwright

def verify_xmasfun_v9():
    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page()

        # Navigate to the page
        url = "http://localhost:4325/guild/xmasfun689"
        print(f"Navigating to {url}...")
        page.goto(url)

        # Ensure directory exists
        if not os.path.exists("verification"):
            os.makedirs("verification")

        # 1. Capture Seal (Loading)
        print("Capturing Seal...")
        page.wait_for_timeout(1000)
        page.screenshot(path="verification/xmasfun_v9_1_seal.png")

        # 2. Click Seal & Capture Hero
        print("Breaking Seal...")
        page.click("#seal-overlay")
        page.wait_for_timeout(2000) # Wait for animation
        page.screenshot(path="verification/xmasfun_v9_2_hero.png")

        # 3. Scroll to Golems
        print("Scrolling to Golems...")
        page.evaluate("window.scrollTo(0, document.body.scrollHeight * 0.3)")
        page.wait_for_timeout(1000)
        page.screenshot(path="verification/xmasfun_v9_3_golems.png")

        # 4. Scroll to Footer (Threads Icon Check)
        print("Scrolling to Footer...")
        page.evaluate("window.scrollTo(0, document.body.scrollHeight)")
        page.wait_for_timeout(1000)
        page.screenshot(path="verification/xmasfun_v9_4_footer.png")

        browser.close()
        print("Verification V9 complete.")

if __name__ == "__main__":
    verify_xmasfun_v9()
