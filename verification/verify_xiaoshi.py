
from playwright.sync_api import sync_playwright
import time

def verify_xiaoshi():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page(viewport={'width': 1280, 'height': 800})

        url = "http://localhost:4322/guild/xiaoshi"
        print(f"Navigating to {url}...")
        page.goto(url)

        # Wait for content to load
        page.wait_for_selector(".hero-title")
        print("Page loaded.")

        # Check initial load
        page.screenshot(path="verification/xiaoshi_top.png")

        # Scroll to bottom
        print("Scrolling to bottom...")
        page.evaluate("window.scrollTo(0, document.body.scrollHeight)")

        # Wait for GSAP scrub to catch up
        time.sleep(2)

        # Take screenshot of bottom
        page.screenshot(path="verification/xiaoshi_bottom.png")
        print("Screenshots taken.")

        # Verify Footer Text
        footer_text = page.locator(".site-footer").text_content()
        print(f"Footer Text: '{footer_text}'")
        if "2024" in footer_text or "Xiaoshi" in footer_text:
             # Exception: "Xiaoshi" might be in the title, but check for copyright string
             if "All Rights Reserved" in footer_text:
                 print("FAIL: Copyright text still present.")
             else:
                 print("PASS: Copyright text removed.")
        else:
             print("PASS: Copyright text removed.")

        # Verify Rider Position
        rider = page.locator("#rider-container")
        box = rider.bounding_box()
        viewport = page.viewport_size

        # Center of rider
        rider_x = box['x'] + box['width']/2
        rider_y = box['y'] + box['height']/2

        rel_x = (rider_x / viewport['width']) * 100
        rel_y = (rider_y / viewport['height']) * 100

        print(f"Rider Position Relative: X={rel_x:.2f}%, Y={rel_y:.2f}%")

        # Expect X ~ 90%, Y ~ 85%
        if rel_x > 80 and rel_y > 75 and rel_y < 95:
            print("PASS: Rider position is in the target zone (Bottom Right).")
        else:
            print("FAIL: Rider position deviation.")

        browser.close()

if __name__ == "__main__":
    verify_xiaoshi()
