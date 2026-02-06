
from playwright.sync_api import sync_playwright, expect
import time

def verify_sean_page():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()

        # 1. Navigate
        print("Navigating to http://localhost:4321/guild/sean...")
        try:
            page.goto("http://localhost:4321/guild/sean", timeout=60000)
        except Exception as e:
            print(f"Error navigating: {e}")
            browser.close()
            return

        # 2. Wait for content
        # Check Hero Title
        hero_title = page.locator("h1.hero-title")
        expect(hero_title).to_be_visible(timeout=10000)
        expect(hero_title).to_have_text("SEAN")
        print("Hero title verified.")

        # Check Avatar
        avatar = page.locator(".avatar-img")
        expect(avatar).to_be_visible()
        print("Avatar verified.")

        # Check Canvas presence (The cool 3D background)
        canvas = page.locator("#webgl-container canvas")
        expect(canvas).to_be_visible()
        print("WebGL Canvas verified.")

        # Wait a bit for entrance animations to settle
        time.sleep(3)
        page.screenshot(path="verification/sean_v2_hero.png")
        print("Screenshot: Hero section saved.")

        # 3. Scroll to Bio
        bio_section = page.locator("#sec-bio")
        bio_section.scroll_into_view_if_needed()
        time.sleep(2) # Wait for ScrollTrigger animation
        expect(page.locator("text=Origin Story")).to_be_visible()
        page.screenshot(path="verification/sean_v2_bio.png")
        print("Screenshot: Bio section saved.")

        # 4. Scroll to Services
        services_section = page.locator("#sec-services")
        services_section.scroll_into_view_if_needed()
        time.sleep(2)
        expect(page.locator("text=Mastery & Services")).to_be_visible()
        # Verify specific service cards
        expect(page.locator("text=Natal Chart")).to_be_visible()
        expect(page.locator("text=Career Path")).to_be_visible()
        page.screenshot(path="verification/sean_v2_services.png")
        print("Screenshot: Services section saved.")

        # 5. Scroll to Footer
        footer = page.locator("#sec-finale")
        footer.scroll_into_view_if_needed()
        time.sleep(2)
        expect(page.locator(".social-links")).to_be_visible()
        page.screenshot(path="verification/sean_v2_footer.png")
        print("Screenshot: Footer saved.")

        browser.close()

if __name__ == "__main__":
    verify_sean_page()
