
import os
from playwright.sync_api import sync_playwright

def verify_xmasfun_v10():
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

        # 1. Capture Hero (Battle HUD)
        print("Capturing Hero (Battle HUD)...")
        page.wait_for_timeout(1000)
        page.screenshot(path="verification/xmasfun_v10_1_hero.png")

        # 2. Scroll to Equipment (Armor Cards)
        print("Scrolling to Equipment...")
        page.evaluate("window.scrollTo(0, document.body.scrollHeight * 0.35)")
        page.wait_for_timeout(1000)
        page.screenshot(path="verification/xmasfun_v10_2_equipment.png")

        # 3. Scroll to Skills (Hex Grid)
        print("Scrolling to Skills...")
        page.evaluate("window.scrollTo(0, document.body.scrollHeight * 0.65)")
        page.wait_for_timeout(1000)
        page.screenshot(path="verification/xmasfun_v10_3_skills.png")

        # 4. Scroll to Sanctuary
        print("Scrolling to Sanctuary...")
        page.evaluate("window.scrollTo(0, document.body.scrollHeight)")
        page.wait_for_timeout(1000)
        page.screenshot(path="verification/xmasfun_v10_4_sanctuary.png")

        browser.close()
        print("Verification V10 complete.")

if __name__ == "__main__":
    verify_xmasfun_v10()
