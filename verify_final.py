from playwright.sync_api import sync_playwright
import time

def run():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(viewport={"width": 1920, "height": 1080})
        page = context.new_page()

        # Navigate to the local dev server
        page.goto("http://localhost:4321/guild/asingingwind")

        # Wait a bit
        time.sleep(5)

        # Take a screenshot
        page.screenshot(path="verification_final_start.png")

        # Scroll down to trigger GSAP animations
        page.evaluate("window.scrollTo(0, 1500)")
        time.sleep(3)

        # Take a screenshot of the scrolled state
        page.screenshot(path="verification_final_mid.png")

        browser.close()

if __name__ == "__main__":
    run()
