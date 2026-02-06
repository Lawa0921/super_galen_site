import sys
from playwright.sync_api import sync_playwright

def verify():
    with sync_playwright() as p:
        browser = p.chromium.launch(args=['--use-gl=egl'])
        page = browser.new_page()

        print("Navigating to page...")
        page.goto("http://localhost:8080/src/content/guild/liloyee.html")

        # Check for console errors
        errors = []
        page.on("console", lambda msg: errors.append(msg.text) if msg.type == "error" else None)
        page.on("pageerror", lambda exc: errors.append(str(exc)))

        print("Waiting for page load...")
        page.wait_for_timeout(3000)

        if errors:
            print("Errors found:")
            for e in errors:
                print(e)
            # We might ignore some favicon 404s or similar, but let's see.

        print("Verifying Footer...")
        # Verify Footer
        try:
            footer_text = page.locator("#site-footer").inner_text()
            print(f"Footer text: {footer_text}")
            if "2024 Liloyee Guild Page" in footer_text:
                print("FAIL: Footer copyright text still present.")
                sys.exit(1)
            else:
                print("PASS: Footer copyright text removed.")
        except Exception as e:
            print(f"Error checking footer: {e}")
            sys.exit(1)

        browser.close()

if __name__ == "__main__":
    verify()
