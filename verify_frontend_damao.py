
from playwright.sync_api import sync_playwright
import time

def run():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page(viewport={'width': 1920, 'height': 1080})

        print("Navigating...")
        page.goto("http://localhost:4000/guild/damao.html", timeout=60000)

        # Wait for entry animation (approx 3.5s total duration in GSAP)
        print("Waiting for entry animation...")
        time.sleep(5)

        print("Taking Top screenshot...")
        page.screenshot(path="/home/jules/verification/damao_v3_2_top.png")

        print("Scrolling to Novel...")
        page.evaluate("document.querySelector('.novel-section').scrollIntoView()")
        time.sleep(2)
        page.screenshot(path="/home/jules/verification/damao_v3_2_novel.png")

        print("Scrolling to Process...")
        page.evaluate("document.querySelector('.process-section').scrollIntoView()")
        time.sleep(2)
        page.screenshot(path="/home/jules/verification/damao_v3_2_process.png")

        browser.close()
        print("Done.")

if __name__ == "__main__":
    run()
