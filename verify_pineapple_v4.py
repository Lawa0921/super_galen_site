
import os
import time
from playwright.sync_api import sync_playwright

def verify_pineapple_p5():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        # Using a large viewport to see full layout
        page = browser.new_page(viewport={"width": 1400, "height": 1000})

        if not os.path.exists("verification"):
            os.makedirs("verification")

        print("Connecting to page...")
        try:
            # Assuming server is running at port 4000
            page.goto("http://localhost:4000/guild/pineapple.html")
        except Exception as e:
            print(f"Error connecting: {e}")
            return

        time.sleep(3) # Wait for p5 init and Hero animations

        # 1. Hero Screenshot
        page.screenshot(path="verification/pineapple_v4_p5_hero.png")
        print("Hero screenshot taken.")

        # 2. Scroll to Mission (Glass Card)
        page.evaluate("window.scrollTo(0, 800)")
        time.sleep(1.5)
        page.screenshot(path="verification/pineapple_v4_p5_mission.png")
        print("Mission screenshot taken.")

        # 3. Scroll to Awards
        page.evaluate("window.scrollTo(0, 1600)")
        time.sleep(1.5)
        page.screenshot(path="verification/pineapple_v4_p5_awards.png")
        print("Awards screenshot taken.")

        # 4. Scroll to Footer
        page.evaluate("window.scrollTo(0, document.body.scrollHeight)")
        time.sleep(1.5)
        page.screenshot(path="verification/pineapple_v4_p5_footer.png")
        print("Footer screenshot taken.")

        browser.close()

if __name__ == "__main__":
    verify_pineapple_p5()
