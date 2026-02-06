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

        # Check for Narrative Elements
        print("Checking narrative content...")
        expect(page.locator("body")).to_contain_text("The Molecular Grid")
        expect(page.locator("body")).to_contain_text("The Alchemist's Transmutation")

        # Take screenshot of Phase 1: Lab (Hero)
        print("Taking Phase 1 screenshot...")
        os.makedirs("verification", exist_ok=True)
        page.screenshot(path="verification/ariel_v3_phase1.png")

        # Scroll to Phase 2: Unraveling
        print("Scrolling to Phase 2...")
        page.evaluate("window.scrollTo(0, document.body.scrollHeight * 0.4)")
        page.wait_for_timeout(2000) # Wait for color transition
        page.screenshot(path="verification/ariel_v3_phase2.png")

        # Scroll to Phase 3: Mystic
        print("Scrolling to Phase 3...")
        page.evaluate("window.scrollTo(0, document.body.scrollHeight)")
        page.wait_for_timeout(2000)
        page.screenshot(path="verification/ariel_v3_phase3.png")

        print("Done.")
        browser.close()

if __name__ == "__main__":
    run()
