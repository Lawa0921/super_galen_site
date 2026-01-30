
import os
import time
import re
from playwright.sync_api import sync_playwright, expect

def verify_fuxintang(page):
    # Navigate
    print("Navigating...")
    page.goto("http://localhost:4000/guild/fuxintang.html", wait_until="networkidle")

    # Wait for Loader to vanish
    print("Waiting for loader...")
    page.locator("#loader").wait_for(state="detached", timeout=10000)

    # Take Hero Screenshot
    print("Taking Hero Screenshot...")
    page.screenshot(path="/home/jules/verification/fuxintang_cottage_hero.png")

    # Check Hero Title (Use specific H1 selector to avoid conflict)
    hero_title = page.locator("h1.handwritten-title")
    expect(hero_title).to_be_visible()
    print(f"Title Text: {hero_title.inner_text()}")

    # Scroll to Bio
    print("Scrolling to Bio...")
    page.mouse.wheel(0, 1000)
    page.wait_for_timeout(1000)
    page.screenshot(path="/home/jules/verification/fuxintang_cottage_bio.png")

    # Click Cookie Jar
    print("Clicking Cookie Jar...")
    jar_trigger = page.locator("#cookie-jar-trigger")
    jar_trigger.click(force=True)

    # Wait for Modal
    print("Waiting for modal...")
    modal = page.locator("#cookie-modal")
    expect(modal).to_have_class(re.compile(r"active"), timeout=5000)

    # Click Open
    print("Opening Jar...")
    open_btn = page.locator("#open-jar-btn")
    open_btn.click(force=True)

    # Wait for Animation
    page.wait_for_timeout(2000)

    # Verify Fortune
    print("Verifying Fortune...")
    slip_text = page.locator(".slip-text")
    expect(slip_text).not_to_be_empty()
    print(f"Fortune: {slip_text.inner_text()}")

    page.screenshot(path="/home/jules/verification/fuxintang_cottage_fortune.png")

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
            page.screenshot(path="/home/jules/verification/failure_cottage.png")
        finally:
            browser.close()
