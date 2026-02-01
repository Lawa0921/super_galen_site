import os
import shutil
import time
import subprocess
import sys
from playwright.sync_api import sync_playwright

def run_verification():
    src_file = "src/content/guild/darkstar.html"
    temp_file = "public/test_darkstar_v3.html"

    shutil.copy(src_file, temp_file)
    port = 8083
    os.system(f"lsof -ti :{port} | xargs kill -9 2>/dev/null")

    server_process = subprocess.Popen(
        [sys.executable, "-m", "http.server", str(port), "--directory", "public"],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL
    )
    time.sleep(2)

    try:
        with sync_playwright() as p:
            browser = p.chromium.launch(headless=True)
            page = browser.new_page()
            url = f"http://localhost:{port}/test_darkstar_v3.html"
            print(f"Navigating to {url}")
            page.goto(url)

            # Check for loader vanish
            try:
                page.wait_for_selector("#loader", state="hidden", timeout=10000)
                print("Loader disappeared.")
            except:
                print("Loader timeout. Forcing hide.")
                page.evaluate("document.getElementById(\"loader\").style.display = \"none\"")

            # Check for cursor follower
            if page.locator("#cursor-follower").count() > 0:
                print("Verified: Custom cursor element exists.")
            else:
                print("FAILED: Custom cursor missing.")

            # Check for Canvas
            if page.locator("canvas#webgl-container").count() > 0:
                print("Verified: WebGL Canvas exists.")
            else:
                 print("FAILED: Canvas missing.")

            browser.close()
    except Exception as e:
        print(f"Error: {e}")
    finally:
        server_process.kill()
        if os.path.exists(temp_file):
            os.remove(temp_file)

if __name__ == "__main__":
    run_verification()
