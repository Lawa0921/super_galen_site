
import os
import time
from playwright.sync_api import sync_playwright

def verify_pineapple_final():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page(viewport={'width': 1920, 'height': 1080})

        page.goto("http://localhost:4000/guild/pineapple.html")
        time.sleep(5)

        # Scroll to Bio
        page.evaluate("window.scrollTo(0, 1200)")
        time.sleep(2)

        if not os.path.exists("verification"):
            os.makedirs("verification")

        screenshot_path = "verification/pineapple_final.png"
        page.screenshot(path=screenshot_path)
        print(f"Captured {screenshot_path}")

        browser.close()

if __name__ == "__main__":
    verify_pineapple_final()
