from playwright.sync_api import sync_playwright, expect

def run():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        page.set_viewport_size({"width": 1280, "height": 800})

        print("Navigating...")
        page.goto("http://localhost:4322/guild/meizhuan")
        page.wait_for_timeout(1000)

        # 1. Hero Screenshot
        page.screenshot(path="verification/step1_hero.png")

        # 2. Scroll to Engineering Core
        print("Scrolling to Engineering Core...")
        el = page.get_by_text("Engineering Core")
        el.scroll_into_view_if_needed()
        page.wait_for_timeout(1000) # Wait for animation
        page.screenshot(path="verification/step2_engineering.png")

        # 3. Scroll to The Ride
        print("Scrolling to The Ride...")
        el = page.get_by_text("The Ride")
        el.scroll_into_view_if_needed()
        page.wait_for_timeout(1000)
        page.screenshot(path="verification/step3_ride.png")

        browser.close()

if __name__ == "__main__":
    run()
