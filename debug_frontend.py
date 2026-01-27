
from playwright.sync_api import sync_playwright
import time

def run():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page(viewport={'width': 1920, 'height': 1080})

        page.on("console", lambda msg: print(f"Browser Console: {msg.text}"))
        page.on("pageerror", lambda err: print(f"Browser Error: {err}"))

        print("Navigating...")
        page.goto("http://localhost:4000/guild/damao.html", timeout=60000)

        print("Waiting for body...")
        page.wait_for_selector('body')
        time.sleep(3)

        print("Taking debug screenshot...")
        page.screenshot(path="/home/jules/verification/damao_debug.png")

        print("Dumping HTML...")
        with open("/home/jules/verification/damao_dump.html", "w") as f:
            f.write(page.content())

        browser.close()

if __name__ == "__main__":
    run()
