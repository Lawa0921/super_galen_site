from playwright.sync_api import sync_playwright
import time

def test_page():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        page.set_viewport_size({"width": 1920, "height": 1080})

        # Navigate to the naomiao77 page
        page.goto("http://localhost:4321/guild/naomiao77")

        # Wait for initial load
        page.wait_for_load_state('networkidle')
        time.sleep(2) # Allow three.js to render

        page.screenshot(path="verify_final_hero.png")

        # Scroll to story section
        page.evaluate("window.scrollTo(0, document.body.scrollHeight * 0.25)")
        time.sleep(1)
        page.screenshot(path="verify_final_story.png")

        # Scroll to gallery section to trigger horizontal scroll
        page.evaluate("window.scrollTo(0, document.body.scrollHeight * 0.65)")
        time.sleep(1)
        page.screenshot(path="verify_final_gallery.png")

        browser.close()

if __name__ == "__main__":
    test_page()
