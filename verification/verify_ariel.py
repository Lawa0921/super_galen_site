from playwright.sync_api import sync_playwright, expect
import os

def run():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()

        # Go to the page
        print("Navigating to page...")
        # Ensure trailing slash handling
        response = page.goto("http://localhost:4321/guild/ariel.html")
        if response.status == 404:
            page.goto("http://localhost:4321/guild/ariel")

        # Check title
        print("Checking title...")
        expect(page).to_have_title("Ariel | The Alchemist of Order & Chaos")

        # Check for specific text
        print("Checking content...")
        expect(page.locator("h1")).to_contain_text("Ariel")
        expect(page.locator("body")).to_contain_text("Qilin Soul")
        expect(page.locator("body")).to_contain_text("Maya Angelou")

        # Take screenshot of Hero section
        print("Taking hero screenshot...")
        os.makedirs("verification", exist_ok=True)
        page.screenshot(path="verification/ariel_hero.png")

        # Scroll down to trigger animations
        print("Scrolling...")
        page.evaluate("window.scrollTo(0, 1000)")
        page.wait_for_timeout(1000) # Wait for animation
        page.screenshot(path="verification/ariel_scroll1.png")

        page.evaluate("window.scrollTo(0, 2000)")
        page.wait_for_timeout(1000)
        page.screenshot(path="verification/ariel_scroll2.png")

        print("Done.")
        browser.close()

if __name__ == "__main__":
    run()
