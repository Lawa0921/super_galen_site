from playwright.sync_api import sync_playwright
import time

def run():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page(viewport={"width": 1280, "height": 800})

        # Capture console logs
        page.on("console", lambda msg: print(f"PAGE LOG: {msg.text}"))
        page.on("pageerror", lambda exc: print(f"PAGE ERROR: {exc}"))

        print("Navigating to page...")
        page.goto("http://localhost:4321/guild/xiaoshi")

        print("Waiting...")
        time.sleep(5)

        print("Taking screenshot...")
        page.screenshot(path="verification/xiaoshi_mk85_debug.png")

        browser.close()

if __name__ == "__main__":
    run()
