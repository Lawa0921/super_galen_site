
from bs4 import BeautifulSoup
import re

def verify_joying_updates():
    try:
        with open('src/content/guild/joying.html', 'r', encoding='utf-8') as f:
            content = f.read()

        soup = BeautifulSoup(content, 'html.parser')

        # 1. Verify Cursor Z-Index
        style_tag = soup.find('style').string
        cursor_ring_match = re.search(r'\.cursor-ring\s*{[^}]*z-index:\s*20000', style_tag)
        cursor_dot_match = re.search(r'\.cursor-dot\s*{[^}]*z-index:\s*20000', style_tag)

        if cursor_ring_match and cursor_dot_match:
            print("PASS: Cursor z-index updated to 20000.")
        else:
            print("FAIL: Cursor z-index not found or incorrect.")

        # 2. Verify Finale Elements
        landing_zone = soup.find('div', class_='landing-zone')
        finale_text = soup.find('div', class_='finale-text-bg')
        shutdown_overlay = soup.find('div', id='shutdown-overlay')

        if landing_zone and finale_text and shutdown_overlay:
            print("PASS: Finale elements (landing-zone, text-bg, shutdown-overlay) present.")
        else:
            print(f"FAIL: Missing finale elements. Landing: {bool(landing_zone)}, Text: {bool(finale_text)}, Overlay: {bool(shutdown_overlay)}")

        # 3. Verify GSAP Shutdown Logic
        # The script might not be the very last one if others were added, so let's check all
        scripts = soup.find_all('script')
        found_logic = False
        for s in scripts:
            if s.string and 'gsap.to("#shutdown-overlay"' in s.string and 'trigger: "#sector-finale"' in s.string:
                found_logic = True
                break

        if found_logic:
            print("PASS: Shutdown overlay GSAP logic found.")
        else:
            print("FAIL: Shutdown overlay GSAP logic missing.")

    except Exception as e:
        print(f"ERROR: Verification failed with exception: {e}")

if __name__ == "__main__":
    verify_joying_updates()
