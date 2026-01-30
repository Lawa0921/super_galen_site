
import os
import time
from playwright.sync_api import sync_playwright, expect

def verify_fuxintang(page):
    print("Navigating...")
    page.goto("http://localhost:4000/guild/fuxintang.html", wait_until="networkidle")

    # Wait for loader
    print("Waiting for loader...")
    page.locator("#loader").wait_for(state="detached", timeout=10000)

    # Screenshot Hero (Check Fixed Avatar)
    print("Hero Screenshot...")
    page.screenshot(path="/home/jules/verification/fuxintang_v4_hero.png")

    # Check Avatar
    expect(page.locator(".avatar-sticker")).to_be_visible()

    # Scroll to Book
    print("Scrolling to Book...")
    page.mouse.wheel(0, 800)
    page.wait_for_timeout(1000)
    page.screenshot(path="/home/jules/verification/fuxintang_v4_book1.png")

    # Check Book Sections
    expect(page.locator(".recipe-book").first).to_be_visible()

    # Scroll to Legacy
    print("Scrolling to Legacy...")
    page.mouse.wheel(0, 800)
    page.wait_for_timeout(1000)
    page.screenshot(path="/home/jules/verification/fuxintang_v4_legacy.png")

    # Fortune Jar
    print("Checking Fortune Jar...")
    page.locator("#jar-trigger").click(force=True)
    page.locator("#shake-btn").click(force=True)
    page.wait_for_timeout(1000)
    expect(page.locator("#fortune-text")).not_to_be_empty()

    print("Verification Done.")

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
            page.screenshot(path="/home/jules/verification/failure_v4.png")
        finally:
            browser.close()
