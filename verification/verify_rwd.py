from playwright.sync_api import sync_playwright

def run():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        # Use a common mobile viewport (iPhone 12/13/14 width: 390px, height: 844px)
        context = browser.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=2)
        page = context.new_page()

        try:
            print("Navigating to http://localhost:4323/guild/ava")
            page.goto("http://localhost:4323/guild/ava")

            # Wait for loader to disappear (max 5s)
            try:
                page.wait_for_selector("#loader", state="hidden", timeout=5000)
                print("Loader hidden.")
            except:
                print("Warning: Loader did not hide in 5s, proceeding anyway.")

            # Scroll and take screenshots of each section to check for overflow/size issues
            sections = ["#sec-hero", "#sec-biker", "#sec-timeline", "#sec-travel", "#sec-work", "#sec-contact"]

            for section in sections:
                try:
                    # Scroll into view
                    page.locator(section).scroll_into_view_if_needed()
                    page.wait_for_timeout(500) # Wait for animation/settle
                    page.screenshot(path=f"verification/mobile_{section.replace('#', '')}.png")
                    print(f"Captured {section}")
                except Exception as e:
                    print(f"Could not capture {section}: {e}")

        except Exception as e:
            print(f"Error: {e}")
        finally:
            browser.close()

if __name__ == "__main__":
    run()
