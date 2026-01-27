from playwright.sync_api import sync_playwright
import time

def run(playwright):
    browser = playwright.chromium.launch(headless=True)
    page = browser.new_page(viewport={"width": 1280, "height": 800})

    # Go to the page
    page.goto("http://localhost:4000/guild/red_maple.html")

    # Wait for loader to finish
    page.wait_for_timeout(4000)

    # Simulate mouse movement to trigger particles
    page.mouse.move(640, 400)
    page.wait_for_timeout(500)
    page.mouse.move(300, 300)
    page.wait_for_timeout(500)

    # Take screenshot
    page.screenshot(path="verification/red_maple_v2.png")

    browser.close()

with sync_playwright() as playwright:
    run(playwright)
