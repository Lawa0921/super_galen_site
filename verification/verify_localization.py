
from playwright.sync_api import sync_playwright

def verify_localization():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page(viewport={'width': 1280, 'height': 800})

        url = "http://localhost:4322/guild/xiaoshi"
        print(f"Navigating to {url}...")
        page.goto(url)

        # Check text presence
        chinese_texts = [
            "鋼鐵般的意志與頭蓋骨",
            "有些案件的特殊性",
            "為客戶代排限量商品",
            "怪工作？ 找我。"
        ]

        english_headers = [
            "IRON WILL PROTOCOL",
            "CASE 09: THE LIMITLESS QUEUE",
            "CONTACT"
        ]

        content = page.content()

        all_chinese_found = True
        for text in chinese_texts:
            if text in content:
                print(f"PASS: Found Chinese text '{text}'")
            else:
                print(f"FAIL: Missing Chinese text '{text}'")
                all_chinese_found = False

        all_english_found = True
        for header in english_headers:
            if header in content:
                print(f"PASS: Found English header '{header}'")
            else:
                print(f"FAIL: Missing English header '{header}'")
                all_english_found = False

        if all_chinese_found and all_english_found:
             # Screenshot specific sections
             page.locator("#sec-missions").scroll_into_view_if_needed()
             page.wait_for_timeout(1000)
             page.screenshot(path="verification/xiaoshi_localized_missions.png")
             print("Screenshot taken.")

        browser.close()

if __name__ == "__main__":
    verify_localization()
