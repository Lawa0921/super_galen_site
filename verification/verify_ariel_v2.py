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

        # Check for specific CHINESE text (Verification of translation)
        print("Checking Chinese content...")
        expect(page.locator("body")).to_contain_text("法規建築師")
        expect(page.locator("body")).to_contain_text("僕人式領導")
        expect(page.locator("body")).to_contain_text("織命者")

        # Check for new sections
        expect(page.locator("body")).to_contain_text("Regulatory Logic") # Stats
        expect(page.locator("body")).to_contain_text("Global Compliance") # Missions

        # Take screenshot of Hero section (Design Check)
        print("Taking hero screenshot...")
        os.makedirs("verification", exist_ok=True)
        page.screenshot(path="verification/ariel_v2_hero.png")

        # Scroll down to check layout (Zig-Zag)
        print("Scrolling...")
        page.evaluate("window.scrollTo(0, 1000)")
        page.wait_for_timeout(1000) # Wait for animation
        page.screenshot(path="verification/ariel_v2_section1.png")

        page.evaluate("window.scrollTo(0, 2000)")
        page.wait_for_timeout(1000)
        page.screenshot(path="verification/ariel_v2_section2.png")

        print("Done.")
        browser.close()

if __name__ == "__main__":
    run()
