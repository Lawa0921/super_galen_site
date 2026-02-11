
from playwright.sync_api import sync_playwright
import os

def run():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        # Emulate a desktop viewport
        context = browser.new_context(viewport={'width': 1280, 'height': 800})
        page = context.new_page()

        # Load the file
        file_url = f"file://{os.path.abspath('src/content/guild/xmasfun689.html')}"
        page.goto(file_url)

        # Wait for loader to disappear
        page.wait_for_timeout(2000)

        # Scroll down to the Heavy Machinery section (approx 2nd section)
        # The first section is Hero (margin-top 10vh)
        # The second is Earth & Steel

        # Scroll to the element containing "SECTOR 01: EARTH & STEEL"
        target = page.get_by_text("SECTOR 01: EARTH & STEEL")
        target.scroll_into_view_if_needed()

        # Wait for animations (opacity transition)
        page.wait_for_timeout(2000)

        # Take a screenshot of the viewport
        page.screenshot(path='verification/xmasfun_scroll.png')

        browser.close()

if __name__ == "__main__":
    run()
