from playwright.sync_api import sync_playwright
import time

def verify_miglo():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        page.set_viewport_size({"width": 1280, "height": 800})

        # Navigate to the page
        url = "http://localhost:4321/guild/miglo"
        print(f"Navigating to {url}")
        page.goto(url)

        # Wait for entrance animation
        page.wait_for_timeout(4000)

        # Verify Hero Text exists
        assert page.locator(".big-text").count() > 0
        print("Hero found.")

        # Scroll to Services Section (approx 45%)
        # 1000vh total. 45% of scroll height.
        print("Scrolling to Services...")
        page.evaluate("window.scrollTo(0, document.body.scrollHeight * 0.45)")
        page.wait_for_timeout(2000)
        page.screenshot(path="verification/miglo_services.png")

        # Verify Services text
        content = page.content()
        assert "花香果凍工藝" in content
        print("Services section verified.")

        # Scroll to Gallery Section (approx 90%)
        print("Scrolling to Gallery...")
        page.evaluate("window.scrollTo(0, document.body.scrollHeight * 0.90)")
        page.wait_for_timeout(2000)
        page.screenshot(path="verification/miglo_gallery.png")

        # Verify Gallery images exist and are visible
        # We look for .g-item
        gallery_items = page.locator(".g-item")
        count = gallery_items.count()
        print(f"Gallery items found: {count}")
        assert count >= 7

        print("Verification Successful")
        browser.close()

if __name__ == "__main__":
    verify_miglo()
