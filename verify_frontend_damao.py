
from playwright.sync_api import sync_playwright
import time

def run():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page(viewport={'width': 1920, 'height': 1080})

        # Log console messages
        page.on("console", lambda msg: print(f"Browser Console: {msg.text}"))
        page.on("pageerror", lambda err: print(f"Browser Error: {err}"))

        print("Navigating...")
        page.goto("http://localhost:4000/guild/damao.html", timeout=60000)

        print("Waiting for body...")
        page.wait_for_selector('body', timeout=30000)

        print("Waiting for 5 seconds...")
        time.sleep(5)

        # Screenshot 1: Hero & Bio
        print("Taking Top screenshot...")
        page.screenshot(path="/home/jules/verification/damao_v3_top.png")

        # Scroll to Novel Section
        print("Scrolling to Novel...")
        page.evaluate("document.querySelector('.novel-section').scrollIntoView()")
        time.sleep(2)
        page.screenshot(path="/home/jules/verification/damao_v3_novel.png")

        # Scroll to Process Section
        print("Scrolling to Process...")
        page.evaluate("document.querySelector('.process-section').scrollIntoView()")
        time.sleep(2)
        page.screenshot(path="/home/jules/verification/damao_v3_process.png")

        # Scroll to Footer
        print("Scrolling to Footer...")
        page.evaluate("document.querySelector('footer').scrollIntoView()")
        time.sleep(2)
        page.screenshot(path="/home/jules/verification/damao_v3_footer.png")

        browser.close()
        print("Done.")

if __name__ == "__main__":
    run()
