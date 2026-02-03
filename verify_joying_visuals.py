
from playwright.sync_api import sync_playwright
import time

def verify_joying(page):
    page.goto("http://localhost:8000/src/content/guild/joying.html")
    page.set_viewport_size({"width": 1280, "height": 800})

    # 1. Verify Intro & Cursor
    print("Verifying Intro & Cursor...")
    # Move mouse to center to engage custom cursor
    page.mouse.move(640, 400)
    time.sleep(1) # Wait for cursor to catch up
    page.screenshot(path="/home/jules/verification/1_intro_cursor.png")

    # Check z-index computed style via JS
    cursor_z = page.evaluate("window.getComputedStyle(document.querySelector('.cursor-ring')).zIndex")
    intro_z = page.evaluate("window.getComputedStyle(document.getElementById('intro-overlay')).zIndex")
    print(f"Cursor Z-Index: {cursor_z} (Expected: 20000)")
    print(f"Intro Z-Index: {intro_z} (Expected: 10000)")

    # 2. Unlock Page
    print("Unlocking page...")
    page.click("#start-target")
    time.sleep(2) # Wait for unlock animation

    # 3. Scroll to Finale
    print("Scrolling to finale...")
    page.evaluate("window.scrollTo(0, document.body.scrollHeight)")
    time.sleep(2) # Wait for scroll scrub animations

    # Verify Shutdown Overlay Opacity
    shutdown_opacity = page.evaluate("window.getComputedStyle(document.getElementById('shutdown-overlay')).opacity")
    print(f"Shutdown Overlay Opacity: {shutdown_opacity} (Expected: ~0.85)")

    page.screenshot(path="/home/jules/verification/2_finale_shutdown.png")

if __name__ == "__main__":
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        try:
            verify_joying(page)
        except Exception as e:
            print(f"Error: {e}")
        finally:
            browser.close()
