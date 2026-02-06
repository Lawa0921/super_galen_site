from playwright.sync_api import sync_playwright

def verify_miglo():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()

        # Navigate to the page
        url = "http://localhost:4321/guild/miglo"
        print(f"Navigating to {url}")
        page.goto(url)

        # Wait for content to load (give GSAP time to potentially start)
        page.wait_for_timeout(3000)

        # Check title
        title = page.title()
        print(f"Page Title: {title}")
        assert "Miglo Jelly" in title

        # Check for specific elements
        # The Entrance screen might be overlaying, so we might need to click "BREWING..." or wait for it to disappear
        # In my code: load event -> delay 0.5s -> opacity 0 -> remove.
        # So after 3000ms it should be gone.

        # Check for "MIGLO JELLY" text
        # It's in .big-text. GSAP reveals it.
        # Check if it exists in DOM.
        hero = page.locator(".big-text")
        print("Checking for Hero Text...")
        # Force screenshot even if verify fails later
        page.screenshot(path="verification/miglo_screenshot.png", full_page=False)

        # Verify content
        assert hero.count() > 0

        print("Verification Successful")
        browser.close()

if __name__ == "__main__":
    verify_miglo()
