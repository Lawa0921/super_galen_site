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

        # Check for NEW Magazine Features
        print("Checking magazine layout...")
        expect(page.locator(".sidebar")).to_be_visible() # Chapter Dots
        expect(page.locator("body")).to_contain_text("Chapter 01")
        expect(page.locator("body")).to_contain_text("The Digital Alchemist")

        # Take screenshot of Hero (Clean Avatar)
        print("Taking Hero screenshot...")
        os.makedirs("verification", exist_ok=True)
        page.screenshot(path="verification/ariel_v6_hero.png")

        # Scroll to Alchemist (Chapter 2)
        print("Scrolling to Chapter 2...")
        page.evaluate("window.scrollToSec(2)")
        page.wait_for_timeout(2000)
        page.screenshot(path="verification/ariel_v6_alchemist.png")

        # Scroll to Weaver (Chapter 3)
        print("Scrolling to Chapter 3...")
        page.evaluate("window.scrollToSec(3)")
        page.wait_for_timeout(2000)
        page.screenshot(path="verification/ariel_v6_weaver.png")

        print("Done.")
        browser.close()

if __name__ == "__main__":
    run()
