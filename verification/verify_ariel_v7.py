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
        expect(page).to_have_title("Ariel | 秩序與混沌的煉金術師")

        # Check for NEW Traditional Chinese Headers
        print("Checking Chinese Cinematic Layout...")
        expect(page.locator("body")).to_contain_text("秩序建築師")
        expect(page.locator("body")).to_contain_text("數位煉金術")
        expect(page.locator("body")).to_contain_text("直覺織命者")

        # Take screenshot of Hero
        print("Taking Hero screenshot...")
        os.makedirs("verification", exist_ok=True)
        page.screenshot(path="verification/ariel_v7_hero.png")

        # Scroll to Phase 1 (Law)
        print("Scrolling to Law...")
        page.evaluate("window.scrollTo(0, window.innerHeight)")
        page.wait_for_timeout(1000)
        page.screenshot(path="verification/ariel_v7_law.png")

        # Scroll to Phase 2 (Alchemy)
        print("Scrolling to Alchemy...")
        page.evaluate("window.scrollTo(0, window.innerHeight * 2)")
        page.wait_for_timeout(1000)
        page.screenshot(path="verification/ariel_v7_alchemy.png")

        print("Done.")
        browser.close()

if __name__ == "__main__":
    run()
