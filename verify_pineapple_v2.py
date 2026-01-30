from playwright.sync_api import sync_playwright
import time

def verify_pineapple_v2():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()

        page.goto("http://localhost:4000/guild/pineapple.html")
        page.wait_for_timeout(2000)

        # Check height
        height = page.evaluate("document.body.scrollHeight")
        print(f"Body Height: {height}")

        # Scroll to bottom
        page.evaluate("window.scrollTo(0, document.body.scrollHeight)")

        # Manually dispatch scroll event just in case
        page.evaluate("window.dispatchEvent(new Event('scroll'))")

        page.wait_for_timeout(3000) # Wait for GSAP animations (1s duration)

        page.screenshot(path="/home/jules/verification/pineapple_gallery_v2.png")
        print("Gallery v2 screenshot taken.")

        browser.close()

if __name__ == "__main__":
    verify_pineapple_v2()
