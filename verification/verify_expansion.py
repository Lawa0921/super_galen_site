
from playwright.sync_api import sync_playwright

def verify_content_expansion():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page(viewport={'width': 1280, 'height': 800})

        url = "http://localhost:4322/guild/xiaoshi"
        print(f"Navigating to {url}...")
        page.goto(url)

        # Wait for content
        page.wait_for_selector(".hero-title")

        # Check for new sections
        stats_visible = page.is_visible("#sec-stats")
        missions_visible = page.is_visible("#sec-missions")

        print(f"Stats Section Visible: {stats_visible}")
        print(f"Missions Section Visible: {missions_visible}")

        if stats_visible and missions_visible:
            print("PASS: New sections detected.")
        else:
            print("FAIL: Missing new sections.")

        # Take a screenshot of the Stats section
        if stats_visible:
            print("Scrolling to Stats...")
            page.locator("#sec-stats").scroll_into_view_if_needed()
            page.wait_for_timeout(1000) # Wait for animation
            page.screenshot(path="verification/xiaoshi_stats.png")

        # Take a screenshot of the Missions section
        if missions_visible:
            print("Scrolling to Missions...")
            page.locator("#sec-missions").scroll_into_view_if_needed()
            page.wait_for_timeout(1000)
            page.screenshot(path="verification/xiaoshi_missions.png")

        browser.close()

if __name__ == "__main__":
    verify_content_expansion()
