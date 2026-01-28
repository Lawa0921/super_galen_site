from playwright.sync_api import sync_playwright
import time

def run():
    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page()

        print("Navigating to page...")
        page.goto("http://localhost:4000/guild/pineapple.html")
        page.wait_for_timeout(2000)

        # Click start
        print("Clicking Start...")
        page.click("#startBtn")
        page.wait_for_timeout(3000)

        # Scroll to first station (Intro)
        print("Scrolling...")
        page.mouse.wheel(0, 1000)
        page.wait_for_timeout(2000)

        # Click in center to trigger raycaster on the content
        # The first station is at t=0.05.
        # It should be roughly in front.
        print("Clicking screen to trigger modal...")
        width = page.viewport_size['width']
        height = page.viewport_size['height']

        # Try center
        page.mouse.click(width / 2, height / 2)
        page.wait_for_timeout(500)

        # Try slightly right (based on screenshot)
        page.mouse.click(width * 0.6, height / 2)
        page.wait_for_timeout(500)

        # Check for modal
        modal = page.locator("#infoModal")
        if "active" in modal.get_attribute("class"):
            print("Modal successfully opened!")
        else:
            print("Modal did NOT open.")

        page.screenshot(path="/home/jules/verification/pineapple_v3_modal.png")
        print("Screenshot saved.")

        browser.close()

if __name__ == "__main__":
    run()
