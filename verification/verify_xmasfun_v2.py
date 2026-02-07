
import os
from playwright.sync_api import sync_playwright

def verify_xmasfun_revised():
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

        # 1. Capture Top (Hero + Ground)
        print("Capturing Hero/Ground section...")
        page.screenshot(path="verification/xmasfun_v2_1_hero.png")

        # 2. Scroll to Machinery (Ground/Stats)
        print("Scrolling to Machinery...")
        page.evaluate("window.scrollTo(0, document.body.scrollHeight * 0.3)")
        page.wait_for_timeout(1000) # Wait for animation
        page.screenshot(path="verification/xmasfun_v2_2_machines.png")

        # 3. Scroll to Air (Elements)
        print("Scrolling to Air...")
        page.evaluate("window.scrollTo(0, document.body.scrollHeight * 0.6)")
        page.wait_for_timeout(1000)
        page.screenshot(path="verification/xmasfun_v2_3_air.png")

        # 4. Scroll to Bottom (Sky/Finale)
        print("Scrolling to Sky...")
        page.evaluate("window.scrollTo(0, document.body.scrollHeight)")
        page.wait_for_timeout(1000)
        page.screenshot(path="verification/xmasfun_v2_4_sky.png")

        browser.close()
        print("Verification V2 complete.")

if __name__ == "__main__":
    verify_xmasfun_revised()
