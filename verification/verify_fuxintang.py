
import os
import time
import re
from playwright.sync_api import sync_playwright, expect

def verify_fuxintang(page):
    # Capture Console
    page.on("console", lambda msg: print(f"CONSOLE: {msg.text}"))

    # Navigate
    print("Navigating...")
    page.goto("http://localhost:4000/guild/fuxintang.html", wait_until="networkidle")

    # Wait for Loader to disappear completely
    print("Waiting for loader to vanish...")
    page.locator("#loader").wait_for(state="detached", timeout=10000)

    # Take Hero Screenshot
    print("Taking Hero Screenshot...")
    page.screenshot(path="/home/jules/verification/fuxintang_hero_final.png")

    # Scroll to ensure everything is rendered
    page.mouse.wheel(0, 500)
    page.wait_for_timeout(500)

    # Click Oracle Trigger
    print("Clicking Oracle Trigger...")
    oracle_trigger = page.locator("#oracle-trigger")

    # Check bounding box
    box = oracle_trigger.bounding_box()
    print(f"Trigger Box: {box}")

    oracle_trigger.click(force=True)

    # Check Overlay Class
    print("Checking overlay...")
    overlay = page.locator("#oracle-overlay")
    # Wait for class to change
    expect(overlay).to_have_class(re.compile(r"active"), timeout=5000)

    # Click Divine
    print("Clicking Divine Button...")
    divine_btn = page.locator("#divine-btn")
    divine_btn.click(force=True)

    # Wait for Animation
    page.wait_for_timeout(2000)

    # Verify Fate
    fate_text = page.locator(".fate-text")
    expect(fate_text).not_to_be_empty()
    print(f"Fate text: {fate_text.inner_text()}")

    page.screenshot(path="/home/jules/verification/fuxintang_oracle_final.png")

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
            page.screenshot(path="/home/jules/verification/failure_final.png")
        finally:
            browser.close()
