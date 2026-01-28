from playwright.sync_api import sync_playwright
import time

def run():
    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page()

        print("Navigating to page...")
        page.goto("http://localhost:4000/guild/pineapple.html")
        page.wait_for_timeout(2000)

        # Screenshot Start
        page.screenshot(path="/home/jules/verification/pineapple_v3_sunny_start.png")
        print("Screenshot Start saved.")

        # Click start
        print("Clicking Start...")
        page.click("#startBtn")
        page.wait_for_timeout(3000)

        # Screenshot Initial View
        page.screenshot(path="/home/jules/verification/pineapple_v3_sunny_world.png")
        print("Screenshot World saved.")

        # Scroll
        print("Scrolling...")
        page.mouse.wheel(0, 3000) # Significant scroll
        page.wait_for_timeout(2000)

        # Screenshot Mid View
        page.screenshot(path="/home/jules/verification/pineapple_v3_sunny_mid.png")
        print("Screenshot Mid saved.")

        browser.close()

if __name__ == "__main__":
    run()
