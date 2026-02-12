import os
from playwright.sync_api import sync_playwright
import time

def verify_spj_fantasy():
    if not os.path.exists("verification"):
        os.makedirs("verification")

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(viewport={"width": 1920, "height": 1080})
        page = context.new_page()

        # Capture console messages
        page.on("console", lambda msg: print(f"PAGE LOG: {msg.text}"))
        page.on("pageerror", lambda exc: print(f"PAGE ERROR: {exc}"))

        print("Navigating to SPJ Guild Page...")
        page.goto("http://localhost:4321/guild/spj/")

        # Wait longer for loader
        print("Waiting for loader animation...")
        time.sleep(5)

        # Check if loader is still visible
        loader_visible = page.is_visible("#loader")
        if loader_visible:
            print("Loader still visible. Forcing removal...")
            page.evaluate("document.getElementById('loader').remove()")
            time.sleep(1)

        # 1. Hero Section Screenshot
        print("Capturing Hero Section...")
        page.screenshot(path="verification/spj_fantasy_hero.png")

        # 2. Scroll to Intro
        print("Scrolling to Intro...")
        page.evaluate("window.scrollTo(0, window.innerHeight)")
        time.sleep(2)
        page.screenshot(path="verification/spj_fantasy_intro.png")

        # 3. Scroll to Dream
        print("Scrolling to Dream...")
        page.evaluate("window.scrollTo(0, window.innerHeight * 2)")
        time.sleep(2)
        page.screenshot(path="verification/spj_fantasy_dream.png")

        # 4. Scroll to Projects
        print("Scrolling to Projects...")
        page.evaluate("window.scrollTo(0, document.body.scrollHeight)")
        time.sleep(2)
        page.screenshot(path="verification/spj_fantasy_projects.png")

        browser.close()
        print("Verification complete.")

if __name__ == "__main__":
    verify_spj_fantasy()