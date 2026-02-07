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

        # Check for NEW Deep Content
        print("Checking Deep Content...")
        expect(page.locator("body")).to_contain_text("人情味的解決方案")
        expect(page.locator("body")).to_contain_text("僕人式領導")

        # Check Footer
        print("Checking Footer...")
        expect(page.locator("body")).to_contain_text("共織願景")
        # Use more specific selector to avoid strict mode error
        expect(page.locator(".footer-link-back")).to_contain_text("返回公會大廳")

        # Take screenshot of Footer
        print("Taking Footer screenshot...")
        os.makedirs("verification", exist_ok=True)
        page.evaluate("window.scrollTo(0, document.body.scrollHeight)")
        page.wait_for_timeout(1000)
        page.screenshot(path="verification/ariel_v9_footer.png")

        print("Done.")
        browser.close()

if __name__ == "__main__":
    run()
