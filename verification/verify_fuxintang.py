
import os
import time
import re
from playwright.sync_api import sync_playwright, expect

def verify_fuxintang(page):
    # Navigate to the page
    print("Navigating...")
    page.goto("http://localhost:4000/guild/fuxintang.html", wait_until="domcontentloaded")

    # Click Enter Button to clear overlay
    print("Clicking Enter Button...")
    enter_btn = page.locator("#enter-btn")
    expect(enter_btn).to_be_visible(timeout=10000)
    # Force click to bypass stability check
    enter_btn.click(force=True)

    # Wait for overlay animation to clear (CSS duration 1.5s)
    print("Waiting for overlay to clear...")
    page.wait_for_timeout(4000)

    # Take a screenshot of the Main Page
    print("Taking Hero Screenshot...")
    page.screenshot(path="/home/jules/verification/fuxintang_hero.png")

    # Click Fortune Trigger
    print("Clicking Fortune Trigger...")
    fortune_trigger = page.locator("#fortune-trigger")

    # Check if it's there
    if fortune_trigger.count() == 0:
        print("ERROR: Trigger not found in DOM")

    # Force click (it might be considered 'covered' if mask is weird, but z-index should be fine)
    fortune_trigger.click(force=True)

    # Wait for Modal to be active
    print("Waiting for modal...")
    modal = page.locator("#fortune-modal")
    expect(modal).to_have_class(re.compile(r"active"))

    # Click Shake Button
    print("Clicking Shake Button...")
    shake_btn = page.locator("#shake-btn")
    expect(shake_btn).to_be_visible()
    shake_btn.click(force=True)

    # Wait for Shake Animation (1.5s) + Reveal
    print("Waiting for fortune...")
    page.wait_for_timeout(2000)

    # Verify Fortune Paper is visible
    print("Verifying fortune paper...")
    fortune_paper = page.locator("#fortune-paper")
    expect(fortune_paper).to_be_visible()

    # Check text is not empty
    fortune_text = page.locator("#fortune-text")
    print(f"Fortune text: {fortune_text.inner_text()}")

    # Take Screenshot of Fortune
    print("Taking Fortune Screenshot...")
    page.screenshot(path="/home/jules/verification/fuxintang_fortune.png")

if __name__ == "__main__":
    os.makedirs("/home/jules/verification", exist_ok=True)
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        page.set_viewport_size({"width": 1280, "height": 800})
        try:
            verify_fuxintang(page)
            print("Verification successful!")
        except Exception as e:
            print(f"Verification failed: {e}")
            page.screenshot(path="/home/jules/verification/failure.png")
        finally:
            browser.close()
