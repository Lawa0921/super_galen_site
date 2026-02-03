from playwright.sync_api import Page, expect, sync_playwright
import time

def test_xiaoshi_page(page: Page):
    # Navigate to the page
    page.goto("http://localhost:4321/guild/xiaoshi")

    # Wait for the page to load
    # We check for the loader to appear and then disappear, or just wait for main content
    # The loader has text "SYSTEM INITIALIZING"
    # We can wait for .glitch-text to be visible

    # Wait for loader to disappear (it takes about 1.7s in the code)
    # But for safety we wait for the main content
    page.wait_for_selector("h1.glitch-text", state="visible", timeout=10000)

    # Assert title
    expect(page).to_have_title("Rakuten Little Lion | The Cyber Drifter")

    # Assert text presence
    expect(page.get_by_text("THE DRIFTER")).to_be_visible()
    expect(page.get_by_text("FROM THE SHADOWS")).to_be_visible()

    # Scroll down to trigger animations
    page.evaluate("window.scrollTo(0, document.body.scrollHeight)")
    time.sleep(2) # Wait for animations

    # Take screenshot
    page.screenshot(path="verification/xiaoshi.png", full_page=True)

if __name__ == "__main__":
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        try:
            test_xiaoshi_page(page)
        except Exception as e:
            print(f"Error: {e}")
            page.screenshot(path="verification/error.png")
        finally:
            browser.close()
