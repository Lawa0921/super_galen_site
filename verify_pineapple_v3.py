
import os
import time
from playwright.sync_api import sync_playwright

def verify_pineapple_redesign():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page(viewport={"width": 1280, "height": 800}) # Desktop

        # Ensure the directory exists
        if not os.path.exists("verification"):
            os.makedirs("verification")

        # Load the page (assuming server is running on port 4000)
        # In this environment, I'll access the file directly or via localhost if I start a server.
        # Since I can't easily start a background jekyll server reliably in one go,
        # I'll rely on the user's setup or assume I can run a simple http server.
        # But wait, I should try to run a python server in background.

        print("Connecting to page...")
        try:
            page.goto("http://localhost:4000/guild/pineapple.html")
        except Exception as e:
            print(f"Error connecting: {e}")
            return

        time.sleep(2) # Wait for initial animations (Hero pop)

        # Screenshot Hero
        page.screenshot(path="verification/pineapple_v3_hero.png")
        print("Hero screenshot taken.")

        # Scroll down to Story
        page.evaluate("window.scrollTo(0, 800)")
        time.sleep(1) # Wait for ScrollTrigger
        page.screenshot(path="verification/pineapple_v3_story.png")
        print("Story screenshot taken.")

        # Scroll to Math/Competition
        page.evaluate("window.scrollTo(0, 1600)")
        time.sleep(1)
        page.screenshot(path="verification/pineapple_v3_math.png")
        print("Math screenshot taken.")

        # Scroll to Quote
        page.evaluate("window.scrollTo(0, 2400)")
        time.sleep(1)
        page.screenshot(path="verification/pineapple_v3_quote.png")
        print("Quote screenshot taken.")

        # Scroll to Footer
        page.evaluate("window.scrollTo(0, document.body.scrollHeight)")
        time.sleep(1)
        page.screenshot(path="verification/pineapple_v3_footer.png")
        print("Footer screenshot taken.")

        # Mobile check
        page.set_viewport_size({"width": 375, "height": 667})
        page.evaluate("window.scrollTo(0, 0)")
        time.sleep(1)
        page.screenshot(path="verification/pineapple_v3_mobile_hero.png")
        print("Mobile Hero screenshot taken.")

        browser.close()

if __name__ == "__main__":
    verify_pineapple_redesign()
