
import os
import time
from playwright.sync_api import sync_playwright, expect

def verify_fuxintang(page):
    print("Navigating...")
    page.goto("http://localhost:4000/guild/fuxintang.html", wait_until="networkidle")

    # Wait for loader
    print("Waiting for loader...")
    page.locator("#loader").wait_for(state="detached", timeout=10000)

    # Verify Content Sections
    sections = ["hero", "journey", "ingredients", "menu"]
    for sec in sections:
        print(f"Checking section: {sec}")
        expect(page.locator(f".section.{sec}")).to_be_visible()
        page.screenshot(path=f"/home/jules/verification/fuxintang_section_{sec}.png")
        page.mouse.wheel(0, 800)
        page.wait_for_timeout(500)

    # Verify Timeline Items
    print("Checking Timeline...")
    timeline_items = page.locator(".timeline-item")
    expect(timeline_items).to_have_count(4)

    # Verify Ingredients
    print("Checking Ingredients...")
    expect(page.locator(".ingredient-circle")).to_have_count(3)

    # Verify Fortune Jar
    print("Checking Jar...")
    jar = page.locator("#jar-trigger")
    jar.click(force=True)
    expect(page.locator("#fortune-modal")).to_have_class("modal-overlay active")

    print("Shaking...")
    page.locator("#shake-btn").click(force=True)
    page.wait_for_timeout(1000)

    fortune = page.locator("#fortune-text")
    expect(fortune).not_to_be_empty()
    print(f"Fortune: {fortune.inner_text()}")

    page.screenshot(path="/home/jules/verification/fuxintang_final_full.png")

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
