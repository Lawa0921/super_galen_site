
from playwright.sync_api import sync_playwright

def verify_social_underline():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()

        # Ensure server is running (it should be from previous steps)
        url = "http://localhost:4322/guild/xiaoshi"
        print(f"Navigating to {url}...")
        page.goto(url)

        # Scroll to bottom to ensure elements are rendered/visible (though style check works anyway)
        page.evaluate("window.scrollTo(0, document.body.scrollHeight)")

        social_btn = page.locator(".social-btn").first

        # Get computed style
        decoration = social_btn.evaluate("el => getComputedStyle(el).textDecorationLine")

        print(f"Computed text-decoration-line: '{decoration}'")

        if decoration == "none":
            print("PASS: Text decoration is none.")
        else:
            print(f"FAIL: Text decoration is {decoration}")

        browser.close()

if __name__ == "__main__":
    verify_social_underline()
