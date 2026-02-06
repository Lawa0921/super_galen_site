
from playwright.sync_api import sync_playwright
import time

def verify_sean_page():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()

        # Navigate to the page (wait for server to be ready ideally, but we'll just wait a bit)
        print("Navigating to page...")
        try:
            page.goto("http://localhost:4321/guild/sean", timeout=60000)
        except Exception as e:
            print(f"Error navigating: {e}")
            browser.close()
            return

        # Wait for content to load
        page.wait_for_selector("h1.hero-title")
        print("Hero title found.")

        # Check for canvas
        canvas = page.locator("#webgl-container canvas")
        if canvas.count() > 0:
            print("WebGL Canvas found.")
        else:
            print("WebGL Canvas NOT found.")

        # Wait for animations (fade in)
        time.sleep(2)

        # Screenshot Hero
        page.screenshot(path="verification/sean_hero.png")
        print("Hero screenshot saved.")

        # Scroll down to Services
        page.evaluate("window.scrollTo(0, document.body.scrollHeight * 0.6)")
        time.sleep(2)
        page.screenshot(path="verification/sean_services.png")
        print("Services screenshot saved.")

        # Scroll to bottom
        page.evaluate("window.scrollTo(0, document.body.scrollHeight)")
        time.sleep(1)
        page.screenshot(path="verification/sean_footer.png")
        print("Footer screenshot saved.")

        browser.close()

if __name__ == "__main__":
    verify_sean_page()
