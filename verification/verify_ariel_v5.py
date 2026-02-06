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

        # Check for READABILITY improvements (Solid backgrounds? We can't check css easily, but we check content is visible)
        print("Checking content visibility...")
        expect(page.locator("body")).to_contain_text("Regulatory Architect")
        expect(page.locator("body")).to_contain_text("-40%")

        # Take screenshot of Hero (Check Contrast)
        print("Taking Hero screenshot...")
        os.makedirs("verification", exist_ok=True)
        page.screenshot(path="verification/ariel_v5_readability_hero.png")

        # Scroll to Service Section (Phase 1)
        print("Scrolling to Services...")
        page.evaluate("window.scrollTo(0, document.body.scrollHeight * 0.25)")
        page.wait_for_timeout(1000)
        page.screenshot(path="verification/ariel_v5_readability_services.png")

        print("Done.")
        browser.close()

if __name__ == "__main__":
    run()
