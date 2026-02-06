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
        expect(page).to_have_title("Ariel | The Alchemist of Order & Chaos")

        # Check for NEW Value Prop Content
        print("Checking content expansion...")
        expect(page.locator("body")).to_contain_text("The Bridge Between Science & Soul")
        expect(page.locator("body")).to_contain_text("Global Registration Strategy") # Service
        expect(page.locator("body")).to_contain_text("Document Processing Time") # Stat
        expect(page.locator("body")).to_contain_text("Talent Mapping") # Mystic Value

        # Take screenshot of Hero (Clean Avatar?)
        print("Taking Hero screenshot...")
        os.makedirs("verification", exist_ok=True)
        page.screenshot(path="verification/ariel_v4_hero.png")

        # Scroll to Service Section (Phase 1)
        print("Scrolling to Services...")
        page.evaluate("window.scrollTo(0, document.body.scrollHeight * 0.25)")
        page.wait_for_timeout(1000)
        page.screenshot(path="verification/ariel_v4_services.png")

        # Scroll to Mystic Section (Phase 3)
        print("Scrolling to Mystic...")
        page.evaluate("window.scrollTo(0, document.body.scrollHeight * 0.9)")
        page.wait_for_timeout(1000)
        page.screenshot(path="verification/ariel_v4_mystic.png")

        print("Done.")
        browser.close()

if __name__ == "__main__":
    run()
