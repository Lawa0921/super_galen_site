import time
from playwright.sync_api import sync_playwright

def verify_damao_ink_v2():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page(viewport={'width': 1280, 'height': 800})

        url = "http://localhost:4000/guild/damao.html"
        print(f"Navigating to {url}...")
        page.goto(url)

        # 1. Hero
        time.sleep(2)
        page.screenshot(path="/home/jules/verification/damao_hero.png")
        print("Captured Hero.")

        # 2. Scroll down to Bio
        page.mouse.wheel(0, 800)
        time.sleep(1)
        page.screenshot(path="/home/jules/verification/damao_bio.png")
        print("Captured Bio.")

        # 3. Scroll down to Novel
        page.mouse.wheel(0, 1000)
        time.sleep(1)
        page.screenshot(path="/home/jules/verification/damao_novel.png")
        print("Captured Novel.")

        # 4. Scroll down to Process
        page.mouse.wheel(0, 1000)
        time.sleep(1)

        # Interact with Slider
        # Try to find slider handle
        handle = page.locator("#slider-handle")
        if handle.is_visible():
            box = handle.bounding_box()
            if box:
                page.mouse.move(box['x'] + box['width']/2, box['y'] + box['height']/2)
                page.mouse.down()
                page.mouse.move(box['x'] + 200, box['y'] + box['height']/2, steps=10)
                page.mouse.up()
                time.sleep(0.5)

        page.screenshot(path="/home/jules/verification/damao_process.png")
        print("Captured Process.")

        # 5. Scroll down to Gallery
        page.mouse.wheel(0, 1000)
        time.sleep(1)
        # Scroll more to trigger horizontal movement
        page.mouse.wheel(0, 2000)
        time.sleep(1)
        page.screenshot(path="/home/jules/verification/damao_gallery.png")
        print("Captured Gallery.")

        browser.close()

if __name__ == "__main__":
    verify_damao_ink_v2()
