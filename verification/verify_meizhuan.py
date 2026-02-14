from playwright.sync_api import sync_playwright, expect

def run():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()

        # Navigate to the page
        print("Navigating to http://localhost:4322/guild/meizhuan")
        page.goto("http://localhost:4322/guild/meizhuan")

        # Wait for content to load
        # Check for the name "石專豆頁"
        print("Waiting for content...")
        expect(page.locator("h1")).to_have_text("石專豆頁")

        # Check for "Engineering Core"
        expect(page.get_by_text("Engineering Core")).to_be_visible()

        # Take a screenshot
        print("Taking screenshot...")
        page.screenshot(path="verification/meizhuan_page.png", full_page=True)

        browser.close()
        print("Done.")

if __name__ == "__main__":
    run()
