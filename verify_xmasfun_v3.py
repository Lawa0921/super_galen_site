from playwright.sync_api import sync_playwright
import time
import os

def verify_xmasfun_v3():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()

        print("Navigating to page...")
        page.goto("http://localhost:4321/guild/xmasfun689.html")

        # Wait for loader to disappear
        print("Waiting for loader...")
        page.wait_for_selector("#loader", state="hidden", timeout=30000)

        # 1. Intro Screenshot
        print("Taking Intro screenshot...")
        time.sleep(2) # Wait for animation
        page.screenshot(path="/home/jules/verification/xmasfun_v3_intro.png")

        # 2. Heavy Metal Screenshot (Scroll to 20%)
        print("Scrolling to Heavy Metal...")
        page.evaluate("window.scrollTo(0, document.body.scrollHeight * 0.25)")
        time.sleep(2) # Wait for GSAP/Three.js
        page.screenshot(path="/home/jules/verification/xmasfun_v3_metal.png")

        # 3. Elements Screenshot (Scroll to 60%)
        print("Scrolling to Elements...")
        page.evaluate("window.scrollTo(0, document.body.scrollHeight * 0.6)")
        time.sleep(2)
        page.screenshot(path="/home/jules/verification/xmasfun_v3_elements.png")

        # 4. Finale Screenshot (Scroll to 95%)
        print("Scrolling to Finale...")
        page.evaluate("window.scrollTo(0, document.body.scrollHeight * 0.95)")
        time.sleep(2)
        page.screenshot(path="/home/jules/verification/xmasfun_v3_finale.png")

        browser.close()
        print("Verification complete.")

if __name__ == "__main__":
    os.makedirs("/home/jules/verification", exist_ok=True)
    verify_xmasfun_v3()
