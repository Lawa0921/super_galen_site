from playwright.sync_api import sync_playwright, expect

def run():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()

        # Go to the page
        print("Navigating to page...")
        page.goto("http://localhost:4321/guild/ariel")

        # Wait for the loader to disappear
        print("Waiting for loader...")
        page.wait_for_selector("#loader", state="hidden", timeout=10000)

        # Check title
        print("Checking title...")
        expect(page).to_have_title("Ariel | The Mystic Regulator")

        # Take screenshot of Hero section
        print("Taking hero screenshot...")
        page.screenshot(path="verification/ariel_hero.png")

        # Scroll down to trigger animations
        print("Scrolling...")
        page.evaluate("window.scrollTo(0, document.body.scrollHeight / 3)")
        page.wait_for_timeout(1000) # Wait for animation
        page.screenshot(path="verification/ariel_scroll1.png")

        page.evaluate("window.scrollTo(0, document.body.scrollHeight * 2 / 3)")
        page.wait_for_timeout(1000)
        page.screenshot(path="verification/ariel_scroll2.png")

        print("Done.")
        browser.close()

if __name__ == "__main__":
    run()
