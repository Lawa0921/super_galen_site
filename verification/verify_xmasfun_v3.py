
import os
from playwright.sync_api import sync_playwright

def verify_xmasfun_v3():
    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page()

        # Navigate to the page
        url = "http://localhost:4325/guild/xmasfun689"
        print(f"Navigating to {url}...")
        page.goto(url)

        # Wait for Boot Screen to vanish
        print("Waiting for boot sequence...")
        page.wait_for_timeout(2000)

        # Ensure directory exists
        if not os.path.exists("verification"):
            os.makedirs("verification")

        # 1. Capture HUD & Intro
        print("Capturing HUD/Intro...")
        page.screenshot(path="verification/xmasfun_v3_1_hud.png")

        # 2. Travel to Machines (Z = -20 approx)
        print("Traveling to Machines...")
        page.evaluate("window.scrollTo(0, document.body.scrollHeight * 0.33)")
        page.wait_for_timeout(1000)
        page.screenshot(path="verification/xmasfun_v3_2_machines.png")

        # 3. Travel to Elements (Z = -50 approx)
        print("Traveling to Elements...")
        page.evaluate("window.scrollTo(0, document.body.scrollHeight * 0.66)")
        page.wait_for_timeout(1000)
        page.screenshot(path="verification/xmasfun_v3_3_elements.png")

        # 4. Travel to Finale (Z = -80 approx)
        print("Traveling to Finale...")
        page.evaluate("window.scrollTo(0, document.body.scrollHeight)")
        page.wait_for_timeout(1000)
        page.screenshot(path="verification/xmasfun_v3_4_finale.png")

        browser.close()
        print("Verification V3 complete.")

if __name__ == "__main__":
    verify_xmasfun_v3()
