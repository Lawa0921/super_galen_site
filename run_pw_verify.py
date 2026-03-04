from playwright.sync_api import sync_playwright
import time
import os

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page(viewport={"width": 1920, "height": 1080})

    # We navigate to the file directly to check rendering
    file_path = f"file://{os.path.abspath('src/content/guild/asingingwind.html')}"
    page.goto(file_path)

    # Wait for Three.js and GSAP
    time.sleep(3)
    page.screenshot(path="verification_asingingwind_hero.png")

    # Scroll a bit
    page.evaluate("window.scrollBy(0, 500)")
    time.sleep(2)
    page.screenshot(path="verification_asingingwind_scroll.png")

    browser.close()

print("Screenshots saved.")
