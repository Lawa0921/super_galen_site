
import os
import time
from playwright.sync_api import sync_playwright, expect

def verify_fuxintang(page):
    print("Navigating...")
    page.goto("http://localhost:4000/guild/fuxintang.html", wait_until="networkidle")

    # Wait for loader
    print("Waiting for loader...")
    page.locator("#loader").wait_for(state="detached", timeout=10000)

    # Screenshot Hero (Walking Avatar should be visible)
    print("Hero Screenshot...")
    page.screenshot(path="/home/jules/verification/fuxintang_final_hero.png")

    # Scroll to Timeline
    print("Scrolling...")
    page.mouse.wheel(0, 1000)
    page.wait_for_timeout(1000)

    # Check if cards are visible (GSAP revealed)
    cards = page.locator(".timeline-card")
    expect(cards.first).to_be_visible()

    # Hover effect test (Screenshot comparison not possible, but we can log)
    print("Hovering timeline card...")
    cards.first.hover()
    page.wait_for_timeout(500)

    # Check Interactive Ecology (Click Ground)
    print("Clicking Ground (Raycasting)...")
    # Click somewhere in the canvas background
    page.mouse.click(100, 500)
    page.wait_for_timeout(1000) # Wait for spawn animation
    page.screenshot(path="/home/jules/verification/fuxintang_raycast.png")

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
            page.screenshot(path="/home/jules/verification/failure_final.png")
        finally:
            browser.close()
