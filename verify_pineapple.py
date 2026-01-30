from playwright.sync_api import sync_playwright
import time

def verify_pineapple():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()

        # Navigate to the page
        page.goto("http://localhost:4000/guild/pineapple.html")

        # Wait for the loader to disappear
        page.wait_for_timeout(2000)

        # Take a screenshot of the Hero section (top)
        page.screenshot(path="/home/jules/verification/pineapple_hero.png")
        print("Hero screenshot taken.")

        # Scroll down to Bio
        page.evaluate("window.scrollTo(0, window.innerHeight * 1.5)")
        page.wait_for_timeout(1000)
        page.screenshot(path="/home/jules/verification/pineapple_bio.png")
        print("Bio screenshot taken.")

        # Scroll down to Gallery (bottom)
        page.evaluate("window.scrollTo(0, document.body.scrollHeight)")
        page.wait_for_timeout(1000)
        page.screenshot(path="/home/jules/verification/pineapple_gallery.png")
        print("Gallery screenshot taken.")

        browser.close()

if __name__ == "__main__":
    verify_pineapple()
