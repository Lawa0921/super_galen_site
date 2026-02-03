from playwright.sync_api import sync_playwright, expect
import time

def run():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()

        url = "http://localhost:4321/guild/naka"
        print(f"Navigating to {url}")
        response = page.goto(url)
        print(f"Status: {response.status}")

        # Check for 404
        if response.status == 404:
             print("404 Error. Trying with .html extension")
             url = "http://localhost:4321/guild/naka.html"
             response = page.goto(url)
             print(f"Status: {response.status}")

        # Wait for loader to be hidden or removed
        try:
            print("Waiting for loader to disappear...")
            expect(page.locator("h1")).to_be_visible(timeout=15000)
            print("H1 is visible!")
        except Exception as e:
            print(f"Timeout waiting for H1: {e}")
            page.screenshot(path="verification/error_screenshot.png")
            browser.close()
            return

        # Wait for Three.js to init
        time.sleep(3)

        # Scroll to see sections
        print("Scrolling...")
        # Services Section
        page.evaluate("window.scrollTo(0, document.body.scrollHeight * 0.8)")
        time.sleep(2)
        page.screenshot(path="verification/naka_services.png")

        # Footer
        page.evaluate("window.scrollTo(0, document.body.scrollHeight)")
        time.sleep(2)
        page.screenshot(path="verification/naka_footer.png")

        print("Screenshots taken")
        browser.close()

if __name__ == "__main__":
    run()
